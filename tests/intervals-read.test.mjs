// Pruebas de la lectura de lo entrenado (lib/intervals-read.mjs).
//
// Lo que verifican, en orden de importancia:
//
//   · Que una actividad se pueda devolver a su sesión exacta (alumno, semana, día).
//   · Que los números que ve el alumno cuadren con los del reloj.
//   · Que el ritmo de una sesión de calidad SOLO se rellene cuando se pueden aislar
//     las series. Es la regla que más fácil se rompe sin darse cuenta, y la que más
//     daño hace: ese campo alimenta las conclusiones del reporte semanal del coach.
//   · Que nunca se pise lo que el alumno escribió, y que el RPE no se toque jamás.
//
// Cómo correrlas:  npm test

import * as R from "../lib/intervals-read.mjs";
import { externalIdFor } from "../lib/intervals-icu.mjs";

let passed = 0, failed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) { passed++; }
  else { failed++; failures.push(`${name}${detail ? ` — ${detail}` : ""}`); }
}

// ============================================================
// 1. DE QUÉ SESIÓN ES ESTA ACTIVIDAD
// ============================================================
console.log("\n▸ Identificar la sesión a la que pertenece una actividad");
{
  const r = R.descifrarExternalId("trotamundos-abc123-s18-d2");
  check("Descifra alumno, semana y día",
    r && r.studentId === "abc123" && r.semana === 18 && r.dia === 2,
    JSON.stringify(r));

  // El identificador del alumno puede llevar guiones: partir por guiones rompería esto.
  const conGuiones = R.descifrarExternalId("trotamundos-jaime-kong-2024-s5-d0");
  check("Soporta identificadores de alumno con guiones",
    conGuiones && conGuiones.studentId === "jaime-kong-2024" && conGuiones.semana === 5 && conGuiones.dia === 0,
    JSON.stringify(conGuiones));

  check("Rechaza una semana 0", R.descifrarExternalId("trotamundos-abc-s0-d2") === null);
  check("Rechaza un día fuera de la semana", R.descifrarExternalId("trotamundos-abc-s1-d9") === null);
  check("Ignora lo que no puso esta app", R.descifrarExternalId("otraapp-abc-s1-d2") === null);
  check("No se cae con basura", R.descifrarExternalId(null) === null && R.descifrarExternalId("") === null);

  // Ida y vuelta contra el generador real: si uno cambia, esta prueba lo caza.
  for (const [id, sem, dia] of [["a", 1, 0], ["alumno-7", 23, 6], ["x-y-z", 104, 3]]) {
    const vuelta = R.descifrarExternalId(externalIdFor(id, sem, dia));
    check(`Ida y vuelta ${id}/s${sem}/d${dia}`,
      vuelta && vuelta.studentId === id && vuelta.semana === sem && vuelta.dia === dia,
      JSON.stringify(vuelta));
  }
}

console.log("\n▸ Ubicar una fecha dentro del plan");
{
  const alumno = { planStartMonday: "2026-06-15" }; // un lunes
  check("El lunes de arranque es semana 1, día 0",
    JSON.stringify(R.semanaYDiaDeFecha(alumno, "2026-06-15")) === '{"semana":1,"dia":0}');
  check("El domingo de esa semana es día 6",
    JSON.stringify(R.semanaYDiaDeFecha(alumno, "2026-06-21")) === '{"semana":1,"dia":6}');
  check("El lunes siguiente abre la semana 2",
    JSON.stringify(R.semanaYDiaDeFecha(alumno, "2026-06-22")) === '{"semana":2,"dia":0}');
  check("Acepta una fecha con hora pegada",
    JSON.stringify(R.semanaYDiaDeFecha(alumno, "2026-10-19T10:11:31")) === '{"semana":19,"dia":0}',
    JSON.stringify(R.semanaYDiaDeFecha(alumno, "2026-10-19T10:11:31")));
  check("Antes del arranque del plan no hay casilla",
    R.semanaYDiaDeFecha(alumno, "2026-06-14") === null);
  check("Sin fecha de arranque no se adivina",
    R.semanaYDiaDeFecha({}, "2026-10-19") === null);
}

