// Rendimiento: lo que sale de cruzar el plan, lo que el alumno corrió (ritmo, FC, km por km,
// paso a paso, esfuerzo percibido) y su salud. Parte pura. Pruebas: tests/rendimiento.test.mjs.
//
//   1. VDOT estimado     → con la FC de cada km y el costo de oxígeno de ese ritmo (Daniels).
//   2. Estado de forma   → carga de 7 días contra la de 4 semanas, junto a la recuperación.
//   3. Eficiencia        → metros por minuto por latido en los rodajes suaves, y su tendencia.
//   5. Calidad           → cuántas repeticiones cayeron en el ritmo objetivo.
//   7. Sueño y series    → cómo salen las series después de dormir poco o bien.
//   8. Resumen del alumno para la lista del coach.
//
// Todo es una estimación para el entrenamiento: no es un diagnóstico. Si faltan datos, cada
// lectura lo dice ("aprendiendo") en vez de inventar un número.

import { semanaLunes } from "./intervals-icu.mjs";
import { localDateISO, computeVDOT, velocityForPct, parsePaceToDecimal, DISTANCE_KM, nombreDeSesion } from "./plan-engine.mjs";

const esNum = (v) => typeof v === "number" && Number.isFinite(v);
const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : null; };
const mediana = (xs) => { const a = xs.filter(esNum).sort((x, y) => x - y); if (!a.length) return null; const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
const prom = (xs) => { const a = xs.filter(esNum); return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null; };
const sumarDias = (iso, d) => { const f = new Date(`${iso}T12:00:00`); f.setDate(f.getDate() + d); return localDateISO(f); };
const diasEntre = (a, b) => Math.round((Date.parse(`${b}T12:00:00`) - Date.parse(`${a}T12:00:00`)) / 86400000);
const ritmoDe = (t) => (typeof t === "string" ? parsePaceToDecimal(t.replace(/\/km$/, "")) : esNum(t) ? t : null);
export const ritmoTexto = (min) => { if (!esNum(min) || min <= 0) return "—"; const s = Math.round(min * 60); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

const tipoDe = (day) => (!day?.paceKey ? null : day.paceKey === "E" ? "suave" : day.paceKey === "long" ? "fondo" : "calidad");

/* ---------------------------------------------------------------------------
   LAS SALIDAS DEL ALUMNO, EN UNA SOLA LISTA
--------------------------------------------------------------------------- */

// [{ fecha, tipo (suave|calidad|fondo|extra), nombre, km, min, ritmo (min/km), fcMedia, fcMax,
//    rpe, kms, pasos, deReloj }], ordenada por fecha.
export function salidas(student) {
  const out = [];
  for (const [num, w] of Object.entries(student?.weeks || {})) {
    const lunes = semanaLunes(student, Number(num));
    const fechaDia = (i) => { if (!lunes) return null; const f = new Date(lunes); f.setDate(f.getDate() + i); return localDateISO(f); };
    (w?.plan || []).forEach((day, i) => {
      const log = w.log?.[i] || {};
      const r = log.reloj;
      if (!log.completed && !r) return;
      const tipo = tipoDe(day) || "extra";
      const km = n(r?.km) ?? n(log.actualKm) ?? (log.completed ? n(day?.km) : null);
      const ritmo = ritmoDe(r?.ritmo) ?? ritmoDe(log.actualPaceStr);
      const min = n(r?.min) ?? (km && ritmo ? km * ritmo : null);
      out.push({
        fecha: (r?.fecha || "").slice(0, 10) || fechaDia(i), tipo, nombre: nombreDeSesion(day) || "Sesión",
        km, min, ritmo, fcMedia: n(r?.fcMedia), fcMax: n(r?.fcMax), rpe: n(log.rpe),
        kms: Array.isArray(r?.kms) ? r.kms : null, pasos: Array.isArray(r?.pasos?.pasos) ? r.pasos.pasos : null, deReloj: !!r,
      });
    });
    for (const x of Array.isArray(w?.extras) ? w.extras : []) {
      const fecha = (x?.fecha || "").slice(0, 10) || (esNum(x?.dia) ? fechaDia(x.dia) : null);
      if (!fecha) continue;
      out.push({
        fecha, tipo: "extra", nombre: x.nombre || "Salida adicional", km: n(x.km), min: n(x.min), ritmo: ritmoDe(x.ritmo),
        fcMedia: n(x.fcMedia), fcMax: n(x.fcMax), rpe: null, kms: Array.isArray(x.kms) ? x.kms : null, pasos: null, deReloj: true,
      });
    }
  }
  return out.filter((s) => s.fecha).sort((a, b) => a.fecha.localeCompare(b.fecha));
}

// FC en reposo de referencia: mediana de los últimos 14 días de salud (o null).
export function fcReposoDe(dias, hoy) {
  const v = [];
  for (let i = 0; i < 14; i++) { const x = dias?.[sumarDias(hoy, -i)]?.datos?.fcReposo; if (esNum(x)) v.push(x); }
  return v.length >= 3 ? mediana(v) : null;
}

// FC máxima de referencia (últimos 120 días). Solo sirve una FC tomada en un esfuerzo fuerte:
//   · la máxima de una sesión de calidad o de una salida adicional (carreras), o
//   · la de las repeticiones de 2 minutos 30 o más, que llegan a ~95 % de la máxima.
// Con rodajes suaves solos no hay referencia: el VDOT se queda "aprendiendo".
export function fcMaxDe(lista, hoy) {
  const desde = sumarDias(hoy, -120);
  const recientes = lista.filter((s) => s.fecha >= desde);
  const observadas = recientes.filter((s) => s.tipo === "calidad" || s.tipo === "extra").map((s) => s.fcMax).filter(esNum);
  const porSeries = recientes.flatMap((s) => (s.pasos || []).filter((p) => p.trabajo && n(p.fc) && n(p.seg) >= 150).map((p) => n(p.fc) / 0.95));
  const v = [...observadas, ...porSeries].filter((x) => x > 120 && x < 230);
  return v.length ? Math.round(Math.max(...v)) : null;
}

/* ---------------------------------------------------------------------------
   1. VDOT ESTIMADO
   Para cada km con FC: %VO2máx ≈ % de la reserva cardíaca (FC − reposo) / (máx − reposo), y el
   VO2 de ese ritmo sale de la fórmula de Daniels. VDOT ≈ VO2 / %VO2máx. Se toma la mediana.
--------------------------------------------------------------------------- */

const vo2DeVelocidad = (v) => -4.6 + 0.182258 * v + 0.000104 * v * v; // v en m/min

export function vdotDeSalida(s, fcReposo, fcMax) {
  if (!esNum(fcMax) || !esNum(fcReposo) || fcMax - fcReposo < 60) return null;
  const tramos = (s.kms || []).slice(1).filter((k) => n(k.km) >= 0.9 && n(k.fc) && ritmoDe(k.ritmo));
  const usar = tramos.length ? tramos.map((k) => ({ fc: n(k.fc), ritmo: ritmoDe(k.ritmo) }))
    : (esNum(s.fcMedia) && esNum(s.ritmo) && n(s.km) >= 3 ? [{ fc: s.fcMedia, ritmo: s.ritmo }] : []);
  const est = usar.map(({ fc, ritmo }) => {
    const pct = (fc - fcReposo) / (fcMax - fcReposo);
    if (pct < 0.5 || pct > 0.95) return null; // muy suave o casi al máximo: la relación se pierde
    return vo2DeVelocidad(1000 / ritmo) / pct;
  }).filter((v) => esNum(v) && v > 20 && v < 90);
  return est.length ? mediana(est) : null;
}

// El VDOT con el que se calcularon sus ritmos: el inverso exacto de computeTrainingPaces
// (el ritmo maratón es la velocidad al 84 % del VDOT).
export function vdotDelPlan(student) {
  const M = n(student?.paces?.M);
  return M ? Math.round((vo2DeVelocidad(1000 / M) / 0.84) * 10) / 10 : null;
}

// Tiempo (minutos) para una distancia con un VDOT: el ritmo con el que computeVDOT da ese VDOT.
export function tiempoPara(vdot, km) {
  if (!esNum(vdot) || !esNum(km)) return null;
  let lo = 2.3, hi = 15; // min/km
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (computeVDOT(km, mid) > vdot) lo = mid; else hi = mid; }
  return ((lo + hi) / 2) * km;
}
export const tiempoTexto = (min) => {
  if (!esNum(min)) return "—";
  const s = Math.round(min * 60), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}` : `${m}:${String(ss).padStart(2, "0")}`;
};

export function vdotEstimado(student, lista, dias, hoy) {
  const fcReposo = fcReposoDe(dias, hoy);
  const fcMax = fcMaxDe(lista, hoy);
  const reposo = fcReposo ?? 60; // sin datos de salud se asume 60 (y la confianza baja)
  const conEst = lista.map((s) => ({ ...s, vdot: vdotDeSalida(s, reposo, fcMax) })).filter((s) => esNum(s.vdot));
  const recientes = conEst.filter((s) => s.fecha >= sumarDias(hoy, -21));
  const plan = vdotDelPlan(student);
  const base = { plan, fcMax, fcReposo, n: recientes.length };
  // Semana a semana (últimas 8): mediana de las salidas de cada semana.
  const semanas = [];
  for (let k = 7; k >= 0; k--) {
    const fin = sumarDias(hoy, -7 * k), ini = sumarDias(fin, -6);
    const v = mediana(conEst.filter((s) => s.fecha >= ini && s.fecha <= fin).map((s) => s.vdot));
    semanas.push({ desde: ini, vdot: v != null ? Math.round(v * 10) / 10 : null });
  }
  if (recientes.length < 3 || !fcMax) return { ...base, estado: "aprendiendo", faltan: Math.max(0, 3 - recientes.length), semanas, salidas: conEst.slice(-12) };
  const vdot = Math.round(mediana(recientes.map((s) => s.vdot)) * 10) / 10;
  const confianza = fcReposo && recientes.length >= 5 ? "alta" : fcReposo || recientes.length >= 5 ? "media" : "baja";
  const dif = plan != null ? Math.round((vdot - plan) * 10) / 10 : null;
  const meta = DISTANCE_KM[student?.goal];
  return {
    ...base, estado: "ok", vdot, dif, confianza, semanas, salidas: conEst.slice(-12),
    prediccion: meta ? { km: meta, min: tiempoPara(vdot, meta), minPlan: plan ? tiempoPara(plan, meta) : null } : null,
    sugerencia: dif == null ? null : dif >= 1.5 ? "subir" : dif <= -1.5 ? "bajar" : "mantener",
  };
}

/* ---------------------------------------------------------------------------
   2. ESTADO DE FORMA (carga aguda contra crónica)
   Carga de una salida = minutos × intensidad. La intensidad sale del esfuerzo percibido
   (RPE/10) si lo anotó; si no, de la FC (% de reserva); si no, del tipo de sesión.
--------------------------------------------------------------------------- */

const INTENSIDAD_POR_TIPO = { suave: 0.5, fondo: 0.6, calidad: 0.75, extra: 0.5 };
export function cargaDe(s, fcReposo, fcMax) {
  if (!esNum(s.min) || s.min <= 0) return 0;
  let i = null;
  if (esNum(s.rpe) && s.rpe >= 1 && s.rpe <= 10) i = s.rpe / 10;
  else if (esNum(s.fcMedia) && esNum(fcMax) && esNum(fcReposo) && fcMax - fcReposo >= 60) i = Math.min(1, Math.max(0.3, (s.fcMedia - fcReposo) / (fcMax - fcReposo)));
  else i = INTENSIDAD_POR_TIPO[s.tipo] ?? 0.5;
  return Math.round(s.min * i);
}

export const ESTADOS_DE_FORMA = {
  fresco: { tono: "bien", titulo: "Fresco", texto: "Bajaste la carga: buen momento para competir o para volver a subir." },
  construyendo: { tono: "bien", titulo: "Construyendo bien", texto: "Tu carga sube a un ritmo que el cuerpo asimila." },
  rapido: { tono: "atento", titulo: "Subiste rápido", texto: "Esta semana cargaste bastante más que tu promedio del mes. Cuida el sueño y los rodajes suaves." },
  alta: { tono: "alerta", titulo: "Carga muy alta", texto: "Estás muy por encima de tu promedio del mes: aumenta el riesgo de lesión. Habla con tu coach." },
};

export function estadoDeForma(lista, dias, hoy, recuperacion = null) {
  const fcReposo = fcReposoDe(dias, hoy), fcMax = fcMaxDe(lista, hoy);
  const cargaDia = {};
  for (const s of lista) cargaDia[s.fecha] = (cargaDia[s.fecha] || 0) + cargaDe(s, fcReposo ?? 60, fcMax);
  const sumar = (desde, hasta) => Object.entries(cargaDia).filter(([f]) => f >= desde && f <= hasta).reduce((a, [, c]) => a + c, 0);
  const aguda = sumar(sumarDias(hoy, -6), hoy);
  const cronica = sumar(sumarDias(hoy, -27), hoy) / 4;
  const primera = lista[0]?.fecha;
  const semanas = [];
  for (let k = 7; k >= 0; k--) { const fin = sumarDias(hoy, -7 * k); semanas.push({ desde: sumarDias(fin, -6), carga: sumar(sumarDias(fin, -6), fin) }); }
  if (!primera || diasEntre(primera, hoy) < 21 || cronica <= 0) return { estado: "aprendiendo", aguda, cronica: Math.round(cronica), semanas };
  const ratio = Math.round((aguda / cronica) * 100) / 100;
  let clave = ratio < 0.8 ? "fresco" : ratio <= 1.3 ? "construyendo" : ratio <= 1.5 ? "rapido" : "alta";
  // Con la recuperación baja, construir rápido ya es demasiado.
  if (recuperacion && recuperacion !== "listo" && clave === "rapido") clave = "alta";
  const e = ESTADOS_DE_FORMA[clave];
  const textoRec = recuperacion === "recupera" && clave !== "fresco" ? " Además vienes poco recuperado: conviene un día suave." : "";
  return { estado: "ok", clave, ...e, texto: e.texto + textoRec, ratio, aguda, cronica: Math.round(cronica), semanas };
}

/* ---------------------------------------------------------------------------
   3. EFICIENCIA AERÓBICA (rodajes suaves)
   EF = velocidad (m/min) / FC media. Si sube, corre más rápido con las mismas pulsaciones.
--------------------------------------------------------------------------- */

export function eficiencia(lista, hoy) {
  const suaves = lista.filter((s) => (s.tipo === "suave" || s.tipo === "fondo") && esNum(s.fcMedia) && s.fcMedia > 60 && esNum(s.ritmo) && n(s.km) >= 4)
    .map((s) => ({ ...s, ef: (1000 / s.ritmo) / s.fcMedia }));
  const reciente = suaves.filter((s) => s.fecha >= sumarDias(hoy, -14));
  const antes = suaves.filter((s) => s.fecha >= sumarDias(hoy, -56) && s.fecha < sumarDias(hoy, -28));
  const base = { puntos: suaves.slice(-20).map((s) => ({ fecha: s.fecha, ef: Math.round(s.ef * 1000) / 1000, ritmo: s.ritmo, fc: s.fcMedia, nombre: s.nombre })) };
  if (reciente.length < 2 || antes.length < 2) return { ...base, estado: "aprendiendo" };
  const efR = mediana(reciente.map((s) => s.ef)), efA = mediana(antes.map((s) => s.ef));
  const ritmoTipico = mediana(reciente.map((s) => s.ritmo));
  // A la misma FC, el ritmo cambia en la proporción de la eficiencia.
  const segundos = Math.round(ritmoTipico * 60 * (1 - efA / efR));
  const pct = Math.round((efR / efA - 1) * 1000) / 10;
  const clave = segundos >= 3 ? "mejora" : segundos <= -3 ? "baja" : "igual";
  const texto = clave === "mejora" ? `Hoy corres ${segundos} s/km más rápido con las mismas pulsaciones que hace un mes: tu motor aeróbico está mejorando.`
    : clave === "baja" ? `Hoy corres ${-segundos} s/km más lento con las mismas pulsaciones que hace un mes. Puede ser cansancio, calor o poco sueño.`
    : "Tu eficiencia aeróbica se mantiene estable respecto a hace un mes.";
  return { ...base, estado: "ok", clave, segundos, pct, texto, tono: clave === "baja" ? "atento" : "bien" };
}

/* ---------------------------------------------------------------------------
   5. CALIDAD BIEN EJECUTADA
   Una repetición está "en ritmo" si queda a 5 s/km o menos del objetivo.
--------------------------------------------------------------------------- */

export const MARGEN_CALIDAD = 5; // s/km

export function calidadDeSalida(s) {
  const reps = (s.pasos || []).filter((p) => p.trabajo && ritmoDe(p.ritmo) && ritmoDe(p.objetivo?.ritmo));
  if (!reps.length) return null;
  let dentro = 0, rapidas = 0, lentas = 0;
  const difs = reps.map((p) => Math.round((ritmoDe(p.ritmo) - ritmoDe(p.objetivo.ritmo)) * 60));
  for (const d of difs) { if (Math.abs(d) <= MARGEN_CALIDAD) dentro++; else if (d < 0) rapidas++; else lentas++; }
  return { fecha: s.fecha, nombre: s.nombre, reps: reps.length, dentro, rapidas, lentas, pct: Math.round((dentro / reps.length) * 100), difMedia: Math.round(prom(difs)) };
}

export function calidad(lista, hoy) {
  const sesiones = lista.filter((s) => s.fecha >= sumarDias(hoy, -56)).map(calidadDeSalida).filter(Boolean);
  if (!sesiones.length) return { estado: "aprendiendo", sesiones: [] };
  const tot = sesiones.reduce((a, s) => ({ reps: a.reps + s.reps, dentro: a.dentro + s.dentro, rapidas: a.rapidas + s.rapidas, lentas: a.lentas + s.lentas }), { reps: 0, dentro: 0, rapidas: 0, lentas: 0 });
  const pct = Math.round((tot.dentro / tot.reps) * 100);
  const fuera = tot.rapidas + tot.lentas;
  const tendencia = fuera === 0 ? null : tot.rapidas >= fuera * 0.66 ? "rapido" : tot.lentas >= fuera * 0.66 ? "lento" : "mixto";
  const texto = pct >= 75 ? `El ${pct}% de tus repeticiones cayó en el ritmo objetivo: estás ejecutando muy bien la calidad.`
    : tendencia === "rapido" ? `El ${pct}% de tus repeticiones cayó en el ritmo. La mayoría de las otras fueron más rápidas de lo planeado: correr las series demasiado rápido no da más beneficio y cansa más.`
    : tendencia === "lento" ? `El ${pct}% de tus repeticiones cayó en el ritmo. La mayoría de las otras fueron más lentas: puede ser cansancio o que el ritmo objetivo esté alto. Coméntalo con tu coach.`
    : `El ${pct}% de tus repeticiones cayó en el ritmo objetivo.`;
  return { estado: "ok", pct, ...tot, tendencia, texto, tono: pct >= 75 ? "bien" : pct >= 50 ? "atento" : "alerta", sesiones: sesiones.slice(-8) };
}

/* ---------------------------------------------------------------------------
   7. SUEÑO Y SERIES
   Desvío medio de las repeticiones (s/km contra el objetivo) según cómo durmió esa noche.
--------------------------------------------------------------------------- */

export const CORTE_SUEÑO_CORTO = 390; // 6 h 30
export const CORTE_SUEÑO_BUENO = 420; // 7 h

export function sueñoYSeries(lista, dias, hoy) {
  const pares = lista.filter((s) => s.fecha >= sumarDias(hoy, -120)).map((s) => {
    const c = calidadDeSalida(s);
    const sueño = dias?.[s.fecha]?.datos?.sueñoMin;
    return c && esNum(sueño) ? { fecha: s.fecha, nombre: s.nombre, sueño, dif: c.difMedia } : null;
  }).filter(Boolean);
  const corto = pares.filter((p) => p.sueño < CORTE_SUEÑO_CORTO), bueno = pares.filter((p) => p.sueño >= CORTE_SUEÑO_BUENO);
  if (corto.length < 2 || bueno.length < 2) return { estado: "aprendiendo", pares, faltanCorto: Math.max(0, 2 - corto.length), faltanBueno: Math.max(0, 2 - bueno.length) };
  const dc = Math.round(prom(corto.map((p) => p.dif))), db = Math.round(prom(bueno.map((p) => p.dif)));
  const peor = dc - db;
  const texto = peor >= 3 ? `Con menos de 6 h 30 de sueño tus series salen ${peor} s/km más lentas que cuando duermes 7 h o más.`
    : peor <= -3 ? "Tus series no salen peor después de dormir poco. Igual, dormir bien te ayuda a asimilar la carga."
    : "Tus series salen parecido después de dormir poco o bien.";
  return { estado: "ok", pares, corto: { n: corto.length, dif: dc }, bueno: { n: bueno.length, dif: db }, diferencia: peor, texto, tono: peor >= 3 ? "atento" : "bien" };
}

/* ---------------------------------------------------------------------------
   TODO JUNTO, Y EL RESUMEN PARA LA LISTA DEL COACH
--------------------------------------------------------------------------- */

export function rendimiento(student, dias, hoy, recuperacion = null) {
  const lista = salidas(student);
  return {
    vdot: vdotEstimado(student, lista, dias, hoy),
    forma: estadoDeForma(lista, dias, hoy, recuperacion),
    eficiencia: eficiencia(lista, hoy),
    calidad: calidad(lista, hoy),
    sueño: sueñoYSeries(lista, dias, hoy),
  };
}

// Para el resumen semanal del equipo.
export function resumenSemanal(student, dias, hoy, recuperacion = null) {
  const r = rendimiento(student, dias, hoy, recuperacion);
  const noches = [];
  for (let i = 0; i < 7; i++) { const s = dias?.[sumarDias(hoy, -i)]?.datos?.sueñoMin; if (esNum(s)) noches.push(s); }
  const vdotSem = r.vdot.semanas.filter((s) => esNum(s.vdot));
  const subioVdot = vdotSem.length >= 2 && vdotSem[vdotSem.length - 1].vdot - vdotSem[0].vdot >= 1;
  return {
    forma: r.forma.estado === "ok" ? r.forma.clave : null,
    recuperacion,
    sueñoPromedio: noches.length >= 4 ? Math.round(prom(noches)) : null,
    durmioMal: noches.length >= 4 && prom(noches) < CORTE_SUEÑO_CORTO,
    vdot: r.vdot.estado === "ok" ? r.vdot.vdot : null,
    vdotPlan: r.vdot.plan,
    subioVdot,
    calidadPct: r.calidad.estado === "ok" ? r.calidad.pct : null,
  };
}

// Grupos del resumen: quién asimila bien, quién está sobrecargado, quién durmió mal, quién mejoró.
export function gruposDelEquipo(resumenes) {
  const g = { sobrecargados: [], durmieronMal: [], subieronVdot: [], asimilando: [] };
  for (const [id, r] of Object.entries(resumenes || {})) {
    if (r.forma === "alta" || r.forma === "rapido" || r.recuperacion === "recupera") g.sobrecargados.push(id);
    if (r.durmioMal) g.durmieronMal.push(id);
    if (r.subioVdot) g.subieronVdot.push(id);
    if ((r.forma === "construyendo" || r.forma === "fresco") && (r.recuperacion === "listo" || r.recuperacion == null)) g.asimilando.push(id);
  }
  return g;
}

export { velocityForPct };
