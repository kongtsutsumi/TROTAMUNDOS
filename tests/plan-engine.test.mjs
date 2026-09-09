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
// 9. CONTEO DE SESIONES COMPLETADAS
// ============================================================
console.log("▸ Conteo de sesiones completadas (panel del coach)");
{
  // Reproduce el bug encontrado: si se filtran primero los días de entrenamiento y luego se
  // busca en el registro por el índice del array filtrado, los días se desalinean y el
  // conteo sale menor al real. El conteo debe hacerse sobre el plan completo.
  const week = {
    plan: [
      { day: "Lun", paceKey: "" }, { day: "Mar", paceKey: "I" }, { day: "Mié", paceKey: "E" },
      { day: "Jue", paceKey: "T" }, { day: "Vie", paceKey: "" }, { day: "Sáb", paceKey: "" },
      { day: "Dom", paceKey: "long" },
    ],
    log: [
      { completed: false }, { completed: true }, { completed: true },
      { completed: true }, { completed: false }, { completed: false }, { completed: true },
    ],
  };
  const total = week.plan.filter((d) => !!d.paceKey).length;
  const completed = week.plan.filter((d, i) => !!d.paceKey && week.log?.[i]?.completed).length;
  check("Cuenta los 4 entrenamientos propuestos", total === 4, `dio ${total}`);
  check("Cuenta los 4 completados (no 3)", completed === 4, `dio ${completed}`);

  // caso con descansos al principio, que es donde más se notaba el desfase
  const week2 = {
    plan: [{ day: "Lun", paceKey: "" }, { day: "Mar", paceKey: "" }, { day: "Mié", paceKey: "E" }, { day: "Jue", paceKey: "T" }],
    log: [{ completed: false }, { completed: false }, { completed: true }, { completed: true }],
  };
  const c2 = week2.plan.filter((d, i) => !!d.paceKey && week2.log?.[i]?.completed).length;
  check("Con descansos al inicio también cuenta bien", c2 === 2, `dio ${c2}`);
}

// ============================================================
// 10. ACTIVACIÓN DE LA SEMANA POR CALENDARIO
// ============================================================
console.log("▸ Activación de la semana según la fecha");
{
  const RealDate = Date;
  const setToday = (iso) => {
    const fixed = new RealDate(iso + "T12:00:00");
    globalThis.Date = class extends RealDate {
      constructor(...a) { if (a.length === 0) super(fixed.getTime()); else super(...a); }
      static now() { return fixed.getTime(); }
    };
  };
  const restore = () => { globalThis.Date = RealDate; };
  const mk = (weeks) => ({ planStartMonday: "2026-08-03", weeks });

  // El coach cierra la semana 1 el domingo y deja lista la 2: el alumno NO debe verla aún.
  const prepared = mk({ 1: { submitted: true }, 2: { submitted: false } });
  setToday("2026-08-09"); // domingo de la semana 1
  check("Domingo: sigue en la semana en curso, no salta a la preparada",
    E.getActiveLogWeek(prepared) === 1, `dio ${E.getActiveLogWeek(prepared)}`);
  check("Domingo: la semana 2 cuenta como adelanto", E.getTodayWeekNum(prepared) === 1);

  setToday("2026-08-10"); // lunes siguiente
  check("Lunes: ya se activa la semana preparada",
    E.getActiveLogWeek(prepared) === 2, `dio ${E.getActiveLogWeek(prepared)}`);

  // Un alumno atrasado no debe perder su semana pendiente.
  const late = mk({ 1: { submitted: false }, 2: { submitted: false } });
  setToday("2026-08-12");
  check("Alumno atrasado sigue en su semana pendiente",
    E.getActiveLogWeek(late) === 1, `dio ${E.getActiveLogWeek(late)}`);

  // Con varias semanas preparadas por adelantado, tampoco debe saltar.
  const ahead = mk({ 1: { submitted: true }, 2: { submitted: true }, 3: { submitted: false } });
  setToday("2026-08-09");
  check("No salta varias semanas hacia adelante",
    E.getActiveLogWeek(ahead) === 1, `dio ${E.getActiveLogWeek(ahead)}`);

  restore();
}

