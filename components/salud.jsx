"use client";
// Salud del reloj, para el alumno (pestaña Salud y resumen en Inicio) y para el coach (botón
// Salud de cada alumno, y el punto de color en la lista).
//
// Todo se calcula con lib/recuperacion.mjs a partir de las filas que devuelve /api/salud:
// cada dato se compara con el normal del propio alumno (sus 28 días anteriores). Cada número
// del resumen es un botón que abre su historial, para que se vea de dónde sale.
//
// Es solo para el entrenamiento: las pantallas lo dicen, y dicen de qué marca son los datos.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Gauge, Moon, HeartPulse, Heart, ChevronRight, ChevronLeft, Watch, Info, TrendingUp, BarChart3, Wind, Target } from "lucide-react";
import { rendimiento as calcularRendimiento, ritmoTexto, tiempoTexto, MARGEN_CALIDAD } from "../lib/rendimiento.mjs";
import { COLORS } from "../lib/plan-engine.mjs";
import { saludOp } from "../lib/storage";
import {
  porDia, evaluarDia, historial, ultimoDiaConDatos, sesionesPorFecha, kmPorSemana, lecturaDeLaSemana,
  horasTexto, BANDAS, TIPOS_DE_SESION, DIAS_DE_LINEA,
} from "../lib/recuperacion.mjs";

const OSWALD = { fontFamily: "'Oswald', sans-serif" };

// La frase del día, contada al coach ("Durmió…, su VFC…").
const enTercera = (f) => f
  .replace(/^Dormiste/, "Durmió").replace(/\btu (VFC|frecuencia|normal|coach)/g, "su $1").replace(/\btus\b/g, "sus")
  .replace("Tu cuerpo está recuperado: entrena como está planeado.", "Está recuperado: puede entrenar como está planeado.")
  .replace("Si hoy toca calidad, empieza suave y cuéntale a su coach cómo te sientes.", "Si hoy toca calidad, conviene empezar suave y preguntarle cómo se siente.")
  .replace("Cuéntaselo a su coach antes de hacer una sesión fuerte.", "Conviene revisar con él la sesión fuerte de hoy.");
const TONO = { bien: COLORS.easy, atento: COLORS.moderate, alerta: COLORS.hard };
const colorDe = (tono) => TONO[tono] || COLORS.textMuted;
const COLOR_SESION = { suave: COLORS.easy, calidad: COLORS.track, fondo: COLORS.moderate };
const MARCA = { garmin: "Garmin", coros: "COROS", intervals: "intervals.icu" };

const DIAS_CORTOS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const diaCorto = (iso) => DIAS_CORTOS[new Date(`${iso}T12:00:00`).getDay()];
const fechaLarga = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString("es-PE", { weekday: "short", day: "numeric", month: "short" });
const fechaCorta = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString("es-PE", { day: "numeric", month: "short" });

// Lo que mide cada dato y cómo se lee. Sirve para el resumen y para su historial.
const DATOS = {
  sueño: {
    titulo: "Sueño", Icono: Moon, unidad: "", formato: (v) => horasTexto(v),
    explica: "Mientras duermes se reparan los músculos y se asimila el entrenamiento. Por debajo de 6 horas seguidas, rindes menos en las sesiones de calidad.",
  },
  vfc: {
    titulo: "VFC", Icono: HeartPulse, unidad: "ms", formato: (v) => `${Math.round(v)}`,
    nombreLargo: "Variabilidad de la frecuencia cardíaca",
    explica: "Mide cuánto varía el tiempo entre latidos mientras duermes. Más alta suele significar más recuperado. Lo que importa es compararla con la tuya, no con la de otros.",
  },
  fcReposo: {
    titulo: "FC en reposo", Icono: Heart, unidad: "ppm", formato: (v) => `${Math.round(v)}`,
    nombreLargo: "Frecuencia cardíaca en reposo",
    explica: "Tus pulsaciones en reposo. Si suben varios días seguidos puede ser cansancio acumulado, estrés o el inicio de un resfrío.",
  },
};

/* ---------------------------------------------------------------------------
   DATOS
--------------------------------------------------------------------------- */

export function useSalud(studentId) {
  const [r, setR] = useState(null);
  const cargar = useCallback(async () => {
    if (!studentId) return;
    setR(await saludOp("leer", studentId));
  }, [studentId]);
  useEffect(() => { cargar(); }, [cargar]);
  return { salud: r, recargar: cargar };
}

// Todo lo que muestran las pantallas, calculado una vez.
function useCalculo(salud, student) {
  return useMemo(() => {
    if (!salud?.ok || salud.estado !== "ok") return null;
    const dias = porDia(salud.filas);
    const hoy = salud.hoy;
    const fecha = ultimoDiaConDatos(dias, hoy);
    const sesiones = sesionesPorFecha(student);
    const hist = historial(dias, hoy, DIAS_DE_LINEA);
    return {
      dias, hoy, fecha, sesiones, hist,
      dia: fecha ? evaluarDia(dias, fecha) : null,
      semana: hist.slice(-7),
      lectura: lecturaDeLaSemana(hist.slice(-7), sesiones),
      km: kmPorSemana(sesiones, hoy, 4),
    };
  }, [salud, student]);
}

/* ---------------------------------------------------------------------------
   PIEZAS
--------------------------------------------------------------------------- */

const Tarjeta = ({ children, style, ...p }) => (
  <div className="rounded-2xl p-4" style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, ...style }} {...p}>{children}</div>
);
const Etiqueta = ({ children }) => (
  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] mb-2" style={{ color: COLORS.textMuted }}>{children}</div>
);
const Chip = ({ tono, children }) => (
  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
    style={{ background: colorDe(tono) + "22", color: colorDe(tono) }}>
    <span className="w-1.5 h-1.5 rounded-full" style={{ background: colorDe(tono) }} />{children}
  </span>
);

function Aviso({ marca, dispositivo, tercero }) {
  const fuente = MARCA[marca] ? `Datos de ${MARCA[marca]}${dispositivo ? ` · ${dispositivo}` : ""}` : "Datos de tu reloj";
  return (
    <p className="text-[11px] text-center leading-relaxed px-2" style={{ color: COLORS.textMuted }}>
      {fuente}. Solo para {tercero ? "su" : "tu"} entrenamiento y rendimiento: no es un diagnóstico ni consejo médico.
    </p>
  );
}

// El anillo del puntaje.
function Anillo({ puntaje, tono, tamaño = 150 }) {
  const r = 42, c = 2 * Math.PI * r;
  const frac = puntaje == null ? 0 : Math.max(0, Math.min(100, puntaje)) / 100;
  return (
    <svg width={tamaño} height={tamaño} viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r={r} fill="none" stroke={COLORS.surface2} strokeWidth="8" />
      <circle cx="50" cy="50" r={r} fill="none" stroke={colorDe(tono)} strokeWidth="8" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - frac)} transform="rotate(-90 50 50)" />
      <text x="50" y="48" textAnchor="middle" dominantBaseline="middle" style={{ ...OSWALD, fontSize: 30, fontWeight: 500 }} fill={COLORS.textPrimary}>
        {puntaje ?? "—"}
      </text>
      {tamaño >= 100 && <text x="50" y="71" textAnchor="middle" style={{ fontSize: 8 }} fill={COLORS.textMuted}>de 100</text>}
    </svg>
  );
}

