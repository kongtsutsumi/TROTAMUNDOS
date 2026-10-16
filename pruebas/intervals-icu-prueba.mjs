// PRUEBA: ¿llegan los entrenamientos de TROTAMUNDOS al reloj vía intervals.icu?
//
// Esto NO toca la app ni la base de datos de los alumnos. Es un script suelto que:
//   1. genera una semana real con el motor de planes (lib/plan-engine.mjs),
//   2. traduce cada sesión al formato de texto de intervals.icu,
//   3. la escribe en TU calendario de intervals.icu con tu clave personal.
//
// Responde las dos preguntas que quedaron abiertas:
//   · ¿un entrenamiento subido por API llega de verdad al reloj?
//   · ¿los objetivos de RITMO pasan correctamente? (crítico: sin ritmo, las series no sirven)
//
// Uso:
//   node pruebas/intervals-icu-prueba.mjs --ver        → solo muestra la traducción, no envía nada
//   INTERVALS_API_KEY=xxx node pruebas/intervals-icu-prueba.mjs --enviar
//   INTERVALS_API_KEY=xxx node pruebas/intervals-icu-prueba.mjs --borrar
//
// La clave se saca en intervals.icu → /settings → abajo del todo, "Developer Settings".

import * as E from "../lib/plan-engine.mjs";

const API = "https://intervals.icu/api/v1";
const PREFIJO_ID = "trotamundos-prueba-"; // marca propia: permite actualizar y borrar sin tocar nada más

// --- Datos de la prueba -------------------------------------------------------
// Una semana de pico de un 21K: tiene series de 200m (ritmo R), umbral de 30' y fondo
// estructurado con cierre fuerte. Son justo los tres casos donde el ritmo importa.
const PRUEBA = {
  objetivo: "21k",
  nivel: "intermedio2",
  fase: "peak",
  kmSemana: 55,
  kmFondo: 16,
  marcaObjetivo: "4:30", // ritmo objetivo de la carrera, para derivar los ritmos de entrenamiento
  semanasParaCarrera: 6,
};

// --- Traducción al formato de intervals.icu -----------------------------------
// Su sintaxis: cada paso es "- <duración o distancia> <objetivo>".
//   distancia:  600mtr / 3km      (ojo: "m" significa MINUTOS, no metros)
//   tiempo:     30m / 90s
//   ritmo:      4:26/km Pace
//   repetir:    una línea "6x" y debajo los pasos del bloque, con una línea en blanco antes y después.

const fmtRitmo = (paceDec) => (paceDec ? `${E.formatPace(paceDec)}/km Pace` : "");

function fmtDistancia(km) {
  if (km >= 1) return `${Number(km.toFixed(2))}km`;
  return `${Math.round(km * 1000)}mtr`;
}
function fmtTiempo(min) {
  const seg = Math.round(min * 60);
  if (seg % 60 === 0) return `${seg / 60}m`;
  if (seg < 60) return `${seg}s`;
  return `${Math.floor(seg / 60)}m${seg % 60}s`;
}
function paso(etiqueta, seg) {
  const medida = seg.type === "distance" ? fmtDistancia(seg.target) : fmtTiempo(seg.target);
  const ritmo = fmtRitmo(seg.pace);
  return `- ${etiqueta ? etiqueta + " " : ""}${medida}${ritmo ? " " + ritmo : ""}`;
}

