// Vigencia de los planes y pagos de cada alumno, del lado del servidor.
//
// Filas:
//   membresia:<idAlumno>   → { start, end, payments: [...], base? }  (ver lib/vigencia.mjs)
//   pagos:ajustes          → { warnDays, monthlyFee }
//   pagos:inicial          → marca de que ya se dio la vigencia inicial (30/11/2026)
//
// El cálculo vive en lib/vigencia.mjs (cubierto por tests/vigencia.test.mjs).
import { kvGet, kvSet, kvList } from "./supabaseAdmin";
import { DEFAULT_WARN_DAYS, membresiaInicial } from "./vigencia.mjs";

export const CLAVE_MEMBRESIA = "membresia:";
export const claveDe = (id) => `${CLAVE_MEMBRESIA}${id}`;
const AJUSTES = "pagos:ajustes";
const MARCA_INICIAL = "pagos:inicial";

export const AJUSTES_POR_DEFECTO = { warnDays: DEFAULT_WARN_DAYS, monthlyFee: null };

export async function leerAjustes() {
  const a = (await kvGet(AJUSTES)) || {};
  return { ...AJUSTES_POR_DEFECTO, ...a };
}

export function limpiarAjustes(entrada, actuales) {
  const out = { ...actuales };
  if (entrada?.warnDays !== undefined) {
    const n = Number(entrada.warnDays);
    if (!Number.isInteger(n) || n < 0 || n > 30) throw new Error("El aviso debe ser entre 0 y 30 días.");
    out.warnDays = n;
  }
  if (entrada?.monthlyFee !== undefined) {
    if (entrada.monthlyFee === "" || entrada.monthlyFee === null) out.monthlyFee = null;
    else {
      const n = Number(entrada.monthlyFee);
      if (!Number.isFinite(n) || n < 0 || n > 100000) throw new Error("La mensualidad no es válida.");
      out.monthlyFee = Math.round(n * 100) / 100;
    }
  }
  return out;
}

export async function guardarAjustes(ajustes) {
  return kvSet(AJUSTES, ajustes);
}

// Una sola vez: todos los alumnos que ya estaban registrados quedan con vigencia hasta el
// 30/11/2026, sin pago en su historial. Solo se crea para quien todavía no tiene membresía,
// así que repetirlo (dos pestañas abiertas a la vez) no pisa nada. Los alumnos que se creen
// después arrancan "Sin plan" hasta que el coach registre su primer pago.
export async function asegurarVigenciaInicial() {
  if (await kvGet(MARCA_INICIAL)) return;
  const roster = (await kvGet("roster")) || [];
  const existentes = new Set((await kvList(CLAVE_MEMBRESIA)).map((f) => f.key));
  for (const r of roster) {
    if (!r?.id || existentes.has(claveDe(r.id))) continue;
    await kvSet(claveDe(r.id), { ...membresiaInicial(), updatedAt: new Date().toISOString() });
  }
  await kvSet(MARCA_INICIAL, { aplicada: new Date().toISOString(), alumnos: roster.length });
}

export async function leerMembresia(id) {
  return (await kvGet(claveDe(id))) || null;
}

export async function leerTodas() {
  const filas = await kvList(CLAVE_MEMBRESIA);
  return Object.fromEntries(filas.map((f) => [f.key.slice(CLAVE_MEMBRESIA.length), f.value]));
}

export async function guardarMembresia(id, valor) {
  return kvSet(claveDe(id), { ...valor, updatedAt: new Date().toISOString() });
}
