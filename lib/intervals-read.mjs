// Lo que el alumno realmente entrenó, leído de intervals.icu.
//
// Este archivo es código puro: no toca la red ni la base de datos. Recibe lo que
// intervals.icu ya devolvió y produce dos cosas:
//
//   1. Un resumen limpio de la actividad, en las unidades de esta app (kilómetros,
//      minutos, ritmo en min/km) en vez de las de intervals.icu (metros, segundos,
//      metros por segundo).
//
//   2. El nuevo registro del día, listo para guardar.
//
// Tres reglas gobiernan todo lo que sigue:
//
//   · NUNCA SE PISA LO QUE EL ALUMNO ESCRIBIÓ. El reloj solo rellena casillas vacías.
//     El RPE y la nota no se tocan jamás: son suyos, y no hay sensor que los mida.
//
//   · ANTES UN HUECO QUE UN NÚMERO FALSO. El ritmo real de una sesión de calidad es el
//     de las series, no el promedio de la salida entera —que incluye calentamiento,
//     recuperaciones y vuelta a la calma—. Si no se puede aislar con certeza a partir
//     de las vueltas, se deja vacío para que lo ponga el alumno. Ese campo alimenta las
//     conclusiones del reporte semanal del coach: un número inventado ahí es peor que
//     ninguno.
//
//   · EL PLAN NO SE REESCRIBE. Si corrió 8 km donde había 5 planificados, se registran
//     los 8 y la diferencia queda a la vista del coach. Lo planificado queda intacto.

import { buildLiveSegments, formatPace } from "./plan-engine.mjs";

// El prefijo se repite acá a propósito, en vez de importarlo de intervals-icu.mjs: ese
// módulo habla con la red y usa Buffer, que no existe en el navegador. Este archivo tiene
// que poder cargarse en cualquier lado. Las pruebas comprueban que los dos coincidan,
// haciendo el camino de ida con el generador real y el de vuelta con este.
const EXTERNAL_ID_PREFIX = "trotamundos";

// Cuánto puede desviarse una vuelta de lo planificado y aun así considerarse esa serie.
export const TOLERANCIA_VUELTA = 0.15;

// Tipos de sesión en los que el ritmo es un dato de entrenamiento y no un promedio
// descriptivo. Coincide con los que el reporte semanal compara contra el objetivo.
export const TIPOS_DE_CALIDAD = ["R", "I", "T", "brokenT", "M", "race", "combo1k500"];

// Cuántas vueltas se guardan como mucho. Más que esto no aporta y engorda el registro.
const MAX_VUELTAS = 30;

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const dos = (n) => (n == null ? null : Math.round(n * 100) / 100);
const uno = (n) => (n == null ? null : Math.round(n * 10) / 10);
const ent = (n) => (n == null ? null : Math.round(n));
const vacio = (v) => v === "" || v == null;

// formatPace devuelve "—" cuando no hay dato; acá preferimos null, que es más honesto
// para guardar y más fácil de comprobar.
function ritmoTexto(decimal) {
  if (decimal == null || !Number.isFinite(decimal) || decimal <= 0) return null;
  const t = formatPace(decimal);
  return t === "—" ? null : t;
}

/* ---------------------------------------------------------------------------
   DE QUÉ SESIÓN ES ESTA ACTIVIDAD

   Cuando TROTAMUNDOS escribe un entrenamiento en el calendario le pone un
   identificador propio: trotamundos-<alumno>-s<semana>-d<día>. intervals.icu
   enlaza sola la actividad con ese evento (paired_event_id), así que el camino
   de vuelta es exacto: actividad → evento → identificador → alumno, semana, día.
   No hay que adivinar por fecha ni por distancia.
--------------------------------------------------------------------------- */

// El identificador del alumno puede llevar guiones, así que no se puede partir por
// guiones: la expresión se ancla en el final, donde el formato sí es fijo.
const PATRON_EXTERNAL_ID = new RegExp(`^${EXTERNAL_ID_PREFIX}-(.+)-s(\\d+)-d(\\d+)$`);

export function descifrarExternalId(externalId) {
  const m = PATRON_EXTERNAL_ID.exec(String(externalId || ""));
  if (!m) return null;
  const semana = Number(m[2]);
  const dia = Number(m[3]);
  if (!Number.isFinite(semana) || semana < 1) return null;
  if (!Number.isFinite(dia) || dia < 0 || dia > 6) return null;
  return { studentId: m[1], semana, dia };
}