console.log("\n▸ A qué sesión pertenece cada actividad");
{
  const alumno = {
    id: "ana",
    planStartMonday: "2026-10-05",
    weeks: {
      2: {
        plan: [{ paceKey: "E", km: 8 }, { paceKey: null }, { paceKey: "I", km: 12 },
               { paceKey: null }, { paceKey: "E", km: 6 }, { paceKey: null }, { paceKey: "long", km: 18 }],
        log: [{ completed: false }, {}, { completed: true }, {}, {}, {}, {}],
      },
    },
  };
  const mapa = new Map([
    ["900", "trotamundos-ana-s2-d2"],
    ["901", "trotamundos-otro-s2-d2"],
    ["902", "algo-que-no-es-nuestro"],
  ]);

  const exacta = R.ubicarActividad({ paired_event_id: 900, start_date_local: "2026-10-14T07:00:00" }, mapa, alumno);
  check("Con emparejamiento manda el evento, no la fecha",
    exacta && exacta.semana === 2 && exacta.dia === 2 && exacta.via === "evento", JSON.stringify(exacta));

  check("Un evento de OTRO alumno no se escribe en esta ficha",
    R.ubicarActividad({ paired_event_id: 901, start_date_local: "2026-10-12T07:00:00" }, mapa, alumno) === null);

  check("Un evento que no puso esta app se ignora",
    R.ubicarActividad({ paired_event_id: 902, start_date_local: "2026-10-12T07:00:00" }, mapa, alumno) === null);

  // Sin emparejar: cae a la fecha, pero solo donde tiene sentido.
  const porFecha = R.ubicarActividad({ start_date_local: "2026-10-12T07:00:00" }, mapa, alumno);
  check("Sin emparejar cae a la fecha y lo deja dicho",
    porFecha && porFecha.semana === 2 && porFecha.dia === 0 && porFecha.via === "fecha", JSON.stringify(porFecha));

  check("Un día de descanso no recibe la actividad",
    R.ubicarActividad({ start_date_local: "2026-10-13T07:00:00" }, mapa, alumno) === null);

  check("Una sesión ya marcada por el alumno no se toca",
    R.ubicarActividad({ start_date_local: "2026-10-14T07:00:00" }, mapa, alumno) === null);

  check("Una fecha sin semana en el plan no ubica nada",
    R.ubicarActividad({ start_date_local: "2026-11-30T07:00:00" }, mapa, alumno) === null);

  check("No se cae sin datos", R.ubicarActividad(null, mapa, alumno) === null);
}

// ============================================================
// 2. EL RESUMEN DE LA ACTIVIDAD
// ============================================================
console.log("\n▸ Resumen de una actividad real");
{
  // Datos exactos de una carrera real sincronizada desde un COROS PACE 4.
  const actividad = {
    id: 123456,
    name: "Morning Run",
    type: "Run",
    device_name: "COROS PACE 4",
    start_date_local: "2026-10-19T10:11:31",
    distance: 8002.18,
    moving_time: 2576,
    elapsed_time: 2597,
    average_heartrate: 134,
    max_heartrate: 148,
    average_cadence: 87.69786,
    total_elevation_gain: 94.084915,
    total_elevation_loss: 114.2744,
    calories: 479,
    icu_training_load: 27,
    icu_intensity: 61.19005,
  };

  const s = R.resumenDeActividad(actividad, []);
  check("Los metros se vuelven kilómetros", s.km === 8, `dio ${s.km}`);
  check("Los segundos se vuelven minutos", s.min === 42.9, `dio ${s.min}`);
  check("El ritmo sale de la distancia y el tiempo, no del campo en m/s",
    s.ritmo === "5:22", `dio ${s.ritmo}`);
  check("La cadencia se expresa en pasos por minuto", s.cadencia === 175, `dio ${s.cadencia}`);
  check("Frecuencia cardiaca media y máxima", s.fcMedia === 134 && s.fcMax === 148);
  check("Desnivel redondeado", s.subida === 94 && s.bajada === 114, `+${s.subida}/-${s.bajada}`);
  check("Carga e intensidad", s.carga === 27 && s.intensidad === 61, `${s.carga}/${s.intensidad}`);
  check("Conserva el reloj que la registró", s.dispositivo === "COROS PACE 4");

  check("Una actividad vacía no produce resumen", R.resumenDeActividad(null) === null);

  // Un alumno puede tener una actividad sin distancia (cinta sin calibrar, por ejemplo).
  const sinDistancia = R.resumenDeActividad({ id: 9, moving_time: 1800 }, []);
  check("Sin distancia no inventa kilómetros ni ritmo",
    sinDistancia.km === null && sinDistancia.ritmo === null && sinDistancia.min === 30,
    JSON.stringify(sinDistancia));
}

