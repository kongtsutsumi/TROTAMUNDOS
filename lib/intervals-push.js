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
import { semanaAEventos, enviarEventos, borrarEventos, EXTERNAL_ID_PREFIX } from "./intervals-icu.mjs";
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
export async function enviarSemanaAlReloj(student, weekNum, { guardar = true } = {}) {
  const resultado = { ok: false, enviados: 0, motivo: null, semana: weekNum };

  const cred = credencialDe(student);
  if (!cred) return { ...resultado, motivo: "sin-conexion" };

  const week = student?.weeks?.[weekNum];
  if (!week) return { ...resultado, motivo: "semana-inexistente" };

  let eventos;
  try {
    eventos = semanaAEventos(student, weekNum);
  } catch (e) {
    return { ...resultado, motivo: "error-traduciendo:" + (e?.message || "") };
  }
  if (!eventos.length) return { ...resultado, ok: true, motivo: "sin-sesiones" };

  let envio;
  try {
    envio = await enviarEventos(eventos, cred.credencial, cred.athleteId);
  } catch (e) {
    envio = { ok: false, detalle: e?.message || "fallo de red" };
  }

  const final = envio.ok
    ? { ...resultado, ok: true, enviados: envio.enviados, motivo: null }
    : { ...resultado, motivo: `rechazado:${envio.estado ?? "red"}`, detalle: envio.detalle ?? null };

  if (guardar) await registrarEnvio(student, weekNum, final);
  return final;
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
