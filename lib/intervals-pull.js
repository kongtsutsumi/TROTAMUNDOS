// Traer de intervals.icu lo que el alumno realmente entrenó, del lado del servidor.
//
// La conversión de los datos vive en lib/intervals-read.mjs, que es código puro y está
// cubierto por las pruebas. Acá está lo que toca el mundo real: pedirle las actividades a
// intervals.icu, decidir a qué sesión pertenece cada una, y guardarlo.
//
// Principio que gobierna este archivo, igual que el de envío:
// LEER DEL RELOJ NUNCA PUEDE ROMPER EL PLAN. Si intervals.icu está caído, si el alumno
// revocó el permiso o si la red falla, la app funciona exactamente igual que si el reloj
// no existiera. Por eso ninguna función de acá lanza: todas devuelven un resultado que
// describe lo que pasó, y quien llama decide si le importa.
//
// Cómo se sabe a qué sesión pertenece una actividad:
//
//   actividad.paired_event_id → el evento del calendario → su external_id
//       → trotamundos-<alumno>-s<semana>-d<día>
//
// intervals.icu hace ese emparejamiento sola, porque los entrenamientos que escribe esta
// app llevan ese identificador. Es exacto: no hay que adivinar por distancia ni por
// nombre. Cuando no hay emparejamiento se cae a la fecha, y solo si ese día había una
// sesión planificada que todavía no estaba marcada.

import { kvGet, kvSet } from "./supabaseAdmin";
import { INTERVALS_API, cabeceras } from "./intervals-icu.mjs";
import { credencialDe } from "./intervals-push";
import { localDateISO } from "./plan-engine.mjs";
import {
  ubicarActividad,
  repartirActividades,
  resumenDeActividad,
  logConLectura,
  conActividadExtra,
  esMismaActividad,
} from "./intervals-read.mjs";

// Cuántos días hacia atrás se miran. Diez cubre de sobra la semana que acaba de cerrar,
// incluso si el alumno sincronizó el reloj con retraso.
const DIAS_POR_DEFECTO = 10;

// Cada cuánto, como mucho, se le pregunta a intervals.icu por un mismo alumno. Sin esto,
// abrir la app diez veces serían diez consultas idénticas.
const MINUTOS_ENTRE_LECTURAS = 15;

// Tope de consultas de vueltas por lectura. Las vueltas son una consulta extra por
// actividad; esto evita que una sincronización atrasada dispare docenas de golpe.
const MAX_CONSULTAS_DE_VUELTAS = 12;

const haceDias = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return localDateISO(d); };

async function pedir(ruta, credencial) {
  const res = await fetch(`${INTERVALS_API}${ruta}`, { headers: cabeceras(credencial) });
  if (!res.ok) {
    const cuerpo = await res.text().catch(() => "");
    const e = new Error(`${res.status} ${cuerpo.slice(0, 200)}`);
    e.estado = res.status;
    throw e;
  }
  return res.json();
}

function recienLeido(student, minutos) {
  const ultima = student?.intervals?.ultimaLectura;
  if (!ultima) return false;
  const t = Date.parse(ultima);
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < minutos * 60 * 1000;
}

// Las vueltas vienen por una ruta aparte y no todas las actividades las tienen. Que falle
// no es motivo para perder el resto: se devuelve una lista vacía y se sigue.
async function vueltasDe(actividadId, credencial) {
  try {
    const d = await pedir(`/activity/${actividadId}/intervals`, credencial);
    const v = d?.icu_intervals || d?.intervals || (Array.isArray(d) ? d : []);
    return Array.isArray(v) ? v : [];
  } catch (e) {
    return [];
  }
}

/* ---------------------------------------------------------------------------
   LA LECTURA COMPLETA
--------------------------------------------------------------------------- */

