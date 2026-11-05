// Paso a paso del reloj en las sesiones con series, y el personalizado al reloj.
import * as R from "../lib/intervals-read.mjs";
import * as E from "../lib/plan-engine.mjs";
import { sesionATexto } from "../lib/intervals-icu.mjs";
let ok = 0, fail = 0;
const check = (c, m) => { if (c) ok++; else { fail++; console.log("✗ " + m); } };

// Generador de salidas: tramos [segundos, m/s], muestras cada segundo, con ruido de GPS.
let semilla = 7;
const azar = () => { semilla = (semilla * 1103515245 + 12345) % 2147483648; return semilla / 2147483648; };
function salida(tramos, { ruido = 0.25, fc = [130, 160] } = {}) {
  const time = [0], distance = [0], heartrate = [100];
  let t = 0, d = 0;
  for (const [seg, v, pulso] of tramos) {
    for (let k = 0; k < seg; k++) {
      t++; d += Math.max(0, v + (v > 0 ? (azar() - 0.5) * 2 * ruido : 0));
      time.push(t); distance.push(Math.round(d * 10) / 10); heartrate.push(pulso ?? (v > 3.2 ? fc[1] : fc[0]));
    }
  }
  return [{ type: "time", data: time }, { type: "distance", data: distance }, { type: "heartrate", data: heartrate }];
}
const ms = (ritmo) => 1000 / (E.parsePaceToDecimal(ritmo) * 60);
const seg = (km, ritmo) => Math.round(km * E.parsePaceToDecimal(ritmo) * 60);
const dif = (a, b) => Math.abs(E.parsePaceToDecimal(a) - E.parsePaceToDecimal(b)) * 60;

// La sesión de la alumna: personalizado 2 km + 5 x 1,2 km a 4:55 con 2' + 2 km.
const easy = E.parsePaceToDecimal("6:23");
const dia = { paceKey: "custom", type: "Calidad", km: 11, easyPace: easy, customBlocks: [{ reps: 5, distKm: 1.2, paceStr: "4:55", recoveryMin: 2 }] };

// --- El personalizado ahora llega al reloj (y al modo en vivo) con sus repeticiones ---
{
  const segs = E.buildLiveSegments(dia, easy);
  check(segs.length === 1 + 5 + 4 + 1, `11 pasos (warm-up, 5 rep, 4 rec, cool-down), salieron ${segs.length}`);
  check(segs[1].label === "Repetición 1 de 5" && segs[1].type === "distance" && segs[1].target === 1.2, "repetición de 1,2 km");
  check(E.formatPace(segs[1].pace) === "4:55", "con su ritmo");
  check(segs[2].label === "Recuperación" && segs[2].type === "time" && segs[2].target === 2, "recuperación de 2'");
  const txt = sesionATexto(dia, easy);
  check(/\n5x\n- Repetición \(ritmo 4'55\) 1\.2km intensity=active\n- Recuperación \(ritmo 6'23\) 2m intensity=recover/.test(txt), "al reloj va como 5x 1,2 km con 2' de recuperación");
  // Cada paso con su tipo en el reloj (si no, Garmin muestra todo como "Carrera").
  check(/^- Warm-up .* intensity=warmup$/m.test(txt) && /^- Cool-down .* intensity=cooldown$/m.test(txt), "calentamiento y enfriamiento con su tipo");
  check(/- Repetición 1\.2km 5:00-4:50\/km Pace/.test(sesionATexto(dia, easy, { alertas: true })), "con alertas, cada repetición lleva su rango de ritmo");
  const dos = { ...dia, customBlocks: [{ reps: 3, distKm: 1, paceStr: "4:40", recoveryMin: 2 }, { reps: 4, distKm: 0.4, paceStr: "4:20", recoveryMin: 1 }] };
  const t2 = sesionATexto(dos, easy);
  check(/3x\n- Bloque 1 · Repetición \(ritmo 4'40\) 1km/.test(t2) && /4x\n- Bloque 2 · Repetición \(ritmo 4'20\) 400mtr/.test(t2), "dos bloques, cada uno con su Nx");
  check(!E.buildLiveSegments({ ...dia, customBlocks: [{ reps: 0, distKm: 1 }] }, easy).some((g) => /Repetición/.test(g.label)), "sin repeticiones válidas, como antes");
}

