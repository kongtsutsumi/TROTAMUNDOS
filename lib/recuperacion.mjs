// Recuperación del alumno a partir de los datos de salud de su reloj (tabla salud_diaria).
// Es la parte pura: sin red ni base de datos. Pruebas: tests/recuperacion.test.mjs.
//
// La idea es simple y explicable: cada dato se compara con EL NORMAL DE ESE ALUMNO (su
// promedio de los 28 días anteriores), no con valores de tabla. De ahí sale:
//
//   · el estado de cada dato (sueño, VFC, FC en reposo): en tu normal, por encima, por debajo;
//   · un puntaje del día de 0 a 100, con su color y su frase (el "semáforo");
//   · el historial que respalda cada número, para que el alumno vea de dónde sale;
//   · la lectura de la semana: cómo bajó y volvió la VFC después de las sesiones fuertes.
//
// Es solo para el entrenamiento: no diagnostica nada. Las pantallas lo dicen.

import { semanaLunes } from "./intervals-icu.mjs";
import { localDateISO, nombreDeSesion } from "./plan-engine.mjs";

export const DIAS_DE_LINEA = 28;   // ventana del "normal"
export const MIN_DIAS_DE_LINEA = 5; // con menos, todavía se está conociendo al alumno

const acotar = (v, a, b) => Math.min(b, Math.max(a, v));
const esNum = (v) => typeof v === "number" && Number.isFinite(v);
const sumarDias = (iso, n) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return localDateISO(d); };

// Filas de salud_diaria → { "YYYY-MM-DD": { fuente, datos } }, juntando fuentes del mismo día
// (si hubiera dos, gana el dato que llegó primero en la lista, que viene ordenada por fecha).
export function porDia(filas) {
  const out = {};
  for (const f of Array.isArray(filas) ? filas : []) {
    if (!f?.fecha || !f?.datos) continue;
    const d = out[f.fecha] || (out[f.fecha] = { fuente: f.fuente, datos: {} });
    for (const [k, v] of Object.entries(f.datos)) if (esNum(v) && d.datos[k] === undefined) d.datos[k] = v;
  }
  return out;
}

// El normal de un dato: promedio y desviación de los días anteriores a `fecha` (sin incluirla).
export function lineaBase(dias, campo, fecha, ventana = DIAS_DE_LINEA) {
  const vals = [];
  for (let i = 1; i <= ventana; i++) {
    const v = dias[sumarDias(fecha, -i)]?.datos?.[campo];
    if (esNum(v)) vals.push(v);
  }
  if (vals.length < MIN_DIAS_DE_LINEA) return { n: vals.length, media: null, de: null, rango: null };
  const media = vals.reduce((a, b) => a + b, 0) / vals.length;
  const de = Math.sqrt(vals.reduce((a, b) => a + (b - media) ** 2, 0) / vals.length);
  return { n: vals.length, media, de, rango: [media - de, media + de] };
}

// Mínimos de desviación para que un normal muy estable no convierta cualquier cambio en alarma.
const DE_MIN = { vfc: (m) => Math.max(3, m * 0.1), fcReposo: () => 2.5, sueñoMin: () => 25 };

function evaluarDato(dias, campo, fecha) {
  const valor = dias[fecha]?.datos?.[campo];
  const base = lineaBase(dias, campo, fecha);
  if (!esNum(valor)) return { valor: null, ...base, z: null, estado: "sin-dato" };
  if (base.media == null) return { valor, ...base, z: null, estado: "aprendiendo" };
  const de = Math.max(base.de, DE_MIN[campo](base.media));
  const z = (valor - base.media) / de;
  return { valor, ...base, rango: [base.media - de, base.media + de], z, delta: valor - base.media, estado: "ok" };
}

// Color de cada dato: "bien" (verde), "atento" (ámbar), "alerta" (rojo), o null.
function tonoDe(campo, d) {
  if (campo === "sueñoMin") {
    if (!esNum(d.valor)) return null;
    if (d.valor < 360) return "alerta";                 // menos de 6 h
    if (d.valor < 420 || (d.z != null && d.z < -1.2)) return "atento";
    return "bien";
  }
  if (d.z == null) return null;
  if (campo === "vfc") return d.z < -2 ? "alerta" : d.z < -1 ? "atento" : "bien";
  if (campo === "fcReposo") return d.z > 2 ? "alerta" : d.z > 1 ? "atento" : "bien";
  return null;
}