// Cuando no hay emparejamiento —una actividad anterior a la conexión del reloj, o un
// evento que el alumno borró de su calendario— queda la fecha. Dice en qué casilla del
// plan cae ese día, sin afirmar que sea esa sesión: de eso decide quien llama.
export function semanaYDiaDeFecha(student, fechaLocal) {
  const inicio = student?.planStartMonday;
  if (!inicio || !fechaLocal) return null;
  const lunes = new Date(`${String(inicio).slice(0, 10)}T00:00:00`);
  const dia = new Date(`${String(fechaLocal).slice(0, 10)}T00:00:00`);
  if (isNaN(lunes) || isNaN(dia)) return null;
  const dias = Math.round((dia - lunes) / 86400000);
  if (dias < 0) return null;
  return { semana: Math.floor(dias / 7) + 1, dia: dias % 7 };
}

// Decide en qué casilla del plan va una actividad — o si no va en ninguna.
// Devuelve { studentId?, semana, dia, via } o null. "via" dice cómo se supo: "evento" es
// el emparejamiento exacto que hace intervals.icu; "fecha" es la caída, más débil, y por
// eso se guarda la diferencia.
//
// mapaDeEventos va de id de evento → external_id, y solo contiene los eventos que esta
// app escribió en el calendario del alumno.
export function ubicarActividad(actividad, mapaDeEventos, student) {
  if (!actividad || !student) return null;

  const emparejado = mapaDeEventos?.get?.(String(actividad.paired_event_id ?? ""));
  if (emparejado) {
    const ref = descifrarExternalId(emparejado);
    // Tiene que ser de ESTE alumno. Si no lo es, hay algo mal emparejado y lo correcto
    // es no tocar nada antes que escribir en la semana de otra persona.
    if (ref && ref.studentId === student.id) return { ...ref, via: "evento" };
    return null;
  }

  const porFecha = semanaYDiaDeFecha(student, actividad.start_date_local || actividad.start_date);
  if (!porFecha) return null;

  const week = student.weeks?.[porFecha.semana];
  const day = week?.plan?.[porFecha.dia];
  if (!day?.paceKey) return null;                        // ese día no había sesión
  if (week?.log?.[porFecha.dia]?.completed) return null; // ya estaba marcada: no se toca
  return { ...porFecha, via: "fecha" };
}

/* ---------------------------------------------------------------------------
   RESUMEN DE LA ACTIVIDAD
--------------------------------------------------------------------------- */

// La cadencia llega por pierna en casi todos los relojes (unos 88), pero se habla de
// pasos por minuto (unos 175). Si el número es bajo para ser pasos, se dobla.
function pasosPorMinuto(cadencia) {
  const c = num(cadencia);
  if (c == null || c <= 0) return null;
  return ent(c < 120 ? c * 2 : c);
}

function vueltaLimpia(v) {
  const metros = num(v?.distance);
  const seg = num(v?.moving_time) ?? num(v?.elapsed_time);
  if (metros == null && seg == null) return null;
  const km = metros != null ? dos(metros / 1000) : null;
  return {
    t: v?.type || v?.label || null,
    km,
    seg: ent(seg),
    ritmo: km > 0 && seg > 0 ? ritmoTexto((seg / 60) / km) : null,
  };
}