check(R.llevaPasoAPaso(dia, easy), "el personalizado con series lleva paso a paso");
check(R.llevaPasoAPaso({ paceKey: "I", type: "Intervalos", km: 10, easyPace: 6.3, repsOverride: 5, distOverride: 1 }, 6.3), "los intervalos también");
check(!R.llevaPasoAPaso({ paceKey: "long", km: 15 }, 6) && !R.llevaPasoAPaso({ paceKey: "E", km: 8 }, 6), "fondos y trotes no");

// --- Con las series de datos (sin vueltas): la salida de la alumna ---
{
  const tramos = [[seg(2, "6:08"), ms("6:08")]];
  const reps = ["4:52", "5:00", "4:49", "4:57", "4:46"];
  reps.forEach((r, i) => {
    tramos.push([seg(1.2, r), ms(r)]);
    if (i < 4) { tramos.push([100, ms("6:40")]); tramos.push([20, 0]); } // 1'40" trotando + 20" parada
  });
  tramos.push([seg(2, "5:50"), ms("5:50")]);
  const pa = R.pasoAPaso({ streams: salida(tramos) }, dia, easy);
  check(pa && pa.origen === "series", "se arma con las series");
  check(pa?.coincide && pa.planificadas === 5, "reconoce las 5 repeticiones");
  const rep = (pa?.pasos || []).filter((p) => p.trabajo);
  check(rep.length === 5, `5 repeticiones, salieron ${rep.length}`);
  check(rep.every((p, i) => dif(p.ritmo, reps[i]) <= 6), `ritmo de cada una ±6" (${rep.map((p) => p.ritmo)} vs ${reps})`);
  check(rep.every((p) => Math.abs(p.km - 1.2) <= 0.06), `cada una ~1,2 km (${rep.map((p) => p.km)})`);
  check(rep[0].nombre === "Repetición 1" && rep[0].objetivo?.ritmo === "4:55" && rep[0].objetivo?.medida === "1,2 km", "con el nombre y el objetivo del plan");
  const recs = pa.pasos.filter((p) => /^Recuperación/.test(p.nombre));
  check(recs.length === 4, "4 recuperaciones");
  check(recs.every((p) => Math.abs(p.segTotal - 120) <= 12), `recuperaciones ~2' (${recs.map((p) => p.segTotal)})`);
  check(recs.every((p) => p.segTotal - p.seg >= 15), "la parada en la recuperación se ve");
  check(pa.pasos[0].nombre === "Warm-up" && Math.abs(pa.pasos[0].km - 2) <= 0.06, "warm-up ~2 km");
  check(pa.pasos.at(-1).nombre === "Cool-down" && Math.abs(pa.pasos.at(-1).km - 2) <= 0.06, "cool-down ~2 km");
  check(rep.every((p) => p.fc === 160), "pulso de las repeticiones");
  check(dif(R.ritmoDeLasRepeticiones(pa), "4:53") <= 3, `promedio de las repeticiones ~4:53 (${R.ritmoDeLasRepeticiones(pa)})`);
  check(dif(R.ritmoParaElRegistro(dia, { ritmo: "5:23", pasos: pa }, easy), "4:53") <= 3, "el registro anota el ritmo de las repeticiones, no el promedio de la salida");
  check(pa.firma === R.firmaDelPlan(dia, easy) && pa.firma !== R.firmaDelPlan({ ...dia, customBlocks: [{ reps: 6, distKm: 1, paceStr: "4:50", recoveryMin: 2 }] }, easy), "la firma cambia si el coach cambia la sesión");
}

// --- Hizo una repetición menos: se muestra lo que corrió, sin nombres del plan ---
{
  const tramos = [[seg(2, "6:10"), ms("6:10")]];
  for (let i = 0; i < 4; i++) { tramos.push([seg(1.2, "4:55"), ms("4:55")]); tramos.push([120, ms("6:40")]); }
  tramos.push([seg(2, "6:00"), ms("6:00")]);
  const pa = R.pasoAPaso({ streams: salida(tramos) }, dia, easy);
  check(pa && !pa.coincide && pa.pasos.filter((p) => p.trabajo).length === 4, "4 tramos rápidos de 5 planificados");
  check(pa.pasos.find((p) => p.trabajo).nombre === "Tramo rápido 1" && !pa.pasos.find((p) => p.trabajo).objetivo, "sin nombre ni objetivo del plan");
  check(R.ritmoDeLasRepeticiones(pa) === null, "y no se anota un ritmo de repeticiones");
}