// "en tu normal" / "25 min más que tu normal"… (para el coach: "su normal").
function comparacion(clave, d, tercero = false) {
  const c = comparacionBase(clave, d);
  return tercero ? { ...c, texto: c.texto.replace(/\btu\b/gi, (m) => (m[0] === "T" ? "Su" : "su")) } : c;
}
function comparacionBase(clave, d) {
  if (d.valor == null) return { texto: "Sin dato de este día", tono: null };
  if (d.media == null) return { texto: `Conociendo tu normal (${d.n || 0} de 5 días)`, tono: null };
  const dif = d.valor - d.media;
  if (clave === "sueño") {
    const m = Math.round(Math.abs(dif));
    if (m < 15) return { texto: "En tu promedio", tono: d.tono };
    return { texto: `${horasTexto(m).replace(/^0 h /, "")}${m < 60 ? " min" : ""} ${dif > 0 ? "más" : "menos"} que tu promedio`, tono: d.tono };
  }
  const u = DATOS[clave].unidad;
  const enRango = d.valor >= d.rango[0] && d.valor <= d.rango[1];
  if (enRango) return { texto: `En tu normal (${Math.round(d.rango[0])}–${Math.round(d.rango[1])} ${u})`, tono: d.tono };
  return { texto: `${Math.abs(Math.round(dif))} ${u} ${dif > 0 ? "sobre" : "bajo"} tu normal`, tono: d.tono };
}

/* ---------------------------------------------------------------------------
   GRÁFICOS (SVG simples, de ancho flexible)
--------------------------------------------------------------------------- */

// Una línea con la banda del normal de cada día. puntos: [{ fecha, valor, rango }]
function GraficoLinea({ puntos, alto = 150, formato = (v) => Math.round(v), sesiones = null, colorPunto }) {
  const W = 320, H = alto, pad = { l: 28, r: 8, t: 10, b: sesiones ? 40 : 22 };
  const vals = puntos.flatMap((p) => [p.valor, ...(p.rango || [])]).filter((v) => v != null);
  if (vals.length < 2) return <p className="text-xs py-6 text-center" style={{ color: COLORS.textMuted }}>Todavía no hay suficientes días para el gráfico.</p>;
  let min = Math.min(...vals), max = Math.max(...vals);
  const m = (max - min) * 0.15 || 1; min -= m; max += m;
  const x = (i) => pad.l + (i * (W - pad.l - pad.r)) / Math.max(1, puntos.length - 1);
  const y = (v) => pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b);
  const banda = puntos.map((p, i) => (p.rango ? [x(i), y(p.rango[1]), y(p.rango[0])] : null)).filter(Boolean);
  const bandaPath = banda.length > 1
    ? `M${banda.map(([a, b]) => `${a},${b}`).join(" L")} L${[...banda].reverse().map(([a, , c]) => `${a},${c}`).join(" L")} Z`
    : null;
  const tramos = [];
  let actual = [];
  puntos.forEach((p, i) => { if (p.valor == null) { if (actual.length) tramos.push(actual); actual = []; } else actual.push(`${x(i)},${y(p.valor)}`); });
  if (actual.length) tramos.push(actual);
  const cadaCuanto = puntos.length > 10 ? 7 : 1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" style={{ display: "block" }}>
      {bandaPath && <path d={bandaPath} fill={COLORS.easy + "26"} />}
      {[min + m, max - m].map((v, i) => (
        <text key={i} x={pad.l - 4} y={y(v) + 3} textAnchor="end" style={{ fontSize: 8 }} fill={COLORS.textMuted}>{formato(v)}</text>
      ))}
      {tramos.map((t, i) => <polyline key={i} points={t.join(" ")} fill="none" stroke={COLORS.textPrimary} strokeWidth="1.8" strokeLinejoin="round" />)}
      {puntos.map((p, i) => p.valor != null && (
        <circle key={p.fecha} cx={x(i)} cy={y(p.valor)} r={puntos.length > 10 ? 2.2 : 3.2} fill={colorPunto ? colorPunto(p) : COLORS.textPrimary} />
      ))}
      {sesiones && puntos.map((p, i) => {
        const s = sesiones[p.fecha];
        if (!s) return null;
        const h = s.tipo === "suave" ? 7 : s.tipo === "calidad" ? 11 : 14;
        const w = puntos.length > 10 ? 7 : 12;
        return <rect key={`s${i}`} x={x(i) - w / 2} y={H - 22 - h} width={w} height={h} rx="2" fill={COLOR_SESION[s.tipo]} opacity={s.hecho ? 1 : 0.35} />;
      })}
      {puntos.map((p, i) => (i % cadaCuanto === (puntos.length - 1) % cadaCuanto) && (
        <text key={`t${i}`} x={x(i)} y={H - 6} textAnchor={i === puntos.length - 1 ? "end" : "middle"} style={{ fontSize: 8 }} fill={COLORS.textMuted}>
          {puntos.length > 10 ? fechaCorta(p.fecha) : diaCorto(p.fecha)}
        </text>
      ))}
    </svg>
  );
}

// Barras (sueño en horas, o el puntaje del día). puntos: [{ fecha, valor, color }]
// minimo: dónde empiezan las barras (para ver diferencias chicas, como el VDOT).
// semanal: rotula cada barra con la fecha del lunes y su valor.
function GraficoBarras({ puntos, alto = 120, referencia = null, formato = (v) => v, maximo = null, minimo = 0, semanal = false }) {
  const W = 320, H = alto, pad = { l: 26, r: 6, t: 10, b: 18 };
  const vals = puntos.map((p) => p.valor).filter((v) => v != null);
  if (!vals.length) return <p className="text-xs py-6 text-center" style={{ color: COLORS.textMuted }}>Todavía no hay datos.</p>;
  const max = maximo ?? Math.max(...vals, referencia || 0) * 1.1;
  const ancho = (W - pad.l - pad.r) / puntos.length;
  const y = (v) => pad.t + (1 - (Math.max(v, minimo) - minimo) / (max - minimo || 1)) * (H - pad.t - pad.b);
  const cadaCuanto = puntos.length > 10 ? 7 : 1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" style={{ display: "block" }}>
      {referencia != null && (
        <>
          <line x1={pad.l} x2={W - pad.r} y1={y(referencia)} y2={y(referencia)} stroke={COLORS.textMuted} strokeDasharray="3 3" strokeWidth="0.8" />
          <text x={pad.l - 4} y={y(referencia) + 3} textAnchor="end" style={{ fontSize: 8 }} fill={COLORS.textMuted}>{formato(referencia)}</text>
        </>
      )}
      {puntos.map((p, i) => p.valor != null && (
        <rect key={p.fecha} x={pad.l + i * ancho + ancho * 0.18} y={y(p.valor)} width={ancho * 0.64} height={H - pad.b - y(p.valor)} rx={Math.min(3, ancho * 0.2)} fill={p.color || COLORS.easy} />
      ))}
      {puntos.map((p, i) => (i % cadaCuanto === (puntos.length - 1) % cadaCuanto) && (
        <text key={`t${i}`} x={pad.l + i * ancho + ancho / 2} y={H - 5} textAnchor="middle" style={{ fontSize: 8 }} fill={COLORS.textMuted}>
          {puntos.length > 10 || semanal ? fechaCorta(p.fecha) : diaCorto(p.fecha)}
        </text>
      ))}
      {puntos.map((p, i) => semanal && p.valor != null && (
        <text key={`v${i}`} x={pad.l + i * ancho + ancho / 2} y={y(p.valor) - 3} textAnchor="middle" style={{ fontSize: 8 }} fill={COLORS.textPrimary}>{formato(p.valor)}</text>
      ))}
    </svg>
  );
}

function LeyendaSesiones() {
  return (
    <div className="flex flex-wrap gap-3 text-[11px] mt-2" style={{ color: COLORS.textMuted }}>
      {Object.entries(TIPOS_DE_SESION).map(([k, t]) => (
        <span key={k} className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: COLOR_SESION[k] }} />{t}</span>
      ))}
      <span>· más claro: no se hizo</span>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   RESUMEN DEL DÍA (semáforo + tres datos), cada uno es un botón
--------------------------------------------------------------------------- */

