// Mismo esquema de hash que ya usaba la app (SHA-256 con sal), pero ejecutado en el
// servidor — para que el PIN y la contraseña se verifiquen donde el navegador no puede mentir.
import crypto from "crypto";

export function hashText(text, salt) {
  const input = salt ? `${salt}:${text}` : text;
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}
export function genSalt() {
  return crypto.randomBytes(12).toString("hex");
}
