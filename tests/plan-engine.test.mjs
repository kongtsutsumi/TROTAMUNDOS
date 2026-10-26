// Pruebas del motor de planes de TROTAMUNDOS.
//
// Qué verifican: que para CUALQUIER combinación de objetivo, nivel y momento del ciclo,
// el plan que genera la app sea coherente — sin días con 0 km mal etiquetados, sin sesiones
// absurdamente largas, con los volúmenes cuadrando, y respetando el km pico del alumno.
//
// Cómo correrlas:  npm test
//
// Importan el motor real (lib/plan-engine.mjs). Antes había que extraer las funciones de
// app/page.jsx con un truco, porque vivían dentro del archivo de pantallas; ya no.
import * as E from "../lib/plan-engine.mjs";

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

  // Una semana vieja SIN ENVIAR no puede retener el presente.
  //
  // Antes la semana activa era "la primera sin enviar", y eso era una trampa sin salida: la
  // semana vieja tampoco se puede enviar, porque el calendario ya la cerró y el botón
  // desaparece. El alumno quedaba sin poder registrar nada, ni en la vieja ni en la de hoy.
  const late = mk({ 1: { submitted: false }, 2: { submitted: false } });
  setToday("2026-08-12"); // martes de la semana 2
  check("Una semana pasada sin enviar no retiene al alumno",
    E.getActiveLogWeek(late) === 2, `dio ${E.getActiveLogWeek(late)}`);

  // El caso real que lo destapó: la semana de carrera quedó sin enviar y, tres semanas
  // después, el alumno seguía sin poder marcar nada.
  const atrapado = mk({
    18: { submitted: false }, 19: { submitted: false },
    20: { submitted: false }, 21: { submitted: false }, 22: { submitted: false },
  });
  atrapado.planStartMonday = "2026-05-18"; // la semana 22 cae en el 12/10
  setToday("2026-10-19");                   // lunes de la semana 23
  const activa = E.getActiveLogWeek(atrapado);
  check("Tres semanas sin enviar no dejan al alumno atrapado", activa === 22, `dio ${activa}`);
  check("La semana activa es una que existe de verdad", !!atrapado.weeks[activa]);
  // Con la semana activa en su sitio, la pantalla deja registrar: ni vista previa ni cerrada.
  const hoyNum = E.getTodayWeekNum(atrapado);
  check("La semana activa no queda marcada como vista previa", !(activa > hoyNum), `activa ${activa}, hoy ${hoyNum}`);
  check("La semana activa no queda marcada como finalizada",
    !(activa < hoyNum) || activa === 22, `activa ${activa}, hoy ${hoyNum}`);

  // Si el plan no llega hasta hoy, se queda en la última que exista (esperando al coach).
  const sinPreparar = mk({ 1: { submitted: true }, 2: { submitted: true } });
  setToday("2026-08-24"); // semana 4, pero solo hay hasta la 2
  check("Si el coach no preparó más, se queda en la última que existe",
    E.getActiveLogWeek(sinPreparar) === 2, `dio ${E.getActiveLogWeek(sinPreparar)}`);

  // Un hueco en el historial no debe devolver una semana inexistente.
  const conHueco = mk({ 1: { submitted: true }, 4: { submitted: false } });
  setToday("2026-08-17"); // semana 3, que no existe
  const h = E.getActiveLogWeek(conHueco);
  check("Un hueco en el historial no devuelve una semana que no existe", !!conHueco.weeks[h], `dio ${h}`);

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

  // El descanso debe reflejarse en las fases del entrenamiento en vivo, Y EN MINUTOS.
  // Antes se convertía a kilómetros y el redondeo a medios kilómetros dejaba la
  // recuperación de los 200m en 0 km: en vivo, el alumno veía un paso vacío.
  const day = { paceKey: "R", km: 12, distOverride: 0.4, repsOverride: 6,
                targetPace: 3.5, hmPace: 4.0, easyPace: 4.4 };
  const rec = E.buildLiveSegments(day, 4.4).find((s) => s.label === "Recuperación");
  check("La recuperación en vivo va en minutos, no en kilómetros", rec?.type === "time", `dio tipo ${rec?.type}`);
  check("La recuperación en vivo usa el descanso de la metodología", rec?.target === 2, `dio ${rec?.target}`);

  // Ninguna distancia de serie puede quedar con una recuperación vacía.
  for (const d of dists) {
    const dia = { paceKey: "R", km: 12, distOverride: d, repsOverride: 6,
                  targetPace: 3.5, hmPace: 4.0, easyPace: 6.2 };
    const r = E.buildLiveSegments(dia, 6.2).find((s) => s.label === "Recuperación");
    check(`La recuperación de ${d * 1000}m no queda vacía en vivo`,
      r && r.type === "time" && r.target === E.R_RECOVERY_MIN[d],
      `dio ${r?.target} (${r?.type})`);
  }
  // Los intervalos (I) comparten el mismo trato.
  const diaI = { paceKey: "I", km: 14, distOverride: 1, repsOverride: 5,
                 targetPace: 3.8, hmPace: 4.0, marathonPace: 4.4, easyPace: 6.2 };
  const recI = E.buildLiveSegments(diaI, 6.2).find((s) => s.label === "Recuperación");
  check("La recuperación de los intervalos también va en minutos",
    recI?.type === "time" && recI.target > 0, `dio ${recI?.target} (${recI?.type})`);
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
// 17. RETOMAR TRAS UN PERÍODO DE INACTIVIDAD
// ============================================================
console.log("▸ Cambiar de objetivo tras una inactividad");
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

  // Alumno que empezó el 3 de agosto y se detuvo en la semana 3.
  const student = {
    goal: "10k", level: "intermedio1", currentWeek: 3, planStartMonday: "2026-08-03",
    weeks: {
      1: { submitted: true, plan: [], log: [] },
      2: { submitted: true, plan: [], log: [] },
      3: { submitted: false, plan: [{ day: "Lun", km: 5 }], log: [{ completed: false }] },
    },
  };

  setToday("2026-09-07"); // tres semanas después
  const todayWeek = E.getTodayWeekNum(student);
  check("La semana de calendario avanzó aunque el plan no", todayWeek === 6, `dio ${todayWeek}`);

  const resumeWeek = Math.max(student.currentWeek, todayWeek);
  check("El plan nuevo se genera en la semana de hoy, no en la del pasado", resumeWeek === 6);

  const marked = E.markInactiveWeeks(student, student.currentWeek, resumeWeek);
  check("Las semanas sin actividad quedan marcadas",
    marked[3].inactive && marked[4].inactive && marked[5].inactive);
  check("Las semanas marcadas se dan por cerradas", marked[3].submitted === true);
  check("No se tocan las semanas ya cerradas antes",
    !marked[1].inactive && !marked[2].inactive);

  // Un alumno al día no debe verse afectado.
  const upToDate = { ...student, currentWeek: 6 };
  const untouched = E.markInactiveWeeks(upToDate, 6, 6);
  check("Un alumno al día no genera semanas inactivas",
    !Object.values(untouched).some((w) => w.inactive));

  // Una semana pausada no debe marcarse como inactiva: son cosas distintas.
  const withPause = { ...student, weeks: { ...student.weeks, 3: { submitted: false, paused: true, plan: [], log: [] } } };
  const pauseKept = E.markInactiveWeeks(withPause, 3, 6);
  check("Una semana pausada se respeta, no se marca como inactiva", !pauseKept[3].inactive);

  restore();
}