function Semaforo({ dia, onClick, tercero }) {
  return (
    <button type="button" onClick={onClick} className="w-full text-left" data-testid="salud-puntaje">
      <Tarjeta>
        <div className="flex items-center justify-between mb-1">
          <Etiqueta><span className="inline-flex items-center gap-1.5"><Gauge size={13} /> Recuperación · {fechaLarga(dia.fecha)}</span></Etiqueta>
          <ChevronRight size={16} style={{ color: COLORS.textMuted }} />
        </div>
        <div className="flex flex-col items-center text-center">
          <Anillo puntaje={dia.puntaje} tono={dia.tono} />
          {dia.banda ? <Chip tono={dia.tono}>{dia.titulo}</Chip> : (
            <span className="text-sm" style={{ color: COLORS.textMuted }}>
              {dia.aprendiendo ? `Estamos conociendo tu normal: faltan ${dia.faltan} día${dia.faltan === 1 ? "" : "s"} de datos.` : "Faltan datos de este día."}
            </span>
          )}
          {dia.frase && (
            <p className="text-sm leading-relaxed mt-3" style={{ color: COLORS.textMuted }}>
              {tercero ? enTercera(dia.frase) : dia.frase}
            </p>
          )}
        </div>
      </Tarjeta>
    </button>
  );
}

function TarjetaDato({ clave, d, onClick, tercero }) {
  const { titulo, Icono, unidad, formato } = DATOS[clave];
  const c = comparacion(clave, d, tercero);
  return (
    <button type="button" onClick={onClick} className="w-full text-left" data-testid={`salud-${clave}`}>
      <Tarjeta style={{ padding: "14px 16px" }}>
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center rounded-xl shrink-0" style={{ width: 38, height: 38, background: COLORS.surface2, color: colorDe(d.tono) }}>
            <Icono size={18} strokeWidth={2} />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium" style={{ color: COLORS.textPrimary }}>{titulo}</div>
            <div className="text-xs truncate" style={{ color: c.tono ? colorDe(c.tono) : COLORS.textMuted }}>{c.texto}</div>
          </div>
          <div className="text-right shrink-0">
            <span className="text-2xl" style={{ ...OSWALD, color: COLORS.textPrimary }}>{d.valor == null ? "—" : formato(d.valor)}</span>
            {unidad && d.valor != null && <span className="text-xs ml-1" style={{ color: COLORS.textMuted }}>{unidad}</span>}
          </div>
          <ChevronRight size={16} style={{ color: COLORS.textMuted }} />
        </div>
      </Tarjeta>
    </button>
  );
}

function LaSemana({ calc }) {
  const puntos = calc.semana.map((e) => ({ fecha: e.fecha, valor: e.datos.vfc.valor, rango: e.datos.vfc.rango }));
  const sueño = calc.semana.map((e) => ({ fecha: e.fecha, valor: e.datos.sueño.valor != null ? e.datos.sueño.valor / 60 : null, color: e.datos.sueño.valor != null && e.datos.sueño.valor < 420 ? COLORS.moderate : COLORS.easy }));
  const prom = sueño.filter((p) => p.valor != null);
  return (
    <>
      <Tarjeta>
        <Etiqueta>Tu semana: VFC y entrenamientos</Etiqueta>
        <GraficoLinea puntos={puntos} sesiones={calc.sesiones} alto={170} />
        <div className="flex items-center gap-1.5 text-[11px] mt-1" style={{ color: COLORS.textMuted }}>
          <span className="w-3 h-2.5 rounded-sm" style={{ background: COLORS.easy + "40" }} /> tu normal
        </div>
        <LeyendaSesiones />
      </Tarjeta>
      {calc.lectura && (
        <Tarjeta style={{ borderColor: COLORS.easy + "66" }}>
          <div className="flex gap-2.5">
            <Info size={16} className="shrink-0 mt-0.5" style={{ color: COLORS.easy }} />
            <p className="text-sm leading-relaxed" style={{ color: COLORS.textPrimary }}>{calc.lectura}</p>
          </div>
        </Tarjeta>
      )}
      <Tarjeta>
        <Etiqueta>Sueño por noche</Etiqueta>
        <GraficoBarras puntos={sueño} referencia={7.5} formato={(v) => `${v} h`} alto={110} />
        {prom.length > 0 && (
          <p className="text-xs mt-1" style={{ color: COLORS.textMuted }}>
            Promedio {horasTexto((prom.reduce((a, p) => a + p.valor, 0) / prom.length) * 60)} · la línea marca 7 h 30
          </p>
        )}
      </Tarjeta>
    </>
  );
}

/* ---------------------------------------------------------------------------
   HISTORIAL DE CADA DATO (lo que respalda el resumen)
--------------------------------------------------------------------------- */

function Detalle({ clave, calc, onVolver, tercero }) {
  const hist = calc.hist;
  const esPuntaje = clave === "puntaje";
  const info = esPuntaje ? { titulo: "Recuperación", Icono: Gauge } : DATOS[clave];
  const filas = [...hist].reverse().filter((e) => (esPuntaje ? e.puntaje != null : e.datos[clave].valor != null)).slice(0, 14);
  const ultimo = esPuntaje ? null : calc.dia?.datos?.[clave];

  return (
    <div className="space-y-3" data-testid={`detalle-${clave}`}>
      <button type="button" onClick={onVolver} data-testid="volver-salud" className="inline-flex items-center gap-1 text-sm font-medium" style={{ color: COLORS.track }}>
        <ChevronLeft size={16} /> Salud
      </button>
      <div className="flex items-center gap-2.5">
        <info.Icono size={20} style={{ color: COLORS.textPrimary }} />
        <h2 className="text-xl uppercase" style={{ ...OSWALD, color: COLORS.textPrimary }}>{info.nombreLargo || info.titulo}</h2>
      </div>

      <Tarjeta>
        <Etiqueta>Últimos {DIAS_DE_LINEA} días</Etiqueta>
        {esPuntaje && (
          <GraficoBarras maximo={100} referencia={70} formato={(v) => v} alto={140}
            puntos={hist.map((e) => ({ fecha: e.fecha, valor: e.puntaje, color: colorDe(e.tono) }))} />
        )}
        {clave === "sueño" && (
          <GraficoBarras referencia={7.5} formato={(v) => `${v} h`} alto={140}
            puntos={hist.map((e) => ({ fecha: e.fecha, valor: e.datos.sueño.valor != null ? e.datos.sueño.valor / 60 : null, color: colorDe(e.datos.sueño.tono) }))} />
        )}
        {(clave === "vfc" || clave === "fcReposo") && (
          <GraficoLinea alto={160} puntos={hist.map((e) => ({ fecha: e.fecha, valor: e.datos[clave].valor, rango: e.datos[clave].rango, tono: e.datos[clave].tono }))}
            colorPunto={(p) => colorDe(p.tono)} />
        )}
        {(clave === "vfc" || clave === "fcReposo") && (
          <div className="flex items-center gap-1.5 text-[11px] mt-1" style={{ color: COLORS.textMuted }}>
            <span className="w-3 h-2.5 rounded-sm" style={{ background: COLORS.easy + "40" }} /> tu normal de cada día (promedio de los 28 días anteriores)
          </div>
        )}
      </Tarjeta>

      <Tarjeta>
        <div className="flex gap-2.5">
          <Info size={16} className="shrink-0 mt-0.5" style={{ color: COLORS.textMuted }} />
          <div className="text-sm leading-relaxed" style={{ color: COLORS.textMuted }}>
            {esPuntaje ? (
              <>
                <p className="mb-2">Cada mañana comparamos tu <b style={{ color: COLORS.textPrimary }}>VFC</b>, tu <b style={{ color: COLORS.textPrimary }}>frecuencia en reposo</b> y tu <b style={{ color: COLORS.textPrimary }}>sueño</b> con tu normal: tu propio promedio de los 28 días anteriores.</p>
                <p><b style={{ color: COLORS.easy }}>70 o más</b>: listo para entrenar. <b style={{ color: COLORS.moderate }}>50 a 69</b>: ve con calma. <b style={{ color: COLORS.hard }}>Menos de 50</b>: hoy recupera y avísale a tu coach.</p>
              </>
            ) : (
              <>
                <p>{info.explica}</p>
                {ultimo?.media != null && (clave !== "sueño" ? (
                  <p className="mt-2">{tercero ? "Su normal hoy" : "Tu normal hoy"}: <b style={{ color: COLORS.textPrimary }}>{Math.round(ultimo.rango[0])}–{Math.round(ultimo.rango[1])} {info.unidad}</b> (promedio {Math.round(ultimo.media)} {info.unidad}, de {ultimo.n} días).</p>
                ) : (
                  <p className="mt-2">{tercero ? "Su promedio" : "Tu promedio"}: <b style={{ color: COLORS.textPrimary }}>{horasTexto(ultimo.media)}</b> (de {ultimo.n} noches).</p>
                ))}
              </>
            )}
          </div>
        </div>
      </Tarjeta>

      <Tarjeta style={{ padding: 0 }}>
        <div className="px-4 pt-3"><Etiqueta>Día por día</Etiqueta></div>
        {filas.length === 0 && <p className="text-sm px-4 pb-4" style={{ color: COLORS.textMuted }}>Todavía no hay días con este dato.</p>}
        {filas.map((e, i) => {
          const d = esPuntaje ? null : e.datos[clave];
          const tono = esPuntaje ? e.tono : d.tono;
          const ses = calc.sesiones[e.fecha];
          return (
            <div key={e.fecha} className="flex items-center gap-3 px-4 py-2.5" style={{ borderTop: i ? `1px solid ${COLORS.border}` : "none" }}>
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: colorDe(tono) }} />
              <div className="flex-1 min-w-0">
                <div className="text-sm first-letter:uppercase" style={{ color: COLORS.textPrimary }}>{fechaLarga(e.fecha)}</div>
                <div className="text-xs truncate" style={{ color: COLORS.textMuted }}>
                  {esPuntaje ? e.titulo : comparacion(clave, d, tercero).texto}
                  {ses ? ` · ${ses.nombre}${ses.hecho ? "" : " (no hecha)"}` : ""}
                </div>
              </div>
              <span className="text-lg" style={{ ...OSWALD, color: COLORS.textPrimary }}>
                {esPuntaje ? e.puntaje : info.formato(d.valor)}
                {!esPuntaje && info.unidad && <span className="text-xs ml-1" style={{ color: COLORS.textMuted, fontFamily: "inherit" }}>{info.unidad}</span>}
              </span>
            </div>
          );
        })}
      </Tarjeta>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   PANTALLAS
