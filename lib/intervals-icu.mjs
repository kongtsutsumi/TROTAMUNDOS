// Traducción de las sesiones de TROTAMUNDOS al formato de intervals.icu.
//
// Para qué: intervals.icu reenvía los entrenamientos planificados a Garmin, COROS, Wahoo y
// Suunto. Escribiendo en el calendario del alumno, el plan que diseña el coach le aparece
// en el reloj, estructurado y con los ritmos objetivo.
//
// Es código puro: traduce y arma el cuerpo de la petición, pero no habla con la red. Quien
// llama se encarga de eso. Así se puede probar entero sin tocar nada de afuera.
//
// La sintaxis de intervals.icu, en resumen:
//   cada paso:   "- <duración o distancia> <objetivo>"
//   distancia:   600mtr / 3km        OJO: "m" significa MINUTOS, no metros
//   tiempo:      30m / 90s / 1m30s
//   ritmo:       4:26/km Pace       rango: 4:31-4:21/km Pace (ver "Alertas de ritmo")
//   repetir:     una línea "6x" y debajo los pasos, con una línea en blanco antes y después
//
// La traducción parte de buildLiveSegments, que es LA MISMA estructura que ve el alumno en
// el modo de entrenamiento en vivo. Así lo que llega al reloj y lo que muestra la app no
// pueden discrepar: si algún día cambia el motor, cambian los dos a la vez.

import { buildLiveSegments, formatPace, R_RECOVERY_MIN, localDateISO, mondayOf, admiteCalentamientoLibre } from "./plan-engine.mjs";

export const INTERVALS_API = "https://intervals.icu/api/v1";

// Prefijo de los identificadores propios. intervals.icu actualiza el evento que ya tenga ese
// identificador en vez de duplicarlo, así que reenviar una semana corregida pisa la anterior
// en el reloj en lugar de dejar dos versiones.
export const EXTERNAL_ID_PREFIX = "trotamundos";

export function externalIdFor(studentId, weekNum, dayIndex) {
  return `${EXTERNAL_ID_PREFIX}-${studentId}-s${weekNum}-d${dayIndex}`;
}

// --- Formato de cada pieza -----------------------------------------------------
export function fmtDistancia(km) {
  if (!(km > 0)) return null;
  return km >= 1 ? `${Number(km.toFixed(2))}km` : `${Math.round(km * 1000)}mtr`;
}

export function fmtTiempo(min) {
  const seg = Math.round((min || 0) * 60);
  if (seg <= 0) return null;
  if (seg < 60) return `${seg}s`;
  if (seg % 60 === 0) return `${seg / 60}m`;
  return `${Math.floor(seg / 60)}m${seg % 60}s`;
}

export function fmtRitmo(paceDecimal) {
  return paceDecimal ? `${formatPace(paceDecimal)}/km Pace` : null;
}

// --- Alertas de ritmo en el reloj ----------------------------------------------------
//
// Un paso con ritmo objetivo hace que el reloj avise (vibra o suena) si el alumno va más
// rápido o más lento. intervals.icu le pone un margen propio a cualquier ritmo que reciba,
// así que el reloj avisa SIEMPRE que un paso lleve ritmo. Por eso:
//
//   · Con alertas: solo los bloques rápidos de las sesiones de calidad y el cuerpo de los
//     fondos llevan ritmo, como rango de ±5 segundos por km.
//   · Todo lo demás —calentamiento, recuperaciones, enfriamiento, rodajes suaves, run/walk,
//     y todo cuando las alertas están apagadas— va SIN ritmo objetivo. El ritmo se escribe
//     igual en el nombre del paso, "(ritmo 5'22)", para que el alumno lo vea en el reloj;
//     escrito así no es un objetivo y no dispara alertas.
export const MARGEN_RITMO_SEG = 5;

const CALIDAD = new Set(["M", "race", "T", "brokenT", "I", "R", "fartlek"]);
const NO_ES_BLOQUE = /^(warm-up|cool-down|recuperaci[oó]n|caminata)/i;

export function tipoParaAlertas(day) {
  if (!day?.paceKey) return null;
  if (day.slot === "long" || day.paceKey === "long") return "fondo";
  if (CALIDAD.has(day.paceKey)) return "calidad";
  return null; // suaves, run/walk, etapas de principiantes y tipos sin ritmo propio
}

