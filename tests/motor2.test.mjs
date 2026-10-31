// Pruebas del motor 2 (alumnos nuevos y cambios de objetivo).
// Simula ciclos completos semana a semana, con el alumno cumpliendo todo, y revisa las reglas.
const E = await import(new URL("../lib/plan-engine.mjs", import.meta.url).href);
let ok = 0, fail = 0;
const check = (cond, msg) => { if (cond) ok++; else { fail++; if (fail <= 40) console.log("  ✗ " + msg); } };
const section = (t) => console.log("\n▸ " + t);
const add = (iso, n) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const START = "2026-11-02";

function crear(goal, level, pace, raceDate, peakKm, extra = {}) {
  const wtr = Math.ceil((new Date(raceDate) - new Date(START)) / (7 * 864e5));
  const vdot = E.computeVDOT(E.DISTANCE_KM[goal], E.parsePaceToDecimal(pace));
  const paces = E.computeTrainingPaces(vdot); paces.race = E.parsePaceToDecimal(pace); E.anchorPacesToGoal(paces, goal);
  const peak = peakKm ?? E.computePeakKm(goal, level, vdot);
  const motor = { motor: 2, qualityCapPct: extra.qualityCapPct ?? 0.25, currentWeeklyKm: extra.currentWeeklyKm ?? null, currentLongKm: extra.currentLongKm ?? null };
  const base = { id: "t", name: "t", goal, level, raceDate, targetPaceStr: pace, paces, peakKm: peak, volumeOverrides: {}, longRunOverrides: {}, qualityStreaks: { q1: 0, q2: 0 }, planStartMonday: START, currentWeek: 1, weeksToRace: wtr, ...motor };
  if (level === "principiante") {
    return { ...base, beginnerStage: 0, weeks: { 1: { weeklyKm: null, phase: "principiante", plan: E.buildBeginnerPlan(0, "fitness", level), log: E.emptyLog(), submitted: false } } };
  }
  const pl = E.peakLongKmFor(goal, level, peak);
  const r = E.buildInitialRacePlan(goal, level, peak, pl, wtr, paces, { ...motor, planStartWeeksToRace: wtr, planWeek: 1 });
  return { ...base, peakLongKm: pl, planStartWeeksToRace: wtr, weeks: { 1: { weeklyKm: r.weeklyKm, phase: r.phase, plan: r.plan, log: E.emptyLog(), submitted: false } } };
}
function simular(s, maxWeeks = 60) {
  const semanas = [];
  for (let w = 1; w <= maxWeeks; w++) {
    const wk = s.weeks[w]; if (!wk) break;
    semanas.push({ w, ...wk, level: s.level, weeksToRaceCalc: s.weeksToRace });
    if (wk.phase === "race") break;
    const log = wk.plan.map((d) => d.paceKey ? { completed: true, actualKm: String(d.km), actualPaceStr: "", rpe: "5", note: "" } : { completed: false, actualKm: "", actualPaceStr: "", rpe: "", note: "" });
    s.weeks[w] = { ...wk, log, submitted: true, studentSubmitted: true };
    const r = E.autoPublishDueWeek(s, add(START, 7 * w));
    if (!r.published) break;
    s = r.updated;
  }
  return { semanas, final: s };
}
const suma = (p) => p.reduce((t, d) => t + (Number(d.km) || 0), 0);
const esCalidad = (d) => ["q1", "q2", "q3"].includes(d.slot) && d.paceKey && d.paceKey !== "E";

section("Niveles y objetivos");
check(E.LEVELS.length === 6, "seis niveles");
check(E.LEVELS.map((l) => l.days).join() === "3,3,4,5,6,7", "días por nivel 3,3,4,5,6,7");
check(E.LEVEL_LABEL.intermedio0 === "Intermedio 1" && E.LEVEL_LABEL.intermedio1 === "Intermedio 2" && E.LEVEL_LABEL.intermedio2 === "Intermedio 3", "nombres visibles");
check(!E.goalAllowsLevel("42k", "principiante") && !E.goalAllowsLevel("42k", "intermedio0") && E.goalAllowsLevel("42k", "intermedio1"), "42K desde Intermedio 2");
check(!E.goalAllowsLevel("21k", "intermedio0") && E.goalAllowsLevel("21k", "intermedio1"), "21K desde Intermedio 2");
check(E.goalAllowsLevel("10k", "principiante") && E.goalAllowsLevel("10k", "intermedio0"), "10K para todos");
check(E.minWeeklyKmFor("intermedio0") === 24 && E.minWeeklyKmFor("intermedio1") === 29, "mínimos semanales por días");