export const BANDAS = {
  listo: { tono: "bien", titulo: "Listo para entrenar" },
  calma: { tono: "atento", titulo: "Ve con calma" },
  recupera: { tono: "alerta", titulo: "Hoy recupera" },
};
export const bandaDe = (p) => (p == null ? null : p >= 70 ? "listo" : p >= 50 ? "calma" : "recupera");

export const horasTexto = (min) => {
  if (!esNum(min)) return "—";
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
};

// El día: { fecha, puntaje, banda, titulo, tono, frase, aprendiendo, faltan, datos: { sueño, vfc, fcReposo } }
export function evaluarDia(dias, fecha) {
  const sueño = evaluarDato(dias, "sueñoMin", fecha);
  const vfc = evaluarDato(dias, "vfc", fecha);
  const fcReposo = evaluarDato(dias, "fcReposo", fecha);
  const puntajeSueño = dias[fecha]?.datos?.sueñoPuntaje;

  // Con todo en su normal y 7 horas de sueño, el día queda cerca de 78: "listo".
  let partes = 0, puntos = 78;
  if (vfc.z != null) { puntos += acotar(vfc.z, -2.5, 2) * 9; partes++; }
  if (fcReposo.z != null) { puntos -= acotar(fcReposo.z, -2, 2.5) * 7; partes++; }
  if (esNum(sueño.valor)) {
    puntos += acotar((sueño.valor / 60 - 7) * 6, -15, 6);
    if (esNum(puntajeSueño)) puntos += acotar((puntajeSueño - 75) * 0.15, -5, 5);
    partes++;
  }
  // Hacen falta al menos dos datos, y al menos uno comparado con su normal.
  const comparados = (vfc.z != null) + (fcReposo.z != null);
  const puntaje = partes >= 2 && comparados >= 1 ? Math.round(acotar(puntos, 0, 100)) : null;
  const banda = bandaDe(puntaje);
  const faltan = Math.max(0, MIN_DIAS_DE_LINEA - Math.max(vfc.n || 0, fcReposo.n || 0));

  const datos = {
    sueño: { ...sueño, tono: tonoDe("sueñoMin", sueño), puntajeSueño: esNum(puntajeSueño) ? puntajeSueño : null },
    vfc: { ...vfc, tono: tonoDe("vfc", vfc) },
    fcReposo: { ...fcReposo, tono: tonoDe("fcReposo", fcReposo) },
  };
  return {
    fecha, puntaje, banda,
    titulo: banda ? BANDAS[banda].titulo : null,
    tono: banda ? BANDAS[banda].tono : null,
    frase: banda ? fraseDelDia(banda, datos) : null,
    aprendiendo: puntaje == null && faltan > 0,
    faltan,
    datos,
  };
}

function fraseDelDia(banda, d) {
  const partes = [];
  if (esNum(d.sueño.valor)) partes.push(d.sueño.tono === "bien" ? `Dormiste ${horasTexto(d.sueño.valor)}` : `Dormiste solo ${horasTexto(d.sueño.valor)}`);
  if (d.vfc.tono) partes.push(d.vfc.tono === "bien" ? "tu VFC está en tu normal" : "tu VFC está por debajo de tu normal");
  if (d.fcReposo.tono && d.fcReposo.tono !== "bien") partes.push("tu frecuencia en reposo está más alta de lo habitual");
  const base = partes.length ? `${partes.join(partes.length > 2 ? ", " : " y ").replace(/, ([^,]*)$/, " y $1")}.` : "";
  const consejo = {
    listo: "Tu cuerpo está recuperado: entrena como está planeado.",
    calma: "Si hoy toca calidad, empieza suave y cuéntale a tu coach cómo te sientes.",
    recupera: "Cuéntaselo a tu coach antes de hacer una sesión fuerte.",
  }[banda];
  return `${base} ${consejo}`.trim();
}

// Los días de [desde, hasta] evaluados (para el historial del puntaje y de cada dato).
export function historial(dias, hasta, n = DIAS_DE_LINEA) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(evaluarDia(dias, sumarDias(hasta, -i)));
  return out;
}

