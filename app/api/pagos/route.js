// Vigencia de planes y pagos.
//
//  · El alumno solo ve la SUYA: hasta cuándo tiene pagado y su historial.
//  · Cada coach ve la de SUS alumnos (también el administrador: los pagos de los alumnos de
//    otro coach son de ese coach), registra pagos (mes a mes), corrige fechas y borra pagos
//    registrados por error.
//
// La identidad sale de la sesión firmada, nunca del navegador.
import { NextResponse } from "next/server";
import { kvGet } from "../../../lib/supabaseAdmin";
import { sesionDelPedido, entradaDe } from "../../../lib/equipo-servidor";
import { idCoachDeSesion, esPropio, coachDeEntrada } from "../../../lib/equipo.mjs";
import {
  asegurarVigenciaInicial, leerAjustes, limpiarAjustes, guardarAjustes,
  leerMembresia, leerTodas, guardarMembresia,
} from "../../../lib/pagos-servidor";
import { applyPayment, recomputeFromPayments, setDates, membershipStatus, todayIn } from "../../../lib/vigencia.mjs";

export const dynamic = "force-dynamic";

const mal = (msg, status = 400) => NextResponse.json({ error: msg }, { status });


export async function POST(request) {
  const session = await sesionDelPedido();
  if (!session) return mal("No autorizado", 401);
  let body;
  try { body = await request.json(); } catch (e) { return mal("Petición inválida"); }
  const { op } = body || {};
  const hoy = todayIn("America/Lima");

  try {
    await asegurarVigenciaInicial();
  } catch (e) {
    console.error("no se pudo dar la vigencia inicial", e);
  }

  // --- Alumno: la suya ---
  if (op === "mia") {
    if (session.role !== "student") return mal("Sin permiso", 403);
    // Los ajustes (mensualidad, aviso) son los de SU coach.
    const coach = coachDeEntrada(await entradaDe(session.studentId));
    const [ajustes, m] = await Promise.all([leerAjustes(coach), leerMembresia(session.studentId)]);
    return NextResponse.json({
      ok: true,
      membership: m ? {
        start: m.start, end: m.end,
        payments: (m.payments || []).map(({ id, paidOn, months, from, to, amount }) => ({ id, paidOn, months, from, to, amount })),
      } : null,
      status: membershipStatus(m, hoy, ajustes.warnDays),
      settings: { warnDays: ajustes.warnDays, monthlyFee: ajustes.monthlyFee },
      today: hoy,
    });
  }

  if (session.role !== "coach") return mal("Sin permiso", 403);
  // Pagos por coach: cada uno ve y registra solo los de sus alumnos (también el administrador).
  const yo = idCoachDeSesion(session);

  if (op === "resumen") {
    const [ajustes, todas, roster] = await Promise.all([leerAjustes(yo), leerTodas(), kvGet("roster")]);
    const ids = new Set((roster || []).filter((r) => esPropio(session, r)).map((r) => r.id));
    const memberships = {};
    for (const [id, m] of Object.entries(todas)) {
      if (!ids.has(id)) continue;
      memberships[id] = { ...m, ...membershipStatus(m, hoy, ajustes.warnDays) };
    }
    return NextResponse.json({ ok: true, memberships, settings: ajustes, today: hoy });
  }

  if (op === "pagar" || op === "fechas" || op === "borrarPago") {
    const { studentId } = body;
    if (typeof studentId !== "string" || !studentId) return mal("Faltan datos");
    if (!esPropio(session, await entradaDe(studentId))) return mal("Alumno no encontrado", 404);
    const actual = (await leerMembresia(studentId)) || { start: null, end: null, payments: [] };
    let nueva;
    try {
      if (op === "pagar") nueva = applyPayment(actual, body.payment || {});
      else if (op === "fechas") nueva = setDates(actual, { start: body.start || null, end: body.end || null });
      else {
        const payments = (actual.payments || []).filter((p) => p.id !== body.paymentId);
        if (payments.length === (actual.payments || []).length) return mal("Pago no encontrado", 404);
        nueva = recomputeFromPayments({ ...actual, payments });
      }
    } catch (e) {
      return mal(e.message || "Datos inválidos");
    }
    if (!(await guardarMembresia(studentId, nueva))) return mal("No se pudo guardar. Prueba de nuevo.", 500);
    const ajustes = await leerAjustes(yo);
    return NextResponse.json({ ok: true, membership: nueva, status: membershipStatus(nueva, hoy, ajustes.warnDays) });
  }

  if (op === "ajustes") {
    const actuales = await leerAjustes(yo);
    let nuevos;
    try { nuevos = limpiarAjustes(body.settings || {}, actuales); } catch (e) { return mal(e.message); }
    return (await guardarAjustes(nuevos, yo)) ? NextResponse.json({ ok: true, settings: nuevos }) : mal("No se pudo guardar. Prueba de nuevo.", 500);
  }

  return mal("Operación desconocida");
}