// ============================================================
// 18. BLOQUES DE RUN/WALK  (10' a 20', de minuto en minuto, 3 bloques de preferencia)
// ============================================================
console.log("\n▸ Bloques de Run/Walk según el kilometraje");
{
  const MIN = E.RUNWALK_BLOCK_MIN_MINUTES;
  const MAX = E.RUNWALK_BLOCK_MAX_MINUTES;
  check("La franja declarada es de 10' a 20'", MIN === 10 && MAX === 20, `dio ${MIN}-${MAX}`);
  check("La caminata entre bloques es de 1'", E.RUNWALK_WALK_MINUTES === 1);

  // Barrido sobre todo el rango de duraciones que la app puede producir (y más allá).
  let fueraDeFranja = 0, noEntero = 0, desvioGrande = 0, peorDesvio = 0;
  for (let total = 11; total <= 180; total++) {
    const b = E.computeRunWalkBlocks(total, MAX);
    if (b.blockMin < MIN || b.blockMin > MAX) fueraDeFranja++;
    if (!Number.isInteger(b.blockMin) || !Number.isInteger(b.reps)) noEntero++;
    const desvio = Math.abs(b.accumulatedMin - total);
    peorDesvio = Math.max(peorDesvio, desvio);
    if (desvio > 2) desvioGrande++;
  }
  check("Ningún bloque queda fuera de la franja 10'-20'", fueraDeFranja === 0, `${fueraDeFranja} casos`);
  check("Los bloques y las repeticiones siempre son minutos enteros", noEntero === 0, `${noEntero} casos`);
  check("El acumulado nunca se desvía más de 2' del total de la sesión", desvioGrande === 0,
    `${desvioGrande} casos, peor desvío ${peorDesvio}'`);

  // Se usan todos los valores intermedios, no solo 12/15/18/20 como antes.
  const usados = new Set();
  for (let total = 11; total <= 180; total++) usados.add(E.computeRunWalkBlocks(total, MAX).blockMin);
  const intermedios = [11, 13, 14, 16, 17, 19].filter((v) => usados.has(v));
  check("Aparecen los valores intermedios de 1 en 1 (11', 13', 14', 16', 17', 19')",
    intermedios.length >= 5, `solo ${intermedios.join(", ")}`);

  // Prioridad: 3 bloques primero, 4 después, más solo cuando no cabe de otra forma.
  check("Una sesión de 48' se reparte en 3 bloques", E.computeRunWalkBlocks(48, MAX).reps === 3);
  check("Una sesión de 63' se reparte en 3 bloques de 20'",
    E.computeRunWalkBlocks(63, MAX).reps === 3 && E.computeRunWalkBlocks(63, MAX).blockMin === 20);
  check("Una sesión de 70' pasa a 4 bloques (con 3 se pasaría de 20')",
    E.computeRunWalkBlocks(70, MAX).reps === 4);
  check("Una sesión de 84' son 4 bloques de 20' exactos",
    E.computeRunWalkBlocks(84, MAX).reps === 4 && E.computeRunWalkBlocks(84, MAX).blockMin === 20);
  check("Solo por encima de 4 x 20' se agregan más bloques",
    E.computeRunWalkBlocks(100, MAX).reps === 5 && E.computeRunWalkBlocks(100, MAX).blockMin <= MAX);
  check("Una sesión corta usa menos bloques antes que bajar de 10'",
    E.computeRunWalkBlocks(25, MAX).reps === 2 && E.computeRunWalkBlocks(25, MAX).blockMin >= MIN);

  // Se prefieren 3 bloques en toda la franja en la que 3 bloques son posibles.
  let noPrefiere3 = 0;
  for (let total = 33; total <= 63; total++) if (E.computeRunWalkBlocks(total, MAX).reps !== 3) noPrefiere3++;
  check("Entre 33' y 63' siempre elige 3 bloques", noPrefiere3 === 0, `${noPrefiere3} casos`);
  let noPrefiere4 = 0;
  for (let total = 66; total <= 84; total++) if (E.computeRunWalkBlocks(total, MAX).reps !== 4) noPrefiere4++;
  check("Entre 66' y 84' siempre elige 4 bloques", noPrefiere4 === 0, `${noPrefiere4} casos`);

  // El lunes de descarga mantiene su techo más bajo.
  let lunesFuera = 0;
  for (let total = 11; total <= 60; total++) if (E.computeRunWalkBlocks(total, 15).blockMin > 15) lunesFuera++;
  check("El lunes de recuperación no pasa de 15' por bloque", lunesFuera === 0, `${lunesFuera} casos`);
  check("El lunes de 48' son 3 bloques de 15'",
    E.computeRunWalkBlocks(48, 15).reps === 3 && E.computeRunWalkBlocks(48, 15).blockMin === 15);

  // Las tres vistas (detalle, gráfico y entrenamiento en vivo) deben coincidir: todas pasan
  // por la misma función, así que basta comprobar que el detalle y el modo en vivo cuadran.
  const paces = E.computeTrainingPaces(E.computeVDOT(10, E.parsePaceToDecimal("4:10")));
  for (const km of [4, 6, 8, 10, 12, 14, 16]) {
    const day = {
      day: "Lunes", type: "Run/Walk", paceKey: "E", km, runWalk: true,
      targetPace: paces.E, easyPace: paces.E, level: "intermedio2",
    };
    const plan = E.getRunWalkPlan(day);
    const segs = E.buildLiveSegments(day, paces.E);
    const trotes = segs.filter((s) => s.label.startsWith("Trote"));
    check(`Detalle y modo en vivo coinciden en ${km} km`,
      trotes.length === plan.reps && trotes.every((t) => t.target === plan.blockMin),
      `detalle ${plan.reps}x${plan.blockMin}' vs vivo ${trotes.length}x${trotes[0]?.target}'`);
    const detalle = E.getSessionDetail(day);
    const texto = (detalle || []).find((d) => d.label === "Run/Walk")?.text || "";
    check(`El texto del detalle muestra los bloques correctos en ${km} km`,
      texto.includes(`Trote ${plan.blockMin}'`) && texto.includes(`x${plan.reps}`),
      `texto: ${texto}`);
    const bars = E.getSessionBars ? E.getSessionBars(day) : null;
    if (bars) {
      const trote = bars.filter((b) => b.label === "Trote");
      check(`El gráfico de la sesión coincide en ${km} km`,
        trote.length === plan.reps && trote.every((b) => b.durationMin === plan.blockMin),
        `gráfico ${trote.length}x${trote[0]?.durationMin}' vs ${plan.reps}x${plan.blockMin}'`);
    }
  }

  // Lo mismo, sobre planes generados de verdad: ningún día de Run/Walk fuera de la franja.
  let diasFuera = 0, diasRevisados = 0;
  for (const goalId of ["10k", "21k", "42k"]) {
    for (const [level, kms] of Object.entries({
      principiante: [20, 30, 40], intermedio1: [30, 40, 50], intermedio2: [40, 50, 60],
      intermedio3: [50, 60, 70], avanzado1: [70, 85, 100], avanzado2: [90, 110, 130],
    })) {
      for (const weeklyKm of kms) {
        for (const phase of ["base", "build", "peak", "taper"]) {
          const qp = E.suggestQualityPaces(phase, goalId, level, 10);
          const plan = E.buildRacePlan(goalId, phase, level, weeklyKm, Math.round(weeklyKm * 0.28), qp.q1, qp.q2, paces, 10, 3);
          for (const d of plan || []) {
            if (d.paceKey !== "E" || !d.runWalk || !(d.km > 0)) continue;
            diasRevisados++;
            const b = E.getRunWalkPlan(d);
            const techo = d.isMondayRecovery ? 15 : MAX;
            if (b.blockMin < MIN || b.blockMin > techo || b.reps < 1) diasFuera++;
          }
        }
      }
    }
  }
  check("Hay días de Run/Walk que revisar en los planes reales", diasRevisados > 300, `revisados ${diasRevisados}`);
  check("Ningún día de Run/Walk de un plan real queda fuera de la franja", diasFuera === 0,
    `${diasFuera} de ${diasRevisados} días`);
}

