// Motor de planes de TROTAMUNDOS.
//
// Acá vive toda la lógica de entrenamiento: ritmos (VDOT/Daniels), fases y ciclos de carga,
// volúmenes, estructura de los planes de carrera y de fitness, detalle de cada sesión y
// publicación automática de semanas. Es código puro: no usa React, ni el navegador, ni la
// base de datos. Por eso puede correr en tres lugares — en la pantalla del coach, en la del
// alumno, y en el servidor (que es lo que permite publicar una semana sola, sin que nadie
// abra la app).
//
// Antes todo esto vivía dentro de app/page.jsx, donde solo podía ejecutarse en el navegador.
// Las pruebas (npm test) importan este archivo directamente.

export const COLORS = {
  bg: "#12151B",
  surface: "#1B2029",
  surface2: "#232A36",
  border: "#2E3644",
  track: "#C8452E",
  lane: "#F5F3EA",
  easy: "#4C9A6A",
  moderate: "#D99A3D",
  hard: "#C8452E",
  rest: "#4A5568",
  textPrimary: "#F5F3EA",
  textMuted: "#8B93A3",
};

export const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export const GOALS = [
  { id: "42k", label: "42K · Maratón" },
  { id: "21k", label: "21K · Media Maratón" },
  { id: "10k", label: "10K" },
  { id: "fitness", label: "Fitness" },
];
// "fitness12"/"fitness16" quedan reconocidos solo por compatibilidad con alumnos ya creados
// antes de unificar ambos programas en uno solo ("fitness", con semana de inicio flexible).
export function isFitnessGoal(goalId) { return goalId === "fitness" || goalId === "fitness12" || goalId === "fitness16"; }
export const FITNESS_GOAL_LEVELS = ["principiante", "intermedio0", "intermedio1"];
// Seis niveles. Los ids internos NO cambian (los alumnos ya creados los tienen guardados):
// solo cambia el nombre que se muestra. "intermedio0" es el nivel nuevo de 3 días.
//   id interno     nombre visible   días
//   principiante   Principiante     3
//   intermedio0    Intermedio 1     3   (nuevo)
//   intermedio1    Intermedio 2     4   (antes "Intermedio 1")
//   intermedio2    Intermedio 3     5   (antes "Intermedio 2")
//   avanzado1      Avanzado 1       6
//   avanzado2      Avanzado 2       7
export const LEVELS = [
  { id: "principiante", label: "Principiante", days: 3 },
  { id: "intermedio0", label: "Intermedio 1", days: 3 },
  { id: "intermedio1", label: "Intermedio 2", days: 4 },
  { id: "intermedio2", label: "Intermedio 3", days: 5 },
  { id: "avanzado1", label: "Avanzado 1", days: 6 },
  { id: "avanzado2", label: "Avanzado 2", days: 7 },
];
// Qué objetivos admite cada nivel: Principiante e Intermedio 1 (3 días) solo 10K y Fitness;
// 21K y 42K desde Intermedio 2 (4 días).
export const GOAL_LEVELS = {
  "42k": ["intermedio1", "intermedio2", "avanzado1", "avanzado2"],
  "21k": ["intermedio1", "intermedio2", "avanzado1", "avanzado2"],
  "10k": ["principiante", "intermedio0", "intermedio1", "intermedio2", "avanzado1", "avanzado2"],
  fitness: FITNESS_GOAL_LEVELS,
};
export function levelsForGoal(goalId) {
  const ids = GOAL_LEVELS[isFitnessGoal(goalId) ? "fitness" : goalId] || LEVELS.map((l) => l.id);
  return LEVELS.filter((l) => ids.includes(l.id));
}
export function goalAllowsLevel(goalId, level) { return levelsForGoal(goalId).some((l) => l.id === level); }
export const GOAL_LABEL = { ...Object.fromEntries(GOALS.map((g) => [g.id, g.label])), fitness12: "Fitness (12 sem., plan anterior)", fitness16: "Fitness (16 sem., plan anterior)" };
export const LEVEL_LABEL = Object.fromEntries(LEVELS.map((l) => [l.id, l.label]));
export const TRAIN_DAYS_BY_LEVEL = Object.fromEntries(LEVELS.map((l) => [l.id, l.days]));
export const DISTANCE_KM = { "5k": 5, "10k": 10, "21k": 21.0975, "42k": 42.195 };

export const FITNESS_BASE_KM = { principiante: 12, intermedio0: 13, intermedio1: 15, intermedio2: 18, avanzado1: 22, avanzado2: 26 };
export const LEVEL_CEILING = { principiante: 0.45, intermedio0: 0.55, intermedio1: 0.62, intermedio2: 0.78, avanzado1: 0.9, avanzado2: 1.0 };
export const GOAL_VOLUME_FACTOR = { "5k": 0.55, "10k": 0.65, "21k": 0.85, "42k": 1.0 };

export function peakKmFromVDOT(vdot) {
  let km;
  if (vdot <= 45) km = 40 + (vdot - 30) * 1.0;
  else km = 55 + (vdot - 45) * 5.15;
  return Math.max(35, Math.min(150, km));
}
export const PEAK_KM_CAP = { "5k": 65, "10k": 78, "21k": 100, "42k": 130 };
export function computePeakKm(goalId, level, vdot) {
  if (goalId === "fitness") return FITNESS_BASE_KM[level] ?? FITNESS_BASE_KM.intermedio2;
  const base = peakKmFromVDOT(vdot) * (GOAL_VOLUME_FACTOR[goalId] ?? 0.8);
  const ceiling = LEVEL_CEILING[level] ?? 0.85;
  const km = Math.min(base * ceiling, PEAK_KM_CAP[goalId] ?? 120);
  return Math.round(km * 2) / 2;
}

export const BEGINNER_STAGES = [
  { run: 2, walk: 1, reps: 6, label: "Semana 1" },
  { run: 2, walk: 1, reps: 7, label: "Semana 2" },
  { run: 3, walk: 1, reps: 5, label: "Semana 3" },
  { run: 3, walk: 1, reps: 6, label: "Semana 4" },
  { run: 4, walk: 1, reps: 6, label: "Semana 5" },
  { run: 5, walk: 1, reps: 5, label: "Semana 6" },
  { run: 6, walk: 1, reps: 5, label: "Semana 7" },
  { run: 8, walk: 1, reps: 3, label: "Semana 8" },
  { run: 10, walk: 1, reps: 3, label: "Semana 9" },
  { run: 15, walk: 1, reps: 2, label: "Semana 10" },
  { run: 25, walk: 0, reps: 1, label: "Semana 11 · continuo" },
  { run: 35, walk: 0, reps: 1, label: "Semana 12 · 5K continuo" },
];
export const BEGINNER_TRAIN_DAYS = [0, 2, 5]; // Lun, Mié, Sáb (principiante, 3x/sem)
export const FITNESS_GOAL_TRAIN_DAYS = [1, 2, 4, 6]; // Mar, Mié, Vie, Dom (intermedio1, 4x/sem)
export const BEGINNER_WARMUP_MIN = 5, BEGINNER_COOLDOWN_MIN = 5; // caminando, fijo en todas las semanas

// Progresión en DOS FASES declaradas:
//   Fase 1 (semanas 1-12): run/walk. Los minutos de trote suben sin retroceder nunca.
//   Fase 2 (semanas 13-16): trote continuo. Arranca bajo a propósito — correr sin pausas
//   es más exigente que la misma cantidad de minutos fraccionados — y sube hasta el objetivo
//   final (45' / 7K continuos), que queda como el punto más alto de su fase.
export const FITNESS16_STAGES = [
  { run: 2, walk: 1, reps: 6, label: "Semana 1" },    // 12' de trote
  { run: 2, walk: 1, reps: 7, label: "Semana 2" },    // 14'
  { run: 3, walk: 1, reps: 6, label: "Semana 3" },    // 18'
  { run: 3, walk: 1, reps: 7, label: "Semana 4" },    // 21'
  { run: 4, walk: 1, reps: 6, label: "Semana 5" },    // 24'
  { run: 4, walk: 1, reps: 7, label: "Semana 6" },    // 28'
  { run: 5, walk: 1, reps: 6, label: "Semana 7" },    // 30'
  { run: 5, walk: 1, reps: 7, label: "Semana 8" },    // 35'
  { run: 6, walk: 1, reps: 6, label: "Semana 9" },    // 36'
  { run: 8, walk: 1, reps: 5, label: "Semana 10" },   // 40'  (antes 4 reps = 32', retrocedía)
  { run: 10, walk: 1, reps: 4, label: "Semana 11" },  // 40'
  { run: 12, walk: 1, reps: 4, label: "Semana 12" },  // 48'  (antes 3 reps = 36', retrocedía)
  { run: 20, walk: 0, reps: 1, label: "Semana 13 · continuo" }, // inicio de la fase continua
  { run: 28, walk: 0, reps: 1, label: "Semana 14 · continuo" },
  { run: 36, walk: 0, reps: 1, label: "Semana 15 · continuo" },
  { run: 45, walk: 0, reps: 1, label: "Semana 16 · 7K continuo" },
];

// "fitness" (nuevo, unificado): siempre usa la tabla de 16 pasos — es la más gradual y con más
// puntos de entrada. Los alumnos creados antes de unificar el plan siguen usando su tabla original.
export function getStageTable(goalId) {
  if (goalId === "fitness16") return FITNESS16_STAGES;
  if (goalId === "fitness12") return BEGINNER_STAGES;
  return FITNESS16_STAGES;
}
// A qué paso de la tabla (0-indexado) corresponde una semana según cuántas semanas falten
// para llegar al objetivo del plan fitness (cuenta regresiva, igual que en los planes de carrera).
export function fitnessStageIndexFromWeeksToGoal(weeksToGoal) {
  const stages = FITNESS16_STAGES;
  return Math.max(0, Math.min(stages.length - 1, stages.length - weeksToGoal));
}
export function getRunWalkTrainDays(level) { return level === "intermedio1" ? FITNESS_GOAL_TRAIN_DAYS : BEGINNER_TRAIN_DAYS; }

export function getDayVariant(stage, posIndex, totalDays) {
  const isMain = posIndex === totalDays - 1; // el último día entrenado de la semana es el "principal"
  if (stage.walk === 0) {
    // fase continua (semanas finales): se varía la duración
    if (isMain) return { run: stage.run, walk: 0, reps: 1, tag: "principal" };
    if (posIndex === 0) return { run: Math.max(10, Math.round(stage.run * 0.65)), walk: 0, reps: 1, tag: "corto" };
    if (posIndex === 1) return { run: Math.max(12, Math.round(stage.run * 0.8)), walk: 0, reps: 1, tag: "variante" };
    return { run: Math.max(15, Math.round(stage.run * 0.9)), walk: 0, reps: 1, tag: "medio" };
  }
  if (isMain) return { run: stage.run, walk: stage.walk, reps: stage.reps, tag: "principal" };
  if (posIndex === 0) {
    // Día corto: dos repeticiones menos que el principal. Se escalona por resta y no por
    // porcentaje porque, con pocas repeticiones, los porcentajes redondeaban al mismo número
    // y dos días de la semana quedaban idénticos.
    return { run: stage.run, walk: stage.walk, reps: Math.max(2, stage.reps - 2), tag: "corto" };
  }
  if (posIndex === 1) {
    // día variante: bloques de trote un poco más largos, menos repeticiones (estímulo distinto)
    return { run: stage.run + 1, walk: stage.walk, reps: Math.max(2, stage.reps - 2), tag: "variante" };
  }
  // posIndex 2 (viernes en el plan de 4 días): una repetición menos que el principal
  return { run: stage.run, walk: stage.walk, reps: Math.max(2, stage.reps - 1), tag: "medio" };
}
export const VARIANT_LABEL = { corto: "corto", variante: "variante", medio: "medio", principal: "principal" };

export function buildBeginnerPlan(stageIndex, goalId, level, customTrainDays) {
  const stages = getStageTable(goalId);
  const idx = Math.min(stageIndex, stages.length - 1);
  const stage = stages[idx];
  const trainDays = customTrainDays && customTrainDays.length ? customTrainDays : getRunWalkTrainDays(level);
  const inFinalBlock = idx >= stages.length - 4; // último bloque de 4 semanas: posible día de velocidad
  const speedDayIndex = inFinalBlock ? trainDays[0] : -1; // el primer día entrenado de la semana
  return DAYS.map((day, i) => {
    if (!trainDays.includes(i)) return { day, type: "Descanso", paceKey: "", km: 0, targetPace: null };
    if (i === speedDayIndex) {
      return {
        day, type: "Día de velocidad (suave)", paceKey: "E", km: 2, targetPace: null,
        runWalk: false, isSpeedDay: true, stageLabel: stage.label,
      };
    }
    const posIndex = trainDays.indexOf(i);
    const v = getDayVariant(stage, posIndex, trainDays.length);
    const mainMin = v.walk > 0 ? v.reps * v.run + (v.reps - 1) * v.walk : v.reps * v.run;
    const totalMin = BEGINNER_WARMUP_MIN + mainMin + BEGINNER_COOLDOWN_MIN;
    const estKm = Math.max(0.5, Math.round((mainMin / 8) * 2) / 2);
    const type = v.walk > 0
      ? `Run/Walk ${VARIANT_LABEL[v.tag]} · ${stage.label}`
      : `Continuo ${VARIANT_LABEL[v.tag]} · ${stage.label}`;
    return {
      day, type, paceKey: "E", km: estKm, targetPace: null, runWalk: v.walk > 0,
      stageLabel: stage.label, stageRun: v.run, stageWalk: v.walk, stageReps: v.reps, stageTotalMin: totalMin,
    };
  });
}

export const PHASE_LABEL = {
  base: "Base", build: "Velocidad", peak: "Específico",
  taper: "Tapering", race: "Semana de carrera", fitness: "Fitness general", principiante: "Acondicionamiento",
};
export const PHASE_FACTOR = { base: 0.72, build: 1.0, peak: 0.92, taper: 0.62, race: 0.4 };
export function getPhaseFactor(phase, weeksToRace) {
  if (weeksToRace === 0) return PHASE_FACTOR.race;
  return PHASE_FACTOR[phase] ?? 1;
}

export const PACE_KEY_LABEL = { fartlek: "Fartlek", hills: "Cuestas", E: "Ritmo suave", M: "Ritmo maratón", T: "Ritmo umbral", I: "Ritmo intervalos", R: "Ritmo de series", race: "Ritmo objetivo", long: "Fondo progresivo", broken: "Pre-carga (series largas)", combo1k500: "1k + 500", custom: "Otro (personalizado)", brokenT: "Umbral fraccionado" };
export const ZONE_BY_PACEKEY = { fartlek: "hard", hills: "hard", E: "easy", M: "moderate", T: "hard", I: "hard", R: "hard", race: "moderate", long: "moderate", broken: "hard", combo1k500: "hard", custom: "hard", brokenT: "hard" };
export const ZONE_COLOR = { rest: COLORS.rest, easy: COLORS.easy, moderate: COLORS.moderate, hard: COLORS.hard };
export const PACE_OPTIONS = [
  { key: "", label: "Descanso" }, { key: "E", label: "Suave (E)" }, { key: "M", label: "Maratón (M)" },
  { key: "T", label: "Umbral (T)" }, { key: "I", label: "Intervalos (I)" }, { key: "R", label: "Series (R)" },
  { key: "long", label: "Fondo progresivo" }, { key: "custom", label: "Otro (personalizado)" },
];
// "Umbral (T)" agrupa dos variantes: continuo (T) y fraccionado (brokenT).
export const T_VARIANTS = [{ key: "T", label: "Continuo" }, { key: "brokenT", label: "Fraccionado" }];
// "Otro" agrupa plantillas rápidas de estructuras que ya existen, además de bloques en blanco.
export const OTRO_TEMPLATES = [
  { key: "custom", label: "En blanco (personalizado)" },
  { key: "race", label: "Ritmo objetivo" },
  { key: "broken", label: "Pre-carga (series largas)" },
  { key: "combo1k500", label: "Intervalos 1k + 500" },
  { key: "fartlek", label: "Fartlek" },
  { key: "hills", label: "Cuestas" },
];
export const OTRO_SUBKEYS = OTRO_TEMPLATES.map((t) => t.key);
export function displayPaceKey(paceKey) {
  if (paceKey === "brokenT") return "T";
  if (OTRO_SUBKEYS.includes(paceKey)) return "custom";
  return paceKey;
}
export const QUALITY_KM_DEFAULT = { fartlek: 8, hills: 8, T: 10, I: 11, R: 10, M: 10, race: 9, broken: 11, combo1k500: 12.5, brokenT: 10 };
export const QUALITY_LEVEL_SCALE = { principiante: 0.6, intermedio0: 0.7, intermedio1: 0.8, intermedio2: 1.0, avanzado1: 1.15, avanzado2: 1.3 };
export const QUALITY_KM_CAP = { T: 15, M: 13, race: 13, I: 15, R: 13, broken: 16, combo1k500: 13.5 };
export function qualityKmFor(paceKey, level, weeklyKm) {
  const base = QUALITY_KM_DEFAULT[paceKey];
  if (base == null) return null;
  const pctFactor = paceKey === "I" ? 0.17 : 0.15;
  // El volumen de la sesión escala con el km semanal real de esa semana (no un tope fijo por nivel),
  // así crece a través de la fase en vez de repetirse igual siempre.
  const scaled = weeklyKm != null ? Math.max(6, weeklyKm * pctFactor) : base * (QUALITY_LEVEL_SCALE[level] ?? 1);
  return Math.round(Math.min(scaled, QUALITY_KM_CAP[paceKey] ?? 12) * 2) / 2;
}

/* ---------------------------------------------------------
   VDOT / PACES (fórmulas de Jack Daniels, con rodaje suave más conservador)
--------------------------------------------------------- */
export function parsePaceToDecimal(str) {
  if (!str) return null;
  const m = String(str).trim().match(/^(\d+):([0-5]?\d)$/);
  if (!m) return null;
  return parseInt(m[1], 10) + parseInt(m[2], 10) / 60;
}
export function parseTimeToMinutes(str) {
  if (!str) return null;
  const parts = String(str).trim().split(":").map(Number);
  if (parts.some((p) => isNaN(p))) return null;
  if (parts.length === 3) return parts[0] * 60 + parts[1] + parts[2] / 60;
  if (parts.length === 2) return parts[0] + parts[1] / 60;
  return null;
}
// Ritmos posibles para un objetivo de carrera, en min/km. Fuera de este rango lo que está
// mal es la lectura del tiempo, no el atleta: nadie corre un maratón a 0:05/km.
export const RITMO_OBJETIVO_POSIBLE = { min: 2.5, max: 12 };

// Lee el tiempo objetivo de una carrera según su distancia.
//
// Con dos números ("3:20") hay dos lecturas: horas y minutos, o minutos y segundos. Antes
// se tomaba siempre la segunda, así que "3:20" en maratón eran 3 minutos y 20 segundos: un
// ritmo de 0:05/km, del que salían un VDOT, un km pico y unos ritmos sin sentido. Ahora se
// elige la lectura que da un ritmo posible para esa distancia. Si las dos lo dan, decide la
// distancia: en media maratón y maratón se habla en horas; en 5K y 10K, en minutos.
//
// Devuelve { minutos, ritmo, lectura } o null si no hay forma razonable de leerlo.
export function interpretarTiempoObjetivo(texto, distanciaKm) {
  if (texto == null || !(distanciaKm > 0)) return null;
  const limpio = String(texto).trim();
  if (!/^\d{1,3}(:\d{1,2}){1,2}$/.test(limpio)) return null;
  const partes = limpio.split(":").map(Number);
  const posible = (min) => {
    const ritmo = min / distanciaKm;
    return ritmo >= RITMO_OBJETIVO_POSIBLE.min && ritmo <= RITMO_OBJETIVO_POSIBLE.max;
  };

  let candidatos;
  if (partes.length === 3) {
    const [h, m, sg] = partes;
    if (m >= 60 || sg >= 60) return null;
    candidatos = [h * 60 + m + sg / 60];
  } else {
    const [a, b] = partes;
    if (b >= 60) return null;
    const enHoras = a * 60 + b;      // 3:20 → 3 h 20 min
    const enMinutos = a + b / 60;    // 45:00 → 45 min
    candidatos = distanciaKm >= 21 ? [enHoras, enMinutos] : [enMinutos, enHoras];
  }

  const minutos = candidatos.find(posible);
  if (minutos == null) return null;
  return { minutos, ritmo: minutos / distanciaKm, lectura: describirTiempo(minutos) };
}

// "3 h 20 min", "45 min", "1 h 05 min 30 s": cómo lo diría una persona.
export function describirTiempo(minutos) {
  const totalSeg = Math.round(minutos * 60);
  const h = Math.floor(totalSeg / 3600);
  const m = Math.floor((totalSeg % 3600) / 60);
  const sg = totalSeg % 60;
  const partes = [];
  if (h) partes.push(`${h} h`);
  partes.push(`${h ? String(m).padStart(2, "0") : m} min`);
  if (sg) partes.push(`${String(sg).padStart(2, "0")} s`);
  return partes.join(" ");
}