export async function traerDelReloj(student, opciones = {}) {
  const {
    dias = DIAS_POR_DEFECTO,
    forzar = false,
    minutosEntreLecturas = MINUTOS_ENTRE_LECTURAS,
  } = opciones;

  const resultado = { ok: false, actualizadas: 0, extras: 0, motivo: null };

  const cred = credencialDe(student);
  if (!cred) return { ...resultado, ok: true, motivo: "sin-conexion" };
  if (!forzar && recienLeido(student, minutosEntreLecturas)) {
    return { ...resultado, ok: true, motivo: "leido-hace-poco" };
  }

  const desde = haceDias(dias);
  const hasta = localDateISO();
  const atleta = cred.athleteId || "0";

  let actividades, eventos;
  try {
    actividades = await pedir(`/athlete/${atleta}/activities?oldest=${desde}&newest=${hasta}`, cred.credencial);
    eventos = await pedir(`/athlete/${atleta}/events?oldest=${desde}&newest=${hasta}`, cred.credencial);
  } catch (e) {
    // Una credencial caducada o revocada es información útil para el coach, pero no es
    // una emergencia: la app sigue funcionando sin el reloj.
    await sellarLectura(student, { error: e?.estado === 401 ? "permiso-revocado" : "fallo-de-red" });
    return { ...resultado, motivo: e?.estado === 401 ? "permiso-revocado" : "fallo-de-red" };
  }

  if (!Array.isArray(actividades) || !actividades.length) {
    await sellarLectura(student, {});
    return { ...resultado, ok: true, motivo: "sin-actividades" };
  }

  // evento.id → nuestro identificador, solo para los eventos que puso esta app.
  const mapaDeEventos = new Map();
  for (const e of Array.isArray(eventos) ? eventos : []) {
    if (e?.id != null && e?.external_id) mapaDeEventos.set(String(e.id), e.external_id);
  }

  // Primero se decide todo, y recién después se escribe una sola vez. Así una lectura a
  // medias no deja el registro del alumno en un estado intermedio.
  const items = [];
  let consultasDeVueltas = 0;

  for (const act of actividades) {
    let vueltas = [];
    if (consultasDeVueltas < MAX_CONSULTAS_DE_VUELTAS) {
      consultasDeVueltas++; // se cuenta la consulta, salga o no con vueltas
      vueltas = await vueltasDe(act.id, cred.credencial);
    }

    const resumen = resumenDeActividad(act, vueltas);
    if (!resumen) continue;

    items.push({ resumen, sitio: ubicarActividad(act, mapaDeEventos, student) });
  }

  // Quién se queda con cada sesión y qué queda como salida adicional lo decide una
  // función pura, que está cubierta por las pruebas. Acá no se decide nada.
  const { alPlan, adicionales } = repartirActividades(items, student);
  return guardarLectura(student, alPlan, adicionales);
}

/* ---------------------------------------------------------------------------
   GUARDAR

   Se vuelve a leer el alumno justo antes de escribir, y los registros nuevos se calculan
   sobre ESA versión, no sobre la que se tenía al empezar. Entre que arrancó la lectura y
   termina pueden haber pasado varios segundos, y en ese rato el alumno pudo escribir su
   RPE. Calcular sobre lo fresco es lo que impide pisárselo.
--------------------------------------------------------------------------- */

async function guardarLectura(student, alPlan, adicionales) {
  const resultado = { ok: true, actualizadas: 0, extras: 0, motivo: null };

  let fresco;
  try {
    fresco = (await kvGet(`student:${student.id}`)) || student;
  } catch (e) {
    return { ...resultado, ok: false, motivo: "no-se-pudo-leer" };
  }

  const easyPace = fresco.paces?.E ?? null;
  const weeks = { ...(fresco.weeks || {}) };
  let huboCambios = false;

  for (const { semana, dia, via, resumen } of alPlan) {
    const week = weeks[semana];
    if (!week || !Array.isArray(week.plan) || !week.plan[dia]) continue;
    const log = Array.isArray(week.log) ? [...week.log] : [];
    const { log: nuevo, cambio } = logConLectura(log[dia], { ...resumen, via }, week.plan[dia], easyPace);
    if (!cambio) continue;
    log[dia] = nuevo;
    weeks[semana] = { ...week, log };
    huboCambios = true;
    resultado.actualizadas++;
  }

  // Las adicionales van DESPUÉS, a propósito: para entonces el registro del día ya tiene
  // su sesión asignada, y se puede comprobar que no estamos duplicando como "adicional"
  // la misma actividad que acaba de quedarse con la sesión.
  for (const { semana, dia, resumen } of adicionales) {
    const week = weeks[semana];
    if (!week) continue; // no se crean semanas desde acá: el plan lo hace el coach
    if (esMismaActividad(week?.log?.[dia]?.reloj?.id, resumen.id)) continue;
    const { extras, cambio } = conActividadExtra(week.extras, { ...resumen, dia });
    if (!cambio) continue;
    weeks[semana] = { ...week, extras };
    huboCambios = true;
    resultado.extras++;
  }

  const siguiente = {
    ...fresco,
    weeks,
    intervals: {
      ...(fresco.intervals || {}),
      ultimaLectura: new Date().toISOString(),
      errorDeLectura: null,
    },
  };

  try {
    await kvSet(`student:${student.id}`, siguiente);
  } catch (e) {
    return { ...resultado, ok: false, motivo: "no-se-pudo-guardar" };
  }
  return { ...resultado, motivo: huboCambios ? null : "sin-novedades" };
}

