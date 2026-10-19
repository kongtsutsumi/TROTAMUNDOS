// SIMULACRO: qué escribiría la app si leyera tu reloj ahora mismo.
//
// No toca nada. Ni la base de datos, ni tu calendario, ni intervals.icu (solo lee).
// Pasa tus actividades reales por el MISMO código que usa la app —lib/intervals-read.mjs—
// y enseña, actividad por actividad, la fila que te aparecería en la tabla.
//
// Uso, dentro de trotamundos-web (dos órdenes, cada una con su Enter):
//   export INTERVALS_API_KEY=tu_clave_de_verdad
//   node pruebas/intervals-simular-lectura.mjs

import {
  descifrarExternalId,
  resumenDeActividad,
  logConLectura,
  tramosDeCalidad,
  ritmoDeLasSeries,
} from "../lib/intervals-read.mjs";

const API = "https://intervals.icu/api/v1";
const clave = process.env.INTERVALS_API_KEY;
if (!clave) {
  console.error("Falta la clave. Son DOS órdenes separadas:\n");
  console.error("  export INTERVALS_API_KEY=tu_clave_de_verdad");
  console.error("  node pruebas/intervals-simular-lectura.mjs\n");
  process.exit(1);
}
const cabeceras = { Authorization: "Basic " + Buffer.from(`API_KEY:${clave}`).toString("base64") };

const local = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const hace = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return local(d); };

async function pedir(ruta, { tolerante = false } = {}) {
  let res;
  try {
    res = await fetch(`${API}${ruta}`, { headers: cabeceras });
  } catch (e) {
    if (tolerante) return null;
    console.error("\n✗ No se pudo llegar a intervals.icu. ¿Tenés internet?\n");
    process.exit(1);
  }
  if (!res.ok) {
    if (tolerante) return null;
    if (res.status === 401) {
      console.error("\n✗ intervals.icu no acepta la clave.\n");
      console.error("  Casi siempre es porque la terminal todavía tiene en memoria una clave");
      console.error("  anterior. Exportá la actual encima y volvé a correrlo:\n");
      console.error("    export INTERVALS_API_KEY=la_clave_de_ahora");
      console.error("    node pruebas/intervals-simular-lectura.mjs\n");
      console.error("  La clave se saca en intervals.icu → /settings → Developer Settings.\n");
      process.exit(1);
    }
    console.error(`\n✗ ${ruta} → ${res.status}`);
    console.error((await res.text().catch(() => "")).slice(0, 300));
    process.exit(1);
  }
  return res.json();
}

const DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

const actividades = await pedir(`/athlete/0/activities?oldest=${hace(10)}&newest=${local(new Date())}`);
const eventos = (await pedir(`/athlete/0/events?oldest=${hace(10)}&newest=${local(new Date())}`)) || [];

if (!actividades?.length) {
  console.log("\nNo hay actividades en los últimos 10 días.\n");
  process.exit(0);
}

const porEvento = new Map();
for (const e of eventos) if (e?.id != null && e?.external_id) porEvento.set(String(e.id), e);

console.log(`\n${actividades.length} actividad(es) en los últimos 10 días.\n`);

for (const act of actividades) {
  const evento = porEvento.get(String(act.paired_event_id ?? ""));
  const ref = evento ? descifrarExternalId(evento.external_id) : null;

  const d = await pedir(`/activity/${act.id}/intervals`, { tolerante: true });
  const crudas = d?.icu_intervals || d?.intervals || (Array.isArray(d) ? d : []);
  const resumen = resumenDeActividad(act, crudas);

  console.log("─".repeat(66));
  console.log(`${act.start_date_local?.slice(0, 10)}  ${DIAS[(new Date(act.start_date_local).getDay() + 6) % 7]}  ·  ${act.name || "sin nombre"}`);

  if (ref) {
    console.log(`  Sesión del plan : semana ${ref.semana}, día ${ref.dia + 1} (${DIAS[ref.dia]}) — enlace exacto`);
    console.log(`  Lo planificado  : ${evento.name || "—"}`);
  } else if (act.paired_event_id) {
    console.log(`  Sesión del plan : enlazada a un evento que no puso TROTAMUNDOS`);
  } else {
    console.log(`  Sesión del plan : sin enlace — se asignaría por fecha, o quedaría como actividad extra`);
  }

  // La fila que vería el alumno. Se simula sobre un día suave y sobre uno de calidad,
  // porque la regla del ritmo cambia entre los dos y es lo que conviene comprobar.
  const vacio = { completed: false, actualKm: "", actualPaceStr: "", rpe: "", note: "" };
  const diaSuave = { paceKey: "E", km: 8, easyPace: 5.8 };
  const fila = logConLectura(vacio, resumen, diaSuave, 5.8).log;

  console.log(`\n  LO QUE VERÍA EL ALUMNO`);
  console.log(`    Sesión completada : ${fila.completed ? "✓ marcada" : "— sin marcar"}`);
  console.log(`    Km reales         : ${fila.actualKm || "—"}`);
  console.log(`    Ritmo real        : ${fila.actualPaceStr || "—"}   (en un día suave)`);
  console.log(`    RPE               : ${fila.rpe === "" ? "vacío, lo pone él" : fila.rpe}`);

  console.log(`\n  LO QUE VERÍAS VOS, ADEMÁS`);
  console.log(`    Tiempo            : ${resumen.min} min`);
  console.log(`    Pulso             : ${resumen.fcMedia ?? "—"} medias / ${resumen.fcMax ?? "—"} máx`);
  console.log(`    Cadencia          : ${resumen.cadencia ?? "—"} pasos/min`);
  console.log(`    Desnivel          : +${resumen.subida ?? "—"} / −${resumen.bajada ?? "—"} m`);
  console.log(`    Carga             : ${resumen.carga ?? "—"}  ·  intensidad ${resumen.intensidad ?? "—"}%`);
  console.log(`    Reloj             : ${resumen.dispositivo ?? "—"}`);
  console.log(`    Parciales         : ${resumen.vueltas.length || "ninguno"}`);

  // La regla delicada: en un día de calidad el ritmo NO es el promedio de la salida.
  // Acá se ve si las vueltas permiten aislar las series o si el campo quedaría vacío.
  const diaI = { paceKey: "I", km: 12, distOverride: 1, repsOverride: 6, paceOverride: 4.1666667, recoveryOverride: 3, easyPace: 5.8 };
  const aislado = ritmoDeLasSeries(resumen.vueltas, tramosDeCalidad(diaI, 5.8));
  console.log(`\n  SI ESTE DÍA HUBIERA SIDO 6 x 1000`);
  console.log(`    Promedio de toda la salida : ${resumen.ritmo || "—"}/km  ← NO se anotaría`);
  console.log(`    Ritmo aislado de las series: ${aislado ? `${Math.floor(aislado)}:${String(Math.round((aislado % 1) * 60)).padStart(2, "0")}/km` : "no se puede aislar → el campo queda vacío para que lo ponga el alumno"}`);
  console.log("");
}

console.log("─".repeat(66));
console.log("Nada de esto se guardó: fue solo un simulacro.\n");
