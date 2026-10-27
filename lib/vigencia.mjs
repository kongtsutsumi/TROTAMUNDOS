// Vigencia de los planes de TROTAMUNDOS (la misma lógica que Chrono Runners): hasta cuándo tiene pagado cada alumno.
//
// Código puro (sin base de datos ni navegador): lo usan el servidor, el panel del coach, el
// portal del alumno y las pruebas. Todas las fechas son "YYYY-MM-DD" del calendario de Lima;
// nunca se pasa por UTC, para que un pago registrado a las 11 p.m. no caiga en el día siguiente.
//
// Modelo: el plan es mensual y lo renueva el coach. Cada pago cubre uno o más meses
// corridos. La vigencia de un alumno es el último periodo pagado:
//
//   membership = {
//     start: "2026-10-01",   // primer día cubierto del periodo vigente
//     end:   "2026-10-31",   // último día cubierto (vence al terminar este día)
//     payments: [{ id, paidOn, months, from, to, amount, method, note, createdAt }],
//   }

export const DEFAULT_WARN_DAYS = 7;

export const STATUS = {
  none: { id: "none", label: "Sin plan registrado" },
  vigente: { id: "vigente", label: "Vigente" },
  por_vencer: { id: "por_vencer", label: "Por vencer" },
  vencido: { id: "vencido", label: "Vencido" },
};

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
export function isISODate(s) {
  if (typeof s !== "string" || !ISO_RE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function toUTC(iso) { const [y, m, d] = iso.split("-").map(Number); return Date.UTC(y, m - 1, d); }
function fromUTC(ms) {
  const dt = new Date(ms);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

export function addDays(iso, n) { return fromUTC(toUTC(iso) + n * 86400000); }
export function daysBetween(fromIso, toIso) { return Math.round((toUTC(toIso) - toUTC(fromIso)) / 86400000); }

// Suma meses de calendario. Si el día no existe en el mes de llegada, se queda en el último
// día de ese mes: 31 de enero + 1 mes = 28 (o 29) de febrero.
export function addMonths(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const total = (m - 1) + n;
  const ty = y + Math.floor(total / 12);
  const tm = ((total % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return fromUTC(Date.UTC(ty, tm, Math.min(d, lastDay)));
}

// Último día cubierto por `months` meses que empiezan en `fromIso`.
// Del 1 de octubre, 1 mes cubre hasta el 31 de octubre; del 15 de octubre, hasta el 14 de noviembre.
export function periodEnd(fromIso, months) { return addDays(addMonths(fromIso, months), -1); }

// Hoy en Lima (o la zona que se pida), en "YYYY-MM-DD".
export function todayIn(tz = "America/Lima", now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

// Estado de la vigencia en una fecha.
//   daysLeft: días que quedan hasta el último día cubierto (0 = vence hoy, negativo = ya venció).
export function membershipStatus(membership, todayIso, warnDays = DEFAULT_WARN_DAYS) {
  const end = membership?.end;
  if (!end || !isISODate(end)) return { status: "none", daysLeft: null, end: null, start: null };
  const daysLeft = daysBetween(todayIso, end);
  let status;
  if (daysLeft < 0) status = "vencido";
  else if (daysLeft <= Math.max(0, Number(warnDays) || 0)) status = "por_vencer";
  else status = "vigente";
  // Un periodo que todavía no empieza (pago adelantado de un alumno nuevo) cuenta como vigente.
  return { status, daysLeft, end, start: membership.start || null };
}

// Desde qué día corresponde el siguiente periodo cuando se registra un pago.
//  · Si el plan sigue vigente (o vence hoy), el pago se encadena: empieza al día siguiente
//    del vencimiento, así el alumno no pierde días por pagar antes.
//  · Si ya venció o no tenía plan, empieza el día del pago.
export function suggestedStart(membership, paidOnIso) {
  const end = membership?.end;
  if (end && isISODate(end) && daysBetween(paidOnIso, end) >= 0) return addDays(end, 1);
  return paidOnIso;
}

const MAX_MONTHS = 12;

// Aplica un pago y devuelve la membresía nueva. No modifica la que recibe.
// Lanza un Error con mensaje para el usuario si algo no es válido.
export function applyPayment(membership, input, { now = new Date(), id } = {}) {
  const paidOn = input?.paidOn;
  if (!isISODate(paidOn)) throw new Error("La fecha de pago no es válida.");
  const months = Number(input?.months ?? 1);
  if (!Number.isInteger(months) || months < 1 || months > MAX_MONTHS) throw new Error(`Los meses deben ser entre 1 y ${MAX_MONTHS}.`);
  const from = input?.from ? input.from : suggestedStart(membership, paidOn);
  if (!isISODate(from)) throw new Error("La fecha de inicio no es válida.");
  const to = periodEnd(from, months);
  let amount = null;
  if (input?.amount !== undefined && input?.amount !== null && input?.amount !== "") {
    amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount < 0 || amount > 100000) throw new Error("El monto no es válido.");
    amount = Math.round(amount * 100) / 100;
  }
  const payment = {
    id: id || `p${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    paidOn, months, from, to, amount,
    method: String(input?.method || "").slice(0, 40),
    note: String(input?.note || "").slice(0, 200),
    createdAt: now.toISOString(),
  };
  const payments = [...(membership?.payments || []), payment];
  // La vigencia termina en el periodo pagado más lejano (por si se registró un pago viejo
  // después de uno nuevo, no se acorta la vigencia).
  const prevEnd = membership?.end && isISODate(membership.end) ? membership.end : null;
  const end = !prevEnd || to > prevEnd ? to : prevEnd;
  const start = end === to ? from : membership.start;
  return { ...(membership || {}), start, end, payments };
}

// Recalcula start/end a partir de los pagos que quedan (al borrar un pago registrado por error).
// Si la membresía tiene una vigencia de base (la que se dio a todos al estrenar los pagos,
// sin un pago detrás), borrar pagos nunca deja al alumno con menos que esa base.
export function recomputeFromPayments(membership) {
  const base = membership?.base && isISODate(membership.base.end) ? membership.base : null;
  const payments = (membership?.payments || []).filter((p) => isISODate(p?.from) && isISODate(p?.to));
  if (!payments.length) {
    return { ...(membership || {}), payments: [], start: base ? base.start || null : null, end: base ? base.end : null };
  }
  const last = [...payments].sort((a, b) => (a.to < b.to ? 1 : a.to > b.to ? -1 : 0))[0];
  if (base && base.end > last.to) return { ...membership, payments: membership.payments, start: base.start || null, end: base.end };
  return { ...membership, payments: membership.payments, start: last.from, end: last.to };
}

// TROTAMUNDOS estrenó los pagos con todos los alumnos que ya tenía pagados hasta el 30 de
// noviembre de 2026; desde ahí, mes a mes. Es una vigencia SIN pago registrado (no aparece
// en el historial).
export const VIGENCIA_INICIAL = "2026-11-30";
export function membresiaInicial(end = VIGENCIA_INICIAL) {
  return { start: null, end, payments: [], base: { start: null, end } };
}

// El coach puede corregir las fechas a mano (por ejemplo, para dar unos días de cortesía).
export function setDates(membership, { start, end }) {
  if (end !== null && !isISODate(end)) throw new Error("La fecha de vencimiento no es válida.");
  if (start && !isISODate(start)) throw new Error("La fecha de inicio no es válida.");
  if (start && end && start > end) throw new Error("El inicio no puede ser después del vencimiento.");
  return { ...(membership || {}), payments: membership?.payments || [], start: start || null, end: end || null };
}

export function formatDMY(iso) {
  if (!iso || !isISODate(iso)) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

const MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
export function formatShort(iso) {
  if (!iso || !isISODate(iso)) return "—";
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS_ES[m - 1]}`;
}

// Frase para mostrar al alumno o al coach.
export function describeStatus(st) {
  if (!st || st.status === "none") return "Sin plan registrado";
  const d = st.daysLeft;
  if (st.status === "vencido") return d === -1 ? "Venció ayer" : `Venció hace ${-d} días`;
  if (d === 0) return "Vence hoy";
  if (d === 1) return "Vence mañana";
  return `Vence en ${d} días`;
}