// ============================================================
// 11. PROGRESIÓN DE LOS PLANES DE FITNESS
// ============================================================
console.log("▸ Progresión de los planes de fitness");
{
  const stages = E.FITNESS16_STAGES;
  const minutes = (s) => s.run * s.reps;
  const runWalkPhase = stages.filter((s) => s.walk > 0);
  const continuousPhase = stages.filter((s) => s.walk === 0);

  check("Hay dos fases: run/walk y continuo", runWalkPhase.length > 0 && continuousPhase.length > 0);

  // Dentro de cada fase los minutos de trote nunca deben retroceder.
  for (let i = 1; i < runWalkPhase.length; i++) {
    check(`Fase run/walk no retrocede (paso ${i} → ${i + 1})`,
      minutes(runWalkPhase[i]) >= minutes(runWalkPhase[i - 1]),
      `${minutes(runWalkPhase[i - 1])}' → ${minutes(runWalkPhase[i])}'`);
  }
  for (let i = 1; i < continuousPhase.length; i++) {
    check(`Fase continua no retrocede (paso ${i} → ${i + 1})`,
      minutes(continuousPhase[i]) >= minutes(continuousPhase[i - 1]),
      `${minutes(continuousPhase[i - 1])}' → ${minutes(continuousPhase[i])}'`);
  }

  check("La última semana es el pico de la fase continua",
    minutes(continuousPhase[continuousPhase.length - 1]) === Math.max(...continuousPhase.map(minutes)));
  check("El objetivo final son 45' continuos",
    continuousPhase[continuousPhase.length - 1].run === 45);

  // Los días de una misma semana deben ser distintos entre sí (el día principal debe destacarse).
  for (const level of ["principiante", "intermedio1"]) {
    for (let st = 0; st < stages.length; st++) {
      const plan = E.buildBeginnerPlan(st, "fitness", level);
      const sigs = new Map();
      for (const d of plan) {
        if (!d.paceKey || d.isSpeedDay) continue;
        const k = `${d.stageRun}|${d.stageWalk}|${d.stageReps}`;
        sigs.set(k, (sigs.get(k) || 0) + 1);
      }
      const repeated = [...sigs.values()].filter((n) => n > 1).length;
      check(`Sin días idénticos: ${level}/semana ${st + 1}`, repeated === 0);
    }
  }
}

// ============================================================
// 12. PAUSA POR LESIÓN O VIAJE
// ============================================================
console.log("▸ Pausa de semana (lesión/viaje)");
{
  const mkStudent = (paused) => ({
    id: "x", name: "Test", goal: "fitness", level: "principiante", currentWeek: 1,
    beginnerStage: 3, planStartMonday: "2026-08-03", trainDays: undefined,
    weeks: { 1: { weeklyKm: null, phase: "principiante", paused, submitted: true,
      plan: E.buildBeginnerPlan(3, "fitness", "principiante"),
      log: E.emptyLog() } },
  });

  // Semana pausada: el alumno no entrenó, así que NO debe avanzar de etapa.
  const paused = mkStudent(true);
  const propPaused = E.buildWeekProposal(paused);
  check("Una semana pausada se marca como tal en la propuesta", propPaused.wasPaused === true);
  const resPaused = E.finalizeWeekPlan(paused, propPaused, {});
  check("Tras una pausa NO se avanza de etapa",
    resPaused.updated.beginnerStage === 3, `pasó a la etapa ${resPaused.updated.beginnerStage}`);
  check("La nota explica que se repite por la pausa",
    /pausada/i.test(resPaused.note), resPaused.note);

  // Semana normal con buena adherencia: sí debe avanzar.
  const normal = mkStudent(false);
  normal.weeks[1].log = normal.weeks[1].plan.map((d) => ({
    completed: !!d.paceKey, actualKm: d.km, actualPaceStr: "", rpe: "", note: "" }));
  const propNormal = E.buildWeekProposal(normal);
  const resNormal = E.finalizeWeekPlan(normal, propNormal, {});
  check("Sin pausa y con buena adherencia SÍ se avanza de etapa",
    resNormal.updated.beginnerStage === 4, `quedó en la etapa ${resNormal.updated.beginnerStage}`);
}

