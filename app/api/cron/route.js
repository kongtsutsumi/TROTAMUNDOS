// Tarea programada: lunes a las 00:00 de Lima.
//
// Hace dos cosas, en este orden:
//
//   1. Recoge de intervals.icu lo que entrenaron los alumnos con reloj conectado. Va
//      primero a propósito: el reporte de la semana que acaba de cerrar se arma con los
//      kilómetros reales, y conviene que estén dentro antes de cerrarla.
//
//   2. Recorre el listado y publica la semana de cada alumno que no la tenga. Es el
//      "adelanto": deja todo listo aunque nadie abra la app, así el panel del coach y la
//      cola de reportes están al día el lunes a primera hora.
//
// Ninguna de las dos es lo que garantiza que el alumno vea su plan — de eso se encarga
// /api/data, que publica la semana en el mismo pedido con que el alumno la consulta. Si
// esta tarea nunca corriera, el alumno igual vería su semana al entrar, y lo del reloj se
// leería en cuanto alguien abriera la app.
//
// El horario está en vercel.json: "0 5 * * 1" (lunes 05:00 UTC = 00:00 en Lima, UTC-5).

import { NextResponse } from "next/server";
import { publishDueWeeksForAll } from "../../../lib/autoPublish";
import { traerDelRoster } from "../../../lib/intervals-pull";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Cuánto se le concede a la lectura de los relojes antes de pasar a publicar. Publicar la
// semana es lo que no puede faltar; leer el reloj es un extra que se recupera solo.
const PRESUPUESTO_DE_LECTURA_MS = 25000;

// Zona horaria con la que razona la tarea. Es la del coach: el lunes que importa para
// decidir "a esta semana le toca plan" es el de Lima. Cada alumno que viva en otra zona y
// entre antes de que esto corra queda cubierto por /api/data.
const CRON_TIMEZONE = "America/Lima";

function todayInTimezone(tz) {
  // en-CA entrega la fecha ya en formato "YYYY-MM-DD".
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

async function handle(request) {
  // Vercel firma sus llamadas de cron con este encabezado. También se acepta el secreto
  // como "Bearer", para poder dispararla a mano cuando haga falta. Sin uno de los dos no
  // se ejecuta: esta ruta escribe en los registros de los alumnos.
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  const fromVercel = !!request.headers.get("x-vercel-signature") || auth === `Bearer ${secret}`;
  if (!secret || !fromVercel) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const localDate = todayInTimezone(CRON_TIMEZONE);

  // Primero los relojes. Envuelto en su propio try: si intervals.icu está caído, la
  // publicación de la semana tiene que ocurrir igual.
  let relojes = null;
  try {
    relojes = await traerDelRoster({ limiteMs: PRESUPUESTO_DE_LECTURA_MS });
  } catch (e) {
    console.error("cron: la lectura de relojes falló", e);
    relojes = { error: e?.message || "desconocido" };
  }

  let results;
  try {
    results = await publishDueWeeksForAll(localDate);
  } catch (e) {
    console.error("cron autoPublish falló", e);
    return NextResponse.json({ error: "Falló la publicación automática", detail: e?.message || null, relojes }, { status: 500 });
  }

  const published = results.filter((r) => r.published);
  console.log(`[cron ${localDate}] ${published.length} de ${results.length} semanas publicadas; relojes: ${JSON.stringify(relojes)}`);
  return NextResponse.json({
    ok: true,
    date: localDate,
    timezone: CRON_TIMEZONE,
    students: results.length,
    published: published.length,
    relojes,
    detail: results,
  });
}

export async function GET(request) { return handle(request); }
export async function POST(request) { return handle(request); }