// --- Cuestas: sin ritmo en el plan, el corte lo decide la propia salida ---
{
  const cuestas = { paceKey: "hills", type: "Cuestas", km: 9, easyPace: 6.4, repsOverride: 6 };
  const plan = R.pasosPlanificados(cuestas, 6.4);
  const n = plan.filter((p) => p.trabajo).length;
  const tramos = [[900, ms("6:20")]];
  for (let i = 0; i < n; i++) { tramos.push([45, ms("4:30")]); if (i < n - 1) tramos.push([120, ms("7:30")]); }
  tramos.push([600, ms("6:20")]);
  const pa = R.pasoAPaso({ streams: salida(tramos) }, cuestas, 6.4);
  check(pa?.coincide && pa.pasos.filter((p) => p.trabajo).length === n, `cuestas: reconoce las ${n} subidas`);
  check(pa.pasos.find((p) => p.trabajo).nombre === "Subida 1", "con su nombre");
}

// --- Un trote parejo en un día de series: no hay dos ritmos, no se inventa nada ---
{
  const sinPlan = { ...dia, customBlocks: [{ reps: 5, distKm: 1.2, paceStr: "", recoveryMin: 2 }] };
  const pa = R.pasoAPaso({ streams: salida([[3600, ms("6:00")]], { ruido: 0.15 }) }, sinPlan, easy);
  check(pa === null, "salida pareja sin ritmo en el plan: sin paso a paso");
}

// --- Con las vueltas del reloj (corrió el entrenamiento desde el reloj): exacto ---
{
  const plan = R.pasosPlanificados(dia, easy);
  const vueltas = plan.map((p, i) => p.type === "distance"
    ? { km: p.target, seg: Math.round(p.target * (p.trabajo ? 4.85 : 6.2) * 60), segTotal: Math.round(p.target * (p.trabajo ? 4.85 : 6.2) * 60), ritmo: p.trabajo ? "4:51" : "6:12", fc: p.trabajo ? 158 : 135 }
    : { km: 0.31, seg: 120, segTotal: 121, ritmo: "6:27", fc: 140 });
  const pa = R.pasoAPaso({ vueltas }, dia, easy);
  check(pa?.origen === "vueltas" && pa.coincide && pa.pasos.length === plan.length, "con vueltas que calzan, se usan tal cual");
  check(pa.pasos[1].nombre === "Repetición 1" && pa.pasos[1].ritmo === "4:51" && pa.pasos[1].fc === 158, "cada vuelta con su nombre, ritmo y pulso");
  const pa2 = R.pasoAPaso({ vueltas: vueltas.slice(0, 5) }, dia, easy);
  check(pa2 === null, "vueltas que no calzan y sin series: nada");
}

// --- La vuelta del reloj guarda su pulso ---
{
  const r = R.resumenDeActividad({ id: 1, distance: 1000, moving_time: 300 }, [{ distance: 1000, moving_time: 300, average_heartrate: 151.4 }]);
  check(r.vueltas[0].fc === 151, "vuelta con pulso medio");
}


// --- Salida asignada por fecha en una lectura anterior: se le puede completar el detalle ---
{
  const plan = [{ paceKey: "custom", km: 11 }, null, null, null, null, null, null];
  const alumno = { id: "x", planStartMonday: "2026-11-02", weeks: { 1: { plan, log: [{ completed: true, reloj: { id: "a1", km: 11 } }] } } };
  const sitio = R.ubicarActividad({ id: "a1", start_date_local: "2026-11-02T06:00:00" }, new Map(), alumno);
  check(sitio && sitio.semana === 1 && sitio.dia === 0 && sitio.via === "fecha", "la misma salida sigue siendo de su sesión");
  check(R.ubicarActividad({ id: "a2", start_date_local: "2026-11-02T18:00:00" }, new Map(), alumno) === null, "otra salida ese día no la pisa");
  const { log, cambio } = R.logConLectura(alumno.weeks[1].log[0], { id: "a1", km: 11, pasos: { coincide: false, pasos: [] } }, plan[0], 6);
  check(cambio && log.completed && log.reloj.pasos, "se guarda el detalle nuevo sin tocar lo marcado");
}