// Convierte una actividad de intervals.icu al resumen que guarda y muestra la app.
export function resumenDeActividad(actividad, vueltasCrudas = []) {
  const a = actividad;
  if (!a || typeof a !== "object") return null;

  const metros = num(a.distance) ?? num(a.icu_distance);
  const segMov = num(a.moving_time) ?? num(a.elapsed_time);
  const km = metros != null ? dos(metros / 1000) : null;
  const min = segMov != null ? uno(segMov / 60) : null;

  // El ritmo se calcula de la distancia y el tiempo propios en vez de leer el campo
  // "pace", que viene en metros por segundo: así el número que ve el alumno siempre
  // cuadra con los kilómetros y los minutos que tiene al lado.
  const ritmo = km > 0 && segMov > 0 ? ritmoTexto((segMov / 60) / km) : null;

  const vueltas = (Array.isArray(vueltasCrudas) ? vueltasCrudas : [])
    .map(vueltaLimpia)
    .filter(Boolean)
    .slice(0, MAX_VUELTAS);

  return {
    id: a.id ?? null,
    fecha: a.start_date_local || a.start_date || null,
    nombre: a.name || null,
    dispositivo: a.device_name || null,
    km,
    min,
    ritmo,
    // Para el coach: el tiempo total (desde que inició hasta que terminó, con las paradas) y
    // el tiempo en movimiento. La diferencia es lo que estuvo detenido.
    segTotal: ent(num(a.elapsed_time)),
    segMovimiento: ent(num(a.moving_time)),
    fcMedia: ent(num(a.average_heartrate)),
    fcMax: ent(num(a.max_heartrate)),
    cadencia: pasosPorMinuto(a.average_cadence),
    subida: ent(num(a.total_elevation_gain)),
    bajada: ent(num(a.total_elevation_loss)),
    calorias: ent(num(a.calories)),
    carga: ent(num(a.icu_training_load) ?? num(a.hr_load)),
    intensidad: ent(num(a.icu_intensity)),
    vueltas,
  };
}

/* ---------------------------------------------------------------------------
   EL RITMO DE LAS SERIES

   Un día de calidad son tres cosas pegadas: calentamiento, series y vuelta a la
   calma. El promedio de la salida entera no es el ritmo de las series, y es el de
   las series el que importa.

   Las vueltas del reloj permiten aislarlas, pero solo si el alumno marcó vueltas
   que se correspondan con lo planificado. El criterio es estricto a propósito: si
   no aparecen TODAS las series planificadas, no se rellena nada.
--------------------------------------------------------------------------- */

export function esDeCalidad(day) {
  return !!day?.paceKey && TIPOS_DE_CALIDAD.includes(day.paceKey);
}

// Los tramos del plan que son trabajo de verdad: los que llevan un ritmo objetivo
// distinto del suave. El calentamiento, las recuperaciones y la vuelta a la calma van
// a ritmo suave o sin ritmo, y quedan fuera.
export function tramosDeCalidad(day, easyPace) {
  const segs = buildLiveSegments(day, easyPace) || [];
  const suave = num(day?.easyPace) ?? num(easyPace);
  return segs.filter((s) => {
    const p = num(s?.pace);
    if (p == null) return false;
    if (suave != null && Math.abs(p - suave) < 0.05) return false;
    return num(s?.target) > 0;
  });
}

// Empareja cada serie planificada con la vuelta que más se le parece, sin repetir
// vueltas. Devuelve el ritmo en minutos por kilómetro, o null si no se pudo aislar
// la sesión completa.
export function ritmoDeLasSeries(vueltas, tramos) {
  if (!Array.isArray(vueltas) || !vueltas.length) return null;
  if (!Array.isArray(tramos) || !tramos.length) return null;

  const libres = vueltas
    .map((v) => ({ km: num(v?.km), min: v?.seg != null ? num(v.seg) / 60 : null }))
    .filter((v) => v.km > 0 && v.min > 0);
  if (libres.length < tramos.length) return null;

  const elegidas = [];
  for (const tramo of tramos) {
    const porDistancia = tramo.type === "distance";
    const meta = num(tramo.target);
    if (!(meta > 0)) return null;

    let mejor = -1;
    let mejorDesvio = Infinity;
    libres.forEach((v, i) => {
      const valor = porDistancia ? v.km : v.min;
      const desvio = Math.abs(valor - meta) / meta;
      if (desvio < mejorDesvio) { mejorDesvio = desvio; mejor = i; }
    });

    // Si la mejor candidata ya se desvía demasiado, la sesión no se parece a lo
    // planificado y cualquier promedio sería inventado.
    if (mejor < 0 || mejorDesvio > TOLERANCIA_VUELTA) return null;
    elegidas.push(libres.splice(mejor, 1)[0]);
  }

  const km = elegidas.reduce((s, v) => s + v.km, 0);
  const min = elegidas.reduce((s, v) => s + v.min, 0);
  if (!(km > 0) || !(min > 0)) return null;
  return min / km;
}

