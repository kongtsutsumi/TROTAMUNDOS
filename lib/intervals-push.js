// Envío de la semana al reloj del alumno, del lado del servidor.
//
// La traducción de las sesiones vive en lib/intervals-icu.mjs, que es código puro y está
// cubierto por las pruebas. Acá está lo que toca el mundo real: de dónde sale la credencial
// de cada alumno, cuándo corresponde enviar, y qué hacer cuando falla.
//
// Principio que gobierna todo este archivo: EL ENVÍO AL RELOJ NUNCA PUEDE ROMPER EL PLAN.
// Si intervals.icu está caído, si el alumno revocó el permiso o si la red falla, la semana
// se publica igual y el alumno la ve en la app como siempre. El reloj es un extra.

import { kvGet, kvSet } from "./supabaseAdmin";
import { semanaAEventos, enviarEventos, borrarEventos, EXTERNAL_ID_PREFIX, rangoDeSemana, semanasParaReenviar } from "./intervals-icu.mjs";
import { localDateISO } from "./plan-engine.mjs";

// --- Credencial de cada alumno ---------------------------------------------------
//
// Dos formas, que el módulo de traducción ya contempla:
//
//   1. token  — el testigo OAuth que el propio alumno otorgó al conectar su cuenta.
//               Es la forma definitiva, y la única para alumnos de verdad.
//
//   2. apiKey — la clave personal del coach, leída de una variable de entorno.
//               TEMPORAL: sirve para probar la cadena completa mientras intervals.icu no
//               apruebe la app OAuth. Solo se usa en el registro del propio coach, marcado
//               explícitamente, y hay que quitarlo cuando llegue la aprobación.
export function credencialDe(student) {
  const conf = student?.intervals;
  if (!conf) return null;
  if (conf.token) return { credencial: { token: conf.token }, athleteId: conf.athleteId || "0" };
  if (conf.pruebaConClaveDelCoach && process.env.INTERVALS_COACH_API_KEY) {
    return {
      credencial: { apiKey: process.env.INTERVALS_COACH_API_KEY },
      athleteId: conf.athleteId || "0",
      esPrueba: true,
    };
  }
  return null;
}

export function estaConectado(student) {
  return credencialDe(student) != null;
}

// --- Envío de una semana -----------------------------------------------------------
//
// Devuelve siempre un resultado descriptivo en vez de lanzar: quien llama decide si le
// importa. Guarda en el registro del alumno cómo fue, para poder mostrarlo en el panel.
//
// Enviar una semana es dejar el calendario del reloj IGUAL al plan: se escribe lo que hay,
// y se retira lo que esta app había puesto en esa semana y ya no está —un día que pasó a
// descanso, una sesión movida de día, una semana deshecha—. Antes solo se escribía, y lo
// viejo se quedaba en el reloj del alumno.
export async function enviarSemanaAlReloj(student, weekNum, { guardar = true } = {}) {
  const resultado = { ok: false, enviados: 0, retirados: 0, motivo: null, semana: weekNum };

  const cred = credencialDe(student);
  if (!cred) return { ...resultado, motivo: "sin-conexion" };

  const existe = !!student?.weeks?.[weekNum];
  let eventos = [];
  if (existe) {
    try {
      eventos = semanaAEventos(student, weekNum);
    } catch (e) {
      return { ...resultado, motivo: "error-traduciendo:" + (e?.message || "") };
    }
  }

  let envio = { ok: true, enviados: 0 };
  if (eventos.length) {
    try {
      envio = await enviarEventos(eventos, cred.credencial, cred.athleteId);
    } catch (e) {
      envio = { ok: false, detalle: e?.message || "fallo de red" };
    }
  }

  // Se retira lo sobrante SOLO si el envío salió bien: si falló, borrar dejaría al alumno
  // sin entrenamientos en el reloj. Y que falle la limpieza no convierte el envío en fallo.
  let retirados = 0;
  if (envio.ok) {
    try {
      retirados = await retirarSobrantes(student, weekNum, eventos, cred);
    } catch (e) {
      console.error("no se pudo limpiar la semana en intervals.icu", e);
    }
  }

  const final = envio.ok
    ? {
        ...resultado, ok: true, enviados: envio.enviados ?? eventos.length, retirados,
        motivo: !existe ? "semana-inexistente" : eventos.length ? null : "sin-sesiones",
      }
    : { ...resultado, motivo: `rechazado:${envio.estado ?? "red"}`, detalle: envio.detalle ?? null };

  if (guardar) await registrarEnvio(student, weekNum, final);
  return final;
}

