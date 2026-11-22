// Pruebas de Garmin directo (lib/garmin.mjs): entrenamientos, actividades, salud y avisos.
//
// Cómo correrlas:  npm test

import * as G from "../lib/garmin.mjs";
import * as E from "../lib/plan-engine.mjs";
import { resumenDeActividad, kmPorKm, pasoAPaso, leerVueltasEscritas, corregirConVueltas } from "../lib/intervals-read.mjs";

let passed = 0, failed = 0;
const failures = [];
function check(name, condition, detail) {
  if (condition) passed++;
  else { failed++; failures.push(`${name}${detail ? ` — ${detail}` : ""}`); }
}

const easy = E.parsePaceToDecimal("6:23");
const series = { paceKey: "custom", type: "Calidad", km: 11, easyPace: easy, customBlocks: [{ reps: 5, distKm: 1.2, paceStr: "4:55", recoveryMin: 2 }] };
const fondo = { paceKey: "long", km: 16, easyPace: easy };

console.log("\n▸ El entrenamiento de Garmin");
{
  const w = G.sesionAWorkout(series, easy);
  check("Se arma", !!w);
  check("Es de carrera, un solo segmento", w.sport === "RUNNING" && w.segments.length === 1 && w.segments[0].sport === "RUNNING");
  check("Proveedor TROTAMUNDOS (≤ 20)", w.workoutProvider === "TROTAMUNDOS" && w.workoutSourceId.length <= 20);
  const st = w.segments[0].steps;
  check("Calentamiento, bloque repetido y enfriamiento", st.length === 3, st.length);
  check("Calentamiento: 2 km con su tipo", st[0].intensity === "WARMUP" && st[0].durationType === "DISTANCE" && st[0].durationValue === 2000 && st[0].durationValueType === "METER");
  const rep = st[1];
  check("Repetir 5 veces", rep.type === "WorkoutRepeatStep" && rep.repeatType === "REPEAT_UNTIL_STEPS_CMPLT" && rep.repeatValue === 5);
  check("Serie de 1,2 km tipo intervalo", rep.steps[0].intensity === "INTERVAL" && rep.steps[0].durationValue === 1200);
  check("Recuperación de 2' tipo recuperación", rep.steps[1].intensity === "RECOVERY" && rep.steps[1].durationType === "TIME" && rep.steps[1].durationValue === 120);
  check("Enfriamiento con su tipo", st[2].intensity === "COOLDOWN");
  check("Orden correlativo (como el ejemplo de Garmin)", st[0].stepOrder === 1 && rep.stepOrder === 2 && rep.steps[0].stepOrder === 3 && rep.steps[1].stepOrder === 4 && st[2].stepOrder === 5);
  check("Sin alertas: sin ritmo objetivo", [st[0], ...rep.steps, st[2]].every((s) => s.targetType === "OPEN" && s.targetValueLow == null));
  check("Sin alertas: el ritmo va en la descripción", /ritmo 4'55/.test(rep.steps[0].description), rep.steps[0].description);

  const wa = G.sesionAWorkout(series, easy, { alertas: true });
  const s = wa.segments[0].steps[1].steps[0];
  check("Con alertas: la serie lleva PACE", s.targetType === "PACE");
  // 4:55 ± 5 s → 5:00 (3.3333 m/s) a 4:50 (3.4483 m/s)
  check("Rango de velocidad correcto", Math.abs(s.targetValueLow - 3.3333) < 0.001 && Math.abs(s.targetValueHigh - 3.4483) < 0.001, `${s.targetValueLow}-${s.targetValueHigh}`);
  check("La recuperación no lleva objetivo", wa.segments[0].steps[1].steps[1].targetType === "OPEN");

  const wl = G.sesionAWorkout(series, easy, { libre: true });
  const cal = wl.segments[0].steps[0];
  check("Calentamiento libre: termina con LAP (OPEN)", cal.durationType === "OPEN" && cal.durationValue == null);
  check("Y se lo recuerda en la descripción", /presiona LAP/.test(cal.description), cal.description);
  check("Las series siguen por distancia", wl.segments[0].steps[1].steps[0].durationType === "DISTANCE");

  const wf = G.sesionAWorkout(fondo, easy);
  check("Un fondo llega como calentamiento + bloque + enfriamiento (16 km)", wf && wf.segments[0].steps.map((x) => x.intensity).join() === "WARMUP,ACTIVE,COOLDOWN" && wf.segments[0].steps.reduce((a, x) => a + x.durationValue, 0) === 16000, JSON.stringify(wf?.segments[0].steps.map((x) => x.durationValue)));
  check("Un descanso no se manda", G.sesionAWorkout({ paceKey: "", km: 0 }, easy) === null);
  check("Nombre de la sesión", /Calidad · 11 km/.test(w.workoutName), w.workoutName);
}

console.log("\n▸ Todos los tipos de calidad llegan con su estructura");
{
  const P = E.computeTrainingPaces(45);
  const base = { km: 12.5, type: "Calidad", easyPace: P.E, hmPace: P.HM, marathonPace: P.M, targetPace: P.T };
  // Intervalos 1k + 500: antes llegaba al reloj como un solo bloque de 12 km.
  const c = G.sesionAWorkout({ ...base, paceKey: "combo1k500" }, P.E, { alertas: true }).segments[0].steps;
  check("1k + 500: calentamiento, 3 rondas y enfriamiento", c.length === 3 && c[0].intensity === "WARMUP" && c[2].intensity === "COOLDOWN", c.length);
  check("1k + 500: la ronda se repite 3 veces con 4 pasos", c[1].type === "WorkoutRepeatStep" && c[1].repeatValue === 3 && c[1].steps.length === 4);
  check("1k + 500: 1 km, 1', 500 m y 4'", c[1].steps.map((x) => x.durationValue).join() === "1000,60,500,240", c[1].steps.map((x) => x.durationValue).join());
  check("1k + 500: intervalos con ritmo, recuperaciones sin", c[1].steps.map((x) => `${x.intensity}:${x.targetType}`).join() === "INTERVAL:PACE,RECOVERY:OPEN,INTERVAL:PACE,RECOVERY:OPEN");
  // Pre-carga (series largas): también llegaba como un solo bloque.
  const b = G.sesionAWorkout({ ...base, paceKey: "broken" }, P.E, { alertas: true }).segments[0].steps;
  check("Pre-carga: series repetidas con 3' de trote", b.length === 3 && b[1].type === "WorkoutRepeatStep" && b[1].repeatValue >= 2 && b[1].steps[0].targetType === "PACE" && b[1].steps[1].durationValue === 180, JSON.stringify(b.map((x) => x.repeatValue || x.durationValue)));
  // Pirámide (bloques de 1 repetición): pasos sueltos, sin "repetir 1 vez".
  const pir = G.sesionAWorkout({ ...base, paceKey: "custom", customBlocks: [{ reps: 1, distKm: 1, paceStr: "4:20", recoveryMin: 2 }, { reps: 1, distKm: 0.8, paceStr: "4:15", recoveryMin: 2 }, { reps: 1, distKm: 0.6, paceStr: "4:10", recoveryMin: 2 }] }, P.E, { alertas: true }).segments[0].steps;
  check("Pirámide: 7 pasos sueltos", pir.length === 7 && pir.every((x) => x.type === "WorkoutStep") && pir.map((x) => x.durationValue).join() === "2000,1000,120,800,120,600,2000", pir.map((x) => x.durationValue).join());
  // Ningún tipo de calidad debe quedar como un solo paso.
  for (const k of ["I", "R", "T", "brokenT", "fartlek", "hills", "combo1k500", "broken"]) {
    const w = G.sesionAWorkout({ ...base, paceKey: k }, P.E, { alertas: true });
    check(`${k}: más de un paso`, w && w.segments[0].steps.length > 1, k);
  }
}

console.log("\n▸ Paso a paso de una sesión hecha desde el reloj (4 x 1 km, 3' de recuperación)");
{
  const P = E.computeTrainingPaces(45);
  const day = { paceKey: "I", km: 11, repsOverride: 4, type: "Intervalos", easyPace: 6.27, hmPace: P.HM, marathonPace: P.M, targetPace: P.T };
  // Lo que corrió (como en Garmin Connect): calentamiento 3 km a 5:53, 4 x (1 km ~4:25 +
  // 3' a 5:35) y enfriamiento 2 km a 5:18. La primera repetición tiene un bajón de 15" y el
  // enfriamiento un tirón de 48".
  const tramos = [[3000, 5 + 53 / 60, true]];
  for (let r = 0; r < 4; r++) {
    if (r === 0) tramos.push([280, 4 + 22 / 60, true], [50, 5.25, false], [670, 4 + 31 / 60, false]);
    else tramos.push([1000, 4 + 25 / 60, true]);
    tramos.push([540, 3 / 0.54, true]);
  }
  tramos.push([1000, 5.3, true], [160, 5.1, false], [840, 5.3, false]);
  const inicio = 1795000000, samples = [], laps = [];
  let t = 0, d = 0;
  for (const [metros, ritmo, nuevaVuelta] of tramos) {
    if (nuevaVuelta) laps.push({ startTimeInSeconds: inicio + t });
    const vel = 1000 / (ritmo * 60);
    const fin = d + metros;
    while (d < fin - 1e-6) {
      t += 1; d = Math.min(fin, d + vel);
      // Garmin no pone la distancia en todas las muestras (acá, una de cada 7 va sin ella).
      samples.push({ startTimeInSeconds: inicio + t, ...(t % 7 ? { totalDistanceInMeters: d } : {}), timerDurationInSeconds: t, clockDurationInSeconds: t, movingDurationInSeconds: t, speedMetersPerSecond: vel, heartRate: 150 });
    }
  }
  // Las vueltas del calentamiento/repeticiones agrupan los tramos en los pasos del reloj.
  const lapsReloj = [laps[0], laps[1], laps[2], laps[3], laps[4], laps[5], laps[6], laps[7], laps[8], laps[9]];
  const det = { activityId: 999, summary: { activityType: "RUNNING", startTimeInSeconds: inicio, startTimeOffsetInSeconds: -18000, durationInSeconds: t, distanceInMeters: d }, samples, laps: lapsReloj };
  const c = G.actividadDesdeGarmin(det);
  check("Vueltas con km aunque falte la distancia en algunas muestras", c.vueltas.length === 10 && c.vueltas.every((v) => v.distance > 0), JSON.stringify(c.vueltas.map((v) => v.distance)));
  const res = resumenDeActividad(c.actividad, c.vueltas, kmPorKm(c.streams));
  const pa = pasoAPaso({ vueltas: res.vueltas, streams: c.streams }, day, 6.27);
  check("Paso a paso por las vueltas del reloj", pa?.origen === "vueltas" && pa.coincide && pa.pasos.length === 10, JSON.stringify(pa && [pa.origen, pa.pasos.map((x) => x.nombre)]));
  // Sin vueltas (un reloj sin entrenamiento cargado): por el ritmo, la repetición partida se
  // une y el tirón del enfriamiento no cuenta como repetición.
  const pa2 = pasoAPaso({ vueltas: [], streams: c.streams }, day, 6.27);
  const reps = pa2?.pasos.filter((x) => x.trabajo) || [];
  check("Por ritmo: 4 repeticiones de ~1 km", pa2?.coincide && reps.length === 4 && reps.every((x) => x.km >= 0.9 && x.km <= 1.1), JSON.stringify(pa2 && pa2.pasos.map((x) => [x.nombre, x.km])));
}

console.log("\n▸ El coach corrige las vueltas de una sesión ya leída");
{
  const P = E.computeTrainingPaces(45);
  const day = { paceKey: "I", km: 11, repsOverride: 4, type: "Intervalos", easyPace: 6.27, hmPace: P.HM, marathonPace: P.M, targetPace: P.T };
  const s = (m, ss) => m * 60 + ss;
  // La lectura que había quedado mal (por ritmo): 6 tramos rápidos, con su pulso.
  const viejos = [[3.01, s(17, 44), 133], [0.28, s(1, 14), 158], [0.05, 15, 175], [0.65, s(2, 56), 174], [0.49, s(2, 50), 154], [1.02, s(4, 35), 167], [0.55, s(3, 4), 156], [1.02, s(4, 29), 171], [0.53, s(2, 56), 158], [1.01, s(4, 18), 174], [1.38, s(7, 18), 158], [0.16, 48, 161], [1.02, s(5, 32), 157]]
    .map(([km, seg, fc]) => ({ km, seg, segTotal: seg, fc }));
  const reloj = { km: 11.17, min: 58, fcMedia: 154, pasos: { origen: "series", coincide: false, pasos: viejos } };
  const texto = "17:40.6 3.00\n4:31.4 1.00\n3:00.0 0.53\n4:31,6 1,00\n3:00.0 0.54\n4:22.5 1.00\n3:00.0 0.55\n4:15.4 1.00\n3:00.0 0.55\n10:37.5 2.00\n";
  const { vueltas, malas } = leerVueltasEscritas(texto);
  check("Lee las vueltas escritas (punto o coma)", malas.length === 0 && vueltas.length === 10 && vueltas[3].seg === 271.6 && vueltas[3].km === 1);
  check("Avisa las líneas que no entiende", leerVueltasEscritas("4:31 1\nhola\n3:00").malas.join() === "2,3");
  const r = corregirConVueltas(reloj, vueltas, day, 6.27);
  check("Rehace el paso a paso por vueltas", r.ok && r.reloj.pasos.origen === "vueltas" && r.reloj.pasos.coincide && r.reloj.pasos.pasos.length === 10, JSON.stringify(r).slice(0, 200));
  const rep = r.reloj?.pasos.pasos.filter((x) => x.trabajo) || [];
  check("Repeticiones con su ritmo y el pulso de lo que ya había llegado", rep.map((x) => x.ritmo).join() === "4:31,4:32,4:23,4:15" && rep.every((x) => x.fc >= 160 && x.fc <= 176), JSON.stringify(rep));
  check("Queda marcada como corregida y conserva lo demás", !!r.reloj.corregido && r.reloj.fcMedia === 154 && r.reloj.km === 11.17);
  check("No acepta vueltas que no suman la salida", !corregirConVueltas(reloj, vueltas.slice(0, 9), day, 6.27).ok);
  check("No acepta vueltas que no calzan con el plan", !corregirConVueltas(reloj, [{ seg: 1800, km: 5.5 }, { seg: 1680, km: 5.67 }], day, 6.27).ok);
}

console.log("\n▸ La semana y qué mandar");
{
  const student = {
    id: "ana", planStartMonday: "2026-11-09", paces: { E: easy },
    weeks: { 1: { plan: [series, { paceKey: "" }, { paceKey: "E", km: 8, easyPace: easy }, { paceKey: "" }, { paceKey: "" }, fondo, { paceKey: "" }] } },
  };
  const ws = G.semanaAWorkouts(student, 1);
  check("Tres sesiones", ws.length === 3, ws.length);
  check("Con sus fechas", ws[0].fecha === "2026-11-09" && ws[2].fecha === "2026-11-14", ws.map((w) => w.fecha).join(","));
  check("Con firma", ws.every((w) => typeof w.firma === "string" && w.firma.length > 3));
  check("La firma cambia si cambia la sesión", G.semanaAWorkouts({ ...student, weeks: { 1: { plan: [{ ...series, km: 12 }, ...student.weeks[1].plan.slice(1)] } } }, 1)[0].firma !== ws[0].firma);

  const nada = G.planDeEnvio(ws, {}, "2026-11-09");
  check("Primera vez: crear las tres", nada.crear.length === 3 && nada.borrar.length === 0);
  const enviados = Object.fromEntries(ws.map((w) => [String(w.dia), { workoutId: 10 + w.dia, scheduleId: 20 + w.dia, firma: w.firma, fecha: w.fecha }]));
  const igual = G.planDeEnvio(ws, enviados, "2026-11-09");
  check("Sin cambios: nada que hacer", igual.crear.length === 0 && igual.borrar.length === 0 && igual.igual.length === 3);
  const cambiado = ws.map((w) => (w.dia === 2 ? { ...w, firma: "otra" } : w));
  const p = G.planDeEnvio(cambiado, enviados, "2026-11-09");
  check("Una sesión cambia: se borra la vieja y se crea la nueva", p.crear.length === 1 && p.borrar.length === 1 && p.borrar[0].workoutId === 12);
  const sinDia = G.planDeEnvio(ws.filter((w) => w.dia !== 5), enviados, "2026-11-09");
  check("Un día pasa a descanso: se borra", sinDia.borrar.length === 1 && sinDia.borrar[0].dia === 5 && sinDia.crear.length === 0);
  const tarde = G.planDeEnvio(cambiado.map((w) => ({ ...w, firma: "x" })), enviados, "2026-11-12");
  check("Lo pasado no se toca", !tarde.crear.some((w) => w.fecha < "2026-11-12") && !tarde.borrar.some((b) => b.fecha < "2026-11-12"));
}

console.log("\n▸ Actividades de Garmin");
{
  // 2 km a 6:00, 4 x (1 km a 4:30 + 400 m a 6:30) sin la última recuperación, 1 km a 6:10.
  const inicio = 1762772400; // 2025-11-10T11:00:00Z
  const tramos = [[2000, 6.0, 135], ...[1, 2, 3, 4].flatMap((n) => [[1000, 4.5, 168], ...(n < 4 ? [[400, 6.5, 145]] : [])]), [1000, 6.1667, 138]];
  const samples = [], laps = [];
  let t = 0, d = 0;
  for (const [m, ritmo, fc] of tramos) {
    laps.push({ startTimeInSeconds: inicio + t });
    const v = 1000 / (ritmo * 60);
    const segs = Math.round(m / v);
    for (let k = 0; k < segs; k++) {
      t++; d += v;
      samples.push({ startTimeInSeconds: inicio + t, totalDistanceInMeters: d, speedMetersPerSecond: v, heartRate: fc, timerDurationInSeconds: t, clockDurationInSeconds: t, movingDurationInSeconds: t });
    }
  }
  const detalle = {
    userId: "u1", summaryId: "999-detail", activityId: 999,
    summary: { activityType: "RUNNING", activityName: "Lima Running", deviceName: "Forerunner 265", startTimeInSeconds: inicio, startTimeOffsetInSeconds: -18000,
      durationInSeconds: t, distanceInMeters: d, averageHeartRateInBeatsPerMinute: 155, maxHeartRateInBeatsPerMinute: 172, averageRunCadenceInStepsPerMinute: 86, activeKilocalories: 640 },
    samples, laps,
  };
  const r = G.actividadDesdeGarmin(detalle);
  check("Carrera", r.actividad.type === "Run");
  check("Id de la actividad", r.actividad.id === "999");
  check("Hora local del reloj (Lima)", r.actividad.start_date_local === "2025-11-10T06:00:00", r.actividad.start_date_local);
  check("Atribución 'Garmin [modelo]'", r.actividad.device_name === "Garmin Forerunner 265", r.actividad.device_name);
  check("Una vuelta por paso", r.vueltas.length === tramos.length, r.vueltas.length);
  check("Vuelta de la serie: 1 km en 4:30", Math.abs(r.vueltas[1].distance - 1000) < 3 && Math.abs(r.vueltas[1].moving_time - 270) <= 1, JSON.stringify(r.vueltas[1]));
  const res = resumenDeActividad(r.actividad, r.vueltas, kmPorKm(r.streams));
  check("Resumen: 8,2 km", res.km === 8.2, res.km);
  check("Resumen: serie a 4:30", res.vueltas[1].ritmo === "4:30", res.vueltas[1].ritmo);
  check("Resumen: km por km", res.kms?.length === 9, res.kms?.length);
  const dia = { paceKey: "custom", type: "Calidad", km: 8.2, easyPace: E.parsePaceToDecimal("6:00"), customBlocks: [{ reps: 4, distKm: 1, paceStr: "4:30", recoveryMin: 2.6 }] };
  const pa = pasoAPaso({ vueltas: res.vueltas, streams: r.streams }, dia, dia.easyPace);
  check("Paso a paso sale", !!pa && pa.pasos.length > 0, JSON.stringify(pa)?.slice(0, 200));

  check("Atribución cuando ya dice Garmin", G.atribucionGarmin("Garmin fenix 8") === "Garmin fenix 8");
  check("Atribución sin modelo", G.atribucionGarmin("unknown") === "Garmin" && G.atribucionGarmin(null) === "Garmin");
  check("Es carrera: trail y cinta también", G.esCarrera("TRAIL_RUNNING") && G.esCarrera("TREADMILL_RUNNING") && !G.esCarrera("CYCLING"));
}

console.log("\n▸ Salud de Garmin");
{
  const d = G.saludDesdeGarmin("dailies", { calendarDate: "2026-11-10", restingHeartRateInBeatsPerMinute: 48, averageStressLevel: 25, steps: 12034, activeKilocalories: 600, bmrKilocalories: 1500, moderateIntensityDurationInSeconds: 1200, vigorousIntensityDurationInSeconds: 600 });
  check("Diario", d.fecha === "2026-11-10" && d.datos.fcReposo === 48 && d.datos.estres === 25 && d.datos.pasos === 12034 && d.datos.calorias === 2100 && d.datos.minutosIntensidad === 30, JSON.stringify(d));
  check("Estrés negativo = sin medir", G.saludDesdeGarmin("dailies", { calendarDate: "2026-11-10", averageStressLevel: -1 }) === null);
  const s = G.saludDesdeGarmin("sleeps", { calendarDate: "2026-11-10", deepSleepDurationInSeconds: 5400, lightSleepDurationInSeconds: 14400, remSleepInSeconds: 6000, awakeDurationInSeconds: 1200, overallSleepScore: { value: 87, qualifierKey: "GOOD" } });
  check("Sueño", s.datos.sueñoMin === 430 && s.datos.sueñoProfundoMin === 90 && s.datos.sueñoPuntaje === 87 && s.datos.despiertoMin === 20, JSON.stringify(s.datos));
  check("VFC", G.saludDesdeGarmin("hrv", { calendarDate: "2026-11-10", lastNightAvg: 44 }).datos.vfc === 44);
  check("Body Battery", JSON.stringify(G.saludDesdeGarmin("stressDetails", { calendarDate: "2026-11-10", timeOffsetBodyBatteryValues: { 0: 55, 180: 80, 360: 32 } }).datos) === '{"energiaMax":80,"energiaMin":32}');
  check("VO2máx", G.saludDesdeGarmin("userMetrics", { calendarDate: "2026-11-10", vo2Max: 52 }).datos.vo2max === 52);
  check("SpO2 promedio", G.saludDesdeGarmin("pulseox", { calendarDate: "2026-11-10", timeOffsetSpo2Values: { 0: 96, 60: 98 } }).datos.spo2 === 97);
  const resp = G.saludDesdeGarmin("allDayRespiration", { startTimeInSeconds: 1762772400, startTimeOffsetInSeconds: -18000, timeOffsetEpochToBreaths: { 0: 14, 60: 16 } });
  check("Respiración, con la fecha local", resp.fecha === "2025-11-10" && resp.datos.respiracion === 15, JSON.stringify(resp));
  check("Peso", G.saludDesdeGarmin("bodyComps", { measurementTimeInSeconds: 1762772400, measurementTimeOffsetInSeconds: 0, weightInGrams: 64500, bodyFatInPercent: 18 }).datos.pesoKg === 64.5);
  check("Tipo desconocido", G.saludDesdeGarmin("epochs", { calendarDate: "2026-11-10", steps: 3 }) === null);
}

console.log("\n▸ Avisos (push)");
{
  const n = G.notificaciones({ activityDetails: [{ userId: "u1", summaryId: "a" }], dailies: [{ userId: "u1" }, { userId: "u2" }, { sinUsuario: 1 }], deregistrations: [{ userId: "u3" }], basura: "x" });
  check("Se separan por tipo y usuario", n.length === 4 && n.filter((x) => x.tipo === "dailies").length === 2, JSON.stringify(n));
  check("Sin cuerpo", G.notificaciones(null).length === 0);
  check("IP de Garmin", G.ipDeGarmin("204.77.162.10") && G.ipDeGarmin("204.77.163.255") && G.ipDeGarmin("185.207.95.1"));
  check("IP ajena", !G.ipDeGarmin("8.8.8.8") && !G.ipDeGarmin("204.77.164.1") && !G.ipDeGarmin("x"));
}

console.log("▸ Ping y permisos");
{
  check("Es ping", G.esPing({ userId: "u", callbackURL: "https://apis.garmin.com/x" }) && !G.esPing({ userId: "u", calendarDate: "2026-11-10" }) && !G.esPing({ userId: "u", callbackURL: "x", steps: 1 }));
  check("Ping solo a Garmin", G.urlDePingValida("https://apis.garmin.com/wellness-api/rest/dailies?token=1") && !G.urlDePingValida("https://apis.garmin.com.evil.io/x") && !G.urlDePingValida("http://apis.garmin.com/x") && !G.urlDePingValida("nada"));
  check("Compartiendo salud", G.compartiendoSalud(undefined) && G.compartiendoSalud(["HEALTH_EXPORT"]) && !G.compartiendoSalud(["ACTIVITY_EXPORT"]));
}

console.log(`\n${passed} pruebas OK, ${failed} fallidas.`);
if (failed) {
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
