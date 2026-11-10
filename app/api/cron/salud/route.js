// Tarea programada diaria (vercel.json): barrido de seguridad de los datos de salud.
//
// Borra los datos de salud de cualquier alumno que ya no tenga el consentimiento de salud
// o que ya no esté en el listado. Lo normal es que no encuentre nada, porque esos datos se
// borran en el momento (al retirar el consentimiento, desconectar el reloj o borrar al
// alumno). Está por si algo de eso falló: garantiza que lo prometido en la política de
// privacidad ("se eliminan dentro de los 30 días") se cumple con margen.
//
// Además lee lo de COROS de todos los alumnos que lo tengan conectado: COROS no avisa cuando hay
// algo nuevo, y es esta lectura la que descubre a tiempo (dentro de las 24 horas que pide su
// acuerdo) a quien retiró el permiso desde la app de COROS, para borrar lo que vino de ahí.
import { NextResponse } from "next/server";
import { barrerSalud } from "../../../../lib/salud-servidor";
import { traerCorosDeTodos } from "../../../../lib/coros-servidor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(request) {
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  const fromVercel = !!request.headers.get("x-vercel-signature") || auth === `Bearer ${secret}`;
  if (!secret || !fromVercel) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  let coros = null;
  try {
    coros = await traerCorosDeTodos({ limiteMs: 35000 });
  } catch (e) {
    console.error("cron salud: la lectura de COROS falló", e);
    coros = { error: e?.message || "desconocido" };
  }
  const r = await barrerSalud();
  return NextResponse.json({ ...r, coros });
}

export const GET = handle;
export const POST = handle;