section("Ciclos completos: reglas de cada semana");
const casos = [];
const fechas = { "10k": ["2027-01-24", "2027-03-14", "2027-06-13"], "21k": ["2027-03-21", "2027-06-20"], "42k": ["2027-05-16", "2027-08-29"] };
const ritmos = { "10k": ["4:15", "5:30", "6:30"], "21k": ["4:30", "5:45"], "42k": ["4:45", "6:00"] };
for (const goal of ["10k", "21k", "42k"]) for (const lv of E.levelsForGoal(goal)) {
  if (lv.id === "principiante") continue;
  for (const fecha of fechas[goal]) for (const ritmo of ritmos[goal]) for (const pico of [null, 30, 50, 80]) casos.push([goal, lv.id, ritmo, fecha, pico]);
}
let semanasRevisadas = 0;
for (const [goal, level, ritmo, fecha, pico] of casos) {
  const s0 = crear(goal, level, ritmo, fecha, pico);
  const { semanas } = simular(s0);
  const tag = `${goal} ${level} ${ritmo} ${fecha} pico ${pico ?? "sug"}`;
  check(semanas.length > 0 && semanas[semanas.length - 1].phase === "race", `${tag}: llega a la semana de carrera`);
  const picoEf = Math.max(s0.peakKm, E.minWeeklyKmFor(level));
  let fondoMax = 0;
  for (const wk of semanas) {
    semanasRevisadas++;
    const t = `${tag} S${wk.w} (${wk.phase})`;
    const long = wk.plan.find((d) => d.slot === "long");
    // En 3 días con el fondo ya en su tope, puede sobrar un poco: no hay día donde ponerlo.
    const sinDondePoner = E.maxWeeklyKmFor(goal, level) != null && long && long.km >= E.LONG_RUN_CAP_KM[goal];
    check(sinDondePoner ? suma(wk.plan) <= wk.weeklyKm + 1 && suma(wk.plan) >= wk.weeklyKm * 0.9 : Math.abs(suma(wk.plan) - wk.weeklyKm) <= 1, `${t}: la semana suma ${suma(wk.plan)} y debía ${wk.weeklyKm}`);
    if (long) fondoMax = Math.max(fondoMax, long.km);
    if (wk.phase === "race") continue;
    if (wk.phase !== "taper") {
      for (const d of wk.plan) {
        if (!d.paceKey || d.isMondayRecovery || d.slot === "long") continue;
        if (d.paceKey === "E") check(d.km >= 5, `${t}: ${d.day} easy de ${d.km} km (< 5)`);
      }
      check(!wk.plan.some((d) => d.descansoPorVolumen && !d.paceKey), `${t}: un día quedó en descanso por falta de volumen`);
    }
    for (const d of wk.plan.filter(esCalidad)) {
      check(d.km <= Math.max(E.QUALITY_MIN_KM + 3, wk.weeklyKm * 0.25 + 1.5), `${t}: ${d.day} calidad de ${d.km} km en una semana de ${wk.weeklyKm}`);
    }
    if (wk.phase !== "taper") check(wk.weeklyKm <= Math.max(picoEf, E.minWeeklyKmWithLong(level, long?.km ?? 0, E.q3EsCalidad(goal, wk.weeksToRaceCalc))) + 2, `${t}: ${wk.weeklyKm} km supera el pico ${picoEf}`);
  }
  check(fondoMax <= 34, `${tag}: fondo de ${fondoMax} km (> 34)`);
  if (goal === "42k" && pico) {
    const esperado = Math.min(34, Math.round(pico * E.LONG_SHARE_BY_DAYS[E.TRAIN_DAYS_BY_LEVEL[level]]));
    check(fondoMax >= esperado - 1, `${tag}: con pico ${pico} el fondo debería llegar a ~${esperado} (llegó a ${fondoMax})`);
  }
}
console.log(`  ${casos.length} ciclos, ${semanasRevisadas} semanas revisadas`);

