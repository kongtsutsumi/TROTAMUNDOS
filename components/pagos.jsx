"use client";
// Vigencia del plan y pagos — las mismas piezas que Chrono Runners, con los colores de
// TROTAMUNDOS:
//   · alumno: tarjeta de vigencia (en Inicio) y pestaña Pagos con su historial;
//   · coach: panel de pagos (registrar, renovar, corregir fechas, borrar un pago mal
//     registrado) e insignia en el listado.
// Un plan vencido NO bloquea nada: solo avisa.
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Trash2, Plus, Check, Settings, ChevronDown, ChevronRight } from "lucide-react";
import { COLORS } from "../lib/plan-engine.mjs";
import { pagosOp } from "../lib/storage";
import { describeStatus, formatDMY, formatShort, suggestedStart, periodEnd, isISODate, todayIn } from "../lib/vigencia.mjs";

const OSWALD = { fontFamily: "'Oswald', sans-serif" };
const inputStyle = { background: COLORS.surface2, color: COLORS.textPrimary, border: `1px solid ${COLORS.border}` };
const card = { background: COLORS.surface, border: `1px solid ${COLORS.border}` };
const ETIQUETA = "text-[11px] font-bold uppercase tracking-[0.12em]";

export const STATUS_COLOR = {
  vigente: COLORS.easy,
  por_vencer: COLORS.moderate,
  vencido: COLORS.hard,
  none: COLORS.textMuted,
};

function iniciales(nombre = "") {
  const p = nombre.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] || "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase() || "?";
}

/* ---------------------------------------------------------------- datos */
export function useMemberships(activo = true) {
  const [data, setData] = useState({ memberships: {}, settings: null, today: null, loaded: false });
  const reload = useCallback(async () => {
    const r = await pagosOp("resumen");
    if (r.ok) setData({ memberships: r.memberships || {}, settings: r.settings, today: r.today, loaded: true });
  }, []);
  useEffect(() => { if (activo) reload(); }, [activo, reload]);
  return { ...data, reload };
}

export function statusOf(data, id) {
  const m = data?.memberships?.[id];
  return m ? m : { status: "none", daysLeft: null, end: null };
}

// Vigencia del alumno conectado (una sola petición para Inicio y Pagos).
export function useMyMembership() {
  const [d, setD] = useState(null);
  const reload = useCallback(async () => { const r = await pagosOp("mia"); if (r.ok) setD(r); }, []);
  useEffect(() => { reload(); }, [reload]);
  return { data: d, reload };
}

/* ---------------------------------------------------------------- insignia */
export function MembershipBadge({ st }) {
  const status = st?.status || "none";
  const c = STATUS_COLOR[status];
  let label;
  if (status === "none") label = "Sin plan";
  else if (status === "vencido") label = "Vencido";
  else if (status === "por_vencer") label = st.daysLeft === 0 ? "Vence hoy" : `Vence en ${st.daysLeft} d`;
  else label = `Hasta ${formatShort(st.end)}`;
  return (
    <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded whitespace-nowrap"
      title={status === "none" ? "Aún no registras un pago" : `Vigencia hasta el ${formatDMY(st.end)}`}
      style={{ background: c + "22", color: c, border: `1px solid ${c}66` }}>
      {label}
    </span>
  );
}

