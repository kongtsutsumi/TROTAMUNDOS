// Operaciones de la conexión directa con Garmin (lib/garmin-servidor.js).
//
// Mismos permisos que intervals.icu:
//   · estado, autorizar, desconectar: el propio alumno o su coach (o el administrador).
//   · enviar la semana al reloj: solo el coach.
// Para conectar hace falta el consentimiento del alumno (lo da él en la app), y no tener a
// la vez intervals.icu conectado: con las dos, el reloj recibiría cada entrenamiento dos
// veces.
import { NextResponse } from "next/server";
import { kvGet } from "../../../lib/supabaseAdmin";
import { sesionDelPedido, entradaDe } from "../../../lib/equipo-servidor";
import { puedeManejar } from "../../../lib/equipo.mjs";
import { estaConectado as intervalsConectado, leerAjustesReloj } from "../../../lib/intervals-push";
import { alertasHabilitadasPorCoach, alertasEfectivas } from "../../../lib/intervals-icu.mjs";
import { estaConectadoCoros } from "../../../lib/coros-servidor";
import { estaConfigurado, estaConectadoGarmin, urlDeAutorizacion, enviarSemanaAGarmin, desconectarGarmin } from "../../../lib/garmin-servidor";
import { leerConsentimiento } from "../../../lib/salud-servidor";
import { aceptoEntrenamiento, resumen as resumenConsentimiento } from "../../../lib/consentimiento.mjs";

export const dynamic = "force-dynamic";

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
    return NextResponse.json({
      ok: true,
      disponible: estaConfigurado(),
      conectado: await estaConectadoGarmin(studentId),
      conectadoEl: student.garmin?.conectadoEl ?? null,
      ultimoEnvio: student.garmin?.ultimoEnvio ?? null,
      ultimaLectura: student.garmin?.ultimaLectura ?? null,
      intervalsConectado: intervalsConectado(student),
      consentimiento: resumenConsentimiento(await leerConsentimiento(studentId)),
      // Alertas de ritmo: si el coach las habilitó (solo entonces el alumno puede tocarlas) y si
      // están activas. Con alertas, cada paso de calidad y fondo va con su ritmo objetivo.
      alertas: await (async () => {
        const general = (await leerAjustesReloj()).alertasRitmo;
        return { habilitadas: alertasHabilitadasPorCoach(student, general), activas: alertasEfectivas(student, general) };
      })(),
    });
  }

  if (op === "autorizar") {
    if (!estaConfigurado()) return mal("La conexión con Garmin no está configurada", 503);
    if (intervalsConectado(student)) return mal("Primero desconecta intervals.icu", 409, { motivo: "intervals-conectado" });
    if (await estaConectadoCoros(studentId)) return mal("Primero desconecta COROS", 409, { motivo: "coros-conectado" });
    if (!aceptoEntrenamiento(await leerConsentimiento(studentId))) return mal("Falta tu consentimiento para conectar el reloj", 409, { motivo: "sin-consentimiento" });
    const url = await urlDeAutorizacion(studentId, new URL(request.url).origin);
    return url ? NextResponse.json({ ok: true, url }) : mal("No se pudo iniciar la conexión", 500);
  }

  if (op === "enviar") {
    if (!esCoach) return mal("Sin permiso", 403);
    const semana = Number(weekNum ?? student.currentWeek);
    if (!Number.isFinite(semana) || semana < 1) return mal("Semana inválida");
    return NextResponse.json(await enviarSemanaAGarmin(student, semana));
  }

  if (op === "desconectar") {
    return NextResponse.json(await desconectarGarmin(studentId));
  }

  return mal("Operación desconocida");
}