export function pasoConAlerta(seg, day) {
  const tipo = tipoParaAlertas(day);
  if (!tipo || !seg?.pace || NO_ES_BLOQUE.test(seg.label || "")) return false;
  // En calidad solo el trabajo: un paso a ritmo suave no es un bloque rápido.
  if (tipo === "calidad" && day.easyPace && Math.abs(seg.pace - day.easyPace) < 1e-9) return false;
  return true;
}

function minSeg(totalSeg) {
  const s = Math.round(totalSeg);
  return [Math.floor(s / 60), s % 60];
}

// Rango de ±5 s/km, del más lento al más rápido, como lo escribe intervals.icu.
export function fmtRango(paceDecimal, margenSeg = MARGEN_RITMO_SEG) {
  if (!paceDecimal) return null;
  const base = paceDecimal * 60;
  const [lm, ls] = minSeg(base + margenSeg);
  const [rm, rs] = minSeg(base - margenSeg);
  return `${lm}:${String(ls).padStart(2, "0")}-${rm}:${String(rs).padStart(2, "0")}/km Pace`;
}

// "(ritmo 5'22)": el ritmo como texto, que el reloj muestra pero no usa como objetivo.
export function ritmoComoTexto(paceDecimal) {
  if (!paceDecimal) return null;
  const [m, s] = minSeg(paceDecimal * 60);
  return `(ritmo ${m}'${String(s).padStart(2, "0")})`;
}

// ¿Este alumno tiene las alertas encendidas? Se encienden en dos llaves:
//   · el coach, alumno por alumno: "on" u "off" (sin elegir, desactivadas);
//   · el alumno: solo si el coach se las habilitó, puede apagarlas o prenderlas para sí.
// `general` es el interruptor para todos que existió un tiempo: ya no se puede cambiar, y
// solo decide para quien el coach todavía no eligió nada.
export function alertasHabilitadasPorCoach(student, general) {
  const modo = student?.alertasRitmo?.coach || "general";
  if (modo === "on") return true;
  if (modo === "off") return false;
  return !!general;
}
export function alertasEfectivas(student, general) {
  return alertasHabilitadasPorCoach(student, general) && student?.alertasRitmo?.alumno !== false;
}

// Al guardar la ficha: cada uno solo cambia SU llave. El coach no puede pisar la preferencia
// del alumno con una copia vieja de su pantalla, y el alumno no puede habilitarse lo que el
// coach le desactivó.
const MODOS_COACH = new Set(["general", "on", "off"]);
export function fusionarAlertas(rol, entrante, guardado) {
  const g = guardado && typeof guardado === "object" ? guardado : {};
  const e = entrante && typeof entrante === "object" ? entrante : {};
  const coach = rol === "coach" && MODOS_COACH.has(e.coach) ? e.coach : g.coach;
  const alumno = rol === "student" && typeof e.alumno === "boolean" ? e.alumno : g.alumno;
  const out = {};
  if (coach !== undefined) out.coach = coach;
  if (alumno !== undefined) out.alumno = alumno;
  return Object.keys(out).length ? out : undefined;
}

// Calentamiento y enfriamiento libres ("Press lap"): el paso conserva su distancia como
// referencia, pero en el reloj no termina solo: avanza cuando el alumno presiona LAP.
// Se encienden en dos llaves: el coach se lo permite al alumno (calentamientoLibrePermitido)
// y luego se prende sesión por sesión (day.calentamientoLibre), lo puede hacer el alumno o
// el coach.
export const PASOS_LIBRES = new Set(["Warm-up", "Cool-down"]);
export function calentamientoLibreActivo(student, day) {
  return student?.calentamientoLibrePermitido === true && day?.calentamientoLibre === true && admiteCalentamientoLibre(day);
}