// ============================================================
// 3. LAS VUELTAS
// ============================================================
console.log("\n▸ Vueltas de la actividad");
{
  const vueltas = [
    { type: "WORK", distance: 2450, moving_time: 780 },
    { type: "WORK", distance: 90, moving_time: 60 },
    { type: "RECOVERY", elapsed_time: 1 },           // sin distancia
  ];
  const s = R.resumenDeActividad({ id: 1, distance: 8000, moving_time: 2576 }, vueltas);
  check("Guarda las vueltas con su ritmo", s.vueltas.length === 3 && s.vueltas[0].ritmo === "5:18",
    JSON.stringify(s.vueltas[0]));
  check("Una vuelta sin distancia no inventa ritmo", s.vueltas[2].ritmo === null && s.vueltas[2].km === null);
}

// ============================================================
// 4. EL RITMO DE LAS SERIES  (la regla que más importa)
// ============================================================
console.log("\n▸ Ritmo real de una sesión de calidad");
{
  const easyPace = 5.8;
  const diaI = {
    paceKey: "I", type: "Intervalos", km: 12,
    distOverride: 1, repsOverride: 6, paceOverride: 4.1666667,
    recoveryOverride: 3, easyPace,
  };

  const tramos = R.tramosDeCalidad(diaI, easyPace);
  check("Las series son tramos de calidad; el calentamiento y las recuperaciones no",
    tramos.length === 6 && tramos.every((t) => t.type === "distance" && t.target === 1),
    `dio ${tramos.length} tramos`);

  // Una sesión bien ejecutada, con vuelta marcada en cada serie.
  const bienHecha = [
    { km: 3.0, seg: 1050 },                       // calentamiento
    { km: 1.00, seg: 250 }, { km: 0.52, seg: 180 },
    { km: 1.00, seg: 250 }, { km: 0.52, seg: 180 },
    { km: 1.00, seg: 250 }, { km: 0.52, seg: 180 },
    { km: 1.00, seg: 250 }, { km: 0.52, seg: 180 },
    { km: 1.00, seg: 250 }, { km: 0.52, seg: 180 },
    { km: 1.00, seg: 250 },
    { km: 2.0, seg: 700 },                        // vuelta a la calma
  ];
  const ritmo = R.ritmoDeLasSeries(bienHecha, tramos);
  check("Aísla las 6 series y promedia solo esas",
    ritmo != null && Math.abs(ritmo - 4.1666667) < 0.01, `dio ${ritmo}`);

  const resumenBien = { ritmo: "5:12", vueltas: bienHecha };
  check("El ritmo que se anota es el de las series, no el de la salida entera",
    R.ritmoParaElRegistro(diaI, resumenBien, easyPace) === "4:10",
    R.ritmoParaElRegistro(diaI, resumenBien, easyPace));

  // Hizo 5 de las 6: la sesión no es la planificada y no hay nada que promediar.
  const incompleta = bienHecha.filter((_, i) => i !== 11);
  check("Si falta una serie, no se inventa un promedio",
    R.ritmoDeLasSeries(incompleta, tramos) === null);

  // Reloj en vueltas automáticas de 1 km sobre una sesión de 8 x 200 m.
  const diaR = { ...diaI, paceKey: "R", distOverride: 0.2, repsOverride: 8, paceOverride: 3.6, km: 10 };
  const tramosR = R.tramosDeCalidad(diaR, easyPace);
  const autoVueltas = Array.from({ length: 10 }, () => ({ km: 1.0, seg: 300 }));
  check("Vueltas automáticas que no se parecen a las series: no se rellena",
    R.ritmoDeLasSeries(autoVueltas, tramosR) === null);

  check("Sin vueltas no hay ritmo de series",
    R.ritmoParaElRegistro(diaI, { ritmo: "5:12", vueltas: [] }, easyPace) === null);

  // En un día suave el promedio de la salida SÍ es el ritmo real de la sesión.
  const diaE = { paceKey: "E", type: "Suave", km: 8, easyPace };
  check("En un día suave sí se anota el promedio",
    R.ritmoParaElRegistro(diaE, { ritmo: "5:40", vueltas: [] }, easyPace) === "5:40");
  check("Un día suave no es sesión de calidad", R.esDeCalidad(diaE) === false);
  check("Un día de intervalos sí lo es", R.esDeCalidad(diaI) === true);
}