// El ritmo que corresponde anotar para este día, o null si hay que dejarlo vacío.
export function ritmoParaElRegistro(day, resumen, easyPace) {
  if (!resumen) return null;
  if (!esDeCalidad(day)) return resumen.ritmo; // promedio: descriptivo y correcto
  const decimal = ritmoDeLasSeries(resumen.vueltas, tramosDeCalidad(day, easyPace));
  return ritmoTexto(decimal);
}

/* ---------------------------------------------------------------------------
   EL NUEVO REGISTRO DEL DÍA
--------------------------------------------------------------------------- */

// Devuelve { log, cambio }. El log nuevo solo rellena lo que estaba vacío; el RPE y la
// nota se devuelven tal cual llegaron, siempre. "cambio" dice si hace falta guardar.
export function logConLectura(logActual, resumen, day, easyPace) {
  const previo = logActual && typeof logActual === "object" ? logActual : {};
  if (!resumen) return { log: previo, cambio: false };

  const siguiente = { ...previo, reloj: resumen };
  let cambio = JSON.stringify(previo.reloj || null) !== JSON.stringify(resumen);

  // Hubo una actividad emparejada con esta sesión: la hizo. Pero solo la PRIMERA vez que
  // se ve esa actividad. Si el alumno la desmarcó después —porque esa salida no era esta
  // sesión, o porque la quiere registrar de otro modo— esa decisión es suya y se respeta.
  // Sin esto, la app le volvería a marcar la casilla cada cuarto de hora.
  const yaConocida = previo.reloj && esMismaActividad(previo.reloj.id, resumen.id);
  if (!previo.completed && !yaConocida) { siguiente.completed = true; cambio = true; }

  if (vacio(previo.actualKm) && resumen.km != null) {
    siguiente.actualKm = String(resumen.km);
    cambio = true;
  }

  if (vacio(previo.actualPaceStr)) {
    const ritmo = ritmoParaElRegistro(day, resumen, easyPace);
    if (ritmo) { siguiente.actualPaceStr = ritmo; cambio = true; }
  }

  // El RPE y la nota no se tocan. Si no existían, se dejan como estaban: vacíos y a la
  // espera del alumno, que es el único que los puede contestar.
  return { log: siguiente, cambio };
}

/* ---------------------------------------------------------------------------
   ACTIVIDADES QUE NO CORRESPONDEN A NINGUNA SESIÓN

   Un día de descanso en el que salió a correr, una carrera que no estaba en el plan,
   una actividad anterior a la conexión del reloj. No cuentan como sesión cumplida ni
   tocan el plan: se guardan aparte para que el coach las vea.
--------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------
   VARIAS SALIDAS EN UN MISMO DÍA

   Un alumno puede correr dos veces el mismo día: el entrenamiento del plan por la mañana
   y una salida suelta por la tarde, o dos sesiones partidas. Las dos son información que
   el coach necesita, y ninguna puede borrar a la otra.

   El reparto sigue un orden claro:

     1. La actividad que intervals.icu enlazó con el entrenamiento planificado se queda
        con la sesión. Ese enlace es exacto y manda sobre cualquier otra consideración.
     2. Si ninguna está enlazada, se queda con la sesión la PRIMERA del día. Es la que
        suele corresponder al entrenamiento; las de después son añadidos.
     3. Todas las demás quedan como salidas adicionales de ese día, con su detalle
        completo. No cuentan como sesión cumplida ni tocan el plan.

   Antes de esto, dos salidas en un día se asignaban las dos a la misma sesión y la
   última en procesarse borraba los datos de la primera, en silencio.
--------------------------------------------------------------------------- */

// Las actividades vienen con la hora local pegada a la fecha ("2026-10-19T10:11:31"),
// así que ordenarlas como texto ya las ordena por hora.
function porHora(a, b) {
  return String(a?.resumen?.fecha || "").localeCompare(String(b?.resumen?.fecha || ""));
}