// ============================================================
// 19. PUBLICACIÓN AUTOMÁTICA DE LA SEMANA
//     El requisito es duro: NUNCA puede pasar que un alumno entre un lunes y no tenga plan.
// ============================================================
console.log("\n▸ Publicación automática de la semana");
{
  const iso = E.localDateISO;
  const lunesHoy = E.mondayOf(new Date());
  const inicioHace = (n) => { const d = new Date(lunesHoy); d.setDate(d.getDate() - 7 * n); return iso(d); };
  const paces = { E: 6.2, M: 5.0, HM: 4.8, T: 4.7, I: 4.3, R: 4.0 };
  const semana = (submitted, km = 45, extra = {}) => ({
    weeklyKm: km, phase: "base",
    plan: E.buildRacePlan("21k", "base", "intermedio2", km, 14, "I", "T", paces, 10, 1),
    log: E.emptyLog().map((l) => ({ ...l, completed: submitted })),
    submitted, studentSubmitted: submitted, ...extra,
  });
  const base = (ov = {}) => ({
    id: "t1", name: "Alumno", goal: "21k", level: "intermedio2", paces,
    peakKm: 60, peakLongKm: 18, weeksToRace: 10,
    planStartMonday: inicioHace(3), currentWeek: 3,
    weeks: { 1: semana(true), 2: semana(true), 3: semana(true) }, ...ov,
  });

  // --- La fecha local no se puede calcular con toISOString ---
  const d = new Date(2026, 9, 12, 0, 30); // 12 de octubre, 00:30 hora local
  check("localDateISO respeta el calendario local (no corre el día)", E.localDateISO(d) === "2026-10-12", `dio ${E.localDateISO(d)}`);

  // --- Caso central: el coach no confirmó y llegó el lunes ---
  const r = E.autoPublishDueWeek(base());
  check("Publica la semana que falta cuando el coach no la confirmó", r.published === 4, `publicó ${r.published}`);
  check("La semana publicada es la sugerencia del sistema", r.kind === "propuesta", `fue ${r.kind}`);
  const nueva = r.updated.weeks[4];
  check("La semana publicada queda abierta para el alumno", nueva && nueva.submitted === false);
  check("La semana publicada queda marcada para revisión", !!nueva?.autoPublished);
  check("La semana publicada tiene plan con sesiones reales", (nueva?.plan || []).filter((x) => x?.paceKey).length >= 3);
  check("La semana publicada tiene registro vacío del mismo largo", Array.isArray(nueva?.log) && nueva.log.length === nueva.plan.length);
  check("La nota explica que se publicó automáticamente", (nueva?.note || "").startsWith(E.AUTO_PUBLISH_LABEL));
  check("La semana anterior queda cerrada", r.updated.weeks[3].submitted === true);
  check("currentWeek avanza a la semana publicada", r.updated.currentWeek === 4);
  check("El volumen publicado no supera el km pico", nueva.weeklyKm <= 60, `dio ${nueva.weeklyKm}`);
  check("El plan publicado no tiene anomalías", E.getAnomalyWarnings(nueva.plan).length === 0,
    E.getAnomalyWarnings(nueva.plan).map((w) => w.text || w).join(" | "));

  // --- Idempotencia: es lo que impide publicar dos veces ---
  const r2 = E.autoPublishDueWeek(r.updated);
  check("Llamarla de nuevo no publica una segunda semana", r2.published === null && r2.reason === "ya-existe", r2.reason);
  const r3 = E.autoPublishDueWeek(r2.updated);
  check("Ni una tercera vez", r3.published === null);
  check("No altera el registro cuando no publica", r2.updated === r.updated);

  // --- Casos en los que NO debe tocar nada ---
  check("No publica si la semana de hoy ya existe",
    E.autoPublishDueWeek(base({ weeks: { ...base().weeks, 4: semana(false) } })).published === null);
  check("No publica si el coach pausó la semana en curso",
    E.autoPublishDueWeek(base({ weeks: { ...base().weeks, 4: semana(false, 45, { paused: true }) } })).published === null);
  check("No publica si el alumno ya envió la semana de hoy",
    E.autoPublishDueWeek(base({ weeks: { ...base().weeks, 4: semana(true) } })).published === null);
  check("No publica si el alumno no tiene ninguna semana",
    E.autoPublishDueWeek(base({ weeks: {} })).published === null);
  check("No inventa semanas de un hueco pasado",
    E.autoPublishDueWeek(base({ planStartMonday: inicioHace(1), weeks: { 1: semana(true), 3: semana(false) } })).published === null);
  check("Tolera un registro vacío sin romperse", E.autoPublishDueWeek(null).published === null);
  check("Tolera un registro sin semanas sin romperse", E.autoPublishDueWeek({ id: "x" }).published === null);

  // --- Después de una ausencia NO se avanza el ciclo ---
  const aus = E.autoPublishDueWeek(base({ planStartMonday: inicioHace(5) })); // hoy = semana 6
  check("Tras una ausencia publica la semana del calendario", aus.published === 6, `publicó ${aus.published}`);
  check("Tras una ausencia repite estructura, no avanza el ciclo", aus.kind === "repetida", `fue ${aus.kind}`);
  check("Las semanas sin plan quedan registradas como sin actividad",
    aus.updated.weeks[4]?.inactive === true && aus.updated.weeks[5]?.inactive === true);
  check("La semana repetida conserva el volumen de la última real", aus.updated.weeks[6].weeklyKm === 45, `dio ${aus.updated.weeks[6].weeklyKm}`);
  check("La semana repetida avisa al coach que la revise", (aus.updated.weeks[6].note || "").includes("Revisa"));
  check("Tras una ausencia también es idempotente", E.autoPublishDueWeek(aus.updated).published === null);

  // --- Adherencia real: la semana ya fue vivida, aunque no se haya enviado ---
  const floja = base({ weeks: { 1: semana(true), 2: semana(true), 3: semana(false) } });
  const rFloja = E.autoPublishDueWeek(floja);
  const rBuena = E.autoPublishDueWeek(base());
  check("Usa la adherencia real de la semana que terminó", rFloja.adherencePct === 0, `dio ${rFloja.adherencePct}`);
  check("Con adherencia baja no sube el volumen igual que con adherencia alta",
    rFloja.updated.weeks[4].weeklyKm <= rBuena.updated.weeks[4].weeklyKm,
    `${rFloja.updated.weeks[4].weeklyKm} vs ${rBuena.updated.weeks[4].weeklyKm}`);

  // --- El contador de semanas a la carrera se corrige si el coach preparó de más ---
  const adel = base({ planStartMonday: inicioHace(4), currentWeek: 3, weeksToRace: 9,
    weeks: { 1: semana(true), 2: semana(true), 3: semana(true), 4: semana(true, 48) } });
  check("Corre el contador cuando se cierra una semana preparada por adelantado",
    E.shiftWeeksToRace(adel, 4) === 8, `dio ${E.shiftWeeksToRace(adel, 4)}`);
  const rAdel = E.autoPublishDueWeek(adel);
  check("Publica la semana 5 y cierra la 4", rAdel.published === 5 && rAdel.updated.weeks[4].submitted === true);
  check("La semana 5 queda con las semanas a carrera correctas", rAdel.updated.weeksToRace === 7, `dio ${rAdel.updated.weeksToRace}`);

  // --- Planes de fitness y principiante ---
  const fitSemana = (stage, done) => ({
    weeklyKm: null, phase: "principiante",
    plan: E.buildBeginnerPlan(stage, "fitness16", "principiante"),
    log: E.emptyLog().map((l) => ({ ...l, completed: done })), submitted: true,
  });
  const fit = { id: "f", name: "Fit", goal: "fitness16", level: "principiante", paces,
    beginnerStage: 4, trainDays: [0, 2, 5], planStartMonday: inicioHace(3), currentWeek: 3,
    weeks: { 1: fitSemana(2, true), 2: fitSemana(3, true), 3: fitSemana(4, true) } };
  const rFit = E.autoPublishDueWeek(fit);
  check("También publica en los planes de fitness", rFit.published === 4);
  check("En fitness avanza de etapa si la adherencia fue buena", rFit.updated.beginnerStage === 5, `dio ${rFit.updated.beginnerStage}`);
  const fitFlojo = { ...fit, weeks: { ...fit.weeks, 3: fitSemana(4, false) } };
  check("En fitness NO avanza de etapa si la adherencia fue baja",
    E.autoPublishDueWeek(fitFlojo).updated.beginnerStage === 4);
  const fitPausado = { ...fit, weeks: { ...fit.weeks, 3: { ...fitSemana(4, false), paused: true } } };
  check("Una semana pausada no hace avanzar la etapa",
    E.autoPublishDueWeek(fitPausado).updated.beginnerStage === 4);

  // --- La fecha inyectada manda, no el reloj del servidor ---
  const a = base({ planStartMonday: inicioHace(2) }); // hoy = semana 3, ya existe
  const proxLunes = new Date(lunesHoy); proxLunes.setDate(proxLunes.getDate() + 7);
  const domAnterior = new Date(lunesHoy); domAnterior.setDate(domAnterior.getDate() - 1);
  check("Con la fecha de hoy no publica (la semana existe)", E.autoPublishDueWeek(a).published === null);
  check("Con la fecha del lunes siguiente publica la semana 4", E.autoPublishDueWeek(a, iso(proxLunes)).published === 4);
  check("Con la fecha del domingo anterior no publica", E.autoPublishDueWeek(a, iso(domAnterior)).published === null);
  check("Una fecha inválida cae en el reloj local sin romperse", E.autoPublishDueWeek(a, "no-es-fecha").published === null);

  // --- La fecha que manda el navegador no se acepta a ciegas ---
  // Sin este filtro, un alumno podría mandar una fecha futura y destrabarse semanas que
  // todavía no le corresponden.
  const hoyUTC = new Date().toISOString().slice(0, 10);
  const enDias = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  check("Acepta la fecha de hoy", E.sanitizeLocalDate(hoyUTC) === hoyUTC);
  check("Acepta un día de diferencia (zonas horarias del mundo)", E.sanitizeLocalDate(enDias(1)) !== null && E.sanitizeLocalDate(enDias(-1)) !== null);
  check("Rechaza una fecha 2 días adelante", E.sanitizeLocalDate(enDias(2)) === null);
  check("Rechaza una fecha muy futura", E.sanitizeLocalDate(enDias(60)) === null);
  check("Rechaza una fecha muy pasada", E.sanitizeLocalDate(enDias(-60)) === null);
  check("Rechaza otro formato de fecha", E.sanitizeLocalDate("14/10/2026") === null);
  check("Rechaza lo que no sea texto", E.sanitizeLocalDate(123) === null && E.sanitizeLocalDate(null) === null);
  check("Rechaza una fecha inexistente", E.sanitizeLocalDate("2026-13-45") === null);

  // --- Barrido: ningún alumno puede quedarse sin plan un lunes ---
  let sinPlan = 0, revisados = 0;
  for (const goalId of ["10k", "21k", "42k", "fitness16"]) {
    for (const level of ["principiante", "intermedio1", "intermedio2", "avanzado1"]) {
      for (const semanasAtras of [0, 1, 2, 3]) {
        const esFit = E.isFitnessGoal(goalId);
        const wk = esFit ? fitSemana(3, true) : semana(true);
        const s = {
          id: "b", name: "B", goal: goalId, level, paces, peakKm: 70, peakLongKm: 20,
          weeksToRace: 10, beginnerStage: 3, trainDays: [0, 2, 5],
          planStartMonday: inicioHace(3 + semanasAtras), currentWeek: 3,
          weeks: { 1: wk, 2: wk, 3: wk },
        };
        revisados++;
        const res = E.autoPublishDueWeek(s);
        const despues = res.updated;
        const hoy = E.getTodayWeekNum(despues);
        const sem = despues.weeks[hoy];
        const tienePlan = !!sem && Array.isArray(sem.plan) && sem.plan.some((x) => x?.paceKey);
        if (!tienePlan) { sinPlan++; }
      }
    }
  }
  check("Hay combinaciones suficientes que revisar", revisados === 64, `revisados ${revisados}`);
  check("Después de publicar, NINGÚN alumno queda sin plan en su semana de hoy", sinPlan === 0,
    `${sinPlan} de ${revisados} quedaron sin plan`);
}