function lineaDePaso(etiqueta, seg, conRitmoObjetivo, conLap = false) {
  const medida = seg.type === "distance" ? fmtDistancia(seg.target) : fmtTiempo(seg.target);
  if (!medida) return null; // un paso sin duración ni distancia no tiene sentido en el reloj
  const objetivo = conRitmoObjetivo ? fmtRango(seg.pace) : null;
  const texto = !objetivo ? ritmoComoTexto(seg.pace) : null;
  const nombre = [conLap ? "Press lap" : null, etiqueta, texto].filter(Boolean).join(" ");
  return `- ${nombre ? nombre + " " : ""}${medida}${objetivo ? " " + objetivo : ""}`;
}

// --- Traducción de una sesión ----------------------------------------------------
const ES_REPETICION = /^(.*?)\s*(\d+)\s+de\s+(\d+)$/;

export function sesionATexto(day, easyPace, { alertas = false, libre = false } = {}) {
  if (!day || !day.paceKey) return null;
  const objetivo = (seg) => alertas && pasoConAlerta(seg, day);
  const conLap = (seg) => libre && PASOS_LIBRES.has(seg?.label);
  const segs = buildLiveSegments(day, easyPace) || [];
  if (!segs.length) return null;

  const esRepeticion = (seg) => ES_REPETICION.exec(seg?.label || "");
  const lineas = [];
  let i = 0;

  while (i < segs.length) {
    const m = esRepeticion(segs[i]);
    if (!m) {
      const linea = lineaDePaso(segs[i].label, segs[i], objetivo(segs[i]), conLap(segs[i]));
      if (linea) lineas.push(linea);
      i++;
      continue;
    }

    // Bloque repetido: se emite una sola vez como "Nx" y se consumen sus repeticiones.
    const nombre = m[1].trim();
    const total = Number(m[3]);
    const trabajo = segs[i];
    let recuperacion = null;
    let j = i;

    while (j < segs.length) {
      const mm = esRepeticion(segs[j]);
      if (!mm || mm[1].trim() !== nombre || Number(mm[3]) !== total) break;
      j++;
      // El paso siguiente es la recuperación del bloque SOLO si después viene otra
      // repetición. Si no, pertenece a la sesión: típicamente el cool-down, que el motor
      // coloca justo detrás de la última serie.
      if (j < segs.length && !esRepeticion(segs[j]) && esRepeticion(segs[j + 1])) {
        if (!recuperacion) recuperacion = segs[j];
        j++;
      }
    }

    // El motor emite la recuperación también después de la última repetición (en los
    // bloques de trote/caminata y de strides). El "Nx" ya incluye N recuperaciones, así
    // que esa última sobra. Solo se descarta si es la misma: un cool-down lleva otra
    // etiqueta y se respeta.
    if (recuperacion && segs[j] && !esRepeticion(segs[j]) && segs[j].label === recuperacion.label) j++;

    lineas.push("", `${total}x`, lineaDePaso(nombre, trabajo, objetivo(trabajo)));
    if (recuperacion) {
      const linea = lineaDePaso(recuperacion.label, recuperacion, objetivo(recuperacion));
      if (linea) lineas.push(linea);
    }
    lineas.push("");
    i = j;
  }

  return lineas.filter((l) => l !== null).join("\n").replace(/\n{3,}/g, "\n\n").trim() || null;
}

// --- Construcción de los eventos de una semana ------------------------------------
// Devuelve el cuerpo listo para POST /athlete/{id}/events/bulk?upsert=true
// `alertas`: si este alumno tiene las alertas de ritmo encendidas (ver alertasEfectivas).
export function semanaAEventos(student, weekNum, { lunes, alertas = false } = {}) {
  const week = student?.weeks?.[weekNum];
  if (!week || !Array.isArray(week.plan)) return [];
  const easyPace = student.paces?.E ?? null;
  const inicio = lunes instanceof Date ? mondayOf(lunes) : semanaLunes(student, weekNum);
  if (!inicio) return [];

  const eventos = [];
  week.plan.forEach((day, idx) => {
    if (!day?.paceKey) return; // los descansos no se mandan al reloj
    const texto = sesionATexto(day, easyPace, { alertas, libre: calentamientoLibreActivo(student, day) });
    if (!texto) return;
    const fecha = new Date(inicio);
    fecha.setDate(fecha.getDate() + idx);
    eventos.push({
      category: "WORKOUT",
      start_date_local: `${localDateISO(fecha)}T00:00:00`,
      type: "Run",
      name: `${day.type}${day.km ? ` · ${day.km} km` : ""}`,
      description: texto,
      external_id: externalIdFor(student.id, weekNum, idx),
    });
  });
  return eventos;
}

