// Pruebas de la lectura de archivos FIT (lib/fit-actividad.mjs).
//
// Se arma un FIT de verdad con el SDK oficial: un entrenamiento de 2 km de calentamiento,
// 4 x 1 km con 400 m de recuperación y 1 km de enfriamiento, una vuelta por paso y un registro
// por segundo. Luego se lee y se pasa por el MISMO análisis que las actividades de
// intervals.icu: resumen, km por km y paso a paso.
//
// Cómo correrlas:  npm test

import { Encoder, Profile } from "@garmin/fitsdk";
import { actividadDesdeFit } from "../lib/fit-actividad.mjs";
import { resumenDeActividad, kmPorKm } from "../lib/intervals-read.mjs";

let passed = 0, failed = 0;
const failures = [];
function check(name, condition, detail) {
  if (condition) passed++;
  else { failed++; failures.push(`${name}${detail ? ` — ${detail}` : ""}`); }
}

// --- Un FIT sintético -------------------------------------------------------------
const INICIO = new Date("2026-11-10T11:00:00Z");
const tramos = [
  { m: 2000, ritmo: 6.0, fc: 135 },
  ...[1, 2, 3, 4].flatMap((n) => [{ m: 1000, ritmo: 4.5, fc: 168 }, ...(n < 4 ? [{ m: 400, ritmo: 6.5, fc: 145 }] : [])]),
  { m: 1000, ritmo: 6.2, fc: 138 },
];

function armarFit({ parada = 0 } = {}) {
  const enc = new Encoder();
  const M = Profile.MesgNum;
  enc.onMesg(M.FILE_ID, { type: "activity", manufacturer: "garmin", product: 3990, timeCreated: INICIO, serialNumber: 1234 });
  let t = 0, d = 0;
  const vueltas = [];
  for (const [i, tr] of tramos.entries()) {
    const vel = 1000 / (tr.ritmo * 60);
    const segs = Math.round(tr.m / vel);
    const lapInicio = t, lapD0 = d;
    for (let s = 0; s < segs; s++) {
      t++; d += vel;
      enc.onMesg(M.RECORD, { timestamp: new Date(INICIO.getTime() + t * 1000), distance: d, enhancedSpeed: vel, heartRate: tr.fc });
    }
    // Una parada de semáforo en la primera recuperación: el reloj sigue grabando sin avanzar.
    let detenido = 0;
    if (parada && i === 2) {
      for (let s = 0; s < parada; s++) { t++; detenido++; enc.onMesg(M.RECORD, { timestamp: new Date(INICIO.getTime() + t * 1000), distance: d, enhancedSpeed: 0, heartRate: 110 }); }
    }
    vueltas.push({ inicio: lapInicio, fin: t, m: d - lapD0, fc: tr.fc, mov: segs, tot: segs + detenido });
  }
  for (const v of vueltas) {
    enc.onMesg(M.LAP, {
      timestamp: new Date(INICIO.getTime() + v.fin * 1000), startTime: new Date(INICIO.getTime() + v.inicio * 1000),
      totalDistance: v.m, totalTimerTime: v.mov, totalElapsedTime: v.tot, avgHeartRate: v.fc,
    });
  }
  enc.onMesg(M.SESSION, {
    timestamp: new Date(INICIO.getTime() + t * 1000), startTime: INICIO, sport: "running",
    totalDistance: d, totalTimerTime: t - parada, totalElapsedTime: t, avgHeartRate: 155, maxHeartRate: 172,
    avgRunningCadence: 86, totalAscent: 12, totalDescent: 11, totalCalories: 640, numLaps: vueltas.length,
  });
  enc.onMesg(M.ACTIVITY, { timestamp: new Date(INICIO.getTime() + t * 1000), numSessions: 1, totalTimerTime: t });
  return enc.close();
}

console.log("\n▸ Leer el FIT");
{
  const bytes = armarFit();
  const r = actividadDesdeFit(bytes, { id: "g-123" });
  check("Se lee sin error", !r.error, r.error);
  const a = r.actividad || {};
  check("Es una carrera", a.type === "Run", a.type);
  check("Distancia total", Math.abs(a.distance - 8200) < 2, a.distance);
  check("Tiempo en movimiento", a.moving_time > 0 && a.moving_time === a.elapsed_time, `${a.moving_time}/${a.elapsed_time}`);
  check("FC media y máxima", a.average_heartrate === 155 && a.max_heartrate === 172);
  check("Desnivel y calorías", a.total_elevation_gain === 12 && a.calories === 640);
  check("Conserva el id de la marca", a.id === "g-123");
  check("Fecha de inicio", typeof a.start_date_local === "string" && a.start_date_local.startsWith("2026-11-10"), a.start_date_local);
  check("Una vuelta por paso", r.vueltas.length === tramos.length, r.vueltas.length);
  check("La serie dura lo que debe", Math.abs(r.vueltas[1].distance - 1000) < 2 && Math.abs(r.vueltas[1].moving_time - 270) <= 1, JSON.stringify(r.vueltas[1]));
  check("Series segundo a segundo", r.streams.find((s) => s.type === "time")?.data.length > 1900);
  check("Trae frecuencia cardíaca", !!r.streams.find((s) => s.type === "heartrate"));

  console.log("\n▸ El mismo análisis que intervals.icu");
  const resumen = resumenDeActividad(a, r.vueltas, kmPorKm(r.streams));
  check("Resumen: km", resumen.km === 8.2, resumen.km);
  check("Resumen: ritmo de la salida", typeof resumen.ritmo === "string" && /^\d+:\d{2}$/.test(resumen.ritmo), resumen.ritmo);
  check("Resumen: vueltas", resumen.vueltas.length === tramos.length);
  check("Resumen: la serie a 4:30", resumen.vueltas[1].ritmo === "4:30", resumen.vueltas[1].ritmo);
  check("Resumen: la recuperación a 6:30", resumen.vueltas[2].ritmo === "6:30", resumen.vueltas[2].ritmo);
  const kms = resumen.kms || [];
  check("Km por km: 9 tramos (8 + 200 m)", kms.length === 9, kms.length);
  check("Km por km: el 1.º a ~6:00", ["5:59", "6:00", "6:01"].includes(kms[0]?.ritmo), kms[0]?.ritmo);
  check("Km por km: con FC", kms[0]?.fc === 135, kms[0]?.fc);
}

console.log("\n▸ Paradas");
{
  const r = actividadDesdeFit(armarFit({ parada: 40 }));
  const resumen = resumenDeActividad(r.actividad, r.vueltas, kmPorKm(r.streams));
  check("Tiempo total incluye la parada", resumen.segTotal - resumen.segMovimiento === 40, `${resumen.segTotal}-${resumen.segMovimiento}`);
  check("La vuelta de la parada lo refleja", resumen.vueltas[2].segTotal - resumen.vueltas[2].segMov === 40);
  check("El km por km no se ensucia con la parada", resumen.kms.every((k) => /^[4-6]:\d{2}$/.test(k.ritmo || "")), resumen.kms.map((k) => k.ritmo).join(","));
}

console.log("\n▸ Archivos malos");
check("Basura no es FIT", !!actividadDesdeFit(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14])).error);
{
  const b = armarFit(); b[b.length - 1] ^= 0xff;
  check("FIT dañado se rechaza", !!actividadDesdeFit(b).error);
}

console.log(`\n${passed} pruebas OK, ${failed} fallidas.`);
if (failed) {
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
