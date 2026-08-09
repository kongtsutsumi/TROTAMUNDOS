"use client";
import { safeGet, safeSet, safeDelete, safeGetWithRetry, safeGetPersonal, safeSetPersonal, safeDeletePersonal, authStatus, coachSetup, coachLogin, studentList, studentLogin, logout } from "../lib/storage";
import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Users, User, Plus, ArrowLeft, Check, Flag, TrendingUp, TrendingDown,
  Minus, X, ChevronRight, ChevronLeft, ChevronDown, RotateCw, Activity, Search, AlertCircle, Lock, KeyRound,
  FileText, RefreshCcw, Trash2, BarChart2, Clock, Edit3, Download, QrCode
} from "lucide-react";

/* ---------------------------------------------------------
   TOKENS
--------------------------------------------------------- */
const COLORS = {
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

const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const GOALS = [
  { id: "42k", label: "42K · Maratón" },
  { id: "21k", label: "21K · Media Maratón" },
  { id: "10k", label: "10K" },
  { id: "fitness", label: "Fitness" },
];
// "fitness12"/"fitness16" quedan reconocidos solo por compatibilidad con alumnos ya creados
// antes de unificar ambos programas en uno solo ("fitness", con semana de inicio flexible).
function isFitnessGoal(goalId) { return goalId === "fitness" || goalId === "fitness12" || goalId === "fitness16"; }
const FITNESS_GOAL_LEVELS = ["principiante", "intermedio1"];
const LEVELS = [
  { id: "principiante", label: "Principiante", days: 3 },
  { id: "intermedio1", label: "Intermedio 1", days: 4 },
  { id: "intermedio2", label: "Intermedio 2", days: 5 },
  { id: "avanzado1", label: "Avanzado 1", days: 6 },
  { id: "avanzado2", label: "Avanzado 2", days: 7 },
];
const GOAL_LABEL = { ...Object.fromEntries(GOALS.map((g) => [g.id, g.label])), fitness12: "Fitness (12 sem., plan anterior)", fitness16: "Fitness (16 sem., plan anterior)" };
const LEVEL_LABEL = Object.fromEntries(LEVELS.map((l) => [l.id, l.label]));
const TRAIN_DAYS_BY_LEVEL = Object.fromEntries(LEVELS.map((l) => [l.id, l.days]));
const DISTANCE_KM = { "5k": 5, "10k": 10, "21k": 21.0975, "42k": 42.195 };

const FITNESS_BASE_KM = { principiante: 12, intermedio1: 15, intermedio2: 18, avanzado1: 22, avanzado2: 26 };
const LEVEL_CEILING = { principiante: 0.45, intermedio1: 0.62, intermedio2: 0.78, avanzado1: 0.9, avanzado2: 1.0 };
const GOAL_VOLUME_FACTOR = { "5k": 0.55, "10k": 0.65, "21k": 0.85, "42k": 1.0 };

function peakKmFromVDOT(vdot) {
  let km;
  if (vdot <= 45) km = 40 + (vdot - 30) * 1.0;
  else km = 55 + (vdot - 45) * 5.15;
  return Math.max(35, Math.min(150, km));
}
const PEAK_KM_CAP = { "5k": 65, "10k": 78, "21k": 100, "42k": 130 };
function computePeakKm(goalId, level, vdot) {
  if (goalId === "fitness") return FITNESS_BASE_KM[level] ?? FITNESS_BASE_KM.intermedio2;
  const base = peakKmFromVDOT(vdot) * (GOAL_VOLUME_FACTOR[goalId] ?? 0.8);
  const ceiling = LEVEL_CEILING[level] ?? 0.85;
  const km = Math.min(base * ceiling, PEAK_KM_CAP[goalId] ?? 120);
  return Math.round(km * 2) / 2;
}

const BEGINNER_STAGES = [
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
const BEGINNER_TRAIN_DAYS = [0, 2, 5]; // Lun, Mié, Sáb (principiante, 3x/sem)
const FITNESS_GOAL_TRAIN_DAYS = [1, 2, 4, 6]; // Mar, Mié, Vie, Dom (intermedio1, 4x/sem)
const BEGINNER_WARMUP_MIN = 5, BEGINNER_COOLDOWN_MIN = 5; // caminando, fijo en todas las semanas

const FITNESS16_STAGES = [
  { run: 2, walk: 1, reps: 6, label: "Semana 1" },
  { run: 2, walk: 1, reps: 7, label: "Semana 2" },
  { run: 3, walk: 1, reps: 6, label: "Semana 3" },
  { run: 3, walk: 1, reps: 7, label: "Semana 4" },
  { run: 4, walk: 1, reps: 6, label: "Semana 5" },
  { run: 4, walk: 1, reps: 7, label: "Semana 6" },
  { run: 5, walk: 1, reps: 6, label: "Semana 7" },
  { run: 5, walk: 1, reps: 7, label: "Semana 8" },
  { run: 6, walk: 1, reps: 6, label: "Semana 9" },
  { run: 8, walk: 1, reps: 4, label: "Semana 10" },
  { run: 10, walk: 1, reps: 4, label: "Semana 11" },
  { run: 12, walk: 1, reps: 3, label: "Semana 12" },
  { run: 15, walk: 1, reps: 3, label: "Semana 13" },
  { run: 20, walk: 1, reps: 2, label: "Semana 14" },
  { run: 30, walk: 0, reps: 1, label: "Semana 15 · continuo" },
  { run: 45, walk: 0, reps: 1, label: "Semana 16 · 7K continuo" },
];

// "fitness" (nuevo, unificado): siempre usa la tabla de 16 pasos — es la más gradual y con más
// puntos de entrada. Los alumnos creados antes de unificar el plan siguen usando su tabla original.
function getStageTable(goalId) {
  if (goalId === "fitness16") return FITNESS16_STAGES;
  if (goalId === "fitness12") return BEGINNER_STAGES;
  return FITNESS16_STAGES;
}
// A qué paso de la tabla (0-indexado) corresponde una semana según cuántas semanas falten
// para llegar al objetivo del plan fitness (cuenta regresiva, igual que en los planes de carrera).
function fitnessStageIndexFromWeeksToGoal(weeksToGoal) {
  const stages = FITNESS16_STAGES;
  return Math.max(0, Math.min(stages.length - 1, stages.length - weeksToGoal));
}
function getRunWalkTrainDays(level) { return level === "intermedio1" ? FITNESS_GOAL_TRAIN_DAYS : BEGINNER_TRAIN_DAYS; }

function getDayVariant(stage, posIndex, totalDays) {
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
    // día corto: menos repeticiones, mismo bloque
    return { run: stage.run, walk: stage.walk, reps: Math.max(2, Math.round(stage.reps * 0.7)), tag: "corto" };
  }
  if (posIndex === 1) {
    // día variante: bloques de trote un poco más largos, menos repeticiones (estímulo distinto)
    return { run: stage.run + 1, walk: stage.walk, reps: Math.max(2, Math.round(stage.reps * 0.6)), tag: "variante" };
  }
  // posIndex 2 (viernes en el plan de 4 días): un poco más que el día corto, menos que el principal
  return { run: stage.run, walk: stage.walk, reps: Math.max(2, Math.round(stage.reps * 0.85)), tag: "medio" };
}
const VARIANT_LABEL = { corto: "corto", variante: "variante", medio: "medio", principal: "principal" };

function buildBeginnerPlan(stageIndex, goalId, level, customTrainDays) {
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

const PHASE_LABEL = {
  base: "Base", build: "Velocidad", peak: "Específico",
  taper: "Tapering", race: "Semana de carrera", fitness: "Fitness general", principiante: "Acondicionamiento",
};
const PHASE_FACTOR = { base: 0.72, build: 1.0, peak: 0.92, taper: 0.62, race: 0.4 };
function getPhaseFactor(phase, weeksToRace) {
  if (weeksToRace === 0) return PHASE_FACTOR.race;
  return PHASE_FACTOR[phase] ?? 1;
}

const PACE_KEY_LABEL = { E: "Ritmo suave", M: "Ritmo maratón", T: "Ritmo umbral", I: "Ritmo intervalos", R: "Ritmo de series", race: "Ritmo objetivo", long: "Fondo progresivo", broken: "Pre-carga (series largas)", combo1k500: "1k + 500", custom: "Otro (personalizado)", brokenT: "Umbral fraccionado" };
const ZONE_BY_PACEKEY = { E: "easy", M: "moderate", T: "hard", I: "hard", R: "hard", race: "moderate", long: "moderate", broken: "hard", combo1k500: "hard", custom: "hard", brokenT: "hard" };
const ZONE_COLOR = { rest: COLORS.rest, easy: COLORS.easy, moderate: COLORS.moderate, hard: COLORS.hard };
const PACE_OPTIONS = [
  { key: "", label: "Descanso" }, { key: "E", label: "Suave (E)" }, { key: "M", label: "Maratón (M)" },
  { key: "T", label: "Umbral (T)" }, { key: "I", label: "Intervalos (I)" }, { key: "R", label: "Series (R)" },
  { key: "long", label: "Fondo progresivo" }, { key: "custom", label: "Otro (personalizado)" },
];
// "Umbral (T)" agrupa dos variantes: continuo (T) y fraccionado (brokenT).
const T_VARIANTS = [{ key: "T", label: "Continuo" }, { key: "brokenT", label: "Fraccionado" }];
// "Otro" agrupa plantillas rápidas de estructuras que ya existen, además de bloques en blanco.
const OTRO_TEMPLATES = [
  { key: "custom", label: "En blanco (personalizado)" },
  { key: "race", label: "Ritmo objetivo" },
  { key: "broken", label: "Pre-carga (series largas)" },
  { key: "combo1k500", label: "Intervalos 1k + 500" },
];
const OTRO_SUBKEYS = OTRO_TEMPLATES.map((t) => t.key);
function displayPaceKey(paceKey) {
  if (paceKey === "brokenT") return "T";
  if (OTRO_SUBKEYS.includes(paceKey)) return "custom";
  return paceKey;
}
const QUALITY_KM_DEFAULT = { T: 10, I: 11, R: 10, M: 10, race: 9, broken: 11, combo1k500: 12.5, brokenT: 10 };
const QUALITY_LEVEL_SCALE = { principiante: 0.6, intermedio1: 0.8, intermedio2: 1.0, avanzado1: 1.15, avanzado2: 1.3 };
const QUALITY_KM_CAP = { T: 15, M: 13, race: 13, I: 15, R: 13, broken: 16, combo1k500: 13.5 };
function qualityKmFor(paceKey, level, weeklyKm) {
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
function parsePaceToDecimal(str) {
  if (!str) return null;
  const m = String(str).trim().match(/^(\d+):([0-5]?\d)$/);
  if (!m) return null;
  return parseInt(m[1], 10) + parseInt(m[2], 10) / 60;
}
function parseTimeToMinutes(str) {
  if (!str) return null;
  const parts = String(str).trim().split(":").map(Number);
  if (parts.some((p) => isNaN(p))) return null;
  if (parts.length === 3) return parts[0] * 60 + parts[1] + parts[2] / 60;
  if (parts.length === 2) return parts[0] + parts[1] / 60;
  return null;
}
function formatPace(paceMin) {
  if (paceMin === null || paceMin === undefined || isNaN(paceMin)) return "—";
  const m = Math.floor(paceMin);
  const s = Math.round((paceMin - m) * 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
function paceDiffLabel(actualPaceStr, targetPace) {
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
function computeVDOT(distanceKm, paceMinPerKm) {
  const distanceM = distanceKm * 1000;
  const timeMin = paceMinPerKm * distanceKm;
  const v = distanceM / timeMin;
  const vo2 = -4.6 + 0.182258 * v + 0.000104 * v * v;
  const pctMax = 0.8 + 0.1894393 * Math.exp(-0.012778 * timeMin) + 0.2989558 * Math.exp(-0.1932605 * timeMin);
  return vo2 / pctMax;
}
function velocityForPct(vdot, pct) {
  const targetVO2 = vdot * pct;
  const a = 0.000104, b = 0.182258, c = -(4.6 + targetVO2);
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
}
function computeTrainingPaces(vdot) {
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
function getTPaceForDuration(hmPace, mPace, durationMin) {
  if (hmPace == null || mPace == null) return null;
  const frac = Math.min(1, Math.max(0, (durationMin - 25) / 25));
  return hmPace + (mPace - hmPace) * frac;
}
function deriveAllFromM(mPace) {
  const vdot = computeVDOT(42.195, mPace); // trata M como si fuera un tiempo real de maratón
  return computeTrainingPaces(vdot);
}
function deriveAllFromHM(hmPace) {
  const vdot = computeVDOT(21.0975, hmPace); // trata HM como un tiempo real de 21K
  const m = 1000 / velocityForPct(vdot, 0.84);
  return deriveAllFromM(m);
}
function parseDDMMYYToISO(str) {
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
function formatISOToDDMMYY(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}
function weeksBetween(dateStr) {
  const race = new Date(dateStr + "T00:00:00");
  const today = new Date();
  const diffDays = Math.ceil((race - today) / (1000 * 60 * 60 * 24));
  return Math.max(0, Math.ceil(diffDays / 7));
}
function getDisplayWeekLabel(student, weekNum) {
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
function getWeekTitle(student, weekNum) {
  const label = getDisplayWeekLabel(student, weekNum);
  if (label === 0 && !isFitnessGoal(student.goal) && student.level !== "principiante" && student.raceDate) {
    return student.goal === "21k" || student.goal === "42k" ? "Race Week" : "Semana de carrera";
  }
  return `Semana ${label}`;
}
function mondayOf(d) {
  const dow = d.getDay();
  const diff = (dow + 6) % 7;
  const m = new Date(d);
  m.setDate(d.getDate() - diff);
  m.setHours(0, 0, 0, 0);
  return m;
}
function getWeekDates(student, weekNum) {
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
function getWeekDateRange(student, weekNum) {
  const fmt = (d) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  const { monday, sunday } = getWeekDates(student, weekNum);
  return `${fmt(monday)} - ${fmt(sunday)}`;
}
// Qué número de semana le corresponde al alumno HOY, según la fecha real (sin importar
// cuántas semanas haya preparado el coach por adelantado, ni si aún no llegó a prepararla).
function getTodayWeekNum(student) {
  const planStartMonday = student.planStartMonday ? new Date(student.planStartMonday + "T00:00:00") : mondayOf(new Date());
  const todayMonday = mondayOf(new Date());
  const diffWeeks = Math.round((todayMonday - planStartMonday) / (7 * 24 * 60 * 60 * 1000));
  return Math.max(1, 1 + diffWeeks);
}
// Qué número de semana le corresponde a una fecha cualquiera (no necesariamente hoy) —
// usado para ubicar una carrera intermedia dentro del calendario del alumno.
function getWeekNumForDate(student, dateStr) {
  const planStartMonday = student.planStartMonday ? new Date(student.planStartMonday + "T00:00:00") : mondayOf(new Date());
  const target = new Date(dateStr + "T00:00:00");
  const targetMonday = mondayOf(target);
  const diffWeeks = Math.round((targetMonday - planStartMonday) / (7 * 24 * 60 * 60 * 1000));
  return Math.max(1, 1 + diffWeeks);
}
// Calcula los overrides (volumen, fondo, calidad) para insertar una carrera intermedia sin
// tocar el resto del ciclo — solo la semana de la carrera y la siguiente se ajustan; de ahí en
// adelante el plan sigue exactamente con la tabla de calidad normal, como si nada hubiera pasado.
function computeIntermediateRaceOverrides(student, raceGoalId, raceDateStr) {
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
function getActiveLogWeek(student) {
  const furthest = Math.max(1, ...Object.keys(student.weeks).map(Number));
  for (let n = 1; n <= furthest; n++) {
    if (!student.weeks[n]?.submitted) return n;
  }
  return furthest;
}
function getTaperWeeks(goalId) { return goalId === "42k" ? 2 : 1; }
function getPhase(weeksToRace, goalId) {
  const taperWeeks = getTaperWeeks(goalId);
  if (weeksToRace <= 0) return "race";
  if (weeksToRace <= taperWeeks) return "taper";
  const cyclePos = getCyclePosition(weeksToRace, taperWeeks);
  if (cyclePos.isPeak) return "peak"; // Pico: parte del bloque Específico, mostrado aparte
  if (cyclePos.chunk === 0) return "peak"; // Específico: el bloque de 4 semanas inmediatamente después del pico
  if (cyclePos.chunk === 1 || cyclePos.chunk === 2) return "build"; // Velocidad: los 2 bloques siguientes (8 semanas)
  return "base"; // cualquier bloque más allá
}
function r1(x) { return Math.round(x * 2) / 2; }
function rWhole(x) { return Math.round(x); } // para totales semanales y del fondo: siempre números enteros

/* ---------------------------------------------------------
   ESTRUCTURA SEMANAL (Pfitzinger / Daniels)
   Martes y jueves = calidad, Domingo = fondo; frecuencia según nivel
--------------------------------------------------------- */
function isSpeed(goalId) { return goalId === "10k"; }
function isEndurance(goalId) { return goalId === "21k" || goalId === "42k"; }

function anchorPacesToGoal(paces, goalId) {
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

const LONG_RUN_CAP_KM = { "5k": 16, "10k": 18, "21k": 27, "42k": 34 };
const LONG_RUN_LEVEL_BONUS = { principiante: 0, intermedio1: 0, intermedio2: 0, avanzado1: 1, avanzado2: 2 };
function capLongRunKm(goalId, level, km) {
  const cap = (LONG_RUN_CAP_KM[goalId] ?? 30) + (LONG_RUN_LEVEL_BONUS[level] ?? 0);
  return Math.round(Math.min(km, cap) * 2) / 2;
}
/* El fondo largo no debería llevarse casi la mitad del volumen semanal: se recorta su
   porcentaje de la plantilla y se redistribuye entre el resto de los días. */
function capLongPct(template, factor) {
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

const THRESHOLD_DURATION_TABLE = { 1: 45, 2: 50, 3: 50, 4: 45, 5: 40, 6: 35, 7: 30, 8: 25 };
// 21K: cada sesión 5' más corta que la de 42K, con tope 45' y piso 25' — la semana que quedaría en 20' se suprime
// (esa semana pasa a Intervalos, igual que las semanas anteriores a que empiece el umbral).
const THRESHOLD_DURATION_TABLE_21K = { 1: 40, 2: 45, 3: 45, 4: 40, 5: 35, 6: 30, 7: 25 };
function getForcedThresholdDuration(weeksToRace, goalId) {
  if (weeksToRace == null) return null;
  if (weeksToRace === 0) return null; // semana de carrera: sin umbral
  const table = goalId === "21k" ? THRESHOLD_DURATION_TABLE_21K : THRESHOLD_DURATION_TABLE;
  return table[weeksToRace] ?? null;
}

// Umbral fraccionado: 3 pasadas al ritmo que le correspondería a un umbral continuo de la
// duración de referencia (según la tabla de ritmos), con descanso de trote entre pasadas.
// Progresión de 5 niveles, pensada para las semanas de fase Base antes de entrar a Velocidad
// (aunque también se puede elegir manualmente en cualquier semana).
const BROKEN_T_TABLE = [
  { workMin: 8, refMin: 25, recoveryMin: 3 },
  { workMin: 9, refMin: 30, recoveryMin: 3 },
  { workMin: 11, refMin: 35, recoveryMin: 3 },
  { workMin: 12, refMin: 40, recoveryMin: 4 },
  { workMin: 14, refMin: 45, recoveryMin: 4 },
];
function getBrokenTVariant(idx) {
  return BROKEN_T_TABLE[Math.max(0, Math.min(BROKEN_T_TABLE.length - 1, idx))];
}
// Para la fase Base: entre más cerca esté la semana de entrar a Velocidad, más alto el nivel (5 = el más exigente).
function getBaseBrokenTIndex(chunk, w) {
  // Índice base según el bloque (más cerca de Específico = más exigente).
  const base = Math.max(0, Math.min(4, 6 - chunk));
  // Dentro del mismo bloque, progresa semana a semana: w=1 (más floja) -> w=3 (la de mayor carga).
  const wAdj = { 1: -1, 2: 0, 3: 1 }[w] ?? 0;
  return Math.max(0, Math.min(4, base + wAdj));
}
function evenReps(n) {
  const r = Math.round(n);
  return r % 2 === 0 ? Math.max(2, r) : Math.max(2, r + 1);
}
// w = posición cronológica dentro del bloque de 4 semanas (1,2,3 = carga creciente; 4 = asimilación, más ligera)
const W_MULT = { 1: 0.85, 2: 0.925, 3: 1.0, 4: 0.7 };
function chunkMult(chunk) { return Math.max(0.6, 1 - 0.15 * chunk); }

// Repeticiones (Series) por defecto para Avanzado 1 y 2, por distancia — el resto de niveles sigue con la fórmula automática.
const R_REPS_DEFAULT = {
  avanzado1: { 0.2: 12, 0.4: 10, 0.6: 8, 0.8: 8 },
  avanzado2: { 0.2: 14, 0.4: 12, 0.6: 10, 0.8: 10 },
};
// Intervalos por defecto para Avanzado 1 y 2, por distancia (3k no se especificó, sigue la fórmula automática).
const I_REPS_DEFAULT = {
  avanzado1: { 1: 6, 2: 3, 4: 2, 5: 2 },
  avanzado2: { 1: 10, 2: 5, 4: 3, 5: 2 },
};

// Martes en fase Velocidad: Series de 200 o 400m, con repeticiones que suben y bajan con la carga real de esa semana.
function getVelocidadSeries(chunk, w, level) {
  const dist = w === 3 ? 0.4 : 0.2; // la semana de mayor carga del bloque usa la distancia más larga
  const fixedReps = R_REPS_DEFAULT[level]?.[dist];
  if (fixedReps != null) return { dist, reps: fixedReps };
  const base = dist === 0.4 ? 9 : 11;
  return { dist, reps: evenReps(base * chunkMult(chunk) * (W_MULT[w] ?? 1)) };
}
// Martes en fase Específico: Intervalos que se alargan progresivamente semana a semana (2k -> 3k -> 4k).
function getEspecificoIntervalos(w, level) {
  const table = { 1: { dist: 2, base: 6 }, 2: { dist: 3, base: 4 }, 3: { dist: 4, base: 4 } };
  const t = table[w] || table[1];
  const fixedReps = I_REPS_DEFAULT[level]?.[t.dist];
  if (fixedReps != null) return { dist: t.dist, reps: fixedReps };
  return { dist: t.dist, reps: evenReps(t.base) };
}
// Jueves antes de la semana 8: Intervalos de 1k o 2k (todavía no toca umbral continuo), variando repeticiones.
function getPreUmbralIntervalos(chunk, w, level) {
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
const AVANZADO_QUALITY_TABLE = {
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
const R_REPS_STEP_DOWN = 2;
function deriveIntermedioEntry(entry) {
  if (!entry) return null;
  if (entry.type === "R") return { type: "R", dist: entry.dist, reps: Math.max(2, entry.reps - R_REPS_STEP_DOWN) };
  return { ...entry }; // Intervalos (I), Umbral (T) y 1k+500: misma cantidad que Avanzado
}
const INTERMEDIO_QUALITY_TABLE = {};
for (const wk in AVANZADO_QUALITY_TABLE) {
  const e = AVANZADO_QUALITY_TABLE[wk];
  INTERMEDIO_QUALITY_TABLE[wk] = { q1: deriveIntermedioEntry(e.q1), q2: deriveIntermedioEntry(e.q2) };
}

// Tabla específica para 21K (taper de 1 semana, no 2 como en 42K, así que el pico y las fases caen en semanas distintas).
const AVANZADO_QUALITY_TABLE_21K = {
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
const INTERMEDIO_QUALITY_TABLE_21K = {};
for (const wk in AVANZADO_QUALITY_TABLE_21K) {
  const e = AVANZADO_QUALITY_TABLE_21K[wk];
  INTERMEDIO_QUALITY_TABLE_21K[wk] = { q1: deriveIntermedioEntry(e.q1), q2: deriveIntermedioEntry(e.q2) };
}

function suggestQualityPaces(goalId, phase, weeksToRace, taperWeeks, cyclePosParam, level) {
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

function findFirstSlotIndex(template, slot) {
  for (let i = 0; i < template.length; i++) if (template[i].slot === slot) return i;
  return -1;
}
function convertSlotToRest(template, idx) {
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
function convertRestToEasy(template, idx, alloc, label) {
  if (idx < 0) return template;
  const scale = 1 - alloc;
  return template.map((p, i) => {
    if (i === idx) return { type: label || "Recuperación suave", pace: "E", pct: alloc, slot: "easy" };
    if (p.pct > 0) return { ...p, pct: p.pct * scale };
    return p;
  });
}
function adjustTemplateForLevel(template, trainDays) {
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

const LEVEL_DAY_ROLES = {
  intermedio1: ["rest", "q1", "easyA", "rest", "q2", "rest", "long"],   // descansa Lun, Jue, Sáb
  intermedio2: ["rest", "q1", "easyA", "q2", "easyB", "rest", "long"],  // descansa Lun, Sáb
  avanzado1: ["rest", "q1", "easyA", "q2", "easyB", "q3", "long"],      // descansa solo Lun
  avanzado2: ["easyC", "q1", "easyA", "q2", "easyB", "q3", "long"],    // sin descanso
};

function getDayLayoutTemplate(goalId, phase, level, weeksToRace) {
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
const R_DISTANCES = [0.2, 0.4, 0.6, 0.8]; // 200, 400, 600, 800 m
const R_RECOVERY_MIN = { 0.2: 1, 0.4: 1, 0.6: 1.5, 0.8: 2 }; // recuperación exacta: 200/400m=60", 600m=90", 800m=2'
const I_RECOVERY_DIST_KM = 0.5; // intervalos (cualquier distancia): descanso de 500m, convertido a minutos vía ritmo suave.
function getIRecoveryMin(d, easyP) {
  return r1(I_RECOVERY_DIST_KM * (easyP || 5));
}
const I_DISTANCES = [1.0, 2.0, 3.0, 4.0, 5.0]; // 1k, 2k, 3k, 4k, 5k
const T_DURATIONS = [25, 30, 35, 40, 45, 50]; // minutos continuos
const I_DIST_BY_PHASE = { base: [1], build: [1], peak: [2, 3, 4], taper: [1] };
const R_DIST_BY_PHASE = { base: [0.2, 0.4], build: [0.2, 0.4], peak: [0.6, 0.8], taper: [0.2] };
function getIPace(hmPace, mPace, d) {
  if (hmPace == null || mPace == null) return null;
  const frac = (d - 1) / (4 - 1);
  return hmPace + (mPace - hmPace) * frac;
}
function getRPace(r200Pace, hmPace, d) {
  if (r200Pace == null) return null;
  const r800Pace = hmPace != null ? hmPace * 0.975 : r200Pace * 1.2; // un poco más rápido que el intervalo de 1k (HM)
  if (d <= 0.2) return r200Pace;
  if (d >= 0.8) return r800Pace;
  const frac = (d - 0.2) / (0.8 - 0.2);
  return r200Pace + (r800Pace - r200Pace) * frac;
}
function getTPace(baseT, dur) { return baseT; } // reemplazado por getTPaceForDuration (HM->M); se deja por compatibilidad
function formatDist(d) { return d < 1 ? `${Math.round(d * 1000)} m` : `${d % 1 === 0 ? d : d.toFixed(1)} km`; }
function pickRepScheme(pool, distances, minReps, maxReps, recoveryKmFn) {
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

// Calcula el mismo ritmo "representativo" que se muestra en el detalle de la sesión
// (usa la distancia/duración real de esa sesión, no un valor genérico de referencia).
// Arma la estructura de fases de una sesión para el modo "entrenamiento en vivo":
// una lista de segmentos (warm-up, bloques, descansos, cool-down), cada uno con su
// meta en distancia (o en tiempo cuando así corresponde), para poder avisar al
// alumno en cada transición mientras entrena.
function buildLiveSegments(day, easyP) {
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
    const totalMin = day.targetPace ? Math.round((day.km || 0) * day.targetPace) : Math.round((day.km || 0) * 7);
    let blockMin = 12;
    if (totalMin > 75) blockMin = 20;
    else if (totalMin > 60) blockMin = 18;
    else if (totalMin > 50) blockMin = 15;
    else if (totalMin > 40) blockMin = 14;
    else if (totalMin > 30) blockMin = 13;
    let reps = Math.max(2, Math.round(totalMin / (blockMin + 1)));
    if (day.isMondayRecovery) { blockMin = Math.min(blockMin, 15); reps = Math.min(reps, 3); }
    for (let r = 1; r <= reps; r++) {
      segs.push({ label: `Trote ${r} de ${reps}`, type: "time", target: blockMin, pace: day.easyPace });
      segs.push({ label: "Caminata", type: "time", target: 1, pace: null });
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
function getRepresentativePace(day) {
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
function getSessionDetail(day) {
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
      const totalMin = day.targetPace ? Math.round(km * day.targetPace) : Math.round(km * 7);
      let blockMin = 12;
      if (totalMin > 75) blockMin = 20;
      else if (totalMin > 60) blockMin = 18;
      else if (totalMin > 50) blockMin = 15;
      else if (totalMin > 40) blockMin = 14;
      else if (totalMin > 30) blockMin = 13;
      let reps = Math.max(2, Math.round(totalMin / (blockMin + 1)));
      if (day.isMondayRecovery) { blockMin = Math.min(blockMin, 15); reps = Math.min(reps, 3); }
      return [
        { label: "Run/Walk", text: `Trote ${blockMin}' + caminata 1', x${reps} (acumulado ~${reps * (blockMin + 1)} min)${easyStr}.`, color: COLORS.moderate },
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
const WALK_PACE = 11; // min/km aprox., referencia visual para tramos caminando
const STRIDE_PACE = 3.0; // min/km aprox., referencia visual para tramos rapidos/strides

// Recalcula el km total del día a partir de la distancia/repeticiones/descanso configurados
// (auto o manual), para que el total siempre refleje la sesión real, no un valor desfasado.
function getCustomBlocks(day) {
  if (Array.isArray(day.customBlocks) && day.customBlocks.length) return day.customBlocks;
  return [{
    reps: day.customReps ?? 6,
    distKm: day.customWorkKm ?? 0.4,
    paceStr: day.customPaceStr || "",
    recoveryMin: day.customRecoveryMin ?? 2,
  }];
}
function computeImpliedKm(day) {
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
function impliedQKm(type, dist, reps, paces) {
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
function getSessionBars(day) {
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
      const totalMin = day.targetPace ? Math.round(km * day.targetPace) : Math.round(km * 7);
      let blockMin = 12;
      if (totalMin > 75) blockMin = 20; else if (totalMin > 60) blockMin = 18; else if (totalMin > 50) blockMin = 15;
      else if (totalMin > 40) blockMin = 14; else if (totalMin > 30) blockMin = 13;
      const reps = Math.max(2, Math.round(totalMin / (blockMin + 1)));
      const bars = [];
      for (let i = 0; i < reps; i++) {
        bars.push({ durationMin: blockMin, pace: day.targetPace || easyP, colorKind: "moderate", label: "Trote" });
        bars.push({ durationMin: 1, pace: WALK_PACE, colorKind: "recovery", label: "Camina" });
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

const COLOR_KIND_FILL = { easy: COLORS.easy, recovery: COLORS.rest, moderate: COLORS.moderate, hard: COLORS.hard };
const COLOR_KIND_LABEL = { easy: "Warm-up / Cool-down", recovery: "Recuperación", moderate: "Ritmo sostenido", hard: "Esfuerzo fuerte" };

function SessionBarChart({ day }) {
  const bars = getSessionBars(day);
  if (!bars || bars.length === 0) return null;
  const totalMin = bars.reduce((s, b) => s + Math.max(0.2, b.durationMin), 0) || 1;
  const paces = bars.map((b) => b.pace).filter((p) => p != null);
  const minP = paces.length ? Math.min(...paces) : 5;
  const maxP = paces.length ? Math.max(...paces) : 5;
  const W = 600, H = 90, baseY = 78, maxH = 68, minFrac = 0.22;
  function heightFrac(pace) {
    if (pace == null || minP === maxP) return 0.55;
    const t = (pace - minP) / (maxP - minP); // 0 = más rápido, 1 = más lento
    return 1 - t * (1 - minFrac);
  }
  let x = 0;
  const gap = bars.length > 40 ? 0.3 : 1;
  const rects = bars.map((b, i) => {
    const wRaw = (Math.max(0.2, b.durationMin) / totalMin) * W;
    const w = Math.max(1.2, wRaw - gap);
    const h = heightFrac(b.pace) * maxH;
    const fill = COLOR_KIND_FILL[b.colorKind] ?? COLORS.easy;
    const rect = <rect key={i} x={x} y={baseY - h} width={w} height={h} rx={1.5} fill={fill} opacity={0.9} />;
    x += wRaw;
    return rect;
  });
  const kindsPresent = [...new Set(bars.map((b) => b.colorKind))];
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 56, display: "block" }} preserveAspectRatio="none">
        <line x1={0} y1={baseY} x2={W} y2={baseY} stroke={COLORS.border} strokeWidth={1} />
        {rects}
      </svg>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
        {kindsPresent.map((k) => (
          <div key={k} className="flex items-center gap-1">
            <span style={{ width: 7, height: 7, borderRadius: 999, background: COLOR_KIND_FILL[k], display: "inline-block" }} />
            <span className="text-[9px]" style={{ color: COLORS.textMuted }}>{COLOR_KIND_LABEL[k]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function emptyLog() {
  return Array(7).fill(null).map(() => ({ completed: false, actualKm: "", actualPaceStr: "", rpe: "", note: "" }));
}
function computeAdherence(plan, log) {
  let total = 0, completed = 0, rpeSum = 0, rpeCount = 0, pctSum = 0;
  plan.forEach((d, i) => {
    if (!d.paceKey) return;
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
function computeHistoricalAdherence(student) {
  // Solo cuentan las semanas que el propio alumno envió — el coach cerrando una semana
  // directamente (por ejemplo, preparando por adelantado) no debe afectar este promedio.
  const values = Object.values(student.weeks)
    .filter((w) => w.studentSubmitted)
    .map((w) => w.adherencePct)
    .filter((v) => v != null);
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}
function adaptWeeklyKm(baseKm, adherencePct, avgRpe) {
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
function buildWeekPlanFitness(weeklyKm, level) {
  const template = getDayLayoutTemplate("fitness", "fitness", level);
  return template.map((slotDef, i) => ({
    day: DAYS[i], type: slotDef.type, paceKey: slotDef.pace, slot: slotDef.slot,
    km: slotDef.pct ? Math.round(weeklyKm * slotDef.pct * 2) / 2 : 0,
    targetPace: null, runWalk: false,
  }));
}

// Título por defecto de una sesión según su tipo de ritmo (queda editable después).
function getDefaultTitle(paceKey, isMondayRecovery, runWalk) {
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
function buildRacePlan(goalId, phase, level, weeklyKm, longRunKm, q1PaceKey, q2PaceKey, paces, weeksToRace, taperWeeksParam) {
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
function balanceWeeklyVolume(plan, weeklyKm) {
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
const ANOMALY_MAX_KM = 36; // por encima de esto, se avisa (una vuelta de maratón completa y algo más)
const ANOMALY_MAX_LONG_KM = 42; // el fondo del domingo tolera un poco más antes de avisar
function getAnomalyWarnings(plan) {
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

function computeBaselineWeek(goalId, level, peakKm, peakLongKm, weeksToRace) {
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

function buildInitialRacePlan(goalId, level, peakKm, peakLongKm, weeksToRace, paces) {
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
function getCyclePosition(weeksToRace, taperWeeks) {
  const peakWeeksToRace = taperWeeks + 1;
  const pos = weeksToRace - peakWeeksToRace;
  if (pos === 0) return { isPeak: true, isAssimilation: false, w: 3, chunk: 0, label: "Semana pico del ciclo" };
  if (pos < 0) return { isPeak: false, isAssimilation: false, w: 3, chunk: 0, label: "Tapering / semana de carrera" };
  const chunk = Math.floor((pos - 1) / 4);
  const w = 4 - ((pos - 1) % 4);
  const isAssimilation = w === 4;
  return { isPeak: false, isAssimilation, w, chunk, label: isAssimilation ? "Semana de asimilación" : `Semana ${w} de 3 de carga` };
}
function fracForWeek(w) { return { 1: 0.85, 2: 0.925, 3: 1.0, 4: 0.85 }[w] ?? 1; }
// chunk 0 = Específico, 1-2 = Velocidad (decayendo hacia atrás), 3+ = Base: se mantiene en un
// volumen promedio y estable (no tan alto como el pico, pero sin seguir bajando indefinidamente).
function chunkBaselineFactor(chunk) { return chunk >= 3 ? 0.72 : Math.max(0.45, 0.95 - 0.15 * chunk); }

function buildWeekProposal(student) {
  const week = student.weeks[student.currentWeek];
  const preparedAhead = !week.submitted; // el coach está cerrando una semana que el alumno aún no confirmó/envió
  const { adherencePct, avgRpe } = (week.paused || preparedAhead)
    ? { adherencePct: 1, avgRpe: null } // semana pausada, o aún no vivida por el alumno: no penaliza el ciclo
    : computeAdherence(week.plan, week.log);

  if (student.level === "principiante" || isFitnessGoal(student.goal)) {
    return { kind: "principiante", adherencePct, avgRpe, closedWeekNumber: student.currentWeek, closedWeeklyKm: week.weeklyKm, closedPhase: "principiante" };
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

function finalizeWeekPlan(student, proposal, confirmed) {
  const currentWeekData = student.weeks[student.currentWeek];
  const nextWeekNum = student.currentWeek + 1;

  if (proposal.kind === "principiante") {
    const stages = getStageTable(student.goal);
    let nextStage = student.beginnerStage ?? 0;
    let note;
    if (proposal.adherencePct >= 0.7) {
      const advanced = Math.min(stages.length - 1, nextStage + 1);
      note = `Adherencia buena (${Math.round(proposal.adherencePct * 100)}%): se avanza a la etapa de ${stages[advanced].label}.`;
      nextStage = advanced;
    } else {
      note = `Adherencia baja (${Math.round(proposal.adherencePct * 100)}%): se mantiene la etapa de ${stages[nextStage].label} para consolidar.`;
    }
    if (nextStage === stages.length - 1) {
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

/* Panorama: proyección de volumen Y estructura semanal hasta la carrera (editable por el coach) */
function estimateQualitySession(paceKey, phase, level, paces, qualityKm, forcedDist, forcedReps) {
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

function projectWeeklyVolumes(student) {
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

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
async function hashText(text, salt) {
  const enc = new TextEncoder().encode(salt ? `${salt}:${text}` : text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function genSalt() {
  const arr = new Uint8Array(8);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function pushReport(report) {
  const reports = (await safeGet("reports")) || [];
  reports.push(report);
  await safeSet("reports", reports);
}
async function pushPaceAlert(alert) {
  const alerts = (await safeGet("paceAlerts")) || [];
  alerts.push(alert);
  await safeSet("paceAlerts", alerts);
}

/* ---------------------------------------------------------
   AJUSTE AUTOMÁTICO DE RITMO
   Detecta cuando una sesión de calidad viene 10-15+ seg/km más lenta
   que el ritmo objetivo, y tras 2 fallos consecutivos sugiere un ajuste.
--------------------------------------------------------- */
const PACE_FAIL_THRESHOLD_MIN = 10 / 60; // 10 segundos/km
function getQualityDayLog(week, slotName) {
  const idx = week.plan.findIndex((d) => d.slot === slotName);
  if (idx < 0) return null;
  return { day: week.plan[idx], log: week.log[idx], index: idx };
}
function evaluateQualityFail(day, log) {
  if (!day || !day.targetPace) return null;
  const actual = parsePaceToDecimal(log?.actualPaceStr);
  if (actual == null) return null;
  const diffMin = actual - day.targetPace;
  return diffMin >= PACE_FAIL_THRESHOLD_MIN;
}
function evaluateQualityAdjustment(student, closedWeek) {
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
function applyPaceAdjustment(paces, trigger, q1PaceKey, q2PaceKey, goalId) {
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

/* ---------------------------------------------------------
   SMALL UI PRIMITIVES
--------------------------------------------------------- */
function Pill({ children, color }) {
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium tracking-wide"
      style={{ background: color + "22", color, border: `1px solid ${color}55` }}>
      {children}
    </span>
  );
}
// Arma el reporte semanal del alumno: cumplimiento, km, RPE, ritmo real vs objetivo, y
// conclusiones/recomendaciones generadas con reglas simples según esos números.
function buildWeeklyReportData(student, week, weekNum) {
  const slots = week.plan.map((d, i) => ({ d, i })).filter((x) => !!x.d.paceKey);
  const completedSlots = slots.filter((x) => week.log[x.i]?.completed);
  const daysPlanned = slots.length;
  const daysCompleted = completedSlots.length;
  const kmPlanned = r1(slots.reduce((s, x) => s + (x.d.km || 0), 0));
  const kmActual = r1(completedSlots.reduce((s, x) => {
    const l = week.log[x.i];
    const km = l.actualKm !== "" && l.actualKm != null && !isNaN(Number(l.actualKm)) ? Number(l.actualKm) : x.d.km;
    return s + (km || 0);
  }, 0));
  const rpeValues = completedSlots.map((x) => week.log[x.i]?.rpe).filter((v) => v !== "" && v != null).map(Number);
  const avgRpe = rpeValues.length ? r1(rpeValues.reduce((a, b) => a + b, 0) / rpeValues.length) : null;
  const qualityTypes = ["R", "I", "T", "brokenT", "M", "race", "combo1k500"];
  const paceComparisons = completedSlots
    .filter((x) => qualityTypes.includes(x.d.paceKey))
    .map((x) => {
      const l = week.log[x.i];
      const target = getRepresentativePace(x.d);
      const actual = parsePaceToDecimal(l.actualPaceStr);
      if (target == null || actual == null) return null;
      return { day: x.d.day, type: x.d.type, target, actual, diffSec: Math.round((actual - target) * 60) };
    })
    .filter(Boolean);
  const notes = completedSlots.map((x) => ({ day: week.plan[x.i].day, note: week.log[x.i]?.note })).filter((n) => n.note);

  const adherencePct = daysPlanned ? daysCompleted / daysPlanned : 1;
  const kmPct = kmPlanned ? kmActual / kmPlanned : 1;

  // Conclusiones y recomendaciones (reglas simples, sin IA — basadas en los números de esta semana)
  const conclusions = [];
  if (adherencePct >= 0.9 && kmPct >= 0.9) {
    conclusions.push("Cumplimiento sólido esta semana — completó prácticamente todo lo planeado. Buen punto para mantener o progresar ligeramente la carga la próxima semana.");
  } else if (adherencePct < 0.7) {
    conclusions.push(`Solo completó ${daysCompleted} de ${daysPlanned} sesiones planeadas. Vale la pena conversar con el alumno para entender qué está dificultando el cumplimiento (tiempo, motivación, cansancio, lesión) antes de ajustar el plan.`);
  } else {
    conclusions.push(`Cumplimiento parcial (${daysCompleted} de ${daysPlanned} sesiones). Revisar si hay un patrón (¿siempre el mismo día?) que convenga ajustar en el plan.`);
  }
  if (kmPlanned > 0 && kmPct < 0.75) {
    conclusions.push(`El kilometraje real (${kmActual} km) quedó bastante por debajo de lo planeado (${kmPlanned} km). Considera si el volumen semanal es sostenible para este alumno en este momento.`);
  } else if (kmPlanned > 0 && kmPct > 1.15) {
    conclusions.push(`El alumno corrió más de lo planeado (${kmActual} km vs ${kmPlanned} km). Confirma que no se esté excediendo por su cuenta, sobre todo si hay riesgo de sobrecarga.`);
  }
  if (avgRpe != null && avgRpe >= 8) {
    conclusions.push(`El esfuerzo percibido promedio fue alto (RPE ${avgRpe}/10). Vale la pena bajar intensidad o dar más recuperación la próxima semana.`);
  } else if (avgRpe != null && avgRpe <= 4 && adherencePct >= 0.9) {
    conclusions.push(`El esfuerzo percibido fue bajo (RPE ${avgRpe}/10) con buen cumplimiento — hay margen para progresar la carga si el objetivo lo permite.`);
  }
  const slowSessions = paceComparisons.filter((p) => p.diffSec > 10);
  if (slowSessions.length >= 2) {
    conclusions.push(`En ${slowSessions.length} sesión(es) de calidad el ritmo real fue notablemente más lento que el objetivo (10+ seg/km). Si esto se repite, considera revisar el ritmo objetivo o investigar fatiga/condiciones externas.`);
  }
  if (notes.length) {
    conclusions.push("Revisa las notas que dejó el alumno en sus sesiones — pueden dar contexto directo sobre cómo se sintió.");
  }
  if (conclusions.length === 0) conclusions.push("Sin datos suficientes esta semana para sacar conclusiones claras — revisa directamente el detalle de cada sesión.");

  return { daysPlanned, daysCompleted, kmPlanned, kmActual, avgRpe, paceComparisons, notes, conclusions, adherencePct, kmPct };
}
const COLOR_KIND_HEX = { easy: "#4C9A6A", recovery: "#4A5568", moderate: "#D99A3D", hard: "#C8452E" };
function buildSessionBarSVG(day) {
  const bars = getSessionBars(day);
  if (!bars || bars.length === 0) return "";
  const totalMin = bars.reduce((s, b) => s + Math.max(0.2, b.durationMin), 0) || 1;
  const paces = bars.map((b) => b.pace).filter((p) => p != null);
  const minP = paces.length ? Math.min(...paces) : 5;
  const maxP = paces.length ? Math.max(...paces) : 5;
  const W = 600, H = 60, baseY = 52, maxH = 44, minFrac = 0.22;
  const heightFrac = (pace) => {
    if (pace == null || minP === maxP) return 0.55;
    const t = (pace - minP) / (maxP - minP);
    return 1 - t * (1 - minFrac);
  };
  let x = 0;
  const gap = bars.length > 40 ? 0.3 : 1;
  const rects = bars.map((b) => {
    const wRaw = (Math.max(0.2, b.durationMin) / totalMin) * W;
    const w = Math.max(1.2, wRaw - gap);
    const h = heightFrac(b.pace) * maxH;
    const fill = COLOR_KIND_HEX[b.colorKind] || "#4C9A6A";
    const rect = `<rect x="${x}" y="${baseY - h}" width="${w}" height="${h}" rx="1.5" fill="${fill}" opacity="0.9"></rect>`;
    x += wRaw;
    return rect;
  }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:40px;display:block;" preserveAspectRatio="none">
    <line x1="0" y1="${baseY}" x2="${W}" y2="${baseY}" stroke="#ddd" stroke-width="1"></line>
    ${rects}
  </svg>`;
}
function buildPrintableHTML(student, week, weekNum) {
  const esc = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const daysHtml = week.plan.map((d, i) => {
    const detail = d.paceKey ? getSessionDetail(d) : null;
    const barSvg = d.paceKey ? buildSessionBarSVG(d) : "";
    const detailHtml = detail
      ? detail.map((seg) => `<div style="font-size:12px;color:#333;margin-top:3px;"><b>${esc(seg.label)}:</b> ${esc(seg.text)}</div>`).join("")
      : `<div style="font-size:12px;color:#777;">Descanso</div>`;
    return `
      <div style="margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid #ddd;break-inside:avoid;">
        <div style="font-weight:bold;font-size:14px;">${esc(DAYS[i])} — ${esc(d.type)}${d.paceKey ? ` (${d.km} km)` : ""}</div>
        ${barSvg}
        ${detailHtml}
      </div>`;
  }).join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(student.name)} — ${esc(getWeekTitle(student, weekNum))}</title>
    <style>body{font-family:Arial,sans-serif;color:#111;padding:32px;max-width:700px;margin:0 auto;}</style>
    </head><body>
    <h1 style="font-size:22px;margin-bottom:2px;">${esc(student.name)}</h1>
    <p style="font-size:13px;color:#555;margin-bottom:4px;">
      ${esc(GOAL_LABEL[student.goal])} · ${esc(LEVEL_LABEL[student.level])} · ${esc(getWeekTitle(student, weekNum))}${week.weeklyKm != null ? ` · ${week.weeklyKm} km` : ""}
    </p>
    ${student.raceDate ? `<p style="font-size:12px;color:#777;margin-bottom:16px;">Fecha de carrera: ${esc(student.raceDate)}</p>` : ""}
    ${week.note ? `<p style="font-size:12px;color:#777;margin-bottom:16px;font-style:italic;">${esc(week.note)}</p>` : ""}
    ${daysHtml}
    <p style="font-size:11px;color:#999;margin-top:24px;">Para guardarlo como PDF: usa Archivo &gt; Imprimir (Cmd/Ctrl+P) y elige "Guardar como PDF" como destino.</p>
    <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 200); };</script>
    </body></html>`;
}
// Descarga el plan como archivo HTML (en vez de intentar abrir una ventana o imprimir dentro del
// artefacto): las descargas de archivos funcionan de forma consistente en todos los navegadores,
// incluyendo Safari, a diferencia de window.open()/window.print(), que Safari puede bloquear cuando
// la página vive dentro de un iframe de terceros (como es el caso de este artefacto).
function exportWeekToPDF(student, week, weekNum) {
  const html = buildPrintableHTML(student, week, weekNum);
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${student.name.replace(/[^a-z0-9]+/gi, "_")}_${getWeekTitle(student, weekNum).replace(/[^a-z0-9]+/gi, "_")}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function buildWeeklyReportHTML(student, week, weekNum) {
  const esc = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const r = buildWeeklyReportData(student, week, weekNum);
  const pct = (v) => `${Math.round(v * 100)}%`;
  const paceRows = r.paceComparisons.map((p) => `
    <tr>
      <td style="padding:4px 8px;border-bottom:1px solid #eee;">${esc(p.day)}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #eee;">${esc(p.type)}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #eee;">${esc(formatPace(p.target))}/km</td>
      <td style="padding:4px 8px;border-bottom:1px solid #eee;">${esc(formatPace(p.actual))}/km</td>
      <td style="padding:4px 8px;border-bottom:1px solid #eee;color:${p.diffSec > 10 ? "#c0392b" : p.diffSec < -10 ? "#1e7e34" : "#555"};">
        ${p.diffSec > 0 ? "+" : ""}${p.diffSec}s/km
      </td>
    </tr>`).join("");
  const notesHtml = r.notes.map((n) => `<li style="margin-bottom:4px;"><b>${esc(n.day)}:</b> "${esc(n.note)}"</li>`).join("");
  const conclusionsHtml = r.conclusions.map((c) => `<li style="margin-bottom:8px;">${esc(c)}</li>`).join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Reporte semanal — ${esc(student.name)}</title>
    <style>body{font-family:Arial,sans-serif;color:#111;padding:32px;max-width:750px;margin:0 auto;}
    .stat{display:inline-block;min-width:140px;margin:8px 16px 8px 0;}
    .stat b{display:block;font-size:22px;}
    .stat span{font-size:12px;color:#666;}
    table{border-collapse:collapse;width:100%;font-size:13px;margin-top:8px;}
    th{text-align:left;padding:4px 8px;border-bottom:2px solid #333;font-size:12px;}
    </style></head><body>
    <h1 style="font-size:22px;margin-bottom:2px;">Reporte semanal — ${esc(student.name)}</h1>
    <p style="font-size:13px;color:#555;margin-bottom:16px;">
      ${esc(GOAL_LABEL[student.goal])} · ${esc(LEVEL_LABEL[student.level])} · ${esc(getWeekTitle(student, weekNum))}
    </p>
    <div style="border-top:1px solid #ddd;border-bottom:1px solid #ddd;padding:8px 0;margin-bottom:16px;">
      <div class="stat"><b>${r.daysCompleted}/${r.daysPlanned}</b><span>días entrenados (${pct(r.adherencePct)})</span></div>
      <div class="stat"><b>${r.kmActual} km</b><span>de ${r.kmPlanned} km planeados (${pct(r.kmPct)})</span></div>
      <div class="stat"><b>${r.avgRpe != null ? r.avgRpe : "—"}</b><span>RPE promedio (de 10)</span></div>
    </div>
    ${r.paceComparisons.length ? `
      <h2 style="font-size:15px;">Ritmo real vs. objetivo (sesiones de calidad)</h2>
      <table><thead><tr><th>Día</th><th>Tipo</th><th>Objetivo</th><th>Real</th><th>Diferencia</th></tr></thead>
      <tbody>${paceRows}</tbody></table>` : ""}
    ${r.notes.length ? `<h2 style="font-size:15px;margin-top:20px;">Notas del alumno</h2><ul style="font-size:13px;padding-left:20px;">${notesHtml}</ul>` : ""}
    <h2 style="font-size:15px;margin-top:20px;">Conclusiones y recomendaciones</h2>
    <ul style="font-size:13px;padding-left:20px;">${conclusionsHtml}</ul>
    <p style="font-size:11px;color:#999;margin-top:24px;">Para guardarlo como PDF: usa Archivo &gt; Imprimir (Cmd/Ctrl+P) y elige "Guardar como PDF" como destino.</p>
    <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 200); };</script>
    </body></html>`;
}
function exportWeeklyReport(student, week, weekNum) {
  const html = buildWeeklyReportHTML(student, week, weekNum);
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Reporte_${student.name.replace(/[^a-z0-9]+/gi, "_")}_${getWeekTitle(student, weekNum).replace(/[^a-z0-9]+/gi, "_")}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const PHASE_COLOR_PRINT = { base: "#8a9199", build: "#4a7fb5", peak: "#c8452e", taper: "#d99a3f", race: "#1e7e34", principiante: "#8a9199" };
function buildFullPlanOverviewHTML(student) {
  const esc = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const projection = projectWeeklyVolumes(student);
  const isBeginner = projection.kind === "beginner";
  const rows = isBeginner
    ? [...projection.rows].reverse().map((r) => ({
        weekLabel: `Semana ${r.weekNum}`, phaseLabel: r.label, phaseColor: "#8a9199",
        km: r1(r.totalMin / 60), isPeak: false, isRecovery: false,
      }))
    : [...projection.rows].sort((a, b) => b.weeksToRace - a.weeksToRace).map((r) => ({
        weekLabel: `Faltan ${r.weeksToRace} sem.`, phaseLabel: PHASE_LABEL[r.phase] || r.phase, phaseColor: PHASE_COLOR_PRINT[r.phase] || "#8a9199",
        km: r.km, isPeak: r.isPeak, isRecovery: r.isRecovery,
      }));
  const maxKm = Math.max(1, ...rows.map((r) => r.km));
  const rowsHtml = rows.map((r) => `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px;font-size:11px;">
      <div style="width:110px;flex-shrink:0;color:#555;">${esc(r.weekLabel)}</div>
      <div style="width:90px;flex-shrink:0;color:${r.phaseColor};font-weight:${r.isPeak ? "bold" : "normal"};">${esc(r.phaseLabel)}${r.isPeak ? " ★" : ""}${r.isRecovery ? " (asim.)" : ""}</div>
      <div style="flex:1;background:#eee;border-radius:3px;overflow:hidden;height:14px;">
        <div style="width:${Math.max(2, (r.km / maxKm) * 100)}%;background:${r.phaseColor};height:100%;"></div>
      </div>
      <div style="width:55px;flex-shrink:0;text-align:right;font-family:monospace;">${r.km} km</div>
    </div>`).join("");
  const legend = isBeginner ? "" : Object.entries(PHASE_LABEL).filter(([k]) => PHASE_COLOR_PRINT[k]).map(([k, label]) => `
    <span style="display:inline-flex;align-items:center;gap:4px;margin-right:14px;font-size:11px;color:#555;">
      <span style="width:10px;height:10px;border-radius:2px;background:${PHASE_COLOR_PRINT[k]};display:inline-block;"></span>${esc(label)}
    </span>`).join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Resumen del plan — ${esc(student.name)}</title>
    <style>body{font-family:Arial,sans-serif;color:#111;padding:32px;max-width:800px;margin:0 auto;}</style>
    </head><body>
    <h1 style="font-size:22px;margin-bottom:2px;">Resumen del plan — ${esc(student.name)}</h1>
    <p style="font-size:13px;color:#555;margin-bottom:4px;">${esc(GOAL_LABEL[student.goal])} · ${esc(LEVEL_LABEL[student.level])}</p>
    ${student.raceDate ? `<p style="font-size:12px;color:#777;margin-bottom:12px;">Fecha de carrera: ${esc(student.raceDate)}</p>` : ""}
    <div style="margin-bottom:16px;">${legend}</div>
    ${rowsHtml}
    <p style="font-size:11px;color:#999;margin-top:24px;">Vista resumida del volumen semanal planeado, desde la semana actual hasta el objetivo. Para el detalle día por día de una semana específica, usa "Exportar a PDF" desde esa semana. Para guardarlo como PDF: usa Archivo &gt; Imprimir (Cmd/Ctrl+P) y elige "Guardar como PDF".</p>
    <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 200); };</script>
    </body></html>`;
}
function exportFullPlanOverview(student) {
  const html = buildFullPlanOverviewHTML(student);
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Plan_completo_${student.name.replace(/[^a-z0-9]+/gi, "_")}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
/* ---------------------------------------------------------
   GENERADOR DE CÓDIGO QR (autónomo, sin dependencias externas)
   Implementación compacta del algoritmo estándar QR (dominio público,
   basada en el trabajo de Kazuhiko Arase). No depende de internet.
--------------------------------------------------------- */
// QR Code generator - implementación compacta, dominio público (basada en el algoritmo estándar
// de Kazuhiko Arase / qrcode-generator), sin dependencias externas.
const QRMode = { MODE_8BIT_BYTE: 4 };
const QRErrorCorrectLevel = { L: 1, M: 0, Q: 3, H: 2 };
const QRMaskPattern = { PATTERN000: 0, PATTERN001: 1, PATTERN010: 2, PATTERN011: 3, PATTERN100: 4, PATTERN101: 5, PATTERN110: 6, PATTERN111: 7 };

const QRUtil = (function () {
  const PATTERN_POSITION_TABLE = [
    [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
    [6, 30, 54], [6, 32, 58], [6, 34, 62], [6, 26, 46, 66], [6, 26, 48, 70], [6, 26, 50, 74], [6, 30, 54, 78],
    [6, 30, 56, 82], [6, 30, 58, 86], [6, 34, 62, 90], [6, 28, 50, 72, 94], [6, 26, 50, 74, 98],
    [6, 30, 54, 78, 102], [6, 28, 54, 80, 106], [6, 32, 58, 84, 110], [6, 30, 58, 86, 114],
    [6, 34, 62, 90, 118], [6, 26, 50, 74, 98, 122], [6, 30, 54, 78, 102, 126], [6, 26, 52, 78, 104, 130],
    [6, 30, 56, 82, 108, 134], [6, 34, 60, 86, 112, 138], [6, 30, 58, 86, 114, 142], [6, 34, 62, 90, 118, 146],
    [6, 30, 54, 78, 102, 126, 150], [6, 24, 50, 76, 102, 128, 154], [6, 28, 54, 80, 106, 132, 158],
    [6, 32, 58, 84, 110, 136, 162], [6, 26, 54, 82, 110, 138, 166], [6, 30, 58, 86, 114, 142, 170]
  ];
  const G15 = (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0);
  const G18 = (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | (1 << 0);
  const G15_MASK = (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1);
  function getBCHDigit(data) { let digit = 0; while (data !== 0) { digit++; data >>>= 1; } return digit; }
  function getBCHTypeInfo(data) {
    let d = data << 10;
    while (getBCHDigit(d) - getBCHDigit(G15) >= 0) d ^= (G15 << (getBCHDigit(d) - getBCHDigit(G15)));
    return ((data << 10) | d) ^ G15_MASK;
  }
  function getBCHTypeNumber(data) {
    let d = data << 12;
    while (getBCHDigit(d) - getBCHDigit(G18) >= 0) d ^= (G18 << (getBCHDigit(d) - getBCHDigit(G18)));
    return (data << 12) | d;
  }
  function getPatternPosition(typeNumber) { return PATTERN_POSITION_TABLE[typeNumber - 1]; }
  function getMask(maskPattern, i, j) {
    switch (maskPattern) {
      case QRMaskPattern.PATTERN000: return (i + j) % 2 === 0;
      case QRMaskPattern.PATTERN001: return i % 2 === 0;
      case QRMaskPattern.PATTERN010: return j % 3 === 0;
      case QRMaskPattern.PATTERN011: return (i + j) % 3 === 0;
      case QRMaskPattern.PATTERN100: return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0;
      case QRMaskPattern.PATTERN101: return (i * j) % 2 + (i * j) % 3 === 0;
      case QRMaskPattern.PATTERN110: return ((i * j) % 2 + (i * j) % 3) % 2 === 0;
      case QRMaskPattern.PATTERN111: return ((i * j) % 3 + (i + j) % 2) % 2 === 0;
      default: throw new Error("bad maskPattern:" + maskPattern);
    }
  }
  function getErrorCorrectPolynomial(errorCorrectLength) {
    let a = new QRPolynomial([1], 0);
    for (let i = 0; i < errorCorrectLength; i++) a = a.multiply(new QRPolynomial([1, QRMath.gexp(i)], 0));
    return a;
  }
  function getLengthInBits(mode, type) {
    if (type >= 1 && type < 10) { if (mode === QRMode.MODE_8BIT_BYTE) return 8; }
    else if (type < 27) { if (mode === QRMode.MODE_8BIT_BYTE) return 16; }
    else if (type < 41) { if (mode === QRMode.MODE_8BIT_BYTE) return 16; }
    else throw new Error("type:" + type);
    throw new Error("mode:" + mode);
  }
  function getLostPoint(qrCode) {
    const moduleCount = qrCode.getModuleCount();
    let lostPoint = 0;
    for (let row = 0; row < moduleCount; row++) for (let col = 0; col < moduleCount; col++) {
      let sameCount = 0; const dark = qrCode.isDark(row, col);
      for (let r = -1; r <= 1; r++) { if (row + r < 0 || moduleCount <= row + r) continue; for (let c = -1; c <= 1; c++) { if (col + c < 0 || moduleCount <= col + c) continue; if (r === 0 && c === 0) continue; if (dark === qrCode.isDark(row + r, col + c)) sameCount++; } }
      if (sameCount > 5) lostPoint += (3 + sameCount - 5);
    }
    for (let row = 0; row < moduleCount - 1; row++) for (let col = 0; col < moduleCount - 1; col++) {
      let count = 0;
      if (qrCode.isDark(row, col)) count++; if (qrCode.isDark(row + 1, col)) count++; if (qrCode.isDark(row, col + 1)) count++; if (qrCode.isDark(row + 1, col + 1)) count++;
      if (count === 0 || count === 4) lostPoint += 3;
    }
    for (let row = 0; row < moduleCount; row++) for (let col = 0; col < moduleCount - 6; col++) {
      if (qrCode.isDark(row, col) && !qrCode.isDark(row, col + 1) && qrCode.isDark(row, col + 2) && qrCode.isDark(row, col + 3) && qrCode.isDark(row, col + 4) && !qrCode.isDark(row, col + 5) && qrCode.isDark(row, col + 6)) lostPoint += 40;
    }
    for (let col = 0; col < moduleCount; col++) for (let row = 0; row < moduleCount - 6; row++) {
      if (qrCode.isDark(row, col) && !qrCode.isDark(row + 1, col) && qrCode.isDark(row + 2, col) && qrCode.isDark(row + 3, col) && qrCode.isDark(row + 4, col) && !qrCode.isDark(row + 5, col) && qrCode.isDark(row + 6, col)) lostPoint += 40;
    }
    let darkCount = 0;
    for (let col = 0; col < moduleCount; col++) for (let row = 0; row < moduleCount; row++) if (qrCode.isDark(row, col)) darkCount++;
    const ratio = Math.abs(100 * darkCount / moduleCount / moduleCount - 50) / 5;
    lostPoint += ratio * 10;
    return lostPoint;
  }
  return { getBCHTypeInfo, getBCHTypeNumber, getPatternPosition, getMask, getErrorCorrectPolynomial, getLengthInBits, getLostPoint, G15_MASK };
})();

const QRMath = (function () {
  const EXP_TABLE = new Array(256); const LOG_TABLE = new Array(256);
  for (let i = 0; i < 8; i++) EXP_TABLE[i] = 1 << i;
  for (let i = 8; i < 256; i++) EXP_TABLE[i] = EXP_TABLE[i - 4] ^ EXP_TABLE[i - 5] ^ EXP_TABLE[i - 6] ^ EXP_TABLE[i - 8];
  for (let i = 0; i < 255; i++) LOG_TABLE[EXP_TABLE[i]] = i;
  return {
    glog(n) { if (n < 1) throw new Error("glog(" + n + ")"); return LOG_TABLE[n]; },
    gexp(n) { while (n < 0) n += 255; while (n >= 256) n -= 255; return EXP_TABLE[n]; }
  };
})();

function QRPolynomial(num, shift) {
  let offset = 0;
  while (offset < num.length && num[offset] === 0) offset++;
  this.num = new Array(num.length - offset + shift);
  for (let i = 0; i < num.length - offset; i++) this.num[i] = num[i + offset];
}
QRPolynomial.prototype = {
  get(index) { return this.num[index]; },
  getLength() { return this.num.length; },
  multiply(e) {
    const num = new Array(this.getLength() + e.getLength() - 1);
    for (let i = 0; i < this.getLength(); i++) for (let j = 0; j < e.getLength(); j++) num[i + j] ^= QRMath.gexp(QRMath.glog(this.get(i)) + QRMath.glog(e.get(j)));
    return new QRPolynomial(num, 0);
  },
  mod(e) {
    if (this.getLength() - e.getLength() < 0) return this;
    const ratio = QRMath.glog(this.get(0)) - QRMath.glog(e.get(0));
    const num = new Array(this.getLength());
    for (let i = 0; i < this.getLength(); i++) num[i] = this.get(i);
    for (let i = 0; i < e.getLength(); i++) num[i] ^= QRMath.gexp(QRMath.glog(e.get(i)) + ratio);
    return new QRPolynomial(num, 0).mod(e);
  }
};

const QRRSBlock = (function () {
  const RS_BLOCK_TABLE = [
    [1, 26, 19], [1, 26, 16], [1, 26, 13], [1, 26, 9],
    [1, 44, 34], [1, 44, 28], [1, 44, 22], [1, 44, 16],
    [1, 70, 55], [1, 70, 44], [2, 35, 17], [2, 35, 13],
    [1, 100, 80], [2, 50, 32], [2, 50, 24], [4, 25, 9],
    [1, 134, 108], [2, 67, 43], [2, 33, 15, 2, 34, 16], [2, 33, 11, 2, 34, 12],
    [2, 86, 68], [4, 43, 27], [4, 43, 19], [4, 43, 15],
    [2, 98, 78], [4, 49, 31], [2, 32, 14, 4, 33, 15], [4, 39, 13, 1, 40, 14],
    [2, 121, 97], [2, 60, 38, 2, 61, 39], [4, 40, 18, 2, 41, 19], [4, 40, 14, 2, 41, 15],
    [2, 146, 116], [3, 58, 36, 2, 59, 37], [4, 36, 16, 4, 37, 17], [4, 36, 12, 4, 37, 13],
    [2, 86, 68, 2, 87, 69], [4, 69, 43, 1, 70, 44], [6, 43, 19, 2, 44, 20], [6, 43, 15, 2, 44, 16]
  ];
  function qrRSBlock(totalCount, dataCount) { this.totalCount = totalCount; this.dataCount = dataCount; }
  function getRsBlockTable(typeNumber, errorCorrectLevel) {
    switch (errorCorrectLevel) {
      case QRErrorCorrectLevel.L: return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 0];
      case QRErrorCorrectLevel.M: return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 1];
      case QRErrorCorrectLevel.Q: return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 2];
      case QRErrorCorrectLevel.H: return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 3];
    }
  }
  return {
    getRSBlocks(typeNumber, errorCorrectLevel) {
      const rsBlock = getRsBlockTable(typeNumber, errorCorrectLevel);
      if (rsBlock === undefined) throw new Error("bad rs block @ typeNumber:" + typeNumber + "/errorCorrectLevel:" + errorCorrectLevel);
      const length = rsBlock.length / 3;
      const list = [];
      for (let i = 0; i < length; i++) {
        const count = rsBlock[i * 3 + 0], totalCount = rsBlock[i * 3 + 1], dataCount = rsBlock[i * 3 + 2];
        for (let j = 0; j < count; j++) list.push(new qrRSBlock(totalCount, dataCount));
      }
      return list;
    }
  };
})();

function QRBitBuffer() { this.buffer = []; this.length = 0; }
QRBitBuffer.prototype = {
  get(index) { const bufIndex = Math.floor(index / 8); return ((this.buffer[bufIndex] >>> (7 - index % 8)) & 1) === 1; },
  put(num, length) { for (let i = 0; i < length; i++) this.putBit(((num >>> (length - i - 1)) & 1) === 1); },
  getLengthInBits() { return this.length; },
  putBit(bit) {
    const bufIndex = Math.floor(this.length / 8);
    if (this.buffer.length <= bufIndex) this.buffer.push(0);
    if (bit) this.buffer[bufIndex] |= (0x80 >>> (this.length % 8));
    this.length++;
  }
};

function QR8bitByte(data) {
  this.mode = QRMode.MODE_8BIT_BYTE;
  this.data = data;
  // codificar en UTF-8
  this.bytes = [];
  const s = unescape(encodeURIComponent(data));
  for (let i = 0; i < s.length; i++) this.bytes.push(s.charCodeAt(i));
}
QR8bitByte.prototype = {
  getLength() { return this.bytes.length; },
  write(buffer) { for (let i = 0; i < this.bytes.length; i++) buffer.put(this.bytes[i], 8); }
};

function QRCodeModel(typeNumber, errorCorrectLevel) {
  this.typeNumber = typeNumber; this.errorCorrectLevel = errorCorrectLevel;
  this.modules = null; this.moduleCount = 0; this.dataCache = null; this.dataList = [];
}
QRCodeModel.prototype = {
  addData(data) { this.dataList.push(new QR8bitByte(data)); this.dataCache = null; },
  isDark(row, col) {
    if (row < 0 || this.moduleCount <= row || col < 0 || this.moduleCount <= col) throw new Error(row + "," + col);
    return this.modules[row][col];
  },
  getModuleCount() { return this.moduleCount; },
  make() { this.makeImpl(false, this.getBestMaskPattern()); },
  makeImpl(test, maskPattern) {
    this.moduleCount = this.typeNumber * 4 + 17;
    this.modules = new Array(this.moduleCount);
    for (let row = 0; row < this.moduleCount; row++) { this.modules[row] = new Array(this.moduleCount); for (let col = 0; col < this.moduleCount; col++) this.modules[row][col] = null; }
    this.setupPositionProbePattern(0, 0);
    this.setupPositionProbePattern(this.moduleCount - 7, 0);
    this.setupPositionProbePattern(0, this.moduleCount - 7);
    this.setupPositionAdjustPattern();
    this.setupTimingPattern();
    this.setupTypeInfo(test, maskPattern);
    if (this.typeNumber >= 7) this.setupTypeNumber(test);
    if (this.dataCache === null) this.dataCache = QRCodeModel.createData(this.typeNumber, this.errorCorrectLevel, this.dataList);
    this.mapData(this.dataCache, maskPattern);
  },
  setupPositionProbePattern(row, col) {
    for (let r = -1; r <= 7; r++) { if (row + r <= -1 || this.moduleCount <= row + r) continue; for (let c = -1; c <= 7; c++) {
      if (col + c <= -1 || this.moduleCount <= col + c) continue;
      if ((0 <= r && r <= 6 && (c === 0 || c === 6)) || (0 <= c && c <= 6 && (r === 0 || r === 6)) || (2 <= r && r <= 4 && 2 <= c && c <= 4)) this.modules[row + r][col + c] = true;
      else this.modules[row + r][col + c] = false;
    } }
  },
  getBestMaskPattern() {
    let minLostPoint = 0, pattern = 0;
    for (let i = 0; i < 8; i++) {
      this.makeImpl(true, i);
      const lostPoint = QRUtil.getLostPoint(this);
      if (i === 0 || minLostPoint > lostPoint) { minLostPoint = lostPoint; pattern = i; }
    }
    return pattern;
  },
  setupTimingPattern() {
    for (let r = 8; r < this.moduleCount - 8; r++) { if (this.modules[r][6] !== null) continue; this.modules[r][6] = (r % 2 === 0); }
    for (let c = 8; c < this.moduleCount - 8; c++) { if (this.modules[6][c] !== null) continue; this.modules[6][c] = (c % 2 === 0); }
  },
  setupPositionAdjustPattern() {
    const pos = QRUtil.getPatternPosition(this.typeNumber);
    for (let i = 0; i < pos.length; i++) for (let j = 0; j < pos.length; j++) {
      const row = pos[i], col = pos[j];
      if (this.modules[row][col] !== null) continue;
      for (let r = -2; r <= 2; r++) for (let c = -2; c <= 2; c++) {
        if (r === -2 || r === 2 || c === -2 || c === 2 || (r === 0 && c === 0)) this.modules[row + r][col + c] = true; else this.modules[row + r][col + c] = false;
      }
    }
  },
  setupTypeNumber(test) {
    const bits = QRUtil.getBCHTypeNumber(this.typeNumber);
    for (let i = 0; i < 18; i++) { const mod = (!test && ((bits >> i) & 1) === 1); this.modules[Math.floor(i / 3)][i % 3 + this.moduleCount - 8 - 3] = mod; }
    for (let i = 0; i < 18; i++) { const mod = (!test && ((bits >> i) & 1) === 1); this.modules[i % 3 + this.moduleCount - 8 - 3][Math.floor(i / 3)] = mod; }
  },
  setupTypeInfo(test, maskPattern) {
    const data = (this.errorCorrectLevel << 3) | maskPattern;
    const bits = QRUtil.getBCHTypeInfo(data);
    for (let i = 0; i < 15; i++) {
      const mod = (!test && ((bits >> i) & 1) === 1);
      if (i < 6) this.modules[i][8] = mod; else if (i < 8) this.modules[i + 1][8] = mod; else this.modules[this.moduleCount - 15 + i][8] = mod;
    }
    for (let i = 0; i < 15; i++) {
      const mod = (!test && ((bits >> i) & 1) === 1);
      if (i < 8) this.modules[8][this.moduleCount - i - 1] = mod; else if (i < 9) this.modules[8][15 - i - 1 + 1] = mod; else this.modules[8][15 - i - 1] = mod;
    }
    this.modules[this.moduleCount - 8][8] = (!test);
  },
  mapData(data, maskPattern) {
    let inc = -1, row = this.moduleCount - 1, bitIndex = 7, byteIndex = 0;
    for (let col = this.moduleCount - 1; col > 0; col -= 2) {
      if (col === 6) col--;
      while (true) {
        for (let c = 0; c < 2; c++) {
          if (this.modules[row][col - c] === null) {
            let dark = false;
            if (byteIndex < data.length) dark = (((data[byteIndex] >>> bitIndex) & 1) === 1);
            const mask = QRUtil.getMask(maskPattern, row, col - c);
            if (mask) dark = !dark;
            this.modules[row][col - c] = dark;
            bitIndex--;
            if (bitIndex === -1) { byteIndex++; bitIndex = 7; }
          }
        }
        row += inc;
        if (row < 0 || this.moduleCount <= row) { row -= inc; inc = -inc; break; }
      }
    }
  }
};
QRCodeModel.PAD0 = 0xEC; QRCodeModel.PAD1 = 0x11;
QRCodeModel.createData = function (typeNumber, errorCorrectLevel, dataList) {
  const rsBlocks = QRRSBlock.getRSBlocks(typeNumber, errorCorrectLevel);
  const buffer = new QRBitBuffer();
  for (let i = 0; i < dataList.length; i++) {
    const data = dataList[i];
    buffer.put(data.mode, 4);
    buffer.put(data.getLength(), QRUtil.getLengthInBits(data.mode, typeNumber));
    data.write(buffer);
  }
  let totalDataCount = 0;
  for (let i = 0; i < rsBlocks.length; i++) totalDataCount += rsBlocks[i].dataCount;
  if (buffer.getLengthInBits() > totalDataCount * 8) throw new Error("code length overflow. (" + buffer.getLengthInBits() + ">" + totalDataCount * 8 + ")");
  if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) buffer.put(0, 4);
  while (buffer.getLengthInBits() % 8 !== 0) buffer.putBit(false);
  while (true) {
    if (buffer.getLengthInBits() >= totalDataCount * 8) break;
    buffer.put(QRCodeModel.PAD0, 8);
    if (buffer.getLengthInBits() >= totalDataCount * 8) break;
    buffer.put(QRCodeModel.PAD1, 8);
  }
  return QRCodeModel.createBytes(buffer, rsBlocks);
};
QRCodeModel.createBytes = function (buffer, rsBlocks) {
  let offset = 0, maxDcCount = 0, maxEcCount = 0;
  const dcdata = new Array(rsBlocks.length), ecdata = new Array(rsBlocks.length);
  for (let r = 0; r < rsBlocks.length; r++) {
    const dcCount = rsBlocks[r].dataCount, ecCount = rsBlocks[r].totalCount - dcCount;
    maxDcCount = Math.max(maxDcCount, dcCount); maxEcCount = Math.max(maxEcCount, ecCount);
    dcdata[r] = new Array(dcCount);
    for (let i = 0; i < dcdata[r].length; i++) dcdata[r][i] = 0xff & buffer.buffer[i + offset];
    offset += dcCount;
    const rsPoly = QRUtil.getErrorCorrectPolynomial(ecCount);
    const rawPoly = new QRPolynomial(dcdata[r], rsPoly.getLength() - 1);
    const modPoly = rawPoly.mod(rsPoly);
    ecdata[r] = new Array(rsPoly.getLength() - 1);
    for (let i = 0; i < ecdata[r].length; i++) { const modIndex = i + modPoly.getLength() - ecdata[r].length; ecdata[r][i] = (modIndex >= 0) ? modPoly.get(modIndex) : 0; }
  }
  let totalCodeCount = 0;
  for (let i = 0; i < rsBlocks.length; i++) totalCodeCount += rsBlocks[i].totalCount;
  const data = new Array(totalCodeCount); let index = 0;
  for (let i = 0; i < maxDcCount; i++) for (let r = 0; r < rsBlocks.length; r++) if (i < dcdata[r].length) data[index++] = dcdata[r][i];
  for (let i = 0; i < maxEcCount; i++) for (let r = 0; r < rsBlocks.length; r++) if (i < ecdata[r].length) data[index++] = ecdata[r][i];
  return data;
};

// Selecciona automáticamente la version minima que soporte los datos (modo byte, EC level M)
function createQRCode(text, ecLevel) {
  ecLevel = ecLevel || QRErrorCorrectLevel.M;
  for (let typeNumber = 1; typeNumber <= 40; typeNumber++) {
    try {
      const qr = new QRCodeModel(typeNumber, ecLevel);
      qr.addData(text);
      qr.make();
      return qr;
    } catch (e) {
      if (typeNumber === 40) throw e;
      continue;
    }
  }
}


// Genera un pitido corto con Web Audio API — sin depender de ningún archivo de audio externo.
// Un solo AudioContext compartido, reutilizado en cada pitido — en iOS, el sonido necesita
// "desbloquearse" con un toque real del usuario (ver unlockAudio, llamado desde el botón
// "Iniciar"); crear un contexto nuevo cada vez puede quedar en silencio sin ese desbloqueo previo.
let __sharedAudioCtx = null;
function getAudioContext() {
  if (!__sharedAudioCtx) {
    try { __sharedAudioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (e) { return null; }
  }
  return __sharedAudioCtx;
}
function unlockAudio() {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  // sonido silencioso e inmediato, solo para "activar" el audio en este toque de usuario
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.01);
  } catch (e) { /* no crítico */ }
}
function playBeep(freq = 880, durationMs = 180) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + durationMs / 1000);
  } catch (e) { /* audio no disponible, no es crítico */ }
}
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function formatClock(totalSec) {
  const h = Math.floor(totalSec / 3600), m = Math.floor((totalSec % 3600) / 60), s = Math.floor(totalSec % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}
function PhaseOverviewStrip({ segments, currentIdx }) {
  return (
    <div className="w-full overflow-x-auto mb-4">
      <div className="flex gap-1.5 px-1 pb-1" style={{ minWidth: "max-content" }}>
        {segments.map((s, i) => (
          <div key={i}
            className="flex flex-col items-center justify-center rounded-lg px-2.5 py-1.5 text-[10px] font-semibold whitespace-nowrap"
            style={{
              background: i === currentIdx ? COLORS.track : i < currentIdx ? COLORS.surface2 : COLORS.bg,
              color: i === currentIdx ? COLORS.lane : i < currentIdx ? COLORS.textMuted : COLORS.textMuted,
              border: `1px solid ${i === currentIdx ? COLORS.track : COLORS.border}`,
              opacity: i < currentIdx ? 0.6 : 1,
            }}>
            <span>{i + 1}. {s.label}</span>
            <span style={{ opacity: 0.8 }}>{s.type === "time" ? `${s.target < 1 ? Math.round(s.target * 60) + "s" : s.target + "'"}` : `${s.target} km`}</span>
          </div>
        ))}
        <div className="flex flex-col items-center justify-center rounded-lg px-2.5 py-1.5 text-[10px] font-semibold whitespace-nowrap"
          style={{ background: currentIdx >= segments.length ? COLORS.track : COLORS.bg, color: currentIdx >= segments.length ? COLORS.lane : COLORS.textMuted, border: `1px solid ${COLORS.border}` }}>
          <span>{segments.length + 1}. Libre</span>
          <span style={{ opacity: 0.8 }}>hasta Terminar</span>
        </div>
      </div>
    </div>
  );
}
function LiveTrainingScreen({ day, easyPace, onClose, onComplete }) {
  const segments = useMemo(() => buildLiveSegments(day, easyPace), [day, easyPace]);
  const [status, setStatus] = useState("ready"); // ready | running | paused | done
  const [segIdx, setSegIdx] = useState(0); // segments.length o mas = fase final libre
  const [segDistanceKm, setSegDistanceKm] = useState(0);
  const [segElapsedSec, setSegElapsedSec] = useState(0);
  const [totalKm, setTotalKm] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [gpsMode, setGpsMode] = useState("pending"); // pending | real | manual | denied
  const [flash, setFlash] = useState(null);
  const [screenFlash, setScreenFlash] = useState(false);
  const lastPosRef = React.useRef(null);
  const watchIdRef = React.useRef(null);
  const timerRef = React.useRef(null);
  const wakeLockRef = React.useRef(null);
  const [wakeLockOn, setWakeLockOn] = useState(false);

  const isOpenPhase = segIdx >= segments.length;
  const currentSeg = isOpenPhase ? { label: "Fase final (libre)", type: "open" } : segments[segIdx];
  const isLastDefinedSeg = segIdx === segments.length - 1;

  // Mantiene la pantalla encendida mientras el entrenamiento está corriendo o pausado, para que
  // el cronómetro y las alertas de cada fase sigan funcionando (en iOS, con la pantalla apagada,
  // el navegador deja de ejecutar el código en segundo plano). Se libera al cerrar o terminar.
  useEffect(() => {
    let cancelled = false;
    const acquire = async () => {
      if (!("wakeLock" in navigator)) return;
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (cancelled) { lock.release().catch(() => {}); return; }
        wakeLockRef.current = lock;
        setWakeLockOn(true);
        lock.addEventListener("release", () => { wakeLockRef.current = null; setWakeLockOn(false); });
      } catch (e) { setWakeLockOn(false); }
    };
    const release = () => {
      if (wakeLockRef.current) { wakeLockRef.current.release().catch(() => {}); wakeLockRef.current = null; }
      setWakeLockOn(false);
    };
    if (status === "running" || status === "paused") acquire();
    else release();
    // iOS libera el wake lock si la pestaña pierde visibilidad (cambiaste de app un momento) —
    // lo volvemos a pedir apenas la app vuelve a estar visible.
    const onVisibility = () => {
      if (document.visibilityState === "visible" && (status === "running" || status === "paused") && !wakeLockRef.current) acquire();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { cancelled = true; document.removeEventListener("visibilitychange", onVisibility); };
  }, [status]);
  useEffect(() => () => { if (wakeLockRef.current) wakeLockRef.current.release().catch(() => {}); }, []);

  useEffect(() => {
    if (status !== "running") return;
    timerRef.current = setInterval(() => { setElapsedSec((s) => s + 1); setSegElapsedSec((s) => s + 1); }, 1000);
    return () => clearInterval(timerRef.current);
  }, [status]);

  useEffect(() => {
    if (status !== "running") return;
    if (!("geolocation" in navigator)) { setGpsMode("manual"); return; }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsMode("real");
        const { latitude, longitude } = pos.coords;
        if (lastPosRef.current) {
          const d = haversineKm(lastPosRef.current.lat, lastPosRef.current.lon, latitude, longitude);
          if (d > 0.001 && d < 0.2) { // filtra saltos irreales de precisión GPS
            setSegDistanceKm((v) => v + d);
            setTotalKm((v) => v + d);
          }
        }
        lastPosRef.current = { lat: latitude, lon: longitude };
      },
      () => setGpsMode((m) => (m === "real" ? m : "denied")),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 8000 }
    );
    watchIdRef.current = id;
    return () => { if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current); };
  }, [status]);

  // avanzar de fase automáticamente al llegar a la meta del segmento actual (por tiempo o
  // por distancia, según corresponda) — al terminar la última fase definida, pasa a una fase
  // final libre que solo se cierra al presionar "Terminar".
  useEffect(() => {
    if (status !== "running" || isOpenPhase || !currentSeg) return;
    const reached = currentSeg.type === "time" ? segElapsedSec >= (currentSeg.target || 0.1) * 60 : segDistanceKm >= (currentSeg.target || 0.05);
    if (reached) {
      playBeep(isLastDefinedSeg ? 660 : 990, 220);
      if (navigator.vibrate) navigator.vibrate(isLastDefinedSeg ? [200, 100, 200] : 200);
      setScreenFlash(true);
      setTimeout(() => setScreenFlash(false), 500);
      setSegIdx((i) => i + 1);
      setSegDistanceKm(0);
      setSegElapsedSec(0);
      setFlash(isLastDefinedSeg ? "¡Fase final! Sigue acumulando o presiona Terminar cuando quieras." : `Siguiente: ${segments[segIdx + 1]?.label}`);
      setTimeout(() => setFlash(null), 3500);
    }
  }, [segDistanceKm, segElapsedSec, status]);

  const addManualDistance = (km) => {
    setSegDistanceKm((v) => v + km);
    setTotalKm((v) => v + km);
  };

  const start = () => { unlockAudio(); setStatus("running"); };
  const pause = () => setStatus("paused");
  const resume = () => { unlockAudio(); setStatus("running"); };
  const finishNow = () => { setStatus("done"); playBeep(660, 220); };

  const avgPace = totalKm > 0.05 ? elapsedSec / 60 / totalKm : null;

  if (status === "done") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center px-6" style={{ background: COLORS.bg }}>
        <Check size={48} style={{ color: COLORS.easy }} />
        <h2 className="text-2xl font-bold mt-4 mb-1" style={{ fontFamily: "'Oswald', sans-serif", color: COLORS.textPrimary }}>¡Listo!</h2>
        <p className="text-sm mb-6" style={{ color: COLORS.textMuted }}>Resumen de tu sesión</p>
        <div className="grid grid-cols-3 gap-4 mb-8 w-full max-w-sm">
          <div className="text-center">
            <div className="text-2xl font-bold font-mono" style={{ color: COLORS.track }}>{r1(totalKm)}</div>
            <div className="text-[10px] uppercase" style={{ color: COLORS.textMuted }}>km</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold font-mono" style={{ color: COLORS.track }}>{formatClock(elapsedSec)}</div>
            <div className="text-[10px] uppercase" style={{ color: COLORS.textMuted }}>tiempo</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold font-mono" style={{ color: COLORS.track }}>{avgPace ? formatPace(avgPace) : "—"}</div>
            <div className="text-[10px] uppercase" style={{ color: COLORS.textMuted }}>ritmo/km</div>
          </div>
        </div>
        {gpsMode !== "real" && (
          <p className="text-xs text-center mb-6 max-w-sm" style={{ color: COLORS.moderate }}>
            El GPS no estuvo disponible en esta prueba — la distancia de arriba es simulada/manual, no una medición real.
          </p>
        )}
        <div className="flex gap-3 w-full max-w-sm">
          <button onClick={onClose} className="flex-1 px-4 py-3 rounded-lg text-sm font-semibold" style={{ background: COLORS.surface2, color: COLORS.lane }}>
            Cerrar sin guardar
          </button>
          <button
            onClick={() => onComplete({ actualKm: r1(totalKm), actualPaceStr: avgPace ? formatPace(avgPace) : "" })}
            className="flex-1 px-4 py-3 rounded-lg text-sm font-semibold" style={{ background: COLORS.track, color: COLORS.lane }}>
            Guardar como completado
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: COLORS.bg }}>
      {screenFlash && (
        <div className="fixed inset-0 z-[60] pointer-events-none" style={{ background: COLORS.track, animation: "screenFlashPulse 0.5s ease-out" }} />
      )}
      <div className="flex items-center justify-between px-5 pt-5">
        <button onClick={onClose} className="p-2 rounded-lg" style={{ color: COLORS.textMuted }}><X size={20} /></button>
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-xs uppercase tracking-wide" style={{ color: COLORS.textMuted }}>
            {gpsMode === "real" ? "📍 GPS activo" : gpsMode === "denied" ? "⚠️ Sin GPS — modo manual" : gpsMode === "manual" ? "✋ Modo manual" : "Listo para empezar"}
          </span>
          {(status === "running" || status === "paused") && (
            <span className="text-[10px]" style={{ color: wakeLockOn ? COLORS.easy : COLORS.moderate }}>
              {wakeLockOn ? "🔆 Pantalla se mantiene encendida" : "⚠️ No se pudo evitar que la pantalla se apague"}
            </span>
          )}
        </div>
        <div style={{ width: 36 }} />
      </div>

      <div className="px-3 pt-3">
        <PhaseOverviewStrip segments={segments} currentIdx={segIdx} />
      </div>

      {flash && (
        <div className="mx-5 mt-1 rounded-lg p-3 text-center text-sm font-semibold animate-fadein" style={{ background: COLORS.track, color: COLORS.lane }}>
          {flash}
        </div>
      )}

      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="text-xs uppercase tracking-wide mb-2" style={{ color: COLORS.track }}>
          {isOpenPhase ? "Fase libre" : `Fase ${segIdx + 1} de ${segments.length}`}
        </div>
        <div className="text-3xl font-bold mb-1 text-center" style={{ fontFamily: "'Oswald', sans-serif", color: COLORS.textPrimary }}>
          {currentSeg?.label}
        </div>
        {currentSeg?.pace && (
          <div className="text-sm mb-8" style={{ color: COLORS.textMuted }}>Ritmo objetivo: {formatPace(currentSeg.pace)}/km</div>
        )}
        {!currentSeg?.pace && <div className="mb-8" />}

        <div className="text-6xl font-bold font-mono mb-2" style={{ color: COLORS.lane }}>{formatClock(elapsedSec)}</div>

        {isOpenPhase ? (
          <div className="text-lg font-mono mb-1" style={{ color: COLORS.textMuted }}>
            {formatClock(segElapsedSec)} · {r1(segDistanceKm)} km en esta fase
          </div>
        ) : currentSeg?.type === "time" ? (
          <div className="text-lg font-mono mb-1" style={{ color: COLORS.textMuted }}>
            {formatClock(segElapsedSec)} / {formatClock((currentSeg?.target || 0) * 60)} de esta fase
          </div>
        ) : (
          <div className="text-lg font-mono mb-1" style={{ color: COLORS.textMuted }}>
            {r1(segDistanceKm)} / {r1(currentSeg?.target || 0)} km de esta fase
          </div>
        )}

        {!isOpenPhase && (
          <div className="w-full max-w-xs h-2 rounded-full overflow-hidden mb-8" style={{ background: COLORS.surface2 }}>
            <div className="h-full" style={{
              width: `${Math.min(100, currentSeg?.type === "time" ? (segElapsedSec / ((currentSeg?.target || 1) * 60)) * 100 : (segDistanceKm / (currentSeg?.target || 1)) * 100)}%`,
              background: COLORS.track,
            }} />
          </div>
        )}
        {isOpenPhase && <div className="mb-8" />}

        {gpsMode !== "real" && status === "running" && (
          <div className="flex gap-2 mb-6">
            <button onClick={() => addManualDistance(0.1)} className="px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: COLORS.surface2, color: COLORS.lane }}>+100 m</button>
            <button onClick={() => addManualDistance(0.5)} className="px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: COLORS.surface2, color: COLORS.lane }}>+500 m</button>
            <button onClick={() => addManualDistance(1)} className="px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: COLORS.surface2, color: COLORS.lane }}>+1 km</button>
          </div>
        )}

        {status === "ready" && (
          <button onClick={start} className="px-10 py-4 rounded-full text-base font-bold" style={{ background: COLORS.track, color: COLORS.lane }}>
            Iniciar
          </button>
        )}
        {status === "running" && (
          <div className="flex gap-3">
            <button onClick={pause} className="px-6 py-3 rounded-full text-sm font-semibold" style={{ background: COLORS.surface2, color: COLORS.lane }}>Pausar</button>
            <button onClick={finishNow} className="px-6 py-3 rounded-full text-sm font-semibold" style={{ background: COLORS.moderate, color: COLORS.lane }}>Terminar</button>
          </div>
        )}
        {status === "paused" && (
          <div className="flex gap-3">
            <button onClick={resume} className="px-6 py-3 rounded-full text-sm font-semibold" style={{ background: COLORS.track, color: COLORS.lane }}>Reanudar</button>
            <button onClick={finishNow} className="px-6 py-3 rounded-full text-sm font-semibold" style={{ background: COLORS.moderate, color: COLORS.lane }}>Terminar</button>
          </div>
        )}
      </div>
    </div>
  );
}
function QRCodeSVG({ text, size = 220 }) {
  const qr = useMemo(() => {
    try { return createQRCode(text, QRErrorCorrectLevel.M); }
    catch (e) { return null; }
  }, [text]);
  if (!qr) return null;
  const count = qr.getModuleCount();
  const margin = 2; // módulos de margen blanco
  const total = count + margin * 2;
  const rects = [];
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) rects.push(`M${col + margin},${row + margin}h1v1h-1z`);
    }
  }
  return (
    <svg viewBox={`0 0 ${total} ${total}`} width={size} height={size} style={{ background: "#fff", borderRadius: 8 }}>
      <path d={rects.join("")} fill="#000" />
    </svg>
  );
}
function PrintableWeek({ student, week, weekNum }) {
  if (!student || !week) return null;
  return (
    <div className="print-only" style={{ padding: "32px", color: "#111", background: "#fff", fontFamily: "Arial, sans-serif" }}>
      <h1 style={{ fontSize: 22, marginBottom: 2 }}>{student.name}</h1>
      <p style={{ fontSize: 13, color: "#555", marginBottom: 4 }}>
        {GOAL_LABEL[student.goal]} · {LEVEL_LABEL[student.level]} · {getWeekTitle(student, weekNum)}
        {week.weeklyKm != null ? ` · ${week.weeklyKm} km` : ""}
      </p>
      {student.raceDate && <p style={{ fontSize: 12, color: "#777", marginBottom: 16 }}>Fecha de carrera: {student.raceDate}</p>}
      {week.note && <p style={{ fontSize: 12, color: "#777", marginBottom: 16, fontStyle: "italic" }}>{week.note}</p>}
      {week.plan.map((d, i) => {
        const detail = d.paceKey ? getSessionDetail(d) : null;
        return (
          <div key={i} style={{ marginBottom: 14, paddingBottom: 10, borderBottom: "1px solid #ddd", breakInside: "avoid" }}>
            <div style={{ fontWeight: "bold", fontSize: 14 }}>
              {DAYS[i]} — {d.type}{d.paceKey ? ` (${d.km} km)` : ""}
            </div>
            {!d.paceKey && <div style={{ fontSize: 12, color: "#777" }}>Descanso</div>}
            {detail && detail.map((seg, si) => (
              <div key={si} style={{ fontSize: 12, color: "#333", marginTop: 3 }}>
                <b>{seg.label}:</b> {seg.text}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
function AdherenceBadge({ pct }) {
  if (pct === null || pct === undefined) return <Pill color={COLORS.textMuted}>Sin datos</Pill>;
  const pctNum = Math.round(pct * 100);
  let color = COLORS.moderate, Icon = Minus;
  if (pct >= 0.9) { color = COLORS.easy; Icon = TrendingUp; }
  else if (pct < 0.7) { color = COLORS.track; Icon = TrendingDown; }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold"
      style={{ background: color + "22", color, border: `1px solid ${color}55` }}>
      <Icon size={12} /> {pctNum}%
    </span>
  );
}

function SessionDetail({ segments }) {
  if (!segments) return null;
  return (
    <div className="mt-2 space-y-1 rounded-lg p-2" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}` }}>
      {segments.map((s, i) => (
        <div key={i} className="flex items-start gap-2 text-xs">
          <span style={{ width: 8, height: 8, borderRadius: 999, background: s.color, marginTop: 4, flexShrink: 0 }} />
          <span style={{ color: COLORS.textMuted }}><strong style={{ color: COLORS.textPrimary }}>{s.label}:</strong> {s.text}</span>
        </div>
      ))}
    </div>
  );
}

/* Barras de progreso histórico del alumno (adherencia semanal vs objetivo) */
// Racha: cuántas semanas SEGUIDAS (contando hacia atrás, las que el alumno mismo envió)
// tuvo una adherencia de 90% o más.
function computeStreak(student) {
  const weekNums = Object.keys(student.weeks).map(Number)
    .filter((n) => student.weeks[n].studentSubmitted)
    .sort((a, b) => b - a);
  let streak = 0;
  for (const n of weekNums) {
    if ((student.weeks[n].adherencePct ?? 0) >= 0.9) streak++;
    else break;
  }
  return streak;
}
// Kilometraje acumulado real (lo efectivamente corrido) desde el 1 de enero del año en curso.
function computeYearToDateKm(student) {
  const currentYear = new Date().getFullYear();
  let total = 0;
  Object.keys(student.weeks).forEach((wkNum) => {
    const { monday } = getWeekDates(student, Number(wkNum));
    if (monday.getFullYear() !== currentYear) return;
    const week = student.weeks[wkNum];
    (week.log || []).forEach((l, i) => {
      const planDay = week.plan?.[i];
      if (l?.completed && planDay?.paceKey) {
        const km = l.actualKm !== "" && l.actualKm != null && !isNaN(Number(l.actualKm)) ? Number(l.actualKm) : planDay.km;
        total += km || 0;
      }
    });
  });
  return r1(total);
}
// Kilometraje real (lo efectivamente corrido) de cada semana del historial completo del alumno.
function getStudentKmHistory(student) {
  return Object.keys(student.weeks).map((wkNum) => {
    const n = Number(wkNum);
    const { monday } = getWeekDates(student, n);
    const week = student.weeks[wkNum];
    let km = 0;
    (week.log || []).forEach((l, i) => {
      const planDay = week.plan?.[i];
      if (l?.completed && planDay?.paceKey) {
        const dayKm = l.actualKm !== "" && l.actualKm != null && !isNaN(Number(l.actualKm)) ? Number(l.actualKm) : planDay.km;
        km += dayKm || 0;
      }
    });
    return { weekNum: n, monday, km: r1(km) };
  }).sort((a, b) => a.weekNum - b.weekNum);
}
// Agrupa el historial semanal en totales por mes o por año.
function aggregateKmHistory(history, groupBy) {
  const groups = {};
  const order = [];
  history.forEach((row) => {
    let key, label;
    if (groupBy === "month") {
      key = `${row.monday.getFullYear()}-${String(row.monday.getMonth() + 1).padStart(2, "0")}`;
      label = `${MONTH_NAMES_ES[row.monday.getMonth()]} ${row.monday.getFullYear()}`;
    } else {
      key = String(row.monday.getFullYear());
      label = key;
    }
    if (!(key in groups)) { groups[key] = { label, km: 0 }; order.push(key); }
    groups[key].km += row.km;
  });
  return order.map((key) => ({ label: groups[key].label, km: r1(groups[key].km) }));
}
const MONTH_NAMES_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
function ProgressChart({ student, activeWeekNum }) {
  const viewedWeekNum = activeWeekNum ?? student.currentWeek;
  const week = student.weeks[viewedWeekNum] ?? student.weeks[student.currentWeek];
  const trainSlots = week.plan.map((d, i) => ({ d, i })).filter((x) => !!x.d.paceKey);
  const completedCount = trainSlots.filter((x) => week.log[x.i]?.completed).length;
  const totalCount = trainSlots.length;
  const dailyPct = totalCount > 0 ? completedCount / totalCount : 0;

  const isRaceGoal = !isFitnessGoal(student.goal) && student.level !== "principiante" && !!student.raceDate;
  const bars = [];
  for (let w = 1; w <= student.currentWeek; w++) {
    const wk = student.weeks[w];
    if (!wk) continue;
    const { adherencePct } = computeAdherence(wk.plan, wk.log);
    const load = wk.weeklyKm ?? null;
    bars.push({ weekNum: w, load, adherencePct, ghost: false, current: w === viewedWeekNum });
  }
  if (isRaceGoal) {
    const projection = projectWeeklyVolumes(student);
    if (projection.kind === "race") {
      projection.rows.filter((r) => r.weekNum > student.currentWeek).forEach((r) => {
        bars.push({ weekNum: r.weekNum, load: r.km, ghost: true, current: r.weekNum === viewedWeekNum });
      });
    }
  }
  const loads = bars.map((b) => b.load).filter((l) => l != null);
  const maxLoad = loads.length ? Math.max(...loads) : 1;
  const lastBar = bars[bars.length - 1];
  const streak = computeStreak(student);
  const ytdKm = computeYearToDateKm(student);

  return (
    <div className="rounded-xl p-4 space-y-4" style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm font-semibold" style={{ color: COLORS.textPrimary, fontFamily: "'Oswald', sans-serif" }}>TU EVOLUCIÓN</div>
        <div className="flex items-center gap-3 text-xs" style={{ color: COLORS.textMuted }}>
          {streak >= 2 && (
            <span className="flex items-center gap-1 font-semibold" style={{ color: COLORS.track }}>🔥 {streak} semanas seguidas</span>
          )}
          <span>{ytdKm} km en {new Date().getFullYear()}</span>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs" style={{ color: COLORS.textMuted }}>Esta semana</span>
          <span className="text-xs font-semibold" style={{ color: COLORS.textPrimary }}>{completedCount}/{totalCount} sesiones</span>
        </div>
        <div className="w-full rounded-full overflow-hidden" style={{ height: 12, background: COLORS.surface2 }}>
          <div style={{ width: `${Math.max(2, dailyPct * 100)}%`, height: "100%", background: dailyPct >= 1 ? COLORS.easy : COLORS.track, transition: "width 0.4s ease" }} />
        </div>
      </div>

      {bars.length > 1 && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs" style={{ color: COLORS.textMuted }}>{getWeekTitle(student, bars[0].weekNum)}</span>
            <span className="text-xs" style={{ color: COLORS.textMuted }}>
              {isRaceGoal ? getWeekTitle(student, lastBar.weekNum) : "Hoy"}
            </span>
          </div>
          <div className="flex items-end gap-1" style={{ height: 90 }}>
            {bars.map((b) => {
              const h = b.load != null ? Math.max(6, (b.load / maxLoad) * 100) : (b.ghost ? 15 : Math.max(6, b.adherencePct * 100));
              const fillColor = b.adherencePct >= 0.9 ? COLORS.easy : b.adherencePct < 0.7 ? COLORS.track : COLORS.moderate;
              return (
                <div key={b.weekNum} className="flex flex-col items-center justify-end flex-1" style={{ height: "100%", minWidth: 6 }}>
                  <div style={{
                    width: "100%", maxWidth: 22, height: `${h}%`, borderRadius: 4,
                    background: b.ghost ? "transparent" : fillColor,
                    border: b.ghost ? `1.5px dashed ${COLORS.border}` : (b.current ? `2px solid ${COLORS.lane}` : "none"),
                    opacity: b.ghost ? 0.6 : 1,
                  }} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function LapCard({ day, index, mode, log, onChangeDay, onChangeLog, isToday, isRaceGoal, onStartLive, onSwapDay }) {
  const zone = ZONE_BY_PACEKEY[day.paceKey] || "rest";
  const zoneColor = ZONE_COLOR[zone];
  const isRest = !day.paceKey;
  const detail = getSessionDetail(day);
  const highlightToday = isToday && !log?.completed;

  return (
    <div className="rounded-xl overflow-hidden flex flex-col animate-fadein"
      style={{
        background: COLORS.surface2,
        border: highlightToday ? `2px solid ${COLORS.track}` : `1px solid ${COLORS.border}`,
        boxShadow: highlightToday ? `0 0 0 3px ${COLORS.track}33` : "none",
        opacity: log?.completed ? 0.55 : 1, transition: "opacity 0.25s ease, box-shadow 0.25s ease",
      }}>
      {highlightToday && (
        <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-widest" style={{ background: COLORS.track, color: COLORS.lane }}>
          Hoy · te toca esto
        </div>
      )}
      <div className="flex items-stretch">
        <div style={{ width: 6, background: zoneColor, flexShrink: 0 }} />
        <div className="p-3 flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-semibold tracking-widest uppercase"
              style={{ fontFamily: "'Oswald', sans-serif", color: COLORS.textMuted }}>
              {String(index + 1).padStart(2, "0")} · {day.day}
            </span>
            <div className="flex items-center gap-2">
              {mode === "edit" && onSwapDay && (
                <select value="" onChange={(e) => { if (e.target.value !== "") onSwapDay(index, Number(e.target.value)); }}
                  className="text-[10px] rounded px-1 py-0.5" style={{ background: COLORS.bg, color: COLORS.track, border: `1px solid ${COLORS.track}55` }}>
                  <option value="">🔀 Mover a…</option>
                  {DAYS.map((d, i) => i !== index && <option key={i} value={i}>{d}</option>)}
                </select>
              )}
              {log?.completed && <span style={{ color: COLORS.easy }}><Check size={16} /></span>}
            </div>
          </div>

          {mode === "edit" ? (
            <input type="text" value={day.type}
              onChange={(e) => onChangeDay(index, { ...day, type: e.target.value })}
              className="mt-0.5 w-full rounded px-2 py-1 text-sm font-semibold"
              style={{ background: COLORS.bg, color: COLORS.textPrimary, border: `1px solid ${COLORS.border}`, fontFamily: "'Oswald', sans-serif" }} />
          ) : (
            <div className="mt-0.5 text-base font-semibold truncate" style={{ fontFamily: "'Oswald', sans-serif", color: COLORS.textPrimary }}>{day.type}</div>
          )}

          {mode === "edit" ? (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <select value={displayPaceKey(day.paceKey)}
                onChange={(e) => { const paceKey = e.target.value; onChangeDay(index, { ...day, paceKey, km: paceKey ? day.km : 0 }); }}
                className="rounded px-2 py-1 text-xs" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                {PACE_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
              <input type="number" min="0" step="0.5" value={day.km}
                onChange={(e) => onChangeDay(index, { ...day, km: Number(e.target.value) || 0 })}
                className="rounded px-2 py-1 text-xs font-mono" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
              {displayPaceKey(day.paceKey) === "T" && (
                <select value={day.paceKey} onChange={(e) => onChangeDay(index, { ...day, paceKey: e.target.value })}
                  className="col-span-2 rounded px-2 py-1 text-xs" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                  {T_VARIANTS.map((v) => <option key={v.key} value={v.key}>Umbral · {v.label}</option>)}
                </select>
              )}
              {displayPaceKey(day.paceKey) === "custom" && (
                <select value={day.paceKey} onChange={(e) => onChangeDay(index, { ...day, paceKey: e.target.value })}
                  className="col-span-2 rounded px-2 py-1 text-xs" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                  {OTRO_TEMPLATES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              )}
              {day.paceKey === "E" && !day.stageLabel && (
                <label className="col-span-2 flex items-center gap-2 text-xs cursor-pointer" style={{ color: COLORS.textMuted }}>
                  <input type="checkbox" checked={!!day.runWalk} onChange={(e) => {
                      const runWalk = e.target.checked;
                      const defaultTitles = ["Easy", "Recuperación", "Run/Walk"];
                      const type = defaultTitles.includes(day.type) ? (getDefaultTitle("E", day.isMondayRecovery, runWalk) ?? day.type) : day.type;
                      onChangeDay(index, { ...day, runWalk, type });
                    }} style={{ accentColor: COLORS.track }} />
                  Estructurar como Run/Walk
                </label>
              )}
              {(day.paceKey === "R" || day.paceKey === "I" || day.paceKey === "T") && (
                <div className="col-span-2 flex flex-wrap gap-2 pt-1" style={{ borderTop: `1px dashed ${COLORS.border}` }}>
                  <div style={{ minWidth: 90 }}>
                    <label className="block text-[9px] uppercase tracking-wide mb-1" style={{ color: COLORS.textMuted }}>
                      {day.paceKey === "T" ? "Duración (min)" : "Distancia"}
                    </label>
                    <select value={day.distOverride ?? ""} onChange={(e) => {
                        const next = { ...day, distOverride: e.target.value ? Number(e.target.value) : null, repsOverride: null };
                        onChangeDay(index, { ...next, km: computeImpliedKm(next) });
                      }}
                      className="w-full rounded px-1.5 py-1 text-[11px]" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                      <option value="">Auto</option>
                      {(day.paceKey === "T" ? T_DURATIONS : day.paceKey === "I" ? I_DISTANCES : R_DISTANCES).map((v) => (
                        <option key={v} value={v}>{day.paceKey === "T" ? `${v}'` : formatDist(v)}</option>
                      ))}
                    </select>
                  </div>
                  {day.paceKey !== "T" && (
                    <div style={{ minWidth: 80 }}>
                      <label className="block text-[9px] uppercase tracking-wide mb-1" style={{ color: COLORS.textMuted }}>Repeticiones</label>
                      <select value={day.repsOverride ?? ""} onChange={(e) => {
                          const next = { ...day, repsOverride: e.target.value ? Number(e.target.value) : null };
                          onChangeDay(index, { ...next, km: computeImpliedKm(next) });
                        }}
                        className="w-full rounded px-1.5 py-1 text-[11px]" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                        <option value="">Auto</option>
                        {(day.paceKey === "I" ? [2, 3, 4, 5, 6, 8, 10] : [6, 8, 10, 12, 14]).map((v) => (
                          <option key={v} value={v}>{v}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div style={{ minWidth: 90 }}>
                    <label className="block text-[9px] uppercase tracking-wide mb-1" style={{ color: COLORS.textMuted }}>Ritmo (m:ss)</label>
                    <input type="text" placeholder="Auto" value={day.paceOverrideStr ?? ""}
                      onChange={(e) => {
                        const str = e.target.value;
                        const parsed = parsePaceToDecimal(str);
                        const next = { ...day, paceOverrideStr: str, paceOverride: parsed };
                        onChangeDay(index, { ...next, km: computeImpliedKm(next) });
                      }}
                      className="w-full rounded px-1.5 py-1 text-[11px] font-mono" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
                  </div>
                  {day.paceKey !== "T" && (
                    <div style={{ minWidth: 90 }}>
                      <label className="block text-[9px] uppercase tracking-wide mb-1" style={{ color: COLORS.textMuted }}>Descanso (min)</label>
                      <input type="number" min="0" step="0.25" placeholder="Auto" value={day.recoveryOverride ?? ""}
                        onChange={(e) => {
                          const next = { ...day, recoveryOverride: e.target.value ? Number(e.target.value) : null };
                          onChangeDay(index, { ...next, km: computeImpliedKm(next) });
                        }}
                        className="w-full rounded px-1.5 py-1 text-[11px] font-mono" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
                    </div>
                  )}
                </div>
              )}
              {day.paceKey === "brokenT" && (
                <div className="col-span-2 flex flex-wrap gap-2 pt-1" style={{ borderTop: `1px dashed ${COLORS.border}` }}>
                  <div style={{ minWidth: 90 }}>
                    <label className="block text-[9px] uppercase tracking-wide mb-1" style={{ color: COLORS.textMuted }}>Duración pasada (min)</label>
                    <input type="number" min="1" step="1" value={day.distOverride ?? 8}
                      onChange={(e) => {
                        const next = { ...day, distOverride: e.target.value ? Number(e.target.value) : 8 };
                        onChangeDay(index, { ...next, km: computeImpliedKm(next) });
                      }}
                      className="w-full rounded px-1.5 py-1 text-[11px] font-mono" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
                  </div>
                  <div style={{ minWidth: 100 }}>
                    <label className="block text-[9px] uppercase tracking-wide mb-1" style={{ color: COLORS.textMuted }}>Umbral de referencia</label>
                    <select value={day.brokenTRefMin ?? 25}
                      onChange={(e) => {
                        const next = { ...day, brokenTRefMin: Number(e.target.value) };
                        onChangeDay(index, { ...next, km: computeImpliedKm(next) });
                      }}
                      className="w-full rounded px-1.5 py-1 text-[11px]" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                      {T_DURATIONS.map((v) => <option key={v} value={v}>{v}'</option>)}
                    </select>
                  </div>
                  <div style={{ minWidth: 90 }}>
                    <label className="block text-[9px] uppercase tracking-wide mb-1" style={{ color: COLORS.textMuted }}>Descanso (min)</label>
                    <input type="number" min="0" step="0.5" value={day.recoveryOverride ?? 3}
                      onChange={(e) => {
                        const next = { ...day, recoveryOverride: e.target.value ? Number(e.target.value) : 3 };
                        onChangeDay(index, { ...next, km: computeImpliedKm(next) });
                      }}
                      className="w-full rounded px-1.5 py-1 text-[11px] font-mono" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
                  </div>
                  <div style={{ minWidth: 90 }}>
                    <label className="block text-[9px] uppercase tracking-wide mb-1" style={{ color: COLORS.textMuted }}>Ritmo (m:ss)</label>
                    <input type="text" placeholder="Auto" value={day.paceOverrideStr ?? ""}
                      onChange={(e) => {
                        const str = e.target.value;
                        const parsed = parsePaceToDecimal(str);
                        onChangeDay(index, { ...day, paceOverrideStr: str, paceOverride: parsed });
                      }}
                      className="w-full rounded px-1.5 py-1 text-[11px] font-mono" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
                  </div>
                </div>
              )}
              {day.paceKey === "custom" && (
                <div className="col-span-2 flex flex-col gap-2 pt-1" style={{ borderTop: `1px dashed ${COLORS.border}` }}>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { key: "customWarmKm", label: "Calent. (km)", step: 0.5, def: 2 },
                      { key: "customCoolKm", label: "Enfr. (km)", step: 0.5, def: 2 },
                    ].map((f) => (
                      <div key={f.key} style={{ minWidth: 90 }}>
                        <label className="block text-[9px] uppercase tracking-wide mb-1" style={{ color: COLORS.textMuted }}>{f.label}</label>
                        <input type="number" min="0" step={f.step} value={day[f.key] ?? f.def}
                          onChange={(e) => {
                            const next = { ...day, [f.key]: e.target.value ? Number(e.target.value) : f.def };
                            onChangeDay(index, { ...next, km: computeImpliedKm(next) });
                          }}
                          className="w-full rounded px-1.5 py-1 text-[11px] font-mono" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
                      </div>
                    ))}
                  </div>
                  {getCustomBlocks(day).map((block, bi) => (
                    <div key={bi} className="flex flex-wrap items-end gap-2 rounded p-2" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}` }}>
                      <span className="text-[9px] uppercase tracking-wide" style={{ color: COLORS.textMuted, minWidth: 50 }}>Bloque {bi + 1}</span>
                      {[
                        { key: "reps", label: "Repeticiones", step: 1, def: 6 },
                        { key: "distKm", label: "Distancia (km)", step: 0.1, def: 0.4 },
                        { key: "recoveryMin", label: "Descanso (min)", step: 0.25, def: 2 },
                      ].map((f) => (
                        <div key={f.key} style={{ minWidth: 80 }}>
                          <label className="block text-[9px] uppercase tracking-wide mb-1" style={{ color: COLORS.textMuted }}>{f.label}</label>
                          <input type="number" min="0" step={f.step} value={block[f.key] ?? f.def}
                            onChange={(e) => {
                              const blocks = getCustomBlocks(day).map((b, i) => i === bi ? { ...b, [f.key]: e.target.value ? Number(e.target.value) : f.def } : b);
                              const next = { ...day, customBlocks: blocks };
                              onChangeDay(index, { ...next, km: computeImpliedKm(next) });
                            }}
                            className="w-full rounded px-1.5 py-1 text-[11px] font-mono" style={{ background: COLORS.surface, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
                        </div>
                      ))}
                      <div style={{ minWidth: 80 }}>
                        <label className="block text-[9px] uppercase tracking-wide mb-1" style={{ color: COLORS.textMuted }}>Ritmo (m:ss)</label>
                        <input type="text" placeholder="Ej: 4:00" value={block.paceStr ?? ""}
                          onChange={(e) => {
                            const blocks = getCustomBlocks(day).map((b, i) => i === bi ? { ...b, paceStr: e.target.value } : b);
                            onChangeDay(index, { ...day, customBlocks: blocks });
                          }}
                          className="w-full rounded px-1.5 py-1 text-[11px] font-mono" style={{ background: COLORS.surface, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
                      </div>
                      {getCustomBlocks(day).length > 1 && (
                        <button onClick={() => {
                            const blocks = getCustomBlocks(day).filter((_, i) => i !== bi);
                            const next = { ...day, customBlocks: blocks };
                            onChangeDay(index, { ...next, km: computeImpliedKm(next) });
                          }}
                          className="px-2 py-1 rounded text-[10px]" style={{ background: COLORS.surface, color: COLORS.track, border: `1px solid ${COLORS.track}` }}>
                          Quitar
                        </button>
                      )}
                    </div>
                  ))}
                  <button onClick={() => {
                      const blocks = [...getCustomBlocks(day), { reps: 6, distKm: 0.4, paceStr: "", recoveryMin: 2 }];
                      const next = { ...day, customBlocks: blocks };
                      onChangeDay(index, { ...next, km: computeImpliedKm(next) });
                    }}
                    className="self-start px-2 py-1 rounded text-[10px] font-semibold" style={{ background: COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                    + Agregar bloque
                  </button>
                  <div className="w-full">
                    <label className="block text-[9px] uppercase tracking-wide mb-1" style={{ color: COLORS.textMuted }}>Nota / instrucciones adicionales</label>
                    <input type="text" placeholder="Cualquier detalle extra para el alumno" value={day.customNote ?? ""}
                      onChange={(e) => onChangeDay(index, { ...day, customNote: e.target.value })}
                      className="w-full rounded px-2 py-1 text-[11px]" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
                  </div>
                </div>
              )}
              {day.paceKey === "long" && (
                <div className="col-span-2 pt-1" style={{ borderTop: `1px dashed ${COLORS.border}` }}>
                  <div className="grid grid-cols-4 gap-1 text-[9px] uppercase tracking-wide mb-1" style={{ color: COLORS.textMuted }}>
                    <span>Paso</span><span>Km</span><span>Ritmo</span><span></span>
                  </div>
                  {[
                    { key: "warm", label: "Calent." },
                    { key: "body", label: "Bloque principal" },
                    ...(day.longProgressive ? [{ key: "close", label: "Cierre fuerte" }] : []),
                    { key: "cool", label: "Enfr." },
                  ].map((step) => {
                    const ov = day.longOverrides || {};
                    const kmKey = `${step.key}Km`, paceKey2 = `${step.key}Pace`;
                    return (
                      <div key={step.key} className="grid grid-cols-4 gap-1 mb-1 items-center">
                        <span className="text-[10px]" style={{ color: COLORS.textMuted }}>{step.label}</span>
                        <input type="number" min="0" step="0.5" placeholder="Auto" value={ov[kmKey] ?? ""}
                          onChange={(e) => onChangeDay(index, { ...day, longOverrides: { ...ov, [kmKey]: e.target.value ? Number(e.target.value) : null } })}
                          className="rounded px-1 py-1 text-[10px] font-mono" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
                        <input type="text" placeholder="Auto" value={ov[`${step.key}PaceStr`] ?? ""}
                          onChange={(e) => {
                            const str = e.target.value;
                            const parsed = parsePaceToDecimal(str);
                            onChangeDay(index, { ...day, longOverrides: { ...ov, [`${step.key}PaceStr`]: str, [paceKey2]: parsed } });
                          }}
                          className="rounded px-1 py-1 text-[10px] font-mono" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
                        <span />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            !isRest && (
              <div className="mt-1 flex items-center gap-2 flex-wrap">
                <span className="text-lg font-semibold" style={{ fontFamily: "'JetBrains Mono', monospace", color: COLORS.lane }}>{day.km} km</span>
                <span className="text-xs" style={{ color: zoneColor }}>
                  {day.paceKey && getRepresentativePace(day) ? `${PACE_KEY_LABEL[day.paceKey]} · ${formatPace(getRepresentativePace(day))}/km` : PACE_KEY_LABEL[day.paceKey] || ""}
                </span>
              </div>
            )
          )}
          {isRest && mode !== "edit" && (
            <div className="mt-1 text-xs" style={{ color: COLORS.textMuted }}>
              {mode === "log"
                ? (index === (isRaceGoal ? 6 : 0)
                    ? "Hoy toca descanso — es parte del plan, aprovecha para estirar y recuperar."
                    : "Hoy toca descanso, pero puedes aprovechar para fortalecer.")
                : "Descanso"}
            </div>
          )}
          {!isRest && <div className="mt-2"><SessionBarChart day={day} /></div>}
          {!isRest && <SessionDetail segments={detail} />}

          {mode === "log" && !isRest && (
            <div className="mt-3 pt-3 space-y-2" style={{ borderTop: `1px dashed ${COLORS.border}` }}>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: COLORS.textMuted }}>
                  <input type="checkbox" checked={!!log?.completed} onChange={(e) => onChangeLog(index, { ...log, completed: e.target.checked }, true)} style={{ accentColor: COLORS.track }} />
                  Sesión completada
                </label>
                <div className="flex items-center gap-2">
                  {!log?.completed && onStartLive && (
                    <button type="button" onClick={() => onStartLive(index)}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded" style={{ background: COLORS.bg, color: COLORS.track, border: `1px solid ${COLORS.track}55` }}>
                      <Activity size={11} /> Iniciar
                    </button>
                  )}
                  <button type="button"
                    onClick={() => onChangeLog(index, { ...log, completed: true, actualKm: day.km, actualPaceStr: log?.actualPaceStr || (getRepresentativePace(day) ? formatPace(getRepresentativePace(day)) : "") }, true)}
                    className="text-xs px-2 py-1 rounded" style={{ background: COLORS.bg, color: COLORS.easy, border: `1px solid ${COLORS.easy}55` }}>
                    ✓ Tal cual estaba planeado
                  </button>
                </div>
              </div>
              <div className={`grid gap-2 ${["R", "I", "T"].includes(day.paceKey) ? "grid-cols-3" : "grid-cols-2"}`}>
                <div>
                  <label className="block text-[10px] uppercase tracking-wide mb-1" style={{ color: COLORS.textMuted }}>Km reales</label>
                  <input type="number" min="0" step="0.1" placeholder="0" value={log?.actualKm ?? ""}
                    onChange={(e) => onChangeLog(index, { ...log, actualKm: e.target.value })}
                    className="w-full rounded px-2 py-1 text-sm font-mono" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
                </div>
                {["R", "I", "T"].includes(day.paceKey) && (
                  <div>
                    <label className="block text-[10px] uppercase tracking-wide mb-1" style={{ color: COLORS.textMuted }}>Ritmo real</label>
                    <input type="text" placeholder="5:30" value={log?.actualPaceStr ?? ""}
                      onChange={(e) => onChangeLog(index, { ...log, actualPaceStr: e.target.value })}
                      className="w-full rounded px-2 py-1 text-sm font-mono" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
                  </div>
                )}
                <div>
                  <label className="block text-[10px] uppercase tracking-wide mb-1" style={{ color: COLORS.textMuted }}>RPE (1–10)</label>
                  <input type="number" min="1" max="10" placeholder="—" value={log?.rpe ?? ""}
                    onChange={(e) => onChangeLog(index, { ...log, rpe: e.target.value })}
                    className="w-full rounded px-2 py-1 text-sm font-mono" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
                </div>
              </div>
              {["R", "I", "T"].includes(day.paceKey) && (
                <p className="text-[10px]" style={{ color: COLORS.textMuted }}>
                  El ritmo real es solo del {day.paceKey === "T" ? "bloque de umbral" : "bloque de series/intervalos"} — no cuentes el warm-up, cool-down ni los descansos.
                </p>
              )}
              <p className="text-[10px]" style={{ color: COLORS.textMuted }}>RPE = Índice de Esfuerzo Percibido.</p>
              {(() => {
                const diff = paceDiffLabel(log?.actualPaceStr, getRepresentativePace(day));
                return diff ? <div className="text-xs" style={{ color: diff.color }}>Ritmo real: {diff.text}</div> : null;
              })()}
              <input type="text" placeholder="Nota (opcional)" value={log?.note ?? ""}
                onChange={(e) => onChangeLog(index, { ...log, note: e.target.value })}
                className="w-full rounded px-2 py-1 text-xs" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
            </div>
          )}
          {mode === "view" && !isRest && log?.completed && (
            <div className="mt-2 text-xs" style={{ color: COLORS.textMuted }}>
              Real: {log.actualKm || "—"} km · Ritmo: {log.actualPaceStr || "—"} · RPE {log.rpe || "—"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   AUTH GATES
--------------------------------------------------------- */
const COACH_SETUP_CODE = "TROTAMUNDOS-JK"; // solo tú deberías conocer este código

function CoachGate({ onSuccess, onBack }) {
  const [mode, setMode] = useState("loading");
  const [setupVerified, setSetupVerified] = useState(false);
  const [setupCode, setSetupCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { authStatus().then((r) => setMode(r.coachConfigured ? "enter" : "set")); }, []);

  const verifySetup = () => {
    if (setupCode !== COACH_SETUP_CODE) return setError("Código de configuración incorrecto.");
    setError("");
    setSetupVerified(true);
  };
  const handleSet = async () => {
    if (password.length < 6) return setError("La contraseña debe tener al menos 6 caracteres.");
    if (password !== confirm) return setError("Las contraseñas no coinciden.");
    const r = await coachSetup(setupCode, password);
    if (r.ok) onSuccess();
    else setError(r.error || "No se pudo configurar la contraseña.");
  };
  const handleEnter = async () => {
    const r = await coachLogin(password);
    if (r.ok) onSuccess();
    else setError(r.error || "Contraseña incorrecta.");
  };

  return (
    <div className="max-w-sm mx-auto px-4 py-20">
      <button onClick={onBack} className="mb-6 p-2 rounded-lg" style={{ color: COLORS.textMuted }}><ArrowLeft size={18} /></button>
      <div className="text-center mb-6">
        <Lock size={24} style={{ color: COLORS.track, margin: "0 auto" }} />
        <div className="mt-2 text-lg font-semibold" style={{ fontFamily: "'Oswald', sans-serif", color: COLORS.textPrimary }}>
          {mode === "set" ? (setupVerified ? "Crea tu contraseña de coach" : "Código de configuración") : "Acceso del coach"}
        </div>
      </div>
      {mode === "set" && !setupVerified && (
        <div className="space-y-3">
          <p className="text-xs text-center" style={{ color: COLORS.textMuted }}>Aún no hay contraseña de coach configurada. Ingresa el código de configuración para poder crearla.</p>
          <input type="password" placeholder="Código de configuración" value={setupCode} onChange={(e) => setSetupCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && verifySetup()}
            className="w-full rounded-lg px-3 py-2.5 text-sm" style={{ background: COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
          {error && <p className="text-xs" style={{ color: COLORS.track }}>{error}</p>}
          <button onClick={verifySetup} className="w-full py-2.5 rounded-lg text-sm font-semibold" style={{ background: COLORS.track, color: COLORS.lane }}>Continuar</button>
        </div>
      )}
      {mode !== "loading" && (mode === "enter" || setupVerified) && (
        <div className="space-y-3">
          <input type="password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (mode === "set" ? handleSet() : handleEnter())}
            className="w-full rounded-lg px-3 py-2.5 text-sm" style={{ background: COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
          {mode === "set" && (
            <input type="password" placeholder="Confirma la contraseña" value={confirm} onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSet()}
              className="w-full rounded-lg px-3 py-2.5 text-sm" style={{ background: COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
          )}
          {error && <p className="text-xs" style={{ color: COLORS.track }}>{error}</p>}
          <button onClick={mode === "set" ? handleSet : handleEnter}
            className="w-full py-2.5 rounded-lg text-sm font-semibold" style={{ background: COLORS.track, color: COLORS.lane }}>
            {mode === "set" ? "Guardar y entrar" : "Entrar"}
          </button>
        </div>
      )}
    </div>
  );
}

function StudentGate({ roster, onSuccess, onBack }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const filtered = search.trim() ? roster.filter((r) => r.name.toLowerCase().includes(search.toLowerCase())) : [];

  const handleEnter = async () => {
    // El PIN se verifica en el servidor — el navegador ya no recibe los datos del alumno
    // antes de comprobar la identidad.
    const r = await studentLogin(selected.id, pin);
    if (r.ok) {
      await safeSetPersonal("rememberedStudent", { id: selected.id });
      onSuccess(selected.id);
    } else setError(r.error === "PIN incorrecto" ? "PIN incorrecto." : (r.error || "No se pudo ingresar."));
  };

  return (
    <div className="max-w-sm mx-auto px-4 py-16">
      <button onClick={() => (selected ? setSelected(null) : onBack())} className="mb-6 p-2 rounded-lg" style={{ color: COLORS.textMuted }}><ArrowLeft size={18} /></button>
      {!selected ? (
        <>
          <div className="text-center mb-6">
            <User size={24} style={{ color: COLORS.track, margin: "0 auto" }} />
            <div className="mt-2 text-lg font-semibold" style={{ fontFamily: "'Oswald', sans-serif", color: COLORS.textPrimary }}>Busca tu nombre</div>
          </div>
          <div className="relative mb-4">
            <Search size={16} style={{ position: "absolute", left: 12, top: 12, color: COLORS.textMuted }} />
            <input type="text" placeholder="Tu nombre" value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 rounded-lg text-sm" style={{ background: COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
          </div>
          {roster.length === 0 && <p className="text-sm" style={{ color: COLORS.textMuted }}>Tu coach todavía no te ha registrado.</p>}
          {roster.length > 0 && !search.trim() && <p className="text-sm" style={{ color: COLORS.textMuted }}>Escribe tu nombre para encontrarte.</p>}
          {roster.length > 0 && search.trim() && filtered.length === 0 && <p className="text-sm" style={{ color: COLORS.textMuted }}>Sin resultados para "{search}".</p>}
          <div className="space-y-2">
            {filtered.map((r) => (
              <button key={r.id} onClick={() => setSelected(r)} className="w-full text-left rounded-lg p-3 flex items-center justify-between"
                style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}>
                <span className="text-sm font-semibold" style={{ color: COLORS.textPrimary }}>{r.name}</span>
                <ChevronRight size={14} style={{ color: COLORS.textMuted }} />
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="text-center mb-6">
            <KeyRound size={24} style={{ color: COLORS.track, margin: "0 auto" }} />
            <div className="mt-2 text-lg font-semibold" style={{ fontFamily: "'Oswald', sans-serif", color: COLORS.textPrimary }}>Hola, {selected.name}</div>
            <p className="text-xs mt-1" style={{ color: COLORS.textMuted }}>Ingresa el PIN que te dio tu coach.</p>
          </div>
          <input type="password" inputMode="numeric" maxLength={4} placeholder="PIN de 4 dígitos" value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && handleEnter()}
            className="w-full rounded-lg px-3 py-2.5 text-sm text-center tracking-[0.5em]"
            style={{ background: COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
          {error && <p className="text-xs mt-2" style={{ color: COLORS.track }}>{error}</p>}
          <button onClick={handleEnter} className="w-full mt-3 py-2.5 rounded-lg text-sm font-semibold" style={{ background: COLORS.track, color: COLORS.lane }}>Entrar</button>
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   COACH DASHBOARD — piezas auxiliares
--------------------------------------------------------- */
function ChangeGoalForm({ student, onCancel, onSave, busy }) {
  const [goal, setGoal] = useState(student.goal);
  const [raceDate, setRaceDate] = useState(student.raceDate || "");
  const [raceDateText, setRaceDateText] = useState(formatISOToDDMMYY(student.raceDate));
  const [goalInputMode, setGoalInputMode] = useState("pace");
  const [targetPaceStr, setTargetPaceStr] = useState(student.targetPaceStr || "");
  const [targetTimeStr, setTargetTimeStr] = useState("");
  const [peakKmOverride, setPeakKmOverride] = useState("");
  const [applyTiming, setApplyTiming] = useState("current"); // "current" | "next"
  const [error, setError] = useState("");
  const needsRaceInfo = !isFitnessGoal(goal);
  const goalOptions = GOALS.filter((g) => !isFitnessGoal(g.id) || FITNESS_GOAL_LEVELS.includes(student.level));

  const submit = () => {
    let finalPaceStr = targetPaceStr;
    if (needsRaceInfo) {
      if (!raceDate) return setError("Ingresa una fecha de carrera válida (dd/mm/aa).");
      if (goalInputMode === "time") {
        const totalMin = parseTimeToMinutes(targetTimeStr);
        if (totalMin === null) return setError("Tiempo objetivo inválido. Usa el formato h:mm:ss o mm:ss, ej. 3:15:00.");
        finalPaceStr = formatPace(totalMin / DISTANCE_KM[goal]);
      } else if (parsePaceToDecimal(targetPaceStr) === null) {
        return setError("Ritmo objetivo inválido. Usa el formato m:ss, ej. 5:30.");
      }
    }
    const peakKmManual = peakKmOverride.trim() !== "" ? Number(peakKmOverride) : null;
    if (peakKmManual != null && (isNaN(peakKmManual) || peakKmManual <= 0)) return setError("El km pico debe ser un número positivo.");
    setError("");
    onSave({ goal, raceDate: needsRaceInfo ? raceDate : null, targetPaceStr: needsRaceInfo ? finalPaceStr : null, peakKmOverride: peakKmManual, applyTiming });
  };

  return (
    <div className="rounded-xl p-4 mb-4" style={{ background: COLORS.surface2, border: `1px solid ${COLORS.track}` }}>
      <div className="text-sm font-semibold mb-1" style={{ color: COLORS.textPrimary, fontFamily: "'Oswald', sans-serif" }}>CAMBIAR OBJETIVO</div>
      <p className="text-xs mb-3" style={{ color: COLORS.textMuted }}>Se mantiene el historial — el plan se regenera según el nuevo objetivo.</p>
      <div className="mb-3">
        <label className="block text-[10px] uppercase tracking-wide mb-1" style={{ color: COLORS.textMuted }}>¿Cuándo aplica el cambio?</label>
        <select value={applyTiming} onChange={(e) => setApplyTiming(e.target.value)}
          className="w-full rounded px-3 py-2 text-sm" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
          <option value="current">Esta semana (reemplaza la semana en curso)</option>
          <option value="next">La próxima semana (la actual queda como está)</option>
        </select>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <select value={goal} onChange={(e) => setGoal(e.target.value)} className="rounded px-3 py-2 text-sm" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
          {goalOptions.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
        </select>
        <div />
        {needsRaceInfo && (
          <>
            <div>
              <label className="block text-[10px] uppercase tracking-wide mb-1" style={{ color: COLORS.textMuted }}>Fecha objetivo (carrera)</label>
              <div className="flex gap-1.5">
                <input type="text" placeholder="dd/mm/aa" value={raceDateText}
                  onChange={(e) => { setRaceDateText(e.target.value); setRaceDate(parseDDMMYYToISO(e.target.value) || ""); }}
                  className="flex-1 min-w-0 rounded px-3 py-2 text-sm font-mono" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
                <input type="date" value={raceDate || ""} aria-label="Elegir fecha en calendario"
                  onChange={(e) => { const iso = e.target.value; setRaceDate(iso); setRaceDateText(iso ? formatISOToDDMMYY(iso) : ""); }}
                  className="w-11 rounded text-sm" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}`, colorScheme: "dark" }} />
              </div>
            </div>
            <div className="sm:col-span-2">
              <div className="flex items-center gap-3 mb-1">
                <label className="text-[10px] uppercase tracking-wide" style={{ color: COLORS.textMuted }}>Objetivo como:</label>
                <label className="flex items-center gap-1 text-xs cursor-pointer" style={{ color: COLORS.textMuted }}>
                  <input type="radio" checked={goalInputMode === "pace"} onChange={() => setGoalInputMode("pace")} style={{ accentColor: COLORS.track }} /> Ritmo
                </label>
                <label className="flex items-center gap-1 text-xs cursor-pointer" style={{ color: COLORS.textMuted }}>
                  <input type="radio" checked={goalInputMode === "time"} onChange={() => setGoalInputMode("time")} style={{ accentColor: COLORS.track }} /> Tiempo total
                </label>
              </div>
              {goalInputMode === "pace" ? (
                <input type="text" placeholder="5:30 (min:seg / km)" value={targetPaceStr} onChange={(e) => setTargetPaceStr(e.target.value)}
                  className="w-full rounded px-3 py-2 text-sm font-mono" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
              ) : (
                <input type="text" placeholder="3:15:00 (h:mm:ss) o 22:30 (mm:ss)" value={targetTimeStr} onChange={(e) => setTargetTimeStr(e.target.value)}
                  className="w-full rounded px-3 py-2 text-sm font-mono" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
              )}
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[10px] uppercase tracking-wide mb-1" style={{ color: COLORS.textMuted }}>Km pico semanal (opcional, deja vacío para recalcular)</label>
              <input type="number" min="1" step="1" placeholder={`Actual: ${student.peakKm} km`} value={peakKmOverride} onChange={(e) => setPeakKmOverride(e.target.value)}
                className="w-full rounded px-3 py-2 text-sm font-mono" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
            </div>
          </>
        )}
      </div>
      {error && <p className="text-xs mt-2" style={{ color: COLORS.track }}>{error}</p>}
      <div className="flex justify-end gap-2 mt-3">
        <button onClick={onCancel} className="px-3 py-1.5 rounded text-sm" style={{ color: COLORS.textMuted }}>Cancelar</button>
        <button onClick={submit} disabled={busy} className="px-4 py-1.5 rounded text-sm font-semibold" style={{ background: COLORS.track, color: COLORS.lane }}>Guardar nuevo objetivo</button>
      </div>
    </div>
  );
}

function AddStudentForm({ onCancel, onCreate }) {
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("42k");
  const [level, setLevel] = useState("intermedio1");
  const [pin, setPin] = useState("");
  const [raceDate, setRaceDate] = useState("");
  const [raceDateText, setRaceDateText] = useState("");
  const [goalInputMode, setGoalInputMode] = useState("pace");
  const [targetPaceStr, setTargetPaceStr] = useState("");
  const [targetTimeStr, setTargetTimeStr] = useState("");
  const [peakKmOverride, setPeakKmOverride] = useState("");
  const [fitnessStartWeek, setFitnessStartWeek] = useState(16);
  const [customTrainDays, setCustomTrainDays] = useState([0, 2, 5]); // Lun, Mié, Sáb por defecto
  const [planTiming, setPlanTiming] = useState("current"); // "current" | "next"
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const needsRaceInfo = !isFitnessGoal(goal);
  const levelOptions = isFitnessGoal(goal) ? LEVELS.filter((l) => FITNESS_GOAL_LEVELS.includes(l.id)) : LEVELS;
  useEffect(() => {
    if (!levelOptions.some((l) => l.id === level)) setLevel(levelOptions[0].id);
  }, [goal]); // eslint-disable-line

  let suggestedPeak = null;
  if (needsRaceInfo) {
    const effectivePaceStr = goalInputMode === "time"
      ? (parseTimeToMinutes(targetTimeStr) != null ? formatPace(parseTimeToMinutes(targetTimeStr) / DISTANCE_KM[goal]) : null)
      : targetPaceStr;
    const paceDecimal = parsePaceToDecimal(effectivePaceStr);
    if (paceDecimal != null) suggestedPeak = computePeakKm(goal, level, computeVDOT(DISTANCE_KM[goal], paceDecimal));
  }

  const submit = () => {
    if (submitting) return; // evita doble creación si se toca el botón dos veces seguidas
    if (!name.trim()) return setError("Ingresa el nombre del alumno.");
    if (!/^\d{4}$/.test(pin)) return setError("El PIN debe tener exactamente 4 dígitos.");
    let finalPaceStr = targetPaceStr;
    if (needsRaceInfo) {
      if (!raceDate) return setError("Ingresa una fecha de carrera válida (dd/mm/aa).");
      if (goalInputMode === "time") {
        const totalMin = parseTimeToMinutes(targetTimeStr);
        if (totalMin === null) return setError("Tiempo objetivo inválido. Usa el formato h:mm:ss o mm:ss, ej. 3:15:00.");
        finalPaceStr = formatPace(totalMin / DISTANCE_KM[goal]);
      } else if (parsePaceToDecimal(targetPaceStr) === null) {
        return setError("Ritmo objetivo inválido. Usa el formato m:ss, ej. 5:30.");
      }
    }
    const peakKmManual = peakKmOverride.trim() !== "" ? Number(peakKmOverride) : null;
    if (peakKmManual != null && (isNaN(peakKmManual) || peakKmManual <= 0)) return setError("El km pico debe ser un número positivo.");
    if (level === "principiante" && customTrainDays.length !== 3) return setError("Elige exactamente 3 días de entrenamiento.");
    setError("");
    setSubmitting(true);
    onCreate({ name: name.trim(), goal, level, pin, raceDate: needsRaceInfo ? raceDate : null, targetPaceStr: needsRaceInfo ? finalPaceStr : null, peakKmOverride: peakKmManual, fitnessStartWeek: isFitnessGoal(goal) ? fitnessStartWeek : null, planTiming, trainDays: customTrainDays });
  };

  return (
    <div className="rounded-xl p-4 mb-4" style={{ background: COLORS.surface2, border: `1px solid ${COLORS.border}` }}>
      <div className="text-sm font-semibold mb-3" style={{ color: COLORS.textPrimary, fontFamily: "'Oswald', sans-serif" }}>NUEVO ALUMNO</div>
      <div className="grid sm:grid-cols-2 gap-3">
        <input type="text" placeholder="Nombre del alumno" value={name} onChange={(e) => setName(e.target.value)}
          className="rounded px-3 py-2 text-sm sm:col-span-2" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
        <div className="sm:col-span-2">
          <label className="block text-[10px] uppercase tracking-wide mb-1" style={{ color: COLORS.textMuted }}>¿Cuándo empieza el plan?</label>
          <select value={planTiming} onChange={(e) => setPlanTiming(e.target.value)}
            className="w-full rounded px-3 py-2 text-sm" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
            <option value="current">Esta semana (en curso)</option>
            <option value="next">La próxima semana</option>
          </select>
        </div>
        <select value={goal} onChange={(e) => setGoal(e.target.value)} className="rounded px-3 py-2 text-sm" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
          {GOALS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
        </select>
        <select value={level} onChange={(e) => setLevel(e.target.value)} className="rounded px-3 py-2 text-sm" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
          {levelOptions.map((l) => <option key={l.id} value={l.id}>{l.label} · {l.days}x/sem</option>)}
        </select>
        {isFitnessGoal(goal) && (
          <div className="sm:col-span-2">
            <label className="block text-[10px] uppercase tracking-wide mb-1" style={{ color: COLORS.textMuted }}>
              Semana de inicio (cuenta regresiva hacia el objetivo final)
            </label>
            <select value={fitnessStartWeek} onChange={(e) => setFitnessStartWeek(Number(e.target.value))}
              className="w-full rounded px-3 py-2 text-sm" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
              {Array.from({ length: 15 }, (_, i) => 16 - i).map((w) => (
                <option key={w} value={w}>Semana {w}{w === 16 ? " (desde el inicio)" : ""}</option>
              ))}
            </select>
          </div>
        )}
        {level === "principiante" && (
          <div className="sm:col-span-2">
            <label className="block text-[10px] uppercase tracking-wide mb-1" style={{ color: COLORS.textMuted }}>
              Elige los 3 días de entrenamiento ({customTrainDays.length}/3 elegidos)
            </label>
            <div className="flex gap-1.5 flex-wrap">
              {DAYS.map((d, i) => {
                const selected = customTrainDays.includes(i);
                return (
                  <button key={i} type="button"
                    onClick={() => {
                      if (selected) setCustomTrainDays(customTrainDays.filter((x) => x !== i));
                      else if (customTrainDays.length < 3) setCustomTrainDays([...customTrainDays, i].sort((a, b) => a - b));
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                    style={{ background: selected ? COLORS.track : COLORS.bg, color: COLORS.lane, border: `1px solid ${selected ? COLORS.track : COLORS.border}` }}>
                    {d}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {needsRaceInfo && (
          <>
            <div>
              <label className="block text-[10px] uppercase tracking-wide mb-1" style={{ color: COLORS.textMuted }}>Fecha objetivo (carrera)</label>
              <div className="flex gap-1.5">
                <input type="text" placeholder="dd/mm/aa" value={raceDateText}
                  onChange={(e) => { setRaceDateText(e.target.value); setRaceDate(parseDDMMYYToISO(e.target.value) || ""); }}
                  className="flex-1 min-w-0 rounded px-3 py-2 text-sm font-mono" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
                <input type="date" value={raceDate || ""} aria-label="Elegir fecha en calendario"
                  onChange={(e) => { const iso = e.target.value; setRaceDate(iso); setRaceDateText(iso ? formatISOToDDMMYY(iso) : ""); }}
                  className="w-11 rounded text-sm" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}`, colorScheme: "dark" }} />
              </div>
            </div>
            <div className="sm:col-span-2">
              <div className="flex items-center gap-3 mb-1">
                <label className="text-[10px] uppercase tracking-wide" style={{ color: COLORS.textMuted }}>Objetivo como:</label>
                <label className="flex items-center gap-1 text-xs cursor-pointer" style={{ color: COLORS.textMuted }}>
                  <input type="radio" checked={goalInputMode === "pace"} onChange={() => setGoalInputMode("pace")} style={{ accentColor: COLORS.track }} /> Ritmo
                </label>
                <label className="flex items-center gap-1 text-xs cursor-pointer" style={{ color: COLORS.textMuted }}>
                  <input type="radio" checked={goalInputMode === "time"} onChange={() => setGoalInputMode("time")} style={{ accentColor: COLORS.track }} /> Tiempo total
                </label>
              </div>
              {goalInputMode === "pace" ? (
                <input type="text" placeholder="5:30 (min:seg / km)" value={targetPaceStr} onChange={(e) => setTargetPaceStr(e.target.value)}
                  className="w-full rounded px-3 py-2 text-sm font-mono" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
              ) : (
                <input type="text" placeholder="3:15:00 (h:mm:ss) o 22:30 (mm:ss)" value={targetTimeStr} onChange={(e) => setTargetTimeStr(e.target.value)}
                  className="w-full rounded px-3 py-2 text-sm font-mono" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
              )}
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[10px] uppercase tracking-wide mb-1" style={{ color: COLORS.textMuted }}>
                Km pico semanal (semana de mayor carga de todo el ciclo)
              </label>
              <input type="number" min="1" step="1" placeholder={suggestedPeak ? `Sugerido: ${suggestedPeak} km (según ritmo y nivel)` : "Ej. 90"}
                value={peakKmOverride} onChange={(e) => setPeakKmOverride(e.target.value)}
                className="w-full rounded px-3 py-2 text-sm font-mono" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
              <p className="text-[10px] mt-1" style={{ color: COLORS.textMuted }}>
                Déjalo vacío para usar el valor sugerido automáticamente. Ninguna semana del plan superará este número.
              </p>
            </div>
          </>
        )}
        <input type="text" inputMode="numeric" maxLength={4} placeholder="PIN de acceso (4 dígitos)" value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          className="rounded px-3 py-2 text-sm sm:col-span-2" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
      </div>
      {error && <p className="text-xs mt-2" style={{ color: COLORS.track }}>{error}</p>}
      <div className="flex justify-end gap-2 mt-3">
        <button onClick={onCancel} className="px-3 py-1.5 rounded text-sm" style={{ color: COLORS.textMuted }}>Cancelar</button>
        <button onClick={submit} disabled={submitting} className="px-4 py-1.5 rounded text-sm font-semibold disabled:opacity-50" style={{ background: COLORS.track, color: COLORS.lane }}>
          {submitting ? "Creando…" : "Crear alumno"}
        </button>
      </div>
    </div>
  );
}

function ProposalPanel({ proposal, values, setValues, onConfirm, onCancel, busy, weekDateRange }) {
  if (proposal.kind === "principiante") {
    return (
      <div className="rounded-xl p-4 mb-4" style={{ background: COLORS.surface2, border: `1px solid ${COLORS.track}` }}>
        <div className="text-sm font-semibold mb-1" style={{ color: COLORS.textPrimary, fontFamily: "'Oswald', sans-serif" }}>PROPUESTA DE LA PRÓXIMA SEMANA</div>
        {weekDateRange && <div className="text-xs mb-2" style={{ color: COLORS.track, fontFamily: "'JetBrains Mono', monospace" }}>{weekDateRange}</div>}
        <p className="text-xs mb-3" style={{ color: COLORS.textMuted }}>Se avanzará o mantendrá la etapa de acondicionamiento según la adherencia registrada.</p>
        <div className="flex gap-2">
          <button onClick={() => onConfirm()} disabled={busy} className="px-4 py-1.5 rounded text-sm font-semibold" style={{ background: COLORS.track, color: COLORS.lane }}>Confirmar y generar</button>
          <button onClick={onCancel} className="px-3 py-1.5 rounded text-sm" style={{ color: COLORS.textMuted }}>Cancelar</button>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-xl p-4 mb-4" style={{ background: COLORS.surface2, border: `1px solid ${COLORS.track}` }}>
      <div className="text-sm font-semibold mb-1" style={{ color: COLORS.textPrimary, fontFamily: "'Oswald', sans-serif" }}>PROPUESTA DE LA PRÓXIMA SEMANA</div>
      {weekDateRange && <div className="text-xs mb-2" style={{ color: COLORS.track, fontFamily: "'JetBrains Mono', monospace" }}>{weekDateRange}</div>}
      <p className="text-xs mb-3" style={{ color: COLORS.textMuted }}>{proposal.note}</p>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] uppercase tracking-wide mb-1" style={{ color: COLORS.textMuted }}>Km totales de la semana</label>
          <input type="number" min="0" step="0.5" value={values.weeklyKm}
            onChange={(e) => setValues((v) => ({ ...v, weeklyKm: Number(e.target.value) }))}
            className="w-full rounded px-3 py-2 text-sm font-mono" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
        </div>
        {proposal.kind === "race" && (
          <>
            <div>
              <label className="block text-[10px] uppercase tracking-wide mb-1" style={{ color: COLORS.textMuted }}>Km del fondo del domingo</label>
              <input type="number" min="0" step="0.5" value={values.longRunKm}
                onChange={(e) => setValues((v) => ({ ...v, longRunKm: Number(e.target.value) }))}
                className="w-full rounded px-3 py-2 text-sm font-mono" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wide mb-1" style={{ color: COLORS.textMuted }}>Calidad del martes</label>
              <select value={displayPaceKey(values.q1PaceKey)} onChange={(e) => setValues((v) => ({ ...v, q1PaceKey: e.target.value }))}
                className="w-full rounded px-3 py-2 text-sm" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                {PACE_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
              {displayPaceKey(values.q1PaceKey) === "T" && (
                <select value={values.q1PaceKey} onChange={(e) => setValues((v) => ({ ...v, q1PaceKey: e.target.value }))}
                  className="w-full rounded px-3 py-2 text-sm mt-1" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                  {T_VARIANTS.map((t) => <option key={t.key} value={t.key}>Umbral · {t.label}</option>)}
                </select>
              )}
              {displayPaceKey(values.q1PaceKey) === "custom" && (
                <select value={values.q1PaceKey} onChange={(e) => setValues((v) => ({ ...v, q1PaceKey: e.target.value }))}
                  className="w-full rounded px-3 py-2 text-sm mt-1" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                  {OTRO_TEMPLATES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              )}
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wide mb-1" style={{ color: COLORS.textMuted }}>Calidad del jueves</label>
              <select value={displayPaceKey(values.q2PaceKey)} onChange={(e) => setValues((v) => ({ ...v, q2PaceKey: e.target.value }))}
                className="w-full rounded px-3 py-2 text-sm" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                {PACE_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
              {displayPaceKey(values.q2PaceKey) === "T" && (
                <select value={values.q2PaceKey} onChange={(e) => setValues((v) => ({ ...v, q2PaceKey: e.target.value }))}
                  className="w-full rounded px-3 py-2 text-sm mt-1" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                  {T_VARIANTS.map((t) => <option key={t.key} value={t.key}>Umbral · {t.label}</option>)}
                </select>
              )}
              {displayPaceKey(values.q2PaceKey) === "custom" && (
                <select value={values.q2PaceKey} onChange={(e) => setValues((v) => ({ ...v, q2PaceKey: e.target.value }))}
                  className="w-full rounded px-3 py-2 text-sm mt-1" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                  {OTRO_TEMPLATES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              )}
            </div>
          </>
        )}
      </div>
      <div className="flex gap-2 mt-3">
        <button onClick={() => onConfirm()} disabled={busy} className="px-4 py-1.5 rounded text-sm font-semibold" style={{ background: COLORS.track, color: COLORS.lane }}>Confirmar y aplicar</button>
        <button onClick={onCancel} className="px-3 py-1.5 rounded text-sm" style={{ color: COLORS.textMuted }}>Cancelar</button>
      </div>
    </div>
  );
}

function PanoramaPanel({ data, student, currentWeek, edits, longEdits, qualityEdits, onEdit, onEditLong, onEditQuality, onSave, busy }) {
  if (data.kind === "flat") {
    return (
      <p className="text-sm" style={{ color: COLORS.textMuted }}>
        Este objetivo (Fitness general) no tiene fecha de carrera ni semana pico — el volumen se mantiene estable en torno a <strong style={{ color: COLORS.textPrimary }}>{data.weeklyKm} km/semana</strong>, ajustándose semana a semana solo según la adherencia registrada.
      </p>
    );
  }
  if (data.kind === "beginner") {
    return (
      <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
        {data.rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs"
            style={{ background: COLORS.surface2, border: `1px solid ${r.isCurrent ? COLORS.track : COLORS.border}` }}>
            <span style={{ color: COLORS.textMuted }}>
              {getWeekTitle(student, r.weekNum)} — {r.label}{r.isCurrent ? " (actual)" : ""}
            </span>
            <span style={{ color: COLORS.textPrimary, fontFamily: "'JetBrains Mono', monospace" }}>
              {r.walk > 0 ? `${r.run}'trote+${r.walk}'camina x${r.reps}` : `${r.run}' continuo`} (~{r.totalMin}')
            </span>
          </div>
        ))}
        <p className="text-xs mt-2" style={{ color: COLORS.textMuted }}>
          Progresión estimada suponiendo buena adherencia cada semana; si alguna semana no se cumple, se repite la etapa hasta consolidarla.
        </p>
      </div>
    );
  }
  const rows = data.rows;
  if (rows.length === 0) return <p className="text-sm" style={{ color: COLORS.textMuted }}>No hay panorama disponible para este alumno.</p>;
  const hasEdits = Object.keys(edits).length > 0 || Object.keys(longEdits).length > 0 || Object.keys(qualityEdits).length > 0;
  return (
    <div>
      <div className="flex text-[10px] uppercase tracking-wide px-3 mb-1" style={{ color: COLORS.textMuted }}>
        <span className="flex-1">Semana</span>
        <span className="w-20 text-right mr-2">Total</span>
        <span className="w-20 text-right mr-2">Fondo Dom.</span>
        <span className="w-20 text-right">Fase</span>
      </div>
      <div className="space-y-2 max-h-[32rem] overflow-y-auto pr-1">
        {rows.map((r) => {
          const isFuture = r.weekNum >= currentWeek;
          const val = edits[r.weekNum] !== undefined ? edits[r.weekNum] : r.km;
          const longVal = longEdits[r.weekNum] !== undefined ? longEdits[r.weekNum] : r.longKm;
          return (
            <div key={r.weekNum} className="rounded-lg px-3 py-2 text-xs"
              style={{ background: COLORS.surface2, border: `1px solid ${r.isPeak ? COLORS.track : COLORS.border}` }}>
              <div className="flex items-center gap-2">
                <span className="flex-1" style={{ color: COLORS.textMuted }}>
                  {getWeekTitle(student, r.weekNum)} {r.weeksToRace === 0 ? "(carrera)" : `· faltan ${r.weeksToRace} sem.`}
                </span>
                {isFuture ? (
                  <input type="number" min="0" step="0.5" value={val}
                    onChange={(e) => onEdit(r.weekNum, Number(e.target.value))}
                    className="w-20 rounded px-2 py-1 text-xs font-mono text-right"
                    style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
                ) : (
                  <span className="w-20 text-right" style={{ color: COLORS.textPrimary, fontFamily: "'JetBrains Mono', monospace" }}>{val} km</span>
                )}
                {isFuture ? (
                  <input type="number" min="0" step="0.5" value={longVal}
                    onChange={(e) => onEditLong(r.weekNum, Number(e.target.value))}
                    className="w-20 rounded px-2 py-1 text-xs font-mono text-right"
                    style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
                ) : (
                  <span className="w-20 text-right" style={{ color: COLORS.textPrimary, fontFamily: "'JetBrains Mono', monospace" }}>{longVal} km</span>
                )}
                <span className="w-20 flex justify-end">
                  <Pill color={r.phase === "taper" || r.phase === "race" ? COLORS.track : (r.isPeak ? COLORS.track : (r.isRecovery ? COLORS.moderate : COLORS.easy))}>
                    {r.phase === "taper" || r.phase === "race" ? PHASE_LABEL[r.phase] : (r.isPeak ? "★ Pico" : r.isRecovery ? "Asimil." : PHASE_LABEL[r.phase])}
                  </Pill>
                </span>
              </div>
              {(r.q1Detail || r.q2Detail || r.q3Detail) && (
                <div className="mt-1.5 pt-1.5 space-y-1" style={{ borderTop: `1px dashed ${COLORS.border}` }}>
                  {["q1", "q2", "q3"].map((qk) => {
                    const dayLabel = qk === "q1" ? "Mar" : qk === "q2" ? "Jue" : "Sáb";
                    const detail = r[`${qk}Detail`];
                    if (!detail) return null;
                    if (!isFuture) {
                      return <div key={qk}><span style={{ color: COLORS.textMuted }}>{dayLabel}: <span style={{ color: COLORS.textPrimary }}>{detail}</span></span></div>;
                    }
                    const qEdit = qualityEdits[r.weekNum]?.[qk] || {};
                    const typeVal = qEdit.type !== undefined ? qEdit.type : r[`${qk}Type`];
                    const distVal = qEdit.dist !== undefined ? qEdit.dist : r[`${qk}Dist`];
                    const repsVal = qEdit.reps !== undefined ? qEdit.reps : r[`${qk}Reps`];
                    const typeOptions = qk === "q3" ? [{ v: "E", l: "Run/Walk" }, { v: "broken", l: "Pre-carga (series largas)" }]
                      : [{ v: "R", l: "Series" }, { v: "I", l: "Intervalos" }, { v: "T", l: "Umbral continuo" }, { v: "brokenT", l: "Umbral fraccionado" }, { v: "combo1k500", l: "Intervalos 1k + 500" }];
                    const distOptions = typeVal === "R" ? R_DISTANCES : typeVal === "I" ? I_DISTANCES : typeVal === "T" ? T_DURATIONS : null;
                    const repsOptions = typeVal === "I" ? [2, 3, 4, 5, 6, 8, 10] : typeVal === "R" ? [6, 8, 10, 12, 14] : null;
                    return (
                      <div key={qk} className="flex items-center gap-1.5 flex-wrap">
                        <span style={{ color: COLORS.textMuted, minWidth: 24 }}>{dayLabel}:</span>
                        <select value={typeVal} onChange={(e) => onEditQuality(r.weekNum, qk, "type", e.target.value)}
                          className="rounded px-1.5 py-0.5 text-[11px]" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                          {typeOptions.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                        </select>
                        {distOptions && (
                          <select value={distVal ?? ""} onChange={(e) => onEditQuality(r.weekNum, qk, "dist", e.target.value ? Number(e.target.value) : null)}
                            className="rounded px-1.5 py-0.5 text-[11px]" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                            <option value="">Auto</option>
                            {distOptions.map((v) => <option key={v} value={v}>{typeVal === "T" ? `${v}'` : formatDist(v)}</option>)}
                          </select>
                        )}
                        {repsOptions && (
                          <select value={repsVal ?? ""} onChange={(e) => onEditQuality(r.weekNum, qk, "reps", e.target.value ? Number(e.target.value) : null)}
                            className="rounded px-1.5 py-0.5 text-[11px]" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                            <option value="">Auto reps</option>
                            {repsOptions.map((v) => <option key={v} value={v}>{v} reps</option>)}
                          </select>
                        )}
                        <span className="text-[10px]" style={{ color: COLORS.textMuted }}>({detail})</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {hasEdits && (
        <button onClick={onSave} disabled={busy} className="mt-3 px-4 py-1.5 rounded text-sm font-semibold" style={{ background: COLORS.track, color: COLORS.lane }}>
          Guardar cambios del panorama
        </button>
      )}
    </div>
  );
}

function RitmosPanel({ student, onSave, busy }) {
  const paces = student.paces || {};
  const [vals, setVals] = useState({
    E: formatPace(paces.E), long: formatPace(paces.long), M: formatPace(paces.M),
    HM: formatPace(paces.HM), R: formatPace(paces.R),
  });
  const [msg, setMsg] = useState("");
  if (!paces.M) {
    return (
      <p className="text-sm" style={{ color: COLORS.textMuted }}>
        {isFitnessGoal(student.goal)
          ? "Este objetivo (Fitness 12/16) no usa ritmos específicos — los trotes son a esfuerzo libre/conversacional."
          : "Este alumno todavía no tiene un objetivo de carrera definido, así que no hay ritmos calculados aún. Usa \"Cambiar objetivo\" para definir uno."}
      </p>
    );
  }

  const row = (label, pace) => (
    <div className="flex items-center justify-between rounded-lg px-3 py-2 text-xs" style={{ background: COLORS.surface2, border: `1px solid ${COLORS.border}` }}>
      <span style={{ color: COLORS.textMuted }}>{label}</span>
      <span style={{ color: COLORS.textPrimary, fontFamily: "'JetBrains Mono', monospace" }}>{formatPace(pace)}/km</span>
    </div>
  );
  const editRow = (key, label) => (
    <div className="flex items-center justify-between rounded-lg px-3 py-2 text-xs gap-2" style={{ background: COLORS.surface2, border: `1px solid ${COLORS.track}` }}>
      <span style={{ color: COLORS.textMuted }}>{label}</span>
      <input type="text" value={vals[key]} onChange={(e) => setVals((v) => ({ ...v, [key]: e.target.value }))}
        className="w-20 rounded px-2 py-1 text-xs font-mono text-right" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
    </div>
  );

  const recalcFromM = () => {
    const m = parsePaceToDecimal(vals.M);
    if (m == null) return setMsg("Ingresa un ritmo maratón válido (m:ss) antes de recalcular.");
    const derived = deriveAllFromM(m);
    setVals({ E: formatPace(derived.E), long: formatPace(derived.long), M: formatPace(derived.M), HM: formatPace(derived.HM), R: formatPace(derived.R) });
    setMsg("Tabla recalculada desde el ritmo maratón. Revisa y guarda si está bien.");
  };
  const recalcFromHM = () => {
    const hm = parsePaceToDecimal(vals.HM);
    if (hm == null) return setMsg("Ingresa un ritmo media maratón válido (m:ss) antes de recalcular.");
    const derived = deriveAllFromHM(hm);
    setVals({ E: formatPace(derived.E), long: formatPace(derived.long), M: formatPace(derived.M), HM: formatPace(derived.HM), R: formatPace(derived.R) });
    setMsg("Ritmo de media maratón convertido a ritmo maratón equivalente, y tabla recalculada. Revisa y guarda si está bien.");
  };

  const save = async () => {
    const parsed = {};
    for (const k of ["E", "long", "M", "HM", "R"]) {
      const p = parsePaceToDecimal(vals[k]);
      if (p != null) parsed[k] = p;
    }
    setMsg("");
    const ok = await onSave(parsed);
    setMsg(ok ? "Ritmos actualizados. Se usarán desde la próxima semana que generes." : "No se pudo guardar.");
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl p-4" style={{ background: COLORS.bg, border: `1px solid ${COLORS.track}` }}>
        <div className="text-xs font-semibold mb-2" style={{ color: COLORS.track }}>RITMO MARATÓN — REFERENCIA PRINCIPAL</div>
        <p className="text-xs mb-3" style={{ color: COLORS.textMuted }}>Todo el resto de la tabla (repeticiones, intervalos, umbral, fondo, suave) se deriva de este valor. Si el objetivo del alumno es media maratón, conviértelo primero.</p>
        <div className="flex flex-wrap items-center gap-2">
          <input type="text" value={vals.M} onChange={(e) => setVals((v) => ({ ...v, M: e.target.value }))}
            className="w-24 rounded px-2 py-1.5 text-sm font-mono text-center" style={{ background: COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
          <span className="text-xs" style={{ color: COLORS.textMuted }}>min/km</span>
          <button onClick={recalcFromM} className="px-3 py-1.5 rounded text-xs font-semibold" style={{ background: COLORS.track, color: COLORS.lane }}>Recalcular tabla desde M</button>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <span className="text-xs" style={{ color: COLORS.textMuted }}>o desde media maratón:</span>
          <input type="text" value={vals.HM} onChange={(e) => setVals((v) => ({ ...v, HM: e.target.value }))}
            className="w-24 rounded px-2 py-1.5 text-sm font-mono text-center" style={{ background: COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
          <button onClick={recalcFromHM} className="px-3 py-1.5 rounded text-xs font-semibold" style={{ background: COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>Convertir HM → M y recalcular</button>
        </div>
        {msg && <p className="text-xs mt-2" style={{ color: COLORS.moderate }}>{msg}</p>}
      </div>
      <p className="text-xs" style={{ color: COLORS.textMuted }}>
        También puedes editar cualquier fila individual a mano en cualquier momento (sin recalcular el resto).
      </p>
      <div>
        <div className="text-xs font-semibold mb-2" style={{ color: COLORS.textMuted }}>RECUPERACIÓN / RODAJE SUAVE</div>
        <div className="space-y-1.5">{editRow("E", "Suave / recuperación (E)")}</div>
      </div>
      <div>
        <div className="text-xs font-semibold mb-2" style={{ color: COLORS.textMuted }}>FONDO ESTRUCTURADO</div>
        <div className="space-y-1.5">
          {editRow("long", "Cuerpo (rango 30-60\" más lento que M)")}
        </div>
      </div>
      <div>
        <div className="text-xs font-semibold mb-2" style={{ color: COLORS.textMuted }}>REPETICIONES (base 200m, resto se extrapola)</div>
        <div className="space-y-1.5">
          {editRow("R", "200 m")}
          {R_DISTANCES.filter((d) => d !== 0.2).map((d) => row(formatDist(d), getRPace(parsePaceToDecimal(vals.R) ?? paces.R, parsePaceToDecimal(vals.HM) ?? paces.HM, d)))}
        </div>
      </div>
      <div>
        <div className="text-xs font-semibold mb-2" style={{ color: COLORS.textMuted }}>INTERVALOS (por distancia)</div>
        <div className="space-y-1.5">{I_DISTANCES.map((d) => row(formatDist(d), getIPace(parsePaceToDecimal(vals.HM) ?? paces.HM, parsePaceToDecimal(vals.M) ?? paces.M, d)))}</div>
      </div>
      <div>
        <div className="text-xs font-semibold mb-2" style={{ color: COLORS.textMuted }}>UMBRAL CONTINUO (por duración)</div>
        <div className="space-y-1.5">{T_DURATIONS.map((t) => row(`${t} minutos`, getTPaceForDuration(parsePaceToDecimal(vals.HM) ?? paces.HM, parsePaceToDecimal(vals.M) ?? paces.M, t)))}</div>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={busy} className="px-4 py-1.5 rounded text-sm font-semibold" style={{ background: COLORS.track, color: COLORS.lane }}>Guardar ritmos</button>
        {msg && <span className="text-xs" style={{ color: COLORS.textMuted }}>{msg}</span>}
      </div>
    </div>
  );
}

function CoachDashboard({ roster: rosterProp, refreshRoster: refreshRosterProp, onBack }) {
  // El coach necesita el listado COMPLETO (objetivo, nivel, semana, adherencia). La lista que
  // llega desde la pantalla de inicio viene recortada a nombre e id por seguridad, así que
  // aquí se pide el listado real — el servidor ya sabe que hay una sesión de coach válida.
  const [roster, setRoster] = useState(rosterProp || []);
  const refreshRoster = useCallback(async () => {
    const full = await safeGetWithRetry("roster", 3, 350);
    if (full != null) setRoster(full);
    if (refreshRosterProp) refreshRosterProp();
  }, [refreshRosterProp]);
  useEffect(() => { refreshRoster(); }, []);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(null);
  const [goalFilter, setGoalFilter] = useState("");
  const [rosterProgress, setRosterProgress] = useState({});
  const [showDailyActivity, setShowDailyActivity] = useState(false);
  const [dailyActivity, setDailyActivity] = useState(null);
  const [activityStudentFilter, setActivityStudentFilter] = useState("");
  const [activityDateFrom, setActivityDateFrom] = useState("");
  const [activityDateTo, setActivityDateTo] = useState("");
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [studentLoading, setStudentLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [student, setStudent] = useState(null);
  const [busy, setBusy] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [justClosed, setJustClosed] = useState(null);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [showPinChange, setShowPinChange] = useState(false);
  const [showNameChange, setShowNameChange] = useState(false);
  const [newName, setNewName] = useState("");
  const [nameMsg, setNameMsg] = useState("");
  const [showObjetivoInfo, setShowObjetivoInfo] = useState(false);
  const [showEditUser, setShowEditUser] = useState(false);
  const [showOtros, setShowOtros] = useState(false);
  const [showChangeGoal, setShowChangeGoal] = useState(false);
  const [showIntermediateRace, setShowIntermediateRace] = useState(false);
  const [interRaceGoal, setInterRaceGoal] = useState("21k");
  const [interRaceDate, setInterRaceDate] = useState("");
  const [newPin, setNewPin] = useState("");
  const [pinMsg, setPinMsg] = useState("");
  const [showReports, setShowReports] = useState(false);
  const [reports, setReports] = useState([]);
  const [showPaceAlerts, setShowPaceAlerts] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [showKmSummary, setShowKmSummary] = useState(false);
  const [reportWeekNum, setReportWeekNum] = useState(null);
  const [kmGroupBy, setKmGroupBy] = useState("week");
  const [qrUrl, setQrUrl] = useState("https://trotamundos-seven.vercel.app");
  const [paceAlerts, setPaceAlerts] = useState([]);
  const [showPanorama, setShowPanorama] = useState(false);
  const [showRitmos, setShowRitmos] = useState(false);
  const [panoramaEdits, setPanoramaEdits] = useState({});
  const [panoramaLongEdits, setPanoramaLongEdits] = useState({});
  const [qualityEdits, setQualityEdits] = useState({});
  const [proposal, setProposal] = useState(null);
  const [proposalValues, setProposalValues] = useState({});

  useEffect(() => {
    let active = true;
    if (!selectedId) { setStudent(null); return; }
    setStudentLoading(true);
    setJustClosed(null);
    setResetConfirm(false);
    setDeleteConfirm(false);
    setShowPinChange(false);
    setShowNameChange(false);
    setNameMsg("");
    setShowObjetivoInfo(false);
    setShowEditUser(false);
    setShowOtros(false);
    setShowPanorama(false);
    setShowRitmos(false);
    setViewedWeek(null);
    setShowChangeGoal(false);
    setShowIntermediateRace(false);
    setInterRaceDate("");
    setPanoramaEdits({});
    setPanoramaLongEdits({});
    setQualityEdits({});
    setProposal(null);
    setPinMsg("");
    safeGetWithRetry(`student:${selectedId}`).then((s) => { if (active) { setStudent(s); setStudentLoading(false); } });
    return () => { active = false; };
  }, [selectedId]);

  useEffect(() => { if (showReports) safeGet("reports").then((r) => setReports(r || [])); }, [showReports]);
  const loadPaceAlerts = useCallback(() => { safeGet("paceAlerts").then((a) => setPaceAlerts(a || [])); }, []);
  useEffect(() => { loadPaceAlerts(); }, [loadPaceAlerts]);
  useEffect(() => { if (showPaceAlerts) loadPaceAlerts(); }, [showPaceAlerts, loadPaceAlerts]);

  const pendingAlertsCount = paceAlerts.filter((a) => a.status === "pending").length;

  const resolvePaceAlert = async (alert, apply) => {
    setBusy(true);
    if (apply) {
      const target = await safeGet(`student:${alert.studentId}`);
      if (target) {
        const newPaces = applyPaceAdjustment(target.paces || {}, alert.trigger, alert.q1PaceKey, alert.q2PaceKey, target.goal);
        const updatedTarget = { ...target, paces: newPaces };
        await safeSet(`student:${alert.studentId}`, updatedTarget);
        if (student && student.id === alert.studentId) setStudent(updatedTarget);
      }
    }
    const allAlerts = (await safeGet("paceAlerts")) || [];
    const newAlerts = allAlerts.map((a) => (a.id === alert.id ? { ...a, status: apply ? "applied" : "dismissed" } : a));
    await safeSet("paceAlerts", newAlerts);
    setPaceAlerts(newAlerts);
    setBusy(false);
  };

  const changeGoal = async ({ goal, raceDate, targetPaceStr, peakKmOverride, applyTiming }) => {
    if (!student) return;
    setBusy(true);
    const applyNext = applyTiming === "next";
    const targetWeekNum = applyNext ? student.currentWeek + 1 : student.currentWeek;
    const existingTargetWeek = student.weeks[targetWeekNum];
    let updated;
    if (isFitnessGoal(goal)) {
      const plan = buildBeginnerPlan(0, goal, student.level, student.trainDays);
      const weekEntry = { weeklyKm: null, phase: "principiante", plan, log: emptyLog(), note: `Objetivo actualizado: ${GOAL_LABEL[goal]}.`, submitted: false };
      updated = {
        ...student, goal, raceDate: null, targetPaceStr: null, paces: {}, peakKm: null, peakLongKm: null,
        volumeOverrides: {}, longRunOverrides: {}, qualityStreaks: { q1: 0, q2: 0 },
        weeksToRace: null, currentWeek: targetWeekNum, beginnerStage: 0,
        weeks: { ...student.weeks, [targetWeekNum]: weekEntry },
      };
    } else if (student.level === "principiante") {
      const vdot = computeVDOT(DISTANCE_KM[goal], parsePaceToDecimal(targetPaceStr));
      const paces = computeTrainingPaces(vdot);
      paces.race = parsePaceToDecimal(targetPaceStr);
      anchorPacesToGoal(paces, goal);
      const peakKm = peakKmOverride || computePeakKm(goal, student.level, vdot);
      const plan = buildBeginnerPlan(student.beginnerStage ?? 0, "fitness", student.level, student.trainDays);
      const weekEntry = applyNext
        ? { weeklyKm: null, phase: "principiante", plan, log: emptyLog(), note: `Objetivo actualizado: ${GOAL_LABEL[goal]}.`, submitted: false }
        : { ...existingTargetWeek, plan, note: `Objetivo actualizado: ${GOAL_LABEL[goal]}.` };
      updated = {
        ...student, goal, raceDate, targetPaceStr, paces, peakKm, currentWeek: targetWeekNum, weeksToRace: weeksBetween(raceDate),
        volumeOverrides: {}, longRunOverrides: {}, qualityStreaks: { q1: 0, q2: 0 },
        weeks: { ...student.weeks, [targetWeekNum]: weekEntry },
      };
    } else {
      const vdot = computeVDOT(DISTANCE_KM[goal], parsePaceToDecimal(targetPaceStr));
      const paces = computeTrainingPaces(vdot);
      paces.race = parsePaceToDecimal(targetPaceStr);
      anchorPacesToGoal(paces, goal);
      const peakKm = peakKmOverride || computePeakKm(goal, student.level, vdot);
      const peakLongKm = capLongRunKm(goal, student.level, 999);
      const weeksToRace = weeksBetween(raceDate);
      const { phase, weeklyKm, plan } = buildInitialRacePlan(goal, student.level, peakKm, peakLongKm, weeksToRace, paces);
      const note = `Objetivo actualizado: ${GOAL_LABEL[goal]}. Fase: ${PHASE_LABEL[phase]}.`;
      const weekEntry = applyNext
        ? { weeklyKm, phase, plan, log: emptyLog(), note, submitted: false }
        : { ...existingTargetWeek, weeklyKm, phase, plan, note };
      updated = {
        ...student, goal, raceDate, targetPaceStr, paces, peakKm, peakLongKm, weeksToRace, currentWeek: targetWeekNum,
        volumeOverrides: {}, longRunOverrides: {}, qualityStreaks: { q1: 0, q2: 0 },
        weeks: { ...student.weeks, [targetWeekNum]: weekEntry },
      };
    }
    await safeSet(`student:${student.id}`, updated);
    const freshRoster1 = (await safeGet("roster")) || [];
    const newRoster = freshRoster1.map((r) => (r.id === student.id ? { ...r, goal: updated.goal, raceDate: updated.raceDate, weekNumber: updated.currentWeek } : r));
    await safeSet("roster", newRoster);
    setStudent(updated);
    refreshRoster();
    setShowChangeGoal(false);
    setBusy(false);
  };

  const saveRitmos = async (parsed) => {
    if (!student) return false;
    setBusy(true);
    const newPaces = { ...(student.paces || {}), ...parsed };
    const updated = { ...student, paces: newPaces };
    const ok = await safeSet(`student:${student.id}`, updated);
    if (ok) setStudent(updated);
    setBusy(false);
    return ok;
  };

  const exportBackup = async () => {
    setBusy(true);
    try {
      const currentRoster = (await safeGet("roster")) || [];
      const students = {};
      for (const r of currentRoster) {
        const s = await safeGet(`student:${r.id}`);
        if (s) students[r.id] = s;
      }
      const allReports = (await safeGet("reports")) || [];
      const allAlerts = (await safeGet("paceAlerts")) || [];
      const coachAuthData = await safeGet("coachAuth");
      const backup = {
        app: "TROTAMUNDOS", exportedAt: new Date().toISOString(),
        roster: currentRoster, students, reports: allReports, paceAlerts: allAlerts, coachAuth: coachAuthData,
      };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `trotamundos-respaldo-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("backup export error", e);
    }
    setBusy(false);
  };

  const waitingCount = roster.filter((r) => r.waitingApproval).length;
  const lowAdherenceCount = roster.filter((r) => r.lastAdherence != null && r.lastAdherence < 0.7).length;
  const pausedCount = roster.filter((r) => r.paused).length;
  let filteredRoster = search.trim() ? roster.filter((r) => r.name.toLowerCase().includes(search.toLowerCase())) : roster;
  if (statusFilter === "waiting") filteredRoster = filteredRoster.filter((r) => r.waitingApproval);
  else if (statusFilter === "low") filteredRoster = filteredRoster.filter((r) => r.lastAdherence != null && r.lastAdherence < 0.7);
  else if (statusFilter === "paused") filteredRoster = filteredRoster.filter((r) => r.paused);
  if (goalFilter) filteredRoster = filteredRoster.filter((r) => r.goal === goalFilter);
  filteredRoster = [...filteredRoster].sort((a, b) => a.name.localeCompare(b.name, "es"));

  const loadDailyActivity = async () => {
    setLoadingActivity(true);
    const rows = [];
    for (const r of roster) {
      const s = await safeGet(`student:${r.id}`);
      if (!s) continue;
      // revisa la semana actual y la anterior, para no perder actividad de ayer/anteayer justo
      // cuando el coach ya haya cerrado la semana.
      const weekNumsToCheck = [s.currentWeek, s.currentWeek - 1].filter((n) => n >= 1 && s.weeks[n]);
      weekNumsToCheck.forEach((wk) => {
        const week = s.weeks[wk];
        const { monday } = getWeekDates(s, wk);
        (week.plan || []).forEach((d, i) => {
          const l = week.log?.[i];
          if (d.paceKey && l?.completed) {
            const dayDate = new Date(monday);
            dayDate.setDate(monday.getDate() + i);
            rows.push({
              studentName: s.name, dayLabel: d.day, type: d.type,
              plannedKm: d.km, actualKm: l.actualKm !== "" && l.actualKm != null ? Number(l.actualKm) : d.km,
              rpe: l.rpe !== "" && l.rpe != null ? l.rpe : null, note: l.note || "",
              date: dayDate,
            });
          }
        });
      });
    }
    rows.sort((a, b) => b.date - a.date);
    setDailyActivity(rows);
    setLoadingActivity(false);
  };

  // Cuántos entrenos lleva registrados cada alumno esta semana (ej. "3 de 5") — se carga sola
  // cada vez que cambia la lista de alumnos, sin bloquear el resto del panel.
  const loadRosterProgress = useCallback(async () => {
    const entries = {};
    for (const r of roster) {
      const s = await safeGet(`student:${r.id}`);
      if (!s) continue;
      const wk = s.currentWeek;
      const week = s.weeks[wk];
      if (!week) continue;
      // Se cuenta sobre el plan completo para no perder la posición real de cada día:
      // filtrar primero y luego buscar en el registro por el índice del array filtrado
      // desalineaba los días y daba conteos menores a los reales.
      const total = (week.plan || []).filter((d) => !!d.paceKey).length;
      const completed = (week.plan || []).filter((d, i) => !!d.paceKey && week.log?.[i]?.completed).length;
      entries[r.id] = { completed, total };
    }
    setRosterProgress(entries);
  }, [roster]);
  useEffect(() => { loadRosterProgress(); }, [roster]);

  const createStudent = async ({ name, goal, level, pin, raceDate, targetPaceStr, peakKmOverride, fitnessStartWeek, planTiming, trainDays, forceCreate }) => {
    if (busy) return; // segunda capa: evita crear dos veces si algo dispara la acción por duplicado
    setBusy(true);
    const id = uid();
    const pinSalt = genSalt();
    const pinHash = await hashText(pin, pinSalt);
    const msMonday = mondayOf(new Date());
    if (planTiming === "next") msMonday.setDate(msMonday.getDate() + 7);
    const planStartMonday = `${msMonday.getFullYear()}-${String(msMonday.getMonth() + 1).padStart(2, "0")}-${String(msMonday.getDate()).padStart(2, "0")}`;
    const finalTrainDays = level === "principiante" && trainDays && trainDays.length === 3 ? trainDays : undefined;
    let newStudent;
    if (isFitnessGoal(goal)) {
      const startWeek = fitnessStartWeek || FITNESS16_STAGES.length;
      const initialStage = fitnessStageIndexFromWeeksToGoal(startWeek);
      const plan = buildBeginnerPlan(initialStage, goal, level, finalTrainDays);
      newStudent = {
        id, name, goal, level, pinHash, pinSalt, raceDate: null, targetPaceStr: null, paces: {}, peakKm: null, peakLongKm: null,
        volumeOverrides: {}, longRunOverrides: {}, qualityStreaks: { q1: 0, q2: 0 }, planStartMonday, trainDays: finalTrainDays,
        weeksToRace: null, currentWeek: 1, beginnerStage: initialStage,
        weeks: { 1: { weeklyKm: null, phase: "principiante", plan, log: emptyLog(), note: `Plan inicial (semana ${startWeek}): ${getStageTable(goal)[initialStage].label}.`, submitted: false } },
      };
    } else if (level === "principiante") {
      const plan = buildBeginnerPlan(0, "fitness", level, finalTrainDays);
      const vdot = computeVDOT(DISTANCE_KM[goal], parsePaceToDecimal(targetPaceStr));
      const paces = computeTrainingPaces(vdot);
      paces.race = parsePaceToDecimal(targetPaceStr);
      anchorPacesToGoal(paces, goal);
      const peakKm = peakKmOverride || computePeakKm(goal, level, vdot);
      newStudent = {
        id, name, goal, level, pinHash, pinSalt, raceDate, targetPaceStr, paces, peakKm, volumeOverrides: {}, longRunOverrides: {}, qualityStreaks: { q1: 0, q2: 0 }, planStartMonday, trainDays: finalTrainDays,
        weeksToRace: weeksBetween(raceDate), currentWeek: 1, beginnerStage: 0,
        weeks: { 1: { weeklyKm: null, phase: "principiante", plan, log: emptyLog(), note: `Plan de acondicionamiento inicial: ${BEGINNER_STAGES[0].label}.`, submitted: false } },
      };
    } else {
      const vdot = computeVDOT(DISTANCE_KM[goal], parsePaceToDecimal(targetPaceStr));
      const paces = computeTrainingPaces(vdot);
      paces.race = parsePaceToDecimal(targetPaceStr);
      anchorPacesToGoal(paces, goal);
      const peakKm = peakKmOverride || computePeakKm(goal, level, vdot);
      const peakLongKm = capLongRunKm(goal, level, 999);
      const weeksToRace = weeksBetween(raceDate);
      const { phase, weeklyKm, plan } = buildInitialRacePlan(goal, level, peakKm, peakLongKm, weeksToRace, paces);
      newStudent = {
        id, name, goal, level, pinHash, pinSalt, raceDate, targetPaceStr, paces, peakKm, peakLongKm, volumeOverrides: {}, longRunOverrides: {}, qualityStreaks: { q1: 0, q2: 0 }, weeksToRace, currentWeek: 1, planStartMonday,
        weeks: { 1: { weeklyKm, phase, plan, log: emptyLog(), note: `Fase inicial: ${PHASE_LABEL[phase]}.`, submitted: false } },
      };
    }
    if (!forceCreate) {
      const firstWeekPlan = newStudent.weeks[1]?.plan;
      const warnings = getAnomalyWarnings(firstWeekPlan);
      if (warnings.length) {
        setPendingCreate({ args: { name, goal, level, pin, raceDate, targetPaceStr, peakKmOverride, fitnessStartWeek, planTiming, trainDays }, warnings });
        setBusy(false);
        return;
      }
    }
    setPendingCreate(null);
    await safeSet(`student:${id}`, newStudent);
    const freshRoster2 = (await safeGet("roster")) || [];
    const newRoster = [...freshRoster2, { id, name, goal, level, weekNumber: 1, lastAdherence: null, raceDate: isFitnessGoal(goal) ? null : raceDate, waitingApproval: false }];
    await safeSet("roster", newRoster);
    setShowAdd(false);
    refreshRoster();
    setSelectedId(id);
    setSearch(name);
    setBusy(false);
  };

  const updateDay = (index, newDay) => {
    setStudent((s) => {
      const week = s.weeks[s.currentWeek];
      const plan = week.plan.map((d, i) => (i === index ? newDay : d));
      return { ...s, weeks: { ...s.weeks, [s.currentWeek]: { ...week, plan } } };
    });
  };
  // Intercambia el contenido completo de dos días entre sí (tipo, ritmo, km, overrides, etc.),
  // manteniendo la etiqueta de día (Lun, Mar...) fija a su posición real de la semana.
  const swapDays = (indexA, indexB) => {
    if (indexA === indexB) return;
    setStudent((s) => {
      const week = s.weeks[s.currentWeek];
      const plan = [...week.plan];
      const dayLabelA = plan[indexA].day, dayLabelB = plan[indexB].day;
      const a = { ...plan[indexB], day: dayLabelA };
      const b = { ...plan[indexA], day: dayLabelB };
      plan[indexA] = a;
      plan[indexB] = b;
      return { ...s, weeks: { ...s.weeks, [s.currentWeek]: { ...week, plan } } };
    });
  };
  const persistEdits = async () => {
    if (!student) return;
    setBusy(true);
    await safeSet(`student:${student.id}`, student);
    setBusy(false);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
  };

  const openProposal = () => {
    if (!student) return;
    const p = buildWeekProposal(student);
    setProposal(p);
    setProposalValues({
      weeklyKm: p.suggestedWeeklyKm ?? "", longRunKm: p.suggestedLongRunKm ?? "",
      q1PaceKey: p.suggestedQ1 ?? "", q2PaceKey: p.suggestedQ2 ?? "",
    });
  };
  const [anomalyWarnings, setAnomalyWarnings] = useState(null);
  const [pendingCreate, setPendingCreate] = useState(null);
  const confirmProposal = async (force) => {
    if (!student || !proposal) return;
    setBusy(true);
    let studentWithStreaks = student;
    if (student.level !== "principiante" && proposal.kind !== "principiante" && !student.weeks[student.currentWeek].paused && student.weeks[student.currentWeek].submitted) {
      const closedWeek = student.weeks[student.currentWeek];
      const qEval = evaluateQualityAdjustment(student, closedWeek);
      studentWithStreaks = { ...student, qualityStreaks: qEval.newStreaks };
      if (qEval.trigger) {
        await pushPaceAlert({
          id: uid(), studentId: student.id, studentName: student.name, weekNumber: student.currentWeek,
          trigger: qEval.trigger, q1PaceKey: qEval.q1PaceKey, q2PaceKey: qEval.q2PaceKey,
          q1Note: qEval.q1Note, q2Note: qEval.q2Note, q1ActualPace: qEval.q1ActualPace, q2ActualPace: qEval.q2ActualPace,
          q1TargetPace: qEval.q1TargetPace, q2TargetPace: qEval.q2TargetPace,
          status: "pending", createdAt: new Date().toISOString(),
        });
      }
    }
    const finalized = finalizeWeekPlan(studentWithStreaks, proposal, proposalValues);
    const updated = applyIntermediateRaceDayPatch(finalized.updated);
    const note = finalized.note;
    if (!force) {
      const newPlan = updated.weeks[updated.currentWeek]?.plan;
      const warnings = getAnomalyWarnings(newPlan);
      if (warnings.length) {
        setAnomalyWarnings(warnings);
        setBusy(false);
        return;
      }
    }
    setAnomalyWarnings(null);
    await safeSet(`student:${student.id}`, updated);
    const freshRoster3 = (await safeGet("roster")) || [];
    const newRoster = freshRoster3.map((r) => (r.id === student.id ? { ...r, weekNumber: updated.currentWeek, waitingApproval: false } : r));
    await safeSet("roster", newRoster);
    await pushReport({
      id: uid(), studentId: student.id, studentName: student.name, weekNumber: proposal.closedWeekNumber,
      weeklyKm: proposal.closedWeeklyKm, phase: proposal.closedPhase, adherencePct: proposal.adherencePct, avgRpe: proposal.avgRpe,
      note, closedAt: new Date().toISOString(),
    });
    setStudent(updated);
    refreshRoster();
    setJustClosed(note);
    setProposal(null);
    setBusy(false);
  };

  const handleEditQuality = (wk, qKey, field, val) => {
    const row = panoramaData.rows?.find((r) => r.weekNum === wk);
    if (row && (field === "dist" || field === "reps" || field === "type")) {
      const curEdit = qualityEdits[wk]?.[qKey] || {};
      const oldType = curEdit.type !== undefined ? curEdit.type : row[`${qKey}Type`];
      const oldDist = curEdit.dist !== undefined ? curEdit.dist : row[`${qKey}Dist`];
      const oldReps = curEdit.reps !== undefined ? curEdit.reps : row[`${qKey}Reps`];
      const oldKm = impliedQKm(oldType, oldDist, oldReps, student.paces);
      const newType = field === "type" ? val : oldType;
      const newDist = field === "dist" ? val : oldDist;
      const newReps = field === "reps" ? val : oldReps;
      const newKm = impliedQKm(newType, newDist, newReps, student.paces);
      if (oldKm != null && newKm != null && oldKm !== newKm) {
        const curWeeklyKm = panoramaEdits[wk] !== undefined ? panoramaEdits[wk] : row.km;
        setPanoramaEdits((e) => ({ ...e, [wk]: Math.max(0, r1(curWeeklyKm - oldKm + newKm)) }));
      }
    }
    setQualityEdits((e) => ({ ...e, [wk]: { ...e[wk], [qKey]: { ...(e[wk]?.[qKey] || {}), [field]: val } } }));
  };

  const reopenWeek = async () => {
    if (!student || isViewingLive) return;
    const targetWeek = activeWeekNum;
    const targetWeekData = student.weeks[targetWeek];
    if (!targetWeekData) return;
    setBusy(true);
    // El nuevo "weeksToRace" para la semana reabierta se reconstruye a partir del valor actual,
    // ya que cada cierre de semana lo desplaza en exactamente 1.
    const newWeeksToRace = student.weeksToRace != null ? student.weeksToRace + (student.currentWeek - targetWeek) : null;
    const newWeeks = {};
    Object.keys(student.weeks).forEach((k) => {
      if (Number(k) <= targetWeek) newWeeks[k] = student.weeks[k];
    });
    newWeeks[targetWeek] = { ...targetWeekData, submitted: false };
    const updated = { ...student, currentWeek: targetWeek, weeksToRace: newWeeksToRace, weeks: newWeeks };
    await safeSet(`student:${student.id}`, updated);
    setStudent(updated);
    setViewedWeek(null);
    refreshRoster();
    setBusy(false);
  };

  const refreshTitles = async () => {
    if (!student) return;
    setBusy(true);
    const cw = student.currentWeek;
    const week = student.weeks[cw];
    const newPlan = week.plan.map((d, i) => {
      const isMondayRecovery = i === 0 && d.slot === "easy";
      return { ...d, type: getDefaultTitle(d.paceKey, isMondayRecovery, d.runWalk) ?? d.type };
    });
    const updated = { ...student, weeks: { ...student.weeks, [cw]: { ...week, plan: newPlan } } };
    await safeSet(`student:${student.id}`, updated);
    setStudent(updated);
    setBusy(false);
  };

  const savePanorama = async () => {
    if (!student) return;
    setBusy(true);
    const qualityOverrides = { ...(student.qualityOverrides || {}) };
    for (const [wk, edits] of Object.entries(qualityEdits)) {
      const merged = { ...(qualityOverrides[wk] || {}) };
      if (edits.q1?.type !== undefined) merged.q1Type = edits.q1.type;
      if (edits.q1?.dist !== undefined) merged.q1Dist = edits.q1.dist;
      if (edits.q1?.reps !== undefined) merged.q1Reps = edits.q1.reps;
      if (edits.q2?.type !== undefined) merged.q2Type = edits.q2.type;
      if (edits.q2?.dist !== undefined) merged.q2Dist = edits.q2.dist;
      if (edits.q2?.reps !== undefined) merged.q2Reps = edits.q2.reps;
      if (edits.q3?.type !== undefined) merged.q3Type = edits.q3.type;
      qualityOverrides[wk] = merged;
    }
    let updated = {
      ...student,
      volumeOverrides: { ...(student.volumeOverrides || {}), ...panoramaEdits },
      longRunOverrides: { ...(student.longRunOverrides || {}), ...panoramaLongEdits },
      qualityOverrides,
    };
    const cw = student.currentWeek;
    const cwQuality = qualityOverrides[cw];
    const editsThisWeek = panoramaEdits[cw] !== undefined || panoramaLongEdits[cw] !== undefined || qualityEdits[cw] !== undefined;
    if (editsThisWeek && !isFitnessGoal(student.goal) && student.level !== "principiante") {
      const week = student.weeks[cw];
      const currentLongDay = week.plan.find((d) => d.slot === "long");
      const newWeeklyKm = panoramaEdits[cw] !== undefined ? panoramaEdits[cw] : week.weeklyKm;
      const newLongKm = panoramaLongEdits[cw] !== undefined ? panoramaLongEdits[cw] : (currentLongDay ? currentLongDay.km : newWeeklyKm * 0.4);
      const q1Day = week.plan.find((d) => d.slot === "q1");
      const q2Day = week.plan.find((d) => d.slot === "q2");
      const taperWeeks = getTaperWeeks(student.goal);
      const weeksToRaceNow = student.weeksToRace != null ? student.weeksToRace : weeksBetween(student.raceDate);
      const cyclePosNow = getCyclePosition(weeksToRaceNow, taperWeeks);
      const qpNow = suggestQualityPaces(student.goal, week.phase, weeksToRaceNow, taperWeeks, cyclePosNow, student.level);
      const q1PaceKey = cwQuality?.q1Type || (q1Day ? q1Day.paceKey : "E");
      const q2PaceKey = cwQuality?.q2Type || (q2Day ? q2Day.paceKey : "E");
      let newPlan = buildRacePlan(
        student.goal, week.phase, student.level, newWeeklyKm, newLongKm,
        q1PaceKey, q2PaceKey, student.paces || {}, weeksToRaceNow, taperWeeks
      );
      const q1TypeChanged = cwQuality?.q1Type && cwQuality.q1Type !== qpNow.q1;
      const q2TypeChanged = cwQuality?.q2Type && cwQuality.q2Type !== qpNow.q2;
      const q1Dist = cwQuality?.q1Dist || (q1TypeChanged ? null : qpNow.q1Dist);
      const q1Reps = cwQuality?.q1Reps ?? (cwQuality?.q1Dist || q1TypeChanged ? null : qpNow.q1Reps);
      const q2Dist = cwQuality?.q2Dist || (q2TypeChanged ? null : qpNow.q2Dist);
      const q2Reps = cwQuality?.q2Reps ?? (cwQuality?.q2Dist || q2TypeChanged ? null : qpNow.q2Reps);
      newPlan = newPlan.map((d) => {
        if (d.slot === "q1" && q1Dist) { const next = { ...d, distOverride: q1Dist, repsOverride: q1Reps || undefined }; return { ...next, km: computeImpliedKm(next) }; }
        if (d.slot === "q2" && q2Dist && q2PaceKey === "brokenT") { const next = { ...d, distOverride: q2Dist, brokenTRefMin: q2TypeChanged ? null : qpNow.q2RefMin, recoveryOverride: q2Reps }; return { ...next, km: computeImpliedKm(next) }; }
        if (d.slot === "q2" && q2Dist && q2PaceKey === "I") { const next = { ...d, distOverride: q2Dist, repsOverride: q2Reps || undefined }; return { ...next, km: computeImpliedKm(next) }; }
        if (d.slot === "q3" && cwQuality?.q3Type) return { ...d, paceKey: cwQuality.q3Type === "broken" ? "broken" : "E", runWalk: cwQuality.q3Type !== "broken" };
        return d;
      });
      newPlan = balanceWeeklyVolume(newPlan, newWeeklyKm);
      updated = { ...updated, weeks: { ...updated.weeks, [cw]: { ...week, weeklyKm: newWeeklyKm, plan: newPlan } } };
    }
    await safeSet(`student:${student.id}`, updated);
    setStudent(updated);
    setPanoramaEdits({});
    setPanoramaLongEdits({});
    setQualityEdits({});
    setBusy(false);
  };

  const applyIntermediateRace = async () => {
    if (!student || !interRaceDate) return;
    setBusy(true);
    const ov = computeIntermediateRaceOverrides(student, interRaceGoal, interRaceDate);
    const updated = {
      ...student,
      volumeOverrides: { ...(student.volumeOverrides || {}), ...ov.volumeOverrides },
      longRunOverrides: { ...(student.longRunOverrides || {}), ...ov.longRunOverrides },
      qualityOverrides: { ...(student.qualityOverrides || {}), ...ov.qualityOverrides },
      intermediateRace: { goalId: interRaceGoal, date: interRaceDate, raceWeekNum: ov.raceWeekNum, recoveryWeekNum: ov.recoveryWeekNum },
    };
    await safeSet(`student:${student.id}`, updated);
    setStudent(updated);
    setInterRaceDate("");
    setBusy(false);
  };
  const removeIntermediateRace = async () => {
    if (!student || !student.intermediateRace) return;
    setBusy(true);
    const { raceWeekNum, recoveryWeekNum } = student.intermediateRace;
    const volumeOverrides = { ...(student.volumeOverrides || {}) };
    const longRunOverrides = { ...(student.longRunOverrides || {}) };
    const qualityOverrides = { ...(student.qualityOverrides || {}) };
    delete volumeOverrides[raceWeekNum]; delete volumeOverrides[recoveryWeekNum];
    delete longRunOverrides[raceWeekNum];
    delete qualityOverrides[raceWeekNum]; delete qualityOverrides[recoveryWeekNum];
    const updated = { ...student, volumeOverrides, longRunOverrides, qualityOverrides, intermediateRace: null };
    await safeSet(`student:${student.id}`, updated);
    setStudent(updated);
    setBusy(false);
  };
  const INTERMEDIATE_RACE_LABEL = { "10k": "10K", "21k": "MEDIA MARATÓN", "42k": "MARATÓN" };
// Convierte el domingo de la semana de la carrera intermedia en un día de carrera real —
// distancia exacta y sin la estructura de fondo progresivo (calentamiento + bloque + cierre),
// en vez de solo cambiarle el kilometraje al fondo normal.
function applyIntermediateRaceDayPatch(student) {
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
const resetPlan = async () => {
    if (!student) return;
    setBusy(true);
    let updated;
    if (isFitnessGoal(student.goal) || student.level === "principiante") {
      updated = { ...student, currentWeek: 1, beginnerStage: 0, weeks: { 1: { weeklyKm: null, phase: "principiante", plan: buildBeginnerPlan(0, student.goal, student.level, student.trainDays), log: emptyLog(), note: "Plan reiniciado desde cero.", submitted: false } } };
    } else {
      const weeksToRace = weeksBetween(student.raceDate);
      const peakLongKm = student.peakLongKm || capLongRunKm(student.goal, student.level, 999);
      const { phase, weeklyKm, plan } = buildInitialRacePlan(student.goal, student.level, student.peakKm, peakLongKm, weeksToRace, student.paces || {});
      updated = { ...student, currentWeek: 1, weeksToRace, peakLongKm, volumeOverrides: {}, longRunOverrides: {}, qualityStreaks: { q1: 0, q2: 0 }, weeks: { 1: { weeklyKm, phase, plan, log: emptyLog(), note: "Plan reiniciado desde cero.", submitted: false } } };
    }
    await safeSet(`student:${student.id}`, updated);
    const freshRoster4 = (await safeGet("roster")) || [];
    const newRoster = freshRoster4.map((r) => (r.id === student.id ? { ...r, weekNumber: 1, lastAdherence: null, waitingApproval: false } : r));
    await safeSet("roster", newRoster);
    setStudent(updated);
    refreshRoster();
    setJustClosed(null);
    setResetConfirm(false);
    setBusy(false);
  };

  const changePin = async () => {
    if (!student || !/^\d{4}$/.test(newPin)) { setPinMsg("El PIN debe tener 4 dígitos."); return; }
    setBusy(true);
    const pinSalt = genSalt();
    const pinHash = await hashText(newPin, pinSalt);
    const updated = { ...student, pinHash, pinSalt };
    await safeSet(`student:${student.id}`, updated);
    setStudent(updated);
    setPinMsg("PIN actualizado.");
    setNewPin("");
    setBusy(false);
  };

  const changeName = async () => {
    if (!student || !newName.trim()) { setNameMsg("Ingresa un nombre válido."); return; }
    setBusy(true);
    const updated = { ...student, name: newName.trim() };
    await safeSet(`student:${student.id}`, updated);
    const freshRoster = (await safeGet("roster")) || roster;
    const newRoster = freshRoster.map((r) => (r.id === student.id ? { ...r, name: newName.trim() } : r));
    await safeSet("roster", newRoster);
    setStudent(updated);
    setNameMsg("Nombre actualizado.");
    setNewName("");
    refreshRoster();
    setBusy(false);
  };

  const togglePauseWeek = async () => {
    if (!student) return;
    setBusy(true);
    const week = student.weeks[student.currentWeek];
    const nowPaused = !week.paused;
    const updated = {
      ...student,
      weeks: {
        ...student.weeks,
        [student.currentWeek]: {
          ...week, paused: nowPaused,
          note: nowPaused ? "Semana pausada por lesión/viaje. No se contará como fallo ni penalizará el volumen del ciclo." : week.note,
        },
      },
    };
    await safeSet(`student:${student.id}`, updated);
    setStudent(updated);
    const rosterNow = await safeGet("roster");
    if (rosterNow) {
      const newRoster = rosterNow.map((r) => (r.id === student.id ? { ...r, paused: nowPaused } : r));
      await safeSet("roster", newRoster);
      refreshRoster();
    }
    setBusy(false);
  };

  const deleteStudent = async () => {
    if (!student) return;
    setBusy(true);
    const freshRoster = (await safeGet("roster")) || roster;
    const newRoster = freshRoster.filter((r) => r.id !== student.id);
    await safeSet("roster", newRoster);
    await safeDelete(`student:${student.id}`);
    setSelectedId(null);
    setStudent(null);
    setDeleteConfirm(false);
    refreshRoster();
    setBusy(false);
  };

  const [viewedWeek, setViewedWeek] = useState(null);
  useEffect(() => { setViewedWeek(null); }, [student?.currentWeek]);
  const activeWeekNum = viewedWeek ?? (student ? student.currentWeek : null);
  const week = student ? student.weeks[activeWeekNum] : null;
  const isViewingLive = !student || activeWeekNum === student.currentWeek;
  const panoramaData = student ? projectWeeklyVolumes(student) : { kind: "flat", rows: [] };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="p-2 rounded-lg" style={{ color: COLORS.textMuted }}><ArrowLeft size={18} /></button>
        <Users size={20} style={{ color: COLORS.track }} />
        <h1 className="text-xl font-semibold tracking-wide flex-1" style={{ fontFamily: "'Oswald', sans-serif", color: COLORS.textPrimary }}>PANEL DEL COACH</h1>
        <button onClick={exportBackup} disabled={busy}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold"
          style={{ background: COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
          <Download size={14} /> Respaldo
        </button>
        <button onClick={() => setShowQR((v) => !v)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold"
          style={{ background: showQR ? COLORS.track : COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
          <QrCode size={14} /> Código QR
        </button>
        <button onClick={async () => { const next = !showDailyActivity; setShowDailyActivity(next); if (next && !dailyActivity) await loadDailyActivity(); }}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold"
          style={{ background: showDailyActivity ? COLORS.track : COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
          <Activity size={14} /> Actividad diaria
        </button>
        <button onClick={() => setShowPaceAlerts((v) => !v)}
          className="relative flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold"
          style={{ background: showPaceAlerts ? COLORS.moderate : COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
          <AlertCircle size={14} /> Ajustes de ritmo
          {pendingAlertsCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 rounded-full text-[10px] font-bold flex items-center justify-center"
              style={{ width: 18, height: 18, background: COLORS.track, color: COLORS.lane }}>
              {pendingAlertsCount}
            </span>
          )}
        </button>
        <button onClick={() => setShowReports((v) => !v)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold"
          style={{ background: showReports ? COLORS.track : COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
          <FileText size={14} /> Reportes
        </button>
      </div>

      {showQR && (
        <div className="rounded-xl p-4 mb-6" style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}>
          <div className="text-sm font-semibold mb-2" style={{ color: COLORS.textPrimary, fontFamily: "'Oswald', sans-serif" }}>CÓDIGO QR</div>
          <p className="text-xs mb-3" style={{ color: COLORS.textMuted }}>
            Pega aquí el enlace publicado de esta app (el que compartes con tus alumnos) para generar un código QR que puedan escanear en vez de escribir la URL.
          </p>
          <input type="text" placeholder="https://claude.ai/..." value={qrUrl} onChange={(e) => setQrUrl(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm mb-3" style={{ background: COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
          {qrUrl.trim() && (
            <div className="flex flex-col items-start gap-2">
              <QRCodeSVG text={qrUrl.trim()} size={220} />
              <p className="text-[10px]" style={{ color: COLORS.textMuted }}>
                Generado directamente en la app, sin depender de internet ni de ningún servicio externo.
              </p>
            </div>
          )}
        </div>
      )}

      {showDailyActivity && (() => {
        let filteredActivity = dailyActivity || [];
        if (activityStudentFilter) filteredActivity = filteredActivity.filter((r) => r.studentName === activityStudentFilter);
        if (activityDateFrom) { const from = new Date(activityDateFrom + "T00:00:00"); filteredActivity = filteredActivity.filter((r) => r.date >= from); }
        if (activityDateTo) { const to = new Date(activityDateTo + "T23:59:59"); filteredActivity = filteredActivity.filter((r) => r.date <= to); }
        const groups = [];
        filteredActivity.forEach((row) => {
          const key = row.date.toDateString();
          let g = groups.find((x) => x.key === key);
          if (!g) { g = { key, date: row.date, rows: [] }; groups.push(g); }
          g.rows.push(row);
        });
        const studentNames = [...new Set(roster.map((r) => r.name))].sort();
        return (
          <div className="rounded-xl p-4 mb-6" style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold" style={{ color: COLORS.textPrimary, fontFamily: "'Oswald', sans-serif" }}>ACTIVIDAD DIARIA — TODOS LOS ALUMNOS</div>
              <button onClick={loadDailyActivity} disabled={loadingActivity} className="text-xs underline" style={{ color: COLORS.textMuted }}>
                {loadingActivity ? "Actualizando…" : "Actualizar"}
              </button>
            </div>
            <p className="text-xs mb-3" style={{ color: COLORS.textMuted }}>
              Sesiones que tus alumnos ya marcaron como completadas, de más reciente a más antigua — sin esperar a que termine la semana.
            </p>
            <div className="flex flex-wrap gap-2 mb-3">
              <select value={activityStudentFilter} onChange={(e) => setActivityStudentFilter(e.target.value)}
                className="rounded-lg px-2 py-1.5 text-xs" style={{ background: COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                <option value="">Todos los alumnos</option>
                {studentNames.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <div className="flex items-center gap-1">
                <label className="text-xs" style={{ color: COLORS.textMuted }}>Desde</label>
                <input type="date" value={activityDateFrom} onChange={(e) => setActivityDateFrom(e.target.value)}
                  className="rounded-lg px-2 py-1.5 text-xs" style={{ background: COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
              </div>
              <div className="flex items-center gap-1">
                <label className="text-xs" style={{ color: COLORS.textMuted }}>Hasta</label>
                <input type="date" value={activityDateTo} onChange={(e) => setActivityDateTo(e.target.value)}
                  className="rounded-lg px-2 py-1.5 text-xs" style={{ background: COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
              </div>
              {(activityStudentFilter || activityDateFrom || activityDateTo) && (
                <button onClick={() => { setActivityStudentFilter(""); setActivityDateFrom(""); setActivityDateTo(""); }}
                  className="text-xs underline" style={{ color: COLORS.textMuted }}>
                  Quitar filtros
                </button>
              )}
            </div>
            {loadingActivity && <p className="text-sm" style={{ color: COLORS.textMuted }}>Cargando…</p>}
            {!loadingActivity && groups.length === 0 && <p className="text-sm" style={{ color: COLORS.textMuted }}>No hay sesiones para mostrar con estos filtros.</p>}
            <div className="space-y-4 max-h-[32rem] overflow-y-auto">
              {groups.map((g) => (
                <div key={g.key}>
                  <div className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: COLORS.track }}>
                    {DAYS[(g.date.getDay() + 6) % 7]} {String(g.date.getDate()).padStart(2, "0")}/{String(g.date.getMonth() + 1).padStart(2, "0")}
                  </div>
                  <div className="space-y-1.5">
                    {g.rows.map((r, i) => (
                      <div key={i} className="rounded-lg p-2.5 text-sm" style={{ background: COLORS.surface2 }}>
                        <div className="flex items-center justify-between flex-wrap gap-1">
                          <span className="font-semibold" style={{ color: COLORS.textPrimary }}>{r.studentName}</span>
                          <span style={{ color: COLORS.textMuted }}>{r.type}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs mt-1 flex-wrap" style={{ color: COLORS.textMuted }}>
                          <span>{r.actualKm} km{r.actualKm !== r.plannedKm ? ` (plan: ${r.plannedKm} km)` : ""}</span>
                          {r.rpe != null && <span>RPE {r.rpe}</span>}
                        </div>
                        {r.note && <p className="text-xs mt-1 italic" style={{ color: COLORS.textMuted }}>"{r.note}"</p>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {showPaceAlerts && (
        <div className="rounded-xl p-4 mb-6" style={{ background: COLORS.surface, border: `1px solid ${COLORS.moderate}` }}>
          <div className="text-sm font-semibold mb-3" style={{ color: COLORS.textPrimary, fontFamily: "'Oswald', sans-serif" }}>AJUSTES DE RITMO SUGERIDOS</div>
          <p className="text-xs mb-4" style={{ color: COLORS.textMuted }}>
            Se generan cuando un alumno falla el ritmo objetivo (10-15+ seg/km más lento) en martes y/o jueves. Revisa la nota del alumno antes de decidir.
          </p>
          <div className="space-y-2">
            {paceAlerts.filter((a) => a.status === "pending").length === 0 && (
              <p className="text-sm" style={{ color: COLORS.textMuted }}>No hay ajustes pendientes.</p>
            )}
            {paceAlerts.filter((a) => a.status === "pending").slice().reverse().map((a) => (
              <div key={a.id} className="rounded-lg p-3" style={{ background: COLORS.surface2, border: `1px solid ${COLORS.border}` }}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="text-sm font-semibold" style={{ color: COLORS.textPrimary }}>{a.studentName} · Semana {a.weekNumber}</div>
                  <Pill color={COLORS.moderate}>
                    {a.trigger === "general" ? "Ajuste general (martes y jueves)" : a.trigger === "q1" ? "Solo martes" : "Solo jueves"}
                  </Pill>
                </div>
                <div className="text-xs mt-2 space-y-1" style={{ color: COLORS.textMuted }}>
                  {a.q1TargetPace != null && (
                    <div>Martes: objetivo {formatPace(a.q1TargetPace)}/km, real {a.q1ActualPace || "—"}/km{a.q1Note ? ` · Nota: "${a.q1Note}"` : ""}</div>
                  )}
                  {a.q2TargetPace != null && (
                    <div>Jueves: objetivo {formatPace(a.q2TargetPace)}/km, real {a.q2ActualPace || "—"}/km{a.q2Note ? ` · Nota: "${a.q2Note}"` : ""}</div>
                  )}
                </div>
                <div className="flex gap-2 mt-3">
                  <button onClick={() => resolvePaceAlert(a, true)} disabled={busy}
                    className="px-3 py-1.5 rounded text-xs font-semibold" style={{ background: COLORS.track, color: COLORS.lane }}>
                    Aplicar ajuste
                  </button>
                  <button onClick={() => resolvePaceAlert(a, false)} disabled={busy}
                    className="px-3 py-1.5 rounded text-xs" style={{ color: COLORS.textMuted }}>
                    Descartar (fue algo puntual)
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showReports ? (
        <div className="rounded-xl p-4" style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}>
          <div className="text-sm font-semibold mb-3" style={{ color: COLORS.textPrimary, fontFamily: "'Oswald', sans-serif" }}>REPORTES SEMANALES</div>
          <p className="text-xs mb-4" style={{ color: COLORS.textMuted }}>Se genera un reporte cada vez que se cierra una semana. No llega por correo ni notificación push.</p>
          <div className="space-y-2">
            {reports.length === 0 && <p className="text-sm" style={{ color: COLORS.textMuted }}>Aún no hay reportes semanales.</p>}
            {reports.slice().sort((a, b) => new Date(b.closedAt) - new Date(a.closedAt)).map((r) => (
              <div key={r.id} className="rounded-lg p-3" style={{ background: COLORS.surface2, border: `1px solid ${COLORS.border}` }}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="text-sm font-semibold" style={{ color: COLORS.textPrimary }}>{r.studentName} · Semana {r.weekNumber}</div>
                  <AdherenceBadge pct={r.adherencePct} />
                </div>
                <div className="text-xs mt-1" style={{ color: COLORS.textMuted }}>{PHASE_LABEL[r.phase] || r.phase} · {r.weeklyKm} km{r.avgRpe ? ` · RPE prom. ${r.avgRpe.toFixed(1)}` : ""}</div>
                <div className="text-xs mt-2" style={{ color: COLORS.textMuted }}>{r.note}</div>
                <div className="text-[10px] mt-2" style={{ color: COLORS.textMuted }}>{new Date(r.closedAt).toLocaleString("es-PE")}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
      <div className="space-y-6">
        <div>
          <button onClick={() => setShowAdd((v) => !v)}
            className="w-full mb-3 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold"
            style={{ background: COLORS.track, color: COLORS.lane }}>
            <Plus size={16} /> Añadir alumno
          </button>
          {showAdd && <AddStudentForm onCancel={() => setShowAdd(false)} onCreate={createStudent} />}
          {pendingCreate && (
            <div className="rounded-xl p-4 mb-4" style={{ background: COLORS.moderate + "18", border: `1px solid ${COLORS.moderate}` }}>
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle size={16} style={{ color: COLORS.moderate }} />
                <span className="text-sm font-semibold" style={{ color: COLORS.textPrimary }}>El plan inicial tiene algo que revisar</span>
              </div>
              <ul className="text-xs mb-3 space-y-1 list-disc pl-4" style={{ color: COLORS.textMuted }}>
                {pendingCreate.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
              <div className="flex gap-2">
                <button onClick={() => createStudent({ ...pendingCreate.args, forceCreate: true })} disabled={busy}
                  className="px-3 py-1.5 rounded text-xs font-semibold" style={{ background: COLORS.moderate, color: COLORS.bg }}>
                  Crear de todas formas
                </button>
                <button onClick={() => setPendingCreate(null)} className="px-3 py-1.5 rounded text-xs" style={{ color: COLORS.textMuted }}>
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {roster.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              <button onClick={loadRosterProgress} title="Actualizar progreso semanal de todos los alumnos"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
                style={{ background: COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                <RefreshCcw size={12} /> Actualizar progreso
              </button>
              <button onClick={() => setStatusFilter(statusFilter === "waiting" ? null : "waiting")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
                style={{
                  background: (statusFilter === "waiting" || waitingCount > 0) ? COLORS.track : COLORS.surface2,
                  color: COLORS.lane,
                  border: `1px solid ${COLORS.track}${waitingCount > 0 ? "" : "55"}`,
                  boxShadow: waitingCount > 0 ? `0 0 0 3px ${COLORS.track}22` : "none",
                }}>
                <Clock size={12} /> {waitingCount} esperando aprobación
              </button>
              <button onClick={() => setStatusFilter(statusFilter === "low" ? null : "low")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
                style={{ background: statusFilter === "low" ? COLORS.track : COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.track}55` }}>
                <TrendingDown size={12} /> {lowAdherenceCount} con adherencia baja
              </button>
              <button onClick={() => setStatusFilter(statusFilter === "paused" ? null : "paused")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
                style={{ background: statusFilter === "paused" ? COLORS.track : COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.track}55` }}>
                ⏸ {pausedCount} pausados
              </button>
              <select value={goalFilter} onChange={(e) => setGoalFilter(e.target.value)}
                className="px-3 py-1.5 rounded-full text-xs font-semibold" style={{ background: goalFilter ? COLORS.track : COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.track}55` }}>
                <option value="">Todos los objetivos</option>
                {GOALS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
              </select>
              {(statusFilter || goalFilter) && (
                <button onClick={() => { setStatusFilter(null); setGoalFilter(""); }} className="text-xs underline" style={{ color: COLORS.textMuted }}>
                  Quitar filtro
                </button>
              )}
            </div>
          )}

          <div className="relative mb-3">
            <Search size={16} style={{ position: "absolute", left: 12, top: 12, color: COLORS.textMuted }} />
            <input type="text" placeholder="Busca un alumno por nombre" value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 rounded-lg text-sm" style={{ background: COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
          </div>

          <div className="space-y-2">
            {roster.length === 0 && <p className="text-sm px-1" style={{ color: COLORS.textMuted }}>Aún no tienes alumnos registrados.</p>}
            {roster.length > 0 && filteredRoster.length === 0 && <p className="text-sm px-1" style={{ color: COLORS.textMuted }}>Sin resultados para "{search}".</p>}
            {filteredRoster.map((r) => (
              <button key={r.id} onClick={() => setSelectedId(selectedId === r.id ? null : r.id)}
                className="w-full text-left rounded-lg p-3 flex items-center justify-between transition-colors"
                style={{
                  background: r.waitingApproval ? COLORS.track + "1A" : (selectedId === r.id ? COLORS.surface2 : COLORS.surface),
                  border: `${r.waitingApproval ? 2 : 1}px solid ${r.waitingApproval ? COLORS.track : (selectedId === r.id ? COLORS.track : COLORS.border)}`,
                  boxShadow: r.waitingApproval ? `0 0 0 3px ${COLORS.track}22` : "none",
                }}>
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate flex items-center gap-2" style={{ color: COLORS.textPrimary }}>
                    {r.name}
                  </div>
                  {r.waitingApproval && (
                    <div className="flex items-center gap-1.5 mt-1 px-2 py-0.5 rounded-full w-fit" style={{ background: COLORS.track }}>
                      <Check size={11} style={{ color: COLORS.lane }} />
                      <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: COLORS.lane }}>
                        Semana enviada · cerrar y generar la siguiente
                      </span>
                    </div>
                  )}
                  <div className="text-xs mt-0.5" style={{ color: COLORS.textMuted }}>
                    {GOAL_LABEL[r.goal]} · {LEVEL_LABEL[r.level]} · Semana {r.weekNumber}
                    {r.raceDate ? ` · faltan ${weeksBetween(r.raceDate)} sem.` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  {rosterProgress[r.id] && rosterProgress[r.id].total > 0 && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: COLORS.bg, color: COLORS.textMuted, border: `1px solid ${COLORS.border}` }}>
                      {rosterProgress[r.id].completed} de {rosterProgress[r.id].total}
                    </span>
                  )}
                  <AdherenceBadge pct={r.lastAdherence} />
                  {selectedId === r.id ? <ChevronDown size={14} style={{ color: COLORS.track }} /> : <ChevronRight size={14} style={{ color: COLORS.textMuted }} />}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div>
          {!student && !selectedId && (
            <div className="rounded-xl p-10 text-center" style={{ background: COLORS.surface, border: `1px dashed ${COLORS.border}` }}>
              <Activity size={28} style={{ color: COLORS.textMuted, margin: "0 auto" }} />
              <p className="mt-3 text-sm" style={{ color: COLORS.textMuted }}>Busca y selecciona un alumno para ver y ajustar su plan semanal.</p>
            </div>
          )}
          {!student && selectedId && studentLoading && (
            <div className="rounded-xl p-10 text-center" style={{ background: COLORS.surface, border: `1px dashed ${COLORS.border}` }}>
              <p className="text-sm" style={{ color: COLORS.textMuted }}>Cargando…</p>
            </div>
          )}
          {!student && selectedId && !studentLoading && (
            <div className="rounded-xl p-6 text-center" style={{ background: COLORS.surface, border: `1px dashed ${COLORS.track}` }}>
              <AlertCircle size={24} style={{ color: COLORS.track, margin: "0 auto" }} />
              <p className="mt-3 text-sm" style={{ color: COLORS.textPrimary }}>No se encontró el registro de este alumno.</p>
              <p className="mt-1 text-xs" style={{ color: COLORS.textMuted }}>Aparece en la lista pero su información ya no existe (registro huérfano). Puedes quitarlo de la lista y volver a crearlo.</p>
              <button onClick={async () => {
                setBusy(true);
                const freshRoster = (await safeGet("roster")) || roster;
                await safeSet("roster", freshRoster.filter((r) => r.id !== selectedId));
                setSelectedId(null);
                refreshRoster();
                setBusy(false);
              }} disabled={busy} className="mt-3 px-4 py-1.5 rounded text-sm font-semibold" style={{ background: COLORS.track, color: COLORS.lane }}>
                Quitar de la lista
              </button>
            </div>
          )}

          {student && week && (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <div className="text-2xl font-semibold" style={{ fontFamily: "'Oswald', sans-serif", color: COLORS.textPrimary }}>{student.name}</div>
                  <div className="flex items-center gap-1 mt-1 mb-1">
                    <button onClick={() => setViewedWeek(Math.max(1, activeWeekNum - 1))} disabled={activeWeekNum <= 1}
                      className="p-1 rounded disabled:opacity-30" style={{ color: COLORS.textMuted }}>
                      <ChevronLeft size={16} />
                    </button>
                    <span className="text-xs" style={{ color: COLORS.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>
                      {getWeekDateRange(student, activeWeekNum)}
                    </span>
                    <button onClick={() => setViewedWeek(Math.min(student.currentWeek, activeWeekNum + 1))} disabled={activeWeekNum >= student.currentWeek}
                      className="p-1 rounded disabled:opacity-30" style={{ color: COLORS.textMuted }}>
                      <ChevronRight size={16} />
                    </button>
                    {!isViewingLive && (
                      <button onClick={() => setViewedWeek(null)} className="text-xs underline ml-1" style={{ color: COLORS.track }}>volver a la semana actual</button>
                    )}
                    {!isViewingLive && getWeekDates(student, activeWeekNum).sunday >= new Date() && (
                      <button onClick={reopenWeek} disabled={busy}
                        className="flex items-center gap-1 text-xs px-2 py-1 rounded font-semibold ml-2"
                        style={{ background: COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.track}` }}>
                        <RotateCw size={12} /> Reabrir esta semana
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <Pill color={COLORS.track}>{getWeekTitle(student, activeWeekNum)}{week.weeklyKm != null ? ` · ${week.weeklyKm} km` : ""}{!isViewingLive ? " (solo lectura)" : ""}</Pill>
                    <Pill color={COLORS.moderate}>{PHASE_LABEL[week.phase]}{student.raceDate ? ` · faltan ${getDisplayWeekLabel(student, activeWeekNum)} sem.` : ""}</Pill>
                    {isViewingLive && week.submitted && <Pill color={COLORS.track}>Esperando tu aprobación</Pill>}
                    {isViewingLive && week.paused && <Pill color={COLORS.moderate}>⏸ Semana pausada</Pill>}
                    {!student.weeks[activeWeekNum]?.submitted && activeWeekNum >= student.currentWeek && <Pill color={COLORS.lane}>📅 Preparada por adelantado</Pill>}
                  </div>
                  {showObjetivoInfo && (
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <Pill color={COLORS.lane}>{GOAL_LABEL[student.goal]}</Pill>
                      <Pill color={COLORS.lane}>{LEVEL_LABEL[student.level]}</Pill>
                      {student.targetPaceStr && <Pill color={COLORS.lane}>Objetivo: {student.targetPaceStr}/km</Pill>}
                      <button onClick={() => setShowChangeGoal((v) => !v)}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                        style={{ background: showChangeGoal ? COLORS.track : COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.track}55` }}>
                        <Edit3 size={11} /> Cambiar objetivo
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {!proposal && isViewingLive && (
                    <button onClick={openProposal} disabled={busy}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
                      style={{ background: COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.track}` }}>
                      <RotateCw size={14} /> Cerrar semana y generar siguiente
                    </button>
                  )}
                  <button onClick={() => setShowPanorama((v) => !v)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold"
                    style={{ background: showPanorama ? COLORS.track : COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                    <BarChart2 size={14} /> Panorama
                  </button>
                  <button onClick={() => setShowRitmos((v) => !v)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold"
                    style={{ background: showRitmos ? COLORS.track : COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                    <Activity size={14} /> Ritmos
                  </button>
                  <button onClick={() => setShowKmSummary((v) => !v)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold"
                    style={{ background: showKmSummary ? COLORS.track : COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                    <BarChart2 size={14} /> Kilometraje
                  </button>
                  <button onClick={() => setShowObjetivoInfo((v) => !v)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold"
                    style={{ background: showObjetivoInfo ? COLORS.track : COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                    <Flag size={14} /> Objetivo
                  </button>
                  <button onClick={() => setShowEditUser((v) => !v)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold"
                    style={{ background: showEditUser ? COLORS.track : COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                    <Edit3 size={14} /> Editar usuario
                  </button>
                  <button onClick={() => setShowOtros((v) => !v)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold"
                    style={{ background: showOtros ? COLORS.track : COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                    <RotateCw size={14} /> Otros
                  </button>
                </div>
              </div>

              {showEditUser && (
                <div className="rounded-lg p-3 mb-4 flex flex-wrap gap-2" style={{ background: COLORS.surface2, border: `1px solid ${COLORS.border}` }}>
                  <button onClick={() => setShowNameChange((v) => !v)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold"
                    style={{ background: showNameChange ? COLORS.track : COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                    <Edit3 size={14} /> Cambiar nombre
                  </button>
                  <button onClick={() => setShowPinChange((v) => !v)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold"
                    style={{ background: showPinChange ? COLORS.track : COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                    <KeyRound size={14} /> Cambiar PIN
                  </button>
                  {!deleteConfirm ? (
                    <button onClick={() => setDeleteConfirm(true)}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold"
                      style={{ background: COLORS.bg, color: COLORS.track, border: `1px solid ${COLORS.track}` }}>
                      <Trash2 size={14} /> Eliminar alumno
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-xs" style={{ color: COLORS.textMuted }}>¿Eliminar a {student.name}?</span>
                      <button onClick={deleteStudent} disabled={busy} className="px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: COLORS.track, color: COLORS.lane }}>Confirmar</button>
                      <button onClick={() => setDeleteConfirm(false)} className="px-3 py-2 rounded-lg text-xs" style={{ color: COLORS.textMuted }}>Cancelar</button>
                    </div>
                  )}
                </div>
              )}

              {showOtros && (
                <div className="rounded-lg p-3 mb-4 flex flex-wrap gap-2" style={{ background: COLORS.surface2, border: `1px solid ${COLORS.border}` }}>
                  {isViewingLive && (
                    <button onClick={refreshTitles} disabled={busy}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold"
                      style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                      <RefreshCcw size={14} /> Actualizar títulos
                    </button>
                  )}
                  {isViewingLive && !isFitnessGoal(student.goal) && student.level !== "principiante" && (
                    <button onClick={() => setShowIntermediateRace((v) => !v)} disabled={busy}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold"
                      style={{ background: showIntermediateRace ? COLORS.track : COLORS.bg, color: COLORS.lane, border: `1px solid ${showIntermediateRace ? COLORS.track : COLORS.border}` }}>
                      <Flag size={14} /> Carrera intermedia
                    </button>
                  )}
                  {isViewingLive && student.level !== "principiante" && (
                    <button onClick={togglePauseWeek} disabled={busy}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold"
                      style={{ background: week.paused ? COLORS.moderate : COLORS.bg, color: week.paused ? COLORS.bg : COLORS.lane, border: `1px solid ${week.paused ? COLORS.moderate : COLORS.border}` }}>
                      <Clock size={14} /> {week.paused ? "Reanudar semana" : "Pausar semana (lesión/viaje)"}
                    </button>
                  )}
                  {!resetConfirm ? (
                    <button onClick={() => setResetConfirm(true)}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold"
                      style={{ background: COLORS.bg, color: COLORS.track, border: `1px solid ${COLORS.track}` }}>
                      <RefreshCcw size={14} /> Reiniciar plan
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-xs" style={{ color: COLORS.textMuted }}>¿Borrar todo el progreso?</span>
                      <button onClick={resetPlan} disabled={busy} className="px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: COLORS.track, color: COLORS.lane }}>Confirmar</button>
                      <button onClick={() => setResetConfirm(false)} className="px-3 py-2 rounded-lg text-xs" style={{ color: COLORS.textMuted }}>Cancelar</button>
                    </div>
                  )}
                </div>
              )}

              {showNameChange && (
                <div className="rounded-lg p-3 mb-4 flex flex-wrap items-center gap-2" style={{ background: COLORS.surface2, border: `1px solid ${COLORS.border}` }}>
                  <input type="text" placeholder={`Nombre actual: ${student.name}`} value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="rounded px-3 py-1.5 text-sm" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
                  <button onClick={changeName} disabled={busy} className="px-3 py-1.5 rounded text-sm font-semibold" style={{ background: COLORS.track, color: COLORS.lane }}>Guardar nombre</button>
                  {nameMsg && <span className="text-xs" style={{ color: COLORS.textMuted }}>{nameMsg}</span>}
                </div>
              )}

              {showPinChange && (
                <div className="rounded-lg p-3 mb-4 flex flex-wrap items-center gap-2" style={{ background: COLORS.surface2, border: `1px solid ${COLORS.border}` }}>
                  <input type="text" inputMode="numeric" maxLength={4} placeholder="Nuevo PIN (4 dígitos)" value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
                    onKeyDown={(e) => e.key === "Enter" && changePin()}
                    className="rounded px-3 py-1.5 text-sm" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
                  <button onClick={changePin} disabled={busy} className="px-3 py-1.5 rounded text-sm font-semibold" style={{ background: COLORS.track, color: COLORS.lane }}>Guardar PIN</button>
                  {pinMsg && <span className="text-xs" style={{ color: COLORS.textMuted }}>{pinMsg}</span>}
                </div>
              )}

              {showChangeGoal && (
                <ChangeGoalForm student={student} busy={busy} onCancel={() => setShowChangeGoal(false)} onSave={changeGoal} />
              )}

              {showIntermediateRace && (
                <div className="rounded-xl p-4 mb-4" style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}>
                  <div className="flex items-center gap-2 mb-1">
                    <Flag size={16} style={{ color: COLORS.track }} />
                    <div className="text-sm font-semibold" style={{ color: COLORS.textPrimary, fontFamily: "'Oswald', sans-serif" }}>CARRERA INTERMEDIA</div>
                  </div>
                  {student.intermediateRace ? (
                    <div>
                      <p className="text-xs mb-3" style={{ color: COLORS.textMuted }}>
                        Activa: <span style={{ color: COLORS.lane, fontWeight: 600 }}>{GOALS.find((g) => g.id === student.intermediateRace.goalId)?.label}</span> el {(() => { const d = new Date(student.intermediateRace.date + "T00:00:00"); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`; })()} — ajustando la semana {student.intermediateRace.raceWeekNum} y la {student.intermediateRace.recoveryWeekNum}.
                      </p>
                      <button onClick={removeIntermediateRace} disabled={busy}
                        className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: COLORS.bg, color: COLORS.track, border: `1px solid ${COLORS.track}` }}>
                        Volver al plan original (quitar carrera intermedia)
                      </button>
                    </div>
                  ) : (
                    <>
                  <p className="text-xs mb-3" style={{ color: COLORS.textMuted }}>
                    Se ajustan solo la semana de la carrera y la siguiente — el resto del plan sigue exactamente igual.
                  </p>
                  <div className="grid sm:grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="block text-[10px] uppercase tracking-wide mb-1" style={{ color: COLORS.textMuted }}>Distancia</label>
                      <select value={interRaceGoal} onChange={(e) => setInterRaceGoal(e.target.value)}
                        className="w-full rounded px-3 py-2 text-sm" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                        {GOALS.filter((g) => !isFitnessGoal(g.id)).map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-wide mb-1" style={{ color: COLORS.textMuted }}>Fecha de la carrera</label>
                      <input type="date" value={interRaceDate} onChange={(e) => setInterRaceDate(e.target.value)}
                        className="w-full rounded px-3 py-2 text-sm" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
                    </div>
                  </div>
                  {interRaceDate && (() => {
                    const preview = computeIntermediateRaceOverrides(student, interRaceGoal, interRaceDate);
                    return (
                      <div className="space-y-2 mb-3">
                        <div className="text-[10px] uppercase tracking-wide" style={{ color: COLORS.textMuted }}>Se va a ajustar</div>
                        <div className="rounded-lg px-3 py-2 flex items-center justify-between" style={{ background: COLORS.bg, borderLeft: `3px solid ${COLORS.track}` }}>
                          <span className="text-xs" style={{ color: COLORS.lane }}>Semana {preview.raceWeekNum} · puesta a punto — {GOALS.find((g) => g.id === interRaceGoal)?.label} el domingo</span>
                          <span className="text-xs font-bold" style={{ color: COLORS.track }}>{preview.taperVolume} km</span>
                        </div>
                        <div className="rounded-lg px-3 py-2 flex items-center justify-between" style={{ background: COLORS.bg, borderLeft: `3px solid ${COLORS.moderate}` }}>
                          <span className="text-xs" style={{ color: COLORS.lane }}>Semana {preview.recoveryWeekNum} · recuperación — umbral corto (25')</span>
                          <span className="text-xs font-bold" style={{ color: COLORS.moderate }}>{preview.recoveryVolume} km</span>
                        </div>
                        <div className="text-xs" style={{ color: COLORS.textMuted }}>Semana {preview.recoveryWeekNum + 1} en adelante: sin ningún cambio.</div>
                      </div>
                    );
                  })()}
                  <div className="flex gap-2">
                    <button onClick={applyIntermediateRace} disabled={busy || !interRaceDate}
                      className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: COLORS.track, color: COLORS.lane, opacity: !interRaceDate ? 0.5 : 1 }}>
                      Aplicar carrera intermedia
                    </button>
                    <button onClick={() => setShowIntermediateRace(false)} className="px-3 py-2 rounded-lg text-sm" style={{ color: COLORS.textMuted }}>
                      Cancelar
                    </button>
                  </div>
                  </>
                  )}
                </div>
              )}

              {showRitmos && (
                <div className="rounded-xl p-4 mb-4" style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}>
                  <div className="text-sm font-semibold mb-3" style={{ color: COLORS.textPrimary, fontFamily: "'Oswald', sans-serif" }}>RITMOS DE ENTRENAMIENTO</div>
                  <p className="text-xs mb-3" style={{ color: COLORS.textMuted }}>Referencia completa de los ritmos que se manejan con este alumno, según su ritmo maratón (VDOT).</p>
                  <RitmosPanel student={student} busy={busy} onSave={saveRitmos} />
                </div>
              )}

              {showKmSummary && (() => {
                const history = getStudentKmHistory(student);
                const grandTotal = r1(history.reduce((sum, r) => sum + r.km, 0));
                const rows = kmGroupBy === "week"
                  ? history.map((r) => ({ label: `Semana ${r.weekNum} (${getWeekDateRange(student, r.weekNum)})`, km: r.km }))
                  : aggregateKmHistory(history, kmGroupBy);
                return (
                  <div className="rounded-xl p-4 mb-4" style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}>
                    <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                      <div className="text-sm font-semibold" style={{ color: COLORS.textPrimary, fontFamily: "'Oswald', sans-serif" }}>KILOMETRAJE ACUMULADO</div>
                      <div className="flex gap-1">
                        {[["week", "Semanas"], ["month", "Meses"], ["year", "Años"]].map(([key, label]) => (
                          <button key={key} onClick={() => setKmGroupBy(key)}
                            className="px-3 py-1 rounded-lg text-xs font-semibold"
                            style={{ background: kmGroupBy === key ? COLORS.track : COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <p className="text-xs mb-3" style={{ color: COLORS.textMuted }}>
                      Kilometraje real registrado (lo efectivamente corrido, no lo planeado) desde que este alumno inició. Total acumulado: <b style={{ color: COLORS.textPrimary }}>{grandTotal} km</b>.
                    </p>
                    {rows.length === 0 && <p className="text-sm" style={{ color: COLORS.textMuted }}>Todavía no hay sesiones registradas.</p>}
                    <div className="space-y-1 max-h-80 overflow-y-auto">
                      {[...rows].reverse().map((r, i) => (
                        <div key={i} className="flex items-center justify-between text-sm px-2 py-1.5 rounded" style={{ background: COLORS.surface2 }}>
                          <span style={{ color: COLORS.textMuted }}>{r.label}</span>
                          <span className="font-mono font-semibold" style={{ color: COLORS.textPrimary }}>{r.km} km</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {showPanorama && (
                <div className="rounded-xl p-4 mb-4" style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}>
                  <div className="text-sm font-semibold mb-3" style={{ color: COLORS.textPrimary, fontFamily: "'Oswald', sans-serif" }}>PANORAMA: VOLUMEN Y ESTRUCTURA SEMANAL</div>
                  <p className="text-xs mb-3" style={{ color: COLORS.textMuted }}>Proyección hasta la carrera: 3 semanas de carga + 1 de asimilación, con afinamiento al final. Puedes editar el volumen de semanas futuras.</p>
                  <PanoramaPanel data={panoramaData} student={student} currentWeek={student.currentWeek} edits={panoramaEdits} longEdits={panoramaLongEdits} qualityEdits={qualityEdits}
                    onEdit={(wk, val) => setPanoramaEdits((e) => ({ ...e, [wk]: val }))}
                    onEditLong={(wk, val) => setPanoramaLongEdits((e) => ({ ...e, [wk]: val }))}
                    onEditQuality={handleEditQuality}
                    onSave={savePanorama} busy={busy} />
                </div>
              )}

              {anomalyWarnings && (
                <div className="rounded-xl p-4 mb-4" style={{ background: COLORS.moderate + "18", border: `1px solid ${COLORS.moderate}` }}>
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle size={16} style={{ color: COLORS.moderate }} />
                    <span className="text-sm font-semibold" style={{ color: COLORS.textPrimary }}>Esta semana tiene algo que revisar</span>
                  </div>
                  <ul className="text-xs mb-3 space-y-1 list-disc pl-4" style={{ color: COLORS.textMuted }}>
                    {anomalyWarnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                  <div className="flex gap-2">
                    <button onClick={() => confirmProposal(true)} disabled={busy} className="px-3 py-1.5 rounded text-xs font-semibold" style={{ background: COLORS.moderate, color: COLORS.bg }}>
                      Aplicar de todas formas
                    </button>
                    <button onClick={() => setAnomalyWarnings(null)} className="px-3 py-1.5 rounded text-xs" style={{ color: COLORS.textMuted }}>
                      Volver a revisar
                    </button>
                  </div>
                </div>
              )}
              {proposal && (
                <ProposalPanel proposal={proposal} values={proposalValues} setValues={setProposalValues}
                  onConfirm={confirmProposal} onCancel={() => setProposal(null)} busy={busy}
                  weekDateRange={getWeekDateRange(student, student.currentWeek + 1)} />
              )}

              {week.note && (
                <div className="rounded-lg p-3 mb-4 text-sm flex items-start gap-2" style={{ background: COLORS.surface2, border: `1px solid ${COLORS.border}`, color: COLORS.textMuted }}>
                  <Flag size={14} style={{ color: COLORS.track, marginTop: 2, flexShrink: 0 }} />
                  {week.note}
                </div>
              )}
              {justClosed && (
                <div className="rounded-lg p-3 mb-4 text-sm" style={{ background: COLORS.easy + "18", border: `1px solid ${COLORS.easy}55`, color: COLORS.easy }}>
                  Semana cerrada. Nuevo plan generado: {justClosed}
                </div>
              )}

              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
                {week.plan.map((d, i) => <LapCard key={i} day={d} index={i} mode={isViewingLive ? "edit" : "view"} log={week.log[i]} onChangeDay={updateDay} onSwapDay={isViewingLive ? swapDays : undefined} />)}
              </div>
              <div className="flex flex-wrap gap-2">
                {isViewingLive && (
                  <button onClick={persistEdits} disabled={busy} className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg font-semibold" style={{ background: savedFlash ? COLORS.easy : COLORS.track, color: COLORS.lane, transition: "background 0.2s ease" }}>
                    {savedFlash ? (<><Check size={14} /> Guardado</>) : "Guardar cambios de esta semana"}
                  </button>
                )}
                <button onClick={() => exportWeekToPDF(student, week, activeWeekNum)} className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg font-semibold" style={{ background: COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                  <Download size={14} /> Exportar a PDF
                </button>
                <div className="flex items-center gap-1.5">
                  <select value={reportWeekNum ?? activeWeekNum} onChange={(e) => setReportWeekNum(Number(e.target.value))}
                    className="text-sm px-2 py-2 rounded-lg" style={{ background: COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                    {Object.keys(student.weeks).map(Number).sort((a, b) => a - b).map((n) => (
                      <option key={n} value={n}>Semana {n}</option>
                    ))}
                  </select>
                  <button onClick={() => exportWeeklyReport(student, student.weeks[reportWeekNum ?? activeWeekNum], reportWeekNum ?? activeWeekNum)}
                    className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg font-semibold" style={{ background: COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                    <FileText size={14} /> Reporte semanal
                  </button>
                </div>
                <button onClick={() => exportFullPlanOverview(student)} className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg font-semibold" style={{ background: COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                  <BarChart2 size={14} /> Resumen del plan completo
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   STUDENT PORTAL
--------------------------------------------------------- */
function StudentPortal({ studentId, refreshRoster, onBack }) {
  const [student, setStudent] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [viewedWeek, setViewedWeek] = useState(null);

  useEffect(() => { safeGet(`student:${studentId}`).then(setStudent); }, [studentId]);

  // Refresco automático en segundo plano: si el coach hace un cambio (por ejemplo edita
  // una sesión o aprueba la siguiente semana), se refleja acá sin que el alumno tenga que
  // recargar la página. Solo se aplica si no hay cambios locales sin guardar, para no perderlos.
  useEffect(() => {
    const interval = setInterval(() => {
      if (!saved) return;
      safeGet(`student:${studentId}`).then((fresh) => { if (fresh) setStudent(fresh); });
    }, 20000);
    return () => clearInterval(interval);
  }, [studentId, saved]);

  useEffect(() => { setViewedWeek(null); }, [student?.currentWeek]);

  // Autoguardado: al marcar una sesión o escribir un dato, se guarda solo — sin botón aparte.
  // Se espera un momento antes de guardar para no mandar una petición por cada tecla mientras
  // el alumno escribe los km o una nota; al marcar una casilla el guardado es inmediato.
  const saveTimerRef = React.useRef(null);
  const pendingStudentRef = React.useRef(null);
  const persistNow = useCallback(async () => {
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    const toSave = pendingStudentRef.current;
    if (!toSave) return;
    pendingStudentRef.current = null;
    setSaving(true);
    await safeSet(`student:${toSave.id}`, toSave);
    setSaving(false);
    setSaved(true);
  }, []);
  const changeLog = (index, entry, immediate) => {
    setStudent((s) => {
      const wk = getActiveLogWeek(s);
      const week = s.weeks[wk];
      const log = week.log.map((l, i) => (i === index ? entry : l));
      const updated = { ...s, weeks: { ...s.weeks, [wk]: { ...week, log } } };
      pendingStudentRef.current = updated;
      return updated;
    });
    setSaved(false);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { persistNow(); }, immediate ? 0 : 900);
  };
  // Si el alumno cierra o cambia de pantalla con algo sin guardar, se intenta guardar antes.
  useEffect(() => () => { if (pendingStudentRef.current) persistNow(); }, [persistNow]);
  // Guarda de inmediato el resultado del "entrenamiento en vivo" — a diferencia del resto del
  // registro manual, aquí tiene más sentido que quede guardado al toque, sin un paso extra.
  const saveLiveTrainingResult = async (index, entry) => {
    if (!student) return;
    const wk = getActiveLogWeek(student);
    const week = student.weeks[wk];
    const log = week.log.map((l, i) => (i === index ? entry : l));
    const updated = { ...student, weeks: { ...student.weeks, [wk]: { ...week, log } } };
    setStudent(updated);
    setBusy(true);
    await safeSet(`student:${student.id}`, updated);
    setBusy(false);
    setSaved(true);
  };
  const submitWeek = async () => {
    if (!student) return;
    setBusy(true);
    // Si quedaba algo por guardar (el alumno escribió algo justo antes de enviar), se guarda
    // primero para que no se pierda.
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    pendingStudentRef.current = null;
    const wk = getActiveLogWeek(student);
    const week = student.weeks[wk];
    const { adherencePct, avgRpe } = computeAdherence(week.plan, week.log);
    const updated = { ...student, weeks: { ...student.weeks, [wk]: { ...week, submitted: true, studentSubmitted: true, adherencePct, avgRpe } } };
    await safeSet(`student:${student.id}`, updated);
    const roster = await safeGet("roster");
    if (roster) {
      const historicalAdherence = computeHistoricalAdherence(updated);
      const newRoster = roster.map((r) => (r.id === student.id ? { ...r, lastAdherence: historicalAdherence, waitingApproval: true } : r));
      await safeSet("roster", newRoster);
    }
    await pushReport({
      id: uid(), studentId: student.id, studentName: student.name, weekNumber: wk,
      weeklyKm: week.weeklyKm, phase: week.phase, adherencePct, avgRpe, note: "El alumno envió su semana para aprobación.",
      closedAt: new Date().toISOString(),
    });
    setStudent(updated);
    refreshRoster();
    setBusy(false);
  };
  const reopenWeek = async () => {
    if (!student) return;
    setBusy(true);
    const wk = getActiveLogWeek(student);
    const week = student.weeks[wk];
    const updated = { ...student, weeks: { ...student.weeks, [wk]: { ...week, submitted: false } } };
    await safeSet(`student:${student.id}`, updated);
    setStudent(updated);
    setBusy(false);
  };

  const furthestApprovedWeek = student ? Math.max(1, ...Object.keys(student.weeks).map(Number)) : null;
  const activeLogWeek = student ? getActiveLogWeek(student) : null;
  const activeWeekNum = student ? Math.min(Math.max(viewedWeek ?? activeLogWeek, activeLogWeek), furthestApprovedWeek) : null;
  const isViewingCurrent = !student || activeWeekNum === activeLogWeek;
  const week = student ? student.weeks[activeWeekNum] : null;
  const currentWeekData = student ? student.weeks[activeLogWeek] : null;
  const todayDowIndex = (new Date().getDay() + 6) % 7; // 0=Lunes ... 6=Domingo
  const [dismissedYesterdayReminder, setDismissedYesterdayReminder] = useState(false);
  const [liveTrainingDayIdx, setLiveTrainingDayIdx] = useState(null);
  const yesterdayIdx = todayDowIndex - 1; // -1 si hoy es lunes: no hay día anterior que preguntar
  const yesterdayDay = isViewingCurrent && currentWeekData && yesterdayIdx >= 0 ? currentWeekData.plan[yesterdayIdx] : null;
  const yesterdayLog = isViewingCurrent && currentWeekData && yesterdayIdx >= 0 ? currentWeekData.log[yesterdayIdx] : null;
  const needsYesterdayConfirm = !!(yesterdayDay?.paceKey && !yesterdayLog?.completed && !dismissedYesterdayReminder);
  const submitSlots = currentWeekData ? currentWeekData.plan.map((d, i) => ({ d, i })).filter((x) => !!x.d.paceKey) : [];
  const submitCompletedCount = currentWeekData ? submitSlots.filter((x) => currentWeekData.log[x.i]?.completed).length : 0;
  const submitTotalCount = submitSlots.length;
  // Ya no depende de la fecha: espera al coach solo cuando la última semana disponible ya
  // fue confirmada (enviada) y todavía no hay una siguiente preparada.
  const waitingForCoach = !!(currentWeekData?.submitted && activeLogWeek >= furthestApprovedWeek);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="p-2 rounded-lg" style={{ color: COLORS.textMuted }}><ArrowLeft size={18} /></button>
        <User size={20} style={{ color: COLORS.track }} />
        <h1 className="text-xl font-semibold tracking-wide flex-1" style={{ fontFamily: "'Oswald', sans-serif", color: COLORS.textPrimary }}>
          MI PLAN{student ? <span style={{ color: COLORS.track }}> · {student.name}</span> : null}
        </h1>
        <button onClick={async () => { await safeDeletePersonal("rememberedStudent"); onBack(); }} className="text-xs underline" style={{ color: COLORS.textMuted }}>
          No soy yo
        </button>
      </div>

      {!student && <p className="text-sm" style={{ color: COLORS.textMuted }}>Cargando…</p>}

      {needsYesterdayConfirm && (
        <div className="rounded-xl p-4 mb-4" style={{ background: COLORS.moderate + "18", border: `1px solid ${COLORS.moderate}55` }}>
          <p className="text-sm font-semibold mb-1" style={{ color: COLORS.textPrimary }}>
            ¿Completaste tu sesión de {DAYS[yesterdayIdx]}?
          </p>
          <p className="text-xs mb-3" style={{ color: COLORS.textMuted }}>
            Todavía no la marcaste como hecha — tu coach necesita saber si la entrenaste, para llevar un registro exacto.
          </p>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => { changeLog(yesterdayIdx, { ...yesterdayLog, completed: true, actualKm: yesterdayDay.km, actualPaceStr: yesterdayLog?.actualPaceStr || (getRepresentativePace(yesterdayDay) ? formatPace(getRepresentativePace(yesterdayDay)) : "") }); setDismissedYesterdayReminder(true); }}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: COLORS.track, color: COLORS.lane }}>
              Sí, tal cual estaba planeado
            </button>
            <button onClick={() => setDismissedYesterdayReminder(true)} className="px-3 py-1.5 rounded-lg text-xs" style={{ color: COLORS.textMuted, border: `1px solid ${COLORS.border}` }}>
              No, o fue distinto — la registro yo
            </button>
          </div>
        </div>
      )}

      {student && week && (
        <div>
          <div className="rounded-xl p-4 mb-4 flex items-center justify-between flex-wrap gap-3"
            style={{ background: COLORS.surface2, border: `1px solid ${COLORS.track}` }}>
            <div>
              <div className="flex items-center gap-2">
                {furthestApprovedWeek > activeLogWeek && (
                  <button onClick={() => setViewedWeek(Math.max(activeLogWeek, activeWeekNum - 1))} disabled={isViewingCurrent}
                    className="p-1 rounded disabled:opacity-30" style={{ color: COLORS.textMuted }}><ChevronLeft size={18} /></button>
                )}
                <div className="text-3xl font-bold" style={{ fontFamily: "'Oswald', sans-serif", color: COLORS.lane }}>{getWeekTitle(student, activeWeekNum)}</div>
                {furthestApprovedWeek > activeLogWeek && (
                  <button onClick={() => setViewedWeek(Math.min(furthestApprovedWeek, activeWeekNum + 1))} disabled={activeWeekNum >= furthestApprovedWeek}
                    className="p-1 rounded disabled:opacity-30" style={{ color: COLORS.textMuted }}><ChevronRight size={18} /></button>
                )}
                {!isViewingCurrent && <Pill color={COLORS.moderate}>Próxima semana (vista previa)</Pill>}
              </div>
              <div className="text-sm mt-1" style={{ color: COLORS.textMuted }}>
                {getWeekDateRange(student, activeWeekNum)}
                {student.raceDate ? ` · Faltan ${getDisplayWeekLabel(student, activeWeekNum)} semanas para tu carrera` : ` · ${PHASE_LABEL[week.phase]}`}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Pill color={COLORS.lane}>{GOAL_LABEL[student.goal]}</Pill>
              <Pill color={COLORS.track}>{week.weeklyKm != null ? `${week.weeklyKm} km` : PHASE_LABEL[week.phase]}</Pill>
              <Pill color={COLORS.moderate}>{PHASE_LABEL[week.phase]}</Pill>
              {week.paused && <Pill color={COLORS.moderate}>⏸ Pausada por tu coach</Pill>}
              <button onClick={() => exportWeekToPDF(student, week, activeWeekNum)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                style={{ background: COLORS.surface, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                <Download size={12} /> Descargar PDF
              </button>
            </div>
          </div>

          <div className="mb-4"><ProgressChart student={student} activeWeekNum={activeWeekNum} /></div>

          {week.note && (
            <div className="rounded-lg p-3 mb-4 text-sm flex items-start gap-2" style={{ background: COLORS.surface2, border: `1px solid ${COLORS.border}`, color: COLORS.textMuted }}>
              <Flag size={14} style={{ color: COLORS.track, marginTop: 2, flexShrink: 0 }} />
              {week.note}
            </div>
          )}

          {waitingForCoach && currentWeekData && (
            <div className="rounded-xl p-4 mb-4" style={{ background: COLORS.easy + "18", border: `1px solid ${COLORS.easy}55` }}>
              <div className="flex items-center gap-2 mb-2">
                <Check size={16} style={{ color: COLORS.easy }} />
                <span className="text-sm font-semibold" style={{ color: COLORS.textPrimary }}>¡Semana enviada!</span>
              </div>
              {(() => {
                const slots = currentWeekData.plan.map((d, i) => ({ d, i })).filter((x) => !!x.d.paceKey);
                const completed = slots.filter((x) => currentWeekData.log[x.i]?.completed);
                const kmDone = r1(completed.reduce((sum, x) => {
                  const l = currentWeekData.log[x.i];
                  const km = l.actualKm !== "" && l.actualKm != null && !isNaN(Number(l.actualKm)) ? Number(l.actualKm) : x.d.km;
                  return sum + (km || 0);
                }, 0));
                return (
                  <p className="text-sm" style={{ color: COLORS.textMuted }}>
                    Completaste <b style={{ color: COLORS.textPrimary }}>{completed.length} de {slots.length}</b> entrenamientos
                    y corriste <b style={{ color: COLORS.textPrimary }}>{kmDone} km</b> esta semana. Tu coach está preparando la siguiente — te avisará cuando esté lista.
                  </p>
                );
              })()}
              <button onClick={reopenWeek} disabled={busy} className="mt-2 underline text-xs" style={{ color: COLORS.textMuted }}>
                Reabrir mi semana para corregir algo
              </button>
            </div>
          )}

          {isViewingCurrent && !waitingForCoach && week.plan[todayDowIndex]?.paceKey && !week.log[todayDowIndex]?.completed && (
            <button onClick={() => setLiveTrainingDayIdx(todayDowIndex)}
              className="w-full rounded-xl p-4 mb-4 flex items-center gap-3 text-left animate-fadein"
              style={{ background: COLORS.track, border: `2px solid ${COLORS.track}`, boxShadow: `0 0 0 4px ${COLORS.track}33` }}>
              <div className="flex items-center justify-center rounded-full flex-shrink-0" style={{ width: 48, height: 48, background: "rgba(255,255,255,0.2)" }}>
                <Activity size={24} style={{ color: COLORS.lane }} />
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest mb-0.5" style={{ color: COLORS.lane, opacity: 0.85 }}>Hoy · te toca esto</div>
                <div className="text-base font-bold" style={{ color: COLORS.lane, fontFamily: "'Oswald', sans-serif" }}>Iniciar entrenamiento en vivo</div>
              </div>
            </button>
          )}

          <div className="grid sm:grid-cols-2 gap-3 mb-4">
            {week.plan.map((d, i) => <LapCard key={i} day={d} index={i} mode={!isViewingCurrent ? "view" : (waitingForCoach ? "view" : "log")} log={week.log[i]} onChangeLog={isViewingCurrent ? changeLog : undefined} isToday={isViewingCurrent && i === todayDowIndex} isRaceGoal={!isFitnessGoal(student.goal)} onStartLive={isViewingCurrent && !waitingForCoach ? (idx) => setLiveTrainingDayIdx(idx) : undefined} />)}
          </div>

          {liveTrainingDayIdx != null && week.plan[liveTrainingDayIdx] && (
            <LiveTrainingScreen
              day={week.plan[liveTrainingDayIdx]}
              easyPace={student.paces?.E}
              onClose={() => setLiveTrainingDayIdx(null)}
              onComplete={({ actualKm, actualPaceStr }) => {
                saveLiveTrainingResult(liveTrainingDayIdx, { ...week.log[liveTrainingDayIdx], completed: true, actualKm, actualPaceStr });
                setLiveTrainingDayIdx(null);
              }}
            />
          )}

          <button onClick={() => exportWeekToPDF(student, week, activeWeekNum)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold mb-4"
            style={{ background: COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
            <Download size={14} /> Descargar mi semana en PDF
          </button>

          {!waitingForCoach && (
            <>
              <div className="flex flex-wrap gap-2 items-center">
                <span className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs"
                  style={{ color: saving ? COLORS.textMuted : COLORS.easy }}>
                  {saving ? (<><RotateCw size={12} /> Guardando…</>) : (<><Check size={12} /> Se guarda solo</>)}
                </span>
                {!showSubmitConfirm && (
                  <button onClick={() => setShowSubmitConfirm(true)} disabled={busy}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
                    style={{ background: COLORS.track, color: COLORS.lane }}>
                    <RotateCw size={14} /> Enviar semana a mi coach
                  </button>
                )}
              </div>
              {showSubmitConfirm && (
                <div className="rounded-xl p-4 mt-3" style={{ background: COLORS.surface2, border: `1px solid ${COLORS.track}` }}>
                  <p className="text-sm font-semibold mb-1" style={{ color: COLORS.textPrimary }}>
                    Has cumplido {submitCompletedCount} de {submitTotalCount} entrenamientos.
                  </p>
                  <p className="text-xs mb-3" style={{ color: COLORS.textMuted }}>
                    {submitCompletedCount < submitTotalCount
                      ? "Todavía tienes sesiones sin marcar — revísalas antes de enviar, así tu coach ve exactamente lo que hiciste."
                      : "Completaste todas las sesiones de la semana."} ¿Seguro que quieres enviar esta semana a tu coach?
                  </p>
                  <div className="flex gap-2">
                    <button onClick={async () => { await submitWeek(); setShowSubmitConfirm(false); }} disabled={busy}
                      className="px-4 py-1.5 rounded-lg text-sm font-semibold" style={{ background: COLORS.track, color: COLORS.lane }}>
                      Sí, enviar
                    </button>
                    <button onClick={() => setShowSubmitConfirm(false)} className="px-3 py-1.5 rounded-lg text-sm" style={{ color: COLORS.textMuted }}>
                      Todavía no
                    </button>
                  </div>
                </div>
              )}
              <p className="text-xs mt-3 flex items-center gap-1" style={{ color: COLORS.textMuted }}>
                <AlertCircle size={12} /> Registra tus sesiones y luego envía la semana; tu coach revisará y preparará la siguiente.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   ROLE SELECT
--------------------------------------------------------- */
function RoleSelect({ onSelect }) {
  return (
    <div className="max-w-2xl mx-auto px-4 py-16">
      <div className="text-center mb-12">
        <div className="text-5xl font-bold tracking-widest" style={{ fontFamily: "'Oswald', sans-serif", color: COLORS.lane, letterSpacing: "0.06em" }}>TROTAMUNDOS</div>
        <div className="text-sm font-semibold tracking-[0.3em] uppercase mt-1" style={{ color: COLORS.track }}>el app · V.04</div>
        <div className="w-16 h-1 mx-auto mt-3 mb-4" style={{ background: COLORS.track }} />
        <p className="text-sm" style={{ color: COLORS.textMuted }}>Tú cumples el plan, tu coach lo diseña semana a semana.</p>
      </div>
      <button onClick={() => onSelect("student")} className="w-full rounded-xl p-6 text-left transition-transform hover:-translate-y-0.5"
        style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}>
        <User size={24} style={{ color: COLORS.track }} />
        <div className="mt-3 text-lg font-semibold" style={{ fontFamily: "'Oswald', sans-serif", color: COLORS.textPrimary }}>Soy alumno</div>
        <p className="text-sm mt-1" style={{ color: COLORS.textMuted }}>Consulta tu plan de la semana y registra tus sesiones.</p>
      </button>
      <div className="text-center mt-6">
        <button onClick={() => onSelect("coach")} className="text-xs underline" style={{ color: COLORS.textMuted }}>
          Acceso coach
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   APP ROOT
--------------------------------------------------------- */
export default function App() {
  const [view, setView] = useState("select");
  const [authedStudentId, setAuthedStudentId] = useState(null);
  const [roster, setRoster] = useState([]);
  const [loading, setLoading] = useState(true);

  // Antes de iniciar sesión solo se pide la lista mínima (nombres e id) para el buscador —
  // ya no se descarga el listado completo con datos de entrenamiento de todos los alumnos.
  const refreshRoster = useCallback(async () => {
    const r = await studentList();
    if (r && Array.isArray(r.students)) setRoster(r.students);
  }, []);
  useEffect(() => {
    (async () => {
      await refreshRoster();
      const remembered = await safeGetPersonal("rememberedStudent");
      if (remembered && remembered.id) {
        // solo entra directo si la sesión guardada en el servidor sigue siendo válida
        const record = await safeGet(`student:${remembered.id}`);
        if (record) { setAuthedStudentId(remembered.id); setView("student"); }
      }
      setLoading(false);
    })();
  }, [refreshRoster]);

  const goSelect = () => { setView("select"); setAuthedStudentId(null); };

  return (
    <div className="min-h-screen w-full" style={{ background: COLORS.bg }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap');
        * { font-family: 'Inter', sans-serif; }
        @keyframes fadein { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes screenFlashPulse { 0% { opacity: 0.85; } 100% { opacity: 0; } }
        .animate-fadein { animation: fadein 0.25s ease-out; }
        input:focus, select:focus, button:focus-visible { outline: 2px solid ${COLORS.track}; outline-offset: 1px; }
        @media (prefers-reduced-motion: reduce) { .animate-fadein { animation: none; } }
      `}</style>

      {loading ? (
        <div className="flex items-center justify-center h-64" style={{ color: COLORS.textMuted }}>Cargando…</div>
      ) : view === "select" ? (
        <RoleSelect onSelect={(role) => setView(role === "coach" ? "coach-auth" : "student-auth")} />
      ) : view === "coach-auth" ? (
        <CoachGate onSuccess={() => setView("coach")} onBack={goSelect} />
      ) : view === "coach" ? (
        <CoachDashboard roster={roster} refreshRoster={refreshRoster} onBack={goSelect} />
      ) : view === "student-auth" ? (
        <StudentGate roster={roster} onSuccess={(id) => { setAuthedStudentId(id); setView("student"); }} onBack={goSelect} />
      ) : (
        <StudentPortal studentId={authedStudentId} refreshRoster={refreshRoster} onBack={goSelect} />
      )}
    </div>
  );
}