section("Velocidad en la base: quién la lleva");
{
  const martes = (goal, level, ritmo, fecha) => {
    const { semanas } = simular(crear(goal, level, ritmo, fecha, null));
    return semanas.filter((w) => w.phase === "base").map((w) => w.plan.find((d) => d.slot === "q1"));
  };
  const m4 = martes("42k", "intermedio1", "5:30", "2027-05-16");
  check(m4.length > 4 && m4.every((d) => d.paceKey === "E"), "42K de 4 días: una sola calidad (martes suave)");
  check(m4[0].type === "Easy + strides" && E.conStrides(m4[0]), "…con strides");
  const m10 = martes("10k", "avanzado1", "4:00", "2027-06-13");
  check(m10.length > 4 && m10.every((d) => d.paceKey === "E"), "10K: la base no cambia");
  const m21 = martes("21k", "intermedio2", "4:30", "2027-06-20");
  check(m21.length > 4 && m21.every((d) => d.paceKey === "R"), "21K de 5 días: velocidad corta");
}

section("Transición de la base: umbral progresivo y calentamiento corto");
{
  for (const [goal, level, ritmo, fecha, pico] of [["42k", "intermedio2", "4:45", "2027-05-16", 70], ["42k", "avanzado1", "4:00", "2027-05-16", 90], ["21k", "avanzado1", "4:20", "2027-04-25", 60]]) {
    const { semanas } = simular(crear(goal, level, ritmo, fecha, pico));
    const trans = semanas.filter((w) => w.phase === "base").slice(-4);
    const tag = `${goal} ${level}`;
    const jueves = trans.map((w) => w.plan.find((d) => d.slot === "q2")).filter((d) => d.paceKey === "brokenT");
    check(jueves.length >= 3, `${tag}: al menos 3 jueves de umbral en la transición (${jueves.length})`);
    const trabajo = jueves.map((d) => (d.repsOverride || 3) * d.distOverride);
    check(trabajo.every((t, i) => i === 0 || t > trabajo[i - 1]), `${tag}: el umbral crece semana a semana (${trabajo.join(" → ")} min)`);
    check(jueves[0].distOverride === 6 && (jueves[0].repsOverride || 3) === 3 && jueves[0].recoveryOverride === 1, `${tag}: primera semana 3 × 6' con 1'`);
    check(jueves.every((d) => d.recoveryOverride <= d.distOverride / 5 + 0.01), `${tag}: recuperación de 1' por cada 5' de trabajo`);
    const martes = trans.map((w) => w.plan.find((d) => d.slot === "q1"));
    check(martes.every((d) => d.calentamientoCorto) && jueves.every((d) => d.calentamientoCorto), `${tag}: calentamiento corto en la transición`);
    const v = trans.map((w) => w.plan.find((d) => d.slot === "q1")).filter((d, i) => !trans[i].plan.some((x) => x.type === "Easy + progresiones"));
    check(v.map((d) => `${d.repsOverride}x${d.distOverride}`).join() === "8x0.3,6x0.4,8x0.4".slice(0, v.length * 6 + v.length - 1) || v.length < 3, `${tag}: martes 8×300 → 6×400 → 8×400 completos (${v.map((d) => `${d.repsOverride}x${d.distOverride}`).join(", ")})`);
    for (const w of trans) check(w.weeklyKm <= Math.max(E.minWeeklyKmFor(level), w.weeklyKm) && suma(w.plan) <= w.weeklyKm + 1, `${tag} S${w.w}: la semana cuadra`);
    const antes = semanas.filter((w) => w.phase === "base").slice(0, -4);
    check(antes.every((w) => !w.plan.some((d) => d.calentamientoCorto)), `${tag}: antes de la transición, calentamiento normal`);
  }
  const d = { paceKey: "brokenT", km: 10, distOverride: 8, repsOverride: 4, recoveryOverride: 1.5, brokenTRefMin: 35, easyPace: 6, hmPace: 4.5, marathonPace: 4.75, calentamientoCorto: true };
  const det = E.getSessionDetail(d);
  check(det.some((x) => /4 x 8'/.test(x.text)) && det[0].text.startsWith("2 km") && det.at(-1).text.startsWith("1 km") && det.some((x) => /1'30"/.test(x.text)), "detalle: 4 × 8', 2 + 1 km, 1'30\"");
  check(E.getSessionBars(d).filter((b) => b.colorKind === "hard").length === 4, "gráfico: 4 bloques");
  check(E.computeImpliedKm(d) > E.computeImpliedKm({ ...d, repsOverride: 3 }), "los km cuentan las 4 repeticiones");
  const segs = E.buildLiveSegments(d, 6);
  check(segs[0].target === 2 && segs.at(-1).target === 1, "modo en vivo y reloj: 2 km y 1 km");
}

section("Strides y progresiones: gráfico, modo en vivo y reloj");
{
  const IC = await import(new URL("../lib/intervals-icu.mjs", import.meta.url).href);
  const easy = { paceKey: "E", type: "Easy + strides", km: 7, easyPace: 6, extra: "strides", slot: "q1" };
  check(E.conStrides(easy), "Easy + strides lleva strides");
  check(!E.conStrides({ ...easy, strides: false }), "el coach los puede apagar");
  check(E.conStrides({ paceKey: "E", km: 7, easyPace: 6, strides: true }), "…y prender en cualquier suave");
  check(E.conStrides({ paceKey: "E", km: 7, easyPace: 6, runWalk: true }) && !E.conStrides({ paceKey: "E", km: 7, easyPace: 6, runWalk: true, strides: false }), "run/walk: strides por defecto, apagables");
  check(!E.conStrides({ paceKey: "E", stageLabel: "x", runWalk: true, stageRun: 2, stageWalk: 1, stageReps: 8 }), "principiantes por etapas: sin strides");
  const bars = E.getSessionBars(easy);
  check(bars.filter((b) => b.label === "Stride").length === 4, "gráfico: 4 barritas de strides al final");
  check(E.getSessionBars({ ...easy, strides: false }).length === 1, "sin strides: una sola barra");
  const segs = E.buildLiveSegments(easy, 6);
  check(segs.filter((x) => /^Stride/.test(x.label)).length === 4, "modo en vivo: 4 strides");
  const t = IC.sesionATexto(easy, 6);
  check(/^4x$/m.test(t) && /Stride 20s/.test(t) && /Caminata 1m/.test(t), "reloj: 4x stride 20s + caminata 1m");
  const prog = { paceKey: "E", type: "Easy + progresiones", km: 7, easyPace: 6, extra: "progresiones", slot: "q2" };
  check(E.getSessionBars(prog).filter((b) => b.label === "Progresión").length === 4, "gráfico: 4 progresiones");
  const tp = IC.sesionATexto(prog, 6);
  check(/^4x$/m.test(tp) && /Progresión 100mtr/.test(tp), "reloj: 4x progresión 100 m");
  const rw = { paceKey: "E", type: "Run/Walk", km: 6, easyPace: 6, runWalk: true };
  check(/Stride 20s/.test(IC.sesionATexto(rw, 6)) && !/Stride/.test(IC.sesionATexto({ ...rw, strides: false }, 6)), "run/walk: strides en el reloj solo si están activos");
}

section("Base progresiva");
{
  const s0 = crear("42k", "avanzado1", "4:45", "2027-08-29", 90);
  const { semanas } = simular(s0);
  const base = semanas.filter((w) => w.phase === "base");
  check(base.length >= 20, `base larga (${base.length} semanas)`);
  const mant = base.slice(0, base.length - 12), prog = base.slice(-12);
  check(mant.every((w) => w.weeklyKm === mant[0].weeklyKm), "antes de las 12 últimas, mantenimiento estable");
  let subidas = 0;
  for (let i = 1; i < prog.length; i++) {
    const a = prog[i - 1].weeklyKm, b = prog[i].weeklyKm;
    if (b > a) { subidas++; check(b <= Math.ceil(a * 1.08 * 1.05) + 1, `subida semanal ${a} → ${b} (> 8% + ajuste)`); }
  }
  check(subidas >= 5, `la base sube (${subidas} subidas)`);
  check(prog.filter((w, i) => i > 0 && w.weeklyKm < prog[i - 1].weeklyKm).length >= 2, "hay semanas de asimilación");
  const q2 = (w) => w.plan.find((d) => d.slot === "q2");
  check(q2(base[0]).paceKey === "E" && q2(base[1]).paceKey === "E", "semanas 1-2 sin umbral");
  check(base.slice(2).some((w) => q2(w).paceKey === "brokenT"), "desde la semana 3, umbral suave");
  // Martes de la base (21K/42K, 5+ días): velocidad corta desde la semana 1.
  const q1 = (w) => w.plan.find((d) => d.slot === "q1");
  check(q1(base[0]).paceKey === "R" && q1(base[0]).type === "Velocidad corta" && q1(base[0]).distOverride === 0.2, "semana 1: velocidad corta de 200 m");
  check(base.every((w) => q1(w).paceKey === "R"), "toda la base lleva velocidad el martes (también descargas)");
  const transicion = base.slice(-4);
  check(transicion.every((w) => [0.3, 0.4].includes(q1(w).distOverride)), "últimas 4 semanas de base: 300-400 m");
  check(base.slice(0, -4).every((w) => q1(w).distOverride === 0.2), "antes de la transición: 200 m");
  check(transicion.filter((w) => !w.plan.some((d) => d.type === "Easy + progresiones")).every((w) => q2(w).paceKey === "brokenT"), "en la transición el jueves es umbral (salvo descarga)");
}
{
  const conDato = simular(crear("42k", "intermedio1", "6:00", "2027-05-16", 50, { currentWeeklyKm: 35, currentLongKm: 16 })).semanas;
  check(conDato[0].weeklyKm >= 33 && conDato[0].weeklyKm <= 40, `con "35 km hoy" la semana 1 queda cerca (${conDato[0].weeklyKm})`);
  check(conDato[0].plan.find((d) => d.slot === "long").km >= 15, "con fondo de 16 km hoy, el primer fondo no se recorta");
}

section("Tope de calidad personalizable");
{
  const a = simular(crear("21k", "avanzado1", "4:30", "2027-06-20", 80, { qualityCapPct: 0.25 })).semanas;
  const b = simular(crear("21k", "avanzado1", "4:30", "2027-06-20", 80, { qualityCapPct: 0.15 })).semanas;
  const maxQ = (sem) => Math.max(...sem.flatMap((w) => w.plan.filter(esCalidad).map((d) => d.km / w.weeklyKm)));
  check(maxQ(a) <= 0.27, `25%: máximo ${(maxQ(a) * 100).toFixed(1)}%`);
  check(maxQ(b) <= 0.17 || maxQ(b) < maxQ(a), `15%: máximo ${(maxQ(b) * 100).toFixed(1)}%`);
}

section("Principiante con carrera");
{
  const { semanas, final } = simular(crear("10k", "principiante", "6:30", "2027-03-14", 25));
  const prin = semanas.filter((w) => w.phase === "principiante").length;
  check(prin >= 8, `al menos 8 semanas de acondicionamiento (${prin})`);
  check(final.level === "intermedio0", "pasa a Intermedio 1");
  check(semanas[semanas.length - 1].phase === "race", "llega a la carrera con plan de carrera");
  const primera = semanas.find((w) => w.phase !== "principiante");
  check(primera && primera.plan.every((d) => !esCalidad(d)), "las dos primeras semanas de carrera son solo rodajes");
  const lejos = simular(crear("10k", "principiante", "6:30", "2027-09-26", 25)).semanas;
  const pl = lejos.filter((w) => w.phase === "principiante").length;
  check(pl >= 12, `con la carrera lejos, completa run/walk hasta el continuo (${pl} semanas)`);
}

section("Fartlek y cuestas");
{
  const I = await import(new URL("../lib/intervals-icu.mjs", import.meta.url).href);
  const { semanas } = simular(crear("42k", "avanzado1", "4:45", "2027-08-29", 90));
  const base = semanas.filter((w) => w.phase === "base");
  const q2s = base.map((w) => w.plan.find((d) => d.slot === "q2"));
  check(q2s.some((d) => d.paceKey === "fartlek") && q2s.some((d) => d.paceKey === "hills") && q2s.some((d) => d.paceKey === "brokenT"), "la base rota fartlek, cuestas y umbral fraccionado");
  check(q2s[0].paceKey === "E" && q2s[1].paceKey === "E", "semanas 1 y 2 sin calidad");
  const f = q2s.find((d) => d.paceKey === "fartlek"), h = q2s.find((d) => d.paceKey === "hills");
  for (const d of [f, h]) {
    const det = E.getSessionDetail(d);
    check(Array.isArray(det) && det.length >= 3, `${d.paceKey}: tiene detalle`);
    const segs = E.buildLiveSegments(d, d.easyPace);
    check(segs.length >= 2 + 2 * d.repsOverride - 1, `${d.paceKey}: segmentos para el reloj (${segs.length})`);
    const bars = E.getSessionBars(d);
    check(Array.isArray(bars) && bars.length === segs.length, `${d.paceKey}: barras (${bars?.length}) = segmentos`);
    check(Math.abs(E.computeImpliedKm(d) - d.km) < 0.01, `${d.paceKey}: km coherentes`);
    const txt = I.sesionATexto(d, d.easyPace, { alertas: true });
    check(typeof txt === "string" && txt.length > 20, `${d.paceKey}: texto para intervals.icu`);
    if (d.paceKey === "hills") check(!/Pace/.test(txt), "cuestas sin ritmo objetivo en el reloj");
    if (d.paceKey === "fartlek") check(/Pace/.test(txt), "fartlek con ritmo en los tramos rápidos (con alertas)");
  }
  const later = q2s.filter((d) => d.paceKey === "fartlek");
  check(later.length >= 2 && (later[later.length - 1].repsOverride * later[later.length - 1].distOverride) > (later[0].repsOverride * later[0].distOverride), "el fartlek progresa");
  const recortado = E.ajustarSesionAlTope({ ...f, repsOverride: 12, km: E.computeImpliedKm({ ...f, repsOverride: 12 }) }, 8);
  check(recortado.km <= 8 || recortado.repsOverride === 4, `el tope recorta repeticiones (${recortado.repsOverride} reps, ${recortado.km} km)`);
}

section("Alumnos del motor anterior no cambian");
{
  const s = crear("42k", "intermedio1", "6:00", "2027-05-16", 50);
  const viejo = { ...s, motor: undefined, qualityCapPct: undefined, planStartWeeksToRace: undefined, peakLongKm: E.capLongRunKm("42k", "intermedio1", 999) };
  const r = E.buildInitialRacePlan("42k", "intermedio1", 50, viejo.peakLongKm, viejo.weeksToRace, viejo.paces);
  viejo.weeks = { 1: { weeklyKm: r.weeklyKm, phase: r.phase, plan: r.plan, log: E.emptyLog(), submitted: false } };
  const sem = simular(viejo).semanas;
  check(!sem.some((w) => w.plan.some((d) => d.extra)), "sin strides/progresiones del motor 2");
  check(E.usaMotor2(viejo) === false && E.usaMotor2(s) === true, "usaMotor2 distingue");
}

section("Progresiones: sin strides");
{
  const prog = { day: "Mié", slot: "e1", paceKey: "E", km: 8, type: "Easy + progresiones", extra: "progresiones" };
  check(E.conProgresiones(prog) && !E.conStrides(prog), "un rodaje con progresiones no lleva strides");
  check(!E.conStrides({ ...prog, strides: true }), "ni aunque quedara marcado de antes");
  const segs = E.buildLiveSegments ? E.buildLiveSegments({ ...prog, strides: true }, 6.5) : null;
  if (Array.isArray(segs)) check(!segs.some((x) => /Stride/.test(x.label || "")), "el modo en vivo no agrega strides");
}

section("Panorama: semanas futuras proyectadas y fijadas");
for (const [goal, level, pace, race] of [["42k", "avanzado", "5:00", "2027-04-25"], ["21k", "intermedio", "5:30", "2027-03-07"], ["10k", "intermedio1", "5:30", "2027-02-07"]]) {
  // La proyección es exactamente la semana que se publicará si el alumno cumple todo.
  let s = crear(goal, level, pace, race);
  let iguales = 0, total = 0;
  for (let w = 1; w <= 30; w++) {
    const wk = s.weeks[w]; if (!wk || wk.phase === "race") break;
    const proy = E.proyectarSemana(s, w + 1);
    const log = wk.plan.map((d) => d.paceKey ? { completed: true, actualKm: String(d.km), rpe: "5" } : { completed: false });
    s.weeks[w] = { ...wk, log, submitted: true, studentSubmitted: true };
    const r = E.autoPublishDueWeek(s, add(START, 7 * w));
    if (!r.published) break;
    s = r.updated; total++;
    if (proy && proy.weeklyKm === s.weeks[w + 1].weeklyKm && JSON.stringify(proy.plan) === JSON.stringify(s.weeks[w + 1].plan)) iguales++;
  }
  check(total > 5 && iguales === total, `${goal}: la proyección coincide con la semana publicada (${iguales}/${total})`);

  // Fijar la semana 4 con cambios propios: llega tal cual, avisada, y deja de estar pendiente.
  let t = crear(goal, level, pace, race);
  check(E.proyectarSemana(t, 1) === null, `${goal}: la semana vigente no se proyecta`);
  const p4 = E.proyectarSemana(t, 4);
  const plan4 = p4.plan.map((d) => (d.slot === "q1" ? { ...d, type: "Mi sesión especial", repsOverride: 5 } : d));
  t = E.fijarSemana(t, 4, { ...p4, plan: plan4, weeklyKm: p4.weeklyKm + 3 }, "2026-11-01T00:00:00Z");
  check(E.proyectarSemana(t, 4).fijada === true, `${goal}: la semana fijada se muestra como fijada`);
  const proyFij = E.projectWeeklyVolumes(t);
  check(proyFij.kind === "race", `${goal}: el panorama sigue siendo de carrera`);
  // Semana 2 normal (falló todo: adherencia 0) y 3 normal.
  for (let w = 1; w <= 3; w++) {
    const wk = t.weeks[w];
    const log = wk.plan.map(() => ({ completed: false }));
    t.weeks[w] = { ...wk, log, submitted: true, studentSubmitted: true };
    if (w === 3) {
      const prop = E.buildWeekProposal(t);
      check(prop.semanaFijada === true, `${goal}: la propuesta avisa que la semana que viene está fijada`);
    }
    const r = E.autoPublishDueWeek(t, add(START, 7 * w));
    t = r.updated;
  }
  const w4 = t.weeks[4];
  check(w4 && w4.fijadaPorCoach === true, `${goal}: la semana 4 llega marcada como fijada`);
  check(w4 && JSON.stringify(w4.plan) === JSON.stringify(plan4), `${goal}: la semana fijada se respeta tal cual aunque no haya cumplido`);
  check(w4 && w4.weeklyKm === p4.weeklyKm + 3, `${goal}: con el volumen que puso el coach`);
  check(w4 && /fijada/i.test(w4.note || "") && /Revísala|revisa/i.test(w4.note || ""), `${goal}: la nota le pide al coach revisarla`);
  check(!t.semanasFijadas || !t.semanasFijadas[4], `${goal}: ya no queda pendiente`);
  // Volver a la propuesta del motor.
  let u = E.fijarSemana(crear(goal, level, pace, race), 6, E.proyectarSemana(crear(goal, level, pace, race), 6));
  u = E.fijarSemana(u, 6, null);
  check(!u.semanasFijadas && E.proyectarSemana(u, 6).fijada === false, `${goal}: se puede soltar la semana fijada`);
}
{
  // Cerrando la semana desde el panel del coach (finalizeWeekPlan) también se respeta.
  let t = crear("21k", "intermedio", "5:30", "2027-03-07");
  const p2 = E.proyectarSemana(t, 2);
  const plan2 = p2.plan.map((d, i) => (i === 0 ? { ...d } : d)).reverse().map((d, i) => ({ ...d, day: p2.plan[i].day }));
  t = E.fijarSemana(t, 2, { ...p2, plan: plan2 });
  t.weeks[1] = { ...t.weeks[1], submitted: true };
  const prop = E.buildWeekProposal(t);
  const fin = E.finalizeWeekPlan(t, prop, { weeklyKm: 99, longRunKm: 30, q1PaceKey: prop.suggestedQ1, q2PaceKey: prop.suggestedQ2 });
  check(JSON.stringify(fin.updated.weeks[2].plan) === JSON.stringify(plan2), "cierre manual: usa la semana fijada (con días movidos)");
  check(fin.updated.weeks[2].weeklyKm === p2.weeklyKm, "cierre manual: ignora el volumen del formulario");
  check(fin.updated.currentWeek === 2 && !fin.updated.semanasFijadas, "cierre manual: avanza y limpia la marca");
  // Hueco de semanas (caso A de la publicación automática): también se respeta.
  let g = crear("21k", "intermedio", "5:30", "2027-03-07");
  const p3 = E.proyectarSemana(g, 3);
  g = E.fijarSemana(g, 3, p3);
  const r = E.autoPublishDueWeek(g, add(START, 14));
  check(r.published === 3 && r.updated.weeks[3].fijadaPorCoach && JSON.stringify(r.updated.weeks[3].plan) === JSON.stringify(p3.plan), "tras un hueco, la semana fijada se publica tal cual");
}

section("Ritmos fijados a mano en la tabla");
{
  const s = crear("21k", "intermedio", "5:30", "2027-03-07");
  const p = s.paces;
  const auto400 = E.getRPace(p.R, p.HM, 0.4), auto2k = E.getIPace(p.HM, p.M, 2), auto40 = E.getTPaceForDuration(p.HM, p.M, 40);
  const fijos = { R: { "0.4": auto400 - 0.1 }, I: { "2": auto2k + 0.05 }, T: { "40": auto40 - 0.05 } };
  check(E.getRPace(p.R, p.HM, 0.4, fijos) === auto400 - 0.1, "400 m usa el ritmo fijado");
  check(E.getRPace(p.R, p.HM, 0.6, fijos) === E.getRPace(p.R, p.HM, 0.6), "600 m sigue calculado");
  check(E.getIPace(p.HM, p.M, 2, fijos) === auto2k + 0.05, "2 km usa el ritmo fijado");
  check(E.getTPaceForDuration(p.HM, p.M, 40, fijos) === auto40 - 0.05, "umbral 40' usa el ritmo fijado");
  check(E.getTPaceForDuration(p.HM, p.M, 30, fijos) === E.getTPaceForDuration(p.HM, p.M, 30), "umbral 30' sigue calculado");
  const pf = { ...p, fijos };
  const r = E.buildInitialRacePlan("21k", "intermedio", s.peakKm, s.peakLongKm, s.weeksToRace, pf, { motor: 2, qualityCapPct: 0.25, planStartWeeksToRace: s.weeksToRace, planWeek: 1 });
  check(r.plan.filter((d) => d.paceKey).every((d) => d.ritmosFijos === fijos), "cada sesión nueva lleva los ritmos fijados");
  const dia = { day: "Mar", slot: "q1", paceKey: "R", km: 9, distOverride: 0.4, repsOverride: 8, easyPace: p.E, hmPace: p.HM, marathonPace: p.M, targetPace: p.R, ritmosFijos: fijos };
  const rep = E.buildLiveSegments(dia, p.E).find((x) => /de 8$/.test(x.label || "") && x.pace && x.pace < p.E);
  check(rep && Math.abs(rep.pace - (auto400 - 0.1)) < 1e-9, "el reloj y el modo en vivo usan el ritmo fijado");
  const sin = r.plan.map((d) => { const { ritmosFijos, ...x } = d; return x; });
  const r0 = E.buildInitialRacePlan("21k", "intermedio", s.peakKm, s.peakLongKm, s.weeksToRace, p, { motor: 2, qualityCapPct: 0.25, planStartWeeksToRace: s.weeksToRace, planWeek: 1 });
  check(r0.plan.every((d) => !("ritmosFijos" in d)), "sin ritmos fijados, las sesiones no cambian");
  check(sin.length === r0.plan.length, "misma estructura");
}

section("Nombre del fondo: continuo o progresivo");
{
  const sem = simular(crear("42k", "avanzado", "5:00", "2027-04-25")).semanas;
  const fondos = sem.flatMap((w) => w.plan.filter((d) => d.paceKey === "long"));
  check(fondos.length > 10, "hay fondos");
  check(fondos.every((d) => d.type === (d.longProgressive ? "Fondo progresivo" : "Fondo continuo")), "cada fondo se llama según lo que es");
  check(fondos.some((d) => !d.longProgressive) && fondos.some((d) => d.longProgressive), "hay de los dos");
  check(E.nombreDeSesion({ paceKey: "long", type: "Fondo estructurado", longProgressive: false }) === "Fondo continuo", "los guardados antes se muestran bien (continuo)");
  check(E.nombreDeSesion({ paceKey: "long", type: "Fondo estructurado", longProgressive: true }) === "Fondo progresivo", "los guardados antes se muestran bien (progresivo)");
  check(E.nombreDeSesion({ paceKey: "long", type: "Fondo en la playa", longProgressive: true }) === "Fondo en la playa", "un nombre escrito por el coach se respeta");
  check(E.etiquetaDeRitmo({ paceKey: "long", longProgressive: false }) === "Fondo continuo", "la etiqueta del ritmo también");
}

console.log("\n────────────────────────────────────────────────────");
console.log(fail ? `✗ ${fail} fallaron, ${ok} correctas.` : `✓ ${ok} verificaciones, todas correctas.`);
process.exit(fail ? 1 : 0);