--------------------------------------------------------------------------- */

const MENSAJES = {
  "sin-reloj": { titulo: "Conecta tu reloj", texto: "Conecta tu reloj para ver cómo duermes y cuánto te recuperas de cada entrenamiento.", boton: "Conectar mi reloj" },
  "sin-permiso": { titulo: "Activa tus datos de salud", texto: "Tu reloj está conectado, pero no diste el permiso para tus datos de salud (sueño, VFC, frecuencia en reposo). Puedes activarlo en Perfil, en Tus permisos.", boton: "Ir a mis permisos" },
  reconectar: { titulo: "Vuelve a conectar tu reloj", texto: "Para traer tus datos de salud, intervals.icu necesita un permiso nuevo. Desconecta tu reloj en Perfil y vuelve a conectarlo: tarda un minuto.", boton: "Ir a Perfil" },
  "garmin-sin-salud": { titulo: "Activa tu salud en Garmin", texto: "En Garmin Connect está desactivado compartir tus datos de salud con TROTAMUNDOS. Actívalo en la app Garmin Connect, en la configuración de apps conectadas, para TROTAMUNDOS.", boton: null },
  proximamente: { titulo: "Muy pronto", texto: "Los datos de salud de Garmin aparecerán aquí en las próximas semanas. Tus entrenamientos siguen llegando como siempre.", boton: null },
};

function Invitacion({ estado, onIrAPerfil, esCoach }) {
  const m = MENSAJES[estado] || MENSAJES["sin-reloj"];
  const textoCoach = {
    "sin-reloj": "Este alumno no tiene reloj conectado.",
    "sin-permiso": "Este alumno no dio el permiso para sus datos de salud.",
    reconectar: "Este alumno tiene que volver a conectar intervals.icu para que lleguen sus datos de salud.",
    proximamente: "Los datos de salud de Garmin se mostrarán cuando termine la revisión de Garmin.",
    "garmin-sin-salud": "Este alumno desactivó en Garmin Connect el permiso para compartir sus datos de salud.",
  }[estado];
  return (
    <Tarjeta data-testid={`salud-${estado}`}>
      <div className="flex flex-col items-center text-center py-4">
        <span className="flex items-center justify-center rounded-full mb-3" style={{ width: 52, height: 52, background: COLORS.surface2, color: COLORS.textMuted }}>
          <Watch size={24} />
        </span>
        <div className="text-lg uppercase mb-1" style={{ ...OSWALD, color: COLORS.textPrimary }}>{esCoach ? "Sin datos de salud" : m.titulo}</div>
        <p className="text-sm leading-relaxed max-w-sm" style={{ color: COLORS.textMuted }}>{esCoach ? textoCoach : m.texto}</p>
        {!esCoach && m.boton && onIrAPerfil && (
          <button type="button" onClick={onIrAPerfil} className="mt-4 px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: COLORS.track, color: COLORS.lane }}>
            {m.boton}
          </button>
        )}
      </div>
    </Tarjeta>
  );
}

function Contenido({ salud, student, onIrAPerfil, esCoach, extra }) {
  const calc = useCalculo(salud, student);
  const [detalle, setDetalle] = useState(null);
  if (!salud) return <p className="text-sm" style={{ color: COLORS.textMuted }}>Cargando…</p>;
  if (!salud.ok) return <p className="text-sm" style={{ color: COLORS.textMuted }}>No se pudieron cargar los datos de salud. Prueba en un rato.</p>;
  if (salud.estado !== "ok") return <Invitacion estado={salud.estado} onIrAPerfil={onIrAPerfil} esCoach={esCoach} />;
  const dispositivo = student?.coros?.dispositivo || student?.garmin?.dispositivo || null;
  if (!calc?.dia) {
    return (
      <div className="space-y-3">
        <Tarjeta>
          <p className="text-sm leading-relaxed" style={{ color: COLORS.textMuted }}>
            {esCoach ? "Todavía no llegan datos de salud de su reloj." : salud.marca === "garmin"
              ? "Garmin envía tus datos de salud desde el día en que conectaste tu reloj (no el historial anterior). Duerme con él puesto y sincronízalo en la mañana con Garmin Connect: tus datos aparecerán aquí."
              : "Todavía no llegan datos de salud de tu reloj. Duerme con él puesto y sincronízalo en la mañana con su app: tus datos aparecerán aquí."}
          </p>
        </Tarjeta>
        <Aviso marca={salud.marca} dispositivo={dispositivo} tercero={esCoach} />
      </div>
    );
  }
  if (detalle) return <Detalle clave={detalle} calc={calc} onVolver={() => setDetalle(null)} tercero={esCoach} />;
  const abrir = (c) => { setDetalle(c); if (typeof window !== "undefined") window.scrollTo({ top: 0 }); };
  return (
    <div className="space-y-3">
      <Semaforo dia={calc.dia} onClick={() => abrir("puntaje")} tercero={esCoach} />
      {Object.keys(DATOS).map((k) => <TarjetaDato key={k} clave={k} d={calc.dia.datos[k]} onClick={() => abrir(k)} tercero={esCoach} />)}
      {extra ? extra(calc) : <LaSemana calc={calc} />}
      <Aviso marca={salud.marca} dispositivo={dispositivo} tercero={esCoach} />
    </div>
  );
}

