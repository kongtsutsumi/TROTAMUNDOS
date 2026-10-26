// Cliente de Supabase que SOLO se usa en el servidor. Usa la clave secreta, que nunca
// llega al navegador — por eso la base de datos puede quedar cerrada al público.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!url || !secretKey) {
  console.error("Faltan variables de entorno del servidor: NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY");
}

export const supabaseAdmin = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// --- Acceso directo a kv_store desde el servidor ---
export async function kvGet(key) {
  const { data, error } = await supabaseAdmin.from("kv_store").select("value").eq("key", key).maybeSingle();
  if (error || !data) return null;
  return data.value;
}
export async function kvSet(key, value) {
  const { error } = await supabaseAdmin.from("kv_store").upsert({ key, value, updated_at: new Date().toISOString() });
  return !error;
}
export async function kvDelete(key) {
  const { error } = await supabaseAdmin.from("kv_store").delete().eq("key", key);
  return !error;
}

// --- Filas por prefijo de clave (las usa el muro de anuncios) ---
// Aprovecha el índice idx_kv_store_key_prefix. Cada publicación y cada respuesta del muro
// vive en su propia fila, y así se leen todas juntas sin una lista compartida que se
// pueda pisar.
export async function kvList(prefijo) {
  if (typeof prefijo !== "string" || prefijo.length < 5) return [];
  const { data, error } = await supabaseAdmin.from("kv_store").select("key, value").like("key", `${prefijo}%`).limit(5000);
  if (error || !data) return [];
  return data;
}

// Borra las respuestas de UNA publicación del muro. Es deliberadamente estrecha: un
// borrado por prefijo mal armado podría vaciar la tabla entera, así que solo acepta un
// identificador de publicación válido y arma el prefijo ella misma.
export async function kvDeleteRespuestasDe(idPost) {
  if (typeof idPost !== "string" || !/^[a-z0-9]{6,40}(-[a-z0-9]{2,20})?$/.test(idPost)) return false;
  const { error } = await supabaseAdmin.from("kv_store").delete().like("key", `muro:resp:${idPost}:%`);
  return !error;
}
