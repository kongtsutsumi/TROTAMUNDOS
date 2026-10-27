// Pruebas del semáforo del listado del coach (lib/estado-semana.mjs).
//
// Lo que más importa:
//   · que la sesión de HOY no cuente como falta;
//   · que los km cuenten lo que no corrió (no solo las sesiones hechas);
//   · que una semana pausada o por empezar no salga en rojo.
//
// Cómo correrlas:  npm test

import * as S from "../lib/estado-semana.mjs";

let passed = 0, failed = 0;
const failures = [];
function check(name, condition, detail) {
  if (condition) passed++;
  else { failed++; failures.push(`${name}${detail ? ` — ${detail}` : ""}`); }
}

// Semana 1 desde el lunes 19/10/2026. Sesiones lun (8), mié (10), vie (6), dom (16) = 40 km.
const plan = [
  { paceKey: "E", km: 8 }, { paceKey: "" }, { paceKey: "T", km: 10 }, { paceKey: "" },
  { paceKey: "E", km: 6 }, { paceKey: "" }, { paceKey: "E", km: 16 },
];
const vacio = () => plan.map(() => ({ completed: false, actualKm: "" }));
const alumno = (log, extra = {}) => ({ planStartMonday: "2026-10-19", currentWeek: 1, weeks: { 1: { plan, log, ...extra } }, ...{} });
const hecho = (km) => ({ completed: true, actualKm: km });

console.log("\n▸ Qué día de la semana es");
check("El lunes es el día 0", S.diaDeLaSemana("2026-10-19", 1, "2026-10-19") === 0);
check("El domingo de la semana 2 es el día 6", S.diaDeLaSemana("2026-10-19", 2, "2026-11-01") === 6);
check("Antes de empezar es negativo", S.diaDeLaSemana("2026-10-19", 1, "2026-10-18") === -1);
check("Sin fecha de arranque no se sabe", S.diaDeLaSemana(undefined, 1, "2026-10-19") === null);