/* ---------------------------------------------------------------- alumno */
// Si está por vencer o venció, la tarjeta entera se pinta para que no pase desapercibida.
export function MembershipCard({ data: d, onMore }) {
  if (!d) return null;
  const st = d.status;
  const urgente = st.status === "por_vencer" || st.status === "vencido";
  const tono = STATUS_COLOR[st.status];
  return (
    <div className="rounded-2xl p-4" data-testid="tarjeta-vigencia"
      style={{ background: urgente ? tono + "1A" : COLORS.surface, border: `1px solid ${urgente ? tono + "66" : COLORS.border}`, borderLeft: urgente ? `4px solid ${tono}` : undefined }}>
      <div className="flex items-center justify-between mb-1.5">
        <span className={ETIQUETA} style={{ color: COLORS.textMuted }}>Vigencia de tu plan</span>
        {!urgente && st.status !== "none" && <MembershipBadge st={st} />}
      </div>
      {st.status === "none" ? (
        <div className="text-base font-semibold" style={{ color: COLORS.textPrimary }}>Tu coach todavía no registra tu pago.</div>
      ) : (
        <>
          <div className="text-xl font-bold uppercase leading-tight" style={{ ...OSWALD, color: urgente ? tono : COLORS.textPrimary }}>
            {st.status === "vencido" ? "Plan vencido" : st.status === "por_vencer" ? describeStatus(st) : `Hasta el ${formatShort(st.end)}`}
          </div>
          <div className="text-sm mt-0.5" style={{ color: COLORS.textMuted }}>
            {st.status === "vencido" ? `Venció el ${formatDMY(st.end)} · ${describeStatus(st).toLowerCase()}` : `Vigente hasta el ${formatDMY(st.end)}`}
          </div>
        </>
      )}
      {urgente && (
        <p className="text-sm mt-3 font-medium" style={{ color: COLORS.textPrimary }}>
          {st.status === "vencido" ? "Renueva tu mensualidad con tu coach." : "Coordina tu pago con tu coach para no cortar tu plan."}
          {d.settings?.monthlyFee ? ` Mensualidad: S/ ${d.settings.monthlyFee}.` : ""}
        </p>
      )}
      {onMore && (
        <button onClick={onMore} className="mt-3 text-sm font-semibold inline-flex items-center gap-0.5" style={{ color: COLORS.track }}>
          Ver mis pagos <ChevronRight size={15} />
        </button>
      )}
    </div>
  );
}