// Deja constancia de que se intentó leer, aunque no haya salido nada. Sin esto, un alumno
// sin actividades haría una consulta cada vez que abre la app.
async function sellarLectura(student, { error = null } = {}) {
  try {
    const fresco = (await kvGet(`student:${student.id}`)) || student;
    await kvSet(`student:${student.id}`, {
      ...fresco,
      intervals: {
        ...(fresco.intervals || {}),
        ultimaLectura: new Date().toISOString(),
        errorDeLectura: error,
      },
    });
  } catch (e) {
    // Dejar constancia es un lujo. Que falle no cambia nada de lo que ve el alumno.
    console.error("no se pudo registrar la lectura de intervals.icu", e);
  }
}

/* ---------------------------------------------------------------------------
   ENGANCHES
--------------------------------------------------------------------------- */

// Para el cron de los lunes: recoge lo de la semana que acaba de cerrar, de todos los
// alumnos que tengan reloj conectado. Uno por uno y sin cortar: que falle el de un alumno
// no puede dejar sin leer a los demás.
// "limiteMs" es un presupuesto de tiempo, no un objetivo: la tarea programada de Vercel
// se corta sola al minuto, y es preferible leer a seis alumnos y dejar constancia de los
// que faltaron antes que quedarse sin respuesta a mitad del octavo. Los que queden fuera
// se leen igual en cuanto alguien abra la app — esta tarea es un adelanto, no la vía
// principal.
export async function traerDeTodos(students, opciones = {}) {
  const { limiteMs = 30000, ...resto } = opciones;
  const arranque = Date.now();
  const informe = { leidos: 0, actualizadas: 0, extras: 0, pendientes: 0, fallos: [] };

  for (const student of students || []) {
    if (!credencialDe(student)) continue;
    if (Date.now() - arranque > limiteMs) { informe.pendientes++; continue; }
    try {
      const r = await traerDelReloj(student, { forzar: true, ...resto });
      informe.leidos++;
      informe.actualizadas += r.actualizadas || 0;
      informe.extras += r.extras || 0;
      if (!r.ok) informe.fallos.push({ alumno: student.id, motivo: r.motivo });
    } catch (e) {
      informe.fallos.push({ alumno: student.id, motivo: e?.message || "error" });
    }
  }
  return informe;
}

// Lo mismo, partiendo del listado de alumnos. Es lo que llama la tarea de los lunes.
export async function traerDelRoster(opciones = {}) {
  const informe = { leidos: 0, actualizadas: 0, extras: 0, pendientes: 0, fallos: [] };
  let roster;
  try {
    roster = (await kvGet("roster")) || [];
  } catch (e) {
    return { ...informe, fallos: [{ alumno: null, motivo: "no-se-pudo-leer-el-listado" }] };
  }

  const alumnos = [];
  for (const entrada of roster) {
    if (!entrada?.id) continue;
    try {
      const s = await kvGet(`student:${entrada.id}`);
      if (s) alumnos.push(s);
    } catch (e) {
      informe.fallos.push({ alumno: entrada.id, motivo: "no-se-pudo-leer" });
    }
  }

  const r = await traerDeTodos(alumnos, opciones);
  return { ...r, fallos: [...informe.fallos, ...r.fallos] };
}
