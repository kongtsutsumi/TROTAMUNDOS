// Operaciones de la conexión con intervals.icu.
//
// Reglas de permiso, que son lo importante acá:
//   · Enviar la semana de un alumno al reloj: SOLO el coach. Es una acción sobre el plan.
//   · Consultar si un alumno tiene reloj conectado: el coach, o ese mismo alumno.
//   · Traer lo entrenado: el coach, o ese mismo alumno. Es leer lo que ya ocurrió, y lo
//     que escribe son los kilómetros y el ritmo reales de ese alumno, nunca su plan.
//   · Desconectar: el coach, o ese mismo alumno sobre sí mismo. Un alumno siempre puede
//     cortar su propia conexión — es su cuenta y su consentimiento.
//
// El testigo de acceso nunca sale del servidor: no se devuelve en ninguna respuesta.

import { NextResponse } from "next/server";
import { kvGet } from "../../../lib/supabaseAdmin";
import { sesionDelPedido, entradaDe } from "../../../lib/equipo-servidor";
import { puedeManejar } from "../../../lib/equipo.mjs";
import { enviarSemanaAlReloj, desconectarReloj, estaConectado, leerAjustesReloj } from "../../../lib/intervals-push";
import { alertasHabilitadasPorCoach, alertasEfectivas } from "../../../lib/intervals-icu.mjs";
import { traerDelReloj } from "../../../lib/intervals-pull";
import { urlDeAutorizacion, estaConfigurado } from "../../../lib/intervals-oauth";
import { leerConsentimiento, alDesconectar } from "../../../lib/salud-servidor";
import { estaConectadoGarmin } from "../../../lib/garmin-servidor";
import { aceptoEntrenamiento, resumen as resumenConsentimiento } from "../../../lib/consentimiento.mjs";


export async function POST(request) {
  const session = await sesionDelPedido();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let body;
  try { body = await request.json(); } catch (e) { return NextResponse.json({ error: "Petición inválida" }, { status: 400 }); }
  const { op, studentId, weekNum } = body || {};

  // --- El antiguo interruptor general de alertas (solo lectura) ---
  // Las alertas se activan alumno por alumno. Este valor solo sirve de punto de partida
  // para quien el coach todavía no eligió nada; ya no se puede cambiar.
  if (op === "alertasGeneral") {
    if (session.role !== "coach") return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    return NextResponse.json({ ok: true, ...(await leerAjustesReloj()) });
  }

  if (!op || !studentId) return NextResponse.json({ error: "Faltan datos" }, { status: 400 });

  const esElMismoAlumno = session.role === "student" && session.studentId === studentId;
  // "El coach" es el coach de ESTE alumno, o el administrador.
  const esCoach = session.role === "coach" && puedeManejar(session, await entradaDe(studentId));

  const student = await kvGet(`student:${studentId}`);
  if (!student) return NextResponse.json({ error: "Alumno no encontrado" }, { status: 404 });

  // --- Estado de la conexión ---
  if (op === "estado") {
    if (!esCoach && !esElMismoAlumno) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    return NextResponse.json({
      conectado: estaConectado(student),
      disponible: estaConfigurado(),
      athleteId: student.intervals?.athleteId ?? null,
      nombreEnIntervals: student.intervals?.nombreEnIntervals ?? null,
      conectadoEl: student.intervals?.conectadoEl ?? null,
      ultimoEnvio: student.intervals?.ultimoEnvio ?? null,
      ultimaLectura: student.intervals?.ultimaLectura ?? null,
      // Qué aceptó el alumno (entrenamiento y salud, por separado) y cuándo.
      consentimiento: resumenConsentimiento(await leerConsentimiento(studentId)),
      errorDeLectura: student.intervals?.errorDeLectura ?? null,
      // Alertas de ritmo: si el coach las habilitó (el alumno solo puede tocarlas entonces),
      // si están activas, y si intervals.icu necesita que el alumno vuelva a conectar.
      alertas: await (async () => {
        const general = (await leerAjustesReloj()).alertasRitmo;
        const u = student.intervals?.umbral;
        return {
          general,
          habilitadas: alertasHabilitadasPorCoach(student, general),
          activas: alertasEfectivas(student, general),
          modoCoach: student.alertasRitmo?.coach || "general",
          reconectar: u?.motivo === "sin-permiso",
          umbralPropio: !!u?.propio,
        };
      })(),
    });
  }

  // --- Empezar la conexión: devuelve a dónde mandar al alumno a autorizar ---
  // El "state" se firma acá, atado a este alumno y con caducidad corta.
  if (op === "autorizar") {
    if (!esCoach && !esElMismoAlumno) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    if (!estaConfigurado()) {
      return NextResponse.json({ error: "La conexión con intervals.icu no está configurada" }, { status: 503 });
    }
    // Con Garmin directo conectado, intervals.icu duplicaría los entrenamientos en el reloj.
    if (await estaConectadoGarmin(studentId)) {
      return NextResponse.json({ error: "Primero desconecta Garmin", motivo: "garmin-conectado" }, { status: 409 });
    }
    // Sin el consentimiento expreso del alumno para sus datos de entrenamiento no se conecta
    // nada (política de privacidad, sección 3). Lo da el alumno en la app, antes de esto.
    if (!aceptoEntrenamiento(await leerConsentimiento(studentId))) {
      return NextResponse.json({ error: "Falta tu consentimiento para conectar el reloj", motivo: "sin-consentimiento" }, { status: 409 });
    }
    const url = urlDeAutorizacion(studentId, new URL(request.url).origin);
    return NextResponse.json({ ok: true, url });
  }

  // --- Enviar la semana al reloj (solo el coach) ---
  if (op === "enviar") {
    if (!esCoach) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    const semana = Number(weekNum ?? student.currentWeek);
    if (!Number.isFinite(semana) || semana < 1) {
      return NextResponse.json({ error: "Semana inválida" }, { status: 400 });
    }
    const r = await enviarSemanaAlReloj(student, semana);
    return NextResponse.json(r);
  }

  // --- Traer lo entrenado ---
  //
  // Se llama sola al abrir la app, así que lo normal es que no haga nada: hay un límite de
  // una consulta cada cuarto de hora por alumno. Con "forzar" (el botón de actualizar) el
  // límite baja a un minuto, que sigue siendo suficiente para que nadie martille el
  // servicio sin querer.
  if (op === "traer") {
    if (!esCoach && !esElMismoAlumno) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    const r = await traerDelReloj(student, { minutosEntreLecturas: body?.forzar === true ? 1 : 15 });
    return NextResponse.json(r);
  }

  // --- Desconectar ---
  if (op === "desconectar") {
    if (!esCoach && !esElMismoAlumno) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    const r = await desconectarReloj(student);
    // Desconectar retira el consentimiento y borra sus datos de salud.
    const salud = await alDesconectar(studentId);
    return NextResponse.json({ ...r, saludBorrada: salud.borrados || 0 });
  }

  return NextResponse.json({ error: "Operación desconocida" }, { status: 400 });
}