// El último día con datos (hasta `hoy`), para no mostrar un semáforo vacío a primera hora.
export function ultimoDiaConDatos(dias, hoy, maxAtras = 3) {
  for (let i = 0; i <= maxAtras; i++) {
    const f = sumarDias(hoy, -i);
    const d = dias[f]?.datos;
    if (d && (esNum(d.vfc) || esNum(d.fcReposo) || esNum(d.sueñoMin))) return f;
  }
  return null;
}

/* ---------------------------------------------------------------------------
   ENTRENAMIENTOS (para cruzarlos con la recuperación)
--------------------------------------------------------------------------- */

export const TIPOS_DE_SESION = {
  suave: "Suave",
  calidad: "Calidad",
  fondo: "Fondo",
};
const tipoDe = (day) => (!day?.paceKey ? null : day.paceKey === "E" ? "suave" : day.paceKey === "long" ? "fondo" : "calidad");

// { "YYYY-MM-DD": { tipo, nombre, km, hecho, kmHechos } } de todo el plan.
export function sesionesPorFecha(student) {
  const out = {};
  for (const [n, w] of Object.entries(student?.weeks || {})) {
    const lunes = semanaLunes(student, Number(n));
    if (!lunes || !Array.isArray(w?.plan)) continue;
    w.plan.forEach((day, i) => {
      const tipo = tipoDe(day);
      if (!tipo) return;
      const f = new Date(lunes); f.setDate(f.getDate() + i);
      const log = w.log?.[i] || {};
      const kmHechos = Number(log.actualKm) || (log.completed ? Number(day.km) || 0 : 0);
      out[localDateISO(f)] = { tipo, nombre: nombreDeSesion(day) || TIPOS_DE_SESION[tipo], km: Number(day.km) || 0, hecho: !!log.completed, kmHechos };
    });
  }
  return out;
}

// Kilómetros hechos por semana (lunes a domingo) de las últimas `n` semanas hasta `hoy`.
export function kmPorSemana(sesiones, hoy, n = 4) {
  const d = new Date(`${hoy}T12:00:00`);
  const lunes = sumarDias(hoy, -((d.getDay() + 6) % 7));
  const out = [];
  for (let s = n - 1; s >= 0; s--) {
    const ini = sumarDias(lunes, -7 * s);
    let km = 0;
    for (let i = 0; i < 7; i++) km += sesiones[sumarDias(ini, i)]?.kmHechos || 0;
    out.push({ desde: ini, km: Math.round(km * 10) / 10 });
  }
  return out;
}

const DIA_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const nombreDia = (iso) => DIA_SEMANA[new Date(`${iso}T12:00:00`).getDay()];

// Lo que muestra la semana: cómo reaccionó la VFC a las sesiones fuertes. Texto o null.
export function lecturaDeLaSemana(evaluados, sesiones) {
  const conVfc = evaluados.filter((e) => e.datos.vfc.z != null);
  if (conVfc.length < 3) return null;
  const peor = conVfc.reduce((a, b) => (b.datos.vfc.z < a.datos.vfc.z ? b : a));
  if (peor.datos.vfc.z >= -1) return "Tu VFC se mantuvo en tu normal toda la semana: estás asimilando bien la carga.";
  // ¿Qué sesión fuerte hubo justo antes?
  let causa = null;
  for (let i = 0; i <= 2 && !causa; i++) {
    const s = sesiones[sumarDias(peor.fecha, -i)];
    if (s && s.tipo !== "suave" && s.hecho) causa = { ...s, fecha: sumarDias(peor.fecha, -i) };
  }
  const despues = evaluados.filter((e) => e.fecha > peor.fecha && e.datos.vfc.z != null);
  const vuelta = despues.find((e) => e.datos.vfc.z >= -0.5);
  const inicio = causa ? `Después de tu ${causa.nombre.toLowerCase()} del ${nombreDia(causa.fecha)}, tu VFC bajó` : `El ${nombreDia(peor.fecha)} tu VFC bajó`;
  if (vuelta) {
    const n = Math.round((Date.parse(`${vuelta.fecha}T12:00:00`) - Date.parse(`${peor.fecha}T12:00:00`)) / 86400000);
    return `${inicio} y volvió a tu normal en ${n} día${n === 1 ? "" : "s"}. Es buena señal: estás asimilando la carga.`;
  }
  return `${inicio} y todavía no vuelve a tu normal. Cuéntaselo a tu coach.`;
}
