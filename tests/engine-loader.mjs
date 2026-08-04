// Extrae el "motor de planes" desde app/page.jsx para poder probarlo de forma aislada,
// sin necesidad de arrancar el navegador ni la interfaz.
//
// Por qué así: hoy la lógica de entrenamiento y las pantallas viven en el mismo archivo.
// Este extractor toma solo las funciones puras (cálculo de ritmos, volúmenes, planes) y
// las deja disponibles para las pruebas. Si en el futuro se separa el motor a su propio
// archivo (recomendación #6), este extractor se puede borrar y las pruebas seguirán igual.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAGE = path.join(__dirname, "..", "app", "page.jsx");

// Funciones y constantes del motor que las pruebas necesitan.
const WANTED = [
  "DAYS", "DISTANCE_KM", "GOALS", "GOAL_LABEL", "LEVEL_LABEL", "LEVELS", "PHASE_LABEL",
  "BEGINNER_STAGES", "FITNESS16_STAGES", "BEGINNER_TRAIN_DAYS", "FITNESS_GOAL_TRAIN_DAYS",
  "BEGINNER_WARMUP_MIN", "T_DURATIONS", "R_RECOVERY_MIN",
  "I_DIST_BY_PHASE", "R_DIST_BY_PHASE", "AVANZADO_QUALITY_TABLE", "ANOMALY_MAX_KM", "ANOMALY_MAX_LONG_KM",
  "r1", "rWhole", "isFitnessGoal", "getStageTable", "getRunWalkTrainDays",
  "computeVDOT", "computeTrainingPaces", "parsePaceToDecimal", "formatPace", "anchorPacesToGoal",
  "getTPaceForDuration", "getIPace", "getRPace", "getIRecoveryMin", "pickRepScheme",
  "getDefaultTitle", "getSessionDetail", "getRepresentativePace", "computeImpliedKm",
  "buildBeginnerPlan", "buildRacePlan", "buildInitialRacePlan", "balanceWeeklyVolume",
  "computeBaselineWeek", "getAnomalyWarnings", "buildLiveSegments", "suggestQualityPaces",
  "getCyclePosition", "getTaperWeeks", "weeksBetween", "emptyLog",
  "getForcedThresholdDuration", "getBrokenTVariant", "getBaseBrokenTIndex",
  "getVelocidadSeries", "getEspecificoIntervalos", "getPreUmbralIntervalos",
  "buildWeekProposal", "finalizeWeekPlan", "getWeekNumForDate", "computeIntermediateRaceOverrides",
  "getActiveLogWeek", "mondayOf", ];

function extractBlock(src, name) {
  // función declarada
  let re = new RegExp(`\\nfunction ${name}\\s*\\(`);
  let m = src.match(re);
  if (m) {
    const start = m.index + 1;
    let i = src.indexOf("{", start);
    let depth = 0;
    for (let j = i; j < src.length; j++) {
      if (src[j] === "{") depth++;
      else if (src[j] === "}") { depth--; if (depth === 0) return src.slice(start, j + 1); }
    }
  }
  // constante (objeto, array o expresión de una línea)
  re = new RegExp(`\\nconst ${name}\\s*=`);
  m = src.match(re);
  if (m) {
    const start = m.index + 1;
    const eq = src.indexOf("=", start);
    let j = eq + 1;
    while (j < src.length && /\s/.test(src[j])) j++;
    if (src[j] === "{" || src[j] === "[") {
      const open = src[j], close = open === "{" ? "}" : "]";
      let depth = 0;
      for (; j < src.length; j++) {
        if (src[j] === open) depth++;
        else if (src[j] === close) { depth--; if (depth === 0) return src.slice(start, j + 1) + ";"; }
      }
    } else {
      const nl = src.indexOf("\n", start);
      return src.slice(start, nl);
    }
  }
  return null;
}

export function loadEngine() {
  const src = fs.readFileSync(PAGE, "utf8");

  // El motor de planes y los componentes de pantalla están entremezclados en el archivo.
  // Se recorre declaración por declaración y se conservan solo las que NO contienen JSX
  // (es decir, la lógica pura de entrenamiento). Así no hay que mantener una lista a mano:
  // si mañana se agrega una función de cálculo nueva, las pruebas la recogen sola.
  const decls = [];
  const declRe = /\n(?:function|const|let)\s+([A-Za-z_$][\w$]*)/g;
  const positions = [];
  let m;
  while ((m = declRe.exec(src)) !== null) positions.push({ name: m[1], start: m.index + 1 });

  for (let i = 0; i < positions.length; i++) {
    const start = positions[i].start;
    const end = i + 1 < positions.length ? positions[i + 1].start : src.length;
    const block = src.slice(start, end);
    // Se descarta lo que tenga JSX (pantallas) o hooks de React.
    const hasJSX = /<[A-Za-z/][^>]*>/.test(block) || /\buseState\(|\buseEffect\(|\buseMemo\(|\buseCallback\(/.test(block);
    if (!hasJSX) decls.push({ name: positions[i].name, block });
  }

  const names = [];
  const parts = [];
  for (const d of decls) {
    if (names.includes(d.name)) continue;
    names.push(d.name);
    parts.push(d.block);
  }

  const code = parts.join("\n") + "\n\nreturn { " + names.join(", ") + " };";
  let engine;
  try {
    engine = new Function(code)();
  } catch (e) {
    throw new Error(`No se pudo cargar el motor de planes: ${e.message}`);
  }
  engine.__missing = WANTED.filter((n) => engine[n] === undefined);
  return engine;
}
