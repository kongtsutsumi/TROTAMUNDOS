// Recepción de los avisos (push) de Garmin, compartida por /api/garmin/webhook (clave en ?k=)
// y /api/garmin/webhook/<clave> (clave en la ruta, que es la que acepta el portal de Garmin).
import { NextResponse } from "next/server";
import crypto from "crypto";
import { procesarPush, anotarLlegada } from "./garmin-servidor";

function claveCorrecta(k) {
  const secreto = (process.env.GARMIN_WEBHOOK_SECRET || "").trim();
  if (!secreto || typeof k !== "string" || k.length !== secreto.length) return false;
  return crypto.timingSafeEqual(Buffer.from(k), Buffer.from(secreto));
}

export async function recibirAviso(request, k) {
  const claveOk = claveCorrecta(k);
  let cuerpo = null;
  try { cuerpo = await request.json(); } catch (e) { /* se anota abajo */ }
  const tipos = cuerpo && typeof cuerpo === "object" && !Array.isArray(cuerpo) ? Object.keys(cuerpo) : [];
  await anotarLlegada({ claveOk, tipos: claveOk ? tipos : [], error: cuerpo ? null : "cuerpo-invalido" });
  if (!claveOk) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!cuerpo) return NextResponse.json({ ok: true, ignorado: "cuerpo-invalido" });
  const tope = new Promise((res) => setTimeout(() => res({ tope: true }), 20000));
  const informe = await Promise.race([procesarPush(cuerpo).catch((e) => ({ error: e?.message || "error" })), tope]);
  return NextResponse.json({ ok: true, ...informe });
}
