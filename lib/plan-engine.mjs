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
export const FITNESS_GOAL_LEVELS = ["principiante", "intermedio1"];
export const LEVELS = [
  { id: "principiante", label: "Principiante", days: 3 },
  { id: "intermedio1", label: "Intermedio 1", days: 4 },
  { id: "intermedio2", label: "Intermedio 2", days: 5 },
  { id: "avanzado1", label: "Avanzado 1", days: 6 },
  { id: "avanzado2", label: "Avanzado 2", days: 7 },
];
export const GOAL_LABEL = { ...Object.fromEntries(GOALS.map((g) => [g.id, g.label])), fitness12: "Fitness (12 sem., plan anterior)", fitness16: "Fitness (16 sem., plan anterior)" };
export const LEVEL_LABEL = Object.fromEntries(LEVELS.map((l) => [l.id, l.label]));
export const TRAIN_DAYS_BY_LEVEL = Object.fromEntries(LEVELS.map((l) => [l.id, l.days]));
export const DISTANCE_KM = { "5k": 5, "10k": 10, "21k": 21.0975, "42k": 42.195 };

export const FITNESS_BASE_KM = { principiante: 12, intermedio1: 15, intermedio2: 18, avanzado1: 22, avanzado2: 26 };
export const LEVEL_CEILING = { principiante: 0.45, intermedio1: 0.62, intermedio2: 0.78, avanzado1: 0.9, avanzado2: 1.0 };
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

