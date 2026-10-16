// Operaciones de la conexión con intervals.icu.
//
// Reglas de permiso, que son lo importante acá:
//   · Enviar la semana de un alumno al reloj: SOLO el coach. Es una acción sobre el plan.
//   · Consultar si un alumno tiene reloj conectado: el coach, o ese mismo alumno.
//   · Desconectar: el coach, o ese mismo alumno sobre sí mismo. Un alumno siempre puede
//     cortar su propia conexión — es su cuenta y su consentimiento.
//
// El testigo de acceso nunca sale del servidor: no se devuelve en ninguna respuesta.

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { kvGet } from "../../../lib/supabaseAdmin";
import { verifySessionToken, SESSION_COOKIE } from "../../../lib/session";
import { enviarSemanaAlReloj, desconectarReloj, estaConectado } from "../../../lib/intervals-push";

async function getSession() {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

export async function POST(request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let body;
  try { body = await request.json(); } catch (e) { return NextResponse.json({ error: "Petición inválida" }, { status: 400 }); }
  const { op, studentId, weekNum } = body || {};
  if (!op || !studentId) return NextResponse.json({ error: "Faltan datos" }, { status: 400 });

  const esElMismoAlumno = session.role === "student" && session.studentId === studentId;
  const esCoach = session.role === "coach";

  const student = await kvGet(`student:${studentId}`);
  if (!student) return NextResponse.json({ error: "Alumno no encontrado" }, { status: 404 });

  // --- Estado de la conexión ---
  if (op === "estado") {
    if (!esCoach && !esElMismoAlumno) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    return NextResponse.json({
      conectado: estaConectado(student),
      athleteId: student.intervals?.athleteId ?? null,
      ultimoEnvio: student.intervals?.ultimoEnvio ?? null,
    });
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

  // --- Desconectar ---
  if (op === "desconectar") {
    if (!esCoach && !esElMismoAlumno) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    const r = await desconectarReloj(student);
    return NextResponse.json(r);
  }

  return NextResponse.json({ error: "Operación desconocida" }, { status: 400 });
}
