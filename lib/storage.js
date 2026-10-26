// Capa de guardado. Ya NO habla directo con Supabase desde el navegador — ahora pasa por
// el servidor (/api/data), que verifica quién eres antes de devolver o guardar cualquier cosa.
// Las firmas de función se mantienen idénticas, para que el resto de la app no cambie.

// Fecha del calendario LOCAL de este dispositivo, en "YYYY-MM-DD". Se manda al servidor
// para que pueda razonar con la semana del alumno en SU ciudad: para alguien en Italia, a
// las 00:30 del lunes ya empezó la semana nueva, aunque en el servidor todavía sea domingo.
// No se usa toISOString(), que pasa a UTC y correría el día.
function localDateISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function apiData(op, key, value) {
  try {
    const res = await fetch("/api/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op, key, value, localDate: localDateISO() }),
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
// Trae el resumen de cumplimiento de todos los alumnos en UNA sola petición, sin descargar
// el historial completo de cada uno. Es lo que usa el panel del coach para su listado.
export async function fetchRosterSummary() {
  try {
    const res = await fetch("/api/data", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "rosterSummary" }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    return j.summary || null;
  } catch (e) {
    console.error("storage error", e);
    return null;
  }
}
// Actualiza solo la entrada de un alumno en el listado, sin reescribir la lista completa.
// Evita perder cambios cuando dos acciones ocurren casi al mismo tiempo.
export async function updateRosterEntry(studentId, patch) {
  try {
    const res = await fetch("/api/data", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "updateRosterEntry", studentId, patch }),
    });
    if (!res.ok) return false;
    const j = await res.json();
    return !!j.ok;
  } catch (e) {
    console.error("storage error", e);
    return false;
  }
}
// --- Conexión con el reloj (intervals.icu) ---
// El testigo de acceso vive solo en el servidor; desde acá solo se piden acciones.
export async function intervalsOp(op, studentId, extra = {}) {
  try {
    const res = await fetch("/api/intervals", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op, studentId, ...extra }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, motivo: j.error || `error ${res.status}` };
    return j;
  } catch (e) {
    return { ok: false, motivo: "Sin conexión" };
  }
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

// El muro de anuncios. Todo pasa por el servidor, que decide quién puede qué.
export async function muroOp(op, extra = {}) {
  try {
    const res = await fetch("/api/muro", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op, ...extra }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: j.error || `error ${res.status}` };
    return j;
  } catch (e) {
    return { ok: false, error: "Sin conexión" };
  }
}
