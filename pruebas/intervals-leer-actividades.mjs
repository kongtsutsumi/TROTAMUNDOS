// SONDA: ¿qué nos devuelve intervals.icu de una actividad ya entrenada?
//
// No modifica nada: solo lee y muestra. Sirve para contestar tres preguntas antes de
// construir la vuelta de los datos:
//
//   1. ¿La actividad viene emparejada con el entrenamiento planificado? (paired_event_id)
//   2. ¿Qué campos trae, y con qué nombres exactos?
//   3. ¿Vienen las vueltas (los parciales de cada serie)?
//
// Uso, dentro de trotamundos-web:
//   export INTERVALS_API_KEY=tu_clave
//   node pruebas/intervals-leer-actividades.mjs
//
// La clave se saca en intervals.icu → /settings → abajo, "Developer Settings".

const API = "https://intervals.icu/api/v1";
const clave = process.env.INTERVALS_API_KEY;
if (!clave) {
  console.error("Falta la clave. Usá:  export INTERVALS_API_KEY=tu_clave");
  process.exit(1);
}
const cabeceras = { Authorization: "Basic " + Buffer.from(`API_KEY:${clave}`).toString("base64") };

const local = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const hace = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return local(d); };

async function pedir(ruta) {
  const res = await fetch(`${API}${ruta}`, { headers: cabeceras });
  if (!res.ok) {
    console.error(`\n✗ ${ruta} → ${res.status}`);
    console.error((await res.text().catch(() => "")).slice(0, 300));
    process.exit(1);
  }
  return res.json();
}

// --- 1. Actividades de los últimos días ---
const actividades = await pedir(`/athlete/0/activities?oldest=${hace(7)}&newest=${local(new Date())}`);
if (!actividades.length) {
  console.log("No hay actividades en los últimos 7 días. ¿Sincronizaste el reloj?");
  process.exit(0);
}

console.log(`\n${actividades.length} actividad(es) en los últimos 7 días:\n`);
for (const a of actividades) {
  const km = a.distance != null ? (a.distance / 1000).toFixed(2) + " km" : "—";
  const min = a.moving_time != null ? Math.round(a.moving_time / 60) + " min" : "—";
  console.log(`  ${a.start_date_local?.slice(0, 16)}  ${String(a.type).padEnd(10)} ${km.padStart(10)}  ${min.padStart(8)}  ${a.name || ""}`);
  console.log(`      emparejada con el plan: ${a.paired_event_id ? "SÍ · evento " + a.paired_event_id : "no"}`);
}

// --- 2. Todos los campos de la más reciente ---
const ult = actividades[0];
console.log(`\n${"─".repeat(60)}\nCampos de la más reciente (${ult.start_date_local?.slice(0, 10)}):\n`);
const interesa = /dist|time|speed|pace|heart|hr|watt|cadence|elev|calor|type|name|date|paired|icu_|load|zone/i;
const campos = Object.entries(ult)
  .filter(([k, v]) => v !== null && v !== undefined && typeof v !== "object" && interesa.test(k))
  .sort(([a], [b]) => a.localeCompare(b));
for (const [k, v] of campos) console.log(`  ${k.padEnd(32)} ${String(v).slice(0, 40)}`);
console.log(`\n  (${Object.keys(ult).length} campos en total; arriba solo los relevantes)`);

// --- 3. ¿Vienen las vueltas? ---
console.log(`\n${"─".repeat(60)}\nVueltas (los parciales de cada serie):\n`);
const res = await fetch(`${API}/activity/${ult.id}/intervals`, { headers: cabeceras });
if (!res.ok) {
  console.log(`  no disponibles por esta vía (${res.status})`);
} else {
  const d = await res.json();
  const vueltas = d?.icu_intervals || d?.intervals || (Array.isArray(d) ? d : []);
  if (!vueltas.length) console.log("  la actividad no tiene vueltas marcadas");
  else {
    console.log(`  ${vueltas.length} vueltas:\n`);
    vueltas.slice(0, 14).forEach((v, i) => {
      const km = v.distance != null ? (v.distance / 1000).toFixed(2) : "—";
      const seg = v.moving_time ?? v.elapsed_time;
      const ritmo = v.distance && seg ? `${Math.floor((seg / 60) / (v.distance / 1000))}:${String(Math.round(((seg / 60) / (v.distance / 1000) % 1) * 60)).padStart(2, "0")}/km` : "—";
      console.log(`   ${String(i + 1).padStart(2)}. ${String(v.type || v.label || "").padEnd(10)} ${km.padStart(6)} km  ${String(seg ?? "—").padStart(5)} s  ${ritmo.padStart(9)}`);
    });
    if (vueltas.length > 14) console.log(`   … y ${vueltas.length - 14} más`);
  }
}

// --- 4. Los entrenamientos que mandamos nosotros ---
console.log(`\n${"─".repeat(60)}\nEntrenamientos que puso TROTAMUNDOS en tu calendario:\n`);
const eventos = await pedir(`/athlete/0/events?oldest=${hace(7)}&newest=${local(new Date())}`);
const mios = (eventos || []).filter((e) => (e.external_id || "").startsWith("trotamundos"));
if (!mios.length) console.log("  ninguno en estas fechas");
else for (const e of mios) {
  console.log(`  id ${e.id}  ${e.start_date_local?.slice(0, 10)}  ${e.name || ""}`);
  console.log(`      nuestro identificador: ${e.external_id}`);
}
console.log("");
