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
//   ritmo:       4:26/km Pace
//   repetir:     una línea "6x" y debajo los pasos, con una línea en blanco antes y después
//
// La traducción parte de buildLiveSegments, que es LA MISMA estructura que ve el alumno en
// el modo de entrenamiento en vivo. Así lo que llega al reloj y lo que muestra la app no
// pueden discrepar: si algún día cambia el motor, cambian los dos a la vez.

import { buildLiveSegments, formatPace, R_RECOVERY_MIN, localDateISO, mondayOf } from "./plan-engine.mjs";

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

function lineaDePaso(etiqueta, seg) {
  const medida = seg.type === "distance" ? fmtDistancia(seg.target) : fmtTiempo(seg.target);
  if (!medida) return null; // un paso sin duración ni distancia no tiene sentido en el reloj
  const ritmo = fmtRitmo(seg.pace);
  return `- ${etiqueta ? etiqueta + " " : ""}${medida}${ritmo ? " " + ritmo : ""}`;
}

// --- Traducción de una sesión ----------------------------------------------------
const ES_REPETICION = /^(.*?)\s*(\d+)\s+de\s+(\d+)$/;

export function sesionATexto(day, easyPace) {
  if (!day || !day.paceKey) return null;
  const segs = buildLiveSegments(day, easyPace) || [];
  if (!segs.length) return null;

  const esRepeticion = (seg) => ES_REPETICION.exec(seg?.label || "");
  const lineas = [];
  let i = 0;

  while (i < segs.length) {
    const m = esRepeticion(segs[i]);
    if (!m) {
      const linea = lineaDePaso(segs[i].label, segs[i]);
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

    lineas.push("", `${total}x`, lineaDePaso(nombre, trabajo));
    if (recuperacion) {
      const linea = lineaDePaso(recuperacion.label, recuperacion);
      if (linea) lineas.push(linea);
    }
    lineas.push("");
    i = j;
  }

  return lineas.filter((l) => l !== null).join("\n").replace(/\n{3,}/g, "\n\n").trim() || null;
}

// --- Construcción de los eventos de una semana ------------------------------------
// Devuelve el cuerpo listo para POST /athlete/{id}/events/bulk?upsert=true
export function semanaAEventos(student, weekNum, { lunes } = {}) {
  const week = student?.weeks?.[weekNum];
  if (!week || !Array.isArray(week.plan)) return [];
  const easyPace = student.paces?.E ?? null;
  const inicio = lunes instanceof Date ? mondayOf(lunes) : semanaLunes(student, weekNum);
  if (!inicio) return [];

  const eventos = [];
  week.plan.forEach((day, idx) => {
    if (!day?.paceKey) return; // los descansos no se mandan al reloj
    const texto = sesionATexto(day, easyPace);
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

function eventosComoTexto(student, weekNum) {
  if (!student?.weeks?.[weekNum]) return "[]";
  try { return JSON.stringify(semanaAEventos(student, weekNum)); } catch (e) { return "[]"; }
}

// Después de guardar la ficha de un alumno: ¿qué semanas hay que volver a mandar al reloj?
//
// Se compara lo que vería el reloj —los entrenamientos que se mandarían— antes y después
// del guardado. Así solo cuenta lo que de verdad cambia en el reloj: editar un ritmo, pasar
// un día a descanso, cerrar la semana y generar la siguiente, deshacer. Y no cuenta lo que
// no le importa: un RPE, una nota, un dato del reporte.
//
// Las semanas que ya terminaron no se tocan: lo pasado es historial.
export function semanasParaReenviar(antes, despues, hoy) {
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
    if (eventosComoTexto(antes, n) !== eventosComoTexto(despues, n)) cambiadas.push(n);
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
