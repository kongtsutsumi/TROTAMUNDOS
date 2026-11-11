// Pruebas del rendimiento (lib/rendimiento.mjs). Cómo correrlas:  npm test
//
// Se arma un alumno sintético con VDOT 50: la FC de cada km sale exactamente de la relación
// que usa la estimación, así que el VDOT estimado tiene que dar ~50.

import * as R from "../lib/rendimiento.mjs";
import { computeTrainingPaces } from "../lib/plan-engine.mjs";

let passed = 0, failed = 0;
const failures = [];
function check(name, condition, detail) {
  if (condition) passed++;
  else { failed++; failures.push(`${name}${detail ? ` — ${detail}` : ""}`); }
}
const pace = (min) => { const s = Math.round(min * 60); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

const VDOT = 50, REPOSO = 50, MAX = 190;
const P = computeTrainingPaces(VDOT);
const fcPara = (ritmo, vdot = VDOT) => { const v = 1000 / ritmo; const vo2 = -4.6 + 0.182258 * v + 0.000104 * v * v; return Math.round(REPOSO + (vo2 / vdot) * (MAX - REPOSO)); };
const kmsDe = (km, ritmo, vdot) => Array.from({ length: Math.floor(km) }, (_, i) => ({ n: i + 1, km: 1, seg: Math.round(ritmo * 60), ritmo: pace(ritmo), fc: fcPara(ritmo, vdot) }));
function reloj(fecha, km, ritmo, { vdot = VDOT, fcMax = null, pasos = null } = {}) {
  const k = kmsDe(km, ritmo, vdot);
  return { id: fecha, fecha: `${fecha}T07:00:00`, km, min: km * ritmo, ritmo: pace(ritmo), fcMedia: Math.round(k.reduce((a, x) => a + x.fc, 0) / k.length), fcMax: fcMax ?? Math.max(...k.map((x) => x.fc)) + 5, kms: k, ...(pasos ? { pasos: { pasos } } : {}) };
}
const rep = (real, obj) => ({ trabajo: true, ritmo: pace(real), objetivo: { ritmo: pace(obj) } });

// 8 semanas desde el lunes 14 sep; hoy = martes 10 nov.
const HOY = "2026-11-10";
const lunes = (w) => { const d = new Date("2026-09-14T12:00:00"); d.setDate(d.getDate() + 7 * (w - 1)); return d.toISOString().slice(0, 10); };
const mas = (iso, n) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
function semana(w, { kmFondo = 14, vdotSemana = VDOT, repsReal = P.I, rpe = null } = {}) {
  const L = lunes(w);
  const plan = [{ paceKey: "E", km: 8, type: "Rodaje" }, { paceKey: "I", km: 10, type: "Intervalos" }, { paceKey: "" }, { paceKey: "E", km: 8, type: "Rodaje" }, { paceKey: "" }, { paceKey: "long", km: kmFondo }, { paceKey: "" }];
  const log = [
    { completed: true, rpe, reloj: reloj(L, 8, P.E, { vdot: vdotSemana }) },
    { completed: true, reloj: reloj(mas(L, 1), 10, P.E, { vdot: vdotSemana, fcMax: MAX, pasos: [rep(repsReal, P.I), rep(repsReal, P.I), rep(P.I, P.I), { trabajo: false, ritmo: "6:30" }] }) },
    {}, { completed: true, reloj: reloj(mas(L, 3), 8, P.E, { vdot: vdotSemana }) }, {},
    { completed: true, reloj: reloj(mas(L, 5), kmFondo, P.long, { vdot: vdotSemana }) }, {},
  ];
  return { plan, log };
}
const weeks = {};
for (let w = 1; w <= 9; w++) weeks[w] = semana(w);
const student = { id: "ana", goal: "21k", planStartMonday: "2026-09-14", paces: { ...P }, weeks };
const dias = {};
for (let i = 0; i < 30; i++) dias[mas(HOY, -i)] = { datos: { fcReposo: REPOSO, sueñoMin: 450 } };

console.log("▸ Salidas");
{
  const l = R.salidas(student);
  check("Todas las salidas con fecha y tipo", l.length >= 32 && l.every((s) => s.fecha && s.tipo), l.length);
  check("Tipos", l.some((s) => s.tipo === "suave") && l.some((s) => s.tipo === "calidad") && l.some((s) => s.tipo === "fondo"));
  check("Referencias de FC", R.fcReposoDe(dias, HOY) === REPOSO && R.fcMaxDe(l, HOY) >= MAX);
  check("Sin esfuerzos fuertes no hay FC máxima", R.fcMaxDe(l.filter((x) => x.tipo === "suave"), HOY) === null);
  check("FC máxima desde las series largas", R.fcMaxDe([{ fecha: HOY, tipo: "calidad", pasos: [{ trabajo: true, fc: 176, seg: 180 }, { trabajo: true, fc: 182, seg: 60 }] }], HOY) === 185);
}

console.log("▸ 1. VDOT estimado");
{
  const v = R.vdotEstimado(student, R.salidas(student), dias, HOY);
  check("Estima ~50", v.estado === "ok" && Math.abs(v.vdot - 50) <= 1.5, JSON.stringify([v.vdot, v.fcMax]));
  check("VDOT del plan", Math.abs(v.plan - 50) < 0.6, v.plan);
  check("Mantener ritmos", v.sugerencia === "mantener" && v.confianza === "alta", JSON.stringify([v.sugerencia, v.confianza]));
  check("Predicción 21K ~1:33", v.prediccion && Math.abs(v.prediccion.min - 93) < 2, R.tiempoTexto(v.prediccion?.min));
  check("Semanas con dato", v.semanas.filter((s) => s.vdot != null).length >= 6);

  // Mejoró: las últimas 3 semanas corre igual con menos pulsaciones (VDOT 53).
  const w2 = { ...weeks }; for (const w of [7, 8, 9]) w2[w] = semana(w, { vdotSemana: 53 });
  const v2 = R.vdotEstimado({ ...student, weeks: w2 }, R.salidas({ ...student, weeks: w2 }), dias, HOY);
  check("Subió: sugiere actualizar ritmos", v2.vdot >= 52 && v2.sugerencia === "subir", JSON.stringify([v2.vdot, v2.sugerencia]));
  check("Sin FC: aprendiendo", R.vdotEstimado(student, R.salidas({ ...student, weeks: { 1: { plan: [{ paceKey: "E", km: 8 }], log: [{ completed: true, actualKm: "8", actualPaceStr: "5:30" }] } } }), {}, HOY).estado === "aprendiendo");
  check("Tiempo para VDOT (tabla de Daniels: 41:21)", Math.abs(R.tiempoPara(50, 10) - 41.35) < 0.4, R.tiempoTexto(R.tiempoPara(50, 10)));
}

console.log("▸ 2. Estado de forma");
{
  const f = R.estadoDeForma(R.salidas(student), dias, HOY, "listo");
  check("Carga estable: construyendo", f.estado === "ok" && f.clave === "construyendo", JSON.stringify([f.clave, f.ratio]));
  // Última semana con el doble de fondo y un rodaje extra largo.
  const w3 = { ...weeks, 9: semana(9, { kmFondo: 30 }) };
  w3[9].log[2] = { completed: true, reloj: reloj(mas(lunes(9), 2), 16, P.E) }; w3[9].plan[2] = { paceKey: "E", km: 16 };
  w3[8] = semana(8, { kmFondo: 26 });
  const f2 = R.estadoDeForma(R.salidas({ ...student, weeks: w3 }), dias, mas(lunes(9), 6), "listo");
  check("Subió mucho: alerta", ["rapido", "alta"].includes(f2.clave) && f2.ratio > 1.3, JSON.stringify([f2.clave, f2.ratio]));
  const f3 = R.estadoDeForma(R.salidas({ ...student, weeks: w3 }), dias, mas(lunes(9), 6), "calma");
  check("Con poca recuperación, subir rápido ya es alto", f3.clave === "alta", f3.clave);
  const fresco = R.estadoDeForma(R.salidas(student), dias, mas(HOY, 12), "listo");
  check("Sin entrenar dos semanas: fresco", fresco.clave === "fresco", JSON.stringify([fresco.clave, fresco.ratio]));
  check("Alumno nuevo: aprendiendo", R.estadoDeForma(R.salidas({ ...student, weeks: { 9: weeks[9] } }), dias, HOY).estado === "aprendiendo");
  check("Carga por RPE", R.cargaDe({ min: 60, rpe: 8, tipo: "suave" }, 50, 190) === 48 && R.cargaDe({ min: 60, tipo: "calidad" }, null, null) === 45);
}

console.log("▸ 3. Eficiencia aeróbica");
{
  const e = R.eficiencia(R.salidas(student), HOY);
  check("Estable", e.estado === "ok" && e.clave === "igual", JSON.stringify([e.clave, e.segundos]));
  const w4 = { ...weeks }; for (const w of [8, 9]) w4[w] = semana(w, { vdotSemana: 54 });
  const e2 = R.eficiencia(R.salidas({ ...student, weeks: w4 }), HOY);
  check("Mejora: segundos más rápido a igual FC", e2.clave === "mejora" && e2.segundos >= 5 && /más rápido con las mismas pulsaciones/.test(e2.texto), JSON.stringify([e2.segundos, e2.texto]));
}

console.log("▸ 5. Calidad");
{
  const c = R.calidad(R.salidas(student), HOY);
  check("Todas en ritmo", c.estado === "ok" && c.pct === 100 && /muy bien/.test(c.texto), JSON.stringify([c.pct]));
  const w5 = { ...weeks }; for (const w of [5, 6, 7, 8, 9]) w5[w] = semana(w, { repsReal: P.I - 0.25 });
  const c2 = R.calidad(R.salidas({ ...student, weeks: w5 }), HOY);
  check("Se pasa de rápido", c2.tendencia === "rapido" && c2.pct < 75 && /más rápidas/.test(c2.texto), JSON.stringify([c2.pct, c2.tendencia]));
  check("Recuperaciones no cuentan", R.calidadDeSalida({ pasos: [{ trabajo: false, ritmo: "7:00", objetivo: { ritmo: "6:00" } }] }) === null);
}

console.log("▸ 7. Sueño y series");
{
  const w6 = {}; const d6 = { ...dias };
  for (let w = 1; w <= 9; w++) { const corto = w % 2 === 0; w6[w] = semana(w, { repsReal: corto ? P.I + 0.15 : P.I }); d6[mas(lunes(w), 1)] = { datos: { sueñoMin: corto ? 340 : 460, fcReposo: REPOSO } }; }
  const s = R.sueñoYSeries(R.salidas({ ...student, weeks: w6 }), d6, HOY);
  check("Durmiendo poco, series más lentas", s.estado === "ok" && s.diferencia >= 3 && /más lentas/.test(s.texto), JSON.stringify([s.diferencia, s.texto]));
  check("Pocos datos: aprendiendo", R.sueñoYSeries(R.salidas(student), dias, HOY).estado === "aprendiendo");
}

console.log("▸ 8. Resumen del equipo");
{
  const a = R.resumenSemanal(student, dias, HOY, "listo");
  check("Resumen de un alumno", a.forma === "construyendo" && a.sueñoPromedio === 450 && !a.durmioMal && a.calidadPct === 100, JSON.stringify(a));
  const g = R.gruposDelEquipo({ ana: a, beto: { forma: "alta", recuperacion: "listo", durmioMal: true }, caro: { forma: "construyendo", recuperacion: "recupera", subioVdot: true } });
  check("Grupos", g.asimilando.includes("ana") && g.sobrecargados.includes("beto") && g.sobrecargados.includes("caro") && g.durmieronMal.includes("beto") && g.subieronVdot.includes("caro") && !g.asimilando.includes("caro"), JSON.stringify(g));
}

console.log(`\n${passed} pruebas OK, ${failed} fallidas.`);
if (failed) {
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
