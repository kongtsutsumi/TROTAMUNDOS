// Manejo de sesiones firmadas — el servidor emite una "credencial" al iniciar sesión
// correctamente, y la verifica en cada petición de datos. Va en una cookie que el
// navegador no puede leer ni modificar (httpOnly), firmada para que no se pueda falsificar.
import crypto from "crypto";

const SESSION_SECRET = process.env.SESSION_SECRET || "";
const SESSION_DAYS = 30;

function sign(payloadB64) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(payloadB64).digest("base64url");
}

export function createSessionToken(payload) {
  const body = { ...payload, exp: Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000 };
  const payloadB64 = Buffer.from(JSON.stringify(body)).toString("base64url");
  return `${payloadB64}.${sign(payloadB64)}`;
}

export function verifySessionToken(token) {
  if (!token || !SESSION_SECRET) return null;
  const [payloadB64, signature] = token.split(".");
  if (!payloadB64 || !signature) return null;
  const expected = sign(payloadB64);
  // comparación de tiempo constante, para no filtrar información por el tiempo de respuesta
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const body = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
    if (!body.exp || body.exp < Date.now()) return null;
    return body;
  } catch (e) {
    return null;
  }
}

export const SESSION_COOKIE = "trotamundos_session";
export const SESSION_MAX_AGE = SESSION_DAYS * 24 * 60 * 60;
