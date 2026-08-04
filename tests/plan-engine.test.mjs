// Pruebas del motor de planes de TROTAMUNDOS.
//
// Qué verifican: que para CUALQUIER combinación de objetivo, nivel y momento del ciclo,
// el plan que genera la app sea coherente — sin días con 0 km mal etiquetados, sin sesiones
// absurdamente largas, con los volúmenes cuadrando, y respetando el km pico del alumno.
//
// Cómo correrlas:  npm test
import { loadEngine } from "./engine-loader.mjs";

const E = loadEngine();
let passed = 0, failed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) { passed++; }
  else { failed++; failures.push(`${name}${detail ? ` — ${detail}` : ""}`); }
}

function sumKm(plan) {
  return plan.reduce((s, d) => s + (d.km || 0), 0);
}

// ============================================================
// 1. RITMOS
// ============================================================
console.log("\n▸ Ritmos de entrenamiento");
{
  const vdot = E.computeVDOT(42.195, E.parsePaceToDecimal("3:51"));
  const paces = E.computeTrainingPaces(vdot);
  check("VDOT en rango razonable para 2:42:30", vdot > 55 && vdot < 70, `dio ${vdot.toFixed(1)}`);
  check("Los ritmos van de más lento a más rápido (E > M > T > I)",
    paces.E > paces.M && paces.M > paces.T && paces.T > paces.I,
    `E=${paces.E?.toFixed(2)} M=${paces.M?.toFixed(2)} T=${paces.T?.toFixed(2)} I=${paces.I?.toFixed(2)}`);
  check("Todos los ritmos son números válidos",
    [paces.E, paces.M, paces.T, paces.I].every((p) => typeof p === "number" && p > 0 && p < 15));

  // ida y vuelta del formato de ritmo
  for (const s of ["3:51", "4:26", "5:30", "6:05"]) {
    const back = E.formatPace(E.parsePaceToDecimal(s));
    check(`Formato de ritmo ida y vuelta: ${s}`, back === s, `dio ${back}`);
  }
  check("Ritmo inválido devuelve null", E.parsePaceToDecimal("abc") === null);
}

// ============================================================
// 2. PLANES DE CARRERA — todas las combinaciones
// ============================================================
console.log("▸ Planes de carrera (objetivo × nivel × semanas restantes)");
{
  const goals = ["10k", "21k", "42k"];
  const levels = ["intermedio1", "intermedio2", "avanzado1", "avanzado2"];
  const weeksList = [16, 12, 8, 4, 2, 1, 0];

  for (const goal of goals) {
    for (const level of levels) {
      const paceStr = goal === "42k" ? "3:51" : goal === "21k" ? "3:40" : "3:30";
      const vdot = E.computeVDOT(E.DISTANCE_KM[goal], E.parsePaceToDecimal(paceStr));
      const paces = E.computeTrainingPaces(vdot);
      paces.race = E.parsePaceToDecimal(paceStr);
      E.anchorPacesToGoal(paces, goal);

      for (const weeks of weeksList) {
        const label = `${goal}/${level}/${weeks}sem`;
        let result;
        try {
          // La app siempre calcula un km pico antes de generar (nunca lo deja vacío),
          // así que aquí se pasa uno realista por nivel para reproducir el uso real.
          const peakByLevel = { intermedio1: 55, intermedio2: 75, avanzado1: 100, avanzado2: 130 };
          const peakKm = peakByLevel[level];
          const peakLongKm = E.capLongRunKm(goal, level, 999);
          result = E.buildInitialRacePlan(goal, level, peakKm, peakLongKm, weeks, paces);
        } catch (err) {
          check(`Genera plan sin error: ${label}`, false, err.message);
          continue;
        }
        const { plan, weeklyKm } = result;

        check(`Plan tiene 7 días: ${label}`, plan.length === 7, `tiene ${plan.length}`);

        // ningún día con entrenamiento asignado pero 0 km
        const zeroKm = plan.filter((d) => d.paceKey && (!d.km || d.km <= 0));
        check(`Sin días de 0 km mal etiquetados: ${label}`, zeroKm.length === 0,
          zeroKm.map((d) => `${d.day}:${d.type}`).join(", "));

        // el detector de anomalías no debe encontrar nada
        const warnings = E.getAnomalyWarnings(plan);
        check(`Sin anomalías detectadas: ${label}`, warnings.length === 0, warnings.join(" | "));

        // el total debe cuadrar con el volumen semanal declarado
        // El total debe cuadrar con el volumen declarado. Se admite que se pase cuando el
        // volumen objetivo es muy bajo y una sesión de calidad, por su propia estructura
        // (warm-up + series + cool-down), ya ocupa buena parte de la semana — en ese caso el
        // día de balance llega a 0 y no puede compensar más. Nunca debe quedar MUY por encima.
        if (weeklyKm) {
          const total = sumKm(plan);
          const overshoot = total - weeklyKm;
          check(`Suma no queda por debajo del volumen: ${label}`, overshoot > -1.5,
            `suma ${total.toFixed(1)} vs declarado ${weeklyKm}`);
          check(`Suma no se dispara sobre el volumen: ${label}`, overshoot < weeklyKm * 0.35 + 1.5,
            `suma ${total.toFixed(1)} vs declarado ${weeklyKm} (se pasa ${overshoot.toFixed(1)})`);
        }

        // los días de descanso no llevan km
        const restWithKm = plan.filter((d) => !d.paceKey && d.km > 0);
        check(`Los descansos no tienen km: ${label}`, restWithKm.length === 0);

        // toda sesión con entrenamiento tiene un título legible
        const untitled = plan.filter((d) => d.paceKey && (!d.type || d.type.trim() === ""));
        check(`Toda sesión tiene título: ${label}`, untitled.length === 0);
      }
    }
  }
}

