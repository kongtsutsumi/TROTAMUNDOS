import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { kvGet, kvSet, kvDelete } from "../../../lib/supabaseAdmin";
import { verifySessionToken, SESSION_COOKIE } from "../../../lib/session";
import { canRead, canWrite, canDelete, sanitizeForSession } from "../../../lib/permissions";

async function getSession() {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

export async function POST(request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let body;
  try { body = await request.json(); } catch (e) { return NextResponse.json({ error: "Petición inválida" }, { status: 400 }); }
  const { op, key, value } = body || {};
  if (!op || !key) return NextResponse.json({ error: "Faltan datos" }, { status: 400 });

  if (op === "get") {
    if (!canRead(session, key)) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    const raw = await kvGet(key);
    return NextResponse.json({ value: sanitizeForSession(session, key, raw) });
  }

  if (op === "set") {
    if (!canWrite(session, key)) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    // Un alumno no puede sobrescribir sus propias credenciales ni su plan completo desde el
    // navegador: se preservan del registro guardado los campos que solo el coach controla.
    let toSave = value;
    if (session.role === "student") {
      const current = await kvGet(key);
      if (!current) return NextResponse.json({ error: "Registro no encontrado" }, { status: 404 });
      toSave = {
        ...current,
        weeks: value?.weeks ?? current.weeks, // el alumno sí registra sus sesiones
        pinHash: current.pinHash, pinSalt: current.pinSalt,
        goal: current.goal, level: current.level, paces: current.paces,
        peakKm: current.peakKm, peakLongKm: current.peakLongKm,
        raceDate: current.raceDate, targetPaceStr: current.targetPaceStr,
        currentWeek: current.currentWeek, name: current.name, id: current.id,
      };
    }
    const ok = await kvSet(key, toSave);
    return NextResponse.json({ ok });
  }

  if (op === "delete") {
    if (!canDelete(session, key)) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    const ok = await kvDelete(key);
    return NextResponse.json({ ok });
  }

  return NextResponse.json({ error: "Operación desconocida" }, { status: 400 });
}