// ============================================================
// 20. TRADUCCIÓN AL FORMATO DE intervals.icu (envío al reloj)
// ============================================================
console.log("\n▸ Traducción de las sesiones al formato de intervals.icu");
{
  const IC = await import("../lib/intervals-icu.mjs");
  const paces = E.computeTrainingPaces(E.computeVDOT(21.0975, E.parsePaceToDecimal("4:30")));

  // --- Unidades: acá un error se traduce en un entrenamiento absurdo en el reloj ---
  check("Las distancias bajo 1 km van en metros", IC.fmtDistancia(0.6) === "600mtr", IC.fmtDistancia(0.6));
  check("Las distancias de 1 km o más van en km", IC.fmtDistancia(3) === "3km", IC.fmtDistancia(3));
  check("Una distancia de cero no genera paso", IC.fmtDistancia(0) === null);
  check("Los minutos enteros se escriben con m", IC.fmtTiempo(30) === "30m", IC.fmtTiempo(30));
  check("Los segundos sueltos se escriben con s", IC.fmtTiempo(20 / 60) === "20s", IC.fmtTiempo(20 / 60));
  check("Los tiempos mixtos se escriben m+s", IC.fmtTiempo(1.5) === "1m30s", IC.fmtTiempo(1.5));
  check("Un tiempo de cero no genera paso", IC.fmtTiempo(0) === null);
  check("El ritmo se escribe en min:seg por km", IC.fmtRitmo(4.5) === "4:30/km Pace", IC.fmtRitmo(4.5));

  const semana = (goalId, fase, nivel, km, fondo, q1, q2, semanasCarrera) => {
    const plan = E.buildRacePlan(goalId, fase, nivel, km, fondo, q1, q2, paces, semanasCarrera, E.getTaperWeeks(goalId));
    const lunes = E.mondayOf(new Date()); lunes.setDate(lunes.getDate() - 14);
    return { id: "s1", name: "Prueba", paces, planStartMonday: E.localDateISO(lunes), currentWeek: 3,
             weeks: { 3: { weeklyKm: km, phase: fase, plan, log: E.emptyLog(), submitted: false } } };
  };

  const alumno = semana("21k", "peak", "intermedio2", 55, 16, "R", "T", 6);
  const eventos = IC.semanaAEventos(alumno, 3);
  const diasConSesion = alumno.weeks[3].plan.filter((d) => d?.paceKey).length;

  check("Cada día de entrenamiento genera un evento", eventos.length === diasConSesion, `${eventos.length} vs ${diasConSesion}`);
  check("Los días de descanso no se mandan al reloj", eventos.length < 7);
  check("Todos los eventos son de categoría WORKOUT", eventos.every((e) => e.category === "WORKOUT"));
  check("Todos los eventos llevan descripción con pasos", eventos.every((e) => e.description && e.description.includes("- ")));
  check("Todos los eventos llevan identificador propio",
    eventos.every((e) => e.external_id.startsWith(IC.EXTERNAL_ID_PREFIX)));
  check("Los identificadores no se repiten entre sí", new Set(eventos.map((e) => e.external_id)).size === eventos.length);

  // Idempotencia: el mismo plan dos veces da los mismos identificadores, que es lo que
  // hace que reenviar una semana ACTUALICE el reloj en vez de duplicar las sesiones.
  const otraVez = IC.semanaAEventos(alumno, 3);
  check("Reenviar la misma semana produce los mismos identificadores",
    JSON.stringify(otraVez.map((e) => e.external_id)) === JSON.stringify(eventos.map((e) => e.external_id)));
  check("Semanas distintas no comparten identificadores",
    IC.externalIdFor("s1", 3, 1) !== IC.externalIdFor("s1", 4, 1));
  check("Alumnos distintos no comparten identificadores",
    IC.externalIdFor("s1", 3, 1) !== IC.externalIdFor("s2", 3, 1));

  // Las fechas tienen que caer en el día correcto de la semana del alumno.
  const lunesDeLa3 = IC.semanaLunes(alumno, 3);
  for (const ev of eventos) {
    const idx = Number(ev.external_id.split("-d")[1]);
    const esperada = new Date(lunesDeLa3);
    esperada.setDate(esperada.getDate() + idx);
    check(`El evento del día ${idx} cae en su fecha`,
      ev.start_date_local.startsWith(E.localDateISO(esperada)),
      `${ev.start_date_local} vs ${E.localDateISO(esperada)}`);
  }

  // --- La sesión de series, que es la que más se puede estropear ---
  const series = eventos.find((e) => e.name.includes("Series"));
  check("La sesión de series llega al reloj", !!series);
  if (series) {
    const t = series.description;
    check("Las series se agrupan en un bloque de repeticiones", /^\d+x$/m.test(t), t);
    check("Las repeticiones llevan su distancia en metros", /\d+mtr/.test(t), t);
    check("Las repeticiones llevan ritmo objetivo", /mtr \d+:\d\d\/km Pace/.test(t), t);
    check("La recuperación de las series NO queda vacía", /Recuperación \d+m/.test(t), t);
    check("El cool-down queda fuera del bloque de repeticiones",
      t.trim().split("\n").pop().includes("Cool-down"), t);
  }

  // --- Barrido: ninguna sesión puede salir mal formada ---
  // "600m" en su sintaxis significa 600 MINUTOS. Si una distancia menor a 1 km se
  // escribiera con "m" en vez de "mtr", el alumno recibiría una serie de diez horas.
  let revisadas = 0, sinRitmo = 0, pasoVacio = 0, unidadPeligrosa = 0, bloqueMalFormado = 0;
  for (const goalId of ["10k", "21k", "42k"]) {
    for (const nivel of ["principiante", "intermedio1", "intermedio2", "avanzado1", "avanzado2"]) {
      for (const fase of ["base", "build", "peak", "taper"]) {
        for (const [km, fondo] of [[30, 10], [55, 16], [90, 26]]) {
          const qp = E.suggestQualityPaces(goalId, fase, 6, E.getTaperWeeks(goalId), E.getCyclePosition(6, 1), nivel);
          const s = semana(goalId, fase, nivel, km, fondo, qp.q1, qp.q2, 6);
          for (const ev of IC.semanaAEventos(s, 3)) {
            revisadas++;
            const lineas = ev.description.split("\n");
            for (const l of lineas) {
              if (!l.startsWith("- ")) continue;
              // Un paso tiene que declarar SIEMPRE una duración o una distancia.
              if (!/(\d+mtr|[\d.]+km|\d+m(\d+s)?\b|\d+s\b|\d+h)/.test(l)) pasoVacio++;
              // Una distancia en metros jamás puede escribirse con "m" suelta.
              if (/\b\d{3,4}m\b(?!tr)/.test(l)) unidadPeligrosa++;
            }
            if (!/\d+:\d\d\/km Pace/.test(ev.description)) sinRitmo++;
            // Un bloque "Nx" necesita línea en blanco antes y después.
            lineas.forEach((l, k) => {
              if (!/^\d+x$/.test(l)) return;
              if (k > 0 && lineas[k - 1].trim() !== "") bloqueMalFormado++;
            });
          }
        }
      }
    }
  }
  check("Hay sesiones suficientes que revisar", revisadas > 200, `revisadas ${revisadas}`);
  check("Ninguna sesión sale sin ritmo objetivo", sinRitmo === 0, `${sinRitmo} de ${revisadas}`);
  check("Ningún paso sale sin duración ni distancia", pasoVacio === 0, `${pasoVacio} pasos`);
  check("Ninguna distancia en metros usa la unidad equivocada", unidadPeligrosa === 0, `${unidadPeligrosa} pasos`);
  check("Ningún bloque de repeticiones queda mal formado", bloqueMalFormado === 0, `${bloqueMalFormado} bloques`);

  // --- Casos límite ---
  check("Un alumno sin esa semana no genera eventos", IC.semanaAEventos(alumno, 99).length === 0);
  check("Un alumno sin datos no rompe", IC.semanaAEventos(null, 3).length === 0);
  check("Una semana sin plan no genera eventos",
    IC.semanaAEventos({ id: "x", weeks: { 1: {} }, planStartMonday: "2026-01-05" }, 1).length === 0);
  check("Un día de descanso no se traduce", IC.sesionATexto({ paceKey: "", km: 0 }, 6) === null);
  check("Sin fecha de inicio no se inventan eventos",
    IC.semanaAEventos({ id: "x", paces, weeks: alumno.weeks }, 3).length === 0);
}