// ============================================================
// 5. EL REGISTRO DEL DÍA
// ============================================================
console.log("\n▸ Qué se escribe en el registro del alumno");
{
  const easyPace = 5.8;
  const diaE = { paceKey: "E", type: "Suave", km: 5, easyPace };
  const resumen = R.resumenDeActividad(
    { id: 77, distance: 8002.18, moving_time: 2576, average_heartrate: 134 }, []);

  // Registro vacío: el reloj lo completa, menos el RPE y la nota.
  const vacio = { completed: false, actualKm: "", actualPaceStr: "", rpe: "", note: "" };
  const a = R.logConLectura(vacio, resumen, diaE, easyPace);
  check("Marca la sesión como hecha", a.log.completed === true);
  check("Rellena los kilómetros reales", a.log.actualKm === "8", `dio ${a.log.actualKm}`);
  check("Rellena el ritmo en un día suave", a.log.actualPaceStr === "5:22", a.log.actualPaceStr);
  check("NO toca el RPE", a.log.rpe === "");
  check("NO toca la nota", a.log.note === "");
  check("Guarda el detalle del reloj", a.log.reloj && a.log.reloj.fcMedia === 134);
  check("Avisa de que hay que guardar", a.cambio === true);

  // Lo que el alumno escribió manda: el reloj no lo pisa.
  const aMano = { completed: true, actualKm: "7.5", actualPaceStr: "5:30", rpe: "6", note: "pesado" };
  const b = R.logConLectura(aMano, resumen, diaE, easyPace);
  check("No pisa los kilómetros que puso el alumno", b.log.actualKm === "7.5");
  check("No pisa el ritmo que puso el alumno", b.log.actualPaceStr === "5:30");
  check("Conserva el RPE del alumno", b.log.rpe === "6");
  check("Conserva su nota", b.log.note === "pesado");
  check("Aun así guarda el detalle del reloj", b.log.reloj && b.log.reloj.km === 8);

  // Volver a leer lo mismo no debe provocar una escritura.
  const c = R.logConLectura(a.log, resumen, diaE, easyPace);
  check("Leer dos veces lo mismo no cambia nada", c.cambio === false);

  // Una sesión de calidad sin vueltas aprovechables deja el ritmo al alumno.
  const diaI = { paceKey: "I", type: "Intervalos", km: 12, distOverride: 1, repsOverride: 6,
    paceOverride: 4.1666667, recoveryOverride: 3, easyPace };
  const d = R.logConLectura(vacio, resumen, diaI, easyPace);
  check("En calidad sin vueltas: km sí, ritmo no", d.log.actualKm === "8" && d.log.actualPaceStr === "");

  // El alumno desmarca una sesión que el reloj había marcado: la app no se la vuelve a
  // marcar en la siguiente lectura. Sin esto, pelearía con él cada cuarto de hora.
  const desmarcada = { ...a.log, completed: false };
  const f = R.logConLectura(desmarcada, resumen, diaE, easyPace);
  check("Si el alumno desmarca, el reloj no se la vuelve a marcar", f.log.completed === false);
  check("Y no hay nada que volver a guardar", f.cambio === false);

  // Pero una actividad DISTINTA el mismo día sí la marca: es una sesión nueva.
  const otra = R.resumenDeActividad({ id: 78, distance: 6000, moving_time: 1900 }, []);
  const g = R.logConLectura(desmarcada, otra, diaE, easyPace);
  check("Una actividad nueva sí marca la sesión", g.log.completed === true);

  // Sin actividad no se inventa nada.
  const e = R.logConLectura(vacio, null, diaE, easyPace);
  check("Sin actividad no se marca nada", e.cambio === false && e.log.completed === false);
}

console.log("\n▸ Traer lo del reloj a una pantalla que ya estaba abierta");
{
  const reloj = { id: 5, km: 8, ritmo: "5:22" };

  // La pantalla del alumno: está escribiendo su RPE justo cuando llega la lectura.
  const enPantalla = {
    id: "ana",
    weeks: { 3: { plan: [{ paceKey: "E" }, { paceKey: "I" }],
                  log: [{ completed: true, actualKm: "8", rpe: "7" }, { completed: false }] } },
  };
  const fresco = {
    id: "ana",
    weeks: { 3: { plan: [{ paceKey: "E" }, { paceKey: "I" }],
                  log: [{ completed: true, actualKm: "8", rpe: "", reloj }, { completed: false }],
                  extras: [{ id: 9 }] } },
  };

  const r = R.fusionarLoDelReloj(enPantalla, fresco);
  check("Trae el bloque del reloj", JSON.stringify(r.weeks[3].log[0].reloj) === JSON.stringify(reloj));
  check("NO pisa el RPE a medio escribir", r.weeks[3].log[0].rpe === "7", r.weeks[3].log[0].rpe);
  check("Trae las actividades extra", JSON.stringify(r.weeks[3].extras) === JSON.stringify([{ id: 9 }]));

  // Sin novedades devuelve el MISMO objeto, para que React no repinte de balde.
  check("Sin novedades no crea un objeto nuevo", R.fusionarLoDelReloj(r, fresco) === r);
  check("Sin registro fresco no hace nada", R.fusionarLoDelReloj(enPantalla, null) === enPantalla);
  check("No mezcla fichas de alumnos distintos",
    R.fusionarLoDelReloj(enPantalla, { ...fresco, id: "otro" }) === enPantalla);
  check("Una semana que la pantalla no tiene no se inventa",
    R.fusionarLoDelReloj(enPantalla, { id: "ana", weeks: { 9: { log: [{ reloj }] } } }).weeks[9] === undefined);
}