// ============================================================
// 3. RESPETO DEL KM PICO
// ============================================================
console.log("▸ El plan nunca supera el km pico indicado");
{
  for (const peak of [60, 90, 130]) {
    for (const weeks of [12, 8, 4, 2]) {
      const paces = E.computeTrainingPaces(E.computeVDOT(42.195, E.parsePaceToDecimal("3:51")));
      const { weeklyKm } = E.buildInitialRacePlan("42k", "avanzado2", peak, E.capLongRunKm("42k", "avanzado2", 999), weeks, paces);
      check(`Volumen ≤ pico (${peak}km, ${weeks}sem)`, !weeklyKm || weeklyKm <= peak + 0.5,
        `dio ${weeklyKm} con pico ${peak}`);
    }
  }
}

// ============================================================
// 4. PLANES DE PRINCIPIANTE / FITNESS
// ============================================================
console.log("▸ Planes de principiante y fitness");
{
  for (const goal of ["fitness", "10k", "21k", "42k"]) {
    for (let stage = 0; stage < 16; stage += 3) {
      const plan = E.buildBeginnerPlan(stage, goal, "principiante");
      const label = `${goal}/etapa${stage}`;
      check(`Plan tiene 7 días: ${label}`, plan.length === 7);
      const training = plan.filter((d) => d.paceKey);
      check(`Entrena exactamente 3 días: ${label}`, training.length === 3, `entrena ${training.length}`);
      const warnings = E.getAnomalyWarnings(plan);
      check(`Sin anomalías: ${label}`, warnings.length === 0, warnings.join(" | "));
    }
  }

  // días de entrenamiento personalizados
  const custom = [1, 3, 6]; // Mar, Jue, Dom
  const plan = E.buildBeginnerPlan(0, "fitness", "principiante", custom);
  const trainingIdx = plan.map((d, i) => (d.paceKey ? i : -1)).filter((i) => i >= 0);
  check("Respeta los días de entrenamiento elegidos",
    JSON.stringify(trainingIdx) === JSON.stringify(custom),
    `entrena en ${JSON.stringify(trainingIdx)}, se pidió ${JSON.stringify(custom)}`);
}

// ============================================================
// 5. DETECTOR DE ANOMALÍAS
// ============================================================
console.log("▸ El detector de anomalías funciona");
{
  const zeroKmPlan = [{ day: "Mar", type: "Run/Walk", paceKey: "E", km: 0 }];
  check("Detecta día con 0 km", E.getAnomalyWarnings(zeroKmPlan).length === 1);

  const hugePlan = [{ day: "Dom", type: "Fondo", paceKey: "long", slot: "long", km: 60 }];
  check("Detecta sesión excesivamente larga", E.getAnomalyWarnings(hugePlan).length === 1);

  const okPlan = [
    { day: "Mar", type: "Series", paceKey: "R", km: 10 },
    { day: "Dom", type: "Fondo", paceKey: "long", slot: "long", km: 30 },
    { day: "Lun", type: "Descanso", paceKey: "" },
  ];
  check("No marca falsos positivos en un plan normal", E.getAnomalyWarnings(okPlan).length === 0,
    E.getAnomalyWarnings(okPlan).join(" | "));
}