console.log("\n▸ El semáforo");
{
  let e = S.estadoDeLaSemana(alumno(vacio()), "2026-10-19");
  check("Primera semana, el lunes: recién empieza (gris, no verde)", e.tono === "gris" && e.frase === "Semana recién empieza", JSON.stringify(e));

  e = S.estadoDeLaSemana(alumno(vacio()), "2026-10-20");
  check("El martes sin la del lunes: le falta 1", e.tono === "amarillo" && e.frase === "Le falta 1 sesión", JSON.stringify(e));

  e = S.estadoDeLaSemana(alumno(vacio()), "2026-10-23");
  check("El viernes sin lunes ni miércoles: atrasado con 2", e.tono === "rojo" && e.frase === "Atrasado: le faltan 2 sesiones", JSON.stringify(e));

  const log = vacio(); log[0] = hecho("8"); log[2] = hecho("10");
  e = S.estadoDeLaSemana(alumno(log), "2026-10-23");
  check("El viernes con lunes y miércoles hechos: al día", e.tono === "verde" && e.frase === "Al día");

  e = S.estadoDeLaSemana(alumno(vacio()), "2026-10-27");
  check("Semana ya terminada sin nada: faltan las 4", e.frase === "Atrasado: le faltan 4 sesiones");

  e = S.estadoDeLaSemana(alumno(vacio()), "2026-10-17");
  check("Antes del lunes: gris, por empezar", e.tono === "gris" && e.frase === "Semana por empezar");

  // Semana 2 desde el lunes 26/10. La semana 1 quedó con 1 de 4 sesiones.
  const semana1 = vacio(); semana1[0] = hecho("8");
  const dosSemanas = (log2, extra1 = {}) => ({ planStartMonday: "2026-10-19", currentWeek: 2,
    weeks: { 1: { plan, log: semana1, submitted: true, ...extra1 }, 2: { plan, log: log2 } } });
  e = S.estadoDeLaSemana(dosSemanas(vacio()), "2026-10-26");
  check("El lunes muestra cómo terminó la semana pasada, no 'al día'",
    e.tono === "rojo" && e.frase === "Semana pasada: le faltaron 3 sesiones" && e.semana === "pasada", JSON.stringify(e));
  check("…con sus sesiones y km", S.textoDelDetalle(e) === "Hizo 1 de 4 sesiones · 8 de 40 km", S.textoDelDetalle(e));
  e = S.estadoDeLaSemana(dosSemanas(vacio()), "2026-10-27");
  check("El martes ya juzga la semana actual", e.frase === "Le falta 1 sesión" && !e.semana, JSON.stringify(e));
  e = S.estadoDeLaSemana(dosSemanas(vacio(), { paused: true }), "2026-10-26");
  check("Si la semana pasada estuvo pausada, lo dice en gris", e.tono === "gris" && e.frase === "Semana pasada: pausada");
  const completa = plan.map((d) => (d.paceKey ? hecho(String(d.km)) : { completed: false }));
  const buena = { planStartMonday: "2026-10-19", currentWeek: 2, weeks: { 1: { plan, log: completa }, 2: { plan, log: vacio() } } };
  e = S.estadoDeLaSemana(buena, "2026-10-26");
  check("Semana pasada completa: verde", e.tono === "verde" && e.frase === "Semana pasada: completa");
  const unaFalta = completa.slice(); unaFalta[6] = { completed: false };
  e = S.estadoDeLaSemana({ ...buena, weeks: { 1: { plan, log: unaFalta }, 2: { plan, log: vacio() } } }, "2026-10-26");
  check("Semana pasada con 1 falta: amarillo", e.tono === "amarillo" && e.frase === "Semana pasada: le faltó 1 sesión");

  e = S.estadoDeLaSemana(alumno(vacio(), { paused: true }), "2026-10-27");
  check("Semana pausada: gris, sin faltas", e.tono === "gris" && e.frase === "Semana pausada");

  const todo = plan.map((d) => (d.paceKey ? hecho(String(d.km)) : { completed: false }));
  e = S.estadoDeLaSemana(alumno(todo), "2026-10-21");
  check("Todas hechas: semana completa", e.tono === "verde" && e.frase === "Semana completa");

  const l2 = vacio(); l2[0] = hecho("8");
  e = S.estadoDeLaSemana(alumno(l2, { studentSubmitted: true }), "2026-10-21");
  check("Si ya envió la semana, lo que no hizo cuenta como falta", e.frase === "Atrasado: le faltan 3 sesiones", e.frase);

  check("Sin semana no hay estado", S.estadoDeLaSemana({ weeks: {} }, "2026-10-21") === null);
  check("Semana sin sesiones no hay estado", S.estadoDeLaSemana(alumno(vacio(), { plan: [{ paceKey: "" }] }), "2026-10-21") === null);
}

console.log("\n▸ Los km cuentan lo que no corrió");
{
  const log = vacio(); log[0] = hecho("12");
  let e = S.estadoDeLaSemana(alumno(log), "2026-10-21");
  check("1 sesión de 12 km: 12 de 40 km", e.kmHechos === 12 && e.kmPlan === 40, JSON.stringify(e));
  check("El texto lo dice en palabras", S.textoDelDetalle(e) === "Hizo 1 de 4 sesiones · 12 de 40 km", S.textoDelDetalle(e));

  const sinKm = vacio(); sinKm[2] = { completed: true, actualKm: "" };
  e = S.estadoDeLaSemana(alumno(sinKm), "2026-10-21");
  check("Hecha sin anotar km: cuenta los km del plan", e.kmHechos === 10);

  const dec = vacio(); dec[0] = hecho("8.25"); dec[2] = hecho("10.1");
  e = S.estadoDeLaSemana(alumno(dec), "2026-10-23");
  check("Los decimales se muestran con coma", S.textoDelDetalle(e) === "Hizo 2 de 4 sesiones · 18,4 de 40 km", S.textoDelDetalle(e));

  const raro = vacio(); raro[0] = { completed: false, actualKm: "9" };
  e = S.estadoDeLaSemana(alumno(raro), "2026-10-23");
  check("Km anotados en una sesión no marcada como hecha no cuentan", e.kmHechos === 0);
}

console.log(`\n${"═".repeat(50)}`);
console.log(`  ${passed} pruebas del semáforo pasaron, ${failed} fallaron`);
if (failures.length) { console.log("\n  Fallos:"); for (const f of failures) console.log(`   ✗ ${f}`); }
console.log(`${"═".repeat(50)}\n`);
process.exit(failed ? 1 : 0);
