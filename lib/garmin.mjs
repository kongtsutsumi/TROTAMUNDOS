// Garmin directo: la parte pura (sin red ni base de datos). Pruebas: tests/garmin.test.mjs.
//
//   · El entrenamiento de cada día en el formato de la Training API de Garmin, armado desde
//     los mismos pasos que recibe intervals.icu (sesionAPasos). Lo que ve el reloj es lo
//     mismo venga por donde venga.
//   · Una actividad de Garmin (Activity Details) convertida a la forma de intervals.icu, para
//     que el resumen, el paso a paso, el km por km y las paradas sean el mismo análisis.
//   · Los resúmenes de salud de Garmin (Health API) convertidos a los campos de la tabla de
//     salud (lib/salud.mjs).
//   · La atribución que exigen las guías de marca de Garmin: "Garmin [modelo]".
//
// La parte que habla con Garmin está en lib/garmin-servidor.js.

import { sesionAPasos, MARGEN_RITMO_SEG, calentamientoLibreActivo, semanaLunes, ritmoComoTexto } from "./intervals-icu.mjs";
import { localDateISO, nombreDeSesion } from "./plan-engine.mjs";

export const PROVEEDOR = "TROTAMUNDOS"; // workoutProvider / workoutSourceId (máx. 20)
export const MAX_PASOS = 100;          // Training API: un deporte, hasta 100 pasos

/* ---------------------------------------------------------------------------
   ENTRENAMIENTOS (Training API)
--------------------------------------------------------------------------- */

const INTENSIDAD = { warmup: "WARMUP", cooldown: "COOLDOWN", recover: "RECOVERY", active: "INTERVAL" };

// min/km → m/s
export const ritmoAVelocidad = (min) => (min > 0 ? Math.round((1000 / (min * 60)) * 10000) / 10000 : null);

const recortar = (s, n) => (typeof s === "string" && s.length > n ? s.slice(0, n) : s);

function pasoGarmin(p, orden) {
  const libre = !!p.libre;
  const metros = p.tipo === "distance" ? Math.round(p.valor * 1000) : null;
  const segundos = p.tipo === "time" ? Math.round(p.valor * 60) : null;
  if (!libre && !(metros > 0) && !(segundos > 0)) return null;

  // Descripción que ve el alumno en el reloj: el nombre, y el ritmo como texto cuando no va
  // como objetivo (igual que en intervals.icu). En un paso libre se recuerda presionar LAP.
  const medida = metros ? (metros >= 1000 ? `${Number((metros / 1000).toFixed(2))} km` : `${metros} m`) : segundos ? `${Math.round(segundos / 60)} min` : "";
  const texto = [
    ({ "Warm-up": "Calentamiento", "Cool-down": "Enfriamiento" })[p.nombre] || p.nombre,
    !p.objetivo ? ritmoComoTexto(p.ritmo) : null,
    libre ? `· presiona LAP al terminar${medida ? ` (aprox. ${medida})` : ""}` : null,
  ].filter(Boolean).join(" ");

  const conObjetivo = p.objetivo && p.ritmo > 0;
  return {
    type: "WorkoutStep",
    stepOrder: orden,
    intensity: INTENSIDAD[p.intensidad] || "ACTIVE",
    description: recortar(texto, 512),
    durationType: libre ? "OPEN" : metros ? "DISTANCE" : "TIME",
    durationValue: libre ? null : metros || segundos,
    durationValueType: !libre && metros ? "METER" : null,
    // Ritmo objetivo como rango de velocidad (m/s): de ±5 s/km, el más lento abajo.
    targetType: conObjetivo ? "PACE" : "OPEN",
    targetValue: null,
    targetValueLow: conObjetivo ? ritmoAVelocidad(p.ritmo + MARGEN_RITMO_SEG / 60) : null,
    targetValueHigh: conObjetivo ? ritmoAVelocidad(p.ritmo - MARGEN_RITMO_SEG / 60) : null,
    targetValueType: null,
  };
}