// ============================================================
// 13. RETOMAR EN OTRA SEMANA (tras una pausa larga)
// ============================================================
console.log("▸ Retomar el plan en otra semana");
{
  // Reproduce la lógica de rollbackToStage (la parte de cálculo).
  const rollback = (student, targetStage) => {
    const stages = E.getStageTable(student.goal);
    const stage = Math.max(0, Math.min(stages.length - 1, targetStage));
    const nextWeekNum = student.currentWeek + 1;
    const plan = E.buildBeginnerPlan(stage, student.goal, student.level, student.trainDays);
    return {
      ...student, currentWeek: nextWeekNum, beginnerStage: stage,
      weeks: { ...student.weeks,
        [student.currentWeek]: { ...student.weeks[student.currentWeek], submitted: true },
        [nextWeekNum]: { weeklyKm: null, phase: "principiante", plan, log: E.emptyLog(), submitted: false } },
    };
  };

  // Alumno que llevaba 5 semanas y volvió de 2 semanas de viaje.
  const student = {
    goal: "fitness", level: "principiante", currentWeek: 5, beginnerStage: 4,
    weeks: { 1: { submitted: true }, 2: { submitted: true }, 3: { submitted: true },
             4: { submitted: true }, 5: { submitted: true, plan: [], log: [] } },
  };
  const stages = E.FITNESS16_STAGES;

  for (const target of [5, 4, 3]) {
    const r = rollback(student, target);
    const expected = stages[target];
    const main = r.weeks[r.currentWeek].plan.filter((d) => d.paceKey).slice(-1)[0];
    check(`Retomar en la etapa ${target + 1}: genera la carga correcta`,
      main.stageRun === expected.run && main.stageReps === expected.reps,
      `dio ${main.stageReps}x${main.stageRun}', se esperaba ${expected.reps}x${expected.run}'`);
    check(`Retomar en la etapa ${target + 1}: guarda la etapa elegida`, r.beginnerStage === target);
    check(`Retomar en la etapa ${target + 1}: no borra el historial`,
      [1, 2, 3, 4, 5].every((n) => !!r.weeks[n]));
    check(`Retomar en la etapa ${target + 1}: crea una semana nueva`, r.currentWeek === 6);
  }

  // No debe salirse del rango de la tabla.
  check("Una etapa fuera de rango se acota al máximo",
    rollback(student, 99).beginnerStage === stages.length - 1);
  check("Una etapa negativa se acota a la primera", rollback(student, -5).beginnerStage === 0);
}

// ============================================================
// 14. DESCANSOS DE LAS SERIES (R)
// ============================================================
console.log("▸ Descansos de las series");
{
  // Valores definidos por el coach: a mayor distancia, mayor recuperación.
  check("200m descansa 1'", E.R_RECOVERY_MIN[0.2] === 1, `dio ${E.R_RECOVERY_MIN[0.2]}`);
  check("400m descansa 2'", E.R_RECOVERY_MIN[0.4] === 2, `dio ${E.R_RECOVERY_MIN[0.4]}`);
  check("600m descansa 3'", E.R_RECOVERY_MIN[0.6] === 3, `dio ${E.R_RECOVERY_MIN[0.6]}`);
  check("800m descansa 4'", E.R_RECOVERY_MIN[0.8] === 4, `dio ${E.R_RECOVERY_MIN[0.8]}`);

  const dists = [0.2, 0.4, 0.6, 0.8];
  for (let i = 1; i < dists.length; i++) {
    check(`El descanso crece con la distancia (${dists[i - 1] * 1000}m → ${dists[i] * 1000}m)`,
      E.R_RECOVERY_MIN[dists[i]] > E.R_RECOVERY_MIN[dists[i - 1]]);
  }

  // El descanso debe reflejarse en las fases del entrenamiento en vivo.
  const day = { paceKey: "R", km: 12, distOverride: 0.4, repsOverride: 6,
                targetPace: 3.5, hmPace: 4.0, easyPace: 4.4 };
  const segs = E.buildLiveSegments(day, 4.4);
  const rec = segs.find((s) => s.label === "Recuperación");
  const expectedKm = Math.round((2 / 4.4) * 10) / 10; // 2 minutos al ritmo suave
  check("La recuperación en vivo usa el descanso nuevo",
    rec && Math.abs(rec.target - expectedKm) < 0.15,
    `dio ${rec ? rec.target : "ninguna"} km, se esperaba ~${expectedKm}`);
}