// ============================================================
// 6. ACTIVIDADES SIN SESIÓN PLANIFICADA
// ============================================================
console.log("\n▸ Actividades que no corresponden a ninguna sesión");
{
  const uno = R.resumenDeActividad({ id: 1, distance: 5000, moving_time: 1500 }, []);
  const dos = R.resumenDeActividad({ id: 2, distance: 9000, moving_time: 2700 }, []);

  let { extras, cambio } = R.conActividadExtra([], uno);
  check("Se añade la actividad extra", extras.length === 1 && cambio === true);

  ({ extras, cambio } = R.conActividadExtra(extras, dos));
  check("Se añade una segunda", extras.length === 2 && cambio === true);

  ({ extras, cambio } = R.conActividadExtra(extras, uno));
  check("No se duplica la misma actividad", extras.length === 2 && cambio === false);

  ({ extras, cambio } = R.conActividadExtra(extras, null));
  check("Una actividad sin identificador no se guarda", extras.length === 2 && cambio === false);
}


console.log("\n▸ Varias salidas en un mismo día");
{
  const alumno = {
    id: "ana",
    planStartMonday: "2026-10-19",
    weeks: {
      1: {
        plan: [{ paceKey: "E", km: 8 }, { paceKey: null }, { paceKey: "I", km: 12 },
               { paceKey: null }, { paceKey: "E", km: 6 }, { paceKey: null }, { paceKey: "long", km: 18 }],
        log: [{}, {}, {}, {}, {}, {}, {}],
      },
    },
  };

  const act = (id, fecha, km) => ({ id, fecha, km });
  const enSitio = (semana, dia, via) => ({ semana, dia, via });

  // --- Dos salidas sueltas el mismo día ---
  {
    const items = [
      { resumen: act(2, "2026-10-19T18:30:00", 6), sitio: enSitio(1, 0, "fecha") },
      { resumen: act(1, "2026-10-19T07:00:00", 8), sitio: enSitio(1, 0, "fecha") },
    ];
    const { alPlan, adicionales } = R.repartirActividades(items, alumno);
    check("Solo una se queda con la sesión", alPlan.length === 1, `fueron ${alPlan.length}`);
    check("Se queda la PRIMERA del día", alPlan[0]?.resumen.id === 1, `se quedó la ${alPlan[0]?.resumen.id}`);
    check("La otra queda como salida adicional", adicionales.length === 1 && adicionales[0]?.resumen.id === 2);
    check("Y conserva el día que le toca", adicionales[0]?.dia === 0 && adicionales[0]?.semana === 1);
  }

  // --- La enlazada al plan manda, aunque sea la segunda del día ---
  {
    const items = [
      { resumen: act(1, "2026-10-19T07:00:00", 4), sitio: enSitio(1, 0, "fecha") },
      { resumen: act(2, "2026-10-19T19:00:00", 8), sitio: enSitio(1, 0, "evento") },
    ];
    const { alPlan, adicionales } = R.repartirActividades(items, alumno);
    check("El enlace exacto gana a la hora", alPlan[0]?.resumen.id === 2, `se quedó la ${alPlan[0]?.resumen.id}`);
    check("La de la mañana pasa a adicional", adicionales.length === 1 && adicionales[0]?.resumen.id === 1);
  }

  // --- Tres el mismo día ---
  {
    const items = [
      { resumen: act(1, "2026-10-19T06:00:00", 5), sitio: enSitio(1, 0, "fecha") },
      { resumen: act(2, "2026-10-19T12:00:00", 3), sitio: enSitio(1, 0, "fecha") },
      { resumen: act(3, "2026-10-19T20:00:00", 4), sitio: enSitio(1, 0, "fecha") },
    ];
    const { alPlan, adicionales } = R.repartirActividades(items, alumno);
    check("Con tres salidas, una a la sesión y dos adicionales",
      alPlan.length === 1 && adicionales.length === 2, `${alPlan.length} y ${adicionales.length}`);
    check("Ninguna se pierde",
      new Set([alPlan[0]?.resumen.id, ...adicionales.map((a) => a.resumen.id)]).size === 3);
  }

  // --- Días distintos no se estorban ---
  {
    const items = [
      { resumen: act(1, "2026-10-19T07:00:00", 8), sitio: enSitio(1, 0, "evento") },
      { resumen: act(2, "2026-10-21T07:00:00", 12), sitio: enSitio(1, 2, "evento") },
    ];
    const { alPlan, adicionales } = R.repartirActividades(items, alumno);
    check("Dos días, dos sesiones, ninguna adicional",
      alPlan.length === 2 && adicionales.length === 0);
  }

  // --- Sin casilla: día de descanso, o sesión ya marcada ---
  {
    const items = [{ resumen: act(9, "2026-10-20T07:00:00", 5), sitio: null }];
    const { alPlan, adicionales } = R.repartirActividades(items, alumno);
    check("Una salida en día de descanso no toca el plan", alPlan.length === 0);
    check("Pero se guarda como adicional, en su día",
      adicionales.length === 1 && adicionales[0]?.semana === 1 && adicionales[0]?.dia === 1,
      JSON.stringify(adicionales[0]));
  }

  // --- Antes de que empezara el plan: se descarta ---
  {
    const items = [{ resumen: act(9, "2026-10-01T07:00:00", 5), sitio: null }];
    const { alPlan, adicionales } = R.repartirActividades(items, alumno);
    check("Lo anterior al plan no se guarda", alPlan.length === 0 && adicionales.length === 0);
  }

  check("Sin actividades no se cae",
    JSON.stringify(R.repartirActividades([], alumno)) === '{"alPlan":[],"adicionales":[]}');
  check("Sin lista tampoco",
    JSON.stringify(R.repartirActividades(null, alumno)) === '{"alPlan":[],"adicionales":[]}');
}