// Borra de esa semana los entrenamientos que puso esta app para este alumno y que ya no
// están en el plan. Solo toca los suyos: el identificador lleva alumno y semana.
async function retirarSobrantes(student, weekNum, eventos, cred) {
  const rango = rangoDeSemana(student, weekNum);
  if (!rango) return 0;
  const prefijo = `${EXTERNAL_ID_PREFIX}-${student.id}-s${weekNum}-`;
  const vigentes = new Set(eventos.map((e) => e.external_id));
  const r = await borrarEventos(cred.credencial, {
    ...rango, athleteId: cred.athleteId,
    filtro: (e) => (e?.external_id || "").startsWith(prefijo) && !vigentes.has(e.external_id),
  });
  return r?.borrados || 0;
}

// --- Reenvío automático después de guardar la ficha de un alumno -------------------
//
// Lo llama /api/data cada vez que se guarda un alumno, venga del coach o del propio alumno.
// Es el único lugar por el que pasan todos los guardados —cerrar la semana, editar una
// sesión, el panorama, deshacer, el alumno que mueve un día—, así que ninguno se escapa.
//
// No lanza nunca y tiene un tope de tiempo: si intervals.icu tarda, el guardado ya ocurrió
// igual y el coach sigue teniendo el botón "Enviar al reloj".
export async function reenviarSemanasCambiadas(antes, despues, { hoy = localDateISO(), limiteMs = 6000 } = {}) {
  if (!despues || !estaConectado(despues)) return { ok: true, semanas: [] };
  let semanas;
  try {
    semanas = semanasParaReenviar(antes, despues, hoy).slice(0, 4);
  } catch (e) {
    return { ok: false, semanas: [], motivo: "error-comparando" };
  }
  if (!semanas.length) return { ok: true, semanas: [] };

  const trabajo = (async () => {
    const resultados = [];
    for (const n of semanas) resultados.push(await enviarSemanaAlReloj(despues, n));
    return resultados;
  })().catch(() => null);
  const tope = new Promise((resolver) => setTimeout(() => resolver(null), limiteMs));
  const resultados = await Promise.race([trabajo, tope]);
  return { ok: !!resultados && resultados.every((r) => r.ok), semanas, resultados };
}

// Deja constancia del último envío en el registro del alumno, para que el coach vea en el
// panel si llegó o no. Se guarda con una lectura fresca para no pisar cambios de otra acción
// simultánea — solo se toca este campo.
async function registrarEnvio(student, weekNum, resultado) {
  try {
    const fresco = (await kvGet(`student:${student.id}`)) || student;
    const siguiente = {
      ...fresco,
      intervals: {
        ...(fresco.intervals || {}),
        ultimoEnvio: {
          semana: weekNum,
          ok: resultado.ok,
          enviados: resultado.enviados,
          motivo: resultado.motivo,
          fecha: new Date().toISOString(),
        },
      },
    };
    await kvSet(`student:${student.id}`, siguiente);
  } catch (e) {
    // Dejar constancia es un lujo: si falla, el envío ya ocurrió igual.
    console.error("no se pudo registrar el envío a intervals.icu", e);
  }
}

// --- Enganche con la publicación de la semana ---------------------------------------
//
// Se llama después de publicar una semana (automática o cerrada por el coach). Si el alumno
// no tiene reloj conectado, no hace nada y no cuesta nada.
export async function enviarSiCorresponde(student, weekNum) {
  if (!estaConectado(student)) return { ok: true, enviados: 0, motivo: "sin-conexion" };
  return enviarSemanaAlReloj(student, weekNum);
}

// --- Desconectar ---------------------------------------------------------------------
//
// Quita la conexión y limpia del calendario lo que esta app haya puesto de hoy en adelante.
// Lo pasado no se toca: es el historial del alumno.
export async function desconectarReloj(student, { limpiarFuturo = true } = {}) {
  const cred = credencialDe(student);
  let borrados = 0;
  if (cred && limpiarFuturo) {
    const hoy = localDateISO();
    const fin = new Date();
    fin.setDate(fin.getDate() + 60);
    try {
      const r = await borrarEventos(cred.credencial, {
        desde: hoy, hasta: localDateISO(fin), athleteId: cred.athleteId,
        filtro: (e) => (e?.external_id || "").startsWith(`${EXTERNAL_ID_PREFIX}-${student.id}-`),
      });
      borrados = r.borrados || 0;
    } catch (e) {
      console.error("no se pudo limpiar el calendario al desconectar", e);
    }
  }
  const fresco = (await kvGet(`student:${student.id}`)) || student;
  const { intervals, ...resto } = fresco;
  await kvSet(`student:${student.id}`, resto);
  return { ok: true, borrados };
}
