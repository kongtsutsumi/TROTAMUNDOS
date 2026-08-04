// Capa de guardado. Ya NO habla directo con Supabase desde el navegador — ahora pasa por
// el servidor (/api/data), que verifica quién eres antes de devolver o guardar cualquier cosa.
// Las firmas de función se mantienen idénticas, para que el resto de la app no cambie.

async function apiData(op, key, value) {
  try {
    const res = await fetch("/api/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op, key, value }),
    });
    if (!res.ok) return { ok: false, value: null };
    return { ok: true, ...(await res.json()) };
  } catch (e) {
    console.error("storage error", e);
    return { ok: false, value: null };
  }
}

export async function safeGet(key) {
  const r = await apiData("get", key);
  return r.ok ? (r.value ?? null) : null;
}
export async function safeSet(key, value) {
  const r = await apiData("set", key, value);
  return !!(r.ok && r.ok !== false);
}
export async function safeDelete(key) {
  const r = await apiData("delete", key);
  return !!r.ok;
}
export async function safeGetWithRetry(key, attempts = 4, delayMs = 400) {
  for (let i = 0; i < attempts; i++) {
    const res = await safeGet(key);
    if (res != null) return res;
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs));
  }
  return null;
}

// --- Autenticación (todo verificado en el servidor) ---
async function apiAuth(payload) {
  try {
    const res = await fetch("/api/auth", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return { status: res.status, ...(await res.json()) };
  } catch (e) {
    return { status: 0, error: "Sin conexión" };
  }
}
export const authStatus = () => apiAuth({ action: "status" });
export const coachSetup = (setupCode, password) => apiAuth({ action: "coachSetup", setupCode, password });
export const coachLogin = (password) => apiAuth({ action: "coachLogin", password });
export const studentList = () => apiAuth({ action: "studentList" });
export const studentLogin = (studentId, pin) => apiAuth({ action: "studentLogin", studentId, pin });
export const logout = () => apiAuth({ action: "logout" });

// --- Almacenamiento local del dispositivo (recordar sesión) — sin cambios ---
export async function safeGetPersonal(key) {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(`trotamundos:${key}`);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
export async function safeSetPersonal(key, value) {
  try {
    if (typeof window === "undefined") return false;
    window.localStorage.setItem(`trotamundos:${key}`, JSON.stringify(value));
    return true;
  } catch (e) { return false; }
}
export async function safeDeletePersonal(key) {
  try {
    if (typeof window === "undefined") return false;
    window.localStorage.removeItem(`trotamundos:${key}`);
    return true;
  } catch (e) { return false; }
}