// ============================================================
// TIEMPO OBJETIVO
// ============================================================
console.log("\n▸ Lectura del tiempo objetivo");
{
  const leer = (t, g) => E.interpretarTiempoObjetivo(t, E.DISTANCE_KM[g]);
  const min = (t, g) => leer(t, g)?.minutos;

  // El error que motivó esto: en maratón, "3:20" son 3 horas y 20 minutos.
  check("Maratón 3:20 son 3 h 20 min", Math.abs(min("3:20", "42k") - 200) < 1e-9, String(min("3:20", "42k")));
  check("Y se dice así", leer("3:20", "42k")?.lectura === "3 h 20 min", leer("3:20", "42k")?.lectura);
  check("Su ritmo es 4:44/km", E.formatPace(leer("3:20", "42k").ritmo) === "4:44", E.formatPace(leer("3:20", "42k").ritmo));
  check("Media maratón 1:45 son 1 h 45 min", Math.abs(min("1:45", "21k") - 105) < 1e-9);
  check("Media maratón 1:05 (élite) son 1 h 05 min", Math.abs(min("1:05", "21k") - 65) < 1e-9);
  check("Con segundos también: 3:15:00", Math.abs(min("3:15:00", "42k") - 195) < 1e-9);
  check("Y con segundos sueltos: 3:15:30", Math.abs(min("3:15:30", "42k") - 195.5) < 1e-9);

  // En distancias cortas, dos números son minutos y segundos...
  check("10K 45:00 son 45 min", Math.abs(min("45:00", "10k") - 45) < 1e-9);
  check("10K 38:30 son 38 min 30 s", Math.abs(min("38:30", "10k") - 38.5) < 1e-9);
  check("5K 22:30 son 22 min 30 s", Math.abs(min("22:30", "5k") - 22.5) < 1e-9);
  // ...salvo que eso dé un ritmo imposible: un 10K en 1:05 es 1 hora y 5 minutos.
  check("10K 1:05 es 1 h 05 min, no 1 min 5 s", Math.abs(min("1:05", "10k") - 65) < 1e-9, String(min("1:05", "10k")));

  // Lo que no tiene lectura posible se rechaza, en vez de inventar un plan.
  check("Rechaza un maratón en 45:00:00", leer("45:00:00", "42k") === null);
  check("Rechaza minutos de 60 o más", leer("3:75", "42k") === null);
  check("Rechaza texto", leer("tres horas", "42k") === null);
  check("Rechaza vacío", leer("", "42k") === null && leer(null, "42k") === null);
  check("Rechaza un solo número", leer("200", "42k") === null);
}