console.log("\n▸ Leer las salidas adicionales de cada día");
{
  const alumno = { id: "ana", planStartMonday: "2026-10-19" };
  const week = {
    extras: [
      { id: 1, km: 5, dia: 0, fecha: "2026-10-19T18:00:00" },
      { id: 2, km: 3, dia: 2, fecha: "2026-10-21T18:00:00" },
      { id: 3, km: 7, fecha: "2026-10-19T20:00:00" }, // guardada por una versión anterior
    ],
  };

  check("Encuentra las del lunes, con día guardado y sin él",
    R.extrasDelDia(week, 0, alumno, 1).length === 2,
    String(R.extrasDelDia(week, 0, alumno, 1).length));
  check("Y la del miércoles", R.extrasDelDia(week, 2, alumno, 1).length === 1);
  check("Un día sin adicionales devuelve lista vacía", R.extrasDelDia(week, 5, alumno, 1).length === 0);
  check("Una semana sin adicionales tampoco se cae", R.extrasDelDia({}, 0, alumno, 1).length === 0);

  check("Suma los kilómetros de más de la semana", R.kmAdicionalesDe(week) === 15, String(R.kmAdicionalesDe(week)));
  check("Sin adicionales, cero", R.kmAdicionalesDe({}) === 0);
}

// ============================================================
console.log("\n▸ Tiempo total y en movimiento (para el coach)");
{
  const r = R.resumenDeActividad({ id: 9, distance: 10000, moving_time: 3000, elapsed_time: 3440 });
  check("Guarda el tiempo total", r.segTotal === 3440, r.segTotal);
  check("Guarda el tiempo en movimiento", r.segMovimiento === 3000, r.segMovimiento);
  check("El ritmo sale del tiempo en movimiento", r.ritmo === "5:00", r.ritmo);
  const sinTotal = R.resumenDeActividad({ id: 10, distance: 5000, moving_time: 1500 });
  check("Sin tiempo total no inventa uno", sinTotal.segTotal === null && sinTotal.segMovimiento === 1500);
}

