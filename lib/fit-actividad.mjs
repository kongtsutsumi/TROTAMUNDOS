// Lee el archivo FIT de una actividad (el formato que graban Garmin, COROS, Polar, Suunto,
// Wahoo…) y lo deja con la misma forma que las actividades de intervals.icu.
//
// Para qué: todo el análisis que ya existe —el resumen, el paso a paso, el kilómetro a
// kilómetro, las paradas— está escrito sobre la forma de intervals.icu (lib/intervals-read.mjs).
// Convirtiendo el FIT a esa forma, cualquier marca que entregue el archivo de la actividad
// (Garmin directo, COROS directo) usa exactamente el mismo análisis, sin duplicarlo.
//
// Usa el SDK oficial y público del formato FIT (@garmin/fitsdk). Es puro: recibe los bytes y
// devuelve datos; no habla con la red. Pruebas: tests/fit-actividad.test.mjs.
import { Decoder, Stream } from "@garmin/fitsdk";

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const segDesdeInicio = (ts, inicio) => (ts instanceof Date && inicio instanceof Date ? (ts - inicio) / 1000 : null);

// "2026-11-10T06:15:00" en la hora local del reloj (si el FIT trae la diferencia horaria).
function fechaLocal(fecha, localTs) {
  if (!(fecha instanceof Date)) return null;
  let d = fecha;
  if (typeof localTs === "number") {
    // localTimestamp viene en segundos desde la época FIT (1989-12-31) en hora local.
    const local = new Date((localTs + 631065600) * 1000);
    if (Number.isFinite(local.getTime())) d = local;
    return d.toISOString().slice(0, 19);
  }
  return d.toISOString().slice(0, 19);
}

// Cadencia de carrera en FIT: zancadas por minuto (un pie). intervals.icu la entrega igual,
// y lib/intervals-read.mjs ya la pasa a pasos por minuto. Se respeta esa convención.
const cadencia = (m) => num(m?.avgRunningCadence) ?? num(m?.avgCadence);

export function decodificarFit(bytes) {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const stream = Stream.fromByteArray(Array.from(buf));
  if (!Decoder.isFIT(stream)) return { error: "no es un archivo FIT" };
  const decoder = new Decoder(stream);
  if (!decoder.checkIntegrity()) return { error: "archivo FIT dañado" };
  const { messages, errors } = decoder.read({ convertDateTimesToDates: true, expandComponents: true, mergeHeartRates: true });
  if (errors?.length && !messages?.sessionMesgs?.length) return { error: "no se pudo leer el archivo FIT" };
  return { messages };
}

// FIT → { actividad, vueltas, streams } con la forma de intervals.icu.
//   id: el identificador de la actividad en la marca (para no contarla dos veces).
export function actividadDesdeFit(bytes, { id = null, nombre = null, dispositivo = null } = {}) {
  const { messages, error } = decodificarFit(bytes);
  if (error) return { error };
  const sesion = messages.sessionMesgs?.[0];
  if (!sesion) return { error: "el archivo no trae una sesión" };

  const inicio = sesion.startTime instanceof Date ? sesion.startTime : messages.recordMesgs?.[0]?.timestamp;
  const localTs = messages.activityMesgs?.[0]?.localTimestamp;
  const deporte = String(sesion.sport || "").toLowerCase();

  const actividad = {
    id,
    type: deporte === "running" ? "Run" : deporte || null,
    name: nombre,
    device_name: dispositivo || nombreDelDispositivo(messages),
    start_date_local: fechaLocal(inicio, localTs),
    distance: num(sesion.totalDistance),
    moving_time: num(sesion.totalTimerTime),
    elapsed_time: num(sesion.totalElapsedTime),
    average_heartrate: num(sesion.avgHeartRate),
    max_heartrate: num(sesion.maxHeartRate),
    average_cadence: cadencia(sesion),
    total_elevation_gain: num(sesion.totalAscent),
    total_elevation_loss: num(sesion.totalDescent),
    calories: num(sesion.totalCalories),
  };

  const vueltas = (messages.lapMesgs || []).map((l, i) => ({
    type: l.intensity ? String(l.intensity) : null,
    label: `Vuelta ${i + 1}`,
    distance: num(l.totalDistance),
    moving_time: num(l.totalTimerTime),
    elapsed_time: num(l.totalElapsedTime),
    average_heartrate: num(l.avgHeartRate),
  }));

  // Series segundo a segundo: tiempo desde el inicio, distancia, velocidad y frecuencia.
  const time = [], distance = [], velocity = [], heartrate = [];
  for (const r of messages.recordMesgs || []) {
    const t = segDesdeInicio(r.timestamp, inicio);
    const d = num(r.distance);
    if (t == null || d == null) continue;
    time.push(Math.round(t));
    distance.push(d);
    velocity.push(num(r.enhancedSpeed) ?? num(r.speed));
    heartrate.push(num(r.heartRate));
  }
  const streams = time.length > 1 ? [
    { type: "time", data: time },
    { type: "distance", data: distance },
    { type: "velocity_smooth", data: velocity },
    ...(heartrate.some((h) => h != null) ? [{ type: "heartrate", data: heartrate }] : []),
  ] : [];

  return { actividad, vueltas, streams };
}

function nombreDelDispositivo(messages) {
  const d = (messages.deviceInfoMesgs || []).find((x) => x?.deviceIndex === "creator" || x?.deviceIndex === 0) || messages.fileIdMesgs?.[0];
  const marca = d?.manufacturer ? String(d.manufacturer) : null;
  const modelo = d?.productName || (d?.garminProduct ? String(d.garminProduct) : null);
  return [marca, modelo].filter(Boolean).join(" ") || null;
}