export const PACE_KEY_LABEL = { E: "Ritmo suave", M: "Ritmo maratón", T: "Ritmo umbral", I: "Ritmo intervalos", R: "Ritmo de series", race: "Ritmo objetivo", long: "Fondo progresivo", broken: "Pre-carga (series largas)", combo1k500: "1k + 500", custom: "Otro (personalizado)", brokenT: "Umbral fraccionado" };
export const ZONE_BY_PACEKEY = { E: "easy", M: "moderate", T: "hard", I: "hard", R: "hard", race: "moderate", long: "moderate", broken: "hard", combo1k500: "hard", custom: "hard", brokenT: "hard" };
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
];
export const OTRO_SUBKEYS = OTRO_TEMPLATES.map((t) => t.key);
export function displayPaceKey(paceKey) {
  if (paceKey === "brokenT") return "T";
  if (OTRO_SUBKEYS.includes(paceKey)) return "custom";
  return paceKey;
}
export const QUALITY_KM_DEFAULT = { T: 10, I: 11, R: 10, M: 10, race: 9, broken: 11, combo1k500: 12.5, brokenT: 10 };
export const QUALITY_LEVEL_SCALE = { principiante: 0.6, intermedio1: 0.8, intermedio2: 1.0, avanzado1: 1.15, avanzado2: 1.3 };
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
  const furthest = Math.max(1, ...Object.keys(student.weeks).map(Number));
  let firstOpen = furthest;
  for (let n = 1; n <= furthest; n++) {
    if (!student.weeks[n]?.submitted) { firstOpen = n; break; }
  }
  // No se adelanta al calendario: si el coach ya dejó lista la próxima semana, esa recién
  // pasa a ser la semana activa cuando llega su lunes (a las 00:00 de la hora local del
  // alumno, sea donde sea que esté). Hasta entonces sigue viéndose la semana en curso.
  // Si el alumno viene atrasado, se respeta su semana pendiente: el mínimo se encarga.
  return Math.min(firstOpen, Math.max(1, getTodayWeekNum(student, today)));
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
export const LONG_RUN_LEVEL_BONUS = { principiante: 0, intermedio1: 0, intermedio2: 0, avanzado1: 1, avanzado2: 2 };
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
  const isIntermedio = level === "intermedio1" || level === "intermedio2";
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
export const R_DISTANCES = [0.2, 0.4, 0.6, 0.8]; // 200, 400, 600, 800 m
export const R_RECOVERY_MIN = { 0.2: 1, 0.4: 2, 0.6: 3, 0.8: 4 }; // recuperación: 200m=1', 400m=2', 600m=3', 800m=4'
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
export function buildLiveSegments(day, easyP) {
  const ep = easyP || 5;
  const segs = [];
  if (!day.paceKey || day.paceKey === "") return segs;

  let warmKm, coolKm;
  if ((day.km || 0) <= 5.5) { warmKm = r1((day.km || 0) * 0.4); coolKm = r1((day.km || 0) * 0.3); }
  else { warmKm = 3; coolKm = 2; }

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
    for (let s = 1; s <= 3; s++) {
      segs.push({ label: `Stride ${s} de 3`, type: "time", target: 20 / 60, pace: null });
      segs.push({ label: "Caminata", type: "time", target: 1, pace: null });
    }
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
    segs.push({ label: "Warm-up", type: "distance", target: 3, pace: day.easyPace });
    for (let r = 1; r <= reps; r++) {
      segs.push({ label: `Bloque ${r} de ${reps}`, type: "time", target: workMin, pace });
      if (r < reps) segs.push({ label: "Recuperación", type: "time", target: recoveryMin, pace: null });
    }
    segs.push({ label: "Cool-down", type: "distance", target: 2, pace: day.easyPace });
    return segs;
  }

  if (day.paceKey === "I" || day.paceKey === "R") {
    const isI = day.paceKey === "I";
    const d = day.distOverride || (isI ? 1 : 0.2);
    const reps = day.repsOverride || (isI ? 6 : 8);
    const pace = day.paceOverride || (isI ? getIPace(day.hmPace, day.marathonPace, d) : getRPace(day.targetPace, day.hmPace, d));
    const recoveryMin = day.recoveryOverride ?? (isI ? getIRecoveryMin(d, ep) : (R_RECOVERY_MIN[d] ?? 2));
    const recoveryKm = r1(ep ? recoveryMin / ep : recoveryMin / 5);
    segs.push({ label: "Warm-up", type: "distance", target: warmKm, pace: day.easyPace });
    for (let r = 1; r <= reps; r++) {
      segs.push({ label: `Repetición ${r} de ${reps}`, type: "distance", target: d, pace });
      if (r < reps) segs.push({ label: "Recuperación", type: "distance", target: recoveryKm, pace: day.easyPace });
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
      return [
        { label: "Run/Walk", text: `Trote ${blockMin}' + caminata ${walkMin}', x${reps} (acumulado ~${accumulatedMin} min)${easyStr}.`, color: COLORS.moderate },
        { label: "Strides", text: `3 strides de 20" rápidos + 1' caminando entre cada uno.`, color: COLORS.hard },
      ];
    }
    return [{ label: "Continuo suave", text: `Continuo muy suave, a ritmo conversacional${easyStr}.`, color: COLORS.easy }];
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
  if (km <= 5.5) { warm = r1(km * 0.4); cool = r1(km * 0.3); main = r1(km - warm - cool); }
  else { warm = 3; cool = 2; main = r1(km - 5); }
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
    const recoveryKm = r1(recoveryMin / (easyP || 4.5));
    return [
      { label: "Warm-up", text: `${warm} km suave${easyStr}`, color: COLORS.easy },
      { label: "Bloque principal", text: `${reps} x ${formatDist(d)} a ritmo de velocidad (${formatPace(adjPace)}/km)`, color: COLORS.hard },
      { label: "Recuperación", text: `trote/caminata ${formatPace(recoveryMin)} min entre repeticiones${easyStr} (≈${recoveryKm} km incluidos en el total)`, color: COLORS.rest },
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
  if (day.paceKey === "brokenT") {
    const workMin = day.distOverride || 8;
    const refMin = day.brokenTRefMin || 25;
    const recoveryMin = day.recoveryOverride ?? 3;
    const pace = day.paceOverride || getTPaceForDuration(day.hmPace, day.marathonPace, refMin);
    return [
      { label: "Warm-up", text: `3 km suave${easyStr}`, color: COLORS.easy },
      { label: "Bloque principal", text: `3 x ${workMin}' al ritmo del umbral de ${refMin}' (${formatPace(pace)}/km)`, color: COLORS.hard },
      { label: "Recuperación", text: `${recoveryMin}' trote entre pasadas${easyStr}`, color: COLORS.rest },
      { label: "Cool-down", text: `2 km suave${easyStr}`, color: COLORS.easy },
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
  const easyP = day.easyPace ?? 5;
  const warm = 3, cool = 2;
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
    const mainKm = pace ? (3 * workMin) / pace : 6;
    const recoveryKm = easyP ? (2 * recoveryMin) / easyP : 0;
    return r1(3 + mainKm + recoveryKm + 2);
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
export function getSessionBars(day) {
  if (!day.paceKey || day.type === "Día de la carrera") {
    if (day.type === "Día de la carrera") return [{ durationMin: 60, pace: day.targetPace || 5, colorKind: "hard", label: "Carrera" }];
    return null;
  }
  const km = day.km;
  const easyP = day.easyPace ?? 5;

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
      bars.push({ durationMin: 1, pace: STRIDE_PACE, colorKind: "hard", label: "Strides" });
      return bars;
    }
    return [{ durationMin: day.targetPace ? Math.round(km * day.targetPace) : Math.round(km * 6), pace: day.targetPace || easyP, colorKind: "easy", label: "Continuo suave" }];
  }

  if (!day.targetPace && !day.marathonPace) return null;
  const warm = Math.min(3, r1(km * 0.2)) || 2;
  const cool = Math.min(2, r1(km * 0.15)) || 1.5;
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
    const bars = [{ durationMin: 3 * easyP, pace: easyP, colorKind: "easy", label: "Warm-up" }];
    for (let i = 0; i < 3; i++) {
      bars.push({ durationMin: workMin, pace, colorKind: "hard", label: `${workMin}'` });
      if (i < 2) bars.push({ durationMin: recoveryMin, pace: easyP, colorKind: "recovery", label: "Recuperación" });
    }
    bars.push({ durationMin: 2 * easyP, pace: easyP, colorKind: "easy", label: "Cool-down" });
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
  return null;
}
export function buildRacePlan(goalId, phase, level, weeklyKm, longRunKm, q1PaceKey, q2PaceKey, paces, weeksToRace, taperWeeksParam) {
  const template = getDayLayoutTemplate(goalId, phase, level, weeksToRace);
  const taperWeeks = taperWeeksParam ?? 2;
  const q3PaceKey = suggestQualityPaces(goalId, phase, weeksToRace, taperWeeks, null, level).q3;
  let q1Km = qualityKmFor(q1PaceKey, level, weeklyKm);
  let q2Km = qualityKmFor(q2PaceKey, level, weeklyKm);
  let q3Km = qualityKmFor(q3PaceKey, level, weeklyKm);
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
    const paceForDisplay = paceKey === "long" ? "long" : (paceKey === "broken" ? "T" : (paceKey === "combo1k500" ? "I" : paceKey));
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
    // Recalcula el km real (con descanso incluido) para los tipos que autoseleccionan su
    // estructura — así el total mostrado siempre coincide con el desglose detallado.
    if (["R", "I", "T", "brokenT", "custom", "combo1k500"].includes(paceKey)) {
      dayObj.km = computeImpliedKm(dayObj);
    }
    return dayObj;
  });
  return plan;
}
// Lo que importa es cumplir el volumen semanal total exacto: cualquier diferencia entre lo que
// suman los días individuales y la meta semanal se ajusta en el viernes (el otro día de
// acumulación libre, sin calidad) — o el miércoles si ese nivel no tiene viernes libre. Se debe
// llamar como último paso, después de aplicar cualquier distancia/repetición forzada por la tabla.
export function balanceWeeklyVolume(plan, weeklyKm) {
  if (!weeklyKm) return plan;
  const easyIdxs = plan.map((d, i) => (d.slot === "easy" ? i : -1)).filter((i) => i >= 0);
  const balanceIdx = easyIdxs.length ? easyIdxs[easyIdxs.length - 1] : -1;
  if (balanceIdx < 0) return plan;
  const sumOthers = plan.reduce((s, d, i) => (i === balanceIdx ? s : s + (d.km || 0)), 0);
  const adjustedKm = Math.max(0, r1(weeklyKm - sumOthers));
  const next = [...plan];
  // Si al ajustar la semana no queda presupuesto real para este día, que se convierta en
  // descanso genuino en vez de quedar como una sesión de tipo "Run/Walk"/"Easy" con 0 km.
  next[balanceIdx] = adjustedKm < 1
    ? { ...next[balanceIdx], km: 0, paceKey: "", type: "Descanso", runWalk: false, targetPace: null }
    : { ...next[balanceIdx], km: adjustedKm };
  return next;
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

export function computeBaselineWeek(goalId, level, peakKm, peakLongKm, weeksToRace) {
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

export function buildInitialRacePlan(goalId, level, peakKm, peakLongKm, weeksToRace, paces) {
  const { phase, weeklyKm, longRunKm } = computeBaselineWeek(goalId, level, peakKm, peakLongKm, weeksToRace);
  const taperWeeks = getTaperWeeks(goalId);
  const cyclePos = getCyclePosition(weeksToRace, taperWeeks);
  const qp = suggestQualityPaces(goalId, phase, weeksToRace, taperWeeks, cyclePos, level);
  let plan = buildRacePlan(goalId, phase, level, weeklyKm, longRunKm, qp.q1, qp.q2, paces, weeksToRace, taperWeeks);
  if (qp.q1Dist || qp.q2Dist) {
    plan = plan.map((d) => {
      if (d.slot === "q1" && qp.q1Dist) { const next = { ...d, distOverride: qp.q1Dist, repsOverride: qp.q1Reps || undefined }; return { ...next, km: computeImpliedKm(next) }; }
      if (d.slot === "q2" && qp.q2Dist && qp.q2 === "brokenT") { const next = { ...d, distOverride: qp.q2Dist, brokenTRefMin: qp.q2RefMin, recoveryOverride: qp.q2Reps }; return { ...next, km: computeImpliedKm(next) }; }
      if (d.slot === "q2" && qp.q2Dist && qp.q2 === "I") { const next = { ...d, distOverride: qp.q2Dist, repsOverride: qp.q2Reps || undefined }; return { ...next, km: computeImpliedKm(next) }; }
      return d;
    });
  }
  plan = balanceWeeklyVolume(plan, weeklyKm);
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

  if (student.level === "principiante" || isFitnessGoal(student.goal)) {
    return { kind: "principiante", adherencePct, avgRpe, wasPaused: !!week.paused, closedWeekNumber: student.currentWeek, closedWeeklyKm: week.weeklyKm, closedPhase: "principiante" };
  }

  const weeksToRaceToday = weeksBetween(student.raceDate);
  const weeksToRace = student.weeksToRace != null ? Math.max(0, student.weeksToRace - 1) : weeksToRaceToday;
  const phase = getPhase(weeksToRace, student.goal);
  const nextWeekNum = student.currentWeek + 1;
  const taperWeeks = getTaperWeeks(student.goal);
  const cyclePos = getCyclePosition(weeksToRace, taperWeeks);
  const phaseKm = student.peakKm * getPhaseFactor(phase, weeksToRace);

  let baseTarget, cycleNote = "";
  if (phase === "taper" || phase === "race") {
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
  } else if (phase === "taper" || phase === "race" || cyclePos.isAssimilation || cyclePos.isPeak) {
    suggestedWeeklyKm = Math.min(rWhole(baseTarget), student.peakKm);
    note = `Fase: ${PHASE_LABEL[phase]}.${cycleNote}`;
  } else {
    const adj = adaptWeeklyKm(baseTarget, adherencePct, avgRpe);
    suggestedWeeklyKm = Math.min(rWhole(adj.newKm), student.peakKm);
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
  } else if (phase === "taper" || phase === "race") {
    const template = getDayLayoutTemplate(student.goal, phase, student.level, weeksToRace);
    const longSlot = template.find((t) => t.slot === "long");
    suggestedLongRunKm = capLongRunKm(student.goal, student.level, rWhole(suggestedWeeklyKm * (longSlot ? longSlot.pct : 0.4)));
  } else if (cyclePos.isPeak) {
    suggestedLongRunKm = rWhole(peakLongKm);
  } else {
    suggestedLongRunKm = rWhole(peakLongKm * chunkBaselineFactor(cyclePos.chunk) * fracForWeek(cyclePos.w));
  }
  const qp = suggestQualityPaces(student.goal, phase, weeksToRace, taperWeeks, cyclePos, student.level);
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
    note, adherencePct, avgRpe,
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
  let plan = buildRacePlan(student.goal, phase, student.level, weeklyKm, confirmed.longRunKm, confirmed.q1PaceKey, confirmed.q2PaceKey, student.paces || {}, proposal.weeksToRace, taperWeeks);
  if (proposal.q1DistOverride || proposal.q2DistOverride || proposal.suggestedQ3) {
    plan = plan.map((d) => {
      if (d.slot === "q1" && proposal.q1DistOverride) { const next = { ...d, distOverride: proposal.q1DistOverride, repsOverride: proposal.q1RepsOverride || undefined }; return { ...next, km: computeImpliedKm(next) }; }
      if (d.slot === "q2" && proposal.q2DistOverride && proposal.suggestedQ2 === "brokenT") { const next = { ...d, distOverride: proposal.q2DistOverride, brokenTRefMin: proposal.q2RefMinOverride, recoveryOverride: proposal.q2RepsOverride }; return { ...next, km: computeImpliedKm(next) }; }
      if (d.slot === "q2" && proposal.q2DistOverride) { const next = { ...d, distOverride: proposal.q2DistOverride, repsOverride: proposal.q2RepsOverride || undefined }; return { ...next, km: computeImpliedKm(next) }; }
      if (d.slot === "q3" && proposal.suggestedQ3) {
        return proposal.suggestedQ3 === "broken"
          ? { ...d, paceKey: "broken", runWalk: false, type: getDefaultTitle("broken", false, false) }
          : { ...d, paceKey: "E", runWalk: true, type: getDefaultTitle("E", false, true) };
      }
      return d;
    });
  }
  plan = balanceWeeklyVolume(plan, weeklyKm);
  const updated = {
    ...student, currentWeek: nextWeekNum, weeksToRace: proposal.weeksToRace,
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
      ? `${AUTO_PUBLISH_LABEL}: hubo ${gap} ${gap === 1 ? "semana" : "semanas"} sin plan, así que se repite la estructura de la semana ${sourceNum} sin avanzar el ciclo. Revisá si corresponde retomar en otra etapa.`
      : `${AUTO_PUBLISH_LABEL}: se repite la estructura de la semana ${sourceNum} sin avanzar el ciclo, porque la semana anterior quedó sin actividad registrada. Revisá si corresponde retomar en otra etapa.`;
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
    let defaultKm, defaultLongKm;
    if (phase === "taper" || phase === "race") {
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
    defaultKm = Math.min(defaultKm, rWhole(student.peakKm));
    defaultLongKm = Math.min(defaultLongKm, rWhole(peakLongKm));
    const override = student.volumeOverrides && student.volumeOverrides[weekNum];
    const longOverride = student.longRunOverrides && student.longRunOverrides[weekNum];
    const qp = suggestQualityPaces(student.goal, phase, k, taperWeeks, cyclePos, student.level);
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
      weekNum, weeksToRace: k, phase, isRecovery: cyclePos.isAssimilation, isPeak: cyclePos.isPeak,
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
