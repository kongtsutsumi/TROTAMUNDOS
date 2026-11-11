// COROS por su MCP oficial: la parte pura (sin red ni base de datos). Pruebas: tests/coros.test.mjs.
//
// COROS no le dio a TROTAMUNDOS su API de socios: nos indicó usar COROS MCP
// (https://mcp.coros.com/mcp), que sirve sin aprobación. Funciona con OAuth 2.0 (el alumno
// entra a su cuenta de COROS y autoriza) y se le habla en JSON-RPC: "tools/call" con el nombre
// de una herramienta. Lo que importa de sus límites:
//
//   · No avisa nada (no hay webhooks): la app pregunta cada tanto.
//   · No borra ni mueve entrenamientos: solo crea y edita. Si el coach quita una sesión, la del
//     reloj se cambia por un aviso y el alumno la borra en la app COROS.
//   · Casi todo responde en TEXTO, no en JSON. Los lectores de acá son tolerantes: buscan lo que
//     necesitan y, si no lo encuentran, no inventan nada.
//
//   · El entrenamiento de cada día en el formato "course" de COROS, armado desde los mismos pasos
//     que reciben Garmin e intervals.icu (sesionAPasos).
//   · Qué hacer con una semana (crear, editar, retirar) comparando con lo ya enviado.
//   · Leer las respuestas: actividades, el enlace del archivo FIT, el modelo del reloj, la salud.
//   · Al desconectar: quitar el detalle que vino de COROS y dejar lo básico de cada sesión.
//
// La parte que habla con COROS está en lib/coros-servidor.js.

import { sesionAPasos, MARGEN_RITMO_SEG, calentamientoLibreActivo, semanaLunes } from "./intervals-icu.mjs";
import { localDateISO, nombreDeSesion } from "./plan-engine.mjs";

export const MCP_BASE = "https://mcp.coros.com";
export const ALCANCES = "openid offline_access mcp.tools";
export const VERSION_MCP = "2025-06-18";

/* ---------------------------------------------------------------------------
   ENTRENAMIENTOS ("course" de COROS)

   Reglas del esquema de createScheduledWorkout (comprobadas con un envío real por el
   proyecto ai-running-coach, octubre de 2026):
     sportType 1 = correr. courseName ≤ 100. courseDescription obligatoria.
     sections: { sectionType 1 calentamiento | 2 trabajo | 3 recuperación | 4 enfriamiento,
                 targetType 1 distancia (m) | 2 tiempo (s) | 4 libre (se cierra con LAP),
                 targetValue entero, intensityType 2 = ritmo con intensityValueStart/End en s/km }
     grupos: { intervalGroup: true, repeats 1–20, sets: [secciones de tipo 2 o 3] }, sin anidar.
--------------------------------------------------------------------------- */

export const DEPORTE_CORRER = 1;
export const MAX_REPETICIONES = 20;
const RITMO_MIN_S = 120, RITMO_MAX_S = 1499; // límites del esquema, en s/km

const TIPO_SECCION = { warmup: 1, active: 2, recover: 3, cooldown: 4 };
const NOMBRES = { "Warm-up": "Calentamiento", "Cool-down": "Enfriamiento" };

