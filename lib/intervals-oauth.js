// Conexión de la cuenta de intervals.icu de cada alumno (OAuth 2.0).
//
// Cómo funciona el viaje:
//   1. El alumno pulsa "conectar mi reloj" en la app.
//   2. Se le manda a intervals.icu con nuestro identificador de app, los permisos que
//      pedimos y un "state" firmado que dice de quién es el viaje.
//   3. Allá ve qué permisos se piden y acepta (o no).
//   4. Vuelve a /api/intervals/callback con un código de un solo uso.
//   5. El servidor cambia ese código por un testigo de acceso y lo guarda.
//
// El testigo NUNCA pasa por el navegador: se canjea servidor contra servidor y se guarda
// del lado nuestro. Lo único que viaja por el navegador es el código de un solo uso, que
// sin el secreto de la app no sirve para nada.

import { createStateToken, verifyStateToken } from "./session";

export const AUTHORIZE_URL = "https://intervals.icu/oauth/authorize";
export const TOKEN_URL = "https://intervals.icu/api/oauth/token";

// Los permisos mínimos que necesita la app:
//   CALENDAR:WRITE → escribir los entrenamientos en el calendario del alumno
//   ACTIVITY:READ  → leer las actividades que completa, para el registro
// No se pide nada más. WRITE ya incluye READ, según su documentación.
export const SCOPES = "CALENDAR:WRITE,ACTIVITY:READ";

export function estaConfigurado() {
  return !!(process.env.INTERVALS_CLIENT_ID && process.env.INTERVALS_CLIENT_SECRET);
}

export function urlDeAutorizacion(studentId, origen) {
  if (!estaConfigurado()) return null;
  const state = createStateToken({ studentId });
  const params = new URLSearchParams({
    client_id: process.env.INTERVALS_CLIENT_ID,
    redirect_uri: `${origen}/api/intervals/callback`,
    scope: SCOPES,
    state,
    response_type: "code",
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

// Comprueba que el viaje de vuelta sea legítimo y devuelve de qué alumno era.
export function alumnoDelEstado(state) {
  const body = verifyStateToken(state);
  return body?.studentId || null;
}

// Cambia el código de un solo uso por el testigo de acceso. Es la única llamada que usa el
// secreto de la app, y ocurre entre servidores.
export async function canjearCodigo(code, origen) {
  if (!estaConfigurado()) return { ok: false, motivo: "sin-configurar" };
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.INTERVALS_CLIENT_ID,
        client_secret: process.env.INTERVALS_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: `${origen}/api/intervals/callback`,
      }).toString(),
    });
    if (!res.ok) {
      const detalle = await res.text().catch(() => "");
      return { ok: false, motivo: `rechazado:${res.status}`, detalle: detalle.slice(0, 300) };
    }
    const j = await res.json();
    if (!j?.access_token) return { ok: false, motivo: "sin-testigo" };
    return {
      ok: true,
      token: j.access_token,
      athleteId: j.athlete?.id ?? j.athlete_id ?? null,
      nombre: j.athlete?.name ?? null,
      scopes: j.scope ?? j.scopes ?? null,
    };
  } catch (e) {
    return { ok: false, motivo: "red", detalle: e?.message || null };
  }
}