export function repartirActividades(items, student) {
  const porCasilla = new Map();
  const sinCasilla = [];

  for (const item of items || []) {
    if (!item?.resumen) continue;
    if (item.sitio) {
      const clave = `${item.sitio.semana}-${item.sitio.dia}`;
      if (!porCasilla.has(clave)) porCasilla.set(clave, []);
      porCasilla.get(clave).push(item);
    } else {
      sinCasilla.push(item);
    }
  }

  const alPlan = [];
  const adicionales = [];

  for (const grupo of porCasilla.values()) {
    const ordenado = [...grupo].sort(porHora);
    const enlazada = ordenado.find((x) => x.sitio.via === "evento");
    const duena = enlazada || ordenado[0];
    alPlan.push({ ...duena.sitio, resumen: duena.resumen });
    for (const otra of ordenado) {
      if (otra === duena) continue;
      adicionales.push({ semana: otra.sitio.semana, dia: otra.sitio.dia, resumen: otra.resumen });
    }
  }

  // Las que no encajaron en ninguna casilla —una salida en día de descanso, o un día
  // cuya sesión ya estaba marcada— se colocan por fecha, como adicionales.
  for (const item of sinCasilla) {
    const sitio = semanaYDiaDeFecha(student, item.resumen.fecha);
    if (!sitio) continue;
    adicionales.push({ semana: sitio.semana, dia: sitio.dia, resumen: item.resumen });
  }

  return { alPlan, adicionales };
}

// Las salidas adicionales que caen en un día concreto de la semana. Los registros
// guardados por versiones anteriores no llevan "dia", así que se calcula por la fecha.
export function extrasDelDia(week, dia, student, weekNum) {
  const lista = Array.isArray(week?.extras) ? week.extras : [];
  return lista.filter((e) => {
    if (Number.isFinite(e?.dia)) return e.dia === dia;
    const s = semanaYDiaDeFecha(student, e?.fecha);
    return !!s && s.semana === weekNum && s.dia === dia;
  });
}

// Kilómetros de todo lo que el alumno corrió de más esta semana, fuera del plan.
export function kmAdicionalesDe(week) {
  const lista = Array.isArray(week?.extras) ? week.extras : [];
  const total = lista.reduce((suma, e) => suma + (Number(e?.km) || 0), 0);
  return Math.round(total * 10) / 10;
}

/* ---------------------------------------------------------------------------
   TRAER LO DEL RELOJ A UNA PANTALLA ABIERTA

   Cuando el servidor acaba de leer intervals.icu, la pantalla que ya estaba abierta tiene
   una copia vieja. Recargarla entera sería lo fácil, y lo peligroso: borraría el RPE que
   el alumno está escribiendo en ese momento, o la sesión que el coach acaba de editar.

   Esto trae del registro fresco SOLO lo que escribe el servidor —el bloque del reloj y las
   actividades extra— y deja intacto todo lo demás de la pantalla.
--------------------------------------------------------------------------- */
export function fusionarLoDelReloj(enPantalla, fresco) {
  if (!enPantalla || !fresco) return enPantalla;
  if (enPantalla.id && fresco.id && enPantalla.id !== fresco.id) return enPantalla;

  const weeks = { ...(enPantalla.weeks || {}) };
  let cambio = false;

  for (const [n, semanaFresca] of Object.entries(fresco.weeks || {})) {
    const mia = weeks[n];
    if (!mia) continue; // semanas que la pantalla no tiene: no se inventan acá

    let log = mia.log;
    if (Array.isArray(mia.log)) {
      log = mia.log.map((entrada, i) => {
        const reloj = semanaFresca?.log?.[i]?.reloj;
        if (!reloj || entrada?.reloj === reloj) return entrada;
        cambio = true;
        return { ...(entrada || {}), reloj };
      });
    }

    const extras = semanaFresca?.extras ?? mia.extras;
    if (extras !== mia.extras) cambio = true;

    if (log !== mia.log || extras !== mia.extras) weeks[n] = { ...mia, log, extras };
  }

  return cambio ? { ...enPantalla, weeks } : enPantalla;
}

export function esMismaActividad(a, b) {
  return a != null && b != null && String(a) === String(b);
}

// Añade la actividad a la lista de extras de la semana, sin duplicar.
export function conActividadExtra(extras, resumen) {
  const lista = Array.isArray(extras) ? extras : [];
  if (!resumen?.id) return { extras: lista, cambio: false };
  if (lista.some((e) => esMismaActividad(e?.id, resumen.id))) return { extras: lista, cambio: false };
  return { extras: [...lista, resumen], cambio: true };
}
