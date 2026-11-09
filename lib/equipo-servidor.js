// El equipo de coaches, del lado del servidor: leer la lista de coaches y comprobar que la
// sesión de un coach siga valiendo.
//
// Fila:
//   coaches  → [{ id, nombre, hash, salt, v, creado }]
//
// "v" sube cada vez que el administrador le cambia la contraseña a un coach. La sesión del
// coach lleva la "v" con la que entró: si ya no coincide, o el coach fue quitado, su sesión
// deja de valer en el acto, aunque la cookie siga firmada y vigente.
//
// Las decisiones (quién ve y toca qué) están en lib/equipo.mjs, que es puro y tiene pruebas.
import { cookies } from "next/headers";
import { kvGet, kvSet } from "./supabaseAdmin";
import { verifySessionToken, SESSION_COOKIE } from "./session";
import * as E from "./equipo.mjs";

export const CLAVE_COACHES = "coaches";

export async function leerCoaches() {
  const l = await kvGet(CLAVE_COACHES);
  return Array.isArray(l) ? l.filter((c) => c && E.idCoachValido(c.id)) : [];
}

export async function guardarCoaches(lista) {
  return kvSet(CLAVE_COACHES, lista);
}

// La sesión, si sigue valiendo. Las de alumno y las del administrador pasan tal cual.
export async function sesionVigente(session) {
  if (!session) return null;
  if (session.role !== "coach" || E.esAdmin(session)) return session;
  const c = (await leerCoaches()).find((x) => x.id === session.coachId);
  if (!c || (c.v || 1) !== session.v) return null;
  return { ...session, nombre: c.nombre };
}

// La sesión del pedido actual (cookie firmada + coach todavía vigente).
export async function sesionDelPedido() {
  const store = await cookies();
  return sesionVigente(verifySessionToken(store.get(SESSION_COOKIE)?.value));
}

// La entrada del listado de un alumno, o null.
export async function entradaDe(studentId) {
  const roster = (await kvGet("roster")) || [];
  return roster.find((r) => r && r.id === studentId) || null;
}

export async function nombreDeCoach(coachId) {
  if (!coachId || coachId === E.ADMIN_ID) return "Coach";
  const c = (await leerCoaches()).find((x) => x.id === coachId);
  return c?.nombre || "Coach";
}