console.log("\n▸ Dónde paró (solo calidad y fondos, solo si paró 10 s o más)");
{
  const vuelta = (km, segMov, parado = 0) => ({ km, seg: segMov, segMov, segTotal: segMov + parado });
  const diaI = { paceKey: "I", type: "Intervalos", km: 10, distOverride: 1, repsOverride: 6, paceOverride: 4.5, recoveryOverride: 3, easyPace: 6 };
  const sesion = (paradas = {}) => {
    const v = [vuelta(3, 1080, paradas.wu || 0)];
    for (let r = 1; r <= 6; r++) {
      v.push(vuelta(1, 270, paradas["s" + r] || 0));
      if (r < 6) v.push(vuelta(0.45, 180, paradas["r" + r] || 0));
    }
    v.push(vuelta(2, 720, paradas.cd || 0));
    return { vueltas: v };
  };
  check("Sin paradas no aparece nada", R.paradasDeLaSesion(diaI, sesion(), 6).length === 0);
  const p1 = R.paradasDeLaSesion(diaI, sesion({ s4: 25, r2: 70 }), 6);
  check("Encuentra la parada dentro de la serie 4", p1.some((p) => p.donde === "Serie 4" && p.detenidoSeg === 25 && p.tipo === "trabajo"), JSON.stringify(p1));
  check("Encuentra la parada en la recuperación después de la serie 2", p1.some((p) => p.donde === "Recuperación después de la serie 2" && p.detenidoSeg === 70), JSON.stringify(p1));
  check("Solo esas dos", p1.length === 2, JSON.stringify(p1));
  check("Una parada de 8 s no se marca", R.paradasDeLaSesion(diaI, sesion({ s3: 8 }), 6).length === 0);
  check("Parar en el calentamiento o el enfriamiento no se marca",
    R.paradasDeLaSesion(diaI, sesion({ wu: 120, cd: 90 }), 6).length === 0);
  // Recuperación quieto: casi sin distancia.
  const quieto = sesion(); quieto.vueltas[4] = { km: 0.01, seg: 5, segMov: 5, segTotal: 180 };
  const p2 = R.paradasDeLaSesion(diaI, quieto, 6);
  check("Recuperación quieto (sin moverse) cuenta como parada", p2.length === 1 && p2[0].donde === "Recuperación después de la serie 2" && p2[0].detenidoSeg === 175, JSON.stringify(p2));
  // Una vuelta de más marcada a mano no corre la numeración de las series.
  const extra = sesion({ s5: 30 }); extra.vueltas.splice(2, 0, vuelta(0.1, 40));
  check("Una vuelta extra no desordena la numeración", R.paradasDeLaSesion(diaI, extra, 6)[0]?.donde === "Serie 5", JSON.stringify(R.paradasDeLaSesion(diaI, extra, 6)));

  // Con la marca WORK/RECOVERY de intervals.icu: una serie lenta (paró mucho) igual es serie.
  const marc = sesion({ s2: 40 }); marc.vueltas.forEach((v, k) => { v.t = k === 0 || k === marc.vueltas.length - 1 ? "RECOVERY" : (k % 2 === 1 ? "WORK" : "RECOVERY"); });
  marc.vueltas[3] = { ...marc.vueltas[3], segMov: 400, seg: 400, segTotal: 440 }; // serie 2 muy lenta
  check("Con la marca de intervals.icu, una serie lenta sigue siendo serie", R.paradasDeLaSesion(diaI, marc, 6)[0]?.donde === "Serie 2", JSON.stringify(R.paradasDeLaSesion(diaI, marc, 6)));

  const diaT = { paceKey: "T", type: "Umbral", km: 12, distOverride: 30, paceOverride: 4.6, easyPace: 6 };
  const tempo = { vueltas: [vuelta(3, 1080), vuelta(6.5, 1794, 40), vuelta(2, 720)] };
  const fracc = { paceKey: "brokenT", type: "Umbral fraccionado", km: 12, distOverride: 11, repsOverride: 3, recoveryOverride: 3, paceOverride: 4.4, easyPace: 6 };
  const fv = { vueltas: [vuelta(3, 1080), vuelta(2.5, 660), vuelta(0.45, 180, 60), vuelta(2.5, 660), vuelta(0.45, 180), vuelta(2.5, 660), vuelta(2, 720)] };
  check("Bloques: 'Recuperación después del bloque 1' (bien escrito)", R.paradasDeLaSesion(fracc, fv, 6)[0]?.donde === "Recuperación después del bloque 1", JSON.stringify(R.paradasDeLaSesion(fracc, fv, 6)));
  check("En umbral continuo se nombra 'Bloque 1'", R.paradasDeLaSesion(diaT, tempo, 6)[0]?.donde === "Bloque 1", JSON.stringify(R.paradasDeLaSesion(diaT, tempo, 6)));

  const fondo = { paceKey: "long", slot: "long", type: "Fondo", km: 20, longProgressive: true, longFastKm: 5, easyPace: 6, marathonPace: 5 };
  const fPasos = { vueltas: [vuelta(3, 1080, 60), vuelta(10, 3600, 95), vuelta(5, 1500), vuelta(2, 720)] };
  const pf = R.paradasDeLaSesion(fondo, fPasos, 6);
  check("Fondo iniciado desde el reloj: nombra el paso", pf.length === 1 && pf[0].donde === "En el bloque principal" && pf[0].detenidoSeg === 95, JSON.stringify(pf));
  const fKm = { vueltas: Array.from({ length: 20 }, (_, k) => vuelta(1, 330, k === 12 ? 50 : 0)) };
  const pk = R.paradasDeLaSesion(fondo, fKm, 6);
  check("Fondo con vueltas por km: dice en qué km", pk.length === 1 && pk[0].donde === "Entre el km 12 y el 13", JSON.stringify(pk));

  const suave = { paceKey: "E", type: "Suave", km: 8, easyPace: 6 };
  check("En un suave no se marca nada", R.paradasDeLaSesion(suave, { vueltas: [vuelta(4, 1440, 60), vuelta(4, 1440, 60)] }, 6).length === 0);
  check("Las vueltas guardan su tiempo total y en movimiento",
    R.resumenDeActividad({ id: 1, distance: 1000, moving_time: 300, elapsed_time: 300 }, [{ distance: 1000, moving_time: 270, elapsed_time: 295 }]).vueltas[0].segTotal === 295);
}

