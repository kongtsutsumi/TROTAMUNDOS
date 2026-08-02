// Capa de guardado — reemplaza a window.storage (que solo existía dentro
// del artefacto de Claude) por Supabase, manteniendo las mismas firmas de
// función que ya usaba el resto de la app, para minimizar los cambios en
// el código de las pantallas.
import { supabase } from "./supabaseClient";

// --- Almacenamiento compartido (datos reales: alumnos, semanas, etc.) ---
export async function safeGet(key) {
  try {
    const { data, error } = await supabase.from("kv_store").select("value").eq("key", key).maybeSingle();
    if (error || !data) return null;
    return data.value;
  } catch (e) {
    console.error("storage get error", e);
    return null;
  }
}

export async function safeSet(key, value) {
  try {
    const { error } = await supabase.from("kv_store").upsert({ key, value, updated_at: new Date().toISOString() });
    if (error) { console.error("storage set error", error); return false; }
    return true;
  } catch (e) {
    console.error("storage set error", e);
    return false;
  }
}

export async function safeDelete(key) {
  try {
    const { error } = await supabase.from("kv_store").delete().eq("key", key);
    return !error;
  } catch (e) {
    return false;
  }
}

// Igual que safeGet, pero reintenta un par de veces si el resultado viene vacío —
// cubre el caso de leer un registro justo después de haberlo guardado.
export async function safeGetWithRetry(key, attempts = 4, delayMs = 400) {
  for (let i = 0; i < attempts; i++) {
    const res = await safeGet(key);
    if (res != null) return res;
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs));
  }
  return null;
}

// --- Almacenamiento personal (recordar sesión de un alumno en su propio
// dispositivo) — ahora usa localStorage real del navegador, ya que fuera
// del artefacto de Claude sí está disponible y funciona de forma normal. ---
export async function safeGetPersonal(key) {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(`trotamundos:${key}`);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}
export async function safeSetPersonal(key, value) {
  try {
    if (typeof window === "undefined") return false;
    window.localStorage.setItem(`trotamundos:${key}`, JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
}
export async function safeDeletePersonal(key) {
  try {
    if (typeof window === "undefined") return false;
    window.localStorage.removeItem(`trotamundos:${key}`);
    return true;
  } catch (e) {
    return false;
  }
}