const recortar = (s, n) => (typeof s === "string" && s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
const acotar = (v, min, max) => Math.min(max, Math.max(min, v));

// min/km decimal → "4:55"
const mmss = (min) => { const s = Math.round(min * 60); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

function medidaDe(p) {
  if (p.tipo === "distance" && p.valor > 0) {
    const m = Math.round(p.valor * 1000);
    return m >= 1000 ? `${Number((m / 1000).toFixed(2))} km` : `${m} m`;
  }
  if (p.tipo === "time" && p.valor > 0) return `${Math.round(p.valor)} min`;
  return "";
}

// Una sección de COROS desde un paso (o null si no se puede armar).
function seccion(p, { enGrupo = false } = {}) {
  const libre = !!p.libre;
  const metros = p.tipo === "distance" ? Math.round(p.valor * 1000) : null;
  const segundos = p.tipo === "time" ? Math.round(p.valor * 60) : null;
  if (!libre && !(metros > 0) && !(segundos > 0)) return null;
  let tipo = TIPO_SECCION[p.intensidad] || 2;
  if (enGrupo && tipo !== 3) tipo = 2; // dentro de un grupo solo valen trabajo y recuperación
  const s = { sectionType: tipo };
  if (libre) s.targetType = 4;
  else if (metros) { s.targetType = 1; s.targetValue = metros; }
  else { s.targetType = 2; s.targetValue = segundos; }
  if (p.objetivo && p.ritmo > 0) {
    // Rango de ±5 s/km, el más lento primero (como lo guarda COROS).
    const seg = p.ritmo * 60;
    s.intensityType = 2;
    s.intensityValueStart = acotar(Math.round(seg + MARGEN_RITMO_SEG), RITMO_MIN_S, RITMO_MAX_S);
    s.intensityValueEnd = acotar(Math.round(seg - MARGEN_RITMO_SEG), RITMO_MIN_S, RITMO_MAX_S);
  }
  return s;
}

// Cómo se lee un paso en la descripción que ve el alumno (el reloj no muestra nombres de paso).
function lineaDePaso(p) {
  const nombre = NOMBRES[p.nombre] || p.nombre;
  const medida = medidaDe(p);
  const ritmo = p.ritmo > 0 ? (p.objetivo ? `a ${mmss(p.ritmo)}/km` : `(ritmo ${mmss(p.ritmo)}/km)`) : "";
  return [nombre, medida, ritmo, p.libre ? "· presiona LAP al terminar" : ""].filter(Boolean).join(" ");
}

// Un día del plan → { course } de COROS (o null si es descanso o no se puede armar).
export function sesionACourse(day, easyPace, { alertas = false, libre = false } = {}) {
  const items = sesionAPasos(day, easyPace, { alertas, libre });
  if (!items || !items.length) return null;
  const sections = [];
  const lineas = [];
  for (const it of items) {
    if (it.paso) {
      const s = seccion(it.paso);
      if (s) { sections.push(s); lineas.push(lineaDePaso(it.paso)); }
      continue;
    }
    const sets = it.pasos.map((p) => seccion(p, { enGrupo: true })).filter(Boolean);
    if (!sets.length) continue;
    // COROS acepta hasta 20 repeticiones por grupo: si hay más, se parte en varios.
    let quedan = Math.max(1, Math.round(it.repetir));
    while (quedan > 0) {
      const n = Math.min(MAX_REPETICIONES, quedan);
      sections.push({ intervalGroup: true, repeats: n, sets: sets.map((s) => ({ ...s })) });
      quedan -= n;
    }
    lineas.push(`${Math.round(it.repetir)} x (${it.pasos.map(lineaDePaso).join(" + ")})`);
  }
  if (!sections.length) return null;
  const nombre = `${nombreDeSesion(day)}${day.km ? ` · ${day.km} km` : ""}`;
  const descripcion = [...lineas, "Plan de tu coach en TROTAMUNDOS."].join("\n");
  return {
    courseName: recortar(nombre, 100),
    courseDescription: recortar(descripcion, 500),
    sportType: DEPORTE_CORRER,
    sections,
  };
}

// Lo que se pone en el lugar de una sesión que el coach quitó (COROS no deja borrarla).
export const COURSE_RETIRADO = Object.freeze({
  courseName: "Sesión retirada: bórrala en la app COROS",
  courseDescription: "Tu coach quitó esta sesión del plan. Bórrala desde la app COROS (Calendario) para que no te aparezca.",
  sportType: DEPORTE_CORRER,
  sections: [{ sectionType: 2, targetType: 4 }],
});

// Firma del contenido: si no cambia, no hace falta volver a mandarlo.
export function firmaDeCourse(c) {
  const s = JSON.stringify(c);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

// Los entrenamientos de una semana: [{ dia, fecha, course, firma }].
export function semanaACourses(student, weekNum, { alertas = false } = {}) {
  const week = student?.weeks?.[weekNum];
  if (!week || !Array.isArray(week.plan)) return [];
  const easyPace = student.paces?.E ?? null;
  const lunes = semanaLunes(student, weekNum);
  if (!lunes) return [];
  const out = [];
  week.plan.forEach((day, idx) => {
    if (!day?.paceKey) return;
    const course = sesionACourse(day, easyPace, { alertas, libre: calentamientoLibreActivo(student, day) });
    if (!course) return;
    const fecha = new Date(lunes);
    fecha.setDate(fecha.getDate() + idx);
    out.push({ dia: idx, fecha: localDateISO(fecha), course, firma: firmaDeCourse(course) });
  });
  return out;
}

// Qué hacer con una semana, comparando lo que tiene que estar en COROS con lo ya enviado.
//   enviados: { "<dia>": { idInPlan, firma, fecha, nombre, retirado } } de esa semana
//   hoy: "YYYY-MM-DD" — lo pasado no se toca.
// Devuelve { crear: [d], editar: [{ ...d, idInPlan }], retirar: [{ dia, ...previo }], igual: [dia] }.
//   · Mismo día y fecha, contenido distinto → se edita en su lugar (no se duplica).
//   · Cambió de fecha, o el coach la quitó → la anterior se retira (se cambia por un aviso para
//     borrarla en la app, porque COROS no deja borrar) y, si corresponde, se crea la nueva.
export function planDeEnvioCoros(deseados, enviados, hoy) {
  const ya = enviados && typeof enviados === "object" ? enviados : {};
  const crear = [], editar = [], retirar = [], igual = [];
  const porDia = new Map(deseados.map((d) => [String(d.dia), d]));
  for (const d of deseados) {
    if (d.fecha < hoy) continue;
    const previo = ya[String(d.dia)];
    if (previo && !previo.retirado && previo.firma === d.firma && previo.fecha === d.fecha) { igual.push(d.dia); continue; }
    if (previo && previo.fecha === d.fecha && previo.idInPlan != null) { editar.push({ ...d, idInPlan: previo.idInPlan }); continue; }
    if (previo && !previo.retirado && previo.fecha >= hoy) retirar.push({ dia: d.dia, ...previo });
    crear.push(d);
  }
  for (const [dia, previo] of Object.entries(ya)) {
    if (porDia.has(dia) || previo?.retirado) continue;
    if (previo?.fecha && previo.fecha < hoy) continue;
    retirar.push({ dia: Number(dia), ...previo });
  }
  return { crear, editar, retirar, igual };
}

/* ---------------------------------------------------------------------------
   MCP: PEDIDOS Y RESPUESTAS
--------------------------------------------------------------------------- */

export const pedidoRpc = (id, method, params = {}) => ({ jsonrpc: "2.0", id, method, params });

// La respuesta de un POST al MCP puede venir como JSON o como "text/event-stream" (líneas
// "data: {...}"). Devuelve el mensaje JSON-RPC con ese id (o el último), o null.
export function leerRespuestaMcp(texto, id = null) {
  if (typeof texto !== "string" || !texto.trim()) return null;
  const t = texto.trim();
  const candidatos = [];
  if (t.startsWith("{") || t.startsWith("[")) {
    try { const j = JSON.parse(t); candidatos.push(...(Array.isArray(j) ? j : [j])); } catch (e) { /* puede ser SSE */ }
  }
  if (!candidatos.length) {
    let datos = [];
    const cerrar = () => { if (datos.length) { try { candidatos.push(JSON.parse(datos.join("\n"))); } catch (e) { /* evento no JSON */ } datos = []; } };
    for (const linea of t.split(/\r?\n/)) {
      if (linea.startsWith("data:")) datos.push(linea.slice(5).replace(/^ /, ""));
      else if (!linea.trim()) cerrar();
    }
    cerrar();
  }
  const conId = id != null ? candidatos.filter((m) => m && m.id === id) : [];
  return (conId.length ? conId : candidatos.filter((m) => m && (m.result || m.error))).pop() || null;
}

// El texto de un resultado de tools/call (todas las partes de texto juntas).
// COROS manda el texto como una cadena JSON entre comillas, con los saltos de línea escritos
// como "\n" (visto con una cuenta real, noviembre de 2026): se desarma para leerlo.
export function desarmarTexto(t) {
  if (typeof t !== "string") return "";
  const recortado = t.trim();
  if (recortado.length >= 2 && recortado.startsWith('"') && recortado.endsWith('"')) {
    try { const x = JSON.parse(recortado); if (typeof x === "string") return x; } catch (e) { /* no era JSON */ }
  }
  if (!t.includes("\n") && t.includes("\\n")) return t.replace(/\\r?\\n/g, "\n").replace(/\\t/g, "\t");
  return t;
}

export function textoDe(resultado) {
  const partes = Array.isArray(resultado?.content) ? resultado.content : [];
  return partes.filter((p) => p?.type === "text" && typeof p.text === "string").map((p) => desarmarTexto(p.text)).join("\n");
}

// Lo estructurado de un resultado, si COROS lo manda: structuredContent, o un texto que es JSON.
export function jsonDe(resultado) {
  if (resultado?.structuredContent && typeof resultado.structuredContent === "object") return resultado.structuredContent;
  const t = textoDe(resultado).trim();
  if (t.startsWith("{") || t.startsWith("[")) { try { return JSON.parse(t); } catch (e) { return null; } }
  return null;
}

// Busca un campo (sin importar mayúsculas) en cualquier nivel de un JSON.
function buscarCampo(obj, nombres, prof = 0) {
  if (!obj || typeof obj !== "object" || prof > 6) return undefined;
  const claves = nombres.map((n) => n.toLowerCase());
  for (const [k, v] of Object.entries(obj)) if (claves.includes(k.toLowerCase()) && v != null && typeof v !== "object") return v;
  for (const v of Object.values(obj)) {
    const r = buscarCampo(v, nombres, prof + 1);
    if (r !== undefined) return r;
  }
  return undefined;
}

// El idInPlan que devuelve createScheduledWorkout / updateScheduledWorkout (o null).
export function idInPlanDe(resultado) {
  const j = jsonDe(resultado);
  const v = j ? buscarCampo(j, ["idInPlan"]) : undefined;
  if (v != null && /^\d+$/.test(String(v))) return String(v);
  const m = textoDe(resultado).match(/id\s*_?in\s*_?plan\W{0,4}(\d+)/i);
  return m ? m[1] : null;
}

// ¿COROS dijo que no? (el MCP lo marca con isError).
export const esRechazo = (resultado) => !resultado || resultado.isError === true;

/* ---------------------------------------------------------------------------
   ACTIVIDADES
--------------------------------------------------------------------------- */

// Códigos de actividad de COROS que son correr (los de "course" son otros: 1, 2, 5).
export const CODIGOS_DE_CARRERA = new Set([100, 101, 102, 103]);
export const esCarreraCoros = (codigo) => CODIGOS_DE_CARRERA.has(Number(codigo));

const FECHA_ISO = /(\d{4})-(\d{2})-(\d{2})/;
const FECHA_COMPACTA = /\b(20\d{2})(\d{2})(\d{2})\b/;
const fechaDeTexto = (t) => {
  const m = String(t || "").match(FECHA_ISO) || String(t || "").match(FECHA_COMPACTA);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};

// Las actividades de querySportRecords: [{ labelId, sportType, fecha }], sin repetir.
export function actividadesDe(resultado) {
  const out = new Map();
  const anotar = (labelId, sportType, fecha) => {
    const id = String(labelId || "").trim();
    if (!/^\d{6,}$/.test(id) || out.has(id)) return;
    const st = Number(sportType);
    out.set(id, { labelId: id, sportType: Number.isFinite(st) && st > 0 ? st : null, fecha: fecha || null });
  };
  // 1) Si viene estructurado.
  const recorrer = (v, prof = 0) => {
    if (!v || typeof v !== "object" || prof > 6) return;
    if (Array.isArray(v)) { v.forEach((x) => recorrer(x, prof + 1)); return; }
    const id = buscarDirecto(v, ["labelId", "label_id"]);
    if (id != null) anotar(id, buscarDirecto(v, ["sportType", "sport_type", "sportTypeCode"]), fechaDeTexto(buscarDirecto(v, ["date", "startDate", "happenDay", "startTime"])));
    Object.values(v).forEach((x) => recorrer(x, prof + 1));
  };
  recorrer(jsonDe(resultado));
  // 2) El texto: una entrada por actividad ("1. Run(100) — 2026-10-22 … LabelId: 4812…").
  const texto = textoDe(resultado);
  const entradas = texto.split(/\n(?=\s*\d+[.)]\s)/);
  for (const e of entradas) {
    const id = e.match(/label\s*_?id\W{0,4}(\d{6,})/i)?.[1];
    if (!id) continue;
    const st = e.match(/sport\s*_?type(?:\s*code)?\W{0,4}(\d{1,5})/i)?.[1] ?? e.match(/\((\d{2,5})\)/)?.[1] ?? null;
    anotar(id, st, fechaDeTexto(e));
  }
  return [...out.values()];
}

function buscarDirecto(obj, nombres) {
  const claves = nombres.map((n) => n.toLowerCase());
  for (const [k, v] of Object.entries(obj)) if (claves.includes(k.toLowerCase()) && v != null && typeof v !== "object") return v;
  return undefined;
}

// El enlace del archivo FIT de queryActivityFitFileDownloadUrls (o null).
export function enlaceFitDe(resultado) {
  const urls = [];
  const juntar = (v, prof = 0) => {
    if (prof > 6 || v == null) return;
    if (typeof v === "string") { for (const m of v.matchAll(/https?:\/\/[^\s"'<>)\]]+/g)) urls.push(m[0]); return; }
    if (typeof v === "object") Object.values(v).forEach((x) => juntar(x, prof + 1));
  };
  juntar(resultado?.structuredContent);
  juntar(textoDe(resultado));
  const limpias = urls.map((u) => u.replace(/[.,;]+$/, ""));
  return limpias.find((u) => /\.fit(\?|$)/i.test(u)) || limpias[0] || null;
}

// "COROS PACE 4" como lo piden las guías de COROS (el nombre de la marca delante).
export function modeloCoros(nombre) {
  const d = typeof nombre === "string" ? nombre.replace(/\s+/g, " ").trim() : "";
  if (!d || /^unknown$/i.test(d)) return "COROS";
  return /^coros\b/i.test(d) ? `COROS${d.slice(5)}` : `COROS ${d}`;
}
// Lo que se muestra junto a cada actividad: el reloj y de dónde vienen los datos.
export const atribucionCoros = (nombre) => `${modeloCoros(nombre)} · datos de COROS`;

// El modelo del RELOJ desde queryDevices (o null). La cuenta puede tener también accesorios
// vinculados (banda de pecho o brazo "COROS HEART RATE", POD, ciclocomputador DURA): esos no
// cuentan. Se prefiere un reloj conocido (PACE, APEX, VERTIX, NOMAD).
const RELOJES = /\b(PACE|APEX|VERTIX|NOMAD)\b/i;
const ACCESORIOS = /\b(HEART\s*RATE|HRM|POD|DURA|SENSOR|ARMBAND|STRAP|SCALE|BAND)\b/i;
export const esReloj = (n) => typeof n === "string" && /\w/.test(n.replace(/^coros\b/i, "")) && (RELOJES.test(n) || !ACCESORIOS.test(n));

export function dispositivosDe(resultado) {
  const nombres = [];
  const recorrer = (v, prof = 0) => {
    if (!v || typeof v !== "object" || prof > 6) return;
    if (Array.isArray(v)) { v.forEach((x) => recorrer(x, prof + 1)); return; }
    for (const [k, x] of Object.entries(v)) {
      if (typeof x === "string" && /^(deviceName|name|productName|model)$/i.test(k) && x.trim()) nombres.push(x.trim());
      else recorrer(x, prof + 1);
    }
  };
  recorrer(jsonDe(resultado));
  const t = textoDe(resultado);
  for (const m of t.matchAll(/\bCOROS\s+(?!MCP\b)([A-Z0-9][\w-]*(?:[ \t]+[A-Z0-9][\w-]*){0,3})/g)) nombres.push(`COROS ${m[1]}`.trim());
  for (const m of t.matchAll(/(?:device\s*name|model|name)\s*[:：]\s*([^\n|;,]+)/gi)) nombres.push(m[1].trim());
  return [...new Set(nombres)];
}

export function dispositivoDe(resultado) {
  const todos = dispositivosDe(resultado);
  return todos.find((n) => RELOJES.test(n)) || todos.find(esReloj) || null;
}

/* ---------------------------------------------------------------------------
   SALUD (texto de COROS → campos de lib/salud.mjs)

   Las fechas son las del día en que despertó (la noche que termina el martes es del martes).
   Un 0 en el puntaje de sueño es "todavía no hay dato", no un puntaje.
--------------------------------------------------------------------------- */

// Parte el texto en bloques por fecha: { "YYYY-MM-DD": "texto del bloque" }.
export function bloquesPorFecha(texto) {
  const out = {};
  const lineas = String(texto || "").split(/\r?\n/);
  let actual = null;
  for (const linea of lineas) {
    // La fecha al inicio de la línea: 2026-10-15, 2026/10/15 o 20261015, sola o con etiqueta
    // ("Date: …"). No cuenta si le sigue una hora (eso es la ventana de sueño, no un día nuevo).
    const m = linea.match(/^[^\w]{0,6}(?:(?:date|fecha|day)\s*[:：]?\s*)?(\d{4})[-/]?(\d{2})[-/]?(\d{2})\b(?!\s*\d{2}:\d{2})(.*)$/i);
    if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12 && Number(m[3]) >= 1 && Number(m[3]) <= 31) {
      actual = `${m[1]}-${m[2]}-${m[3]}`;
      out[actual] = (out[actual] ? out[actual] + "\n" : "") + m[4];
      continue;
    }
    if (actual) out[actual] += "\n" + linea;
  }
  return out;
}

const minutosDe = (t) => {
  if (!t) return null;
  const h = t.match(/(\d+)\s*h/i), m = t.match(/(\d+)\s*min/i);
  if (!h && !m) return null;
  return (h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0);
};
const numeroTras = (bloque, re) => {
  const m = bloque.match(re);
  if (!m) return null;
  const v = Number(String(m[1]).replace(/,/g, ""));
  return Number.isFinite(v) ? v : null;
};

export function sueñoDeCoros(texto) {
  const out = {};
  for (const [fecha, b] of Object.entries(bloquesPorFecha(texto))) {
    const puntaje = numeroTras(b, /sleep\s*score\s*[:：]\s*(\d+)/i);
    const principal = minutosDe(b.match(/main\s*sleep\s*\(asleep\)\s*[:：]\s*([^\n]+)/i)?.[1]);
    if (!(puntaje > 0) && !(principal > 0)) continue; // todavía no hay noche
    const datos = {};
    if (puntaje > 0) datos.sueñoPuntaje = puntaje;
    if (principal > 0) datos.sueñoMin = principal;
    const despierto = minutosDe(b.match(/awake\s*time\s*[:：]\s*([^\n]+)/i)?.[1]);
    if (despierto != null) datos.despiertoMin = despierto;
    out[fecha] = datos;
  }
  return out;
}

export function vfcDeCoros(texto) {
  const out = {};
  for (const [fecha, b] of Object.entries(bloquesPorFecha(texto))) {
    const v = numeroTras(b, /(?:hrv\s*avg|avg\.?\s*hrv|average\s*hrv|daily\s*(?:average|avg)\s*hrv)[^:\n：]*[:：]\s*(\d+(?:\.\d+)?)/i)
      ?? numeroTras(b.split(/\n/).filter((l) => !/baseline|range|normal/i.test(l)).join("\n"), /hrv[^:\n：]*[:：]\s*(\d+(?:\.\d+)?)\s*ms/i);
    if (v > 0) out[fecha] = { vfc: v };
  }
  return out;
}

export function reposoDeCoros(texto) {
  const out = {};
  for (const [fecha, b] of Object.entries(bloquesPorFecha(texto))) {
    const v = numeroTras(b, /(\d{2,3})\s*bpm/i);
    if (v > 0) out[fecha] = { fcReposo: v };
  }
  return out;
}

export function diarioDeCoros(texto) {
  const out = {};
  for (const [fecha, b] of Object.entries(bloquesPorFecha(texto))) {
    const datos = {};
    const pasos = numeroTras(b, /steps?\s*[:：]\s*([\d,]+)/i);
    if (pasos != null) datos.pasos = pasos;
    const cal = numeroTras(b, /calories?\s*[:：]\s*([\d,]+)/i);
    if (cal != null) datos.calorias = cal;
    // "Stress: Avg 28" (así lo manda COROS) o "Average Stress: 28".
    const estres = numeroTras(b, /(?:avg\.?\s*|average\s*)?stress(?:\s*level)?\s*[:：]\s*(?:avg\.?\s*|average\s*)?(\d+)/i);
    if (estres != null && estres >= 0) datos.estres = estres;
    // Fases del sueño del resumen diario: "Sleep Summary: Total: 7h 12min | Deep: 1h 30min | …".
    const resumen = b.split(/sleep\s*summary/i)[1] || "";
    const fase = (nombre) => minutosDe(resumen.match(new RegExp(`${nombre}\\s*[:：]\\s*([^|\\n]+)`, "i"))?.[1]);
    const fases = { sueñoProfundoMin: fase("deep"), sueñoLigeroMin: fase("light"), sueñoRemMin: fase("rem") };
    for (const [k, v] of Object.entries(fases)) if (v != null) datos[k] = v;
    if (Object.keys(datos).length) out[fecha] = datos;
  }
  return out;
}

// Junta lo de cada consulta: { "YYYY-MM-DD": { campos } }.
export function saludDesdeCoros({ sueño = "", vfc = "", reposo = "", diario = "" } = {}) {
  const out = {};
  for (const parte of [diarioDeCoros(diario), reposoDeCoros(reposo), sueñoDeCoros(sueño), vfcDeCoros(vfc)]) {
    for (const [fecha, datos] of Object.entries(parte)) out[fecha] = { ...(out[fecha] || {}), ...datos };
  }
  return out;
}

/* ---------------------------------------------------------------------------
   AL DESCONECTAR

   El acuerdo de COROS pide borrar (o dejar sin identificar) lo que vino de COROS dentro de las
   24 horas en que el usuario retira el permiso. Se hace en el momento: de cada sesión se borra
   el detalle del reloj (vueltas, km por km, paso a paso, frecuencia, modelo…) y se queda lo que
   el alumno lleva en su registro (hecho, km y ritmo). Las salidas sueltas quedan en km y tiempo.
--------------------------------------------------------------------------- */

const esDeCoros = (r) => r?.fuente === "coros";
const basico = (r) => {
  const b = { fuente: "coros", retirado: true };
  for (const k of ["id", "dia", "fecha", "km", "min", "ritmo"]) if (r?.[k] != null) b[k] = r[k];
  if (typeof b.fecha === "string") b.fecha = b.fecha.slice(0, 10);
  return b;
};

export function sinDetalleDeCoros(student) {
  if (!student || typeof student !== "object") return { student, cambios: 0 };
  let cambios = 0;
  const weeks = {};
  for (const [n, w] of Object.entries(student.weeks || {})) {
    let semana = w;
    if (Array.isArray(w?.log) && w.log.some((l) => esDeCoros(l?.reloj))) {
      semana = { ...semana, log: w.log.map((l) => {
        if (!esDeCoros(l?.reloj)) return l;
        cambios++;
        const { reloj: _r, ...resto } = l;
        return resto;
      }) };
    }
    if (Array.isArray(w?.extras) && w.extras.some((x) => esDeCoros(x) && !x.retirado)) {
      semana = { ...semana, extras: w.extras.map((x) => {
        if (!esDeCoros(x) || x.retirado) return x;
        cambios++;
        return basico(x);
      }) };
    }
    weeks[n] = semana;
  }
  return { student: cambios ? { ...student, weeks } : student, cambios };
}

// Para revisar el formato de una respuesta sin mostrar los datos: cada dígito se cambia por "#".
export const enmascarar = (t, n = 600) => String(t || "").replace(/\d/g, "#").slice(0, n);