// Pestaña Salud del alumno.
export function SaludAlumno({ student, salud, onIrAPerfil }) {
  return (
    <div data-testid="salud-alumno">
      <h2 className="text-lg font-semibold mb-3 uppercase" style={{ ...OSWALD, color: COLORS.textPrimary }}>Salud</h2>
      <Contenido salud={salud} student={student} onIrAPerfil={onIrAPerfil} />
      <Rendimiento student={student} salud={salud} />
    </div>
  );
}

// Resumen para Inicio: el semáforo en una línea.
export function ResumenSalud({ salud, onAbrir }) {
  const calc = useCalculo(salud, null);
  let cuerpo;
  if (!salud) cuerpo = <span className="text-sm" style={{ color: COLORS.textMuted }}>Cargando…</span>;
  else if (!salud.ok || salud.estado !== "ok") {
    const m = MENSAJES[salud?.estado] || MENSAJES["sin-reloj"];
    cuerpo = <span className="text-sm" style={{ color: COLORS.textMuted }}>{m.titulo}: {m.texto.split(".")[0]}.</span>;
  } else if (!calc?.dia || calc.dia.puntaje == null) {
    cuerpo = <span className="text-sm" style={{ color: COLORS.textMuted }}>{calc?.dia?.aprendiendo ? `Estamos conociendo tu normal: faltan ${calc.dia.faltan} días de datos.` : "Todavía no llegan datos de salud de tu reloj."}</span>;
  } else {
    const d = calc.dia;
    cuerpo = (
      <div className="flex items-center gap-3">
        <Anillo puntaje={d.puntaje} tono={d.tono} tamaño={64} />
        <div className="flex-1 min-w-0">
          <Chip tono={d.tono}>{d.titulo}</Chip>
          <div className="text-xs mt-1.5 flex flex-wrap gap-x-3" style={{ color: COLORS.textMuted }}>
            <span className="inline-flex items-center gap-1"><Moon size={12} /> {horasTexto(d.datos.sueño.valor)}</span>
            <span className="inline-flex items-center gap-1"><HeartPulse size={12} /> {d.datos.vfc.valor ?? "—"} ms</span>
            <span className="inline-flex items-center gap-1"><Heart size={12} /> {d.datos.fcReposo.valor ?? "—"} ppm</span>
          </div>
        </div>
      </div>
    );
  }
  return (
    <button type="button" onClick={onAbrir} className="w-full text-left" data-testid="resumen-salud">
      <Tarjeta>
        <div className="flex items-center justify-between">
          <Etiqueta>Tu recuperación</Etiqueta>
          <ChevronRight size={16} style={{ color: COLORS.textMuted }} />
        </div>
        {cuerpo}
      </Tarjeta>
    </button>
  );
}

// Botón Salud del coach, dentro de cada alumno: el día y las últimas 4 semanas.
export function SaludCoach({ student }) {
  const { salud } = useSalud(student?.id);
  return (
    <div data-testid="salud-coach" style={{ maxWidth: 560 }}>
      <Contenido salud={salud} student={student} esCoach extra={(calc) => <Tendencia calc={calc} />} />
      <Rendimiento student={student} salud={salud} tercero />
    </div>
  );
}

function Tendencia({ calc }) {
  // Promedio por semana de cada dato, junto a los km hechos.
  const semanas = calc.km.map((s) => {
    const dias = calc.hist.filter((e) => e.fecha >= s.desde && e.fecha < sumar7(s.desde));
    const prom = (k) => { const v = dias.map((e) => e.datos[k].valor).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
    return { ...s, vfc: prom("vfc"), fcReposo: prom("fcReposo"), sueño: prom("sueño"), puntaje: (() => { const v = dias.map((e) => e.puntaje).filter((x) => x != null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; })() };
  });
  const maxKm = Math.max(1, ...semanas.map((s) => s.km));
  return (
    <>
      <Tarjeta>
        <Etiqueta>Últimas 4 semanas: VFC y entrenamientos</Etiqueta>
        <GraficoLinea alto={170} sesiones={calc.sesiones} puntos={calc.hist.map((e) => ({ fecha: e.fecha, valor: e.datos.vfc.valor, rango: e.datos.vfc.rango }))} />
        <LeyendaSesiones />
      </Tarjeta>
      <Tarjeta style={{ padding: 0 }}>
        <div className="px-4 pt-3"><Etiqueta>Semana por semana</Etiqueta></div>
        <div className="grid grid-cols-6 gap-1 px-4 pb-1 text-[10px] uppercase tracking-wider" style={{ color: COLORS.textMuted }}>
          <span className="col-span-2">Semana</span><span className="text-right">Km</span><span className="text-right">Sueño</span><span className="text-right">VFC</span><span className="text-right">FCR</span>
        </div>
        {semanas.map((s) => (
          <div key={s.desde} className="grid grid-cols-6 gap-1 items-center px-4 py-2.5 text-sm" style={{ borderTop: `1px solid ${COLORS.border}`, color: COLORS.textPrimary }}>
            <span className="col-span-2 text-xs" style={{ color: COLORS.textMuted }}>{fechaCorta(s.desde)}</span>
            <span className="text-right" style={OSWALD}>
              {s.km}
              <span className="block h-1 rounded-full mt-1 ml-auto" style={{ width: `${(s.km / maxKm) * 100}%`, background: COLORS.track }} />
            </span>
            <span className="text-right" style={OSWALD}>{s.sueño != null ? horasTexto(s.sueño) : "—"}</span>
            <span className="text-right" style={OSWALD}>{s.vfc != null ? Math.round(s.vfc) : "—"}</span>
            <span className="text-right" style={OSWALD}>{s.fcReposo != null ? Math.round(s.fcReposo) : "—"}</span>
          </div>
        ))}
      </Tarjeta>
    </>
  );
}
const sumar7 = (iso) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); };

// El punto de color junto al nombre del alumno en la lista del coach.
export function PuntoSalud({ banda }) {
  if (!banda || banda === "listo") return null;
  const b = BANDAS[banda];
  return (
    <span title={`Salud: ${b.titulo}`} aria-label={`Salud: ${b.titulo}`} className="inline-block rounded-full shrink-0"
      style={{ width: 9, height: 9, background: colorDe(b.tono) }} data-testid={`punto-salud-${banda}`} />
  );
}

export function useSaludEquipo(activo = true) {
  const [alumnos, setAlumnos] = useState({});
  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    saludOp("equipo").then((r) => { if (vivo && r?.ok) setAlumnos(r.alumnos || {}); });
    return () => { vivo = false; };
  }, [activo]);
  return alumnos;
}

/* ---------------------------------------------------------------------------
   RENDIMIENTO (lib/rendimiento.mjs): VDOT estimado, estado de forma, eficiencia aeróbica,
   calidad bien ejecutada y sueño contra series. Funciona aunque no haya datos de salud: lo
   principal sale de las actividades del reloj (ritmo, FC, km por km y paso a paso).
--------------------------------------------------------------------------- */

const hoyLocal = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const su = (tercero, tu, suyo) => (tercero ? suyo : tu);

function useRendimiento(student, salud) {
  return useMemo(() => {
    if (!student) return null;
    const dias = porDia(salud?.ok ? salud.filas : []);
    const hoy = salud?.hoy || hoyLocal();
    const f = ultimoDiaConDatos(dias, hoy);
    const banda = f ? evaluarDia(dias, f).banda : null;
    return calcularRendimiento(student, dias, hoy, banda);
  }, [student, salud]);
}