// Un día del plan → el entrenamiento de Garmin (o null si es descanso o no se puede armar).
export function sesionAWorkout(day, easyPace, { alertas = false, libre = false } = {}) {
  const items = sesionAPasos(day, easyPace, { alertas, libre });
  if (!items || !items.length) return null;
  let orden = 0;
  const steps = [];
  for (const it of items) {
    if (it.paso) {
      const s = pasoGarmin(it.paso, ++orden);
      if (s) steps.push(s); else orden--;
      continue;
    }
    const repetir = { type: "WorkoutRepeatStep", stepOrder: ++orden, repeatType: "REPEAT_UNTIL_STEPS_CMPLT", repeatValue: it.repetir, skipLastRestStep: false, steps: [] };
    for (const p of it.pasos) {
      const s = pasoGarmin(p, ++orden);
      if (s) repetir.steps.push(s); else orden--;
    }
    if (repetir.steps.length) steps.push(repetir); else orden--;
  }
  if (!steps.length || orden > MAX_PASOS) return null;
  const nombre = `${nombreDeSesion(day)}${day.km ? ` · ${day.km} km` : ""}`;
  return {
    workoutName: recortar(nombre, 80),
    description: recortar(`${nombre}. Plan de tu coach en TROTAMUNDOS.`, 1024),
    sport: "RUNNING",
    workoutProvider: PROVEEDOR,
    workoutSourceId: PROVEEDOR,
    isSessionTransitionEnabled: false,
    segments: [{ segmentOrder: 1, sport: "RUNNING", steps }],
  };
}