// Convierte una sesión del plan en el texto que entiende intervals.icu.
// Se parte de buildLiveSegments, que es la MISMA estructura que ve el alumno en el modo
// de entrenamiento en vivo — así lo que llega al reloj y lo que muestra la app no pueden
// discrepar. Los pasos repetidos ("Repetición 3 de 8") se reagrupan en un bloque "8x",
// que es como corresponde mostrarlo en el reloj.
function sesionATexto(day, easyPace) {
  const segs = E.buildLiveSegments(day, easyPace) || [];
  if (!segs.length) return null;

  const esRepeticion = (seg) => /^(.*?)\s*(\d+)\s+de\s+(\d+)$/.exec(seg?.label || "");
  const vacio = (seg) => seg.type === "distance" && !(seg.target > 0.05);

  // Las recuperaciones de las series salen del motor convertidas a distancia, y para 200m
  // con 1' de recuperación esa distancia redondea a 0 km. En el reloj eso sería un paso
  // vacío. Se expresan en TIEMPO, que además es como las define la metodología:
  // 200m=1', 400m=2', 600m=3', 800m=4'.
  const recuperacionDeSeries = (trabajo) => {
    if (day.paceKey !== "R" || trabajo.type !== "distance") return null;
    const min = E.R_RECOVERY_MIN[trabajo.target];
    return min != null ? min : null;
  };

  const lineas = [];
  let i = 0;
  while (i < segs.length) {
    const m = esRepeticion(segs[i]);
    if (!m) {
      if (!vacio(segs[i])) lineas.push(paso(segs[i].label, segs[i]));
      i++;
      continue;
    }
    // Bloque repetido: se emite una sola vez como "Nx" y se consumen todas sus repeticiones.
    const nombre = m[1].trim();
    const total = Number(m[3]);
    const trabajo = segs[i];
    const recMin = recuperacionDeSeries(trabajo);
    let recuperacion = null;
    let j = i;
    while (j < segs.length) {
      const mm = esRepeticion(segs[j]);
      if (!mm || mm[1].trim() !== nombre || Number(mm[3]) !== total) break;
      j++;
      // El paso siguiente es la recuperación del bloque SOLO si después viene otra
      // repetición. Si no, pertenece a la sesión y no al bloque — típicamente el
      // cool-down, que el motor pone justo detrás de la última serie.
      const siguienteEsRecuperacion = j < segs.length
        && !esRepeticion(segs[j])
        && esRepeticion(segs[j + 1]);
      if (siguienteEsRecuperacion) {
        if (!recuperacion) {
          recuperacion = recMin != null
            ? { label: segs[j].label, type: "time", target: recMin, pace: segs[j].pace }
            : segs[j];
        }
        j++;
      }
    }
    // El motor emite la recuperación también DESPUÉS de la última repetición. El bloque "Nx"
    // ya incluye N recuperaciones, así que esa última sobra y se descarta — si no, quedaría
    // una caminata de más al final. Solo se descarta si es la misma recuperación del bloque:
    // un cool-down lleva otra etiqueta y se respeta.
    if (recuperacion && segs[j] && !esRepeticion(segs[j]) && segs[j].label === recuperacion.label) j++;

    lineas.push("", `${total}x`, paso(nombre, trabajo));
    if (recuperacion && !vacio(recuperacion)) lineas.push(paso(recuperacion.label, recuperacion));
    lineas.push("");
    i = j;
  }
  return lineas.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// --- Construcción de la semana -------------------------------------------------
function construirSemana() {
  const paces = E.computeTrainingPaces(E.computeVDOT(21.0975, E.parsePaceToDecimal(PRUEBA.marcaObjetivo)));
  const plan = E.buildRacePlan(
    PRUEBA.objetivo, PRUEBA.fase, PRUEBA.nivel, PRUEBA.kmSemana, PRUEBA.kmFondo,
    "R", "T", paces, PRUEBA.semanasParaCarrera, E.getTaperWeeks(PRUEBA.objetivo)
  );
  const lunes = E.mondayOf(new Date());
  lunes.setDate(lunes.getDate() + 7); // la semana que viene, para no pisar nada de esta
  return plan.map((day, i) => {
    if (!day.paceKey) return null;
    const fecha = new Date(lunes);
    fecha.setDate(fecha.getDate() + i);
    return {
      dia: day.day,
      fecha: E.localDateISO(fecha),
      nombre: `${day.type} · ${day.km} km`,
      texto: sesionATexto(day, paces.E),
      km: day.km,
    };
  }).filter((x) => x && x.texto);
}

// --- Llamadas a intervals.icu ---------------------------------------------------
function cabeceras(clave) {
  return {
    Authorization: "Basic " + Buffer.from(`API_KEY:${clave}`).toString("base64"),
    "Content-Type": "application/json",
  };
}

async function enviar(sesiones, clave) {
  const eventos = sesiones.map((s) => ({
    category: "WORKOUT",
    start_date_local: `${s.fecha}T00:00:00`,
    type: "Run",
    name: s.nombre,
    description: s.texto,
    external_id: `${PREFIJO_ID}${s.fecha}`,
  }));
  const res = await fetch(`${API}/athlete/0/events/bulk?upsert=true`, {
    method: "POST", headers: cabeceras(clave), body: JSON.stringify(eventos),
  });
  const cuerpo = await res.text();
  if (!res.ok) {
    console.error(`\n✗ intervals.icu respondió ${res.status}`);
    console.error(cuerpo.slice(0, 600));
    process.exit(1);
  }
  let creados;
  try { creados = JSON.parse(cuerpo); } catch { creados = []; }
  console.log(`\n✓ ${Array.isArray(creados) ? creados.length : sesiones.length} sesiones escritas en tu calendario.`);
}

async function borrar(clave) {
  const hoy = E.localDateISO(new Date());
  const fin = new Date(); fin.setDate(fin.getDate() + 30);
  const res = await fetch(`${API}/athlete/0/events?oldest=${hoy}&newest=${E.localDateISO(fin)}`, { headers: cabeceras(clave) });
  if (!res.ok) { console.error(`✗ No se pudo leer el calendario (${res.status})`); process.exit(1); }
  const eventos = await res.json();
  const mios = (eventos || []).filter((e) => (e.external_id || "").startsWith(PREFIJO_ID));
  if (!mios.length) { console.log("No hay sesiones de prueba que borrar."); return; }
  const del = await fetch(`${API}/athlete/0/events/bulk-delete`, {
    method: "PUT", headers: cabeceras(clave), body: JSON.stringify(mios.map((e) => ({ id: e.id }))),
  });
  console.log(del.ok ? `✓ ${mios.length} sesiones de prueba borradas.` : `✗ Error al borrar (${del.status})`);
}

// --- Principal -------------------------------------------------------------------
const modo = process.argv.find((a) => a.startsWith("--")) || "--ver";
const clave = process.env.INTERVALS_API_KEY;

if (modo === "--borrar") {
  if (!clave) { console.error("Falta INTERVALS_API_KEY"); process.exit(1); }
  await borrar(clave);
} else {
  const sesiones = construirSemana();
  console.log(`\nSemana de prueba · ${PRUEBA.objetivo.toUpperCase()} · ${PRUEBA.nivel} · fase ${PRUEBA.fase} · ${PRUEBA.kmSemana} km`);
  console.log(`Ritmo objetivo de referencia: ${PRUEBA.marcaObjetivo}/km\n`);
  console.log("─".repeat(60));
  for (const s of sesiones) {
    console.log(`\n${s.dia} ${s.fecha} · ${s.nombre}`);
    console.log(s.texto.split("\n").map((l) => "   " + l).join("\n"));
  }
  console.log("\n" + "─".repeat(60));

  if (modo === "--enviar") {
    if (!clave) {
      console.error("\nFalta la clave. Usá:  INTERVALS_API_KEY=tu_clave node pruebas/intervals-icu-prueba.mjs --enviar");
      process.exit(1);
    }
    await enviar(sesiones, clave);
    console.log("\nAhora: abrí intervals.icu y mirá el calendario de la semana que viene.");
    console.log("Si las sesiones están bien, sincronizá tu reloj y comprobá que llegan CON los ritmos.");
    console.log("Para limpiar después:  INTERVALS_API_KEY=... node pruebas/intervals-icu-prueba.mjs --borrar");
  } else {
    console.log("\nEsto es solo la vista previa — no se envió nada.");
    console.log("Para enviarlo de verdad:  INTERVALS_API_KEY=tu_clave node pruebas/intervals-icu-prueba.mjs --enviar");
  }
}