function TarjetaRend({ id, Icono, titulo, valor, unidad, texto, tono, onClick }) {
  return (
    <button type="button" onClick={onClick} className="w-full text-left" data-testid={`rend-${id}`}>
      <Tarjeta style={{ padding: "14px 16px" }}>
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center rounded-xl shrink-0" style={{ width: 38, height: 38, background: COLORS.surface2, color: colorDe(tono) }}>
            <Icono size={18} strokeWidth={2} />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium" style={{ color: COLORS.textPrimary }}>{titulo}</div>
            <div className="text-xs leading-snug" style={{ color: tono ? colorDe(tono) : COLORS.textMuted }}>{texto}</div>
          </div>
          {valor != null && (
            <div className="text-right shrink-0">
              <span className="text-2xl" style={{ ...OSWALD, color: COLORS.textPrimary }}>{valor}</span>
              {unidad && <span className="text-xs ml-1" style={{ color: COLORS.textMuted }}>{unidad}</span>}
            </div>
          )}
          <ChevronRight size={16} style={{ color: COLORS.textMuted }} />
        </div>
      </Tarjeta>
    </button>
  );
}

function Explica({ children }) {
  return (
    <Tarjeta>
      <div className="flex gap-2.5">
        <Info size={16} className="shrink-0 mt-0.5" style={{ color: COLORS.textMuted }} />
        <div className="text-sm leading-relaxed" style={{ color: COLORS.textMuted }}>{children}</div>
      </div>
    </Tarjeta>
  );
}

function Fila({ izq, sub, der, tono, primera }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5" style={{ borderTop: primera ? "none" : `1px solid ${COLORS.border}` }}>
      {tono !== undefined && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: colorDe(tono) }} />}
      <div className="flex-1 min-w-0">
        <div className="text-sm first-letter:uppercase" style={{ color: COLORS.textPrimary }}>{izq}</div>
        {sub && <div className="text-xs truncate" style={{ color: COLORS.textMuted }}>{sub}</div>}
      </div>
      <span className="text-lg" style={{ ...OSWALD, color: COLORS.textPrimary }}>{der}</span>
    </div>
  );
}

function Lista({ titulo, children, vacio }) {
  const hijos = React.Children.toArray(children).filter(Boolean);
  return (
    <Tarjeta style={{ padding: 0 }}>
      <div className="px-4 pt-3"><Etiqueta>{titulo}</Etiqueta></div>
      {hijos.length ? hijos : <p className="text-sm px-4 pb-4" style={{ color: COLORS.textMuted }}>{vacio}</p>}
    </Tarjeta>
  );
}

function resumenes(r, tercero) {
  const v = r.vdot, f = r.forma, e = r.eficiencia, c = r.calidad, s = r.sueño;
  return [
    {
      id: "vdot", Icono: TrendingUp, titulo: "VDOT estimado",
      valor: v.estado === "ok" ? v.vdot.toFixed(1) : null,
      tono: v.estado !== "ok" ? null : v.sugerencia === "bajar" ? "atento" : "bien",
      texto: v.estado !== "ok" ? (!v.fcMax ? "Hace falta una sesión de series o una carrera con frecuencia cardíaca." : `Faltan ${v.faltan || 1} salida${v.faltan === 1 ? "" : "s"} con frecuencia cardíaca para estimarlo.`)
        : `${su(tercero, "Tus ritmos", "Sus ritmos")} usan VDOT ${v.plan ?? "—"}${v.prediccion ? ` · ${tiempoTexto(v.prediccion.min)} en ${v.prediccion.km >= 42 ? "42K" : v.prediccion.km >= 21 ? "21K" : `${v.prediccion.km}K`}` : ""}`,
    },
    {
      id: "forma", Icono: BarChart3, titulo: "Estado de forma",
      valor: f.estado === "ok" ? f.ratio.toFixed(2) : null, tono: f.estado === "ok" ? f.tono : null,
      texto: f.estado === "ok" ? f.titulo : "Hacen falta 3 semanas de entrenamientos registrados.",
    },
    {
      id: "eficiencia", Icono: Wind, titulo: "Eficiencia aeróbica",
      valor: e.estado === "ok" ? `${e.segundos > 0 ? "+" : ""}${e.segundos}` : null, unidad: e.estado === "ok" ? "s/km" : null, tono: e.estado === "ok" ? e.tono : null,
      texto: e.estado === "ok" ? (e.clave === "mejora" ? "Más rápido a igual FC que hace un mes" : e.clave === "baja" ? "Más lento a igual FC que hace un mes" : "Estable respecto a hace un mes")
        : "Hacen falta rodajes con FC de hace un mes y de estas dos semanas.",
    },
    {
      id: "calidad", Icono: Target, titulo: "Calidad bien ejecutada",
      valor: c.estado === "ok" ? `${c.pct}%` : null, tono: c.estado === "ok" ? c.tono : null,
      texto: c.estado === "ok" ? `${c.dentro} de ${c.reps} repeticiones en ritmo${c.tendencia === "rapido" ? " · tiende a ir rápido" : c.tendencia === "lento" ? " · tiende a ir lento" : ""}`
        : "Aparece con las sesiones de series registradas con el reloj.",
    },
    {
      id: "sueño", Icono: Moon, titulo: "Sueño y series",
      valor: s.estado === "ok" ? `${s.diferencia > 0 ? "+" : ""}${s.diferencia}` : null, unidad: s.estado === "ok" ? "s/km" : null, tono: s.estado === "ok" ? s.tono : null,
      texto: s.estado === "ok" ? "Diferencia de las series con poco sueño" : "Hacen falta series después de noches cortas y de noches buenas.",
    },
  ];
}

