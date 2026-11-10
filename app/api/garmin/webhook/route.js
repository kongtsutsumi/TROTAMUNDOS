// Avisos (push) de Garmin: actividades, salud, desconexiones y cambios de permisos.
//
// Garmin manda cada aviso como un POST con JSON a la dirección configurada en sus API Tools:
//   https://app.trotamundos.pe/api/garmin/webhook?k=<GARMIN_WEBHOOK_SECRET>
// La clave de la dirección es nuestra prueba de que el aviso viene de quien la conoce
// (Garmin); sin ella no se procesa nada. Además, solo se aceptan datos de cuentas de Garmin
// unidas a un alumno.
//
// Garmin exige responder 200 dentro de 30 segundos; si no, reintenta cada hora durante 7
// días. Se procesa con un tope de 20 segundos y se responde 200 siempre que la clave sea
// correcta: un aviso mal formado no tiene arreglo reintentándolo.
import { NextResponse } from "next/server";
import crypto from "crypto";
import { procesarPush } from "../../../../lib/garmin-servidor";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function claveCorrecta(k) {
  const secreto = process.env.GARMIN_WEBHOOK_SECRET;
  if (!secreto || typeof k !== "string" || k.length !== secreto.length) return false;
  return crypto.timingSafeEqual(Buffer.from(k), Buffer.from(secreto));
}

export async function POST(request) {
  const k = new URL(request.url).searchParams.get("k");
  if (!claveCorrecta(k)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  let cuerpo = null;
  try { cuerpo = await request.json(); } catch (e) { return NextResponse.json({ ok: true, ignorado: "cuerpo-invalido" }); }
  const tope = new Promise((res) => setTimeout(() => res({ tope: true }), 20000));
  const informe = await Promise.race([procesarPush(cuerpo).catch((e) => ({ error: e?.message || "error" })), tope]);
  return NextResponse.json({ ok: true, ...informe });
}