export function formatPace(paceMin) {
  if (paceMin === null || paceMin === undefined || isNaN(paceMin)) return "—";
  const m = Math.floor(paceMin);
  const s = Math.round((paceMin - m) * 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
export function paceDiffLabel(actualPaceStr, targetPace) {
  const actual = parsePaceToDecimal(actualPaceStr);
  if (actual == null || targetPace == null) return null;
  const diffSec = Math.round((actual - targetPace) * 60);
  if (diffSec === 0) return { text: "justo al ritmo objetivo", color: COLORS.easy };
  const abs = Math.abs(diffSec);
  const mm = Math.floor(abs / 60), ss = abs % 60;
  const timeStr = `${mm > 0 ? mm + ":" : ""}${String(ss).padStart(2, "0")}`;
  return {
    text: `${diffSec > 0 ? "+" : "-"}${timeStr}/km ${diffSec > 0 ? "más lento" : "más rápido"} que el objetivo`,
    color: diffSec > 0 ? COLORS.moderate : COLORS.easy,
  };
}
export function computeVDOT(distanceKm, paceMinPerKm) {
  const distanceM = distanceKm * 1000;
  const timeMin = paceMinPerKm * distanceKm;
  const v = distanceM / timeMin;
  const vo2 = -4.6 + 0.182258 * v + 0.000104 * v * v;
  const pctMax = 0.8 + 0.1894393 * Math.exp(-0.012778 * timeMin) + 0.2989558 * Math.exp(-0.1932605 * timeMin);
  return vo2 / pctMax;
}
export function velocityForPct(vdot, pct) {
  const targetVO2 = vdot * pct;
  const a = 0.000104, b = 0.182258, c = -(4.6 + targetVO2);
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
}
export function computeTrainingPaces(vdot) {
  const M = 1000 / velocityForPct(vdot, 0.84); // ritmo maratón equivalente (Daniels VDOT)
  const HM = 1000 / velocityForPct(vdot, 0.88); // ritmo media maratón equivalente (Daniels VDOT)
  const R = 1000 / velocityForPct(vdot, 1.05); // repeticiones: ~105% VO2max (Daniels), escala bien en todos los niveles
  return {
    M,
    HM,
    E: M + 1.5,      // rodaje suave / calentamiento / enfriamiento: siempre 1'30" más lento que el ritmo maratón
    long: M + 0.75,  // cuerpo del fondo: punto medio de un rango de 30"-60" más lento que el ritmo maratón
    T: HM + (M - HM) * ((35 - 25) / 25), // umbral: valor de referencia a 35' (rango real interpolado HM->M en getSessionDetail)
    I: R * 1.05,     // intervalos: 5% más lento que el ritmo de repeticiones
    R,               // velocidad / repeticiones
  };
}
export function getTPaceForDuration(hmPace, mPace, durationMin) {
  if (hmPace == null || mPace == null) return null;
  const frac = Math.min(1, Math.max(0, (durationMin - 25) / 25));
  return hmPace + (mPace - hmPace) * frac;
}
export function deriveAllFromM(mPace) {
  const vdot = computeVDOT(42.195, mPace); // trata M como si fuera un tiempo real de maratón
  return computeTrainingPaces(vdot);
}
export function deriveAllFromHM(hmPace) {
  const vdot = computeVDOT(21.0975, hmPace); // trata HM como un tiempo real de 21K
  const m = 1000 / velocityForPct(vdot, 0.84);
  return deriveAllFromM(m);
}
export function parseDDMMYYToISO(str) {
  if (!str) return null;
  const m = str.trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!m) return null;
  let [, d, mo, y] = m;
  d = d.padStart(2, "0"); mo = mo.padStart(2, "0");
  if (y.length === 2) y = "20" + y;
  const iso = `${y}-${mo}-${d}`;
  const date = new Date(`${iso}T00:00:00`);
  if (isNaN(date.getTime()) || date.getMonth() + 1 !== Number(mo)) return null;
  return iso;
}
export function formatISOToDDMMYY(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}
export function weeksBetween(dateStr) {
  const race = new Date(dateStr + "T00:00:00");
  const today = new Date();
  const diffDays = Math.ceil((race - today) / (1000 * 60 * 60 * 24));
  return Math.max(0, Math.ceil(diffDays / 7));
}
export function getDisplayWeekLabel(student, weekNum) {
  if (isFitnessGoal(student.goal)) {
    const stages = getStageTable(student.goal);
    const currentStage = student.beginnerStage ?? 0;
    const stageIdx = Math.max(0, Math.min(stages.length - 1, currentStage + (weekNum - student.currentWeek)));
    return stages.length - stageIdx;
  }
  if (student.level === "principiante" || !student.raceDate) return weekNum;
  const weeksToRaceForCurrent = student.weeksToRace != null ? student.weeksToRace : weeksBetween(student.raceDate);
  const weeksToRaceForThis = weeksToRaceForCurrent + (student.currentWeek - weekNum);
  return Math.max(0, weeksToRaceForThis);
}
export function getWeekTitle(student, weekNum) {
  const label = getDisplayWeekLabel(student, weekNum);
  if (label === 0 && !isFitnessGoal(student.goal) && student.level !== "principiante" && student.raceDate) {
    return student.goal === "21k" || student.goal === "42k" ? "Race Week" : "Semana de carrera";
  }
  return `Semana ${label}`;
}
export function mondayOf(d) {
  const dow = d.getDay();
  const diff = (dow + 6) % 7;
  const m = new Date(d);
  m.setDate(d.getDate() - diff);
  m.setHours(0, 0, 0, 0);
  return m;
}
export function getWeekDates(student, weekNum) {
  // Se ancla al lunes de la semana en que se creó el plan (fijo, guardado una sola vez) — así la
  // semana 1 siempre corresponde a "hoy" en el momento de la creación, y cada semana siguiente
  // avanza exactamente 7 días, sin importar cuántas se cierren seguidas ni qué día sea hoy.
  const planStartMonday = student.planStartMonday ? new Date(student.planStartMonday + "T00:00:00") : mondayOf(new Date());
  const monday = new Date(planStartMonday);
  monday.setDate(planStartMonday.getDate() + (weekNum - 1) * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { monday, sunday };
}
export function getWeekDateRange(student, weekNum) {
  const fmt = (d) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  const { monday, sunday } = getWeekDates(student, weekNum);
  return `${fmt(monday)} - ${fmt(sunday)}`;
}
// Qué número de semana le corresponde al alumno HOY, según la fecha real (sin importar
// cuántas semanas haya preparado el coach por adelantado, ni si aún no llegó a prepararla).
// El parámetro "today" permite calcularlo para una fecha distinta de la del reloj local.
// Lo necesita el servidor: cuando publica una semana sola, tiene que razonar con la fecha
// LOCAL DEL ALUMNO (que puede estar en Lima o en Italia), no con la suya.
export function getTodayWeekNum(student, today) {
  const ref = toRefDate(today);
  const planStartMonday = student.planStartMonday ? new Date(student.planStartMonday + "T00:00:00") : mondayOf(ref);
  const todayMonday = mondayOf(ref);
  const diffWeeks = Math.round((todayMonday - planStartMonday) / (7 * 24 * 60 * 60 * 1000));
  return Math.max(1, 1 + diffWeeks);
}
// Fecha en formato "YYYY-MM-DD" según el calendario LOCAL de quien la pide. Ojo: no sirve
// toISOString(), que pasa a UTC y corre un día entero en media parte del mundo — para un
// alumno en Italia a las 00:30 del lunes, toISOString todavía diría domingo.
export function localDateISO(d) {
  const ref = d instanceof Date && !isNaN(d) ? d : new Date();
  return `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, "0")}-${String(ref.getDate()).padStart(2, "0")}`;
}
// Una fecha local que venga del navegador no se usa a ciegas: se acepta solo si tiene el
// formato esperado y si está a un día o menos de la fecha del servidor. Las zonas horarias
// del mundo caben de sobra en ese margen (de UTC-12 a UTC+14), y así un alumno no puede
// mandar una fecha futura para destrabarse semanas que todavía no le corresponden.
export function sanitizeLocalDate(raw) {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const sent = new Date(raw + "T00:00:00Z");
  if (isNaN(sent)) return null;
  const serverToday = new Date();
  const serverUTC = Date.UTC(serverToday.getUTCFullYear(), serverToday.getUTCMonth(), serverToday.getUTCDate());
  const driftDays = Math.abs(sent.getTime() - serverUTC) / 86400000;
  return driftDays <= 1 ? raw : null;
}

// Acepta una fecha, un "YYYY-MM-DD", o nada (el reloj local). Siempre devuelve un Date
// interpretado en el mismo marco horario que planStartMonday, para que la resta sea exacta.
export function toRefDate(today) {
  if (today instanceof Date && !isNaN(today)) return today;
  if (typeof today === "string" && /^\d{4}-\d{2}-\d{2}$/.test(today)) {
    const d = new Date(today + "T00:00:00");
    if (!isNaN(d)) return d;
  }
  return new Date();
}
// Qué número de semana le corresponde a una fecha cualquiera (no necesariamente hoy) —
// usado para ubicar una carrera intermedia dentro del calendario del alumno.
// Cuando un alumno estuvo inactivo, el número de semana de su plan se queda atrás respecto
// al calendario. Esta función rellena ese hueco marcando las semanas que pasaron sin
// entrenar, para que el historial refleje lo que realmente ocurrió en vez de saltárselas.
// Asegura que una semana tenga "log" completo antes de mostrarla. Protege contra registros
// guardados por versiones anteriores que pudieran no tenerlo — leer log[i] sin esto rompe
// la pantalla entera.
export function ensureWeekShape(week) {
  if (!week) return week;
  const plan = Array.isArray(week.plan) ? week.plan : [];
  const log = Array.isArray(week.log) ? week.log : [];
  if (log.length === plan.length) return week;
  const fixed = plan.map((_, i) => log[i] || { completed: false, actualKm: "", actualPaceStr: "", rpe: "", note: "" });
  return { ...week, plan, log: fixed };
}
export function markInactiveWeeks(student, fromWeek, toWeek) {
  const weeks = { ...student.weeks };
  for (let n = fromWeek; n < toWeek; n++) {
    const existing = weeks[n];
    // Solo se marcan las que quedaron abiertas: las ya cerradas o pausadas se respetan.
    if (existing && (existing.submitted || existing.paused)) continue;
    // Siempre se garantizan "plan" y "log": una semana sin ellos rompe las pantallas que
    // recorren los días (el panel del coach lee week.log[i] directamente).
    const plan = Array.isArray(existing?.plan) ? existing.plan : [];
    const log = Array.isArray(existing?.log) && existing.log.length === plan.length
      ? existing.log
      : plan.map(() => ({ completed: false, actualKm: "", actualPaceStr: "", rpe: "", note: "" }));
    weeks[n] = {
      weeklyKm: existing?.weeklyKm ?? null,
      phase: existing?.phase ?? "base",
      ...existing,
      plan, log,
      submitted: true,
      inactive: true,
      note: "Semana sin actividad registrada.",
    };
  }
  return weeks;
}
export function getWeekNumForDate(student, dateStr) {
  const planStartMonday = student.planStartMonday ? new Date(student.planStartMonday + "T00:00:00") : mondayOf(new Date());
  const target = new Date(dateStr + "T00:00:00");
  const targetMonday = mondayOf(target);
  const diffWeeks = Math.round((targetMonday - planStartMonday) / (7 * 24 * 60 * 60 * 1000));
  return Math.max(1, 1 + diffWeeks);
}
// Calcula los overrides (volumen, fondo, calidad) para insertar una carrera intermedia sin
// tocar el resto del ciclo — solo la semana de la carrera y la siguiente se ajustan; de ahí en
// adelante el plan sigue exactamente con la tabla de calidad normal, como si nada hubiera pasado.
export function computeIntermediateRaceOverrides(student, raceGoalId, raceDateStr) {
  const raceWeekNum = getWeekNumForDate(student, raceDateStr);
  const recoveryWeekNum = raceWeekNum + 1;
  const refKm = student.peakKm || student.weeks?.[student.currentWeek]?.weeklyKm || 80;
  const raceKm = DISTANCE_KM[raceGoalId] || 21.0975;
  const taperVolume = rWhole(refKm * 0.55);
  const recoveryVolume = rWhole(refKm * 0.7);
  const recoveryLongKm = rWhole(recoveryVolume * 0.24);
  return {
    raceWeekNum, recoveryWeekNum, taperVolume, recoveryVolume, raceKm,
    volumeOverrides: { [raceWeekNum]: taperVolume, [recoveryWeekNum]: recoveryVolume },
    longRunOverrides: { [raceWeekNum]: raceKm, [recoveryWeekNum]: recoveryLongKm },
    qualityOverrides: {
      [raceWeekNum]: { q1Type: "E", q2Type: "I", q2Dist: 1, q2Reps: 3, q3Type: "E" },
      [recoveryWeekNum]: { q1Type: "E", q2Type: "T", q2Dist: 25, q3Type: "E" },
    },
  };
}

// La semana que el alumno debe ver/registrar activamente: la primera que todavía no fue
// confirmada como cerrada (ni por el alumno al enviarla, ni por el coach al cerrarla). Ya no
// avanza sola solo porque cambió la fecha — necesita esa confirmación real.
export function getActiveLogWeek(student, today) {
  const nums = Object.keys(student.weeks || {}).map(Number).filter((n) => Number.isFinite(n) && n >= 1);
  const furthest = nums.length ? Math.max(...nums) : 1;
  const hoy = Math.max(1, getTodayWeekNum(student, today));

  // LA SEMANA ACTIVA ES LA DE HOY. Una semana que ya pasó es historial, la haya enviado el
  // alumno o no.
  //
  // Antes la activa era "la primera que el alumno no envió", pensando en respetar a quien
  // venía atrasado. Pero eso era una trampa sin salida: una semana vieja sin enviar tampoco
  // se puede enviar, porque el calendario ya la cerró y el botón desaparece. El puntero se
  // quedaba clavado ahí y TODAS las semanas siguientes pasaban a contar como futuras, así
  // que el alumno no podía registrar nada nunca más — ni en la vieja ni en la de hoy.

  // Si el plan no llega hasta hoy (el coach aún no preparó más), se queda en la última que
  // exista. Es el caso de "esperando al coach".
  if (hoy >= furthest) return furthest;

  // Caso normal: la semana de hoy existe y es la activa. No se adelanta al calendario — si
  // el coach dejó listas varias semanas, esas siguen siendo adelanto hasta que llegue su
  // lunes (a las 00:00 de la hora local del alumno, esté donde esté).
  if (student.weeks[hoy]) return hoy;

  // Hueco raro en medio del historial: se usa la última que exista antes de hoy, para no
  // devolver nunca un número de semana que no está en el plan.
  for (let n = hoy; n >= 1; n--) if (student.weeks[n]) return n;
  return furthest;
}
export function getTaperWeeks(goalId) { return goalId === "42k" ? 2 : 1; }
export function getPhase(weeksToRace, goalId) {
  const taperWeeks = getTaperWeeks(goalId);
  if (weeksToRace <= 0) return "race";
  if (weeksToRace <= taperWeeks) return "taper";
  const cyclePos = getCyclePosition(weeksToRace, taperWeeks);
  if (cyclePos.isPeak) return "peak"; // Pico: parte del bloque Específico, mostrado aparte
  if (cyclePos.chunk === 0) return "peak"; // Específico: el bloque de 4 semanas inmediatamente después del pico
  if (cyclePos.chunk === 1 || cyclePos.chunk === 2) return "build"; // Velocidad: los 2 bloques siguientes (8 semanas)
  return "base"; // cualquier bloque más allá
}
export function r1(x) { return Math.round(x * 2) / 2; }
export function rWhole(x) { return Math.round(x); } // para totales semanales y del fondo: siempre números enteros

/* ---------------------------------------------------------
   ESTRUCTURA SEMANAL (Pfitzinger / Daniels)
   Martes y jueves = calidad, Domingo = fondo; frecuencia según nivel
--------------------------------------------------------- */
export function isSpeed(goalId) { return goalId === "10k"; }
export function isEndurance(goalId) { return goalId === "21k" || goalId === "42k"; }

export function anchorPacesToGoal(paces, goalId) {
  if (goalId === "42k" && paces.race && paces.M) {
    const ratio = paces.race / paces.M;
    ["M", "HM", "E", "long", "T", "I", "R"].forEach((k) => { if (paces[k] != null) paces[k] = paces[k] * ratio; });
  } else if (goalId === "21k" && paces.race && paces.HM) {
    // El objetivo real de 21K se toma como ritmo exacto de media maratón; el ritmo maratón
    // equivalente (y el resto de la tabla) se reescala proporcionalmente según VDOT.
    const ratio = paces.race / paces.HM;
    ["M", "HM", "E", "long", "T", "I", "R"].forEach((k) => { if (paces[k] != null) paces[k] = paces[k] * ratio; });
  }
  return paces;
}

export const LONG_RUN_CAP_KM = { "5k": 16, "10k": 18, "21k": 27, "42k": 34 };
export const LONG_RUN_LEVEL_BONUS = { principiante: 0, intermedio0: 0, intermedio1: 0, intermedio2: 0, avanzado1: 1, avanzado2: 2 };
export function capLongRunKm(goalId, level, km) {
  const cap = (LONG_RUN_CAP_KM[goalId] ?? 30) + (LONG_RUN_LEVEL_BONUS[level] ?? 0);
  return Math.round(Math.min(km, cap) * 2) / 2;
}
/* El fondo largo no debería llevarse casi la mitad del volumen semanal: se recorta su
   porcentaje de la plantilla y se redistribuye entre el resto de los días. */
export function capLongPct(template, factor) {
  const longIdx = template.findIndex((t) => t.slot === "long");
  if (longIdx < 0) return template;
  const oldPct = template[longIdx].pct;
  const newPct = oldPct * factor;
  const removed = oldPct - newPct;
  const others = template.map((p, i) => ({ p, i })).filter((o) => o.i !== longIdx && o.p.pct > 0);
  const totalOther = others.reduce((s, o) => s + o.p.pct, 0) || 1;
  return template.map((p, i) => {
    if (i === longIdx) return { ...p, pct: newPct };
    if (p.pct > 0) return { ...p, pct: p.pct + removed * (p.pct / totalOther) };
    return p;
  });
}

export const THRESHOLD_DURATION_TABLE = { 1: 45, 2: 50, 3: 50, 4: 45, 5: 40, 6: 35, 7: 30, 8: 25 };
// 21K: cada sesión 5' más corta que la de 42K, con tope 45' y piso 25' — la semana que quedaría en 20' se suprime
// (esa semana pasa a Intervalos, igual que las semanas anteriores a que empiece el umbral).
export const THRESHOLD_DURATION_TABLE_21K = { 1: 40, 2: 45, 3: 45, 4: 40, 5: 35, 6: 30, 7: 25 };
export function getForcedThresholdDuration(weeksToRace, goalId) {
  if (weeksToRace == null) return null;
  if (weeksToRace === 0) return null; // semana de carrera: sin umbral
  const table = goalId === "21k" ? THRESHOLD_DURATION_TABLE_21K : THRESHOLD_DURATION_TABLE;
  return table[weeksToRace] ?? null;
}

// Umbral fraccionado: 3 pasadas al ritmo que le correspondería a un umbral continuo de la
// duración de referencia (según la tabla de ritmos), con descanso de trote entre pasadas.
// Progresión de 5 niveles, pensada para las semanas de fase Base antes de entrar a Velocidad
// (aunque también se puede elegir manualmente en cualquier semana).
export const BROKEN_T_TABLE = [
  { workMin: 8, refMin: 25, recoveryMin: 3 },
  { workMin: 9, refMin: 30, recoveryMin: 3 },
  { workMin: 11, refMin: 35, recoveryMin: 3 },
  { workMin: 12, refMin: 40, recoveryMin: 4 },
  { workMin: 14, refMin: 45, recoveryMin: 4 },
];
export function getBrokenTVariant(idx) {
  return BROKEN_T_TABLE[Math.max(0, Math.min(BROKEN_T_TABLE.length - 1, idx))];
}
// Para la fase Base: entre más cerca esté la semana de entrar a Velocidad, más alto el nivel (5 = el más exigente).
export function getBaseBrokenTIndex(chunk, w) {
  // Índice base según el bloque (más cerca de Específico = más exigente).
  const base = Math.max(0, Math.min(4, 6 - chunk));
  // Dentro del mismo bloque, progresa semana a semana: w=1 (más floja) -> w=3 (la de mayor carga).
  const wAdj = { 1: -1, 2: 0, 3: 1 }[w] ?? 0;
  return Math.max(0, Math.min(4, base + wAdj));
}
export function evenReps(n) {
  const r = Math.round(n);
  return r % 2 === 0 ? Math.max(2, r) : Math.max(2, r + 1);
}
// w = posición cronológica dentro del bloque de 4 semanas (1,2,3 = carga creciente; 4 = asimilación, más ligera)
export const W_MULT = { 1: 0.85, 2: 0.925, 3: 1.0, 4: 0.7 };
export function chunkMult(chunk) { return Math.max(0.6, 1 - 0.15 * chunk); }

// Repeticiones (Series) por defecto para Avanzado 1 y 2, por distancia — el resto de niveles sigue con la fórmula automática.
export const R_REPS_DEFAULT = {
  avanzado1: { 0.2: 12, 0.4: 10, 0.6: 8, 0.8: 8 },
  avanzado2: { 0.2: 14, 0.4: 12, 0.6: 10, 0.8: 10 },
};
// Intervalos por defecto para Avanzado 1 y 2, por distancia (3k no se especificó, sigue la fórmula automática).
export const I_REPS_DEFAULT = {
  avanzado1: { 1: 6, 2: 3, 4: 2, 5: 2 },
  avanzado2: { 1: 10, 2: 5, 4: 3, 5: 2 },
};

// Martes en fase Velocidad: Series de 200 o 400m, con repeticiones que suben y bajan con la carga real de esa semana.
export function getVelocidadSeries(chunk, w, level) {
  const dist = w === 3 ? 0.4 : 0.2; // la semana de mayor carga del bloque usa la distancia más larga
  const fixedReps = R_REPS_DEFAULT[level]?.[dist];
  if (fixedReps != null) return { dist, reps: fixedReps };
  const base = dist === 0.4 ? 9 : 11;
  return { dist, reps: evenReps(base * chunkMult(chunk) * (W_MULT[w] ?? 1)) };
}
// Martes en fase Específico: Intervalos que se alargan progresivamente semana a semana (2k -> 3k -> 4k).
export function getEspecificoIntervalos(w, level) {
  const table = { 1: { dist: 2, base: 6 }, 2: { dist: 3, base: 4 }, 3: { dist: 4, base: 4 } };
  const t = table[w] || table[1];
  const fixedReps = I_REPS_DEFAULT[level]?.[t.dist];
  if (fixedReps != null) return { dist: t.dist, reps: fixedReps };
  return { dist: t.dist, reps: evenReps(t.base) };
}
// Jueves antes de la semana 8: Intervalos de 1k o 2k (todavía no toca umbral continuo), variando repeticiones.
export function getPreUmbralIntervalos(chunk, w, level) {
  // Semana de mayor carga del bloque (w=3): pasadas más largas, 2km.
  // Las otras semanas de carga (w=1,2): pasadas de 1km.
  // Asimilación (w=4): la más ligera, 1km.
  const dist = w === 3 ? 2 : 1;
  const fixedReps = I_REPS_DEFAULT[level]?.[dist];
  if (fixedReps != null) return { dist, reps: fixedReps };
  if (w === 3) return { dist: 2, reps: 4 };
  if (w === 2) return { dist: 1, reps: 8 };
  if (w === 1) return { dist: 1, reps: 6 };
  return { dist: 1, reps: 6 };
}

// Tabla explícita de calidad (martes/jueves) para niveles Avanzado 1 y 2, semana a semana
// (contando hacia atrás desde la carrera). Sustituye la fórmula genérica para estos niveles
// en las semanas 1-15; más allá de la semana 15 se sigue con la fórmula automática.
export const AVANZADO_QUALITY_TABLE = {
  1: { q1: null, q2: { type: "T", dist: 45 } },
  2: { q1: { type: "combo1k500" }, q2: { type: "T", dist: 50 } },
  3: { q1: { type: "combo1k500" }, q2: { type: "T", dist: 50 } },
  4: { q1: null, q2: { type: "T", dist: 45 } },
  5: { q1: { type: "I", dist: 4, reps: 2 }, q2: { type: "T", dist: 40 } },
  6: { q1: { type: "I", dist: 3, reps: 3 }, q2: { type: "T", dist: 35 } },
  7: { q1: { type: "I", dist: 2, reps: 4 }, q2: { type: "T", dist: 30 } },
  8: { q1: null, q2: { type: "T", dist: 25 } },
  9: { q1: { type: "R", dist: 0.8, reps: 6 }, q2: { type: "I", dist: 2, reps: 3 } },
  10: { q1: { type: "R", dist: 0.6, reps: 8 }, q2: { type: "I", dist: 2, reps: 3 } },
  11: { q1: { type: "R", dist: 0.4, reps: 12 }, q2: { type: "I", dist: 1, reps: 8 } },
  12: { q1: null, q2: { type: "I", dist: 1, reps: 8 } },
  13: { q1: { type: "R", dist: 0.4, reps: 10 }, q2: { type: "I", dist: 1, reps: 6 } },
  14: { q1: { type: "R", dist: 0.2, reps: 12 }, q2: { type: "I", dist: 1, reps: 6 } },
  15: { q1: { type: "R", dist: 0.2, reps: 10 }, q2: { type: "combo1k500" } },
};

// Intermedio 1 y 2: misma tabla que Avanzado, pero los Intervalos (I) usan la misma cantidad
// de repeticiones, y las Series (R) usan un escalón menos (2 repeticiones menos).
export const R_REPS_STEP_DOWN = 2;
export function deriveIntermedioEntry(entry) {
  if (!entry) return null;
  if (entry.type === "R") return { type: "R", dist: entry.dist, reps: Math.max(2, entry.reps - R_REPS_STEP_DOWN) };
  return { ...entry }; // Intervalos (I), Umbral (T) y 1k+500: misma cantidad que Avanzado
}
export const INTERMEDIO_QUALITY_TABLE = {};
for (const wk in AVANZADO_QUALITY_TABLE) {
  const e = AVANZADO_QUALITY_TABLE[wk];
  INTERMEDIO_QUALITY_TABLE[wk] = { q1: deriveIntermedioEntry(e.q1), q2: deriveIntermedioEntry(e.q2) };
}

// Tabla específica para 21K (taper de 1 semana, no 2 como en 42K, así que el pico y las fases caen en semanas distintas).
export const AVANZADO_QUALITY_TABLE_21K = {
  1: { q1: null, q2: { type: "T", dist: 45 } },
  2: { q1: { type: "combo1k500" }, q2: { type: "T", dist: 50 } },
  3: { q1: null, q2: { type: "T", dist: 45 } },
  4: { q1: { type: "I", dist: 4, reps: 2 }, q2: { type: "T", dist: 40 } },
  5: { q1: { type: "I", dist: 3, reps: 3 }, q2: { type: "T", dist: 35 } },
  6: { q1: { type: "I", dist: 2, reps: 4 }, q2: { type: "T", dist: 30 } },
  7: { q1: null, q2: { type: "T", dist: 25 } },
  8: { q1: { type: "R", dist: 0.8, reps: 6 }, q2: { type: "I", dist: 2, reps: 3 } },
  9: { q1: { type: "R", dist: 0.6, reps: 8 }, q2: { type: "I", dist: 2, reps: 3 } },
  10: { q1: { type: "R", dist: 0.4, reps: 12 }, q2: { type: "I", dist: 1, reps: 8 } },
  11: { q1: null, q2: { type: "I", dist: 1, reps: 8 } },
  12: { q1: { type: "R", dist: 0.4, reps: 10 }, q2: { type: "I", dist: 1, reps: 6 } },
  13: { q1: { type: "R", dist: 0.2, reps: 12 }, q2: { type: "I", dist: 1, reps: 6 } },
  14: { q1: { type: "R", dist: 0.2, reps: 10 }, q2: { type: "combo1k500" } },
  15: { q1: null, q2: { type: "combo1k500" } },
};
export const INTERMEDIO_QUALITY_TABLE_21K = {};
for (const wk in AVANZADO_QUALITY_TABLE_21K) {
  const e = AVANZADO_QUALITY_TABLE_21K[wk];
  INTERMEDIO_QUALITY_TABLE_21K[wk] = { q1: deriveIntermedioEntry(e.q1), q2: deriveIntermedioEntry(e.q2) };
}

export function suggestQualityPaces(goalId, phase, weeksToRace, taperWeeks, cyclePosParam, level) {
  const speed = isSpeed(goalId);
  const cyclePos = cyclePosParam || getCyclePosition(weeksToRace, taperWeeks);
  const isAssimilation = cyclePos.isAssimilation;
  const isAvanzado = level === "avanzado1" || level === "avanzado2";
  const isIntermedio = level === "intermedio0" || level === "intermedio1" || level === "intermedio2";
  const is21k = goalId === "21k";
  const avTable = is21k ? AVANZADO_QUALITY_TABLE_21K : AVANZADO_QUALITY_TABLE;
  const imTable = is21k ? INTERMEDIO_QUALITY_TABLE_21K : INTERMEDIO_QUALITY_TABLE;
  const avanzadoEntry = weeksToRace != null && goalId !== "10k"
    ? (isAvanzado ? avTable[weeksToRace] : (isIntermedio ? imTable[weeksToRace] : null))
    : null;

  let q1, q1Dist = null, q1Reps = null;
  if (avanzadoEntry) {
    if (avanzadoEntry.q1) { q1 = avanzadoEntry.q1.type; q1Dist = avanzadoEntry.q1.dist ?? null; q1Reps = avanzadoEntry.q1.reps ?? null; }
    else q1 = "E";
  } else if (phase === "race") q1 = "E";
  else if (isAssimilation) q1 = "E"; // semana de asimilación: la única calidad es el jueves
  else if (phase === "build") {
    q1 = "R";
    const v = getVelocidadSeries(cyclePos.chunk, cyclePos.w, level);
    q1Dist = v.dist; q1Reps = v.reps;
  } else if (phase === "peak") {
    q1 = "I";
    const v = getEspecificoIntervalos(cyclePos.w, level);
    q1Dist = v.dist; q1Reps = v.reps;
  } else if (phase === "taper") q1 = speed ? "I" : "race";
  else q1 = "E"; // base

  const thresholdMin = getForcedThresholdDuration(weeksToRace, goalId);
  let q2, q2Dist = null, q2Reps = null, q2RefMin = null;
  if (avanzadoEntry) {
    q2 = avanzadoEntry.q2.type; q2Dist = avanzadoEntry.q2.dist ?? null; q2Reps = avanzadoEntry.q2.reps ?? null;
  } else if (weeksToRace === 0) { q2 = "E"; }
  else if (thresholdMin != null) { q2 = "T"; q2Dist = thresholdMin; }
  else if (phase === "base" && !isAssimilation) {
    q2 = "brokenT";
    const v = getBrokenTVariant(getBaseBrokenTIndex(cyclePos.chunk, cyclePos.w));
    q2Dist = v.workMin; q2RefMin = v.refMin; q2Reps = v.recoveryMin;
  } else {
    q2 = "I";
    const v = getPreUmbralIntervalos(cyclePos.chunk, cyclePos.w, level);
    q2Dist = v.dist; q2Reps = v.reps;
  }

  // Sábado: run/walk la mayoría de las semanas; series largas de pre-carga solo
  // en el último bloque de 4 semanas antes del taper.
  let q3 = "E";
  if (weeksToRace != null && taperWeeks != null && weeksToRace > taperWeeks && weeksToRace <= taperWeeks + 4) {
    q3 = "broken";
  }
  return { q1, q2, q3, q1Dist, q1Reps, q2Dist, q2Reps, q2RefMin };
}

export function findFirstSlotIndex(template, slot) {
  for (let i = 0; i < template.length; i++) if (template[i].slot === slot) return i;
  return -1;
}
export function convertSlotToRest(template, idx) {
  if (idx < 0) return template;
  const removedPct = template[idx].pct;
  const others = template.map((p, i) => ({ p, i })).filter((o) => o.i !== idx && o.p.pct > 0);
  const totalOther = others.reduce((s, o) => s + o.p.pct, 0) || 1;
  return template.map((p, i) => {
    if (i === idx) return { type: "Descanso", pace: "", pct: 0, slot: "rest" };
    if (p.pct > 0) return { ...p, pct: p.pct + removedPct * (p.pct / totalOther) };
    return p;
  });
}
export function convertRestToEasy(template, idx, alloc, label) {
  if (idx < 0) return template;
  const scale = 1 - alloc;
  return template.map((p, i) => {
    if (i === idx) return { type: label || "Recuperación suave", pace: "E", pct: alloc, slot: "easy" };
    if (p.pct > 0) return { ...p, pct: p.pct * scale };
    return p;
  });
}
export function adjustTemplateForLevel(template, trainDays) {
  let result = template.map((t) => ({ ...t }));
  if (trainDays === 5) return result;
  if (trainDays === 4) return convertSlotToRest(result, findFirstSlotIndex(result, "easy"));
  if (trainDays === 6) return convertRestToEasy(result, findFirstSlotIndex(result, "rest"), 0.07, "Recuperación suave");
  if (trainDays === 7) {
    result = convertRestToEasy(result, findFirstSlotIndex(result, "rest"), 0.07, "Recuperación suave");
    result = convertRestToEasy(result, findFirstSlotIndex(result, "rest"), 0.07, "Acumulación");
    return result;
  }
  return result;
}

export const LEVEL_DAY_ROLES = {
  principiante: ["rest", "q1", "rest", "q2", "rest", "rest", "long"],  // 3 días: Mar, Jue, Dom
  intermedio0: ["rest", "q1", "rest", "q2", "rest", "rest", "long"],   // 3 días: Mar, Jue, Dom
  intermedio1: ["rest", "q1", "easyA", "rest", "q2", "rest", "long"],   // descansa Lun, Jue, Sáb
  intermedio2: ["rest", "q1", "easyA", "q2", "easyB", "rest", "long"],  // descansa Lun, Sáb
  avanzado1: ["rest", "q1", "easyA", "q2", "easyB", "q3", "long"],      // descansa solo Lun
  avanzado2: ["easyC", "q1", "easyA", "q2", "easyB", "q3", "long"],    // sin descanso
};

export function getDayLayoutTemplate(goalId, phase, level, weeksToRace) {
  if (weeksToRace === 0) {
    return [
      { type: "Descanso", pace: "", pct: 0, slot: "rest" },
      { type: "Descanso", pace: "", pct: 0, slot: "rest" },
      { type: "Rodaje muy suave", pace: "E", pct: 0.3, slot: "easy" },
      { type: "Descanso", pace: "", pct: 0, slot: "rest" },
      { type: "Descanso", pace: "", pct: 0, slot: "rest" },
      { type: "Activación corta", pace: "E", pct: 0.2, slot: "q3" },
      { type: "Día de la carrera", pace: "race", pct: 0.5, slot: "long" },
    ];
  }

  let content, pctTable;
  if (goalId === "fitness") {
    content = {
      q1: { type: "Rodaje moderado", pace: "M" }, easyA: { type: "Acumulación", pace: "E" },
      q2: { type: "Rodaje moderado", pace: "M" }, easyB: { type: "Acumulación", pace: "E" },
      q3: { type: "Acumulación", pace: "E" }, long: { type: "Fondo largo suave", pace: "E" },
    };
    pctTable = { q1: 0.16, easyA: 0.14, q2: 0.16, easyB: 0.14, q3: 0.12, long: 0.28 };
  } else {
    const speed = isSpeed(goalId);
    const CONTENT = {
      base: {
        q1: { type: "Rodaje suave", pace: "E" }, easyA: { type: "Acumulación", pace: "E" },
        q2: { type: "Rodaje suave + progresiones", pace: "E" }, easyB: { type: "Acumulación", pace: "E" },
        q3: { type: "Acumulación", pace: "E" }, long: { type: "Fondo estructurado", pace: "long" },
      },
      build: {
        q1: { type: speed ? "Series · Intervalos" : "Series · Velocidad", pace: speed ? "I" : "R" },
        easyA: { type: "Acumulación", pace: "E" }, q2: { type: "Umbral", pace: "T" },
        easyB: { type: "Acumulación", pace: "E" }, q3: { type: "Acumulación", pace: "E" },
        long: { type: "Fondo estructurado", pace: "long" },
      },
      peak: {
        q1: { type: "Series · Velocidad", pace: "R" }, easyA: { type: "Acumulación", pace: "E" },
        q2: { type: "Ritmo objetivo", pace: "race" }, easyB: { type: "Acumulación", pace: "E" },
        q3: { type: "Pre-carga", pace: "E" }, long: { type: "Fondo estructurado", pace: "long" },
      },
      taper: {
        q1: { type: speed ? "Series cortas de afinamiento" : "Series cortas a ritmo objetivo", pace: speed ? "I" : "race" },
        easyA: { type: "Acumulación corta", pace: "E" }, q2: { type: "Activación suave", pace: "E" },
        easyB: { type: "Acumulación", pace: "E" }, q3: { type: "Pre-carga suave", pace: "E" },
        long: { type: "Fondo reducido", pace: "long" },
      },
    };
    const PCT = {
      base: { q1: 0.13, easyA: 0.13, q2: 0.15, easyB: 0.13, q3: 0.1, long: 0.36 },
      build: { q1: 0.13, easyA: 0.11, q2: 0.14, easyB: 0.11, q3: 0.11, long: 0.4 },
      peak: { q1: 0.1, easyA: 0.1, q2: 0.15, easyB: 0.1, q3: 0.11, long: 0.44 },
      taper: { q1: 0.1, easyA: 0.13, q2: 0.11, easyB: 0.12, q3: 0.12, long: 0.42 },
    };
    content = CONTENT[phase] || CONTENT.base;
    pctTable = PCT[phase] || PCT.base;
  }

  const roles = LEVEL_DAY_ROLES[level] || LEVEL_DAY_ROLES.intermedio2;
  const presentRoles = roles.filter((r) => r !== "rest" && r !== "easyC");
  const totalPresentPct = presentRoles.reduce((s, r) => s + (pctTable[r] || 0), 0) || 1;
  const monBonus = roles[0] === "easyC" ? 0.07 : 0;
  const scale = (1 - monBonus) / totalPresentPct;

  let template = roles.map((role) => {
    if (role === "rest") return { type: "Descanso", pace: "", pct: 0, slot: "rest" };
    if (role === "easyC") return { type: "Recuperación suave", pace: "E", pct: monBonus, slot: "easy" };
    const c = content[role] || content.easyA;
    const slotName = role === "easyA" || role === "easyB" ? "easy" : role;
    return { type: c.type, pace: c.pace, pct: (pctTable[role] || 0) * scale, slot: slotName };
  });
  if (goalId !== "fitness") template = capLongPct(template, 0.72);
  return template;
}

/* ---------------------------------------------------------
   DETALLE DE SESIÓN (calentamiento + serie + enfriamiento, run/walk, fondo progresivo)
--------------------------------------------------------- */
/* Ajustes de ritmo según distancia/duración exacta (principio VDOT: a más distancia/tiempo, ligeramente más lento) */
/* Ajustes de ritmo según distancia/duración exacta.
   Repeticiones: 200-800m. 200 = ritmo R base (VDOT); 800 = un poco más rápido que el intervalo de 1k;
   400 y 600 se extrapolan entre esos dos extremos.
   Intervalos: 1k-4k. 1k = ritmo de media maratón; 4k = ritmo maratón; 2k y 3k se extrapolan entre ambos. */
export const R_DISTANCES = [0.2, 0.3, 0.4, 0.6, 0.8]; // 200, 300, 400, 600, 800 m
export const R_RECOVERY_MIN = { 0.2: 1, 0.3: 1.5, 0.4: 2, 0.6: 3, 0.8: 4 }; // recuperación: 200m=1', 300m=1'30", 400m=2', 600m=3', 800m=4'
export const I_RECOVERY_DIST_KM = 0.5; // intervalos (cualquier distancia): descanso de 500m, convertido a minutos vía ritmo suave.
export function getIRecoveryMin(d, easyP) {
  return r1(I_RECOVERY_DIST_KM * (easyP || 5));
}
export const I_DISTANCES = [1.0, 2.0, 3.0, 4.0, 5.0]; // 1k, 2k, 3k, 4k, 5k
export const T_DURATIONS = [25, 30, 35, 40, 45, 50]; // minutos continuos
export const I_DIST_BY_PHASE = { base: [1], build: [1], peak: [2, 3, 4], taper: [1] };
export const R_DIST_BY_PHASE = { base: [0.2, 0.4], build: [0.2, 0.4], peak: [0.6, 0.8], taper: [0.2] };
export function getIPace(hmPace, mPace, d) {
  if (hmPace == null || mPace == null) return null;
  const frac = (d - 1) / (4 - 1);
  return hmPace + (mPace - hmPace) * frac;
}
export function getRPace(r200Pace, hmPace, d) {
  if (r200Pace == null) return null;
  const r800Pace = hmPace != null ? hmPace * 0.975 : r200Pace * 1.2; // un poco más rápido que el intervalo de 1k (HM)
  if (d <= 0.2) return r200Pace;
  if (d >= 0.8) return r800Pace;
  const frac = (d - 0.2) / (0.8 - 0.2);
  return r200Pace + (r800Pace - r200Pace) * frac;
}
export function getTPace(baseT, dur) { return baseT; } // reemplazado por getTPaceForDuration (HM->M); se deja por compatibilidad
export function formatDist(d) { return d < 1 ? `${Math.round(d * 1000)} m` : `${d % 1 === 0 ? d : d.toFixed(1)} km`; }
export function pickRepScheme(pool, distances, minReps, maxReps, recoveryKmFn) {
  let best = { d: distances[0], reps: minReps, recKm: recoveryKmFn(distances[0]) }, bestDiff = Infinity;
  for (const d of distances) {
    const recKm = recoveryKmFn(d);
    for (let reps = minReps; reps <= maxReps; reps += 2) { // siempre pares
      const total = reps * (d + recKm);
      const diff = Math.abs(total - pool);
      if (diff < bestDiff) { bestDiff = diff; best = { d, reps, recKm }; }
    }
  }
  return best;
}

// --- Bloques de Run/Walk de los planes de carrera (10K / 21K / 42K) ---
// El trote de cada bloque va de 10' a 20', de minuto en minuto (11', 12', 13'... 19', 20'),
// con 1' de caminata entre bloques. Se reparte la sesión primero en 3 bloques; si con 3 el
// trote se pasaría de 20', se prueba con 4. Solo cuando ni con 4 bloques alcanza (sesiones
// muy largas) se suman más bloques, pero nunca se supera el techo de 20'. Las sesiones muy
// cortas usan menos bloques, porque bajar de 10' de trote deja de tener sentido como
// estímulo: antes el sistema saltaba de 12' a 15' y de ahí a 18' o 20', sin los valores
// intermedios y sin una preferencia clara por 3 bloques.
export const RUNWALK_BLOCK_MIN_MINUTES = 10;
export const RUNWALK_BLOCK_MAX_MINUTES = 20;
export const RUNWALK_WALK_MINUTES = 1;
// Orden en que se prueban las cantidades de bloques: 3 primero, 4 después, y recién luego
// el resto (2 antes que 1, para que una sesión corta conserve al menos una caminata).
export const RUNWALK_REPS_PREFERENCE = [3, 4, 2, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 1];

export function computeRunWalkBlocks(totalMin, maxBlockMin) {
  const walk = RUNWALK_WALK_MINUTES;
  const maxBlock = Math.max(RUNWALK_BLOCK_MIN_MINUTES, maxBlockMin || RUNWALK_BLOCK_MAX_MINUTES);
  const total = Math.max(0, Math.round(totalMin || 0));
  let fits = null;      // primer reparto válido en orden de preferencia y bien ajustado
  let loose = null;      // reparto válido pero con más desvío, por si ninguno ajusta
  let closest = null;    // red de seguridad: lo más cercano aunque haya que recortar
  for (const reps of RUNWALK_REPS_PREFERENCE) {
    // Trote por bloque que repartiría la sesión completa con esta cantidad de bloques.
    const exact = (total - reps * walk) / reps;
    const blockMin = Math.min(maxBlock, Math.max(RUNWALK_BLOCK_MIN_MINUTES, Math.round(exact)));
    const accumulatedMin = reps * (blockMin + walk);
    const cand = { reps, blockMin, walkMin: walk, accumulatedMin, diff: Math.abs(accumulatedMin - total) };
    // "Cabe" si el reparto cae dentro de la franja permitida (con medio minuto de tolerancia
    // para poder redondear), no si hubo que recortarlo contra el mínimo o el máximo.
    const inRange = exact >= RUNWALK_BLOCK_MIN_MINUTES - 0.5 && exact <= maxBlock + 0.5;
    // Entre los repartos válidos se toma el primero en orden de preferencia que además quede
    // a 2' o menos del total real. En 3 y 4 bloques el redondeo nunca pasa de ahí, así que la
    // preferencia por 3 (y luego 4) se respeta siempre; el criterio solo entra en juego en
    // sesiones muy largas, donde repartir en muchos bloques acumula error de redondeo.
    if (inRange && cand.diff <= 2 && !fits) fits = cand;
    if (inRange && (!loose || cand.diff < loose.diff)) loose = cand;
    if (!closest || cand.diff < closest.diff) closest = cand;
  }
  return fits || loose || closest || { reps: 1, blockMin: RUNWALK_BLOCK_MIN_MINUTES, walkMin: walk, accumulatedMin: RUNWALK_BLOCK_MIN_MINUTES + walk, diff: 0 };
}

// Minutos estimados de una sesión de Run/Walk a partir de su kilometraje y su ritmo.
export function getRunWalkTotalMin(day) {
  return day.targetPace ? Math.round((day.km || 0) * day.targetPace) : Math.round((day.km || 0) * 7);
}

// Estructura de bloques de un día concreto. El lunes de recuperación mantiene su criterio
// propio: bloques más cortos (techo de 15'), que es lo que corresponde a un día de descarga.
export function getRunWalkPlan(day) {
  return computeRunWalkBlocks(getRunWalkTotalMin(day), day.isMondayRecovery ? 15 : RUNWALK_BLOCK_MAX_MINUTES);
}

// Calcula el mismo ritmo "representativo" que se muestra en el detalle de la sesión
// (usa la distancia/duración real de esa sesión, no un valor genérico de referencia).
// Arma la estructura de fases de una sesión para el modo "entrenamiento en vivo":
// una lista de segmentos (warm-up, bloques, descansos, cool-down), cada uno con su
// meta en distancia (o en tiempo cuando así corresponde), para poder avisar al
// alumno en cada transición mientras entrena.
/* ---------------------------------------------------------
   FARTLEK Y CUESTAS — calidades suaves de la base.
   Fartlek: n x (trabajo rápido + trote suave), por tiempo; el tramo rápido va al ritmo de
   umbral como referencia, pero se corre por sensaciones.
   Cuestas: n x subida fuerte (en segundos), bajando al trote; sin ritmo objetivo, por esfuerzo.
   Campos: repsOverride = repeticiones, distOverride = minutos (fartlek) o segundos (cuestas)
   de cada tramo de trabajo, recoveryOverride = minutos de recuperación.
--------------------------------------------------------- */
export const FARTLEK_DEFAULT = { reps: 8, workMin: 1, recMin: 1 };
export const HILLS_DEFAULT = { reps: 6, workSec: 45, recMin: 2 };
export const FARTLEK_PROGRESION = [
  { reps: 6, workMin: 1, recMin: 1 }, { reps: 8, workMin: 1, recMin: 1 }, { reps: 10, workMin: 1, recMin: 1 },
  { reps: 6, workMin: 2, recMin: 1 }, { reps: 8, workMin: 2, recMin: 1 },
];
export const HILLS_PROGRESION = [
  { reps: 6, workSec: 45, recMin: 2 }, { reps: 8, workSec: 45, recMin: 2 }, { reps: 10, workSec: 45, recMin: 2 },
  { reps: 8, workSec: 60, recMin: 2.5 }, { reps: 10, workSec: 60, recMin: 2.5 },
];
export function esCalidadSuave(paceKey) { return paceKey === "fartlek" || paceKey === "hills"; }
export function calidadSuave(day) {
  const ep = day.easyPace || 5;
  if (day.paceKey === "fartlek") {
    const reps = day.repsOverride || FARTLEK_DEFAULT.reps;
    const workMin = day.distOverride || FARTLEK_DEFAULT.workMin;
    const recMin = day.recoveryOverride ?? FARTLEK_DEFAULT.recMin;
    const workPace = day.paceOverride || getTPaceForDuration(day.hmPace, day.marathonPace, 30) || day.targetPace || ep * 0.85;
    return { reps, workMin, recMin, workPace, recPace: ep, warmKm: 3, coolKm: 2 };
  }
  const reps = day.repsOverride || HILLS_DEFAULT.reps;
  const workSec = day.distOverride || HILLS_DEFAULT.workSec;
  const recMin = day.recoveryOverride ?? HILLS_DEFAULT.recMin;
  // En subida se avanza más lento aunque el esfuerzo sea alto: para contar los km se usa el
  // ritmo suave en la subida y un trote algo más lento en la bajada.
  return { reps, workMin: workSec / 60, workSec, recMin, workPace: ep, recPace: ep * 1.1, warmKm: 3, coolKm: 2 };
}
export function calidadSuaveKm(day) {
  const c = calidadSuave(day);
  return r1(c.warmKm + c.reps * (c.workMin / c.workPace + c.recMin / c.recPace) + c.coolKm);
}
function fmtSeg(sec) { return sec % 60 === 0 ? `${sec / 60}'` : `${sec}"`; }

// Strides como pasos propios: 20" rápidos y 1' caminando entre cada uno (no después del último).
function agregarStrides(segs, n) {
  for (let s = 1; s <= n; s++) {
    segs.push({ label: `Stride ${s} de ${n}`, type: "time", target: 20 / 60, pace: null });
    if (s < n) segs.push({ label: "Caminata", type: "time", target: 1, pace: null });
  }
}

export function buildLiveSegments(day, easyP) {
  const ep = easyP || 5;
  const segs = [];
  if (!day.paceKey || day.paceKey === "") return segs;

  if (esCalidadSuave(day.paceKey)) {
    const c = calidadSuave({ ...day, easyPace: day.easyPace || ep });
    const hills = day.paceKey === "hills";
    segs.push({ label: "Warm-up", type: "distance", target: c.warmKm, pace: day.easyPace });
    for (let r = 1; r <= c.reps; r++) {
      segs.push({ label: hills ? `Subida ${r} de ${c.reps}` : `Rápido ${r} de ${c.reps}`, type: "time", target: c.workMin, pace: hills ? null : c.workPace });
      if (r < c.reps) segs.push({ label: hills ? "Recuperación (bajada al trote)" : "Recuperación (trote suave)", type: "time", target: c.recMin, pace: null });
    }
    segs.push({ label: "Cool-down", type: "distance", target: c.coolKm, pace: day.easyPace });
    return segs;
  }

  let warmKm, coolKm;
  if ((day.km || 0) <= 5.5 && !day.calentamientoCorto) { warmKm = r1((day.km || 0) * 0.4); coolKm = r1((day.km || 0) * 0.3); }
  else { const c = calentamientoDe(day); warmKm = c.warm; coolKm = c.cool; }

  // Run/Walk o continuo de nivel principiante/fitness: todo por tiempo, igual que se describe
  // en el detalle de la sesión (caminar de calentamiento, bloques de trote/caminata, cool-down).
  if (day.paceKey === "E" && day.stageLabel) {
    segs.push({ label: "Warm-up (caminando)", type: "time", target: BEGINNER_WARMUP_MIN, pace: null });
    if (day.runWalk) {
      for (let r = 1; r <= day.stageReps; r++) {
        segs.push({ label: `Trote ${r} de ${day.stageReps}`, type: "time", target: day.stageRun, pace: day.easyPace });
        segs.push({ label: "Caminata", type: "time", target: day.stageWalk, pace: null });
      }
    } else {
      segs.push({ label: "Continuo", type: "time", target: day.stageRun, pace: day.easyPace });
    }
    segs.push({ label: "Cool-down (caminando)", type: "time", target: BEGINNER_COOLDOWN_MIN, pace: null });
    return segs;
  }
  // Run/Walk de los planes de carrera (10K/21K/42K, no principiante/fitness): bloques de trote
  // + caminata según la duración total de la sesión, más los strides finales como fases propias.
  if (day.paceKey === "E" && day.runWalk) {
    const { reps, blockMin, walkMin } = getRunWalkPlan(day);
    for (let r = 1; r <= reps; r++) {
      segs.push({ label: `Trote ${r} de ${reps}`, type: "time", target: blockMin, pace: day.easyPace });
      segs.push({ label: "Caminata", type: "time", target: walkMin, pace: null });
    }
    if (conStrides(day)) agregarStrides(segs, STRIDES_RUNWALK);
    return segs;
  }
  if (day.paceKey === "E" && day.isSpeedDay) {
    segs.push({ label: "Trote suave", type: "time", target: 11, pace: day.easyPace });
    for (let r = 1; r <= 5; r++) {
      segs.push({ label: `Velocidad suave ${r} de 5`, type: "time", target: 20 / 60, pace: null });
      segs.push({ label: "Caminata", type: "time", target: 1, pace: null });
    }
    segs.push({ label: "Cool-down (caminando)", type: "time", target: 5, pace: null });
    return segs;
  }
  if (day.paceKey === "E") {
    segs.push({ label: "Suave", type: "distance", target: day.km, pace: day.easyPace });
    if (conStrides(day)) agregarStrides(segs, STRIDES_EASY);
    if (conProgresiones(day)) {
      for (let r = 1; r <= PROGRESIONES_N; r++) {
        segs.push({ label: `Progresión ${r} de ${PROGRESIONES_N}`, type: "distance", target: 0.1, pace: null });
        if (r < PROGRESIONES_N) segs.push({ label: "Trote", type: "time", target: 1, pace: null });
      }
    }
    return segs;
  }
  if (day.paceKey === "long") {
    if (day.longProgressive) {
      const fastSeg = day.longFastKm ?? 5;
      const bodyKm = r1(Math.max(0.5, day.km - warmKm - coolKm - fastSeg));
      segs.push({ label: "Warm-up", type: "distance", target: warmKm, pace: day.easyPace });
      segs.push({ label: "Bloque principal", type: "distance", target: bodyKm, pace: day.easyPace });
      segs.push({ label: "Cierre fuerte", type: "distance", target: fastSeg, pace: day.marathonPace });
      segs.push({ label: "Cool-down", type: "distance", target: coolKm, pace: day.easyPace });
      return segs;
    }
    segs.push({ label: "Fondo", type: "distance", target: day.km, pace: day.easyPace });
    return segs;
  }

  if (day.paceKey === "M" || day.paceKey === "race") {
    segs.push({ label: "Warm-up", type: "distance", target: warmKm, pace: day.easyPace });
    const mainKm = r1(Math.max(0.5, day.km - warmKm - coolKm));
    segs.push({ label: "Bloque principal", type: "distance", target: mainKm, pace: day.paceKey === "M" ? day.marathonPace : day.targetPace });
    segs.push({ label: "Cool-down", type: "distance", target: coolKm, pace: day.easyPace });
    return segs;
  }

  // Umbral continuo: el warm-up/cool-down son por distancia, pero el bloque principal se define
  // por minutos (igual que en el detalle de la sesión).
  if (day.paceKey === "T") {
    const main = r1(Math.max(0.5, day.km - warmKm - coolKm));
    let block = day.distOverride;
    if (!block) {
      let bestDiff = Infinity;
      for (const t of T_DURATIONS) {
        const adjPaceTmp = getTPaceForDuration(day.hmPace, day.marathonPace, t);
        const impliedKm = adjPaceTmp ? t / adjPaceTmp : t / 3.5;
        const diff = Math.abs(impliedKm - main);
        if (diff < bestDiff) { bestDiff = diff; block = t; }
      }
    }
    const adjPace = day.paceOverride || getTPaceForDuration(day.hmPace, day.marathonPace, block);
    segs.push({ label: "Warm-up", type: "distance", target: warmKm, pace: day.easyPace });
    segs.push({ label: "Bloque principal", type: "time", target: block, pace: adjPace });
    segs.push({ label: "Cool-down", type: "distance", target: coolKm, pace: day.easyPace });
    return segs;
  }

  // Umbral fraccionado: warm-up/cool-down por distancia, los bloques de trabajo y su
  // recuperación se definen en minutos.
  if (day.paceKey === "brokenT") {
    const workMin = day.distOverride || 8;
    const refMin = day.brokenTRefMin || 25;
    const recoveryMin = day.recoveryOverride ?? 3;
    const reps = day.repsOverride || 3;
    const pace = day.paceOverride || getTPaceForDuration(day.hmPace, day.marathonPace, refMin);
    segs.push({ label: "Warm-up", type: "distance", target: calentamientoDe(day).warm, pace: day.easyPace });
    for (let r = 1; r <= reps; r++) {
      segs.push({ label: `Bloque ${r} de ${reps}`, type: "time", target: workMin, pace });
      if (r < reps) segs.push({ label: "Recuperación", type: "time", target: recoveryMin, pace: null });
    }
    segs.push({ label: "Cool-down", type: "distance", target: calentamientoDe(day).cool, pace: day.easyPace });
    return segs;
  }

  if (day.paceKey === "I" || day.paceKey === "R") {
    const isI = day.paceKey === "I";
    const d = day.distOverride || (isI ? 1 : 0.2);
    const reps = day.repsOverride || (isI ? 6 : 8);
    const pace = day.paceOverride || (isI ? getIPace(day.hmPace, day.marathonPace, d) : getRPace(day.targetPace, day.hmPace, d));
    const recoveryMin = day.recoveryOverride ?? (isI ? getIRecoveryMin(d, ep) : (R_RECOVERY_MIN[d] ?? 2));
    segs.push({ label: "Warm-up", type: "distance", target: warmKm, pace: day.easyPace });
    for (let r = 1; r <= reps; r++) {
      segs.push({ label: `Repetición ${r} de ${reps}`, type: "distance", target: d, pace });
      // La recuperación va en MINUTOS, que es como la define la metodología (200m=1', 400m=2',
      // 600m=3', 800m=4'). Antes se convertía a kilómetros y el redondeo a medios kilómetros
      // la dejaba en 0 km: el alumno que hacía 8 x 200m en vivo veía un paso de recuperación
      // vacío. El umbral fraccionado, acá arriba, ya lo hacía bien en minutos.
      if (r < reps) segs.push({ label: "Recuperación", type: "time", target: recoveryMin, pace: day.easyPace });
    }
    segs.push({ label: "Cool-down", type: "distance", target: coolKm, pace: day.easyPace });
    return segs;
  }

  // Tipos menos comunes (custom, combo1k500, broken): un solo bloque continuo,
  // menos preciso pero funcional.
  segs.push({ label: day.type || "Entrenamiento", type: "distance", target: day.km || 5, pace: day.easyPace });
  return segs;
}
export function getRepresentativePace(day) {
  if (!day.paceKey) return null;
  if (day.paceOverride) return day.paceOverride;
  const easyP = day.easyPace ?? null;
  const km = day.km;
  if (day.paceKey === "M" || day.paceKey === "race") return day.targetPace;
  if (day.paceKey === "fartlek") return calidadSuave(day).workPace;
  if (day.paceKey === "hills") return null; // por esfuerzo, sin ritmo
  if (day.paceKey === "T") {
    let warm, cool, main;
    if (km <= 5.5) { warm = r1(km * 0.4); cool = r1(km * 0.3); main = r1(km - warm - cool); }
    else { warm = 3; cool = 2; main = r1(km - 5); }
    let block = day.distOverride;
    if (!block) {
      let bestDiff = Infinity;
      for (const t of T_DURATIONS) {
        const adjPaceTmp = getTPaceForDuration(day.hmPace, day.marathonPace, t);
        const impliedKm = adjPaceTmp ? t / adjPaceTmp : t / 3.5;
        const diff = Math.abs(impliedKm - main);
        if (diff < bestDiff) { bestDiff = diff; block = t; }
      }
    }
    return getTPaceForDuration(day.hmPace, day.marathonPace, block);
  }
  if (day.paceKey === "brokenT") {
    const refMin = day.brokenTRefMin || 25;
    return getTPaceForDuration(day.hmPace, day.marathonPace, refMin);
  }
  if (day.paceKey === "I") {
    let warm, cool, main;
    if (km <= 5.5) { warm = r1(km * 0.4); cool = r1(km * 0.3); main = r1(km - warm - cool); }
    else { warm = 3; cool = 2; main = r1(km - 5); }
    const distances = I_DIST_BY_PHASE[day.phase] || [1];
    const recoveryKmFn = (dd) => r1(getIRecoveryMin(dd, easyP) / (easyP || 4.8));
    const d = day.distOverride || pickRepScheme(main, distances, 2, 8, recoveryKmFn).d;
    return getIPace(day.hmPace, day.marathonPace, d);
  }
  if (day.paceKey === "R") {
    let warm, cool, main;
    if (km <= 5.5) { warm = r1(km * 0.4); cool = r1(km * 0.3); main = r1(km - warm - cool); }
    else { warm = 3; cool = 2; main = r1(km - 5); }
    const distances = R_DIST_BY_PHASE[day.phase] || [0.2, 0.4];
    const recoveryKmFn = (dd) => r1((R_RECOVERY_MIN[dd] ?? 2) / (easyP || 4.5));
    const d = day.distOverride || pickRepScheme(main, distances, 6, 12, recoveryKmFn).d;
    return getRPace(day.targetPace, day.hmPace, d);
  }
  if (day.paceKey === "combo1k500") return getIPace(day.hmPace, day.marathonPace, 1);
  return day.targetPace;
}
// Calentamiento y vuelta a la calma de las calidades: 3 + 2 km. En la transición de la base
// (las 4 semanas antes de Velocidad) van 2 + 1 km, para que la velocidad y el umbral entren
// completos sin pasar el tope de calidad.
export function calentamientoDe(day) {
  return day?.calentamientoCorto ? { warm: 2, cool: 1 } : { warm: 3, cool: 2 };
}
export function marcarCalentamientoCorto(plan, on) {
  return plan.map((d) => {
    if (!d || !["q1", "q2"].includes(d.slot) || !["R", "brokenT"].includes(d.paceKey)) return d;
    if (!!d.calentamientoCorto === !!on) return d;
    const { calentamientoCorto, ...resto } = d;
    const next = on ? { ...resto, calentamientoCorto: true } : resto;
    return { ...next, km: computeImpliedKm(next) };
  });
}

// Strides al final de un rodaje suave o de un run/walk. El coach los activa o desactiva por
// día (day.strides). Si no eligió nada: el run/walk los trae y el "Easy + strides" de la base
// también. Los principiantes por etapas no los llevan.
export const STRIDES_EASY = 4, STRIDES_RUNWALK = 3, PROGRESIONES_N = 4;
export function conStrides(day) {
  if (!day || day.paceKey !== "E" || day.stageLabel || day.isSpeedDay) return false;
  if (day.strides === true) return true;
  if (day.strides === false) return false;
  return !!day.runWalk || day.extra === "strides";
}
export function conProgresiones(day) {
  return !!day && day.paceKey === "E" && !day.stageLabel && !day.runWalk && day.extra === "progresiones";
}
export function stridesDe(day) { return day?.runWalk ? STRIDES_RUNWALK : STRIDES_EASY; }

export function getSessionDetail(day) {
  const easyP = day.easyPace ?? null;
  const easyStr = easyP ? ` (${formatPace(easyP)}/km)` : "";
  if (day.type === "Día de la carrera") {
    return [{ label: "Carrera", text: `¡Día de la carrera! Ritmo objetivo: ${formatPace(day.targetPace)}/km.`, color: COLORS.track }];
  }
  if (!day.paceKey) return null;
  const km = day.km;

  if (day.paceKey === "E") {
    if (day.isSpeedDay) {
      return [
        { label: "Trote suave", text: `10-12' de trote suave continuo o run/walk cómodo`, color: COLORS.easy },
        { label: "Velocidad suave", text: `4-6 x 20" rápidos (no al máximo) con 1' caminando de recuperación entre cada uno`, color: COLORS.moderate },
        { label: "Cool-down", text: `5' caminando`, color: COLORS.easy },
      ];
    }
    if (day.stageLabel) {
      if (day.runWalk) {
        return [
          { label: "Warm-up", text: `${BEGINNER_WARMUP_MIN}' caminando`, color: COLORS.easy },
          { label: "Run/Walk", text: `Trote ${day.stageRun}' + caminata ${day.stageWalk}', x${day.stageReps} repeticiones (~${day.stageTotalMin}' en total)`, color: COLORS.moderate },
          { label: "Cool-down", text: `${BEGINNER_COOLDOWN_MIN}' caminando`, color: COLORS.easy },
        ];
      }
      return [
        { label: "Warm-up", text: `${BEGINNER_WARMUP_MIN}' caminando`, color: COLORS.easy },
        { label: "Continuo", text: `Trote continuo ${day.stageRun}' (sin pausas)`, color: COLORS.moderate },
        { label: "Cool-down", text: `${BEGINNER_COOLDOWN_MIN}' caminando`, color: COLORS.easy },
      ];
    }
    if (day.runWalk) {
      const { reps, blockMin, walkMin, accumulatedMin } = getRunWalkPlan(day);
      const rw = [{ label: "Run/Walk", text: `Trote ${blockMin}' + caminata ${walkMin}', x${reps} (acumulado ~${accumulatedMin} min)${easyStr}.`, color: COLORS.moderate }];
      if (conStrides(day)) rw.push({ label: "Strides", text: `${STRIDES_RUNWALK} strides de 20" rápidos + 1' caminando entre cada uno.`, color: COLORS.hard });
      return rw;
    }
    const suave = [{ label: "Continuo suave", text: `Continuo muy suave, a ritmo conversacional${easyStr}.`, color: COLORS.easy }];
    if (conStrides(day)) suave.push({ label: "Strides", text: `Al terminar: ${STRIDES_EASY} strides de 20" rápidos (sin llegar al máximo; si te sientes bien, hasta 6), con 1' caminando entre cada uno.`, color: COLORS.hard });
    if (conProgresiones(day)) suave.push({ label: "Progresiones", text: `Al terminar: ${PROGRESIONES_N} progresiones de 100 m, de suave a rápido, volviendo al trote 1' entre cada una.`, color: COLORS.hard });
    return suave;
  }

  if (day.paceKey === "long") {
    const ov = day.longOverrides || {};
    const warm = ov.warmKm ?? Math.min(3, r1(km * 0.2));
    const cool = ov.coolKm ?? Math.min(2, r1(km * 0.15));
    const defaultClose = day.level === "avanzado1" || day.level === "avanzado2" ? 5 : 3;
    const fastSeg = day.longProgressive ? (ov.closeKm ?? Math.min(defaultClose, Math.max(1, r1(km - warm - cool - 3)))) : 0;
    const bodyAuto = day.longProgressive ? r1(km - warm - cool - fastSeg) : r1(km - warm - cool);
    const bodyKm = ov.bodyKm ?? bodyAuto;
    const warmPace = ov.warmPace ?? easyP;
    const bodyPaceVal = ov.bodyPace ?? day.targetPace;
    const closePaceVal = ov.closePace ?? day.marathonPace;
    const coolPace = ov.coolPace ?? easyP;
    const bodyPaceStr = ov.bodyPace ? ` (${formatPace(ov.bodyPace)}/km)` : (day.marathonPace ? ` (${formatPace(day.marathonPace + 0.5)}-${formatPace(day.marathonPace + 1)}/km)` : "");
    const segs = [{ label: "Warm-up", text: `${warm} km suave (${formatPace(warmPace)}/km)`, color: COLORS.easy }];
    if (day.longProgressive) {
      segs.push({ label: "Bloque principal", text: `${bodyKm} km continuo${bodyPaceStr}`, color: COLORS.moderate });
      segs.push({ label: "Cierre fuerte", text: `${fastSeg} km finales a ritmo maratón / media maratón (${formatPace(closePaceVal)}/km)`, color: COLORS.hard });
    } else {
      segs.push({ label: "Bloque principal", text: `${bodyKm} km continuo suave, homogéneo${bodyPaceStr}`, color: COLORS.moderate });
    }
    segs.push({ label: "Cool-down", text: `${cool} km suave (${formatPace(coolPace)}/km)`, color: COLORS.easy });
    return segs;
  }

  let warm, cool, main;
  if (km <= 5.5 && !day.calentamientoCorto) { warm = r1(km * 0.4); cool = r1(km * 0.3); main = r1(km - warm - cool); }
  else { ({ warm, cool } = calentamientoDe(day)); main = r1(km - warm - cool); }
  const mainPaceStr = day.targetPace ? ` (${formatPace(day.targetPace)}/km)` : "";

  const LABELS = {
    M: ["Bloque principal", `${main} km a ritmo maratón${mainPaceStr}`, COLORS.moderate],
    race: ["Bloque principal", `${main} km a ritmo objetivo${mainPaceStr}`, COLORS.moderate],
  };
  if (LABELS[day.paceKey]) {
    return [
      { label: "Warm-up", text: `${warm} km suave${easyStr}`, color: COLORS.easy },
      { label: LABELS[day.paceKey][0], text: LABELS[day.paceKey][1], color: LABELS[day.paceKey][2] },
      { label: "Cool-down", text: `${cool} km suave${easyStr}`, color: COLORS.easy },
    ];
  }
  if (day.paceKey === "T") {
    let block = day.distOverride;
    if (!block) {
      let bestDiff = Infinity;
      for (const t of T_DURATIONS) {
        const adjPaceTmp = getTPaceForDuration(day.hmPace, day.marathonPace, t);
        const impliedKm = adjPaceTmp ? t / adjPaceTmp : t / 3.5;
        const diff = Math.abs(impliedKm - main);
        if (diff < bestDiff) { bestDiff = diff; block = t; }
      }
    }
    const adjPace = day.paceOverride || getTPaceForDuration(day.hmPace, day.marathonPace, block);
    const blockKm = adjPace ? r1(block / adjPace) : main;
    return [
      { label: "Warm-up", text: `${warm} km suave${easyStr}`, color: COLORS.easy },
      { label: "Bloque principal", text: `${block} minutos continuos a ritmo umbral (~${blockKm} km) (${formatPace(adjPace)}/km)`, color: COLORS.hard },
      { label: "Cool-down", text: `${cool} km suave${easyStr}`, color: COLORS.easy },
    ];
  }
  if (day.paceKey === "I") {
    const distances = I_DIST_BY_PHASE[day.phase] || [1];
    const recoveryKmFn = (dd) => r1(getIRecoveryMin(dd, easyP) / (easyP || 4.8));
    let d, reps;
    if (day.distOverride) {
      d = day.distOverride;
      reps = day.repsOverride || pickRepScheme(main, [d], 2, 8, recoveryKmFn).reps;
    } else {
      const picked = pickRepScheme(main, distances, 2, 8, recoveryKmFn);
      d = picked.d; reps = picked.reps;
    }
    const adjPace = day.paceOverride || getIPace(day.hmPace, day.marathonPace, d);
    const recoveryMin = day.recoveryOverride ?? getIRecoveryMin(d, easyP);
    const recoveryKm = r1(recoveryMin / (easyP || 4.8));
    const recoveryLabel = day.recoveryOverride != null ? `${formatPace(recoveryMin)} min` : `500 m (${formatPace(recoveryMin)} min)`;
    return [
      { label: "Warm-up", text: `${warm} km suave${easyStr}`, color: COLORS.easy },
      { label: "Bloque principal", text: `${reps} x ${formatDist(d)} a ritmo de intervalos (${formatPace(adjPace)}/km)`, color: COLORS.hard },
      { label: "Recuperación", text: `trote de recuperación ${recoveryLabel}${easyStr} (≈${recoveryKm} km incluidos en el total)`, color: COLORS.rest },
      { label: "Cool-down", text: `${cool} km suave${easyStr}`, color: COLORS.easy },
    ];
  }
  if (day.paceKey === "R") {
    const distances = R_DIST_BY_PHASE[day.phase] || [0.2, 0.4];
    const recoveryKmFn = (dd) => r1((R_RECOVERY_MIN[dd] ?? 2) / (easyP || 4.5));
    let d, reps;
    if (day.distOverride) {
      d = day.distOverride;
      reps = day.repsOverride || pickRepScheme(main, [d], 6, 12, recoveryKmFn).reps;
    } else {
      const picked = pickRepScheme(main, distances, 6, 12, recoveryKmFn);
      d = picked.d; reps = picked.reps;
    }
    const adjPace = day.paceOverride || getRPace(day.targetPace, day.hmPace, d);
    const recoveryMin = day.recoveryOverride || R_RECOVERY_MIN[d] || 2;
    // Total de las recuperaciones (no por repetición: con 1' daba "≈0 km").
    const recoveryKm = String(Math.round((Math.max(0, reps - 1) * recoveryMin / (easyP || 4.5)) * 10) / 10).replace(".", ",");
    return [
      { label: "Warm-up", text: `${warm} km suave${easyStr}`, color: COLORS.easy },
      { label: "Bloque principal", text: `${reps} x ${formatDist(d)} a ritmo de velocidad (${formatPace(adjPace)}/km)`, color: COLORS.hard },
      { label: "Recuperación", text: `trote/caminata ${formatPace(recoveryMin)} min entre repeticiones${easyStr} (≈${recoveryKm} km en total, incluidos en la sesión)`, color: COLORS.rest },
      { label: "Cool-down", text: `${cool} km suave${easyStr}`, color: COLORS.easy },
    ];
  }
  if (day.paceKey === "broken") {
    const recoveryPace = easyP || (day.targetPace ? day.targetPace * 1.3 : 4.8);
    const recoveryPerRep = 3 / recoveryPace; // ~3 min de trote entre series largas
    const candidates = [[3, 2], [2, 3], [3, 3], [2, 4]];
    let best = candidates[0], bestDiff = Infinity;
    for (const c of candidates) {
      const est = c[0] * c[1] + c[0] * recoveryPerRep;
      const diff = Math.abs(est - main);
      if (diff < bestDiff) { bestDiff = diff; best = c; }
    }
    const recoveryKm = r1(best[0] * recoveryPerRep);
    return [
      { label: "Warm-up", text: `${warm} km suave${easyStr}`, color: COLORS.easy },
      { label: "Bloque principal", text: `${best[0]} x ${best[1]} km a ritmo umbral/objetivo${mainPaceStr}`, color: COLORS.hard },
      { label: "Recuperación", text: `trote de 3 min entre repeticiones${easyStr} (≈${recoveryKm} km incluidos en el total)`, color: COLORS.rest },
      { label: "Cool-down", text: `${cool} km suave${easyStr}`, color: COLORS.easy },
    ];
  }
  if (day.paceKey === "combo1k500") {
    const pace1k = day.paceOverride || getIPace(day.hmPace, day.marathonPace, 1);
    const pace500 = getRPace(day.targetPace, day.hmPace, 0.5);
    const recoveryKm = r1((3 * (1 + 4)) / (easyP || 5)); // 3 sets x (1' + 4') de trote de recuperación
    return [
      { label: "Warm-up", text: `3 km suave${easyStr}`, color: COLORS.easy },
      { label: "Bloque principal", text: `3 x (1 km a ritmo de intervalos (${formatPace(pace1k)}/km) + 1' recuperación + 500 m (${formatPace(pace500)}/km) + 4' trote)`, color: COLORS.hard },
      { label: "Recuperación", text: `1' después de cada 1 km + 4' de trote después de cada 500 m${easyStr} (≈${recoveryKm} km incluidos en el total)`, color: COLORS.rest },
      { label: "Cool-down", text: `2 km suave${easyStr}`, color: COLORS.easy },
    ];
  }
  if (day.paceKey === "custom") {
    const warmKm = day.customWarmKm ?? 2;
    const coolKm = day.customCoolKm ?? 2;
    const blocks = getCustomBlocks(day);
    const segs = [{ label: "Warm-up", text: `${warmKm} km suave${easyStr}`, color: COLORS.easy }];
    blocks.forEach((b, i) => {
      const reps = b.reps ?? 6;
      const distKm = b.distKm ?? 0.4;
      const recoveryMin = b.recoveryMin ?? 2;
      const paceStr = b.paceStr || "según indique el coach";
      const labelPrefix = blocks.length > 1 ? `Bloque ${i + 1}` : "Bloque principal";
      segs.push({ label: labelPrefix, text: `${reps} x ${formatDist(distKm)} a ${paceStr}${paceStr.includes("/km") ? "" : "/km"}`, color: COLORS.hard });
      segs.push({ label: "Recuperación", text: `${recoveryMin} min de trote entre repeticiones${easyStr}`, color: COLORS.rest });
    });
    segs.push({ label: "Cool-down", text: `${coolKm} km suave${easyStr}`, color: COLORS.easy });
    if (day.customNote) segs.push({ label: "Nota", text: day.customNote, color: COLORS.moderate });
    return segs;
  }
  if (day.paceKey === "fartlek") {
    const c = calidadSuave(day);
    return [
      { label: "Warm-up", text: `${c.warmKm} km suave${easyStr}`, color: COLORS.easy },
      { label: "Fartlek", text: `${c.reps} x ${c.workMin}' rápido (por sensaciones, cerca de ${formatPace(c.workPace)}/km) + ${c.recMin}' trote suave`, color: COLORS.hard },
      { label: "Cool-down", text: `${c.coolKm} km suave${easyStr}`, color: COLORS.easy },
    ];
  }
  if (day.paceKey === "hills") {
    const c = calidadSuave(day);
    return [
      { label: "Warm-up", text: `${c.warmKm} km suave${easyStr}, terminando al pie de la cuesta`, color: COLORS.easy },
      { label: "Cuestas", text: `${c.reps} x ${fmtSeg(c.workSec)} de subida fuerte pero controlada (esfuerzo 8 de 10), braceo activo y pasos cortos`, color: COLORS.hard },
      { label: "Recuperación", text: `Bajada al trote suave (~${c.recMin}') entre cada subida`, color: COLORS.rest },
      { label: "Cool-down", text: `${c.coolKm} km suave${easyStr}`, color: COLORS.easy },
    ];
  }
  if (day.paceKey === "brokenT") {
    const workMin = day.distOverride || 8;
    const refMin = day.brokenTRefMin || 25;
    const recoveryMin = day.recoveryOverride ?? 3;
    const pace = day.paceOverride || getTPaceForDuration(day.hmPace, day.marathonPace, refMin);
    const reps = day.repsOverride || 3;
    const { warm, cool } = calentamientoDe(day);
    const rec = recoveryMin % 1 ? `${Math.floor(recoveryMin)}'${String(Math.round((recoveryMin % 1) * 60)).padStart(2, "0")}"` : `${recoveryMin}'`;
    return [
      { label: "Warm-up", text: `${warm} km suave${easyStr}`, color: COLORS.easy },
      { label: "Bloque principal", text: `${reps} x ${workMin}' al ritmo del umbral de ${refMin}' (${formatPace(pace)}/km)`, color: COLORS.hard },
      { label: "Recuperación", text: `${rec} trote entre pasadas${easyStr}`, color: COLORS.rest },
      { label: "Cool-down", text: `${cool} km suave${easyStr}`, color: COLORS.easy },
    ];
  }
  return null;
}

/* ---------------------------------------------------------
   BARRAS DE SESIÓN (visualización tipo TrainingPeaks: calentamiento,
   repeticiones + descansos, enfriamiento — cada bloque como una barra)
--------------------------------------------------------- */
export const WALK_PACE = 11; // min/km aprox., referencia visual para tramos caminando
export const STRIDE_PACE = 3.0; // min/km aprox., referencia visual para tramos rapidos/strides

// Recalcula el km total del día a partir de la distancia/repeticiones/descanso configurados
// (auto o manual), para que el total siempre refleje la sesión real, no un valor desfasado.
export function getCustomBlocks(day) {
  if (Array.isArray(day.customBlocks) && day.customBlocks.length) return day.customBlocks;
  return [{
    reps: day.customReps ?? 6,
    distKm: day.customWorkKm ?? 0.4,
    paceStr: day.customPaceStr || "",
    recoveryMin: day.customRecoveryMin ?? 2,
  }];
}
export function computeImpliedKm(day) {
  if (!day.paceKey || day.paceKey === "E" || day.paceKey === "long") return day.km;
  if (esCalidadSuave(day.paceKey)) return calidadSuaveKm(day);
  const easyP = day.easyPace ?? 5;
  const { warm, cool } = calentamientoDe(day);
  if (day.paceKey === "custom") {
    const warmKm = day.customWarmKm ?? 2;
    const coolKm = day.customCoolKm ?? 2;
    const blocks = getCustomBlocks(day);
    let mainKm = 0;
    blocks.forEach((b) => {
      const reps = b.reps ?? 6;
      const distKm = b.distKm ?? 0.4;
      const recoveryMin = b.recoveryMin ?? 2;
      const recoveryKm = easyP ? recoveryMin / easyP : recoveryMin / 5;
      mainKm += reps * (distKm + recoveryKm);
    });
    return r1(warmKm + mainKm + coolKm);
  }
  if (day.paceKey === "brokenT") {
    const workMin = day.distOverride || 8;
    const refMin = day.brokenTRefMin || 25;
    const recoveryMin = day.recoveryOverride ?? 3;
    const pace = day.paceOverride || getTPaceForDuration(day.hmPace, day.marathonPace, refMin) || 5;
    const reps = day.repsOverride || 3;
    const mainKm = pace ? (reps * workMin) / pace : 6;
    const recoveryKm = easyP ? ((reps - 1) * recoveryMin) / easyP : 0;
    return r1(warm + mainKm + recoveryKm + cool);
  }
  if (day.paceKey === "T") {
    const block = day.distOverride || 30;
    const pace = day.paceOverride || getTPaceForDuration(day.hmPace, day.marathonPace, block) || day.targetPace || 5;
    const blockKm = pace ? block / pace : 6;
    return r1(warm + blockKm + cool);
  }
  if (day.paceKey === "I" || day.paceKey === "R") {
    const isI = day.paceKey === "I";
    const distances = day.distOverride ? [day.distOverride] : (isI ? (I_DIST_BY_PHASE[day.phase] || [1]) : (R_DIST_BY_PHASE[day.phase] || [0.2, 0.4]));
    const minReps = isI ? 2 : 6, maxReps = isI ? 8 : 12;
    const recoveryKmFn = isI
      ? (dd) => r1(getIRecoveryMin(dd, easyP) / (easyP || 4.8))
      : (dd) => r1((R_RECOVERY_MIN[dd] ?? 2) / (easyP || 4.5));
    let d, reps;
    if (day.distOverride && day.repsOverride) {
      d = day.distOverride; reps = day.repsOverride;
    } else {
      let main;
      if (day.km <= 5.5) { const warmA = r1(day.km * 0.4), coolA = r1(day.km * 0.3); main = r1(day.km - warmA - coolA); }
      else { main = r1(day.km - 5); }
      const picked = pickRepScheme(main, distances, minReps, maxReps, recoveryKmFn);
      d = day.distOverride || picked.d;
      reps = day.repsOverride || picked.reps;
    }
    const recoveryMin = day.recoveryOverride ?? (isI ? getIRecoveryMin(d, easyP) : (R_RECOVERY_MIN[d] ?? 2));
    const recoveryKm = easyP ? recoveryMin / easyP : recoveryMin / 5;
    const mainKm = reps * (d + recoveryKm);
    return r1(warm + mainKm + cool);
  }
  if (day.paceKey === "combo1k500") {
    const recoveryKm = (3 * (1 + 4)) / (easyP || 5);
    return r1(3 + 3 * (1 + 0.5) + recoveryKm + 2);
  }
  return day.km;
}
export function impliedQKm(type, dist, reps, paces) {
  if (!type || type === "E" || type === "broken" || type === "M" || type === "race") return null;
  if (esCalidadSuave(type)) return calidadSuaveKm({ paceKey: type, distOverride: dist, repsOverride: reps, easyPace: paces?.E, targetPace: paces?.T, hmPace: paces?.HM, marathonPace: paces?.M });
  const easyP = paces?.E ?? 5;
  const warm = 3, cool = 2;
  if (type === "combo1k500") {
    const recoveryKm = (3 * (1 + 4)) / (easyP || 5);
    return r1(3 + 3 * (1 + 0.5) + recoveryKm + 2);
  }
  if (type === "T") {
    const block = dist || 30;
    const pace = getTPaceForDuration(paces?.HM, paces?.M, block) || 5;
    return r1(warm + block / pace + cool);
  }
  if (type === "I" || type === "R") {
    const isI = type === "I";
    const d = dist || (isI ? 1 : 0.2);
    const rp = reps || (isI ? 6 : 8);
    const pace = isI ? getIPace(paces?.HM, paces?.M, d) : getRPace(paces?.R, paces?.HM, d);
    const recMin = isI ? getIRecoveryMin(d, easyP) : (R_RECOVERY_MIN[d] ?? 2);
    const recKm = pace ? recMin / easyP : recMin / 5;
    return r1(warm + rp * (d + recKm) + cool);
  }
  return null;
}
function barrasDeStrides(bars, n, caminando) {
  bars.push({ durationMin: 1, pace: WALK_PACE, colorKind: "recovery", label: "Caminata" });
  for (let i = 0; i < n; i++) {
    bars.push({ durationMin: 0.33, pace: STRIDE_PACE, colorKind: "hard", label: "Stride" });
    if (i < n - 1) bars.push({ durationMin: 1, pace: caminando ? WALK_PACE : null, colorKind: "recovery", label: "Caminata" });
  }
}
export function getSessionBars(day) {
  if (!day.paceKey || day.type === "Día de la carrera") {
    if (day.type === "Día de la carrera") return [{ durationMin: 60, pace: day.targetPace || 5, colorKind: "hard", label: "Carrera" }];
    return null;
  }
  const km = day.km;
  const easyP = day.easyPace ?? 5;
  if (esCalidadSuave(day.paceKey)) {
    const c = calidadSuave(day);
    const hills = day.paceKey === "hills";
    const bars = [{ durationMin: c.warmKm * easyP, pace: easyP, colorKind: "easy", label: "Warm-up" }];
    for (let i = 0; i < c.reps; i++) {
      bars.push({ durationMin: c.workMin, pace: hills ? easyP * 0.8 : c.workPace, colorKind: "hard", label: hills ? "Subida" : "Rápido" });
      if (i < c.reps - 1) bars.push({ durationMin: c.recMin, pace: c.recPace, colorKind: "recovery", label: "Recuperación" });
    }
    bars.push({ durationMin: c.coolKm * easyP, pace: easyP, colorKind: "easy", label: "Cool-down" });
    return bars;
  }

  if (day.paceKey === "E") {
    if (day.isSpeedDay) {
      const bars = [{ durationMin: 11, pace: easyP, colorKind: "easy", label: "Trote suave" }];
      for (let i = 0; i < 5; i++) {
        bars.push({ durationMin: 0.33, pace: STRIDE_PACE, colorKind: "hard", label: "Rápido" });
        bars.push({ durationMin: 1, pace: WALK_PACE, colorKind: "recovery", label: "Caminata" });
      }
      bars.push({ durationMin: 5, pace: easyP, colorKind: "easy", label: "Cool-down" });
      return bars;
    }
    if (day.stageLabel) {
      const bars = [{ durationMin: BEGINNER_WARMUP_MIN, pace: WALK_PACE, colorKind: "easy", label: "Warm-up" }];
      if (day.runWalk) {
        for (let i = 0; i < day.stageReps; i++) {
          bars.push({ durationMin: day.stageRun, pace: easyP, colorKind: "moderate", label: "Trote" });
          if (i < day.stageReps - 1) bars.push({ durationMin: day.stageWalk, pace: WALK_PACE, colorKind: "recovery", label: "Camina" });
        }
      } else {
        bars.push({ durationMin: day.stageRun, pace: easyP, colorKind: "moderate", label: "Continuo" });
      }
      bars.push({ durationMin: BEGINNER_COOLDOWN_MIN, pace: WALK_PACE, colorKind: "easy", label: "Cool-down" });
      return bars;
    }
    if (day.runWalk) {
      const { reps, blockMin, walkMin } = getRunWalkPlan(day);
      const bars = [];
      for (let i = 0; i < reps; i++) {
        bars.push({ durationMin: blockMin, pace: day.targetPace || easyP, colorKind: "moderate", label: "Trote" });
        bars.push({ durationMin: walkMin, pace: WALK_PACE, colorKind: "recovery", label: "Camina" });
      }
      if (conStrides(day)) barrasDeStrides(bars, STRIDES_RUNWALK, true);
      return bars;
    }
    const bars = [{ durationMin: day.targetPace ? Math.round(km * day.targetPace) : Math.round(km * 6), pace: day.targetPace || easyP, colorKind: "easy", label: "Continuo suave" }];
    if (conStrides(day)) barrasDeStrides(bars, STRIDES_EASY, true);
    if (conProgresiones(day)) {
      for (let i = 0; i < PROGRESIONES_N; i++) {
        bars.push({ durationMin: 0.4, pace: STRIDE_PACE * 1.15, colorKind: "hard", label: "Progresión" });
        // El trote entre progresiones se dibuja más bajo que el rodaje, para que el rodaje
        // conserve su altura (el gráfico escala por el ritmo más lento).
        if (i < PROGRESIONES_N - 1) bars.push({ durationMin: 1, pace: easyP * 1.4, colorKind: "recovery", label: "Trote" });
      }
    }
    return bars;
  }

  if (!day.targetPace && !day.marathonPace) return null;
  const warm = day.calentamientoCorto ? 2 : (Math.min(3, r1(km * 0.2)) || 2);
  const cool = day.calentamientoCorto ? 1 : (Math.min(2, r1(km * 0.15)) || 1.5);
  const warmMin = Math.round(warm * easyP);
  const coolMin = Math.round(cool * easyP);

  if (day.paceKey === "long") {
    const defaultClose = day.level === "avanzado1" || day.level === "avanzado2" ? 5 : 3;
    const fastSeg = day.longProgressive ? Math.min(defaultClose, Math.max(1, r1(km - warm - cool - 3))) : 0;
    const bodyKm = day.longProgressive ? r1(km - warm - cool - fastSeg) : r1(km - warm - cool);
    const bodyPace = day.targetPace || easyP;
    const bodyMin = Math.round(bodyKm * bodyPace);
    const bars = [
      { durationMin: warmMin, pace: easyP, colorKind: "easy", label: "Warm-up" },
      { durationMin: bodyMin, pace: bodyPace, colorKind: "moderate", label: "Bloque principal" },
    ];
    if (day.longProgressive) {
      const closePace = day.marathonPace || day.targetPace;
      bars.push({ durationMin: Math.round(fastSeg * closePace), pace: closePace, colorKind: "hard", label: "Cierre fuerte" });
    }
    bars.push({ durationMin: coolMin, pace: easyP, colorKind: "easy", label: "Cool-down" });
    return bars;
  }

  const main = km <= 5.5 ? r1(km - warm - cool) : r1(km - 5);
  if (day.paceKey === "M" || day.paceKey === "race") {
    return [
      { durationMin: warmMin, pace: easyP, colorKind: "easy", label: "Warm-up" },
      { durationMin: Math.round(main * day.targetPace), pace: day.targetPace, colorKind: "moderate", label: "Bloque principal" },
      { durationMin: coolMin, pace: easyP, colorKind: "easy", label: "Cool-down" },
    ];
  }
  if (day.paceKey === "T") {
    let block = day.distOverride;
    let blockPace = null;
    if (!block) {
      let bestDiff = Infinity;
      for (const t of T_DURATIONS) {
        const p = getTPaceForDuration(day.hmPace, day.marathonPace, t);
        const diff = Math.abs((p ? t / p : t / 3.5) - main);
        if (diff < bestDiff) { bestDiff = diff; block = t; blockPace = p; }
      }
    } else {
      blockPace = getTPaceForDuration(day.hmPace, day.marathonPace, block);
    }
    return [
      { durationMin: warmMin, pace: easyP, colorKind: "easy", label: "Warm-up" },
      { durationMin: block, pace: blockPace || day.targetPace, colorKind: "hard", label: "Umbral" },
      { durationMin: coolMin, pace: easyP, colorKind: "easy", label: "Cool-down" },
    ];
  }
  if (day.paceKey === "I" || day.paceKey === "R" || day.paceKey === "broken") {
    const bars = [{ durationMin: warmMin, pace: easyP, colorKind: "easy", label: "Warm-up" }];
    if (day.paceKey === "broken") {
      const recoveryPace = easyP;
      const recoveryPerRep = 3 / recoveryPace;
      const candidates = [[3, 2], [2, 3], [3, 3], [2, 4]];
      let best = candidates[0], bestDiff = Infinity;
      for (const c of candidates) {
        const est = c[0] * c[1] + c[0] * recoveryPerRep;
        if (Math.abs(est - main) < bestDiff) { bestDiff = Math.abs(est - main); best = c; }
      }
      const workPace = day.marathonPace ? day.marathonPace * 0.95 : day.targetPace;
      for (let i = 0; i < best[0]; i++) {
        bars.push({ durationMin: Math.round(best[1] * workPace), pace: workPace, colorKind: "hard", label: "Bloque principal" });
        if (i < best[0] - 1) bars.push({ durationMin: Math.round(recoveryPerRep), pace: recoveryPace, colorKind: "recovery", label: "Recuperación" });
      }
    } else {
      const isI = day.paceKey === "I";
      const distances = (isI ? I_DIST_BY_PHASE[day.phase] : R_DIST_BY_PHASE[day.phase]) || (isI ? [1] : [0.2, 0.4]);
      const recoveryKmFn = isI
        ? (dd) => r1(getIRecoveryMin(dd, easyP) / easyP)
        : (dd) => r1((R_RECOVERY_MIN[dd] ?? 2) / easyP);
      const picked = day.distOverride && day.repsOverride
        ? { d: day.distOverride, reps: day.repsOverride }
        : pickRepScheme(main, day.distOverride ? [day.distOverride] : distances, isI ? 2 : 6, isI ? 8 : 12, recoveryKmFn);
      const adjPace = isI ? getIPace(day.hmPace, day.marathonPace, picked.d) : getRPace(day.targetPace, day.hmPace, picked.d);
      const recMin = isI ? getIRecoveryMin(picked.d, easyP) : (R_RECOVERY_MIN[picked.d] ?? 2);
      for (let i = 0; i < picked.reps; i++) {
        bars.push({ durationMin: Math.max(0.3, Math.round(picked.d * adjPace * 10) / 10), pace: adjPace, colorKind: "hard", label: "Bloque principal" });
        if (i < picked.reps - 1) bars.push({ durationMin: recMin, pace: easyP, colorKind: "recovery", label: "Recuperación" });
      }
    }
    bars.push({ durationMin: coolMin, pace: easyP, colorKind: "easy", label: "Cool-down" });
    return bars;
  }
  if (day.paceKey === "combo1k500") {
    const pace1k = day.paceOverride || getIPace(day.hmPace, day.marathonPace, 1);
    const pace500 = getRPace(day.targetPace, day.hmPace, 0.5);
    const bars = [{ durationMin: 3 * easyP, pace: easyP, colorKind: "easy", label: "Warm-up" }];
    for (let i = 0; i < 3; i++) {
      bars.push({ durationMin: 1 * pace1k, pace: pace1k, colorKind: "hard", label: "1 km" });
      bars.push({ durationMin: 1, pace: easyP, colorKind: "recovery", label: "Recuperación" });
      bars.push({ durationMin: 0.5 * pace500, pace: pace500, colorKind: "hard", label: "500 m" });
      bars.push({ durationMin: 4, pace: easyP, colorKind: "recovery", label: "Trote" });
    }
    bars.push({ durationMin: 2 * easyP, pace: easyP, colorKind: "easy", label: "Cool-down" });
    return bars;
  }
  if (day.paceKey === "custom") {
    const warmKm = day.customWarmKm ?? 2;
    const coolKm = day.customCoolKm ?? 2;
    const blocks = getCustomBlocks(day);
    const bars = [{ durationMin: warmKm * easyP, pace: easyP, colorKind: "easy", label: "Warm-up" }];
    blocks.forEach((b) => {
      const reps = b.reps ?? 6;
      const distKm = b.distKm ?? 0.4;
      const recoveryMin = b.recoveryMin ?? 2;
      const workPace = parsePaceToDecimal(b.paceStr) || day.targetPace || easyP;
      for (let i = 0; i < reps; i++) {
        bars.push({ durationMin: Math.max(0.3, distKm * workPace), pace: workPace, colorKind: "hard", label: "Bloque principal" });
        bars.push({ durationMin: recoveryMin, pace: easyP, colorKind: "recovery", label: "Recuperación" });
      }
    });
    bars.push({ durationMin: coolKm * easyP, pace: easyP, colorKind: "easy", label: "Cool-down" });
    return bars;
  }
  if (day.paceKey === "brokenT") {
    const workMin = day.distOverride || 8;
    const refMin = day.brokenTRefMin || 25;
    const recoveryMin = day.recoveryOverride ?? 3;
    const pace = day.paceOverride || getTPaceForDuration(day.hmPace, day.marathonPace, refMin) || easyP;
    const reps = day.repsOverride || 3;
    const { warm, cool } = calentamientoDe(day);
    const bars = [{ durationMin: warm * easyP, pace: easyP, colorKind: "easy", label: "Warm-up" }];
    for (let i = 0; i < reps; i++) {
      bars.push({ durationMin: workMin, pace, colorKind: "hard", label: `${workMin}'` });
      if (i < reps - 1) bars.push({ durationMin: recoveryMin, pace: easyP, colorKind: "recovery", label: "Recuperación" });
    }
    bars.push({ durationMin: cool * easyP, pace: easyP, colorKind: "easy", label: "Cool-down" });
    return bars;
  }
  return null;
}

export const COLOR_KIND_FILL = { easy: COLORS.easy, recovery: COLORS.rest, moderate: COLORS.moderate, hard: COLORS.hard };
export const COLOR_KIND_LABEL = { easy: "Warm-up / Cool-down", recovery: "Recuperación", moderate: "Ritmo sostenido", hard: "Esfuerzo fuerte" };

export function emptyLog() {
  return Array(7).fill(null).map(() => ({ completed: false, actualKm: "", actualPaceStr: "", rpe: "", note: "" }));
}
export function computeAdherence(planRaw, logRaw) {
  // Tolerante con semanas incompletas: el historial puede contener semanas sin plan ni
  // registro (por ejemplo, las marcadas como "sin actividad"), y recorrerlas sin esta
  // protección tumbaba la pantalla entera del alumno.
  const plan = Array.isArray(planRaw) ? planRaw : [];
  const log = Array.isArray(logRaw) ? logRaw : [];
  let total = 0, completed = 0, rpeSum = 0, rpeCount = 0, pctSum = 0;
  plan.forEach((d, i) => {
    if (!d || !d.paceKey) return;
    total++;
    const l = log[i];
    let dayPct = 0;
    if (l && l.completed) {
      completed++;
      if (l.actualKm !== "" && l.actualKm !== null && l.actualKm !== undefined && d.km > 0) {
        dayPct = Math.min(100, (Number(l.actualKm) / d.km) * 100);
      } else {
        dayPct = 100;
      }
      if (l.rpe !== "" && l.rpe !== null && l.rpe !== undefined) { rpeSum += Number(l.rpe); rpeCount++; }
    }
    pctSum += dayPct;
  });
  return { adherencePct: total ? pctSum / total / 100 : 1, avgRpe: rpeCount ? rpeSum / rpeCount : null, completed, total };
}
// Promedio histórico de adherencia de un alumno, considerando todas las semanas ya
// cerradas o enviadas (no solo la última) — se recalcula cada vez que cierra una más.
// Resumen de cumplimiento reciente de un alumno, para la lista del coach.
// Devuelve DOS datos separados, porque miden cosas distintas:
//   - sesiones: cuántas de las sesiones propuestas efectivamente hizo
//   - volumen: qué proporción de los kilómetros planificados corrió (solo cuenta los días
//     donde registró km reales; si no los anotó, ese día no distorsiona el promedio)
// Se limita a las últimas semanas cerradas para reflejar el momento actual: una mala racha
// de hace meses no debe seguir castigando el número para siempre.
export const ADHERENCE_RECENT_WEEKS = 4;
export function computeRecentCompliance(student, weeksBack = ADHERENCE_RECENT_WEEKS) {
  const closed = Object.entries(student.weeks || {})
    .map(([n, w]) => ({ n: Number(n), w }))
    .filter((x) => x.w && (x.w.submitted || x.w.studentSubmitted))
    .sort((a, b) => b.n - a.n)
    .slice(0, weeksBack);
  if (!closed.length) return null;

  let sessionsDone = 0, sessionsTotal = 0;
  let kmDone = 0, kmPlanned = 0;
  for (const { w } of closed) {
    if (!Array.isArray(w.plan) || !Array.isArray(w.log)) continue;
    w.plan.forEach((d, i) => {
      if (!d.paceKey) return;
      sessionsTotal++;
      const l = w.log[i];
      if (!l?.completed) return;
      sessionsDone++;
      const hasKm = l.actualKm !== "" && l.actualKm !== null && l.actualKm !== undefined && !isNaN(Number(l.actualKm));
      if (hasKm && d.km > 0) { kmDone += Number(l.actualKm); kmPlanned += d.km; }
    });
  }
  if (!sessionsTotal) return null;
  return {
    weeks: closed.length,
    sessionsDone, sessionsTotal,
    sessionsPct: sessionsDone / sessionsTotal,
    // null cuando el alumno no registró kilómetros en ninguna sesión: es más honesto
    // mostrar "sin datos de volumen" que inventar un 100%.
    volumePct: kmPlanned > 0 ? kmDone / kmPlanned : null,
  };
}
export function computeHistoricalAdherence(student) {
  // Solo cuentan las semanas que el propio alumno envió — el coach cerrando una semana
  // directamente (por ejemplo, preparando por adelantado) no debe afectar este promedio.
  const values = Object.values(student.weeks)
    .filter((w) => w.studentSubmitted)
    .map((w) => w.adherencePct)
    .filter((v) => v != null);
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}
export function adaptWeeklyKm(baseKm, adherencePct, avgRpe) {
  let factor = 1;
  const parts = [];
  if (adherencePct < 0.7) {
    factor = 0.85;
    parts.push(`Adherencia baja (${Math.round(adherencePct * 100)}%): se reduce el volumen 15%.`);
  } else if (adherencePct >= 0.9) {
    if (avgRpe !== null && avgRpe <= 7) {
      factor = 1.1;
      parts.push(`Adherencia alta (${Math.round(adherencePct * 100)}%) con esfuerzo controlado: se incrementa el volumen 10%.`);
    } else {
      parts.push(`Adherencia alta (${Math.round(adherencePct * 100)}%) pero con esfuerzo elevado: se mantiene el volumen.`);
    }
  } else {
    parts.push(`Adherencia adecuada (${Math.round(adherencePct * 100)}%): se mantiene el volumen.`);
  }
  if (avgRpe !== null && avgRpe >= 8.5) {
    factor = Math.min(factor, 0.9);
    parts.push(`Esfuerzo percibido muy alto (RPE ${avgRpe.toFixed(1)}): se prioriza recuperación.`);
  }
  return { newKm: Math.round(baseKm * factor * 2) / 2, note: parts.join(" ") };
}

/* ---------------------------------------------------------
   CONSTRUCCIÓN DEL PLAN: la calidad y el fondo van primero (kms fijos),
   los días suaves absorben el resto para completar el total semanal.
--------------------------------------------------------- */
export function buildWeekPlanFitness(weeklyKm, level) {
  const template = getDayLayoutTemplate("fitness", "fitness", level);
  return template.map((slotDef, i) => ({
    day: DAYS[i], type: slotDef.type, paceKey: slotDef.pace, slot: slotDef.slot,
    km: slotDef.pct ? Math.round(weeklyKm * slotDef.pct * 2) / 2 : 0,
    targetPace: null, runWalk: false,
  }));
}

// Título por defecto de una sesión según su tipo de ritmo (queda editable después).
export function getDefaultTitle(paceKey, isMondayRecovery, runWalk) {
  if (!paceKey) return "Descanso";
  if (paceKey === "E") {
    if (runWalk) return "Run/Walk";
    if (isMondayRecovery) return "Recuperación";
    return "Easy";
  }
  if (paceKey === "M") return "Maratón (M)";
  if (paceKey === "R") return "Series (R)";
  if (paceKey === "I") return "Intervalos (I)";
  if (paceKey === "T") return "Umbral (T)";
  if (paceKey === "brokenT") return "Umbral fraccionado";
  if (paceKey === "race") return "Ritmo objetivo";
  if (paceKey === "broken") return "Pre-carga (series largas)";
  if (paceKey === "combo1k500") return "Intervalos 1k + 500";
  if (paceKey === "custom") return "Estructurado";
  if (paceKey === "fartlek") return "Fartlek";
  if (paceKey === "hills") return "Cuestas";
  return null;
}
export function buildRacePlan(goalId, phase, level, weeklyKm, longRunKm, q1PaceKey, q2PaceKey, paces, weeksToRace, taperWeeksParam, opts) {
  const v2 = opts && Number(opts.motor) >= 2;
  const capPct = v2 ? (opts.qualityCapPct ?? QUALITY_CAP_PCT_DEFAULT) : null;
  const template = getDayLayoutTemplate(goalId, phase, level, weeksToRace);
  const taperWeeks = taperWeeksParam ?? 2;
  const q3PaceKey = suggestQualityPaces(goalId, phase, weeksToRace, taperWeeks, null, level).q3;
  const conTope = (km) => (km == null || !v2 ? km : Math.max(QUALITY_MIN_KM, Math.min(km, r1(weeklyKm * capPct))));
  let q1Km = conTope(qualityKmFor(q1PaceKey, level, weeklyKm));
  let q2Km = conTope(qualityKmFor(q2PaceKey, level, weeklyKm));
  let q3Km = conTope(qualityKmFor(q3PaceKey, level, weeklyKm));
  let longKm = longRunKm;

  const fixedTotal = longKm + (q1Km || 0) + (q2Km || 0) + (q3Km || 0);
  if (fixedTotal > weeklyKm && fixedTotal > 0) {
    const shrink = weeklyKm / fixedTotal;
    longKm = r1(longKm * shrink);
    if (q1Km) q1Km = r1(q1Km * shrink);
    if (q2Km) q2Km = r1(q2Km * shrink);
    if (q3Km) q3Km = r1(q3Km * shrink);
  }
  const remaining = Math.max(0, weeklyKm - longKm - (q1Km || 0) - (q2Km || 0) - (q3Km || 0));
  const flexSlots = template.filter((t) =>
    t.slot === "easy" || (t.slot === "q1" && q1Km == null) || (t.slot === "q2" && q2Km == null) || (t.slot === "q3" && q3Km == null)
  );
  const flexTotalPct = flexSlots.reduce((s, t) => s + t.pct, 0) || 1;

  const plan = template.map((slotDef, i) => {
    let paceKey = slotDef.pace;
    let km;
    let longProgressive = false;
    if (slotDef.slot === "q1") { paceKey = q1PaceKey; km = q1Km != null ? q1Km : r1(remaining * (slotDef.pct / flexTotalPct)); }
    else if (slotDef.slot === "q2") { paceKey = q2PaceKey; km = q2Km != null ? q2Km : r1(remaining * (slotDef.pct / flexTotalPct)); }
    else if (slotDef.slot === "q3") { paceKey = q3PaceKey; km = q3Km != null ? q3Km : r1(remaining * (slotDef.pct / flexTotalPct)); }
    else if (slotDef.slot === "long") { km = longKm; paceKey = weeksToRace === 0 ? "race" : "long"; longProgressive = phase !== "base"; }
    else if (slotDef.slot === "easy") {
      km = r1(remaining * (slotDef.pct / flexTotalPct));
      if (i === 0 && paces && paces.E) km = Math.min(km, r1(48 / paces.E));
      // Si al presupuesto semanal no le alcanza para darle a este día un mínimo real de
      // kilometraje, mejor que quede como descanso genuino — antes se etiquetaba igual como
      // sesión de Run/Walk aunque el cálculo diera 0 km, lo cual no tiene sentido.
      if (km < 1) { paceKey = ""; km = 0; }
    }
    else { km = 0; }
    const paceForDisplay = paceKey === "long" ? "long" : (paceKey === "broken" || paceKey === "fartlek" ? "T" : (paceKey === "combo1k500" ? "I" : (paceKey === "hills" ? null : paceKey)));
    const isAccumulation = (slotDef.slot === "easy" || slotDef.slot === "q3") && paceKey === "E";
    const isMondayRecovery = i === 0 && slotDef.slot === "easy";
    const finalType = getDefaultTitle(paceKey, isMondayRecovery, isAccumulation) ?? slotDef.type;
    const forcedThresholdMin = slotDef.slot === "q2" && paceKey === "T" ? getForcedThresholdDuration(weeksToRace, goalId) : null;
    const dayObj = {
      day: DAYS[i], type: finalType, paceKey, km, slot: slotDef.slot, phase, isMondayRecovery, level,
      targetPace: paceForDisplay && paces ? paces[paceForDisplay] ?? null : null,
      easyPace: paces ? paces.E ?? null : null,
      marathonPace: paces ? paces.M ?? null : null,
      hmPace: paces ? paces.HM ?? null : null,
      runWalk: isAccumulation, longProgressive,
      distOverride: forcedThresholdMin ?? undefined,
    };
    // Un easy que se quedó sin presupuesto queda en descanso, pero marcado: si al reajustar
    // la semana vuelve a sobrar volumen, el reparto lo puede revivir como el día que era.
    if (slotDef.slot === "easy" && !isMondayRecovery && !paceKey) {
      dayObj.descansoPorVolumen = true;
      dayObj.runWalkAntes = true;
    }
    // Recalcula el km real (con descanso incluido) para los tipos que autoseleccionan su
    // estructura — así el total mostrado siempre coincide con el desglose detallado.
    if (["R", "I", "T", "brokenT", "custom", "combo1k500", "fartlek", "hills"].includes(paceKey)) {
      dayObj.km = computeImpliedKm(dayObj);
    }
    return dayObj;
  });
  if (!v2) return plan;
  return decorarBaseV2(ajustarCalidadAlTope(plan, weeklyKm, capPct), phase);
}
/* ---------------------------------------------------------
   REPARTO DEL VOLUMEN SEMANAL (planes de carrera)

   El orden de prioridad es el de la metodología:

     1. El fondo y los entrenamientos de calidad tienen sus km propios. Se respetan.
     2. Lo que queda hasta el volumen de la semana lo completan los easy y los run/walk.
     3. Ninguno de esos días baja de VOLUMEN_MIN_KM. Si no alcanza para todos, el que
        menos tenía pasa a descanso, y los demás se reparten lo que hay. Si vuelve a
        sobrar volumen —porque el coach acortó el fondo, por ejemplo— ese día revive.

   El lunes de recuperación queda fuera: tiene su propia regla (no más de 48 minutos) y no
   lleva mínimo. Tampoco entran los planes de principiante y fitness, que avanzan por
   etapas de tiempo y nunca pasan por acá.

   Cómo se reparte: cada día conserva la forma que le dio la plantilla (kmBase) y todos
   suben o bajan lo mismo. Partir siempre de kmBase, y no de los km de ese momento, hace
   que el resultado dependa solo de cómo está la semana ahora y no del camino: escribir
   "1" y luego "12" en el fondo da lo mismo que escribir "12" de una vez.

   Un día que el coach editó a mano queda fijo (kmFijado) y no se toca.
--------------------------------------------------------- */
export const VOLUMEN_MIN_KM = 5;

export function esDiaDeVolumen(d) {
  if (!d || d.isMondayRecovery) return false;
  if (d.stageRun != null || d.stageReps != null) return false; // progresión por etapas
  if (d.slot === "long") return false;
  if (d.paceKey === "E") return true;
  return d.paceKey === "" && !!d.descansoPorVolumen;
}

const aMedioKm = (x) => Math.round(x * 2) / 2;
const aDecima = (x) => Math.round(x * 10) / 10;

function activarDia(d, km) {
  if (d.paceKey === "E") return { ...d, km };
  const runWalk = d.runWalkAntes ?? true;
  const { descansoPorVolumen, runWalkAntes, ...resto } = d;
  return {
    ...resto, km, paceKey: "E", runWalk,
    type: getDefaultTitle("E", false, runWalk) ?? d.type,
    targetPace: d.easyPace ?? null,
  };
}

function descansarDia(d) {
  if (d.paceKey === "" && d.descansoPorVolumen) return { ...d, km: 0 };
  return {
    ...d, km: 0, paceKey: "", type: "Descanso", targetPace: null,
    runWalk: false, runWalkAntes: d.runWalk ?? d.runWalkAntes ?? true,
    descansoPorVolumen: true,
  };
}

// Devuelve { plan, diferencia }. "diferencia" es lo que le falta (positiva) o le sobra
// (negativa) a la semana respecto del objetivo después del reparto: queda distinta de cero
// solo cuando no hay forma de cuadrar respetando el mínimo — por ejemplo, si después del
// fondo y la calidad sobran 3 km, que no alcanzan para un día de 5.
export function repartirVolumen(plan, weeklyKm, { minKm = VOLUMEN_MIN_KM } = {}) {
  const suma = (p) => p.reduce((t, d) => t + (Number(d?.km) || 0), 0);
  if (!Array.isArray(plan) || !(weeklyKm > 0)) return { plan, diferencia: 0 };

  // La forma de cada día se fija la primera vez que pasa por acá y ya no cambia.
  const conBase = plan.map((d) => (esDiaDeVolumen(d) && d.kmBase == null ? { ...d, kmBase: Number(d.km) || 0 } : d));

  const pool = conBase.map((d, i) => (esDiaDeVolumen(d) && !d.kmFijado ? i : -1)).filter((i) => i >= 0);
  const fijo = conBase.reduce((t, d, i) => (pool.includes(i) ? t : t + (Number(d?.km) || 0)), 0);
  const presupuesto = weeklyKm - fijo;
  if (!pool.length) return { plan: conBase, diferencia: aDecima(weeklyKm - suma(conBase)) };

  // Cuántos días pueden entrenar sin que ninguno baje del mínimo.
  const cupos = presupuesto >= minKm ? Math.floor(presupuesto / minKm + 1e-9) : 0;
  let cuantos = Math.min(pool.length, cupos);

  // Única excepción al mínimo: si lo que queda no alcanza ni para un día de VOLUMEN_MIN_KM,
  // se hace UN easy más corto con eso, en vez de perder esos km. Por debajo de 1 km no
  // tiene sentido salir a correr, y la semana queda así.
  let piso = minKm;
  if (cuantos === 0 && presupuesto >= 1) { cuantos = 1; piso = 0; }

  // Entrenan los de más peso en la plantilla; a igualdad, el que va antes en la semana.
  const base = (i) => Number(conBase[i].kmBase) || 0;
  const orden = [...pool].sort((a, b) => base(b) - base(a) || a - b);
  const activos = orden.slice(0, cuantos);
  const descansan = new Set(orden.slice(cuantos));

  // Todos suben o bajan lo mismo desde su base. El que quedaría bajo el mínimo se queda
  // en el mínimo, y lo que faltaba se reparte entre los demás.
  const valor = new Map(activos.map((i) => [i, base(i)]));
  let libres = [...activos];
  for (let vuelta = 0; vuelta < activos.length + 1 && libres.length; vuelta++) {
    const actual = [...valor.values()].reduce((t, v) => t + v, 0);
    const delta = (presupuesto - actual) / libres.length;
    for (const i of libres) valor.set(i, valor.get(i) + delta);
    const bajos = libres.filter((i) => valor.get(i) < piso - 1e-9);
    if (!bajos.length) break;
    for (const i of bajos) valor.set(i, piso);
    libres = libres.filter((i) => !bajos.includes(i));
  }

  // A medio kilómetro, como el resto del plan. Lo que se pierde al redondear va al día
  // más largo, a la décima, para que la semana cuadre.
  const km = new Map(activos.map((i) => [i, Math.max(piso, aMedioKm(valor.get(i)))]));
  if (activos.length) {
    const resto = presupuesto - [...km.values()].reduce((t, v) => t + v, 0);
    const mayor = activos.reduce((m, i) => (km.get(i) > km.get(m) ? i : m), activos[0]);
    km.set(mayor, Math.max(piso, aDecima(km.get(mayor) + resto)));
  }

  const siguiente = conBase.map((d, i) => {
    if (km.has(i)) return activarDia(d, km.get(i));
    if (descansan.has(i)) return descansarDia(d);
    return d;
  });
  return { plan: siguiente, diferencia: aDecima(weeklyKm - suma(siguiente)) };
}

// Se conserva el nombre de siempre: es lo que llaman la generación de la semana, la
// publicación automática y el recálculo del panorama.
export function balanceWeeklyVolume(plan, weeklyKm) {
  return repartirVolumen(plan, weeklyKm).plan;
}

// Revisa un plan semanal recién generado en busca de cosas que se ven raras — sesiones con
// entrenamiento pero 0 km, sesiones inusualmente largas, etc. — para avisarle al coach antes de
// aplicarlo, en vez de dejarlo pasar en silencio.
export const ANOMALY_MAX_KM = 36; // por encima de esto, se avisa (una vuelta de maratón completa y algo más)
export const ANOMALY_MAX_LONG_KM = 42; // el fondo del domingo tolera un poco más antes de avisar
export function getAnomalyWarnings(plan) {
  if (!plan || !Array.isArray(plan)) return [];
  const warnings = [];
  plan.forEach((d) => {
    if (!d || !d.paceKey) return; // día de descanso, no aplica
    const km = d.km;
    if (km == null || isNaN(km) || km <= 0) {
      warnings.push(`${d.day}: "${d.type}" tiene entrenamiento asignado pero el kilometraje aparece en 0.`);
      return;
    }
    const limit = d.slot === "long" || d.paceKey === "long" ? ANOMALY_MAX_LONG_KM : ANOMALY_MAX_KM;
    if (km > limit) {
      warnings.push(`${d.day}: "${d.type}" tiene ${km} km — es una sesión inusualmente larga, revisa si es correcto.`);
    }
    if (km > 0 && km < 0.5 && d.slot !== "q2" && d.slot !== "q1") {
      warnings.push(`${d.day}: "${d.type}" tiene solo ${km} km — parece demasiado corto, revisa si es correcto.`);
    }
  });
  return warnings;
}

/* ---------------------------------------------------------
   MOTOR 2 — alumnos creados (o con objetivo cambiado) desde esta versión.
   Los alumnos que ya existían siguen con el motor anterior hasta que el coach les cambie
   el objetivo: así nadie ve cambiar de golpe un plan que ya está corriendo.

   Reglas:
   · Volumen mínimo por días: cada día de entrenamiento del nivel tiene su mínimo (5 km un
     easy, 6 km una calidad, 8 km el fondo). Si el pico que escribió el coach no alcanza para
     eso, ganan los días y se avisa al crear el alumno.
   · Pico semanal = el que escribió el coach. El fondo más largo sale de ese pico según los
     días del nivel, con tope de 34 km en maratón.
   · Calidad: cada sesión hasta el 25% del volumen de la semana (personalizable por alumno),
     y nunca tanto como para dejar un easy por debajo de 5 km.
   · Base progresiva: hasta 12 semanas antes de Velocidad, +8% semanal como máximo, una
     semana de asimilación (−20%) cada cuatro; el fondo sube de 1 a 2 km por semana hasta
     empalmar con el primer fondo de Velocidad. Antes de esas 12 semanas, mantenimiento.
     Semanas 1-2: solo rodajes con strides y progresiones; desde la 3, un umbral suave.
   · Principiante con carrera: después de al menos 8 semanas de run/walk y continuo pasa
     al plan de carrera como Intermedio 1 (mismos 3 días).
--------------------------------------------------------- */
export const MOTOR_ACTUAL = 2;
export function usaMotor2(s) { return Number(s?.motor ?? 1) >= 2; }
export const QUALITY_CAP_PCT_DEFAULT = 0.25;
export function qualityCapPctOf(s) {
  const v = Number(s?.qualityCapPct);
  return v > 0 && v <= 1 ? v : QUALITY_CAP_PCT_DEFAULT;
}
// Una sesión de calidad no baja de 8 km: 3 de calentamiento + 2 de vuelta a la calma + el bloque.
export const QUALITY_MIN_KM = 8;
export const LONG_MIN_KM = 8;
export const MONDAY_RECOVERY_MIN_KM = 4;
export const LONG_SHARE_BY_DAYS = { 3: 0.55, 4: 0.5, 5: 0.45, 6: 0.4, 7: 0.36 };

export function minWeeklyKmFor(level) {
  const roles = LEVEL_DAY_ROLES[level] || LEVEL_DAY_ROLES.intermedio2;
  const MIN = { rest: 0, long: LONG_MIN_KM, q1: QUALITY_MIN_KM, q2: QUALITY_MIN_KM, easyC: MONDAY_RECOVERY_MIN_KM };
  return roles.reduce((t, r) => t + (MIN[r] ?? VOLUMEN_MIN_KM), 0);
}
// Mínimo de la semana contando el fondo real que le toca (no el fondo mínimo).
// Si esa semana el sábado lleva pre-carga (q3 de calidad), también cuenta como calidad.
export function minWeeklyKmWithLong(level, longKm, q3Calidad = false) {
  const roles = LEVEL_DAY_ROLES[level] || [];
  const extraQ3 = q3Calidad && roles.includes("q3") ? QUALITY_MIN_KM - VOLUMEN_MIN_KM : 0;
  return minWeeklyKmFor(level) - LONG_MIN_KM + Math.max(LONG_MIN_KM, Number(longKm) || 0) + extraQ3;
}
export function q3EsCalidad(goalId, k) {
  const taper = getTaperWeeks(goalId);
  return k > taper && k <= taper + 4;
}
// En los niveles sin días easy (3 días), lo que cabe en la semana tiene techo: el fondo más
// largo posible más dos calidades al tope. Por encima de eso no hay dónde poner los km.
export function maxWeeklyKmFor(goalId, level, capPct = QUALITY_CAP_PCT_DEFAULT) {
  const roles = LEVEL_DAY_ROLES[level] || [];
  if (roles.some((r) => r.startsWith("easy") || r === "q3")) return null;
  const nQ = roles.filter((r) => r === "q1" || r === "q2").length;
  const longCap = LONG_RUN_CAP_KM[goalId] ?? 30;
  return Math.floor(longCap / Math.max(0.2, 1 - nQ * capPct));
}
export function peakLongKmFor(goalId, level, peakKm) {
  const days = TRAIN_DAYS_BY_LEVEL[level] ?? 5;
  const cap = LONG_RUN_CAP_KM[goalId] ?? 30;
  const share = LONG_SHARE_BY_DAYS[days] ?? 0.4;
  const pico = Math.max(Number(peakKm) || 0, minWeeklyKmFor(level));
  return Math.max(LONG_MIN_KM, rWhole(Math.min(cap, pico * share)));
}
// Avisos para el coach al crear el alumno (o cambiarle el objetivo).
export function getPeakWarnings(goalId, level, peakKm) {
  const out = [];
  if (!(peakKm > 0) || isFitnessGoal(goalId)) return out;
  const min = minWeeklyKmFor(level);
  const days = TRAIN_DAYS_BY_LEVEL[level];
  if (peakKm < min) out.push(`Con ${days} días por semana el plan necesita al menos ${min} km semanales (5 km por easy, 8 por calidad, 8 el fondo): usará ${min} km aunque el pico escrito sea ${peakKm}.`);
  const techo = maxWeeklyKmFor(goalId, level);
  if (techo != null && peakKm > techo) out.push(`Con ${days} días por semana caben como máximo unos ${techo} km semanales (fondo de ${LONG_RUN_CAP_KM[goalId]} km + dos calidades al 25%): el plan no pasará de ahí.`);
  if (goalId === "42k") {
    const share = LONG_SHARE_BY_DAYS[days] ?? 0.4;
    const fondo = peakLongKmFor(goalId, level, peakKm);
    if (fondo < 30) out.push(`Con un pico de ${peakKm} km el fondo más largo llegará a ${fondo} km. Para llegar a 30 km hace falta un pico de unos ${Math.ceil(30 / share)} km; para 34 km, unos ${Math.ceil(34 / share)}.`);
  }
  return out;
}

export const BASE_PROGRESSIVE_MAX_WEEKS = 12;
export const BASE_WEEKLY_RATE_MAX = 1.08;
export const BASE_ASSIM_FACTOR = 0.8;
export const BASE_LONG_STEP_MIN = 1, BASE_LONG_STEP_MAX = 2;
// Semanas que faltan a la carrera en la primera semana de Velocidad.
export function weeksToRaceAtBuildStart(goalId) { return getTaperWeeks(goalId) + 13; }

export function motorCtx(s, extra) {
  return {
    goal: s.goal, level: s.level, peakKm: s.peakKm,
    peakLongKm: s.peakLongKm || peakLongKmFor(s.goal, s.level, s.peakKm),
    startWeeksToRace: s.planStartWeeksToRace ?? null,
    qualityCapPct: qualityCapPctOf(s),
    currentWeeklyKm: Number(s.currentWeeklyKm) || null,
    currentLongKm: Number(s.currentLongKm) || null,
    desdePrincipiante: !!s.desdePrincipiante,
    paces: s.paces || null,
    ...(extra || {}),
  };
}

// Semana k (semanas a la carrera) dentro de la base. Se calcula siempre desde el inicio de la
// base hacia adelante, así el resultado no depende de cuántas veces se recalcule.
export function baseProgressionWeek(ctx, k) {
  const taper = getTaperWeeks(ctx.goal);
  const kv = weeksToRaceAtBuildStart(ctx.goal);
  const T = (Number(ctx.peakKm) || 0) * chunkBaselineFactor(2) * fracForWeek(1);
  const TL = (Number(ctx.peakLongKm) || 0) * chunkBaselineFactor(2) * fracForWeek(1);
  const nb = Math.max(1, k - kv); // 1 = última semana de base antes de Velocidad
  const startNb = Math.max(nb, (ctx.startWeeksToRace ?? k) - kv);
  const windowLen = Math.min(BASE_PROGRESSIVE_MAX_WEEKS, startNb);
  // La primera semana del tramo progresivo nunca es de asimilación.
  const isAssim = (n) => n !== windowLen && getCyclePosition(kv + n, taper).isAssimilation;
  let loads = 0;
  for (let n = windowLen; n >= 1; n--) if (!isAssim(n)) loads++;
  const floor = minWeeklyKmFor(ctx.level);
  // Sin dato del coach, la base arranca donde haga falta para llegar a Velocidad subiendo como
  // máximo un 8% por semana. Con dato ("km por semana hoy"), arranca de ahí — sin bajarle el
  // volumen a quien ya corre más, pero sin pasar del 80% del pico.
  const pico = Math.max(Number(ctx.peakKm) || 0, floor);
  let S = ctx.currentWeeklyKm > 0
    ? Math.min(ctx.currentWeeklyKm, pico * 0.8)
    : Math.min(T / BASE_WEEKLY_RATE_MAX ** loads, Math.max(T, floor));
  S = Math.max(S, floor);
  const rate = loads > 0 && T > S ? Math.min(BASE_WEEKLY_RATE_MAX, (T / S) ** (1 / loads)) : 1;
  let L0 = ctx.currentLongKm > 0
    ? Math.min(ctx.currentLongKm, (Number(ctx.peakLongKm) || 0) * 0.8)
    : Math.min(TL - 1.5 * loads, Math.max(TL, LONG_MIN_KM));
  L0 = Math.max(L0, LONG_MIN_KM);
  const step = loads > 0 && TL > L0 ? Math.min(BASE_LONG_STEP_MAX, Math.max(BASE_LONG_STEP_MIN, (TL - L0) / loads)) : 0;
  if (nb > windowLen) return { weeklyKm: S, longKm: L0, isAssimilation: false, tramo: "mantenimiento" };
  let i = 0, lastW = S, lastL = L0, out = { weeklyKm: S, longKm: L0, isAssimilation: false };
  for (let n = windowLen; n >= nb; n--) {
    if (isAssim(n)) out = { weeklyKm: lastW * BASE_ASSIM_FACTOR, longKm: lastL * BASE_ASSIM_FACTOR, isAssimilation: true };
    else {
      lastW = S * rate ** i;
      lastL = Math.min(Math.max(TL, L0), L0 + step * i);
      i++;
      out = { weeklyKm: lastW, longKm: lastL, isAssimilation: false };
    }
  }
  return { ...out, tramo: "progresiva", semanaDeBase: windowLen - nb + 1, semanasDeBase: windowLen };
}

// Volumen y fondo objetivo de la semana k, motor 2.
export function targetWeekV2(ctx, k) {
  const taper = getTaperWeeks(ctx.goal);
  const phase = getPhase(k, ctx.goal);
  const cyclePos = getCyclePosition(k, taper);
  const floor = minWeeklyKmFor(ctx.level);
  const techo = maxWeeklyKmFor(ctx.goal, ctx.level, ctx.qualityCapPct ?? QUALITY_CAP_PCT_DEFAULT);
  const peak = Math.max(Math.min(Number(ctx.peakKm) || 0, techo ?? Infinity), floor);
  const peakLong = Number(ctx.peakLongKm) || peakLongKmFor(ctx.goal, ctx.level, peak);
  // Recién salido de Principiante: dos semanas solo de rodajes (con strides y progresiones),
  // con el volumen mínimo de sus 3 días, antes de la primera calidad.
  const planWeek = ctx.startWeeksToRace != null ? ctx.startWeeksToRace - k + 1 : null;
  if (ctx.desdePrincipiante && planWeek != null && planWeek <= 2 && phase !== "taper" && phase !== "race") {
    const roles = LEVEL_DAY_ROLES[ctx.level] || [];
    const sinCalidad = roles.reduce((t, r) => t + (r === "rest" ? 0 : r === "long" ? LONG_MIN_KM : VOLUMEN_MIN_KM), 0);
    return { phase, weeklyKm: sinCalidad + 2 * (planWeek - 1), longRunKm: LONG_MIN_KM + (planWeek - 1), isAssimilation: false, soloRodajes: true };
  }
  if (phase === "taper" || phase === "race") {
    let weeklyKm = rWhole(peak * getPhaseFactor(phase, k));
    const template = getDayLayoutTemplate(ctx.goal, phase, ctx.level, k);
    const longSlot = template.find((t) => t.slot === "long");
    const longRunKm = Math.min(rWhole(peakLong), capLongRunKm(ctx.goal, ctx.level, rWhole(weeklyKm * (longSlot ? longSlot.pct : 0.4))));
    if (phase === "taper") weeklyKm = Math.max(weeklyKm, minWeeklyKmWithLong(ctx.level, longRunKm));
    return { phase, weeklyKm, longRunKm, isAssimilation: false };
  }
  let weeklyKm, longRunKm, isAssimilation = cyclePos.isAssimilation, extra = {};
  if (phase === "base") {
    const b = baseProgressionWeek({ ...ctx, peakLongKm: peakLong }, k);
    weeklyKm = b.weeklyKm; longRunKm = b.longKm; isAssimilation = b.isAssimilation;
    extra = { tramo: b.tramo, semanaDeBase: b.semanaDeBase, semanasDeBase: b.semanasDeBase };
  } else if (cyclePos.isPeak) {
    weeklyKm = peak; longRunKm = peakLong;
  } else {
    const f = chunkBaselineFactor(cyclePos.chunk) * fracForWeek(cyclePos.w);
    weeklyKm = peak * f; longRunKm = peakLong * f;
    // Quien ya corría más que el arranque de Velocidad no baja su volumen al entrar.
    if (!cyclePos.isAssimilation && ctx.currentWeeklyKm > 0) weeklyKm = Math.max(weeklyKm, Math.min(ctx.currentWeeklyKm, peak * 0.8));
    if (!cyclePos.isAssimilation && ctx.currentLongKm > 0) longRunKm = Math.max(longRunKm, Math.min(ctx.currentLongKm, peakLong * 0.8));
  }
  longRunKm = Math.max(LONG_MIN_KM, Math.min(rWhole(longRunKm), rWhole(peakLong)));
  const q3c = q3EsCalidad(ctx.goal, k);
  // Base con velocidad (21K/42K, 5+ días): el martes es calidad y en la transición el jueves es
  // umbral fraccionado, que no baja de ~9 km. Se suma ese margen al mínimo para que ningún día
  // suave quede en descanso por falta de volumen.
  const margenBase = phase === "base" && llevaVelocidadEnBase(ctx.goal, ctx.level) ? MARGEN_CALIDAD_BASE_KM : 0;
  const kmTransicion = phase === "base" ? kmCalidadesTransicion(ctx, k, isAssimilation) : null;
  const minimo = (lk) => Math.max(
    minWeeklyKmWithLong(ctx.level, lk, q3c) + margenBase,
    // Sin pasar el pico que escribió el coach: si no alcanza, las calidades se recortan.
    kmTransicion != null ? Math.min(rWhole(peak), minWeeklyKmWithLong(ctx.level, lk, q3c) - 2 * QUALITY_MIN_KM + kmTransicion) : 0,
  );
  weeklyKm = Math.max(minimo(longRunKm), Math.min(rWhole(weeklyKm), rWhole(peak)));
  // El fondo sigue siendo la sesión más larga de la semana: no baja del 70% de su parte normal.
  const share = (LONG_SHARE_BY_DAYS[TRAIN_DAYS_BY_LEVEL[ctx.level]] ?? 0.4) * 0.7;
  longRunKm = Math.max(longRunKm, Math.min(rWhole(peakLong), rWhole(weeklyKm * share)));
  weeklyKm = Math.max(weeklyKm, minimo(longRunKm));
  return { phase, weeklyKm, longRunKm, isAssimilation, minimoSemana: rWhole(minimo(longRunKm)), ...extra };
}
export function cycleNoteV2(t) {
  if (t.phase !== "base") return "";
  if (t.tramo === "mantenimiento") return " Base · semanas de mantenimiento (la base progresiva empieza 12 semanas antes de Velocidad).";
  return ` Base progresiva · semana ${t.semanaDeBase} de ${t.semanasDeBase}${t.isAssimilation ? " (asimilación)" : ""}.`;
}

// Calidad sugerida, motor 2: las dos primeras semanas del plan y las de asimilación de la base
// no llevan umbral (el jueves queda como rodaje con progresiones).
export function suggestQualityPacesV2(goalId, phase, k, taperWeeks, cyclePos, level, planWeek, soloRodajes) {
  const qpBase = suggestQualityPaces(goalId, phase, k, taperWeeks, cyclePos, level);
  const cp = cyclePos || getCyclePosition(k, taperWeeks);
  if (soloRodajes) return { ...qpBase, q1: "E", q2: "E", q1Dist: null, q1Reps: null, q2Dist: null, q2Reps: null, q2RefMin: null, q3: "E" };
  // Martes de la base: velocidad corta (21K/42K, 5 días o más).
  const vel = phase === "base" && llevaVelocidadEnBase(goalId, level) ? velocidadCortaBase(goalId, k, planWeek, cp.isAssimilation) : null;
  const qp = vel ? { ...qpBase, q1: "R", q1Dist: vel.dist, q1Reps: vel.reps, calentamientoCorto: !!vel.transicion } : qpBase;
  // En la transición (4 últimas semanas de base) el jueves es umbral fraccionado progresivo,
  // salvo en la descarga.
  if (vel?.transicion && !cp.isAssimilation) {
    const u = umbralTransicion(goalId, k);
    if (u) return { ...qp, q2: "brokenT", q2Dist: u.workMin, q2Reps: u.recMin, q2RefMin: u.refMin, q2BrokenReps: u.reps };
    return qp;
  }
  if (phase === "base" && ((planWeek ?? 99) <= 2 || cp.isAssimilation)) {
    return { ...qp, q2: "E", q2Dist: null, q2Reps: null, q2RefMin: null };
  }
  // Desde la semana 3, la calidad suave del jueves rota: fartlek, cuestas, umbral fraccionado.
  // Cada vuelta completa, el fartlek y las cuestas suben un escalón.
  if (phase === "base" && planWeek != null && planWeek >= 3) {
    const i = planWeek - 3;
    const vuelta = Math.floor(i / 3);
    const tipo = i % 3;
    if (tipo === 0) {
      const f = FARTLEK_PROGRESION[Math.min(vuelta, FARTLEK_PROGRESION.length - 1)];
      return { ...qp, q2: "fartlek", q2Dist: f.workMin, q2Reps: f.reps, q2RefMin: null, q2Rec: f.recMin };
    }
    if (tipo === 1) {
      const h = HILLS_PROGRESION[Math.min(vuelta, HILLS_PROGRESION.length - 1)];
      return { ...qp, q2: "hills", q2Dist: h.workSec, q2Reps: h.reps, q2RefMin: null, q2Rec: h.recMin };
    }
  }
  return qp;
}
// Velocidad corta del martes en la base de 21K y 42K (niveles de 5 días o más; el de 4 días
// sigue con una sola calidad). Desde la primera semana de base, series cortas a ritmo R con
// recuperación al trote; en las 4 últimas semanas de base (la transición al plan) suben a
// 300-400 m y el jueves pasa a umbral.
export const VELOCIDAD_CORTA_INICIO = [{ dist: 0.2, reps: 6 }, { dist: 0.2, reps: 8 }, { dist: 0.2, reps: 10 }];
export const VELOCIDAD_CORTA_TRANSICION = [{ dist: 0.3, reps: 8 }, { dist: 0.4, reps: 6 }, { dist: 0.4, reps: 8 }, { dist: 0.4, reps: 8 }];
export const VELOCIDAD_CORTA_DESCARGA = { dist: 0.2, reps: 6 };
export const SEMANAS_TRANSICION_BASE = 4;
export const MARGEN_CALIDAD_BASE_KM = 2;
// Jueves de la transición: umbral fraccionado que progresa semana a semana. Recuperación de
// 1' por cada 5' de trabajo (Daniels).
export const UMBRAL_TRANSICION = [
  { reps: 3, workMin: 6, recMin: 1 },
  { reps: 3, workMin: 8, recMin: 1.5 },
  { reps: 4, workMin: 8, recMin: 1.5 },
  { reps: 3, workMin: 10, recMin: 2 },
];
// Ritmo de referencia del umbral: la duración continua más cercana por encima del trabajo total.
export function refMinUmbral(totalMin) {
  return T_DURATIONS.find((t) => t >= totalMin) ?? T_DURATIONS[T_DURATIONS.length - 1];
}
// Km de las dos calidades de una semana de transición, completas (con calentamiento corto).
// Sirve para que la semana tenga volumen suficiente y no haya que recortarlas.
export function kmCalidadesTransicion(ctx, k, isAssimilation) {
  if (!llevaVelocidadEnBase(ctx.goal, ctx.level) || !ctx.paces) return null;
  const vel = velocidadCortaBase(ctx.goal, k, 99, isAssimilation);
  if (!vel?.transicion) return null;
  const p = ctx.paces;
  const comun = { easyPace: p.E, hmPace: p.HM, marathonPace: p.M, targetPace: p.race, calentamientoCorto: true };
  const q1 = computeImpliedKm({ ...comun, paceKey: "R", distOverride: vel.dist, repsOverride: vel.reps });
  if (isAssimilation) return q1 + QUALITY_MIN_KM; // el jueves de descarga es un suave
  const u = umbralTransicion(ctx.goal, k);
  const q2 = u ? computeImpliedKm({ ...comun, paceKey: "brokenT", distOverride: u.workMin, repsOverride: u.reps, recoveryOverride: u.recMin, brokenTRefMin: u.refMin }) : QUALITY_MIN_KM;
  return q1 + q2;
}
export function umbralTransicion(goalId, k) {
  const nb = semanasHastaVelocidad(goalId, k);
  if (nb < 1 || nb > SEMANAS_TRANSICION_BASE) return null;
  const u = UMBRAL_TRANSICION[SEMANAS_TRANSICION_BASE - nb];
  return { ...u, refMin: refMinUmbral(u.reps * u.workMin) };
}
export function llevaVelocidadEnBase(goalId, level) {
  return (goalId === "21k" || goalId === "42k") && (TRAIN_DAYS_BY_LEVEL[level] ?? 0) >= 5;
}
// Semanas que faltan para que empiece Velocidad (1 = última semana de base).
export function semanasHastaVelocidad(goalId, k) { return k - weeksToRaceAtBuildStart(goalId); }
export function velocidadCortaBase(goalId, k, planWeek, isAssimilation) {
  const nb = semanasHastaVelocidad(goalId, k);
  if (nb < 1) return null;
  if (isAssimilation) {
    if (nb <= SEMANAS_TRANSICION_BASE) return { dist: 0.3, reps: 6, transicion: true };
    return { ...VELOCIDAD_CORTA_DESCARGA, transicion: false };
  }
  if (nb <= SEMANAS_TRANSICION_BASE) return { ...VELOCIDAD_CORTA_TRANSICION[SEMANAS_TRANSICION_BASE - nb], transicion: true };
  const i = Math.max(0, Math.min(VELOCIDAD_CORTA_INICIO.length - 1, (planWeek ?? 3) - 1));
  return { ...VELOCIDAD_CORTA_INICIO[i], transicion: false };
}

export function planWeekOf(s, weeksToRace) {
  return s?.planStartWeeksToRace != null ? s.planStartWeeksToRace - weeksToRace + 1 : null;
}

// En la base, los rodajes de martes y jueves llevan strides y progresiones al final.
export function decorarBaseV2(plan, phase) {
  if (phase !== "base" && phase !== "build" && phase !== "peak") return plan;
  return plan.map((d) => {
    if (phase === "base" && d.slot === "q1" && d.paceKey === "R") return { ...d, type: "Velocidad corta" };
    if (d.slot === "q1" && d.paceKey === "E") return { ...d, type: "Easy + strides", extra: "strides" };
    if (d.slot === "q2" && d.paceKey === "E") return { ...d, type: "Easy + progresiones", extra: "progresiones" };
    return d;
  });
}

// Recorta una sesión de calidad hasta que quepa en el tope: primero baja repeticiones (o
// minutos), después acorta la distancia de cada repetición.
function mejorRepsQueCaben(d, dist, tope, minReps, maxReps) {
  for (let reps = maxReps; reps >= minReps; reps--) {
    const next = { ...d, distOverride: dist, repsOverride: reps };
    const km = computeImpliedKm(next);
    if (km <= tope) return { ...next, km };
  }
  const next = { ...d, distOverride: dist, repsOverride: minReps };
  return { ...next, km: computeImpliedKm(next) };
}
export function ajustarSesionAlTope(d, tope) {
  if (!(Number(d.km) > tope)) return d;
  let pk = d.paceKey;
  if (["race", "broken", "M"].includes(pk)) return { ...d, km: Math.max(QUALITY_MIN_KM, r1(tope)) };
  let cur = d;
  if (pk === "combo1k500") {
    pk = "I";
    cur = { ...d, paceKey: "I", type: getDefaultTitle("I", false, false) };
  }
  if (pk === "I" || pk === "R") {
    const dists = pk === "I" ? I_DISTANCES : R_DISTANCES;
    const minReps = pk === "I" ? 2 : 4, maxReps = pk === "I" ? 8 : 12;
    let dist = cur.distOverride || (pk === "I" ? 1 : 0.4);
    let reps = cur.repsOverride || maxReps;
    // misma distancia, menos repeticiones
    let best = mejorRepsQueCaben(cur, dist, tope, minReps, Math.min(maxReps, reps));
    // si ni con el mínimo de repeticiones cabe, distancias más cortas
    while (best.km > tope) {
      const shorter = dists.filter((x) => x < dist);
      if (!shorter.length) break;
      dist = shorter[shorter.length - 1];
      best = mejorRepsQueCaben(cur, dist, tope, minReps, maxReps);
    }
    return best;
  }
  if (esCalidadSuave(pk)) {
    for (let reps = (cur.repsOverride || calidadSuave(cur).reps) - 1; reps >= 4 && cur.km > tope; reps--) {
      const next = { ...cur, repsOverride: reps };
      cur = { ...next, km: computeImpliedKm(next) };
    }
    return cur;
  }
  for (let n = 0; n < 40 && cur.km > tope; n++) {
    let next;
    if (pk === "T") {
      const m = cur.distOverride || 30;
      if (m <= 12) break;
      next = { ...cur, distOverride: m > 20 ? m - 5 : m - 1 };
    } else if (pk === "brokenT") {
      const m = cur.distOverride || 8;
      if (m <= 4) break;
      next = { ...cur, distOverride: m - 1 };
    } else break;
    const km = computeImpliedKm(next);
    if (km > cur.km) break;
    cur = { ...next, km };
  }
  return cur;
}
export function ajustarCalidadAlTope(plan, weeklyKm, capPct = QUALITY_CAP_PCT_DEFAULT) {
  if (!Array.isArray(plan) || !(weeklyKm > 0)) return plan;
  const isQ = (d) => d && ["q1", "q2", "q3"].includes(d.slot) && d.paceKey && d.paceKey !== "E" && !d.kmFijado;
  const n = plan.filter(isQ).length;
  if (!n) return plan;
  const longKm = Number(plan.find((d) => d?.slot === "long")?.km) || 0;
  const diasVolumen = plan.filter((d) => esDiaDeVolumen(d)).length;
  const lunes = plan.filter((d) => d?.isMondayRecovery && d.paceKey).reduce((t, d) => t + (Number(d.km) || 0), 0);
  // El espacio de la semana se reparte entre las calidades, pero si una necesita menos que su
  // parte, lo que sobra lo puede usar otra (antes se repartía en partes iguales y se
  // recortaba la sesión más larga aunque hubiera lugar).
  let libre = weeklyKm - longKm - lunes - VOLUMEN_MIN_KM * diasVolumen;
  const techoPct = weeklyKm * capPct;
  const orden = plan.map((d, i) => ({ d, i })).filter((x) => isQ(x.d)).sort((a, b) => (Number(a.d.km) || 0) - (Number(b.d.km) || 0));
  const topes = {};
  orden.forEach((x, j) => {
    const parte = libre / (orden.length - j);
    const tope = Math.max(QUALITY_MIN_KM, Math.min(techoPct, parte));
    topes[x.i] = tope;
    libre -= Math.min(Number(x.d.km) || 0, tope);
  });
  return plan.map((d, i) => (isQ(d) ? ajustarSesionAlTope(d, topes[i]) : d));
}

// Cierre de la semana, motor 2: tope de calidad, strides/progresiones de la base, reparto del
// volumen en los easy y, en los niveles de 3 días (sin easy que absorban), lo que falte para
// completar la semana va al fondo, sin pasar del fondo más largo del ciclo.
export function cerrarSemanaV2(plan, weeklyKm, { qualityCapPct, phase, peakLongKm } = {}) {
  let p = decorarBaseV2(ajustarCalidadAlTope(plan, weeklyKm, qualityCapPct ?? QUALITY_CAP_PCT_DEFAULT), phase);
  p = balanceWeeklyVolume(p, weeklyKm);
  const suma = p.reduce((t, d) => t + (Number(d?.km) || 0), 0);
  const falta = weeklyKm - suma;
  const hayEasy = p.some((d) => esDiaDeVolumen(d) && d.paceKey === "E");
  const iLong = p.findIndex((d) => d?.slot === "long" && d.paceKey === "long");
  if (falta >= 0.5 && !hayEasy && iLong >= 0) {
    const tope = Number(peakLongKm) || Infinity;
    const actual = Number(p[iLong].km) || 0;
    const nuevo = Math.min(tope, aMedioKm(actual + falta));
    if (nuevo > actual) p = p.map((d, i) => (i === iLong ? { ...d, km: nuevo } : d));
  }
  return p;
}

// Semanas a la carrera medidas desde el lunes de una semana del plan.
export function weeksToRaceForWeek(student, weekNum) {
  if (!student?.raceDate) return null;
  const { monday } = getWeekDates(student, weekNum);
  const race = new Date(student.raceDate + "T00:00:00");
  return Math.max(0, Math.ceil((race - monday) / (7 * 24 * 60 * 60 * 1000)));
}
export const BEGINNER_MIN_WEEKS_BEFORE_RACE_PLAN = 8;
// ¿Le toca a un principiante con carrera pasar al plan de carrera? Devuelve null o las
// semanas a la carrera de la semana que viene.
export function debePasarAPlanDeCarrera(student, adherencePct) {
  if (!usaMotor2(student) || student.level !== "principiante" || isFitnessGoal(student.goal) || !student.raceDate) return null;
  const hechas = Object.entries(student.weeks || {}).filter(([n, w]) => Number(n) <= student.currentWeek && w?.phase === "principiante" && !w.inactive && !w.paused).length;
  if (hechas < BEGINNER_MIN_WEEKS_BEFORE_RACE_PLAN) return null;
  const next = weeksToRaceForWeek(student, student.currentWeek + 1);
  if (next == null || next < 1) return null;
  const stages = getStageTable("fitness");
  const stage = stages[Math.min(student.beginnerStage ?? 0, stages.length - 1)];
  const yaCorreContinuo = stage.walk === 0 && adherencePct >= 0.7;
  const seAcercaLaCarrera = next <= getTaperWeeks(student.goal) + 9; // un bloque de Velocidad + Específico + taper
  return yaCorreContinuo || seAcercaLaCarrera ? next : null;
}

export function computeBaselineWeek(goalId, level, peakKm, peakLongKm, weeksToRace, opts) {
  if (opts && Number(opts.motor) >= 2) {
    const t = targetWeekV2({ goal: goalId, level, peakKm, peakLongKm, ...opts }, weeksToRace);
    return { phase: t.phase, weeklyKm: t.weeklyKm, longRunKm: t.longRunKm };
  }
  const taperWeeks = getTaperWeeks(goalId);
  const phase = getPhase(weeksToRace, goalId);
  const cyclePos = getCyclePosition(weeksToRace, taperWeeks);
  let weeklyKm;
  if (phase === "taper" || phase === "race") weeklyKm = rWhole(peakKm * getPhaseFactor(phase, weeksToRace));
  else if (cyclePos.isPeak) weeklyKm = rWhole(peakKm);
  else weeklyKm = rWhole(peakKm * chunkBaselineFactor(cyclePos.chunk) * fracForWeek(cyclePos.w));
  weeklyKm = Math.min(weeklyKm, rWhole(peakKm));

  let longRunKm;
  if (phase === "taper" || phase === "race") {
    const template = getDayLayoutTemplate(goalId, phase, level, weeksToRace);
    const longSlot = template.find((t) => t.slot === "long");
    longRunKm = capLongRunKm(goalId, level, rWhole(weeklyKm * (longSlot ? longSlot.pct : 0.4)));
  } else if (cyclePos.isPeak) {
    longRunKm = rWhole(peakLongKm);
  } else {
    longRunKm = rWhole(peakLongKm * chunkBaselineFactor(cyclePos.chunk) * fracForWeek(cyclePos.w));
  }
  longRunKm = Math.min(longRunKm, rWhole(peakLongKm));
  return { phase, weeklyKm, longRunKm };
}

export function buildInitialRacePlan(goalId, level, peakKm, peakLongKm, weeksToRace, paces, opts) {
  const v2 = opts && Number(opts.motor) >= 2;
  const { phase, weeklyKm, longRunKm } = computeBaselineWeek(goalId, level, peakKm, peakLongKm, weeksToRace, opts && Number(opts.motor) >= 2 ? { ...opts, paces } : opts);
  const taperWeeks = getTaperWeeks(goalId);
  const cyclePos = getCyclePosition(weeksToRace, taperWeeks);
  const qp = v2
    ? suggestQualityPacesV2(goalId, phase, weeksToRace, taperWeeks, cyclePos, level, opts.planWeek ?? 1)
    : suggestQualityPaces(goalId, phase, weeksToRace, taperWeeks, cyclePos, level);
  let plan = buildRacePlan(goalId, phase, level, weeklyKm, longRunKm, qp.q1, qp.q2, paces, weeksToRace, taperWeeks, opts);
  if (qp.q1Dist || qp.q2Dist) {
    plan = plan.map((d) => {
      if (d.slot === "q1" && qp.q1Dist) { const next = { ...d, distOverride: qp.q1Dist, repsOverride: qp.q1Reps || undefined }; return { ...next, km: computeImpliedKm(next) }; }
      if (d.slot === "q2" && qp.q2Dist && qp.q2 === "brokenT") { const next = { ...d, distOverride: qp.q2Dist, brokenTRefMin: qp.q2RefMin, recoveryOverride: qp.q2Reps, ...(qp.q2BrokenReps ? { repsOverride: qp.q2BrokenReps } : {}) }; return { ...next, km: computeImpliedKm(next) }; }
      if (d.slot === "q2" && qp.q2Dist && qp.q2 === "I") { const next = { ...d, distOverride: qp.q2Dist, repsOverride: qp.q2Reps || undefined }; return { ...next, km: computeImpliedKm(next) }; }
      if (d.slot === "q2" && qp.q2Dist && esCalidadSuave(qp.q2)) { const next = { ...d, distOverride: qp.q2Dist, repsOverride: qp.q2Reps || undefined, recoveryOverride: qp.q2Rec ?? undefined }; return { ...next, km: computeImpliedKm(next) }; }
      return d;
    });
  }
  if (v2) plan = marcarCalentamientoCorto(plan, !!qp.calentamientoCorto);
  plan = v2
    ? cerrarSemanaV2(plan, weeklyKm, { qualityCapPct: opts.qualityCapPct, phase, peakLongKm })
    : balanceWeeklyVolume(plan, weeklyKm);
  return { phase, weeklyKm, plan };
}

/* ---------------------------------------------------------
   PROPUESTA SEMANAL (el coach confirma antes de aplicar)
--------------------------------------------------------- */
/* Curva de un solo pico real por ciclo: cuenta hacia atrás desde la semana pico
   (situada justo antes del taper) en bloques de 4 (3 de carga + 1 de asimilación).
   Cada bloque anterior parte de una base más baja, así que el pico solo se toca UNA vez. */
export function getCyclePosition(weeksToRace, taperWeeks) {
  const peakWeeksToRace = taperWeeks + 1;
  const pos = weeksToRace - peakWeeksToRace;
  if (pos === 0) return { isPeak: true, isAssimilation: false, w: 3, chunk: 0, label: "Semana pico del ciclo" };
  if (pos < 0) return { isPeak: false, isAssimilation: false, w: 3, chunk: 0, label: "Tapering / semana de carrera" };
  const chunk = Math.floor((pos - 1) / 4);
  const w = 4 - ((pos - 1) % 4);
  const isAssimilation = w === 4;
  return { isPeak: false, isAssimilation, w, chunk, label: isAssimilation ? "Semana de asimilación" : `Semana ${w} de 3 de carga` };
}
export function fracForWeek(w) { return { 1: 0.85, 2: 0.925, 3: 1.0, 4: 0.85 }[w] ?? 1; }
// chunk 0 = Específico, 1-2 = Velocidad (decayendo hacia atrás), 3+ = Base: se mantiene en un
// volumen promedio y estable (no tan alto como el pico, pero sin seguir bajando indefinidamente).
export function chunkBaselineFactor(chunk) { return chunk >= 3 ? 0.72 : Math.max(0.45, 0.95 - 0.15 * chunk); }

// opts.treatAsLived: la semana que se cierra YA fue vivida por el alumno aunque no la haya
// enviado. Lo usa la publicación automática, que corre justo cuando la semana terminó: ahí
// corresponde adaptar el volumen con la adherencia REAL, no darla por cumplida al 100%.
export function buildWeekProposal(student, opts) {
  const week = student.weeks[student.currentWeek];
  // El coach puede estar cerrando una semana que el alumno aún no confirmó/envió: eso significa
  // que la está preparando por adelantado, así que no se penaliza el ciclo.
  const preparedAhead = !week.submitted && !opts?.treatAsLived;
  const { adherencePct, avgRpe } = (week.paused || preparedAhead)
    ? { adherencePct: 1, avgRpe: null } // semana pausada, o aún no vivida por el alumno: no penaliza el ciclo
    : computeAdherence(week.plan, week.log);

  let promote = null;
  if (student.level === "principiante" || isFitnessGoal(student.goal)) {
    const next = week.paused ? null : debePasarAPlanDeCarrera(student, adherencePct);
    if (next == null) {
      return { kind: "principiante", adherencePct, avgRpe, wasPaused: !!week.paused, closedWeekNumber: student.currentWeek, closedWeeklyKm: week.weeklyKm, closedPhase: "principiante" };
    }
    // Principiante con carrera que ya cumplió su etapa de acondicionamiento: pasa al plan de
    // carrera como Intermedio 1 (3 días). La base, si queda, arranca desde esta semana.
    promote = {
      level: "intermedio0", planStartWeeksToRace: next, desdePrincipiante: true,
      peakLongKm: peakLongKmFor(student.goal, "intermedio0", student.peakKm),
    };
    student = { ...student, ...promote, weeksToRace: next + 1 };
  }
  const v2 = usaMotor2(student);

  const weeksToRaceToday = weeksBetween(student.raceDate);
  const weeksToRace = student.weeksToRace != null ? Math.max(0, student.weeksToRace - 1) : weeksToRaceToday;
  const phase = getPhase(weeksToRace, student.goal);
  const nextWeekNum = student.currentWeek + 1;
  const taperWeeks = getTaperWeeks(student.goal);
  const cyclePos = getCyclePosition(weeksToRace, taperWeeks);
  const phaseKm = student.peakKm * getPhaseFactor(phase, weeksToRace);

  let baseTarget, cycleNote = "";
  const t2 = v2 ? targetWeekV2(motorCtx(student), weeksToRace) : null;
  const isAssimWeek = t2 ? (t2.isAssimilation || !!t2.soloRodajes) : cyclePos.isAssimilation;
  if (t2) {
    baseTarget = t2.weeklyKm;
    cycleNote = cyclePos.isPeak
      ? " Esta es la semana de mayor carga de todo el ciclo; ninguna otra la iguala o supera."
      : (phase === "base" ? cycleNoteV2(t2) : (phase === "taper" || phase === "race" ? "" : ` ${cyclePos.label}.`));
  } else if (phase === "taper" || phase === "race") {
    baseTarget = phaseKm;
  } else if (cyclePos.isPeak) {
    baseTarget = student.peakKm;
    cycleNote = " Esta es la semana de mayor carga de todo el ciclo; ninguna otra la iguala o supera.";
  } else {
    baseTarget = student.peakKm * chunkBaselineFactor(cyclePos.chunk) * fracForWeek(cyclePos.w);
    cycleNote = ` ${cyclePos.label}.`;
  }

  let suggestedWeeklyKm, note;
  const override = student.volumeOverrides && student.volumeOverrides[nextWeekNum];
  if (override != null) {
    suggestedWeeklyKm = Math.min(override, student.peakKm);
    note = `Fase: ${PHASE_LABEL[phase]}. Volumen definido manualmente por el coach en el panorama (${override} km).`;
  } else if (phase === "taper" || phase === "race" || isAssimWeek || cyclePos.isPeak) {
    suggestedWeeklyKm = t2 ? t2.weeklyKm : Math.min(rWhole(baseTarget), student.peakKm);
    note = `Fase: ${PHASE_LABEL[phase]}.${cycleNote}`;
  } else {
    const adj = adaptWeeklyKm(baseTarget, adherencePct, avgRpe);
    // Motor 2: en la base el volumen ya sube según lo planificado (máx. 8% por semana); la
    // adherencia solo puede bajarlo, no sumarle otro 10%.
    if (t2 && phase === "base" && adj.newKm > baseTarget) {
      adj.newKm = baseTarget;
      adj.note = `Adherencia alta (${Math.round(adherencePct * 100)}%): en la base el volumen sube según lo planificado.`;
    }
    suggestedWeeklyKm = Math.min(rWhole(adj.newKm), student.peakKm);
    // Motor 2: los días del nivel mandan sobre el pico escrito.
    if (t2) {
      const techo = maxWeeklyKmFor(student.goal, student.level, qualityCapPctOf(student)) ?? Infinity;
      const pico = Math.max(Math.min(student.peakKm, techo), minWeeklyKmFor(student.level));
      const margenBase = phase === "base" && llevaVelocidadEnBase(student.goal, student.level) ? MARGEN_CALIDAD_BASE_KM : 0;
      suggestedWeeklyKm = Math.max(minWeeklyKmWithLong(student.level, t2.longRunKm, q3EsCalidad(student.goal, weeksToRace)) + margenBase, t2.minimoSemana || 0, Math.min(rWhole(adj.newKm), pico));
    }
    note = week.paused
      ? `Fase: ${PHASE_LABEL[phase]}.${cycleNote} La semana anterior estuvo pausada (lesión/viaje); se retoma el ciclo con normalidad, sin penalizar el volumen.`
      : `Fase: ${PHASE_LABEL[phase]}.${cycleNote} ${adj.note}`;
  }

  const peakLongKm = student.peakLongKm || capLongRunKm(student.goal, student.level, 999);
  const longOverride = student.longRunOverrides && student.longRunOverrides[nextWeekNum];
  let suggestedLongRunKm;
  if (longOverride != null) {
    suggestedLongRunKm = Math.min(longOverride, peakLongKm);
    note += ` Fondo del domingo definido manualmente por el coach (${longOverride} km).`;
  } else if (t2) {
    suggestedLongRunKm = t2.longRunKm;
  } else if (phase === "taper" || phase === "race") {
    const template = getDayLayoutTemplate(student.goal, phase, student.level, weeksToRace);
    const longSlot = template.find((t) => t.slot === "long");
    suggestedLongRunKm = capLongRunKm(student.goal, student.level, rWhole(suggestedWeeklyKm * (longSlot ? longSlot.pct : 0.4)));
  } else if (cyclePos.isPeak) {
    suggestedLongRunKm = rWhole(peakLongKm);
  } else {
    suggestedLongRunKm = rWhole(peakLongKm * chunkBaselineFactor(cyclePos.chunk) * fracForWeek(cyclePos.w));
  }
  const qp = v2
    ? suggestQualityPacesV2(student.goal, phase, weeksToRace, taperWeeks, cyclePos, student.level, planWeekOf(student, weeksToRace), t2?.soloRodajes)
    : suggestQualityPaces(student.goal, phase, weeksToRace, taperWeeks, cyclePos, student.level);
  if (promote) note = `¡Etapa de acondicionamiento cumplida! Pasa al plan de carrera como ${LEVEL_LABEL.intermedio0} (3 días por semana). ${note}`;
  const nextQOv = (student.qualityOverrides && student.qualityOverrides[nextWeekNum]) || {};
  const finalQ1 = nextQOv.q1Type || qp.q1;
  const finalQ2 = nextQOv.q2Type || qp.q2;
  const finalQ3 = nextQOv.q3Type || qp.q3;
  const q1TypeChanged = nextQOv.q1Type && nextQOv.q1Type !== qp.q1;
  const q2TypeChanged = nextQOv.q2Type && nextQOv.q2Type !== qp.q2;

  return {
    kind: "race", phase, weeksToRace, suggestedWeeklyKm, suggestedLongRunKm,
    suggestedQ1: finalQ1, suggestedQ2: finalQ2, suggestedQ3: finalQ3,
    q1DistOverride: nextQOv.q1Dist || (q1TypeChanged ? null : qp.q1Dist) || null,
    q1RepsOverride: nextQOv.q1Reps ?? (nextQOv.q1Dist || q1TypeChanged ? null : qp.q1Reps) ?? null,
    q2DistOverride: nextQOv.q2Dist || (q2TypeChanged ? null : qp.q2Dist) || null,
    q2RepsOverride: nextQOv.q2Reps ?? (nextQOv.q2Dist || q2TypeChanged ? null : qp.q2Reps) ?? null,
    q2RefMinOverride: q2TypeChanged ? null : (qp.q2RefMin || null),
    q2BrokenRepsOverride: q2TypeChanged || nextQOv.q2Dist ? null : (qp.q2BrokenReps || null),
    calentamientoCorto: !!qp.calentamientoCorto,
    q2RecOverride: q2TypeChanged || nextQOv.q2Dist ? null : (qp.q2Rec ?? null),
    note, adherencePct, avgRpe, promote,
    closedWeekNumber: student.currentWeek, closedWeeklyKm: week.weeklyKm, closedPhase: week.phase,
  };
}

export function finalizeWeekPlan(student, proposal, confirmed) {
  const currentWeekData = ensureWeekShape(student.weeks[student.currentWeek]);
  const nextWeekNum = student.currentWeek + 1;

  if (proposal.kind === "principiante") {
    const stages = getStageTable(student.goal);
    let nextStage = student.beginnerStage ?? 0;
    let note;
    if (currentWeekData.paused) {
      // Semana pausada (lesión/viaje): el alumno no entrenó, así que se repite la misma etapa.
      // Avanzar aquí sería subirle la carga sin que haya hecho el trabajo previo.
      note = `La semana anterior estuvo pausada (lesión/viaje): se repite la etapa de ${stages[nextStage].label} al retomar.`;
    } else if (proposal.adherencePct >= 0.7) {
      const advanced = Math.min(stages.length - 1, nextStage + 1);
      note = `Adherencia buena (${Math.round(proposal.adherencePct * 100)}%): se avanza a la etapa de ${stages[advanced].label}.`;
      nextStage = advanced;
    } else {
      note = `Adherencia baja (${Math.round(proposal.adherencePct * 100)}%): se mantiene la etapa de ${stages[nextStage].label} para consolidar.`;
    }
    if (nextStage === stages.length - 1 && !currentWeekData.paused) {
      note += isFitnessGoal(student.goal)
        ? " ¡Tu alumno ya completó el plan! Ya puede correr de forma continua sin mayor dificultad."
        : " ¡Tu alumno ya puede correr 5K continuos! Considera cambiar su nivel.";
    }
    const newPlan = buildBeginnerPlan(nextStage, student.goal, student.level, student.trainDays);
    const updated = {
      ...student, currentWeek: nextWeekNum, beginnerStage: nextStage,
      weeks: { ...student.weeks, [student.currentWeek]: { ...currentWeekData, adherencePct: proposal.adherencePct, avgRpe: proposal.avgRpe, submitted: true }, [nextWeekNum]: { weeklyKm: null, phase: "principiante", plan: newPlan, log: emptyLog(), note, submitted: false } },
    };
    return { updated, note };
  }

  if (proposal.kind === "fitness") {
    const weeklyKm = confirmed.weeklyKm;
    const newPlan = buildWeekPlanFitness(weeklyKm, student.level);
    const updated = {
      ...student, currentWeek: nextWeekNum,
      weeks: { ...student.weeks, [student.currentWeek]: { ...currentWeekData, adherencePct: proposal.adherencePct, avgRpe: proposal.avgRpe, submitted: true }, [nextWeekNum]: { weeklyKm, phase: "fitness", plan: newPlan, log: emptyLog(), note: proposal.note, submitted: false } },
    };
    return { updated, note: proposal.note };
  }

  const phase = proposal.phase;
  const weeklyKm = confirmed.weeklyKm;
  const taperWeeks = getTaperWeeks(student.goal);
  const promoted = proposal.promote ? { ...student, ...proposal.promote } : student;
  const v2 = usaMotor2(promoted);
  const motorOpts = v2 ? { motor: 2, qualityCapPct: qualityCapPctOf(promoted) } : undefined;
  let plan = buildRacePlan(student.goal, phase, promoted.level, weeklyKm, confirmed.longRunKm, confirmed.q1PaceKey, confirmed.q2PaceKey, student.paces || {}, proposal.weeksToRace, taperWeeks, motorOpts);
  if (proposal.q1DistOverride || proposal.q2DistOverride || proposal.suggestedQ3) {
    plan = plan.map((d) => {
      if (d.slot === "q1" && proposal.q1DistOverride) { const next = { ...d, distOverride: proposal.q1DistOverride, repsOverride: proposal.q1RepsOverride || undefined }; return { ...next, km: computeImpliedKm(next) }; }
      if (d.slot === "q2" && proposal.q2DistOverride && proposal.suggestedQ2 === "brokenT") { const next = { ...d, distOverride: proposal.q2DistOverride, brokenTRefMin: proposal.q2RefMinOverride, recoveryOverride: proposal.q2RepsOverride, ...(proposal.q2BrokenRepsOverride ? { repsOverride: proposal.q2BrokenRepsOverride } : {}) }; return { ...next, km: computeImpliedKm(next) }; }
      if (d.slot === "q2" && proposal.q2DistOverride) { const next = { ...d, distOverride: proposal.q2DistOverride, repsOverride: proposal.q2RepsOverride || undefined, ...(proposal.q2RecOverride != null ? { recoveryOverride: proposal.q2RecOverride } : {}) }; return { ...next, km: computeImpliedKm(next) }; }
      if (d.slot === "q3" && proposal.suggestedQ3) {
        return proposal.suggestedQ3 === "broken"
          ? { ...d, paceKey: "broken", runWalk: false, type: getDefaultTitle("broken", false, false) }
          : { ...d, paceKey: "E", runWalk: true, type: getDefaultTitle("E", false, true) };
      }
      return d;
    });
  }
  if (v2) plan = marcarCalentamientoCorto(plan, !!proposal.calentamientoCorto);
  plan = v2
    ? cerrarSemanaV2(plan, weeklyKm, { qualityCapPct: motorOpts.qualityCapPct, phase, peakLongKm: promoted.peakLongKm })
    : balanceWeeklyVolume(plan, weeklyKm);
  const updated = {
    ...promoted, currentWeek: nextWeekNum, weeksToRace: proposal.weeksToRace,
    weeks: { ...student.weeks, [student.currentWeek]: { ...currentWeekData, adherencePct: proposal.adherencePct, avgRpe: proposal.avgRpe, submitted: true }, [nextWeekNum]: { weeklyKm, phase, plan, log: emptyLog(), note: proposal.note, submitted: false } },
  };
  return { updated, note: proposal.note };
}

/* ---------------------------------------------------------
   PUBLICACIÓN AUTOMÁTICA DE LA SEMANA
   Si el coach no llegó a confirmar la semana, la app la publica sola. El objetivo es que
   NUNCA pueda pasar que un alumno entre un lunes y no tenga plan.
   Esta función es pura: decide y devuelve el alumno actualizado, sin guardar nada. Quien la
   llama (el servidor, al leer el registro del alumno, o la tarea del lunes) se encarga de
   persistirlo. Es idempotente: llamarla dos veces no publica dos semanas.
--------------------------------------------------------- */
export const AUTO_PUBLISH_LABEL = "Publicada automáticamente";

export function autoPublishDueWeek(student, today) {
  const noop = (reason) => ({ updated: student, published: null, kind: null, note: null, closedWeekNumber: null, reason });
  if (!student || !student.weeks || typeof student.weeks !== "object") return noop("sin-datos");
  const weekNums = Object.keys(student.weeks).map(Number).filter((n) => Number.isFinite(n) && n >= 1);
  if (!weekNums.length) return noop("sin-semanas");

  const due = getTodayWeekNum(student, today);
  // Si la semana de calendario de hoy ya existe, no hay nada que hacer: el alumno tiene plan.
  // Da igual en qué estado esté — abierta, enviada o pausada: en los tres casos lo ve.
  if (student.weeks[due]) return noop("ya-existe");

  const furthest = Math.max(...weekNums);
  // Solo se publica hacia adelante. Un hueco en medio del historial no se rellena solo.
  if (due <= furthest) return noop("hueco-interno");

  const last = ensureWeekShape(student.weeks[furthest]);
  const hasRealPlan = (w) => Array.isArray(w?.plan) && w.plan.some((d) => d?.paceKey);
  const gap = due - furthest - 1;

  // Caso A — hubo semanas sin plan, o la última quedó marcada como "sin actividad".
  // Después de una ausencia NO se avanza el ciclo: retomar la progresión es decisión del
  // coach (tiene la opción de "volver a una semana previa"). Se repite la última estructura
  // real para que el alumno tenga algo que entrenar, y se avisa para que el coach lo revise.
  if (gap > 0 || last?.inactive || !hasRealPlan(last)) {
    let sourceNum = null;
    for (let n = furthest; n >= 1; n--) {
      if (hasRealPlan(student.weeks[n]) && !student.weeks[n]?.inactive) { sourceNum = n; break; }
    }
    if (sourceNum == null) return noop("sin-base");
    const source = ensureWeekShape(student.weeks[sourceNum]);
    const weeksWithGap = gap > 0 ? markInactiveWeeks(student, furthest + 1, due) : { ...student.weeks };
    const note = gap > 0
      ? `${AUTO_PUBLISH_LABEL}: hubo ${gap} ${gap === 1 ? "semana" : "semanas"} sin plan, así que se repite la estructura de la semana ${sourceNum} sin avanzar el ciclo. Revisa si corresponde retomar en otra etapa.`
      : `${AUTO_PUBLISH_LABEL}: se repite la estructura de la semana ${sourceNum} sin avanzar el ciclo, porque la semana anterior quedó sin actividad registrada. Revisa si corresponde retomar en otra etapa.`;
    const weeks = {
      ...weeksWithGap,
      [due]: {
        weeklyKm: source.weeklyKm ?? null,
        phase: source.phase ?? "base",
        plan: source.plan.map((d) => ({ ...d })),
        log: emptyLog(),
        note,
        submitted: false,
        autoPublished: true,
        autoPublishedKind: "repetida",
        autoPublishedFromWeek: sourceNum,
      },
    };
    return {
      updated: { ...student, weeks, currentWeek: due },
      published: due, kind: "repetida", note, closedWeekNumber: furthest, reason: "publicada",
    };
  }

  // Caso B — el caso normal: la semana siguiente en secuencia. Se publica exactamente la
  // sugerencia del sistema (el mismo volumen, fondo y calidad que le propondría el panel al
  // coach), marcada para que la revise.
  const basis = { ...student, currentWeek: furthest, weeksToRace: shiftWeeksToRace(student, furthest) };
  let proposal, finalized;
  try {
    proposal = buildWeekProposal(basis, { treatAsLived: true });
    finalized = finalizeWeekPlan(basis, proposal, {
      weeklyKm: proposal.suggestedWeeklyKm,
      longRunKm: proposal.suggestedLongRunKm,
      q1PaceKey: proposal.suggestedQ1,
      q2PaceKey: proposal.suggestedQ2,
    });
  } catch (e) {
    return noop("error:" + (e?.message || "desconocido"));
  }
  if (!finalized?.updated?.weeks?.[due]) return noop("sin-resultado");

  const patched = applyIntermediateRaceDayPatch(finalized.updated);
  const note = `${AUTO_PUBLISH_LABEL}. ${finalized.note || ""}`.trim();
  const updated = {
    ...patched,
    weeks: {
      ...patched.weeks,
      [due]: { ...patched.weeks[due], note, autoPublished: true, autoPublishedKind: "propuesta" },
    },
  };
  return {
    updated, published: due, kind: "propuesta", note, closedWeekNumber: furthest, reason: "publicada",
    adherencePct: proposal.adherencePct, avgRpe: proposal.avgRpe,
    closedWeeklyKm: proposal.closedWeeklyKm, closedPhase: proposal.closedPhase,
  };
}

// student.weeksToRace guarda las semanas que faltan para la carrera MEDIDAS EN LA SEMANA
// ACTUAL del alumno. Si se va a cerrar una semana distinta (porque el coach había dejado
// alguna preparada por adelantado), hay que correr ese contador la misma cantidad de semanas,
// o el plan nuevo saldría con la fase equivocada.
export function shiftWeeksToRace(student, closingWeekNum) {
  if (student.weeksToRace == null) return student.weeksToRace;
  const shift = (closingWeekNum ?? student.currentWeek) - (student.currentWeek ?? closingWeekNum);
  if (!Number.isFinite(shift) || shift === 0) return student.weeksToRace;
  return Math.max(0, student.weeksToRace - shift);
}

/* Panorama: proyección de volumen Y estructura semanal hasta la carrera (editable por el coach) */
export function estimateQualitySession(paceKey, phase, level, paces, qualityKm, forcedDist, forcedReps) {
  if (!paceKey) return null;
  if (paceKey === "E") return `Run/Walk (~${qualityKm} km)`;
  if (paceKey === "broken") return "Pre-carga · series largas";
  if (paceKey === "combo1k500") return "3 x (1k + 500m) · 1k+500";
  if (paceKey === "brokenT") return "3 x umbral fraccionado (ver detalle en la semana)";
  if (paceKey === "fartlek") return `Fartlek · ${forcedReps || FARTLEK_DEFAULT.reps} x ${forcedDist || FARTLEK_DEFAULT.workMin}'`;
  if (paceKey === "hills") return `Cuestas · ${forcedReps || HILLS_DEFAULT.reps} x ${fmtSeg(forcedDist || HILLS_DEFAULT.workSec)}`;
  if (paceKey === "M" || paceKey === "race") return `Ritmo objetivo (~${qualityKm} km)`;
  const easyP = paces?.E ?? 5;
  const pool = Math.max(1, qualityKm - 5);
  if (paceKey === "T") {
    const block = forcedDist || (() => {
      let b = T_DURATIONS[0], bestDiff = Infinity;
      for (const t of T_DURATIONS) {
        const p = getTPaceForDuration(paces?.HM, paces?.M, t);
        const impliedKm = p ? t / p : t / 3.5;
        const diff = Math.abs(impliedKm - pool);
        if (diff < bestDiff) { bestDiff = diff; b = t; }
      }
      return b;
    })();
    return `Umbral continuo · ${block}'`;
  }
  if (paceKey === "I") {
    if (forcedDist) {
      const recoveryKmFn = (dd) => r1(getIRecoveryMin(dd, easyP) / easyP);
      const reps = forcedReps || pickRepScheme(pool, [forcedDist], 2, 8, recoveryKmFn).reps;
      return `Intervalos · ${reps} x ${formatDist(forcedDist)}`;
    }
    const distances = I_DIST_BY_PHASE[phase] || [1];
    const recoveryKmFn = (dd) => r1(getIRecoveryMin(dd, easyP) / easyP);
    const picked = pickRepScheme(pool, distances, 2, 8, recoveryKmFn);
    return `Intervalos · ${picked.reps} x ${formatDist(picked.d)}`;
  }
  if (paceKey === "R") {
    if (forcedDist) {
      const recoveryKmFn = (dd) => r1((R_RECOVERY_MIN[dd] ?? 2) / easyP);
      const reps = forcedReps || pickRepScheme(pool, [forcedDist], 6, 12, recoveryKmFn).reps;
      return `Series · ${reps} x ${formatDist(forcedDist)}`;
    }
    const distances = R_DIST_BY_PHASE[phase] || [0.2, 0.4];
    const recoveryKmFn = (dd) => r1((R_RECOVERY_MIN[dd] ?? 2) / easyP);
    const picked = pickRepScheme(pool, distances, 6, 12, recoveryKmFn);
    return `Series · ${picked.reps} x ${formatDist(picked.d)}`;
  }
  return null;
}

export function projectWeeklyVolumes(student) {
  if (student.level === "principiante" || isFitnessGoal(student.goal)) {
    const stages = getStageTable(student.goal);
    const currentStage = student.beginnerStage ?? 0;
    const rows = stages.map((s, i) => {
      const mainMin = s.walk > 0 ? s.reps * s.run + (s.reps - 1) * s.walk : s.reps * s.run;
      return {
        weekNum: student.currentWeek + (i - currentStage), label: s.label, run: s.run, walk: s.walk, reps: s.reps,
        totalMin: BEGINNER_WARMUP_MIN + mainMin + BEGINNER_COOLDOWN_MIN, isCurrent: i === currentStage,
      };
    });
    return { kind: "beginner", rows };
  }
  if (!student.raceDate) {
    const w = student.weeks[student.currentWeek];
    return { kind: "flat", rows: [], weeklyKm: w ? w.weeklyKm : student.peakKm };
  }
  const weeksToRaceNow = student.weeksToRace != null ? student.weeksToRace : weeksBetween(student.raceDate);
  const taperWeeks = getTaperWeeks(student.goal);
  const peakLongKm = student.peakLongKm || capLongRunKm(student.goal, student.level, 999);
  const rows = [];
  const floor = Math.max(0, weeksToRaceNow - 26);
  for (let k = weeksToRaceNow; k >= floor; k--) {
    const weekNum = student.currentWeek + (weeksToRaceNow - k);
    const phase = getPhase(k, student.goal);
    const cyclePos = getCyclePosition(k, taperWeeks);
    let defaultKm, defaultLongKm, isRecoveryRow = cyclePos.isAssimilation;
    if (usaMotor2(student)) {
      const t = targetWeekV2(motorCtx(student), k);
      defaultKm = t.weeklyKm; defaultLongKm = t.longRunKm; isRecoveryRow = t.isAssimilation;
    } else if (phase === "taper" || phase === "race") {
      defaultKm = rWhole(student.peakKm * getPhaseFactor(phase, k));
      const template = getDayLayoutTemplate(student.goal, phase, student.level, k);
      const longSlot = template.find((t) => t.slot === "long");
      defaultLongKm = capLongRunKm(student.goal, student.level, rWhole(defaultKm * (longSlot ? longSlot.pct : 0.4)));
    } else if (cyclePos.isPeak) {
      defaultKm = rWhole(student.peakKm);
      defaultLongKm = rWhole(peakLongKm);
    } else {
      const f = chunkBaselineFactor(cyclePos.chunk) * fracForWeek(cyclePos.w);
      defaultKm = rWhole(student.peakKm * f);
      defaultLongKm = rWhole(peakLongKm * f);
    }
    if (!usaMotor2(student)) {
      defaultKm = Math.min(defaultKm, rWhole(student.peakKm));
      defaultLongKm = Math.min(defaultLongKm, rWhole(peakLongKm));
    }
    const override = student.volumeOverrides && student.volumeOverrides[weekNum];
    const longOverride = student.longRunOverrides && student.longRunOverrides[weekNum];
    const qp = usaMotor2(student)
      ? suggestQualityPacesV2(student.goal, phase, k, taperWeeks, cyclePos, student.level, planWeekOf(student, k), targetWeekV2(motorCtx(student), k).soloRodajes)
      : suggestQualityPaces(student.goal, phase, k, taperWeeks, cyclePos, student.level);
    const finalKm = override != null ? override : defaultKm;
    const qOv = (student.qualityOverrides && student.qualityOverrides[weekNum]) || {};
    const q1Type = qOv.q1Type || qp.q1;
    const q2Type = qOv.q2Type || qp.q2;
    const q3Type = qOv.q3Type || qp.q3;
    const q1Km = qualityKmFor(q1Type, student.level, finalKm) ?? Math.round(finalKm * 0.15);
    const q2Km = qualityKmFor(q2Type, student.level, finalKm) ?? Math.round(finalKm * 0.15);
    const q3Km = qualityKmFor(q3Type, student.level, finalKm) ?? Math.round(finalKm * 0.12);
    const q2DistDefault = qOv.q2Dist ?? qp.q2Dist;
    const q1DistDefault = qOv.q1Dist ?? qp.q1Dist;
    const q1RepsDefault = qOv.q1Reps ?? (qOv.q1Dist ? null : qp.q1Reps);
    const q2RepsDefault = qOv.q2Reps ?? (qOv.q2Dist ? null : qp.q2Reps);
    rows.push({
      weekNum, weeksToRace: k, phase, isRecovery: isRecoveryRow, isPeak: cyclePos.isPeak,
      km: finalKm, isOverridden: override != null,
      longKm: longOverride != null ? longOverride : defaultLongKm, isLongOverridden: longOverride != null,
      q1: qp.q1, q2: qp.q2, q3: qp.q3,
      q1Type, q2Type, q3Type, q1Dist: q1DistDefault ?? null, q2Dist: q2DistDefault ?? null,
      q1Reps: q1RepsDefault ?? null, q2Reps: q2RepsDefault ?? null,
      q1Detail: estimateQualitySession(q1Type, phase, student.level, student.paces, q1Km, q1DistDefault, q1RepsDefault),
      q2Detail: estimateQualitySession(q2Type, phase, student.level, student.paces, q2Km, q2DistDefault, q2RepsDefault),
      q3Detail: estimateQualitySession(q3Type, phase, student.level, student.paces, q3Km),
    });
  }
  return { kind: "race", rows };
}

export function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
export function genSalt() {
  const arr = new Uint8Array(8);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* ---------------------------------------------------------
   AJUSTE AUTOMÁTICO DE RITMO
   Detecta cuando una sesión de calidad viene 10-15+ seg/km más lenta
   que el ritmo objetivo, y tras 2 fallos consecutivos sugiere un ajuste.
--------------------------------------------------------- */
export const PACE_FAIL_THRESHOLD_MIN = 10 / 60; // 10 segundos/km
export function getQualityDayLog(week, slotName) {
  const idx = week.plan.findIndex((d) => d.slot === slotName);
  if (idx < 0) return null;
  return { day: week.plan[idx], log: week.log[idx], index: idx };
}
export function evaluateQualityFail(day, log) {
  if (!day || !day.targetPace) return null;
  const actual = parsePaceToDecimal(log?.actualPaceStr);
  if (actual == null) return null;
  const diffMin = actual - day.targetPace;
  return diffMin >= PACE_FAIL_THRESHOLD_MIN;
}
export function evaluateQualityAdjustment(student, closedWeek) {
  const q1Info = getQualityDayLog(closedWeek, "q1");
  const q2Info = getQualityDayLog(closedWeek, "q2");
  const q1Fail = q1Info ? evaluateQualityFail(q1Info.day, q1Info.log) : null;
  const q2Fail = q2Info ? evaluateQualityFail(q2Info.day, q2Info.log) : null;

  const prev = student.qualityStreaks || { q1: 0, q2: 0 };
  let q1Streak = q1Fail === true ? prev.q1 + 1 : q1Fail === false ? 0 : prev.q1;
  let q2Streak = q2Fail === true ? prev.q2 + 1 : q2Fail === false ? 0 : prev.q2;

  let trigger = null;
  if (q1Fail === true && q2Fail === true) {
    trigger = "general";
    q1Streak = 0; q2Streak = 0;
  } else if (q1Streak >= 2) {
    trigger = "q1"; q1Streak = 0;
  } else if (q2Streak >= 2) {
    trigger = "q2"; q2Streak = 0;
  }

  return {
    newStreaks: { q1: q1Streak, q2: q2Streak },
    trigger,
    q1PaceKey: q1Info?.day?.paceKey || null,
    q2PaceKey: q2Info?.day?.paceKey || null,
    q1Note: q1Info?.log?.note || "",
    q2Note: q2Info?.log?.note || "",
    q1ActualPace: q1Info?.log?.actualPaceStr || "",
    q2ActualPace: q2Info?.log?.actualPaceStr || "",
    q1TargetPace: q1Info?.day?.targetPace ?? null,
    q2TargetPace: q2Info?.day?.targetPace ?? null,
  };
}
export function applyPaceAdjustment(paces, trigger, q1PaceKey, q2PaceKey, goalId) {
  const newPaces = { ...paces };
  const bump = 7.5 / 60; // ajuste conservador: ~7.5" (rango 5-10")
  const bumpKey = (key) => {
    if (key === "T") { if (newPaces.HM != null) newPaces.HM = newPaces.HM + bump; }
    else if (newPaces[key] != null) newPaces[key] = newPaces[key] + bump;
  };
  if (trigger === "q1") {
    bumpKey(q1PaceKey);
  } else if (trigger === "q2") {
    bumpKey(q2PaceKey);
  } else if (trigger === "general" && newPaces.M != null) {
    const generalBump = 9 / 60;
    ["M", "HM", "E", "long", "T", "I", "R"].forEach((k) => { if (newPaces[k] != null) newPaces[k] = newPaces[k] + generalBump; });
    if (goalId === "42k" && newPaces.race != null) newPaces.race = newPaces.race + generalBump;
  }
  return newPaces;
}

export const INTERMEDIATE_RACE_LABEL = { "10k": "10K", "21k": "MEDIA MARATÓN", "42k": "MARATÓN" };
// Convierte el domingo de la semana de la carrera intermedia en un día de carrera real —
// distancia exacta y sin la estructura de fondo progresivo (calentamiento + bloque + cierre),
// en vez de solo cambiarle el kilometraje al fondo normal.
export function applyIntermediateRaceDayPatch(student) {
  const ir = student.intermediateRace;
  if (!ir || student.currentWeek !== ir.raceWeekNum) return student;
  const week = student.weeks[student.currentWeek];
  if (!week) return student;
  const sundayIdx = week.plan.findIndex((d) => d.day === "Dom");
  if (sundayIdx < 0) return student;
  const raceKm = DISTANCE_KM[ir.goalId] || 21.0975;
  const patchedDay = {
    ...week.plan[sundayIdx], paceKey: "race", type: INTERMEDIATE_RACE_LABEL[ir.goalId] || "CARRERA", km: raceKm,
    longProgressive: false, targetPace: null,
  };
  const plan = week.plan.map((d, i) => (i === sundayIdx ? patchedDay : d));
  return { ...student, weeks: { ...student.weeks, [student.currentWeek]: { ...week, plan } } };
}