function DetalleRend({ id, r, tercero, onVolver }) {
  const titulos = { vdot: "VDOT estimado", forma: "Estado de forma", eficiencia: "Eficiencia aeróbica", calidad: "Calidad bien ejecutada", sueño: "Sueño y series" };
  let cuerpo = null;
  if (id === "vdot") {
    const v = r.vdot;
    cuerpo = (
      <>
        {v.estado === "ok" && (
          <Tarjeta>
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.12em]" style={{ color: COLORS.textMuted }}>Estimado</div>
                <div className="text-4xl" style={{ ...OSWALD, color: COLORS.textPrimary }}>{v.vdot.toFixed(1)}</div>
              </div>
              <div className="text-right">
                <div className="text-[11px] uppercase tracking-[0.12em]" style={{ color: COLORS.textMuted }}>{su(tercero, "Tus ritmos", "Sus ritmos")}</div>
                <div className="text-2xl" style={{ ...OSWALD, color: COLORS.textMuted }}>{v.plan ?? "—"}</div>
              </div>
            </div>
            {v.prediccion && (
              <p className="text-sm mt-3" style={{ color: COLORS.textMuted }}>
                Con este VDOT, {su(tercero, "tu", "su")} tiempo estimado en {v.prediccion.km >= 42 ? "maratón" : v.prediccion.km >= 21 ? "media maratón" : `${v.prediccion.km}K`} es <b style={{ color: COLORS.textPrimary }}>{tiempoTexto(v.prediccion.min)}</b>
                {v.prediccion.minPlan ? <> (con el VDOT de {su(tercero, "tus", "sus")} ritmos: {tiempoTexto(v.prediccion.minPlan)})</> : null}.
              </p>
            )}
            <p className="text-sm mt-2" style={{ color: v.sugerencia === "mantener" ? COLORS.textMuted : COLORS.textPrimary }}>
              {v.sugerencia === "subir" ? (tercero ? "Su VDOT estimado está 1,5 o más por encima del de sus ritmos: puedes actualizarlos en Ritmos." : "Estás por encima de tus ritmos actuales: coméntalo con tu coach.")
                : v.sugerencia === "bajar" ? (tercero ? "Su VDOT estimado está por debajo del de sus ritmos: revisa si viene cansado o si conviene bajarlos." : "Tu VDOT estimado está por debajo de tus ritmos: puede ser cansancio. Coméntalo con tu coach.")
                : "Coincide con el de sus ritmos actuales.".replace("sus", su(tercero, "tus", "sus"))}
              {" "}Confianza: {v.confianza}.
            </p>
          </Tarjeta>
        )}
        <Tarjeta>
          <Etiqueta>Últimas 8 semanas</Etiqueta>
          <GraficoBarras alto={140} semanal referencia={v.plan ?? null} formato={(x) => Number(x).toFixed(1).replace(/\.0$/, "")}
            minimo={Math.floor(Math.min(...v.semanas.map((s) => s.vdot ?? 99), v.plan ?? 99) - 3)}
            maximo={Math.ceil(Math.max(...v.semanas.map((s) => s.vdot || 0), v.plan || 0) + 1.5)}
            puntos={v.semanas.map((s) => ({ fecha: s.desde, valor: s.vdot, color: COLORS.track }))} />
          <p className="text-[11px] mt-1" style={{ color: COLORS.textMuted }}>La línea punteada es el VDOT de {su(tercero, "tus", "sus")} ritmos.</p>
        </Tarjeta>
        <Explica>
          En cada kilómetro con frecuencia cardíaca comparamos cuánto oxígeno cuesta ese ritmo (tablas de Daniels) con el porcentaje de {su(tercero, "tu", "su")} reserva cardíaca que {su(tercero, "usaste", "usó")}.
          {" "}FC máxima de referencia: <b style={{ color: COLORS.textPrimary }}>{v.fcMax ?? "—"} ppm</b> (la más alta de los últimos 4 meses){v.fcReposo ? <>; en reposo: <b style={{ color: COLORS.textPrimary }}>{Math.round(v.fcReposo)} ppm</b></> : "; sin datos de reposo se asume 60 ppm"}.
          {" "}Es una estimación: una carrera real es la mejor medida.
        </Explica>
        <Lista titulo="Salida por salida" vacio="Todavía no hay salidas con frecuencia cardíaca.">
          {[...v.salidas].reverse().map((s, i) => <Fila key={s.fecha + i} primera={i === 0} izq={fechaLarga(s.fecha)} sub={`${s.nombre} · ${s.km ?? "—"} km a ${ritmoTexto(s.ritmo)}/km · FC ${s.fcMedia ?? "—"}`} der={s.vdot.toFixed(1)} />)}
        </Lista>
      </>
    );
  }
  if (id === "forma") {
    const f = r.forma;
    const pos = f.estado === "ok" ? Math.min(100, Math.max(0, ((f.ratio - 0.5) / 1.5) * 100)) : null;
    cuerpo = (
      <>
        {f.estado === "ok" && (
          <Tarjeta>
            <Chip tono={f.tono}>{f.titulo}</Chip>
            <p className="text-sm leading-relaxed mt-2" style={{ color: COLORS.textMuted }}>{f.texto}</p>
            <div className="relative h-2.5 rounded-full mt-4 overflow-hidden flex">
              <span style={{ width: "20%", background: COLORS.easy + "88" }} /><span style={{ width: "33.3%", background: COLORS.easy }} />
              <span style={{ width: "13.4%", background: COLORS.moderate }} /><span style={{ flex: 1, background: COLORS.hard }} />
            </div>
            <div className="relative h-3"><span className="absolute -top-1 w-3 h-3 rounded-full" style={{ left: `calc(${pos}% - 6px)`, background: COLORS.textPrimary, border: `2px solid ${COLORS.bg}` }} /></div>
            <div className="flex justify-between text-[10px]" style={{ color: COLORS.textMuted }}><span>Fresco</span><span>Construyendo</span><span>Rápido</span><span>Muy alta</span></div>
            <p className="text-xs mt-3" style={{ color: COLORS.textMuted }}>Carga de los últimos 7 días: <b style={{ color: COLORS.textPrimary }}>{f.aguda}</b> · promedio semanal del mes: <b style={{ color: COLORS.textPrimary }}>{f.cronica}</b> · relación {f.ratio.toFixed(2)}</p>
          </Tarjeta>
        )}
        <Tarjeta>
          <Etiqueta>Carga por semana</Etiqueta>
          <GraficoBarras alto={140} semanal puntos={f.semanas.map((s) => ({ fecha: s.desde, valor: s.carga, color: COLORS.track }))} />
        </Tarjeta>
        <Explica>
          La carga de cada salida son sus minutos por su intensidad: el esfuerzo que {su(tercero, "anotaste", "anotó")} (1 a 10), o si no la frecuencia cardíaca, o si no el tipo de sesión.
          {" "}Se compara la última semana con el promedio de las últimas 4. Entre 0,8 y 1,3 el cuerpo asimila bien; por encima de 1,5 sube el riesgo de lesión.
        </Explica>
      </>
    );
  }
  if (id === "eficiencia") {
    const e = r.eficiencia;
    cuerpo = (
      <>
        {e.estado === "ok" && <Tarjeta><Chip tono={e.tono}>{e.clave === "mejora" ? "Mejorando" : e.clave === "baja" ? "Bajando" : "Estable"}</Chip><p className="text-sm leading-relaxed mt-2" style={{ color: COLORS.textMuted }}>{tercero ? e.texto.replace(/^Hoy corres/, "Hoy corre").replace("tu motor", "su motor") : e.texto}</p></Tarjeta>}
        <Tarjeta>
          <Etiqueta>Metros por latido en rodajes y fondos</Etiqueta>
          <GraficoLinea alto={140} formato={(x) => x.toFixed(2)} puntos={e.puntos.map((p) => ({ fecha: p.fecha, valor: p.ef }))} />
        </Tarjeta>
        <Explica>Dividimos la velocidad de cada rodaje suave o fondo por su frecuencia cardíaca media. Si sube, {su(tercero, "corres", "corre")} más rápido con el mismo esfuerzo del corazón. Se compara lo de las últimas 2 semanas con lo de hace 1 a 2 meses. El calor, las subidas y el cansancio la bajan.</Explica>
        <Lista titulo="Rodajes y fondos" vacio="Todavía no hay rodajes con frecuencia cardíaca.">
          {[...e.puntos].reverse().map((p, i) => <Fila key={p.fecha + i} primera={i === 0} izq={fechaLarga(p.fecha)} sub={`${p.nombre} · ${ritmoTexto(p.ritmo)}/km · FC ${p.fc}`} der={p.ef.toFixed(2)} />)}
        </Lista>
      </>
    );
  }
  if (id === "calidad") {
    const c = r.calidad;
    cuerpo = (
      <>
        {c.estado === "ok" && <Tarjeta><Chip tono={c.tono}>{c.pct}% en ritmo</Chip><p className="text-sm leading-relaxed mt-2" style={{ color: COLORS.textMuted }}>{tercero ? c.texto.replace("tus repeticiones", "sus repeticiones").replace("estás ejecutando", "está ejecutando").replace("Coméntalo con tu coach", "Conviene revisarlo") : c.texto}</p></Tarjeta>}
        <Explica>Una repetición cuenta como "en ritmo" si queda a {MARGEN_CALIDAD} s/km o menos del ritmo objetivo del plan. Las recuperaciones no cuentan. Últimas 8 semanas.</Explica>
        <Lista titulo="Sesión por sesión" vacio="Todavía no hay sesiones de series registradas con el reloj.">
          {[...(c.sesiones || [])].reverse().map((s, i) => (
            <Fila key={s.fecha + i} primera={i === 0} tono={s.pct >= 75 ? "bien" : s.pct >= 50 ? "atento" : "alerta"} izq={fechaLarga(s.fecha)}
              sub={`${s.nombre} · ${s.dentro} en ritmo${s.rapidas ? ` · ${s.rapidas} rápidas` : ""}${s.lentas ? ` · ${s.lentas} lentas` : ""}`} der={`${s.pct}%`} />
          ))}
        </Lista>
      </>
    );
  }
  if (id === "sueño") {
    const s = r.sueño;
    cuerpo = (
      <>
        {s.estado === "ok" ? (
          <Tarjeta>
            <p className="text-sm leading-relaxed" style={{ color: COLORS.textPrimary }}>{tercero ? s.texto.replace("tus series", "sus series").replace("duermes", "duerme").replace("Tus series", "Sus series") : s.texto}</p>
            <div className="grid grid-cols-2 gap-2 mt-3">
              {[["Menos de 6 h 30", s.corto], ["7 h o más", s.bueno]].map(([t, g]) => (
                <div key={t} className="rounded-lg p-3" style={{ background: COLORS.surface2 }}>
                  <div className="text-[11px] uppercase tracking-wider" style={{ color: COLORS.textMuted }}>{t}</div>
                  <div className="text-xl" style={{ ...OSWALD, color: COLORS.textPrimary }}>{g.dif > 0 ? "+" : ""}{g.dif} s/km</div>
                  <div className="text-[11px]" style={{ color: COLORS.textMuted }}>contra el objetivo · {g.n} sesiones</div>
                </div>
              ))}
            </div>
          </Tarjeta>
        ) : (
          <Tarjeta><p className="text-sm" style={{ color: COLORS.textMuted }}>Faltan {s.faltanCorto ? `${s.faltanCorto} sesión(es) de series después de dormir menos de 6 h 30` : ""}{s.faltanCorto && s.faltanBueno ? " y " : ""}{s.faltanBueno ? `${s.faltanBueno} después de dormir 7 h o más` : ""} para comparar.</p></Tarjeta>
        )}
        <Explica>Para cada sesión de series vemos cuánto se {su(tercero, "desviaron tus", "desviaron sus")} repeticiones del ritmo objetivo (en s/km; positivo es más lento) y cuánto {su(tercero, "dormiste", "durmió")} la noche anterior. Últimos 4 meses.</Explica>
        <Lista titulo="Sesiones" vacio="Todavía no hay sesiones de series con datos de sueño.">
          {[...(s.pares || [])].reverse().map((p, i) => <Fila key={p.fecha + i} primera={i === 0} izq={fechaLarga(p.fecha)} sub={`${p.nombre} · durmió ${horasTexto(p.sueño)}`.replace("durmió", su(tercero, "dormiste", "durmió"))} der={`${p.dif > 0 ? "+" : ""}${p.dif}`} />)}
        </Lista>
      </>
    );
  }
  return (
    <div className="space-y-3" data-testid={`detalle-rend-${id}`}>
      <button type="button" onClick={onVolver} data-testid="volver-rendimiento" className="inline-flex items-center gap-1 text-sm font-medium" style={{ color: COLORS.track }}>
        <ChevronLeft size={16} /> Rendimiento
      </button>
      <h2 className="text-xl uppercase" style={{ ...OSWALD, color: COLORS.textPrimary }}>{titulos[id]}</h2>
      {cuerpo}
      <p className="text-[11px] text-center" style={{ color: COLORS.textMuted }}>Estimaciones para {su(tercero, "tu", "su")} entrenamiento y rendimiento: no son un diagnóstico ni consejo médico.</p>
    </div>
  );
}

