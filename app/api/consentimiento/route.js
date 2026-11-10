// Consentimiento del alumno para los datos de su reloj (ver lib/consentimiento.mjs).
//
//   · leer:    el propio alumno, o su coach (o el administrador).
//   · guardar: SOLO el propio alumno. El consentimiento es suyo: el coach no puede darlo ni
//              retirarlo por él. Retirar el de salud borra sus datos de salud en el acto.
import { NextResponse } from "next/server";
import { sesionDelPedido, entradaDe } from "../../../lib/equipo-servidor";
import { puedeManejar } from "../../../lib/equipo.mjs";
import { leerConsentimiento, guardarConsentimiento } from "../../../lib/salud-servidor";
import { resumen } from "../../../lib/consentimiento.mjs";

export const dynamic = "force-dynamic";

const mal = (error, status = 400) => NextResponse.json({ ok: false, error }, { status });

export async function POST(request) {
  const session = await sesionDelPedido();
  if (!session) return mal("No autorizado", 401);
  let body;
  try { body = await request.json(); } catch (e) { return mal("Petición inválida"); }
  const { op, studentId } = body || {};
  if (!op || typeof studentId !== "string" || !studentId) return mal("Faltan datos");

  const esElMismoAlumno = session.role === "student" && session.studentId === studentId;
  const esSuCoach = session.role === "coach" && puedeManejar(session, await entradaDe(studentId));

  if (op === "leer") {
    if (!esElMismoAlumno && !esSuCoach) return mal("Sin permiso", 403);
    return NextResponse.json({ ok: true, consentimiento: resumen(await leerConsentimiento(studentId)) });
  }

  if (op === "guardar") {
    if (!esElMismoAlumno) return mal("Solo tú puedes dar o retirar tu consentimiento.", 403);
    const cambios = {};
    if (typeof body.entrenamiento === "boolean") cambios.entrenamiento = body.entrenamiento;
    if (typeof body.salud === "boolean") cambios.salud = body.salud;
    if (!Object.keys(cambios).length) return mal("Faltan datos");
    const r = await guardarConsentimiento(studentId, cambios);
    return r.ok ? NextResponse.json(r) : mal(r.error || "No se pudo guardar.");
  }

  return mal("Operación desconocida");
}