// Primer y último día (lunes a domingo) de una semana del plan, como "YYYY-MM-DD".
export function rangoDeSemana(student, weekNum) {
  const lunes = semanaLunes(student, weekNum);
  if (!lunes) return null;
  const domingo = new Date(lunes);
  domingo.setDate(domingo.getDate() + 6);
  return { desde: localDateISO(lunes), hasta: localDateISO(domingo) };
}

function eventosComoTexto(student, weekNum, general) {
  if (!student?.weeks?.[weekNum]) return "[]";
  try { return JSON.stringify(semanaAEventos(student, weekNum, { alertas: alertasEfectivas(student, general) })); } catch (e) { return "[]"; }
}

// Después de guardar la ficha de un alumno: ¿qué semanas hay que volver a mandar al reloj?
//
// Se compara lo que vería el reloj —los entrenamientos que se mandarían— antes y después
// del guardado. Así solo cuenta lo que de verdad cambia en el reloj: editar un ritmo, pasar
// un día a descanso, cerrar la semana y generar la siguiente, deshacer. Y no cuenta lo que
// no le importa: un RPE, una nota, un dato del reporte.
//
// Las semanas que ya terminaron no se tocan: lo pasado es historial.
// `general`: el interruptor general de alertas del coach. Prender o apagar las alertas de
// un alumno cambia lo que vería el reloj, así que también provoca el reenvío.
export function semanasParaReenviar(antes, despues, hoy, { general = false } = {}) {
  const quien = despues || antes;
  if (!quien) return [];
  const numeros = new Set(
    [...Object.keys(antes?.weeks || {}), ...Object.keys(despues?.weeks || {})]
      .map(Number).filter((n) => Number.isFinite(n) && n >= 1),
  );
  const cambiadas = [];
  for (const n of [...numeros].sort((a, b) => a - b)) {
    const rango = rangoDeSemana(quien, n);
    if (!rango) continue;
    if (hoy && rango.hasta < hoy) continue;
    if (eventosComoTexto(antes, n, general) !== eventosComoTexto(despues, n, general)) cambiadas.push(n);
  }
  return cambiadas;
}

// Lunes de una semana concreta del plan del alumno.
export function semanaLunes(student, weekNum) {
  if (!student?.planStartMonday) return null;
  const inicio = new Date(student.planStartMonday + "T00:00:00");
  if (isNaN(inicio)) return null;
  inicio.setDate(inicio.getDate() + (weekNum - 1) * 7);
  return inicio;
}

// --- Peticiones ------------------------------------------------------------------
// Dos formas de identificarse: la clave personal de un atleta (pruebas y uso propio) o el
// testigo OAuth de la app (cada alumno autoriza el suyo). El resto es idéntico.
export function cabeceras({ apiKey, token }) {
  const auth = token
    ? `Bearer ${token}`
    : "Basic " + Buffer.from(`API_KEY:${apiKey}`).toString("base64");
  return { Authorization: auth, "Content-Type": "application/json" };
}

// Escribe (o actualiza) los entrenamientos de una semana en el calendario del atleta.
// athleteId "0" significa "el atleta dueño de esta credencial".
export async function enviarEventos(eventos, credencial, athleteId = "0") {
  if (!eventos.length) return { ok: true, enviados: 0 };
  const res = await fetch(`${INTERVALS_API}/athlete/${athleteId}/events/bulk?upsert=true`, {
    method: "POST",
    headers: cabeceras(credencial),
    body: JSON.stringify(eventos),
  });
  if (!res.ok) {
    const detalle = await res.text().catch(() => "");
    return { ok: false, estado: res.status, detalle: detalle.slice(0, 400), enviados: 0 };
  }
  return { ok: true, enviados: eventos.length };
}