export function Rendimiento({ student, salud, tercero = false }) {
  const r = useRendimiento(student, salud);
  const [abierto, setAbierto] = useState(null);
  const ancla = React.useRef(null);
  if (!r) return null;
  const abrir = (id) => { setAbierto(id); setTimeout(() => ancla.current?.scrollIntoView({ block: "start" }), 0); };
  return (
    <div ref={ancla} className="mt-6 scroll-mt-4" data-testid="rendimiento">
      {abierto ? <DetalleRend id={abierto} r={r} tercero={tercero} onVolver={() => abrir(null)} /> : (
        <>
          <h3 className="text-lg font-semibold mb-3 uppercase" style={{ ...OSWALD, color: COLORS.textPrimary }}>Rendimiento</h3>
          <div className="space-y-3">
            {resumenes(r, tercero).map((x) => <TarjetaRend key={x.id} {...x} onClick={() => abrir(x.id)} />)}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   RESUMEN DE LA SEMANA DEL EQUIPO (coach)
--------------------------------------------------------------------------- */

const GRUPOS = [
  { id: "sobrecargados", titulo: "Sobrecargados o poco recuperados", tono: "alerta", motivo: (r) => r.forma === "alta" ? "Carga muy alta" : r.forma === "rapido" ? "Subió la carga rápido" : "Viene poco recuperado" },
  { id: "durmieronMal", titulo: "Durmieron mal la semana", tono: "atento", motivo: (r) => `Promedio ${horasTexto(r.sueñoPromedio)}` },
  { id: "subieronVdot", titulo: "Subieron su VDOT", tono: "bien", motivo: (r) => (r.vdot ? `VDOT ${r.vdot.toFixed(1)}${r.vdotPlan ? ` (ritmos: ${r.vdotPlan})` : ""}` : "Mejorando") },
  { id: "asimilando", titulo: "Asimilando bien", tono: "bien", motivo: (r) => (r.forma === "fresco" ? "Fresco" : "Construyendo bien") },
];

export function ResumenEquipo({ onElegir }) {
  const [abierto, setAbierto] = useState(false);
  const [datos, setDatos] = useState(null);
  const abrir = async () => {
    const nuevo = !abierto;
    setAbierto(nuevo);
    if (nuevo) { setDatos(null); setDatos(await saludOp("semana")); }
  };
  return (
    <div className="mb-3" data-testid="resumen-equipo">
      <button type="button" onClick={abrir} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold text-left"
        style={{ background: abierto ? COLORS.surface2 : COLORS.surface, color: COLORS.textPrimary, border: `1px solid ${abierto ? COLORS.track : COLORS.border}` }}>
        <BarChart3 size={15} style={{ color: COLORS.track }} />
        <span className="flex-1">Resumen de la semana</span>
        <ChevronRight size={15} style={{ color: COLORS.textMuted, transform: abierto ? "rotate(90deg)" : "none" }} />
      </button>
      {abierto && (
        <div className="rounded-lg p-3 mt-2 space-y-3" style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}>
          {!datos ? <p className="text-sm" style={{ color: COLORS.textMuted }}>Calculando…</p> : !datos.ok ? (
            <p className="text-sm" style={{ color: COLORS.textMuted }}>No se pudo calcular el resumen. Prueba en un rato.</p>
          ) : (
            <>
              <p className="text-xs" style={{ color: COLORS.textMuted }}>Últimos 7 días, con lo que llegó de los relojes.</p>
              {GRUPOS.map((g) => {
                const ids = datos.grupos?.[g.id] || [];
                return (
                  <div key={g.id} data-testid={`grupo-${g.id}`}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ background: colorDe(g.tono) }} />
                      <span className="text-[11px] font-semibold uppercase tracking-[0.1em]" style={{ color: COLORS.textMuted }}>{g.titulo} · {ids.length}</span>
                    </div>
                    {ids.length === 0 ? <p className="text-xs pl-4" style={{ color: COLORS.textMuted }}>Nadie.</p> : (
                      <div className="flex flex-wrap gap-1.5 pl-4">
                        {ids.map((id) => {
                          const r = datos.resumenes[id] || {};
                          return (
                            <button key={id} type="button" onClick={() => onElegir?.(id)} className="text-left px-2.5 py-1.5 rounded-lg text-xs"
                              style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.textPrimary }}>
                              <span className="font-semibold">{r.nombre || id}</span>
                              <span className="block" style={{ color: COLORS.textMuted }}>{g.motivo(r)}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