// Firma del contenido: si no cambia, no hace falta volver a mandarlo.
export function firmaDeWorkout(w) {
  const s = JSON.stringify(w);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

// Los entrenamientos de una semana: [{ dia, fecha, workout, firma }].
export function semanaAWorkouts(student, weekNum, { alertas = false } = {}) {
  const week = student?.weeks?.[weekNum];
  if (!week || !Array.isArray(week.plan)) return [];
  const easyPace = student.paces?.E ?? null;
  const lunes = semanaLunes(student, weekNum);
  if (!lunes) return [];
  const out = [];
  week.plan.forEach((day, idx) => {
    if (!day?.paceKey) return;
    const workout = sesionAWorkout(day, easyPace, { alertas, libre: calentamientoLibreActivo(student, day) });
    if (!workout) return;
    const fecha = new Date(lunes);
    fecha.setDate(fecha.getDate() + idx);
    out.push({ dia: idx, fecha: localDateISO(fecha), workout, firma: firmaDeWorkout(workout) });
  });
  return out;
}

// Qué hacer con una semana: comparar lo que hay que tener en Garmin con lo que ya se mandó.
//   enviados: { "<dia>": { workoutId, scheduleId, firma, fecha } } de esa semana
//   hoy: "YYYY-MM-DD" — lo pasado no se toca (es historial).
// Devuelve { crear: [...], borrar: [...], igual: [...] }.
export function planDeEnvio(deseados, enviados, hoy) {
  const ya = enviados && typeof enviados === "object" ? enviados : {};
  const crear = [], borrar = [], igual = [];
  const porDia = new Map(deseados.map((d) => [String(d.dia), d]));
  for (const d of deseados) {
    if (d.fecha < hoy) continue;
    const previo = ya[String(d.dia)];
    if (previo && previo.firma === d.firma && previo.fecha === d.fecha) { igual.push(d.dia); continue; }
    if (previo) borrar.push({ dia: d.dia, ...previo });
    crear.push(d);
  }
  for (const [dia, previo] of Object.entries(ya)) {
    if (porDia.has(dia)) continue;
    if (previo?.fecha && previo.fecha < hoy) continue;
    borrar.push({ dia: Number(dia), ...previo });
  }
  return { crear, borrar, igual };
}

/* ---------------------------------------------------------------------------
   ACTIVIDADES (Activity API → la forma de intervals.icu)
--------------------------------------------------------------------------- */

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

// "2026-11-10T06:15:00" en la hora que mostraba el reloj.
export function fechaLocalDe(segundos, offset) {
  const s = num(segundos);
  if (s == null) return null;
  return new Date((s + (num(offset) || 0)) * 1000).toISOString().slice(0, 19);
}

// Garmin ya manda "Garmin fenix 8" a veces y "Forerunner 265" otras. La atribución pide
// "Garmin [modelo]".
export function atribucionGarmin(deviceName) {
  const d = typeof deviceName === "string" ? deviceName.trim() : "";
  if (!d || d.toLowerCase() === "unknown") return "Garmin";
  return /^garmin\b/i.test(d) ? `Garmin${d.slice(6)}` : `Garmin ${d}`;
}

const DEPORTES_DE_CARRERA = /RUNNING|TRAIL|TREADMILL|TRACK|ULTRA|INDOOR_RUNNING|STREET_RUNNING|VIRTUAL_RUN/i;
export const esCarrera = (tipo) => DEPORTES_DE_CARRERA.test(String(tipo || ""));

// Un "activityDetails" de Garmin → { actividad, vueltas, streams }.
// Las vueltas de Garmin solo traen cuándo empezaron: lo demás (distancia, tiempo, FC) se
// saca de las muestras entre una vuelta y la siguiente.
export function actividadDesdeGarmin(detalle) {
  const s = detalle?.summary || detalle;
  if (!s || typeof s !== "object") return null;
  const muestras = (Array.isArray(detalle?.samples) ? detalle.samples : []).filter((m) => num(m?.startTimeInSeconds) != null)
    .sort((a, b) => a.startTimeInSeconds - b.startTimeInSeconds);
  const inicio = num(s.startTimeInSeconds);
  const ult = muestras[muestras.length - 1];
  const tiempoMov = ult && num(ult.movingDurationInSeconds) != null ? ult.movingDurationInSeconds : num(s.durationInSeconds);
  const tiempoTimer = ult && num(ult.timerDurationInSeconds) != null ? ult.timerDurationInSeconds : num(s.durationInSeconds);
  const tiempoReloj = ult && num(ult.clockDurationInSeconds) != null ? ult.clockDurationInSeconds : num(s.durationInSeconds);

  const actividad = {
    id: String(detalle?.activityId ?? s.activityId ?? detalle?.summaryId ?? s.summaryId ?? ""),
    type: esCarrera(s.activityType) ? "Run" : s.activityType || null,
    name: s.activityName || null,
    device_name: atribucionGarmin(s.deviceName),
    start_date_local: fechaLocalDe(inicio, s.startTimeOffsetInSeconds),
    distance: num(s.distanceInMeters),
    // "En movimiento" para el ritmo y el km por km; el total incluye las paradas con el
    // reloj corriendo (las pausas del reloj no cuentan como parada).
    moving_time: tiempoMov,
    elapsed_time: tiempoTimer ?? tiempoReloj,
    average_heartrate: num(s.averageHeartRateInBeatsPerMinute),
    max_heartrate: num(s.maxHeartRateInBeatsPerMinute),
    average_cadence: num(s.averageRunCadenceInStepsPerMinute),
    total_elevation_gain: num(s.totalElevationGainInMeters),
    total_elevation_loss: num(s.totalElevationLossInMeters),
    calories: num(s.activeKilocalories),
  };

  // Series segundo a segundo.
  const time = [], distance = [], velocity = [], heartrate = [];
  for (const m of muestras) {
    const d = num(m.totalDistanceInMeters);
    if (d == null) continue;
    time.push(inicio != null ? m.startTimeInSeconds - inicio : num(m.clockDurationInSeconds) ?? 0);
    distance.push(d);
    velocity.push(num(m.speedMetersPerSecond));
    heartrate.push(num(m.heartRate));
  }
  const streams = time.length > 1 ? [
    { type: "time", data: time },
    { type: "distance", data: distance },
    { type: "velocity_smooth", data: velocity },
    ...(heartrate.some((h) => h != null) ? [{ type: "heartrate", data: heartrate }] : []),
  ] : [];

  // Vueltas a partir de sus inicios.
  const inicios = (Array.isArray(detalle?.laps) ? detalle.laps : []).map((l) => num(l?.startTimeInSeconds)).filter((x) => x != null).sort((a, b) => a - b);
  const vueltas = [];
  for (let i = 0; i < inicios.length; i++) {
    const desde = inicios[i], hasta = inicios[i + 1] ?? Infinity;
    const tramo = muestras.filter((m) => m.startTimeInSeconds >= desde && m.startTimeInSeconds < hasta);
    // La muestra anterior al inicio da el punto de partida (la distancia y el reloj acumulados).
    const antes = [...muestras].reverse().find((m) => m.startTimeInSeconds < desde);
    const fin = tramo[tramo.length - 1];
    if (!fin) continue;
    const base = (campo) => (antes ? num(antes[campo]) ?? 0 : 0);
    const dif = (campo) => (num(fin[campo]) != null ? fin[campo] - base(campo) : null);
    const fcs = tramo.map((m) => num(m.heartRate)).filter((h) => h > 0);
    vueltas.push({
      label: `Vuelta ${i + 1}`,
      distance: dif("totalDistanceInMeters"),
      moving_time: dif("movingDurationInSeconds") ?? dif("timerDurationInSeconds"),
      elapsed_time: dif("timerDurationInSeconds") ?? dif("clockDurationInSeconds"),
      average_heartrate: fcs.length ? Math.round(fcs.reduce((a, b) => a + b, 0) / fcs.length) : null,
    });
  }
  return { actividad, vueltas, streams, manual: !!(s.manual ?? detalle?.manual) };
}

/* ---------------------------------------------------------------------------
   SALUD (Health API → campos de la tabla de salud)
--------------------------------------------------------------------------- */

const prom = (mapa) => {
  const v = Object.values(mapa && typeof mapa === "object" ? mapa : {}).map(Number).filter((x) => Number.isFinite(x) && x > 0);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const minutos = (seg) => (num(seg) != null ? seg / 60 : null);
const fechaDe = (r) => r?.calendarDate || (num(r?.startTimeInSeconds) != null ? fechaLocalDe(r.startTimeInSeconds, r.startTimeOffsetInSeconds).slice(0, 10) : null)
  || (num(r?.measurementTimeInSeconds) != null ? fechaLocalDe(r.measurementTimeInSeconds, r.measurementTimeOffsetInSeconds).slice(0, 10) : null);

// Un resumen de Garmin → { fecha, datos } (o null si no trae nada que guardemos).
export function saludDesdeGarmin(tipo, r) {
  if (!r || typeof r !== "object") return null;
  const fecha = fechaDe(r);
  if (!fecha) return null;
  let datos = null;
  switch (tipo) {
    case "dailies": {
      const estres = num(r.averageStressLevel);
      datos = {
        fcReposo: num(r.restingHeartRateInBeatsPerMinute),
        fcMax: num(r.maxHeartRateInBeatsPerMinute),
        estres: estres != null && estres >= 0 ? estres : null, // negativos: "sin medir"
        pasos: num(r.steps),
        calorias: (num(r.activeKilocalories) ?? 0) + (num(r.bmrKilocalories) ?? 0) || null,
        minutosIntensidad: (minutos(r.moderateIntensityDurationInSeconds) ?? 0) + (minutos(r.vigorousIntensityDurationInSeconds) ?? 0) || null,
      };
      break;
    }
    case "sleeps": {
      const prof = minutos(r.deepSleepDurationInSeconds), lig = minutos(r.lightSleepDurationInSeconds), rem = minutos(r.remSleepInSeconds);
      const dormido = [prof, lig, rem].some((x) => x != null) ? (prof ?? 0) + (lig ?? 0) + (rem ?? 0) : minutos(r.durationInSeconds);
      datos = {
        sueñoMin: dormido,
        sueñoProfundoMin: prof,
        sueñoLigeroMin: lig,
        sueñoRemMin: rem,
        despiertoMin: minutos(r.awakeDurationInSeconds),
        sueñoPuntaje: num(r.overallSleepScore?.value),
      };
      break;
    }
    case "hrv": datos = { vfc: num(r.lastNightAvg) }; break;
    case "stressDetails": {
      const bb = Object.values(r.timeOffsetBodyBatteryValues || {}).map(Number).filter((x) => Number.isFinite(x) && x >= 0);
      datos = { energiaMax: bb.length ? Math.max(...bb) : null, energiaMin: bb.length ? Math.min(...bb) : null };
      break;
    }
    case "userMetrics": datos = { vo2max: num(r.vo2Max) }; break;
    case "pulseox": datos = { spo2: prom(r.timeOffsetSpo2Values) }; break;
    case "allDayRespiration": datos = { respiracion: prom(r.timeOffsetEpochToBreaths) }; break;
    case "bodyComps": datos = { pesoKg: num(r.weightInGrams) != null ? r.weightInGrams / 1000 : null, grasaPct: num(r.bodyFatInPercent) }; break;
    default: return null;
  }
  const limpio = Object.fromEntries(Object.entries(datos).filter(([, v]) => v != null));
  return Object.keys(limpio).length ? { fecha, datos: limpio } : null;
}

export const TIPOS_DE_SALUD = ["dailies", "sleeps", "hrv", "stressDetails", "userMetrics", "pulseox", "allDayRespiration", "bodyComps"];

/* ---------------------------------------------------------------------------
   NOTIFICACIONES (push)
--------------------------------------------------------------------------- */

// El cuerpo de un push: { "<tipo>": [ { userId, ... }, ... ], ... } → [{ tipo, userId, dato }].
export function notificaciones(cuerpo) {
  const out = [];
  if (!cuerpo || typeof cuerpo !== "object") return out;
  for (const [tipo, lista] of Object.entries(cuerpo)) {
    if (!Array.isArray(lista)) continue;
    for (const dato of lista) {
      const userId = dato?.userId;
      if (typeof userId === "string" && userId) out.push({ tipo, userId, dato });
    }
  }
  return out;
}

// Si en el portal un tipo quedó en modo "Ping" en vez de "Push", Garmin no manda los datos sino
// un callbackURL para ir a buscarlos. Solo se aceptan direcciones del servidor de Garmin (nunca
// se sigue un enlace a otro sitio).
export function esPing(dato) {
  return !!dato && typeof dato.callbackURL === "string" && Object.keys(dato).every((k) => k === "userId" || k === "callbackURL");
}
export function urlDePingValida(url, base = "https://apis.garmin.com") {
  try {
    const u = new URL(url), b = new URL(base);
    return u.protocol === b.protocol && u.host === b.host;
  } catch (e) {
    return false;
  }
}

// ¿El alumno sigue compartiendo su salud desde Garmin Connect? (si no se sabe, se asume que sí)
export const compartiendoSalud = (permisos) => !Array.isArray(permisos) || permisos.includes("HEALTH_EXPORT");

// ¿Cae dentro de los rangos de IP desde los que Garmin envía? (Activity API, 4)
const RANGOS = ["204.77.162.0/23", "204.77.163.0/24", "98.199.124.0/23", "185.132.79.0/24", "208.65.206.0/23", "185.207.94.0/23", "198.233.176.0/24"];
const ipANumero = (ip) => ip.split(".").reduce((a, b) => (a << 8) + Number(b), 0) >>> 0;
export function ipDeGarmin(ip) {
  if (typeof ip !== "string" || !/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return false;
  const n = ipANumero(ip);
  return RANGOS.some((r) => {
    const [base, bits] = r.split("/");
    const mask = bits === "0" ? 0 : (~0 << (32 - Number(bits))) >>> 0;
    return (n & mask) === (ipANumero(base) & mask);
  });
}
