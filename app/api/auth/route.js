import { NextResponse } from "next/server";
import { kvGet, kvSet } from "../../../lib/supabaseAdmin";
import { hashText, genSalt } from "../../../lib/hash";
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE } from "../../../lib/session";

const COACH_SETUP_CODE = "TROTAMUNDOS-JK";

function sessionCookieOptions() {
  return {
    httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "lax", path: "/", maxAge: SESSION_MAX_AGE,
  };
}

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch (e) { return NextResponse.json({ error: "Petición inválida" }, { status: 400 }); }
  const { action } = body || {};

  // --- Estado inicial: ¿ya hay contraseña de coach configurada? ---
  if (action === "status") {
    const auth = await kvGet("coachAuth");
    return NextResponse.json({ coachConfigured: !!auth });
  }

  // --- Configurar la contraseña del coach por primera vez ---
  if (action === "coachSetup") {
    const { setupCode, password } = body;
    if (setupCode !== COACH_SETUP_CODE) return NextResponse.json({ error: "Código de configuración incorrecto" }, { status: 401 });
    if (!password || password.length < 6) return NextResponse.json({ error: "La contraseña debe tener al menos 6 caracteres" }, { status: 400 });
    const existing = await kvGet("coachAuth");
    if (existing) return NextResponse.json({ error: "La contraseña ya fue configurada" }, { status: 409 });
    const salt = genSalt();
    await kvSet("coachAuth", { hash: hashText(password, salt), salt });
    const token = createSessionToken({ role: "coach" });
    const res = NextResponse.json({ ok: true, role: "coach" });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return res;
  }

  // --- Ingreso del coach ---
  if (action === "coachLogin") {
    const { password } = body;
    const auth = await kvGet("coachAuth");
    if (!auth) return NextResponse.json({ error: "No hay contraseña configurada" }, { status: 404 });
    if (hashText(password || "", auth.salt) !== auth.hash) {
      return NextResponse.json({ error: "Contraseña incorrecta" }, { status: 401 });
    }
    const token = createSessionToken({ role: "coach" });
    const res = NextResponse.json({ ok: true, role: "coach" });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return res;
  }

  // --- Listado público mínimo para el buscador de alumnos (solo nombres e id) ---
  if (action === "studentList") {
    const roster = (await kvGet("roster")) || [];
    return NextResponse.json({ students: roster.map((r) => ({ id: r.id, name: r.name })) });
  }

  // --- Ingreso del alumno con su PIN ---
  if (action === "studentLogin") {
    const { studentId, pin } = body;
    if (!studentId || !pin) return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
    const student = await kvGet(`student:${studentId}`);
    if (!student) return NextResponse.json({ error: "Alumno no encontrado" }, { status: 404 });
    if (hashText(pin, student.pinSalt) !== student.pinHash) {
      return NextResponse.json({ error: "PIN incorrecto" }, { status: 401 });
    }
    const token = createSessionToken({ role: "student", studentId });
    const res = NextResponse.json({ ok: true, role: "student", studentId });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return res;
  }

  // --- Cerrar sesión ---
  if (action === "logout") {
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
    return res;
  }

  return NextResponse.json({ error: "Acción desconocida" }, { status: 400 });
}