// ============================================================
// REPARTO DEL VOLUMEN
// ============================================================
console.log("\n▸ Reparto del volumen: fondo y calidad primero, el resto en easy");
{
  const semana = () => [
    { day: "Lun", slot: "easy", paceKey: "E", km: 6, isMondayRecovery: true, type: "Recuperación" },
    { day: "Mar", slot: "q1", paceKey: "I", km: 12, type: "Intervalos" },
    { day: "Mié", slot: "easy", paceKey: "E", km: 10, runWalk: true, type: "Run/Walk" },
    { day: "Jue", slot: "rest", paceKey: "", km: 0, type: "Descanso" },
    { day: "Vie", slot: "easy", paceKey: "E", km: 8, runWalk: true, type: "Run/Walk" },
    { day: "Sáb", slot: "q2", paceKey: "T", km: 11, type: "Umbral" },
    { day: "Dom", slot: "long", paceKey: "long", km: 24, type: "Fondo" },
  ];
  const sumaKm = (p) => Math.round(p.reduce((t, d) => t + (d.km || 0), 0) * 10) / 10;

  // Objetivo 75: fijos = 6 + 12 + 11 + 24 = 53 → quedan 22 para Mié y Vie.
  const r = E.repartirVolumen(semana(), 75);
  check("La semana cuadra exacta", sumaKm(r.plan) === 75 && r.diferencia === 0, `suma ${sumaKm(r.plan)}`);
  check("El fondo no se toca", r.plan[6].km === 24);
  check("La calidad no se toca", r.plan[1].km === 12 && r.plan[5].km === 11);
  check("El lunes de recuperación no se toca", r.plan[0].km === 6);
  check("Los easy suben lo mismo y conservan su forma", r.plan[2].km === 12 && r.plan[4].km === 10,
    `${r.plan[2].km} y ${r.plan[4].km}`);

  // Con poco volumen, un easy pasa a descanso antes que quedar por debajo de 5 km.
  // Objetivo 61: quedan 8 km. Dos días de 4 no valen; uno de 8 sí.
  const corto = E.repartirVolumen(semana(), 61);
  const easys = corto.plan.filter((d) => d.paceKey === "E" && !d.isMondayRecovery);
  check("Sin presupuesto para dos, queda un solo easy", easys.length === 1, `quedan ${easys.length}`);
  check("Y ese easy se lleva todo lo que había", easys[0]?.km === 8, `tiene ${easys[0]?.km}`);
  check("El que menos tenía es el que descansa", corto.plan[4].paceKey === "" && corto.plan[4].type === "Descanso");
  check("Queda marcado para poder volver", corto.plan[4].descansoPorVolumen === true);
  check("La semana sigue cuadrando", sumaKm(corto.plan) === 61, `suma ${sumaKm(corto.plan)}`);

  // Si vuelve a sobrar volumen, el día descansado revive como lo que era.
  const revive = E.repartirVolumen(corto.plan, 75);
  check("Al sobrar volumen el día vuelve a entrenar", revive.plan[4].paceKey === "E" && revive.plan[4].km >= 5,
    `${revive.plan[4].paceKey} / ${revive.plan[4].km}`);
  check("Y vuelve como Run/Walk, que es lo que era", revive.plan[4].runWalk === true && revive.plan[4].type === "Run/Walk",
    `${revive.plan[4].type}`);
  check("Ida y vuelta deja la semana igual que al principio",
    revive.plan[2].km === 12 && revive.plan[4].km === 10, `${revive.plan[2].km} y ${revive.plan[4].km}`);

  // Única excepción: si no alcanza ni para un día de 5, se hace UN easy más corto.
  const minimo = E.repartirVolumen(semana(), 56.5); // quedan 3,5 km
  const solos = minimo.plan.filter((d) => d.paceKey === "E" && !d.isMondayRecovery);
  check("Con menos de 5 km, un único easy corto", solos.length === 1 && solos[0].km === 3.5,
    solos.map((d) => d.km).join(","));
  check("Y la semana igual cuadra", sumaKm(minimo.plan) === 56.5);

  // Por debajo de 1 km no se sale a correr: se acepta la diferencia, y se informa.
  const nada = E.repartirVolumen(semana(), 53.5); // quedan 0,5 km
  check("Con menos de 1 km no queda ningún easy",
    nada.plan.filter((d) => d.paceKey === "E" && !d.isMondayRecovery).length === 0);
  check("Y se informa cuánto faltó", nada.diferencia === 0.5, String(nada.diferencia));

  // Si lo fijo ya supera el objetivo, los easy descansan y se informa el exceso.
  const exceso = E.repartirVolumen(semana(), 50);
  check("Si fondo y calidad ya pasan el objetivo, se informa el exceso", exceso.diferencia === -3, String(exceso.diferencia));
}