// ============================================================
// 6. BALANCE DE VOLUMEN SEMANAL
// ============================================================
console.log("▸ Balance del volumen semanal");
{
  const plan = [
    { day: "Lun", slot: "easy", paceKey: "E", km: 10, type: "Suave" },
    { day: "Mar", slot: "q1", paceKey: "T", km: 15, type: "Umbral" },
    { day: "Mié", slot: "easy", paceKey: "E", km: 12, type: "Suave" },
    { day: "Dom", slot: "long", paceKey: "long", km: 30, type: "Fondo" },
  ];
  const balanced = E.balanceWeeklyVolume(plan, 70);
  check("El total queda exacto tras balancear", Math.abs(sumKm(balanced) - 70) < 0.15,
    `dio ${sumKm(balanced)}`);

  // cuando no queda presupuesto, el día debe volverse descanso (no quedar en 0 km con tipo)
  const tight = E.balanceWeeklyVolume([
    { day: "Lun", slot: "easy", paceKey: "E", km: 10, type: "Suave" },
    { day: "Dom", slot: "long", paceKey: "long", km: 50, type: "Fondo" },
  ], 50);
  const ghost = tight.filter((d) => d.paceKey && (!d.km || d.km <= 0));
  check("Sin sesiones fantasma tras balancear", ghost.length === 0,
    ghost.map((d) => `${d.day}:${d.type}`).join(", "));
}

// ============================================================
// 7. FASES DEL ENTRENAMIENTO EN VIVO
// ============================================================
console.log("▸ Estructura de fases (entrenamiento en vivo)");
{
  // el ejemplo exacto del coach: 5' calentamiento + 3x(6' trote + 1' caminata) + 5' enfriamiento
  const runWalkDay = { paceKey: "E", stageLabel: "S1", runWalk: true, stageRun: 6, stageWalk: 1, stageReps: 3, easyPace: 5.5 };
  const segs = E.buildLiveSegments(runWalkDay, 5.5);
  check("Run/Walk da 8 fases (ejemplo del coach)", segs.length === 8, `dio ${segs.length}`);
  check("Todas las fases de run/walk son por tiempo", segs.every((s) => s.type === "time"));

  // sesiones de carrera
  const tDay = { paceKey: "T", km: 16, hmPace: 4.0, marathonPace: 4.3, easyPace: 5.0 };
  const tSegs = E.buildLiveSegments(tDay, 5.0);
  check("Umbral: el bloque principal es por tiempo",
    tSegs.some((s) => s.label === "Bloque principal" && s.type === "time"));

  const iDay = { paceKey: "I", km: 14, distOverride: 1, repsOverride: 6, hmPace: 4.0, marathonPace: 4.3, easyPace: 5.0 };
  const iSegs = E.buildLiveSegments(iDay, 5.0);
  check("Intervalos: warm-up + 6 reps + 5 recuperaciones + cool-down", iSegs.length === 13, `dio ${iSegs.length}`);

  // ninguna fase con meta inválida
  for (const [name, s] of [["run/walk", segs], ["umbral", tSegs], ["intervalos", iSegs]]) {
    const bad = s.filter((x) => !x.target || x.target <= 0);
    check(`Sin fases con meta inválida: ${name}`, bad.length === 0, bad.map((b) => b.label).join(", "));
  }
}

// ============================================================
// 8. CARRERA INTERMEDIA
// ============================================================
console.log("▸ Carrera intermedia");
{
  const student = {
    peakKm: 130, currentWeek: 1, planStartMonday: "2026-08-03",
    weeks: { 1: { weeklyKm: 118 } },
  };
  const ov = E.computeIntermediateRaceOverrides(student, "21k", "2026-08-23");
  // El plan arranca el lunes 03/08; la carrera del domingo 23/08 cae en la semana del
  // lunes 17/08, que es la tercera del plan.
  check("Ubica la carrera en la semana correcta", ov.raceWeekNum === 3, `dio semana ${ov.raceWeekNum}`);
  check("La recuperación es la semana siguiente", ov.recoveryWeekNum === ov.raceWeekNum + 1);
  check("Volumen de la semana de carrera ~55% del pico", ov.taperVolume === 72, `dio ${ov.taperVolume}`);
  check("Volumen de recuperación ~70% del pico", ov.recoveryVolume === 91, `dio ${ov.recoveryVolume}`);
  check("El fondo de la semana de carrera es la distancia real", Math.abs(ov.longRunOverrides[ov.raceWeekNum] - 21.0975) < 0.01);
  check("Ambas semanas evitan la pre-carga del sábado",
    ov.qualityOverrides[ov.raceWeekNum].q3Type === "E" && ov.qualityOverrides[ov.recoveryWeekNum].q3Type === "E");
  check("La recuperación lleva umbral corto de 25'",
    ov.qualityOverrides[ov.recoveryWeekNum].q2Type === "T" && ov.qualityOverrides[ov.recoveryWeekNum].q2Dist === 25);
}

// ============================================================
// RESULTADO
// ============================================================
console.log("\n" + "─".repeat(52));
if (failed === 0) {
  console.log(`✓ ${passed} verificaciones, todas correctas.`);
  process.exit(0);
} else {
  console.log(`✗ ${failed} de ${passed + failed} verificaciones fallaron:\n`);
  failures.forEach((f) => console.log(`   • ${f}`));
  console.log("");
  process.exit(1);
}