// Pestaña "Pagos" del alumno: vigencia e historial.
export function PagosAlumno({ data: d }) {
  if (!d) return <p className="text-sm" style={{ color: COLORS.textMuted }}>Cargando…</p>;
  const pagos = [...(d.membership?.payments || [])].reverse();
  return (
    <div className="space-y-3" data-testid="pagos-alumno">
      <MembershipCard data={d} />
      {d.membership?.start && (
        <div className="rounded-2xl p-4" style={card}>
          <div className={`${ETIQUETA} mb-2`} style={{ color: COLORS.textMuted }}>Periodo actual</div>
          <div className="flex items-center justify-between text-sm" style={{ color: COLORS.textPrimary }}>
            <span>Desde <strong>{formatDMY(d.membership.start)}</strong></span>
            <span>hasta <strong>{formatDMY(d.membership.end)}</strong></span>
          </div>
        </div>
      )}
      <div className="rounded-2xl p-4" style={card}>
        <div className={`${ETIQUETA} mb-2`} style={{ color: COLORS.textMuted }}>Mis pagos</div>
        {pagos.length === 0 && <p className="text-sm" style={{ color: COLORS.textMuted }}>Todavía no hay pagos registrados.</p>}
        <div>
          {pagos.map((p, i) => (
            <div key={p.id} className="py-2.5 flex items-center justify-between gap-3" style={{ borderTop: i ? `1px solid ${COLORS.border}` : "none" }}>
              <div>
                <div className="text-sm font-semibold" style={{ color: COLORS.textPrimary }}>{p.months} {p.months === 1 ? "mes" : "meses"}</div>
                <div className="text-xs" style={{ color: COLORS.textMuted }}>{formatDMY(p.from)} – {formatDMY(p.to)} · pagado el {formatDMY(p.paidOn)}</div>
              </div>
              {p.amount != null && <div className="text-sm font-semibold whitespace-nowrap" style={{ color: COLORS.textPrimary }}>S/ {p.amount}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- coach */
const MEDIOS = ["Yape", "Plin", "Transferencia", "Efectivo", "Otro"];
const ORDEN = { vencido: 0, por_vencer: 1, none: 2, vigente: 3 };

function FormularioPago({ alumno, actual, ajustes, hoy, onListo, onCancelar }) {
  const [paidOn, setPaidOn] = useState(hoy);
  const [months, setMonths] = useState(1);
  const [amount, setAmount] = useState(ajustes?.monthlyFee != null ? String(ajustes.monthlyFee) : "");
  const [method, setMethod] = useState("Yape");
  const [note, setNote] = useState("");
  const [otroInicio, setOtroInicio] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const auto = isISODate(paidOn) ? suggestedStart(actual, paidOn) : null;
  const from = otroInicio || auto;
  const to = from && isISODate(from) ? periodEnd(from, months) : null;
  useEffect(() => { if (ajustes?.monthlyFee != null) setAmount(String(Math.round(ajustes.monthlyFee * months * 100) / 100)); }, [months, ajustes?.monthlyFee]);
  const registrar = async () => {
    setOcupado(true); setError("");
    const r = await pagosOp("pagar", { studentId: alumno.id, payment: { paidOn, months, amount, method, note, from: otroInicio || undefined } });
    setOcupado(false);
    if (!r.ok) return setError(r.error);
    onListo(r);
  };
  return (
    <div className="mt-3 rounded-xl p-3 space-y-2" style={card}>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px]" style={{ color: COLORS.textMuted }}>Fecha de pago
          <input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} className="w-full mt-0.5 rounded-lg px-3 py-2 text-sm" style={inputStyle} />
        </label>
        <label className="text-[11px]" style={{ color: COLORS.textMuted }}>Meses
          <select value={months} onChange={(e) => setMonths(Number(e.target.value))} className="w-full mt-0.5 rounded-lg px-3 py-2 text-sm" style={inputStyle}>
            {[1, 2, 3, 4, 5, 6, 12].map((n) => <option key={n} value={n}>{n} {n === 1 ? "mes" : "meses"}</option>)}
          </select>
        </label>
        <label className="text-[11px]" style={{ color: COLORS.textMuted }}>Monto (S/)
          <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full mt-0.5 rounded-lg px-3 py-2 text-sm" style={inputStyle} />
        </label>
        <label className="text-[11px]" style={{ color: COLORS.textMuted }}>Medio
          <select value={method} onChange={(e) => setMethod(e.target.value)} className="w-full mt-0.5 rounded-lg px-3 py-2 text-sm" style={inputStyle}>
            {MEDIOS.map((m) => <option key={m}>{m}</option>)}
          </select>
        </label>
      </div>
      <input type="text" placeholder="Nota (opcional)" value={note} onChange={(e) => setNote(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={inputStyle} />
      <div className="text-xs" style={{ color: COLORS.textPrimary }}>
        {to ? <>Cubre del <strong>{formatDMY(from)}</strong> al <strong>{formatDMY(to)}</strong></> : "Revisa las fechas"}
        {!otroInicio && actual?.end && auto && auto !== paidOn && <span style={{ color: COLORS.textMuted }}> · sigue al vencimiento anterior, no pierde días</span>}
      </div>
      <label className="text-[11px] block" style={{ color: COLORS.textMuted }}>Empezar otro día (opcional)
        <input type="date" value={otroInicio} onChange={(e) => setOtroInicio(e.target.value)} className="w-full mt-0.5 rounded-lg px-3 py-2 text-sm" style={inputStyle} />
      </label>
      {error && <p className="text-xs" style={{ color: COLORS.hard }}>{error}</p>}
      <div className="flex gap-2">
        <button onClick={registrar} disabled={ocupado || !to} className="px-4 py-2 rounded-xl text-sm font-bold" style={{ background: COLORS.track, color: COLORS.lane, opacity: ocupado ? 0.6 : 1 }}>
          {ocupado ? "Guardando…" : "Registrar pago"}
        </button>
        <button onClick={onCancelar} className="px-4 py-2 rounded-xl text-sm" style={{ color: COLORS.textMuted }}>Cancelar</button>
      </div>
    </div>
  );
}

function FormularioFechas({ alumno, actual, onListo, onCancelar }) {
  const [start, setStart] = useState(actual?.start || "");
  const [end, setEnd] = useState(actual?.end || "");
  const [error, setError] = useState("");
  const guardar = async () => {
    const r = await pagosOp("fechas", { studentId: alumno.id, start: start || null, end: end || null });
    if (!r.ok) return setError(r.error);
    onListo(r);
  };
  return (
    <div className="mt-3 rounded-xl p-3 space-y-2" style={card}>
      <p className="text-[11px]" style={{ color: COLORS.textMuted }}>Corrige el periodo a mano (por ejemplo, para dar días de cortesía). No crea un pago.</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px]" style={{ color: COLORS.textMuted }}>Inicio
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="w-full mt-0.5 rounded-lg px-3 py-2 text-sm" style={inputStyle} />
        </label>
        <label className="text-[11px]" style={{ color: COLORS.textMuted }}>Vence
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="w-full mt-0.5 rounded-lg px-3 py-2 text-sm" style={inputStyle} />
        </label>
      </div>
      {error && <p className="text-xs" style={{ color: COLORS.hard }}>{error}</p>}
      <div className="flex gap-2">
        <button onClick={guardar} className="px-4 py-2 rounded-xl text-sm font-bold" style={{ background: COLORS.track, color: COLORS.lane }}>Guardar fechas</button>
        <button onClick={onCancelar} className="px-4 py-2 rounded-xl text-sm" style={{ color: COLORS.textMuted }}>Cancelar</button>
      </div>
    </div>
  );
}

function FormularioAjustes({ ajustes, onGuardado, onCancelar }) {
  const [v, setV] = useState({ warnDays: ajustes?.warnDays ?? 7, monthlyFee: ajustes?.monthlyFee ?? "" });
  const [error, setError] = useState("");
  const guardar = async () => {
    const r = await pagosOp("ajustes", { settings: v });
    if (!r.ok) return setError(r.error);
    onGuardado(r.settings);
  };
  return (
    <div className="rounded-2xl p-4 mb-4 space-y-2" style={card}>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px]" style={{ color: COLORS.textMuted }}>Avisar con (días)
          <input type="number" min="0" max="30" value={v.warnDays} onChange={(e) => setV({ ...v, warnDays: e.target.value })} className="w-full mt-0.5 rounded-lg px-3 py-2 text-sm" style={inputStyle} />
        </label>
        <label className="text-[11px]" style={{ color: COLORS.textMuted }}>Mensualidad (S/)
          <input type="number" min="0" step="0.01" value={v.monthlyFee} onChange={(e) => setV({ ...v, monthlyFee: e.target.value })} className="w-full mt-0.5 rounded-lg px-3 py-2 text-sm" style={inputStyle} />
        </label>
      </div>
      <p className="text-[11px]" style={{ color: COLORS.textMuted }}>La mensualidad se usa para llenar el monto al registrar un pago.</p>
      {error && <p className="text-xs" style={{ color: COLORS.hard }}>{error}</p>}
      <div className="flex gap-2">
        <button onClick={guardar} className="px-4 py-2 rounded-xl text-sm font-bold" style={{ background: COLORS.track, color: COLORS.lane }}>Guardar ajustes</button>
        <button onClick={onCancelar} className="px-4 py-2 rounded-xl text-sm" style={{ color: COLORS.textMuted }}>Cancelar</button>
      </div>
    </div>
  );
}

// Panel del coach: todos los alumnos con su vigencia, del más urgente al menos urgente.
export function CobrosPanel({ roster, data, reload }) {
  const [filtro, setFiltro] = useState("todos");
  const [abierto, setAbierto] = useState(null);
  const [modo, setModo] = useState(null);       // "pagar" | "fechas" | null
  const [verAjustes, setVerAjustes] = useState(false);
  const [confirmarBorrar, setConfirmarBorrar] = useState(null);
  const [aviso, setAviso] = useState("");
  const filas = useMemo(() => roster.map((r) => ({ r, st: statusOf(data, r.id) }))
    .sort((a, b) => (ORDEN[a.st.status] - ORDEN[b.st.status]) || ((a.st.daysLeft ?? 9999) - (b.st.daysLeft ?? 9999)) || a.r.name.localeCompare(b.r.name, "es")), [roster, data]);
  const cuenta = filas.reduce((acc, x) => { acc[x.st.status] = (acc[x.st.status] || 0) + 1; return acc; }, {});
  const visibles = filtro === "todos" ? filas : filas.filter((x) => x.st.status === filtro);
  const listo = async (msg) => { setModo(null); setAviso(msg); await reload(); setTimeout(() => setAviso(""), 2500); };
  const cuadros = [
    ["por_vencer", "Por vencer"],
    ["vencido", "Vencidos"],
    ["vigente", "Vigentes"],
    ["none", "Sin plan"],
  ];
  return (
    <div data-testid="panel-pagos">
      <div className="flex items-center gap-2 mb-1">
        <div className="text-sm font-semibold flex-1" style={{ ...OSWALD, color: COLORS.textPrimary }}>PAGOS</div>
        <button onClick={() => setVerAjustes((v) => !v)} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full"
          style={{ background: verAjustes ? COLORS.track : COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
          <Settings size={13} /> Ajustes
        </button>
      </div>
      <p className="text-xs mb-3" style={{ color: COLORS.textMuted }}>Plan mensual · se avisa {data?.settings?.warnDays ?? 7} días antes de vencer · un plan vencido solo avisa, no bloquea.</p>
      {verAjustes && <FormularioAjustes ajustes={data?.settings} onCancelar={() => setVerAjustes(false)} onGuardado={async () => { setVerAjustes(false); await reload(); }} />}
      <div className="grid grid-cols-4 gap-2 mb-3">
        {cuadros.map(([id, etiqueta]) => {
          const on = filtro === id;
          const c = STATUS_COLOR[id];
          return (
            <button key={id} onClick={() => setFiltro(on ? "todos" : id)} className="rounded-xl px-1 py-2.5 text-center"
              style={{ background: on ? c + "33" : COLORS.surface, border: `1px solid ${on ? c : COLORS.border}` }}>
              <div className="text-xl font-bold leading-none" style={{ ...OSWALD, color: c }}>{cuenta[id] || 0}</div>
              <div className="text-[11px] font-semibold mt-1" style={{ color: on ? COLORS.textPrimary : COLORS.textMuted }}>{etiqueta}</div>
            </button>
          );
        })}
      </div>
      {filtro !== "todos" && (
        <button onClick={() => setFiltro("todos")} className="text-sm font-semibold mb-2" style={{ color: COLORS.track }}>Ver todos ({filas.length})</button>
      )}
      {aviso && <div className="text-sm mb-2 flex items-center gap-1 font-semibold" style={{ color: COLORS.easy }}><Check size={14} /> {aviso}</div>}
      <div className="rounded-xl overflow-hidden" style={card}>
        {visibles.length === 0 && <p className="text-sm p-4" style={{ color: COLORS.textMuted }}>No hay alumnos en este grupo.</p>}
        {visibles.map(({ r, st }, idx) => {
          const m = data?.memberships?.[r.id];
          const estaAbierto = abierto === r.id;
          const ultimo = (m?.payments || []).slice(-1)[0];
          const c = STATUS_COLOR[st.status];
          return (
            <div key={r.id} data-testid="fila-pago" data-name={r.name} style={{ borderTop: idx ? `1px solid ${COLORS.border}` : "none", background: estaAbierto ? COLORS.surface2 : COLORS.surface }}>
              <button onClick={() => { setAbierto(estaAbierto ? null : r.id); setModo(null); }} className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left">
                <span className="relative inline-flex items-center justify-center rounded-full font-bold shrink-0 text-xs"
                  style={{ width: 36, height: 36, background: COLORS.surface2, color: COLORS.textPrimary, border: `1px solid ${COLORS.border}` }}>
                  {iniciales(r.name)}
                  <span className="absolute -bottom-0.5 -right-0.5 rounded-full" style={{ width: 12, height: 12, background: c, border: `2px solid ${COLORS.surface}` }} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold truncate" style={{ color: COLORS.textPrimary }}>{r.name}</span>
                  <span className="block text-xs" style={{ color: st.status === "vigente" || st.status === "none" ? COLORS.textMuted : c }}>
                    {st.end ? `${describeStatus(st)} · ${formatDMY(st.end)}` : "Sin pagos registrados"}
                  </span>
                </span>
                <MembershipBadge st={st} />
                {estaAbierto ? <ChevronDown size={16} style={{ color: COLORS.textMuted }} /> : <ChevronRight size={16} style={{ color: COLORS.textMuted }} />}
              </button>
              {estaAbierto && (
                <div className="px-4 pb-4 text-xs" style={{ color: COLORS.textMuted }}>
                  {m?.end && <div>Periodo actual: {m.start ? `${formatDMY(m.start)} – ` : "hasta el "}{formatDMY(m.end)}</div>}
                  {ultimo ? <div>Último pago: {formatDMY(ultimo.paidOn)}{ultimo.amount != null ? ` · S/ ${ultimo.amount}` : ""}{ultimo.method ? ` · ${ultimo.method}` : ""}</div>
                    : m?.base && <div>Vigencia inicial, sin pago registrado.</div>}
                  {modo !== "pagar" && (
                    <div className="flex gap-2 mt-3">
                      <button onClick={() => setModo("pagar")} className="flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5" style={{ background: COLORS.track, color: COLORS.lane }}>
                        <Plus size={15} /> {st.status === "none" ? "Registrar pago" : "Renovar"}
                      </button>
                      <button onClick={() => setModo(modo === "fechas" ? null : "fechas")} className="px-3 py-2.5 rounded-xl text-sm font-semibold" style={{ background: COLORS.surface, color: COLORS.textPrimary, border: `1px solid ${COLORS.border}` }}>
                        Corregir fechas
                      </button>
                    </div>
                  )}
                  {modo === "pagar" && <FormularioPago alumno={r} actual={m} ajustes={data?.settings} hoy={data?.today || todayIn()} onCancelar={() => setModo(null)} onListo={(res) => listo(`${r.name}: pagado hasta el ${formatDMY(res.membership.end)}`)} />}
                  {modo === "fechas" && <FormularioFechas alumno={r} actual={m} onCancelar={() => setModo(null)} onListo={() => listo("Fechas actualizadas")} />}
                  {(m?.payments || []).length > 0 && (
                    <div className="mt-3">
                      <div className="font-semibold mb-1" style={{ color: COLORS.textPrimary }}>Historial de pagos</div>
                      <div className="space-y-1">
                        {[...m.payments].reverse().map((p) => (
                          <div key={p.id} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5" style={card}>
                            <span className="flex-1">{formatDMY(p.paidOn)} · {p.months} {p.months === 1 ? "mes" : "meses"} ({formatDMY(p.from)} – {formatDMY(p.to)}){p.amount != null ? ` · S/ ${p.amount}` : ""}{p.method ? ` · ${p.method}` : ""}{p.note ? ` · ${p.note}` : ""}</span>
                            {confirmarBorrar === p.id ? (
                              <>
                                <button onClick={async () => { const res = await pagosOp("borrarPago", { studentId: r.id, paymentId: p.id }); setConfirmarBorrar(null); if (res.ok) listo("Pago eliminado"); }} className="font-semibold" style={{ color: COLORS.hard }}>Borrar</button>
                                <button onClick={() => setConfirmarBorrar(null)}>No</button>
                              </>
                            ) : (
                              <button onClick={() => setConfirmarBorrar(p.id)} title="Borrar un pago registrado por error" aria-label="Borrar pago"><Trash2 size={13} /></button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
