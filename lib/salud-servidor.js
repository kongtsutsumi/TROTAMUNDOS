// Datos de salud del lado del servidor: guardar, leer y borrar en la tabla "salud_diaria".
//
// Dos reglas que no se negocian (las promete la política de privacidad):
//   · Nada se guarda sin el consentimiento de salud del alumno. Se comprueba acá, en el
//     momento de guardar, y no en quien llama: así ninguna integración futura (Garmin,
//     COROS…) puede saltárselo por olvido.
//   · Al retirar el consentimiento, desconectar el dispositivo o borrar al alumno, sus datos
//     de salud se borran. Además, la tarea diaria (/api/cron/salud) barre cualquier dato de
//     un alumno que ya no tenga consentimiento o ya no exista, por si algo falló.
//
// Las funciones aceptan un cliente de Supabase opcional para poder probarlas sin red.
import { supabaseAdmin, kvGet, kvSet, kvDelete } from "./supabaseAdmin";
import * as C from "./consentimiento.mjs";
import { filaDeSalud, fuenteValida } from "./salud.mjs";

const TABLA = "salud_diaria";
const claveConsentimiento = (studentId) => `consentimiento:${studentId}`;

/* --- Consentimiento --- */

export async function leerConsentimiento(studentId) {
  return C.normalizar(await kvGet(claveConsentimiento(studentId)));
}

// Aplica lo que eligió el alumno. Si retiró el de salud, borra sus datos de salud.
export async function guardarConsentimiento(studentId, cambios, db = supabaseAdmin) {
  const r = C.aplicar(await leerConsentimiento(studentId), cambios);
  if (!r.ok) return r;
  if (r.cambiados.length) {
    if (!(await kvSet(claveConsentimiento(studentId), r.registro))) return { ok: false, error: "No se pudo guardar. Prueba de nuevo." };
  }
  let borrados = 0;
  if (r.retiroSalud) borrados = (await borrarSalud(studentId, null, db)).borrados;
  return { ok: true, consentimiento: C.resumen(r.registro), borrados };
}

/* --- Datos de salud --- */

// Guarda los datos de un día. Sin consentimiento de salud, no guarda nada.
export async function guardarSaludDiaria({ studentId, fecha, fuente, datos }, db = supabaseAdmin) {
  if (!C.aceptoSalud(await leerConsentimiento(studentId))) return { ok: false, motivo: "sin-consentimiento" };
  const { fila, error } = filaDeSalud({ studentId, fecha, fuente, datos });
  if (error) return { ok: false, motivo: error };
  // Un mismo día llega en partes (el sueño, la VFC, el resumen diario…): se suma a lo que ya
  // había de ese día y esa fuente, y lo nuevo reemplaza lo viejo campo por campo.
  const { data: previa } = await db.from(TABLA).select("datos").eq("student_id", studentId).eq("fecha", fecha).eq("fuente", fuente).maybeSingle();
  const combinados = { ...(previa?.datos && typeof previa.datos === "object" ? previa.datos : {}), ...fila.datos };
  const { error: e } = await db.from(TABLA).upsert({ ...fila, datos: combinados, recibido_at: new Date().toISOString() });
  return e ? { ok: false, motivo: "base-de-datos" } : { ok: true };
}

// Los días de un alumno, del más reciente al más antiguo.
export async function leerSalud(studentId, { desde, hasta, limite = 60 } = {}, db = supabaseAdmin) {
  let q = db.from(TABLA).select("fecha, fuente, datos").eq("student_id", studentId);
  if (desde) q = q.gte("fecha", desde);
  if (hasta) q = q.lte("fecha", hasta);
  const { data, error } = await q.order("fecha", { ascending: false }).limit(Math.min(Math.max(1, limite), 400));
  return error ? [] : data || [];
}

// Borra los datos de salud de un alumno: todos, o solo los de una fuente.
export async function borrarSalud(studentId, fuente = null, db = supabaseAdmin) {
  if (typeof studentId !== "string" || !studentId) return { ok: false, borrados: 0 };
  if (fuente !== null && !fuenteValida(fuente)) return { ok: false, borrados: 0 };
  let q = db.from(TABLA).delete({ count: "exact" }).eq("student_id", studentId);
  if (fuente) q = q.eq("fuente", fuente);
  const { error, count } = await q;
  return { ok: !error, borrados: count || 0 };
}

// Al desconectar el reloj: se retira el consentimiento (para volver a conectar hay que
// aceptarlo de nuevo) y se borran sus datos de salud. Se borran aunque no hubiera registro
// de consentimiento (alumnos que conectaron antes de que existiera).
export async function alDesconectar(studentId, db = supabaseAdmin) {
  const g = await guardarConsentimiento(studentId, { entrenamiento: false }, db);
  const b = await borrarSalud(studentId, null, db);
  return { ok: b.ok, borrados: (g.borrados || 0) + b.borrados };
}

// Al borrar a un alumno: su consentimiento y todos sus datos de salud.
export async function alBorrarAlumno(studentId, db = supabaseAdmin) {
  await kvDelete(claveConsentimiento(studentId));
  return borrarSalud(studentId, null, db);
}

// Barrido de seguridad: borra los datos de salud de quien ya no tiene consentimiento o ya
// no está en el listado. Lo corre la tarea diaria.
export async function barrerSalud(db = supabaseAdmin) {
  const { data, error } = await db.from(TABLA).select("student_id").limit(100000);
  if (error) return { ok: false, borrados: 0, alumnos: 0 };
  const ids = [...new Set((data || []).map((r) => r.student_id))];
  const roster = (await kvGet("roster")) || [];
  const enListado = new Set(roster.map((r) => r?.id));
  let borrados = 0, alumnos = 0;
  for (const id of ids) {
    if (enListado.has(id) && C.aceptoSalud(await leerConsentimiento(id))) continue;
    const r = await borrarSalud(id, null, db);
    borrados += r.borrados; alumnos++;
  }
  return { ok: true, borrados, alumnos };
}