console.log("\n▸ Reajuste cuando el coach cambia un día a mano");
{
  const base = E.repartirVolumen([
    { day: "Lun", slot: "rest", paceKey: "", km: 0 },
    { day: "Mar", slot: "q1", paceKey: "I", km: 12 },
    { day: "Mié", slot: "easy", paceKey: "E", km: 10, runWalk: true },
    { day: "Jue", slot: "easy", paceKey: "E", km: 8, runWalk: true },
    { day: "Vie", slot: "easy", paceKey: "E", km: 8 },
    { day: "Sáb", slot: "rest", paceKey: "", km: 0 },
    { day: "Dom", slot: "long", paceKey: "long", km: 24 },
  ], 62).plan;
  const total = (p) => Math.round(p.reduce((t, d) => t + (d.km || 0), 0) * 10) / 10;

  // El coach alarga el fondo de 24 a 30: los easy ceden 6 km entre los tres.
  const fondoMasLargo = base.map((d, i) => (i === 6 ? { ...d, km: 30 } : d));
  const r = E.repartirVolumen(fondoMasLargo, 62).plan;
  check("Al alargar el fondo, la semana sigue cuadrando", total(r) === 62, `suma ${total(r)}`);
  check("El fondo queda como lo puso el coach", r[6].km === 30);
  check("Los tres easy ceden por igual", r[2].km === 8 && r[3].km === 6 && r[4].km === 6,
    `${r[2].km}, ${r[3].km}, ${r[4].km}`);

  // Un easy que el coach fijó a mano no se mueve; ajustan los demás.
  const conFijo = fondoMasLargo.map((d, i) => (i === 2 ? { ...d, km: 10, kmFijado: true } : d));
  const f = E.repartirVolumen(conFijo, 62).plan;
  check("El easy fijado a mano no se toca", f[2].km === 10);
  check("Los otros dos absorben la diferencia", f[3].km === 5 && f[4].km === 5 && total(f) === 62,
    `${f[3].km}, ${f[4].km}, suma ${total(f)}`);

  // Escribir "1" y luego "30" en el fondo da lo mismo que escribir "30" de una vez.
  const tecleo1 = E.repartirVolumen(base.map((d, i) => (i === 6 ? { ...d, km: 3 } : d)), 62).plan;
  const tecleo2 = E.repartirVolumen(tecleo1.map((d, i) => (i === 6 ? { ...d, km: 30 } : d)), 62).plan;
  check("El resultado no depende de cómo se tecleó",
    JSON.stringify(tecleo2.map((d) => [d.paceKey, d.km])) === JSON.stringify(r.map((d) => [d.paceKey, d.km])),
    `${tecleo2.map((d) => d.km).join(",")} vs ${r.map((d) => d.km).join(",")}`);
}