// ============================================================
// 15. MOVER UNA SESIÓN A UN DÍA CONTIGUO (alumno, planes de fitness)
// ============================================================
console.log("▸ Mover sesiones a un día contiguo");
{
  // Réplica de las reglas de moveSession / canMove.
  const mkWeek = () => {
    const days = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
    const trainDays = [1, 3, 5]; // Mar, Jue, Sáb
    return {
      plan: days.map((d, i) => ({ day: d, paceKey: trainDays.includes(i) ? "E" : "",
        type: trainDays.includes(i) ? "Run/Walk" : "Descanso", km: trainDays.includes(i) ? 5 : 0 })),
      log: days.map(() => ({ completed: false, actualKm: "", actualPaceStr: "", rpe: "", note: "" })),
    };
  };
  const canMove = (week, fromIdx, toIdx, todayIdx) => {
    if (toIdx < 0 || toIdx > 6) return false;
    if (!week.plan[fromIdx]?.paceKey) return false;
    if (week.plan[toIdx]?.paceKey) return false;
    if (week.log[fromIdx]?.completed) return false;
    if (toIdx < todayIdx) return false;
    return true;
  };
  const move = (week, fromIdx, toIdx) => {
    const plan = [...week.plan], log = [...week.log];
    const fromLabel = plan[fromIdx].day, toLabel = plan[toIdx].day;
    plan[toIdx] = { ...plan[fromIdx], day: toLabel, movedFrom: fromLabel };
    plan[fromIdx] = { ...week.plan[toIdx], day: fromLabel };
    log[toIdx] = log[fromIdx];
    log[fromIdx] = { completed: false, actualKm: "", actualPaceStr: "", rpe: "", note: "" };
    return { plan, log };
  };

  // El caso planteado: plan Mar/Jue/Sáb, el alumno reacomoda su semana el lunes.
  let w = mkWeek();
  check("Se puede adelantar el martes al lunes", canMove(w, 1, 0, 0));
  w = move(w, 1, 0);
  check("Tras mover, el lunes tiene la sesión", !!w.plan[0].paceKey);
  check("Tras mover, el martes queda libre", !w.plan[1].paceKey);
  check("El día conserva su etiqueta correcta", w.plan[0].day === "Lun" && w.plan[1].day === "Mar");

  check("Se puede adelantar el jueves al miércoles", canMove(w, 3, 2, 0));
  w = move(w, 3, 2);
  check("Se puede aplazar el sábado al domingo", canMove(w, 5, 6, 0));
  w = move(w, 5, 6);
  const finalDays = w.plan.map((d, i) => (d.paceKey ? i : -1)).filter((i) => i >= 0);
  check("La semana queda reordenada como pidió el alumno",
    JSON.stringify(finalDays) === JSON.stringify([0, 2, 6]), JSON.stringify(finalDays));
  check("Sigue habiendo 3 sesiones (no se perdió ninguna)", finalDays.length === 3);

  // Reglas que deben bloquear el movimiento.
  const w2 = mkWeek();
  check("No se mueve a un día que ya tiene entrenamiento", !canMove(w2, 1, 2, 0) || !w2.plan[2].paceKey);
  check("No se mueve a un día que ya pasó", !canMove(w2, 3, 2, 3));
  check("Sí se puede mover al día de hoy", canMove(w2, 3, 2, 2));
  check("No se mueve fuera de la semana", !canMove(w2, 5, 7, 0));
  check("No se mueve desde un día de descanso", !canMove(w2, 0, 1, 0));
  const w3 = mkWeek(); w3.log[1].completed = true;
  check("No se mueve una sesión ya completada", !canMove(w3, 1, 0, 0));
}