// --- Kilómetro por kilómetro ---
{
  // 3,5 km: el 1.º a 5:00, el 2.º a 4:40 con una parada de 60 s en medio, el 3.º a 5:20,
  // y medio km final a 5:00. Un registro por segundo.
  const tiempo = [], distancia = [], fc = [];
  let t = 0, d = 0;
  const tramo = (metros, segPorKm, pulso) => {
    const v = 1000 / segPorKm;
    const pasos = Math.round(metros / v);
    for (let i = 0; i < pasos; i++) { t++; d += v; tiempo.push(t); distancia.push(d); fc.push(pulso); }
  };
  tiempo.push(0); distancia.push(0); fc.push(120);
  tramo(1000, 300, 140);
  tramo(500, 280, 150);
  for (let i = 0; i < 60; i++) { t++; tiempo.push(t); distancia.push(d); fc.push(110); } // detenido
  tramo(500, 280, 152);
  tramo(1000, 320, 145);
  tramo(500, 300, 147);
  const kms = R.kmPorKm([{ type: "time", data: tiempo }, { type: "distance", data: distancia }, { type: "heartrate", data: fc }]);
  check("Km por km: 3 km completos y el medio final", kms.length === 4, JSON.stringify(kms));
  check("Km 1 a 5:00", kms[0]?.ritmo === "5:00", kms[0]?.ritmo);
  check("Km 2 a 4:40: la parada no lo hace más lento", kms[1]?.ritmo === "4:40", kms[1]?.ritmo);
  check("Km 3 a 5:20", kms[2]?.ritmo === "5:20", kms[2]?.ritmo);
  check("El tramo final dice cuánto midió", Math.abs((kms[3]?.km ?? 0) - 0.5) < 0.02 && kms[3]?.ritmo === "5:00", JSON.stringify(kms[3]));
  check("FC promedio del km (sin contar lo detenido)", kms[1]?.fc === 151, kms[1]?.fc);
  check("Sin datos, sin km por km", R.kmPorKm(null).length === 0 && R.kmPorKm([{ type: "time", data: [0] }]).length === 0);
  const res = R.resumenDeActividad({ id: 9, distance: 3500, moving_time: 1050 }, [], kms);
  check("El resumen guarda el km por km", res.kms?.length === 4);
  check("Sin km por km, el resumen no cambia de forma", !("kms" in R.resumenDeActividad({ id: 9, distance: 3500, moving_time: 1050 }, [])));
  const { extras } = R.conActividadExtra([{ id: 9, km: 3.5 }], res);
  check("Una salida adicional ya guardada recibe su km por km", extras.length === 1 && extras[0].kms?.length === 4);
}

console.log(`\n${"═".repeat(50)}`);
console.log(`  ${passed} pruebas pasaron, ${failed} fallaron`);
if (failures.length) {
  console.log(`\n  Fallos:`);
  for (const f of failures) console.log(`   ✗ ${f}`);
}
console.log(`${"═".repeat(50)}\n`);
process.exit(failed ? 1 : 0);