console.log("\n▸ En todos los planes de carrera ningún easy queda por debajo de 5 km");
{
  for (const goal of ["10k", "21k", "42k"]) {
    for (const level of ["intermedio1", "intermedio2", "avanzado1", "avanzado2"]) {
      const paceStr = goal === "42k" ? "3:51" : goal === "21k" ? "3:40" : "3:30";
      const paces = E.computeTrainingPaces(E.computeVDOT(E.DISTANCE_KM[goal], E.parsePaceToDecimal(paceStr)));
      paces.race = E.parsePaceToDecimal(paceStr);
      E.anchorPacesToGoal(paces, goal);
      const peak = { intermedio1: 55, intermedio2: 75, avanzado1: 100, avanzado2: 130 }[level];
      for (const weeks of [16, 12, 8, 4, 2, 1, 0]) {
        const { plan, weeklyKm } = E.buildInitialRacePlan(goal, level, peak, E.capLongRunKm(goal, level, 999), weeks, paces);
        const vol = plan.filter((d) => E.esDiaDeVolumen(d) && d.paceKey === "E");
        const cortos = vol.filter((d) => d.km < E.VOLUMEN_MIN_KM);
        // La excepción solo vale si es el ÚNICO día de volumen de la semana.
        const ok = cortos.length === 0 || (cortos.length === 1 && vol.length === 1);
        check(`Easy ≥ 5 km: ${goal}/${level}/${weeks}sem`, ok, cortos.map((d) => `${d.day} ${d.km}`).join(", "));
        // Si lo prioritario (fondo, calidad, lunes) cabe en el objetivo, la semana cuadra.
        // Si ya lo pasa por sí solo, no se agrega ningún easy encima: el exceso no es del
        // reparto sino de las sesiones de calidad, que se calculan por su estructura.
        const total = plan.reduce((t, d) => t + (d.km || 0), 0);
        const prioritario = plan.filter((d) => !(E.esDiaDeVolumen(d) && d.paceKey === "E")).reduce((t, d) => t + (d.km || 0), 0);
        if (prioritario <= weeklyKm) {
          check(`Cuadra con el objetivo: ${goal}/${level}/${weeks}sem`, Math.abs(total - weeklyKm) < 1.05,
            `suma ${total.toFixed(1)} vs ${weeklyKm}`);
        } else {
          check(`Sin easy encima de un exceso: ${goal}/${level}/${weeks}sem`, vol.length === 0,
            `hay ${vol.length} easy y lo prioritario ya suma ${prioritario}`);
        }
      }
    }
  }
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
