// Pruebas del consentimiento (lib/consentimiento.mjs) y de la limpieza de datos de salud
// (lib/salud.mjs). Lo que no se puede romper:
//   · sin consentimiento de entrenamiento no se conecta nada;
//   · el de salud va por separado y exige el de entrenamiento;
//   · retirar el de entrenamiento retira también el de salud;
//   · queda registro de cada cambio, con fecha y versión de la política;
//   · a la tabla de salud solo entran campos conocidos, en rangos razonables.
//
// Cómo correrlas:  npm test

import * as C from "../lib/consentimiento.mjs";
import * as S from "../lib/salud.mjs";

let passed = 0, failed = 0;
const failures = [];
function check(name, condition, detail) {
  if (condition) passed++;
  else { failed++; failures.push(`${name}${detail ? ` — ${detail}` : ""}`); }
}

const T1 = "2026-11-10T15:00:00.000Z";
const T2 = "2026-11-11T09:00:00.000Z";

console.log("\n▸ Sin registro");
{
  const r = C.normalizar(null);
  check("Vacío no acepta entrenamiento", !C.aceptoEntrenamiento(null));
  check("Vacío no acepta salud", !C.aceptoSalud(null));
  check("Vacío no tiene registro", !C.tieneRegistro(r));
  check("Basura se normaliza", !C.aceptoEntrenamiento({ entrenamiento: "sí" }) && C.normalizar("x").historial.length === 0);
  const res = C.resumen(null);
  check("Resumen vacío", res.registrado === false && res.entrenamiento.aceptado === false && res.salud.aceptado === false);
}

console.log("\n▸ Aceptar");
{
  const a = C.aplicar(null, { entrenamiento: true }, T1);
  check("Acepta entrenamiento", a.ok && C.aceptoEntrenamiento(a.registro));
  check("Salud sigue sin aceptar", !C.aceptoSalud(a.registro));
  check("Queda la fecha", a.registro.entrenamiento.fecha === T1);
  check("Queda la versión", a.registro.version === C.VERSION_POLITICA);
  check("Queda en el historial", a.registro.historial.length === 1 && a.registro.historial[0].tipo === "entrenamiento");
  check("Ya tiene registro", C.tieneRegistro(a.registro));

  const b = C.aplicar(null, { entrenamiento: true, salud: true }, T1);
  check("Acepta los dos a la vez", C.aceptoEntrenamiento(b.registro) && C.aceptoSalud(b.registro));
  check("Dos entradas en el historial", b.registro.historial.length === 2);

  const solo = C.aplicar(null, { salud: true }, T1);
  check("No se puede aceptar salud sin entrenamiento", !solo.ok);

  const repetir = C.aplicar(b.registro, { entrenamiento: true, salud: true }, T2);
  check("Aceptar de nuevo lo mismo no ensucia el historial", repetir.ok && repetir.cambiados.length === 0 && repetir.registro.historial.length === 2);
  check("Ni cambia la fecha", repetir.registro.salud.fecha === T1);

  const vieja = { ...b.registro, version: "2026-01-01" };
  const renovar = C.aplicar(vieja, { entrenamiento: true, salud: true }, T2);
  check("Con una política nueva, volver a aceptar sí queda registrado", renovar.cambiados.length === 2 && renovar.registro.version === C.VERSION_POLITICA);
  check("Una versión vieja no está vigente", C.resumen(vieja).vigente === false && C.resumen(renovar.registro).vigente === true);
}

console.log("\n▸ Retirar");
{
  const ambos = C.aplicar(null, { entrenamiento: true, salud: true }, T1).registro;
  const sinSalud = C.aplicar(ambos, { salud: false }, T2);
  check("Retira salud", sinSalud.ok && !C.aceptoSalud(sinSalud.registro) && C.aceptoEntrenamiento(sinSalud.registro));
  check("Avisa que retiró salud (para borrar)", sinSalud.retiroSalud === true);
  check("Registra el retiro", sinSalud.registro.historial.at(-1).aceptado === false && sinSalud.registro.historial.at(-1).fecha === T2);

  const nada = C.aplicar(ambos, { entrenamiento: false }, T2);
  check("Retirar entrenamiento retira también salud", !C.aceptoEntrenamiento(nada.registro) && !C.aceptoSalud(nada.registro));
  check("Y avisa que retiró salud", nada.retiroSalud === true);

  const soloEntr = C.aplicar(null, { entrenamiento: true }, T1).registro;
  const r = C.aplicar(soloEntr, { entrenamiento: false }, T2);
  check("Retirar sin haber dado salud no dispara borrado de salud", r.retiroSalud === false);

  // Salud aceptado pero entrenamiento no (registro raro a mano): no cuenta como salud.
  check("Salud sin entrenamiento no vale", !C.aceptoSalud({ entrenamiento: { aceptado: false }, salud: { aceptado: true } }));
}

console.log("\n▸ Historial acotado");
{
  let r = null;
  for (let i = 0; i < 80; i++) r = C.aplicar(r, { entrenamiento: i % 2 === 0 }, `2026-11-${String(10 + (i % 18)).padStart(2, "0")}T00:00:00Z`).registro;
  check("El historial no crece sin fin", r.historial.length === 50, r.historial.length);
}

console.log("\n▸ Datos de salud");
{
  const d = S.limpiarDatos({ sueñoMin: 452, vfc: 61.37, fcReposo: 48, estres: 25, energiaMax: 85, spo2: 97, pasos: 12034, desconocido: 5, contraseña: "x" });
  check("Guarda los campos conocidos", d && d.sueñoMin === 452 && d.vfc === 61.4 && d.fcReposo === 48 && d.pasos === 12034);
  check("Descarta los desconocidos", d && !("desconocido" in d) && !("contraseña" in d));
  const r = S.limpiarDatos({ fcReposo: 5, spo2: 140, vfc: "abc", sueñoMin: -3 });
  check("Descarta valores fuera de rango o no numéricos", r === null);
  check("Acepta números en texto", S.limpiarDatos({ fcReposo: "50" })?.fcReposo === 50);
  check("Nulos y vacíos no cuentan", S.limpiarDatos({ fcReposo: null, vfc: "" }) === null);

  const ok = S.filaDeSalud({ studentId: "ana", fecha: "2026-11-10", fuente: "garmin", datos: { fcReposo: 50 } });
  check("Fila válida", ok.fila && ok.fila.student_id === "ana" && ok.fila.fuente === "garmin");
  check("Fecha inválida", !!S.filaDeSalud({ studentId: "ana", fecha: "10/11/2026", fuente: "garmin", datos: { fcReposo: 50 } }).error);
  check("Fecha imposible", !!S.filaDeSalud({ studentId: "ana", fecha: "2026-13-40", fuente: "garmin", datos: { fcReposo: 50 } }).error);
  check("Fuente desconocida", !!S.filaDeSalud({ studentId: "ana", fecha: "2026-11-10", fuente: "miapp", datos: { fcReposo: 50 } }).error);
  check("Sin alumno", !!S.filaDeSalud({ studentId: "", fecha: "2026-11-10", fuente: "garmin", datos: { fcReposo: 50 } }).error);
  check("Sin datos útiles", !!S.filaDeSalud({ studentId: "ana", fecha: "2026-11-10", fuente: "garmin", datos: { x: 1 } }).error);
  check("Las marcas de la política están", ["garmin", "coros", "polar", "suunto", "apple"].every(S.fuenteValida));
}

console.log(`\n${passed} pruebas OK, ${failed} fallidas.`);
if (failed) {
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