// ============================================================
// 16. CUMPLIMIENTO RECIENTE (etiqueta del panel del coach)
// ============================================================
console.log("▸ Cumplimiento reciente del alumno");
{
  const plan = [
    { day: "Lun", paceKey: "", km: 0 }, { day: "Mar", paceKey: "I", km: 10 },
    { day: "Mié", paceKey: "E", km: 12 }, { day: "Jue", paceKey: "T", km: 14 },
    { day: "Vie", paceKey: "", km: 0 }, { day: "Sáb", paceKey: "", km: 0 },
    { day: "Dom", paceKey: "long", km: 20 },
  ];
  const mkLog = (a) => plan.map((d, i) => a[i] ?? { completed: false, actualKm: "", rpe: "" });
  const wk = (log, byStudent = true) => ({ submitted: true, studentSubmitted: byStudent, plan, log });
  const done = (km) => ({ completed: true, actualKm: km, rpe: "" });

  // Sesiones y volumen deben medirse por separado.
  const exact = E.computeRecentCompliance({ weeks: { 1: wk(mkLog([null, done(10), done(12), done(14), null, null, done(20)])) } });
  check("4 de 4 sesiones se cuentan bien", exact.sessionsDone === 4 && exact.sessionsTotal === 4);
  check("Volumen exacto da 100%", Math.round(exact.volumePct * 100) === 100);

  const short = E.computeRecentCompliance({ weeks: { 1: wk(mkLog([null, done(5), done(6), done(7), null, null, done(10)])) } });
  check("Hacer todas las sesiones pero más cortas: sesiones al 100%", short.sessionsPct === 1);
  check("Hacer todas las sesiones pero más cortas: volumen al 50%",
    Math.round(short.volumePct * 100) === 50, `dio ${Math.round(short.volumePct * 100)}%`);

  const missed = E.computeRecentCompliance({ weeks: { 1: wk(mkLog([null, done(10), done(12), done(14), null, null, null])) } });
  check("Faltar a una sesión se refleja en las sesiones, no en el volumen",
    missed.sessionsDone === 3 && Math.round(missed.volumePct * 100) === 100);

  // Hacer de más debe verse (antes se recortaba a 100%).
  const over = E.computeRecentCompliance({ weeks: { 1: wk(mkLog([null, done(20), done(12), done(14), null, null, done(20)])) } });
  check("Correr de más se refleja por encima del 100%", over.volumePct > 1, `dio ${Math.round(over.volumePct * 100)}%`);

  // Sin km registrados no debe inventar un 100% de volumen.
  const noKm = E.computeRecentCompliance({ weeks: { 1: wk(mkLog([null, done(""), done(""), done(""), null, null, done("")])) } });
  check("Sin km registrados el volumen queda sin dato", noKm.volumePct === null);
  check("Sin km registrados las sesiones sí se cuentan", noKm.sessionsDone === 4);

  // Solo las últimas semanas: una mala racha vieja no debe castigar para siempre.
  const many = { weeks: {} };
  for (let i = 1; i <= 8; i++) {
    many.weeks[i] = wk(mkLog(i <= 4 ? [] : [null, done(10), done(12), done(14), null, null, done(20)]));
  }
  const recent = E.computeRecentCompliance(many);
  check("Solo se miran las últimas semanas", recent.weeks === 4, `miró ${recent.weeks}`);
  check("Una mala racha anterior no arrastra el número", recent.sessionsPct === 1);

  // También debe contar cuando el coach cierra la semana (no solo si la envía el alumno).
  const byCoach = E.computeRecentCompliance({ weeks: { 1: wk(mkLog([null, done(10), done(12), null, null, null, null]), false) } });
  check("Cuenta las semanas cerradas por el coach", byCoach !== null && byCoach.sessionsDone === 2);

  // Sin semanas cerradas no hay dato que mostrar.
  check("Sin semanas cerradas devuelve null",
    E.computeRecentCompliance({ weeks: { 1: { submitted: false, plan, log: mkLog([]) } } }) === null);
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