// Borra los entrenamientos que esta app haya puesto en un rango de fechas. Se identifican
// por el prefijo del identificador propio, así que nunca toca lo que el atleta haya
// creado por su cuenta.
export async function borrarEventos(credencial, { desde, hasta, athleteId = "0", filtro } = {}) {
  const res = await fetch(`${INTERVALS_API}/athlete/${athleteId}/events?oldest=${desde}&newest=${hasta}`, {
    headers: cabeceras(credencial),
  });
  if (!res.ok) return { ok: false, estado: res.status, borrados: 0 };
  const eventos = (await res.json().catch(() => [])) || [];
  const mios = eventos.filter((e) => {
    const id = e?.external_id || "";
    if (!id.startsWith(EXTERNAL_ID_PREFIX)) return false;
    return filtro ? filtro(e) : true;
  });
  if (!mios.length) return { ok: true, borrados: 0 };
  const del = await fetch(`${INTERVALS_API}/athlete/${athleteId}/events/bulk-delete`, {
    method: "PUT",
    headers: cabeceras(credencial),
    body: JSON.stringify(mios.map((e) => ({ id: e.id }))),
  });
  return { ok: del.ok, estado: del.status, borrados: del.ok ? mios.length : 0 };
}

// --- Ritmo umbral del alumno en intervals.icu --------------------------------------
//
// Sin ritmo umbral en su ajuste de carrera, intervals.icu no pasa los ritmos objetivo a
// Garmin: cada paso llega "sin objetivo" y el reloj no avisa. Se usa el ritmo T que la app
// ya calcula con el VDOT.
//
// Se respeta lo que el alumno haya puesto por su cuenta: solo se escribe si está vacío o si
// el valor guardado es el que puso esta app la última vez (y el VDOT cambió).
// intervals.icu guarda el ritmo umbral en metros por segundo.
export function ritmoAMetrosPorSegundo(paceDecimal) {
  return paceDecimal > 0 ? Math.round((1000 / (paceDecimal * 60)) * 10000) / 10000 : null;
}

export function decidirUmbral({ ritmoT, actual, puestoPorNosotros }) {
  const valor = ritmoAMetrosPorSegundo(ritmoT);
  if (!valor) return { accion: "nada", motivo: "sin-ritmo-t" };
  const igual = (a, b) => a != null && b != null && Math.abs(a - b) < 0.001;
  if (igual(actual, valor)) return { accion: "nada", valor, motivo: "ya-esta" };
  if (actual == null || actual === 0 || igual(actual, puestoPorNosotros)) return { accion: "poner", valor };
  return { accion: "nada", valor: actual, motivo: "puesto-por-el-alumno" };
}

// Lee el ajuste de carrera y, si corresponde, escribe el ritmo umbral. No lanza.
export async function asegurarRitmoUmbral(credencial, athleteId, { ritmoT, puestoPorNosotros } = {}) {
  try {
    const res = await fetch(`${INTERVALS_API}/athlete/${athleteId}/sport-settings`, { headers: cabeceras(credencial) });
    if (res.status === 401 || res.status === 403) return { ok: false, motivo: "sin-permiso" };
    if (!res.ok) return { ok: false, motivo: `lectura:${res.status}` };
    const ajustes = (await res.json().catch(() => [])) || [];
    const carrera = (Array.isArray(ajustes) ? ajustes : []).find((a) => Array.isArray(a?.types) && a.types.includes("Run"));
    if (!carrera?.id) return { ok: false, motivo: "sin-ajuste-de-carrera" };
    const d = decidirUmbral({ ritmoT, actual: carrera.threshold_pace ?? null, puestoPorNosotros });
    if (d.accion !== "poner") return { ok: d.motivo !== "sin-ritmo-t", motivo: d.motivo, valor: d.valor ?? null, propio: d.motivo === "puesto-por-el-alumno" };
    const put = await fetch(`${INTERVALS_API}/athlete/${athleteId}/sport-settings/${carrera.id}`, {
      method: "PUT", headers: cabeceras(credencial), body: JSON.stringify({ threshold_pace: d.valor }),
    });
    if (put.status === 401 || put.status === 403) return { ok: false, motivo: "sin-permiso" };
    if (!put.ok) return { ok: false, motivo: `escritura:${put.status}` };
    return { ok: true, motivo: "puesto", valor: d.valor, nuestro: d.valor };
  } catch (e) {
    return { ok: false, motivo: "red" };
  }
}
