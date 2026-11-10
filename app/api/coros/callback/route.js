// Vuelta del alumno desde COROS después de autorizar.
//
// Igual que con Garmin, antes de guardar nada se comprueba que el viaje sea nuestro (el "state"
// guardado al salir, de un solo uso y con 15 minutos de vida) y que quien vuelve sea ese alumno o
// su coach. El testigo de COROS nunca pasa por el navegador.
import { NextResponse } from "next/server";
import { sesionDelPedido, entradaDe } from "../../../../lib/equipo-servidor";
import { puedeManejar } from "../../../../lib/equipo.mjs";
import { alumnoDelViaje, completarConexion } from "../../../../lib/coros-servidor";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function volver(origen, estado, detalle) {
  const url = new URL("/", origen);
  url.searchParams.set("reloj", estado);
  url.searchParams.set("marca", "coros");
  if (detalle) url.searchParams.set("motivo", detalle);
  return NextResponse.redirect(url);
}

export async function GET(request) {
  const url = new URL(request.url);
  const origen = url.origin;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (url.searchParams.get("error")) return volver(origen, "cancelado");
  if (!code || !state) return volver(origen, "error", "faltan-datos");

  const studentId = await alumnoDelViaje(state);
  if (!studentId) return volver(origen, "error", "enlace-caducado");
  const sesion = await sesionDelPedido();
  if (!sesion) return volver(origen, "error", "sin-sesion");
  const autorizado = (sesion.role === "coach" && puedeManejar(sesion, await entradaDe(studentId)))
    || (sesion.role === "student" && sesion.studentId === studentId);
  if (!autorizado) return volver(origen, "error", "sin-permiso");

  const r = await completarConexion({ state, code, origen });
  return r.ok ? volver(origen, "conectado") : volver(origen, "error", r.motivo);
}