// --- La sesión del 05/11: 3 km + 6 x 1 km (I) con 3' + 2 km, corrida desde un Garmin ---
{
  const easy2 = E.parsePaceToDecimal("6:16");
  const intervalos = { paceKey: "I", type: "Intervalos (I)", km: 14, distOverride: 1, repsOverride: 6, easyPace: easy2, hmPace: E.parsePaceToDecimal("4:34"), marathonPace: E.parsePaceToDecimal("4:45") };
  const plan = R.pasosPlanificados(intervalos, easy2);
  check(plan.length === 13 && R.pasosComoEnElReloj(plan).length === 14, "el reloj hace 6 recuperaciones (una más que el plan)");
  // Las 14 vueltas que mostró Garmin: 3 km, 6 x (1 km + 3'), 2 km.
  const reps = ["4:32", "4:28", "4:28", "4:26", "4:21", "4:12"];
  const recKm = [0.54, 0.54, 0.56, 0.51, 0.52, 0.53];
  const vueltas = [{ km: 3.0, seg: 1056, segTotal: 1056, ritmo: "5:52", fc: 135 }];
  reps.forEach((r, i) => {
    const sg = Math.round(E.parsePaceToDecimal(r) * 60);
    vueltas.push({ km: 1.0, seg: sg, segTotal: sg, ritmo: r, fc: 160 + i });
    vueltas.push({ km: recKm[i], seg: 180, segTotal: 180, ritmo: "5:35", fc: 150 });
  });
  vueltas.push({ km: 2.0, seg: 647, segTotal: 647, ritmo: "5:23", fc: 150 });
  const pa = R.pasoAPaso({ vueltas }, intervalos, easy2);
  check(pa?.origen === "vueltas" && pa.coincide, "con las 14 vueltas del Garmin se usa el reloj, exacto");
  const rep = (pa?.pasos || []).filter((x) => x.trabajo);
  check(rep.length === 6 && rep.map((x) => x.ritmo).join() === reps.join(), `las 6 repeticiones con su ritmo (${rep.map((x) => x.ritmo)})`);
  check(pa.pasos.filter((x) => /^Recuperación/.test(x.nombre)).length === 6, "6 recuperaciones");
  check(pa.pasos[0].nombre === "Warm-up" && pa.pasos.at(-1).nombre === "Cool-down", "con calentamiento y enfriamiento");
  check(R.pasoAPaso({ vueltas: [...vueltas.slice(0, 5), { km: 0.004, seg: 2, segTotal: 2 }, ...vueltas.slice(5)] }, intervalos, easy2)?.origen === "vueltas", "un LAP sin querer (vuelta de 2 s) no lo arruina");

  // Sin vueltas: recuperaciones trotadas a ~5:35 (mucho más rápido que su suave de 6:16) y
  // un tirón de 300 m en el calentamiento. Antes cada recuperación se partía en pedazos.
  const tramos = [[seg(1.4, "5:52"), ms("5:52")], [seg(0.3, "5:00"), ms("5:00")], [seg(1.3, "5:52"), ms("5:52")]];
  reps.forEach((r) => { tramos.push([seg(1, r), ms(r)]); tramos.push([180, ms("5:35")]); });
  tramos.push([seg(2, "5:25"), ms("5:25")]);
  const ps = R.pasoAPaso({ streams: salida(tramos, { ruido: 0.35 }) }, intervalos, easy2);
  const rs = (ps?.pasos || []).filter((x) => x.trabajo);
  check(ps?.origen === "series" && ps.coincide && rs.length === 6, `con las series: 6 repeticiones (salieron ${rs.length})`);
  check(rs.every((x, i) => dif(x.ritmo, reps[i]) <= 6 && Math.abs(x.km - 1) <= 0.06), `cada repetición ~1 km a su ritmo (${rs.map((x) => `${x.km}@${x.ritmo}`)})`);
  check(Math.abs(ps.pasos[0].km - 3) <= 0.08, `el calentamiento entero, con el tirón (${ps.pasos[0].km} km)`);
}

console.log(`paso a paso: ${ok} ok, ${fail} fallos`);
if (fail) process.exit(1);
