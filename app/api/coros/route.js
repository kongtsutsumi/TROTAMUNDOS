// Operaciones de la conexión con COROS (lib/coros-servidor.js), por su MCP oficial.
//
// Mismos permisos que Garmin e intervals.icu:
//   · estado, autorizar, traer, desconectar: el propio alumno o su coach (o el administrador).
//   · enviar la semana al reloj: solo el coach.
// Para conectar hace falta el consentimiento del alumno (lo da él en la app), y no tener otra
// conexión de reloj: con dos, el reloj recibiría cada entrenamiento dos veces.
import { NextResponse } from "next/server";
import { kvGet } from "../../../lib/supabaseAdmin";
import { sesionDelPedido, entradaDe } from "../../../lib/equipo-servidor";
import { puedeManejar } from "../../../lib/equipo.mjs";
import { estaConectado as intervalsConectado } from "../../../lib/intervals-push";
import { estaConectadoGarmin } from "../../../lib/garmin-servidor";
import { estaDisponible, estaConectadoCoros, corregirModelo, urlDeAutorizacion, enviarSemanaACoros, traerDeCoros, desconectarCoros } from "../../../lib/coros-servidor";
import { leerConsentimiento } from "../../../lib/salud-servidor";
import { aceptoEntrenamiento, resumen as resumenConsentimiento } from "../../../lib/consentimiento.mjs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const mal = (error, status = 400, extra = {}) => NextResponse.json({ ok: false, error, ...extra }, { status });

export async function POST(request) {
  const session = await sesionDelPedido();
  if (!session) return mal("No autorizado", 401);
  let body;
  try { body = await request.json(); } catch (e) { return mal("Petición inválida"); }
  const { op, studentId, weekNum } = body || {};
  if (!op || typeof studentId !== "string") return mal("Faltan datos");

  const esElMismoAlumno = session.role === "student" && session.studentId === studentId;
  const esCoach = session.role === "coach" && puedeManejar(session, await entradaDe(studentId));
  if (!esElMismoAlumno && !esCoach) return mal("Sin permiso", 403);

  const student = await kvGet(`student:${studentId}`);
  if (!student) return mal("Alumno no encontrado", 404);

  if (op === "estado") {
    const c = student.coros || {};
    const conectado = await estaConectadoCoros(studentId);
    return NextResponse.json({
      ok: true,
      disponible: estaDisponible(),
      conectado,
      conectadoEl: c.conectadoEl ?? null,
      dispositivo: conectado ? await corregirModelo(studentId).catch(() => c.dispositivo ?? null) : null,
      ultimoEnvio: c.ultimoEnvio ?? null,
      ultimaLectura: c.ultimaLectura ?? null,
      porBorrar: Array.isArray(c.porBorrar) ? c.porBorrar : [],
      consentimiento: resumenConsentimiento(await leerConsentimiento(studentId)),
    });
  }

  if (op === "autorizar") {
    if (!estaDisponible()) return mal("La conexión con COROS no está disponible", 503);
    if (intervalsConectado(student)) return mal("Primero desconecta intervals.icu", 409, { motivo: "intervals-conectado" });
    if (await estaConectadoGarmin(studentId)) return mal("Primero desconecta Garmin", 409, { motivo: "garmin-conectado" });
    if (!aceptoEntrenamiento(await leerConsentimiento(studentId))) return mal("Falta tu consentimiento para conectar el reloj", 409, { motivo: "sin-consentimiento" });
    const url = await urlDeAutorizacion(studentId, new URL(request.url).origin);
    return url ? NextResponse.json({ ok: true, url }) : mal("No se pudo iniciar la conexión con COROS", 502);
  }

  if (op === "enviar") {
    if (!esCoach) return mal("Sin permiso", 403);
    const semana = Number(weekNum ?? student.currentWeek);
    if (!Number.isFinite(semana) || semana < 1) return mal("Semana inválida");
    return NextResponse.json(await enviarSemanaACoros(student, semana));
  }

  if (op === "traer") {
    return NextResponse.json(await traerDeCoros(student, { forzar: body?.forzar === true }));
  }

  if (op === "desconectar") {
    return NextResponse.json(await desconectarCoros(studentId));
  }

  return mal("Operación desconocida");
}
