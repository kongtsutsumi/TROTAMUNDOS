// Vuelta del alumno desde intervals.icu después de autorizar.
//
// Llega con un código de un solo uso y el "state" que mandamos nosotros. Antes de guardar
// nada se comprueban DOS cosas, que tienen que coincidir:
//   · que el "state" sea nuestro y no haya caducado,
//   · que quien vuelve tenga sesión abierta y sea ese mismo alumno (o el coach).
//
// Sin esa doble comprobación, alguien podría inducir a un alumno a pulsar un enlace y
// terminar conectando una cuenta de intervals.icu ajena a su ficha.
//
// Acá nunca se devuelve el testigo al navegador: se canjea, se guarda, y el alumno vuelve
// a la app con un simple "salió bien" o "salió mal".

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { kvGet, kvSet } from "../../../../lib/supabaseAdmin";
import { verifySessionToken, SESSION_COOKIE } from "../../../../lib/session";
import { alumnoDelEstado, canjearCodigo } from "../../../../lib/intervals-oauth";

function volver(origen, estado, detalle) {
  const url = new URL("/", origen);
  url.searchParams.set("reloj", estado);
  if (detalle) url.searchParams.set("motivo", detalle);
  return NextResponse.redirect(url);
}

export async function GET(request) {
  const url = new URL(request.url);
  const origen = url.origin;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  // El alumno pulsó "no autorizar". No es un fallo: es su decisión.
  if (error) return volver(origen, "cancelado");
  if (!code || !state) return volver(origen, "error", "faltan-datos");

  const studentId = alumnoDelEstado(state);
  if (!studentId) return volver(origen, "error", "enlace-caducado");

  const store = await cookies();
  const session = verifySessionToken(store.get(SESSION_COOKIE)?.value);
  if (!session) return volver(origen, "error", "sin-sesion");
  const autorizado = session.role === "coach"
    || (session.role === "student" && session.studentId === studentId);
  if (!autorizado) return volver(origen, "error", "sin-permiso");

  const canje = await canjearCodigo(code, origen);
  if (!canje.ok) return volver(origen, "error", canje.motivo);

  const student = await kvGet(`student:${studentId}`);
  if (!student) return volver(origen, "error", "alumno-no-encontrado");

  const guardado = await kvSet(`student:${studentId}`, {
    ...student,
    intervals: {
      ...(student.intervals || {}),
      token: canje.token,
      athleteId: canje.athleteId ? String(canje.athleteId) : "0",
      nombreEnIntervals: canje.nombre || null,
      scopes: canje.scopes || null,
      conectadoEl: new Date().toISOString(),
    },
  });
  if (!guardado) return volver(origen, "error", "no-se-pudo-guardar");

  return volver(origen, "conectado");
}
