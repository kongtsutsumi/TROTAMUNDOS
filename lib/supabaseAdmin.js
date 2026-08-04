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
