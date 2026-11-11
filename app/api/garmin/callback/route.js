// Vuelta del alumno después de autorizar en Garmin Connect.
//
// Lo que prueba que el viaje es legítimo es el "state": lo crea el servidor cuando el propio
// alumno (o su coach) aprieta "Conectar", es secreto, de un solo uso y vive 15 minutos. El
// testigo de la marca nunca pasa por el navegador.
//
// La vuelta NO exige la sesión del navegador: en el celular la autorización suele terminar en
// otro lugar que donde empezó (la app Garmin Connect abre la vuelta en Safari, no en la app
// TROTAMUNDOS instalada en la pantalla de inicio, que guarda su sesión aparte; o en navegación
// privada). Exigirla dejaba al alumno en un bucle. Si SÍ hay una sesión y es de otra persona,
// se rechaza. Sin sesión, se completa y se muestra /reloj-conectado.
import { NextResponse } from "next/server";
import { sesionDelPedido, entradaDe } from "../../../../lib/equipo-servidor";
import { puedeManejar } from "../../../../lib/equipo.mjs";
import { alumnoDelViaje, completarConexion } from "../../../../lib/garmin-servidor";

export const dynamic = "force-dynamic";

function volver(origen, estado, detalle, { conSesion = true } = {}) {
  const url = new URL(conSesion ? "/" : "/reloj-conectado", origen);
  url.searchParams.set("reloj", estado);
  url.searchParams.set("marca", "garmin");
  if (detalle) url.searchParams.set("motivo", detalle);
  return NextResponse.redirect(url);
}

export async function GET(request) {
  const url = new URL(request.url);
  const origen = url.origin;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  // Sin sesión en este navegador, los avisos van a la página /reloj-conectado.
  const haySesion = !!(await sesionDelPedido());
  if (url.searchParams.get("error")) return volver(origen, "cancelado", null, { conSesion: haySesion });
  if (!code || !state) return volver(origen, "error", "faltan-datos", { conSesion: haySesion });

  const studentId = await alumnoDelViaje(state);
  if (!studentId) return volver(origen, "error", "enlace-caducado", { conSesion: haySesion });
  const sesion = await sesionDelPedido();
  if (sesion) {
    const autorizado = (sesion.role === "coach" && puedeManejar(sesion, await entradaDe(studentId)))
      || (sesion.role === "student" && sesion.studentId === studentId);
    if (!autorizado) return volver(origen, "error", "sin-permiso", { conSesion: false });
  }
  const conSesion = !!sesion;
  const r = await completarConexion({ state, code, origen });
  return r.ok ? volver(origen, "conectado", null, { conSesion }) : volver(origen, "error", r.motivo, { conSesion });
}
