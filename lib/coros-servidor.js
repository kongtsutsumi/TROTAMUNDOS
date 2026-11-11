// COROS, del lado del servidor, por su MCP oficial: conectar la cuenta (OAuth 2.0 con PKCE y
// registro dinámico del cliente), mandar los entrenamientos al calendario de COROS, traer las
// actividades (archivo FIT) y la salud, y desconectar.
//
// Lo que se decide (formatos, lectura de respuestas) está en lib/coros.mjs, que es puro y tiene
// pruebas. Acá está lo que toca a COROS y a la base de datos.
//
// Filas (todas solo del servidor; /api/data no las deja leer ni escribir):
//   coros:cuenta:<studentId>  → { issuer, mcpUrl, clientId, accessToken, refreshToken, expiraEn,
//                                 sujeto, dispositivo, conectadoEl, ultimaSalud }
//   coros:usuario:<sujeto>    → { studentId }   (una cuenta de COROS, un alumno)
//   coros:pkce:<state>        → { studentId, verifier, issuer, clientId, creado }   (15 minutos)
//   coros:clientes            → { "<issuer> <redirect>": clientId }   (registro dinámico)
//   coros:envios:<studentId>  → { "<semana>": { "<dia>": { idInPlan, firma, fecha, nombre, retirado } } }
//   coros:leidas:<studentId>  → { "<labelId>": { fecha, intentos, hecho } }   (no gastar la cuota de FIT)
// Y en la ficha del alumno, lo que se puede mostrar:
//   student.coros → { conectado, conectadoEl, dispositivo, ultimoEnvio, ultimaLectura, errorDeLectura, porBorrar }
//
// Los testigos NUNCA salen del servidor. Nunca se piden ni se guardan el correo ni la contraseña
// de COROS del alumno: entra en la página de COROS (acuerdo de COROS, 8.11).
//
// Mismo principio que intervals.icu y Garmin: lo del reloj NUNCA puede romper el plan. Nada de
// acá lanza: todo devuelve un resultado que describe lo que pasó.

import crypto from "crypto";
import { kvGet, kvSet, kvDelete } from "./supabaseAdmin";
import { localDateISO } from "./plan-engine.mjs";
import { semanasParaReenviar, rangoDeSemana, alertasEfectivas } from "./intervals-icu.mjs";
import { leerAjustesReloj } from "./intervals-push";
import * as C from "./coros.mjs";
import { actividadDesdeFit } from "./fit-actividad.mjs";
import { ubicarActividad, repartirActividades, resumenDeActividad, kmPorKm, llevaPasoAPaso, pasoAPaso } from "./intervals-read.mjs";
import { guardarLectura } from "./intervals-pull";
import { guardarSaludDiaria, alDesconectar, leerConsentimiento } from "./salud-servidor";
import { aceptoSalud } from "./consentimiento.mjs";

// La dirección pública de COROS MCP. Se puede cambiar por variable de entorno solo para las
// pruebas (un COROS simulado).
const BASE = () => (process.env.COROS_MCP_BASE || C.MCP_BASE).replace(/\/+$/, "");
export const estaDisponible = () => process.env.COROS_DESACTIVADO !== "1";

const K = {
  cuenta: (id) => `coros:cuenta:${id}`,
  usuario: (s) => `coros:usuario:${s}`,
  pkce: (state) => `coros:pkce:${state}`,
  clientes: () => "coros:clientes",
  envios: (id) => `coros:envios:${id}`,
  leidas: (id) => `coros:leidas:${id}`,
};

const VIAJE_MS = 15 * 60 * 1000;
const RENOVAR_ANTES_MS = 24 * 3600 * 1000;   // el testigo dura 30 días: se renueva el último día
const MINUTOS_ENTRE_LECTURAS = 15;
const HORAS_ENTRE_SALUD = 6;
const DIAS_A_MIRAR = 10;
const MAX_FIT_POR_LECTURA = 6;                // COROS da 50 archivos FIT por día y por usuario
const MAX_INTENTOS_FIT = 3;
const MAX_BYTES_FIT = 25 * 1024 * 1024;

const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const compacta = (iso) => String(iso).replace(/-/g, "");     // 2026-11-10 → 20261110
const haceDias = (n, hoy = localDateISO()) => { const d = new Date(`${hoy}T12:00:00`); d.setDate(d.getDate() - n); return localDateISO(d); };

async function conTope(promesa, ms) {
  let t;
  const tope = new Promise((res) => { t = setTimeout(() => res(null), ms); });
  try { return await Promise.race([promesa, tope]); } finally { clearTimeout(t); }
}

async function pedirHttp(url, opciones = {}, ms = 15000) {
  const control = new AbortController();
  const t = setTimeout(() => control.abort(), ms);
  try {
    const res = await fetch(url, { ...opciones, signal: control.signal, redirect: "manual" });
    const texto = await res.text().catch(() => "");
    return { estado: res.status, texto, cabeceras: res.headers };
  } catch (e) {
    return { estado: 0, texto: "", cabeceras: null };
  } finally {
    clearTimeout(t);
  }
}
const comoJson = (t) => { try { return JSON.parse(t); } catch (e) { return null; } };

/* ---------------------------------------------------------------------------
   CONECTAR (OAuth 2.0 + PKCE, con registro dinámico del cliente)
--------------------------------------------------------------------------- */

// COROS tiene un servidor por región (mcpus, mcpeu, mcpcn); mcp.coros.com dice cuál usar.
async function descubrirIssuer() {
  const base = BASE();
  const r = await pedirHttp(`${base}/.well-known/openid-configuration`, { headers: { Accept: "application/json" } }, 10000);
  const iss = r.estado === 200 ? comoJson(r.texto)?.issuer : null;
  return typeof iss === "string" && /^https?:\/\//.test(iss) ? iss.replace(/\/+$/, "") : base;
}

// El client_id de esta app en ese servidor de COROS (se registra una vez y se recuerda).
async function clienteDe(issuer, redirectUri) {
  const clave = `${issuer} ${redirectUri}`;
  const todos = (await kvGet(K.clientes())) || {};
  if (todos[clave]) return todos[clave];
  const r = await pedirHttp(`${issuer}/connect/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_name: "TROTAMUNDOS",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope: C.ALCANCES,
      token_endpoint_auth_method: "none",
    }),
  });
  const id = (r.estado === 200 || r.estado === 201) ? comoJson(r.texto)?.client_id : null;
  if (typeof id !== "string" || !id) return null;
  const frescos = (await kvGet(K.clientes())) || {};
  await kvSet(K.clientes(), { ...frescos, [clave]: id });
  return id;
}

const redirectDe = (origen) => `${origen}/api/coros/callback`;

export async function urlDeAutorizacion(studentId, origen) {
  if (!estaDisponible()) return null;
  const issuer = await descubrirIssuer();
  const clientId = await clienteDe(issuer, redirectDe(origen));
  if (!clientId) return null;
  const verifier = b64url(crypto.randomBytes(48));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  const state = b64url(crypto.randomBytes(24));
  if (!(await kvSet(K.pkce(state), { studentId, verifier, issuer, clientId, creado: Date.now() }))) return null;
  const p = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectDe(origen),
    scope: C.ALCANCES,
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource: `${issuer}/mcp`,
    state,
  });
  return `${issuer}/oauth2/authorize?${p.toString()}`;
}

async function pedirToken(issuer, campos) {
  const r = await pedirHttp(`${issuer}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(campos).toString(),
  });
  if (r.estado !== 200) return { ok: false, estado: r.estado, motivo: r.estado ? `rechazado:${r.estado}` : "red" };
  const j = comoJson(r.texto);
  if (!j?.access_token) return { ok: false, estado: r.estado, motivo: "sin-testigo" };
  return {
    ok: true,
    accessToken: j.access_token,
    refreshToken: j.refresh_token || null,
    expiraEn: Date.now() + (Number(j.expires_in) || 30 * 86400) * 1000,
  };
}

// El "sub" del testigo (es un JWT): identifica la cuenta de COROS sin pedirle nada al alumno.
function sujetoDe(token) {
  try {
    const p = JSON.parse(Buffer.from(String(token).split(".")[1] || "", "base64url").toString("utf8"));
    return typeof p?.sub === "string" || typeof p?.sub === "number" ? String(p.sub) : null;
  } catch (e) {
    return null;
  }
}

export async function alumnoDelViaje(state) {
  if (typeof state !== "string" || !state) return null;
  const v = await kvGet(K.pkce(state));
  return v?.studentId && Date.now() - (v.creado || 0) <= VIAJE_MS ? v.studentId : null;
}

export async function completarConexion({ state, code, origen }) {
  if (typeof state !== "string" || typeof code !== "string") return { ok: false, motivo: "faltan-datos" };
  const viaje = await kvGet(K.pkce(state));
  await kvDelete(K.pkce(state)); // de un solo uso
  if (!viaje?.studentId || Date.now() - (viaje.creado || 0) > VIAJE_MS) return { ok: false, motivo: "expirado" };
  const studentId = viaje.studentId;

  const t = await pedirToken(viaje.issuer, {
    grant_type: "authorization_code", client_id: viaje.clientId, code, redirect_uri: redirectDe(origen), code_verifier: viaje.verifier,
  });
  if (!t.ok) return { ok: false, motivo: t.motivo, studentId };

  const sujeto = sujetoDe(t.accessToken);
  if (sujeto) {
    const dueño = await kvGet(K.usuario(sujeto));
    if (dueño?.studentId && dueño.studentId !== studentId) return { ok: false, motivo: "cuenta-de-otro-alumno", studentId };
  }

  const cuenta = {
    issuer: viaje.issuer, mcpUrl: `${viaje.issuer}/mcp`, clientId: viaje.clientId,
    accessToken: t.accessToken, refreshToken: t.refreshToken, expiraEn: t.expiraEn,
    sujeto, dispositivo: null, conectadoEl: new Date().toISOString(),
  };
  if (!(await kvSet(K.cuenta(studentId), cuenta))) return { ok: false, motivo: "no-se-pudo-guardar", studentId };
  if (sujeto) await kvSet(K.usuario(sujeto), { studentId });

  await marcarEnFicha(studentId, { conectado: true, conectadoEl: cuenta.conectadoEl, dispositivo: null, ultimoEnvio: null, errorDeLectura: null, porBorrar: [] });
  // El modelo del reloj, para la atribución "COROS [modelo]".
  const mcp = await abrirMcp(studentId);
  if (mcp.ok) await revisarModelo(studentId, mcp);

  // Y de una vez, la semana en curso y la siguiente. Con tope de tiempo: lo que no alcance se
  // manda en el próximo guardado o en la tarea diaria.
  await conTope((async () => {
    const student = await kvGet(`student:${studentId}`);
    if (student) for (const n of semanasVigentes(student)) await enviarSemanaACoros(student, n);
  })().catch((e) => console.error("coros: no se pudo hacer el primer envío", e)), 8000);
  return { ok: true, studentId };
}

/* ---------------------------------------------------------------------------
   EL MCP
--------------------------------------------------------------------------- */

// Un testigo vigente (renovándolo si hace falta). { token, cuenta } o { revocado } o null.
async function tokenDe(studentId, { forzarRenovacion = false } = {}) {
  const cuenta = await kvGet(K.cuenta(studentId));
  if (!cuenta?.accessToken) return null;
  if (!forzarRenovacion && Date.now() < (cuenta.expiraEn || 0) - RENOVAR_ANTES_MS) return { token: cuenta.accessToken, cuenta };
  if (!cuenta.refreshToken) return { revocado: true };
  for (let intento = 0; intento < 2; intento++) {
    const t = await pedirToken(cuenta.issuer, { grant_type: "refresh_token", client_id: cuenta.clientId, refresh_token: cuenta.refreshToken });
    if (t.ok) {
      // COROS entrega un refresh nuevo cada vez (y el anterior deja de servir): se guarda.
      const nueva = { ...cuenta, accessToken: t.accessToken, refreshToken: t.refreshToken || cuenta.refreshToken, expiraEn: t.expiraEn };
      await kvSet(K.cuenta(studentId), nueva);
      return { token: nueva.accessToken, cuenta: nueva };
    }
    // Otro pedido pudo renovarlo al mismo tiempo: si el refresh guardado ya es otro, se usa ese.
    const fresca = await kvGet(K.cuenta(studentId));
    if (fresca?.refreshToken && fresca.refreshToken !== cuenta.refreshToken) return { token: fresca.accessToken, cuenta: fresca };
    if (t.estado === 0 || t.estado >= 500) return null; // COROS caído: no es una revocación
    await new Promise((r) => setTimeout(r, 800));
  }
  return { revocado: true };
}

// Abre una conversación con el MCP de COROS para ese alumno. Devuelve { ok, llamar(nombre, args) }
// o { ok: false, motivo }.
export async function abrirMcp(studentId) {
  let acceso = await tokenDe(studentId);
  if (!acceso) return { ok: false, motivo: "sin-conexion" };
  if (acceso.revocado) return { ok: false, motivo: "permiso-revocado" };
  let sesion = null;
  let sigId = 1;

  const post = async (cuerpo) => {
    const r = await pedirHttp(acceso.cuenta.mcpUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${acceso.token}`,
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        "MCP-Protocol-Version": C.VERSION_MCP,
        ...(sesion ? { "Mcp-Session-Id": sesion } : {}),
      },
      body: JSON.stringify(cuerpo),
    }, 25000);
    const s = r.cabeceras?.get?.("mcp-session-id");
    if (s) sesion = s;
    return r;
  };

  const iniciar = async () => {
    sesion = null;
    const id = sigId++;
    const r = await post(C.pedidoRpc(id, "initialize", {
      protocolVersion: C.VERSION_MCP, capabilities: {}, clientInfo: { name: "TROTAMUNDOS", version: "1.0.0" },
    }));
    if (r.estado !== 200) return r.estado;
    const m = C.leerRespuestaMcp(r.texto, id);
    if (!m?.result) return 500;
    await post({ jsonrpc: "2.0", method: "notifications/initialized" });
    return 200;
  };

  let estado = await iniciar();
  if (estado === 401 || estado === 403) {
    acceso = await tokenDe(studentId, { forzarRenovacion: true });
    if (!acceso || acceso.revocado) return { ok: false, motivo: acceso?.revocado ? "permiso-revocado" : "sin-conexion" };
    estado = await iniciar();
  }
  if (estado !== 200) return { ok: false, motivo: estado === 401 || estado === 403 ? "permiso-revocado" : estado ? `coros:${estado}` : "red" };

  const llamar = async (nombre, args = {}) => {
    for (let intento = 0; intento < 2; intento++) {
      const id = sigId++;
      const r = await post(C.pedidoRpc(id, "tools/call", { name: nombre, arguments: args }));
      if ((r.estado === 404 || r.estado === 400) && sesion && intento === 0) { await iniciar(); continue; } // la sesión venció
      if (r.estado !== 200) return { ok: false, estado: r.estado, resultado: null };
      const m = C.leerRespuestaMcp(r.texto, id);
      const resultado = m?.result || null;
      return { ok: !!resultado && !C.esRechazo(resultado), estado: 200, resultado, error: m?.error || null };
    }
    return { ok: false, estado: 0, resultado: null };
  };
  return { ok: true, llamar, cuenta: acceso.cuenta };
}

// El modelo del reloj (no de una banda de frecuencia u otro accesorio vinculado a la cuenta).
// Se pregunta a COROS si todavía no se tiene un reloj anotado.
async function guardarModelo(studentId, modelo) {
  const cuenta = await kvGet(K.cuenta(studentId));
  if (!cuenta) return;
  await kvSet(K.cuenta(studentId), { ...cuenta, dispositivo: modelo });
  await marcarEnFicha(studentId, { dispositivo: modelo });
}
async function revisarModelo(studentId, mcp) {
  const cuenta = await kvGet(K.cuenta(studentId));
  if (!cuenta || C.esReloj(cuenta.dispositivo)) return;
  const d = await mcp.llamar("queryDevices", {});
  const modelo = d.ok ? C.dispositivoDe(d.resultado) : null;
  if (modelo) await guardarModelo(studentId, C.modeloCoros(modelo));
  else if (cuenta.dispositivo) await guardarModelo(studentId, null);
}

// Para la pantalla: si la ficha tiene anotado un accesorio en vez del reloj, se corrige.
export async function corregirModelo(studentId) {
  const cuenta = await kvGet(K.cuenta(studentId));
  if (!cuenta || C.esReloj(cuenta.dispositivo)) return cuenta?.dispositivo || null;
  const mcp = await abrirMcp(studentId);
  if (mcp.ok) await revisarModelo(studentId, mcp);
  return (await kvGet(K.cuenta(studentId)))?.dispositivo || null;
}

export async function estaConectadoCoros(studentId) {
  return !!(await kvGet(K.cuenta(studentId)))?.accessToken;
}

async function marcarEnFicha(studentId, cambios) {
  try {
    const s = await kvGet(`student:${studentId}`);
    if (!s) return;
    if (cambios === null) {
      const { coros: _c, ...resto } = s;
      await kvSet(`student:${studentId}`, resto);
      return;
    }
    const nuevos = typeof cambios === "function" ? cambios(s.coros || {}) : cambios;
    await kvSet(`student:${studentId}`, { ...s, coros: { ...(s.coros || {}), ...nuevos } });
  } catch (e) {
    console.error("coros: no se pudo anotar en la ficha", e);
  }
}

// Si COROS ya no acepta el permiso (el alumno lo retiró desde COROS), se desconecta y se borra lo
// que vino de COROS: el acuerdo pide hacerlo dentro de las 24 horas.
async function siRevocado(studentId, motivo) {
  if (motivo !== "permiso-revocado") return false;
  await desconectarCoros(studentId, { avisarACoros: false });
  return true;
}

/* ---------------------------------------------------------------------------
   ENTRENAMIENTOS AL RELOJ
--------------------------------------------------------------------------- */

function semanasVigentes(student, hoy = localDateISO()) {
  return Object.keys(student?.weeks || {}).map(Number)
    .filter((n) => { const r = rangoDeSemana(student, n); return r && r.hasta >= hoy; })
    .sort((a, b) => a - b).slice(0, 2);
}

// Deja el calendario de COROS igual al plan en esa semana: crea lo nuevo, edita lo cambiado y
// retira lo que ya no está (COROS no deja borrar: se reemplaza por un aviso para borrarlo en la
// app). Solo toca lo que puso esta app, y nunca lo pasado.
export async function enviarSemanaACoros(student, weekNum, { general, hoy = localDateISO() } = {}) {
  const resultado = { ok: false, enviados: 0, editados: 0, retirados: 0, motivo: null, semana: weekNum };
  if (!student?.id || !(await estaConectadoCoros(student.id))) return { ...resultado, motivo: "sin-conexion" };

  const generalAlertas = general ?? (await leerAjustesReloj()).alertasRitmo;
  let deseados = [];
  try {
    deseados = C.semanaACourses(student, weekNum, { alertas: alertasEfectivas(student, generalAlertas) });
  } catch (e) {
    return { ...resultado, motivo: "error-traduciendo" };
  }
  const todos = (await kvGet(K.envios(student.id))) || {};
  const enviados = { ...(todos[weekNum] || {}) };
  const plan = C.planDeEnvioCoros(deseados, enviados, hoy);
  if (!plan.crear.length && !plan.editar.length && !plan.retirar.length) {
    return { ...resultado, ok: true, motivo: deseados.length ? "sin-cambios" : "sin-sesiones" };
  }

  const mcp = await abrirMcp(student.id);
  if (!mcp.ok) {
    if (await siRevocado(student.id, mcp.motivo)) return { ...resultado, motivo: "permiso-revocado" };
    await marcarEnFicha(student.id, { ultimoEnvio: { semana: weekNum, ok: false, enviados: 0, motivo: mcp.motivo, fecha: new Date().toISOString() } });
    return { ...resultado, motivo: mcp.motivo };
  }

  let fallos = 0;
  const porBorrar = [];

  const crear = async (d) => {
    // Un envío anterior quedó sin respuesta: se mira el calendario antes, para no duplicarlo.
    const previo = enviados[String(d.dia)];
    if (previo?.incierto && previo.fecha === d.fecha) {
      const cal = await mcp.llamar("queryTrainingSchedule", { startDate: compacta(d.fecha), endDate: compacta(d.fecha) });
      if (cal.ok && C.textoDe(cal.resultado).includes(d.course.courseName)) {
        enviados[String(d.dia)] = { idInPlan: null, firma: d.firma, fecha: d.fecha, nombre: d.course.courseName };
        resultado.enviados++;
        return;
      }
    }
    const r = await mcp.llamar("createScheduledWorkout", { date: compacta(d.fecha), course: d.course });
    if (!r.ok) {
      fallos++;
      // Sin respuesta no se sabe si quedó: la próxima vez se revisa antes de volver a crearlo.
      if (r.estado === 0) enviados[String(d.dia)] = { idInPlan: null, firma: null, fecha: d.fecha, nombre: d.course.courseName, incierto: true };
      return;
    }
    enviados[String(d.dia)] = { idInPlan: C.idInPlanDe(r.resultado), firma: d.firma, fecha: d.fecha, nombre: d.course.courseName };
    resultado.enviados++;
  };

  for (const b of plan.retirar) {
    if (b.idInPlan != null) {
      const r = await mcp.llamar("updateScheduledWorkout", { date: compacta(b.fecha), idInPlan: String(b.idInPlan), course: C.COURSE_RETIRADO });
      if (r.ok) {
        const nuevoId = C.idInPlanDe(r.resultado) ?? b.idInPlan;
        // Si el mismo día recibe otra sesión, esta entrada se reemplaza más abajo.
        enviados[String(b.dia)] = { idInPlan: nuevoId, firma: null, fecha: b.fecha, nombre: C.COURSE_RETIRADO.courseName, retirado: true };
      }
    } else {
      delete enviados[String(b.dia)];
    }
    porBorrar.push({ fecha: b.fecha, nombre: b.nombre || "Sesión" });
    resultado.retirados++;
  }
  for (const d of plan.editar) {
    const r = await mcp.llamar("updateScheduledWorkout", { date: compacta(d.fecha), idInPlan: String(d.idInPlan), course: d.course });
    if (r.ok) {
      enviados[String(d.dia)] = { idInPlan: C.idInPlanDe(r.resultado) ?? d.idInPlan, firma: d.firma, fecha: d.fecha, nombre: d.course.courseName };
      resultado.editados++;
      continue;
    }
    if (r.estado !== 200) { fallos++; continue; }
    // COROS no la deja editar (el alumno la borró, o ya la hizo): se crea de nuevo.
    await crear(d);
  }
  for (const d of plan.crear) await crear(d);

  const frescos = (await kvGet(K.envios(student.id))) || {};
  await kvSet(K.envios(student.id), { ...frescos, [weekNum]: enviados });
  const final = { ...resultado, ok: fallos === 0, motivo: fallos ? "algunos-fallaron" : null };
  await marcarEnFicha(student.id, (actual) => ({
    ultimoEnvio: { semana: weekNum, ok: final.ok, enviados: final.enviados + final.editados, motivo: final.motivo, fecha: new Date().toISOString() },
    porBorrar: unirPorBorrar(actual.porBorrar, porBorrar, hoy),
  }));
  return final;
}

function unirPorBorrar(antes, nuevos, hoy) {
  const lista = [...(Array.isArray(antes) ? antes : []), ...nuevos].filter((x) => x?.fecha && x.fecha >= hoy);
  const vistos = new Set();
  return lista.filter((x) => { const k = `${x.fecha}|${x.nombre}`; if (vistos.has(k)) return false; vistos.add(k); return true; }).slice(-20);
}

// Después de guardar la ficha: reenvía las semanas cuyo contenido para el reloj cambió.
export async function reenviarCorosCambiadas(antes, despues, { hoy = localDateISO(), limiteMs = 6000 } = {}) {
  if (!despues?.id || !(await estaConectadoCoros(despues.id))) return { ok: true, semanas: [] };
  const general = (await leerAjustesReloj()).alertasRitmo;
  let semanas;
  try { semanas = semanasParaReenviar(antes, despues, hoy, { general }).slice(0, 4); } catch (e) { return { ok: false, semanas: [] }; }
  if (!semanas.length) return { ok: true, semanas: [] };
  const trabajo = (async () => { const r = []; for (const n of semanas) r.push(await enviarSemanaACoros(despues, n, { general, hoy })); return r; })().catch(() => null);
  const resultados = await conTope(trabajo, limiteMs);
  return { ok: !!resultados && resultados.every((r) => r.ok), semanas, resultados };
}

// Después de publicar una semana nueva.
export async function enviarACorosSiCorresponde(student, weekNum) {
  if (!student?.id || !(await estaConectadoCoros(student.id))) return { ok: true, motivo: "sin-conexion" };
  return enviarSemanaACoros(student, weekNum);
}

/* ---------------------------------------------------------------------------
   TRAER LO ENTRENADO Y LA SALUD (COROS no avisa: se pregunta)
--------------------------------------------------------------------------- */

function recienLeido(student, minutos) {
  const t = Date.parse(student?.coros?.ultimaLectura || "");
  return Number.isFinite(t) && Date.now() - t < minutos * 60 * 1000;
}

async function bajarFit(url) {
  const control = new AbortController();
  const t = setTimeout(() => control.abort(), 20000);
  try {
    const res = await fetch(url, { signal: control.signal });
    if (!res.ok) return null;
    const largo = Number(res.headers.get("content-length") || 0);
    if (largo > MAX_BYTES_FIT) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    return buf.length && buf.length <= MAX_BYTES_FIT ? buf : null;
  } catch (e) {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function traerDeCoros(student, { forzar = false, minutosEntreLecturas = MINUTOS_ENTRE_LECTURAS, dias = DIAS_A_MIRAR, hoy = localDateISO() } = {}) {
  const resultado = { ok: false, actualizadas: 0, extras: 0, salud: 0, motivo: null };
  if (!student?.id || !(await estaConectadoCoros(student.id))) return { ...resultado, ok: true, motivo: "sin-conexion" };
  if (!forzar && recienLeido(student, minutosEntreLecturas)) return { ...resultado, ok: true, motivo: "leido-hace-poco" };

  const mcp = await abrirMcp(student.id);
  if (!mcp.ok) {
    if (await siRevocado(student.id, mcp.motivo)) return { ...resultado, motivo: "permiso-revocado" };
    await marcarEnFicha(student.id, { ultimaLectura: new Date().toISOString(), errorDeLectura: mcp.motivo });
    return { ...resultado, motivo: mcp.motivo };
  }

  await revisarModelo(student.id, mcp).catch(() => null);
  let modeloActual = (await kvGet(K.cuenta(student.id)))?.dispositivo || null;

  // 1) Actividades: la lista, y el archivo FIT de cada una que no se haya leído.
  const items = [];
  const lista = await mcp.llamar("querySportRecords", { startDate: compacta(haceDias(dias, hoy)), endDate: compacta(hoy), limit: 30 });
  if (lista.ok) {
    const leidas = (await kvGet(K.leidas(student.id))) || {};
    const pendientes = C.actividadesDe(lista.resultado)
      .filter((a) => !leidas[a.labelId]?.hecho)
      .sort((a, b) => String(a.fecha || "").localeCompare(String(b.fecha || "")));
    let bajados = 0;
    for (const a of pendientes) {
      if (a.sportType != null && !C.esCarreraCoros(a.sportType)) { leidas[a.labelId] = { fecha: a.fecha, hecho: true }; continue; }
      if (bajados >= MAX_FIT_POR_LECTURA) break;
      bajados++;
      const intentos = (leidas[a.labelId]?.intentos || 0) + 1;
      leidas[a.labelId] = { fecha: a.fecha, intentos, hecho: intentos >= MAX_INTENTOS_FIT };
      const u = await mcp.llamar("queryActivityFitFileDownloadUrls", { labelId: a.labelId, sportType: a.sportType ?? 100 });
      const url = u.ok ? C.enlaceFitDe(u.resultado) : null;
      const bytes = url ? await bajarFit(url) : null;
      if (!bytes) continue;
      const c = actividadDesdeFit(bytes, { id: `coros-${a.labelId}` });
      leidas[a.labelId] = { fecha: a.fecha, hecho: true };
      if (c?.error || c?.actividad?.type !== "Run") continue;
      // El archivo dice con qué reloj se corrió: es el dato más fiel del modelo.
      const modeloFit = String(c.actividad.device_name || "").replace(/^coros\s*/i, "").trim();
      const relojFit = modeloFit && C.esReloj(`COROS ${modeloFit}`) && !/^\d+$/.test(modeloFit) ? C.modeloCoros(modeloFit) : null;
      if (relojFit && relojFit !== modeloActual) { await guardarModelo(student.id, relojFit); modeloActual = relojFit; }
      c.actividad.device_name = C.atribucionCoros(relojFit || (C.esReloj(modeloActual) ? modeloActual : ""));
      const resumen = resumenDeActividad(c.actividad, c.vueltas, kmPorKm(c.streams));
      if (!resumen) continue;
      resumen.fuente = "coros";
      items.push({ resumen, sitio: ubicarActividad(c.actividad, null, student), streams: c.streams });
    }
    // Solo se recuerda lo de los últimos 40 días.
    const limite = haceDias(40, hoy);
    for (const [k, v] of Object.entries(leidas)) if (v?.fecha && v.fecha < limite) delete leidas[k];
    await kvSet(K.leidas(student.id), leidas);
  }

  let r = { actualizadas: 0, extras: 0 };
  const { alPlan, adicionales } = repartirActividades(items, student);
  const easyPace = student.paces?.E ?? null;
  for (const x of alPlan) {
    const day = student.weeks?.[x.semana]?.plan?.[x.dia];
    if (!day || !llevaPasoAPaso(day, easyPace)) continue;
    const streams = items.find((i) => i.resumen.id === x.resumen.id)?.streams;
    const pasos = pasoAPaso({ vueltas: x.resumen.vueltas, streams }, day, easyPace);
    if (pasos) x.resumen = { ...x.resumen, pasos };
  }
  r = await guardarLectura(student, alPlan, adicionales, { sello: "coros" });
  if (!lista.ok) await marcarEnFicha(student.id, { errorDeLectura: "no-se-pudo-leer" });

  // 2) Salud: solo con consentimiento, y cada algunas horas. La primera vez se traen las
  // últimas 4 semanas, para que el alumno tenga su "normal" desde el primer día.
  try {
    const cuenta = await kvGet(K.cuenta(student.id));
    const ultima = Date.parse(cuenta?.ultimaSalud || "");
    // Si la última vez no llegó nada, se vuelve a intentar a la media hora (no a las 6 horas).
    const espera = cuenta?.saludVacia ? 0.5 : HORAS_ENTRE_SALUD;
    const toca = forzar || !Number.isFinite(ultima) || Date.now() - ultima > espera * 3600 * 1000;
    if (cuenta && toca && aceptoSalud(await leerConsentimiento(student.id))) {
      const textos = await leerSaludDeCoros(mcp, { historial: !cuenta.historialSalud, hoy });
      const porDia = C.saludDesdeCoros(textos);
      for (const [fecha, datos] of Object.entries(porDia)) {
        const g = await guardarSaludDiaria({ studentId: student.id, fecha, fuente: "coros", datos });
        if (g.ok) resultado.salud++;
      }
      const hubo = Object.keys(porDia).length > 0;
      const fresca = await kvGet(K.cuenta(student.id));
      if (fresca) {
        await kvSet(K.cuenta(student.id), {
          ...fresca, ultimaSalud: new Date().toISOString(), saludVacia: !hubo,
          historialSalud: fresca.historialSalud || hubo,
        });
      }
    }
  } catch (e) {
    console.error("coros: no se pudo leer la salud", e);
  }

  return { ...resultado, ok: lista.ok && r.ok !== false, actualizadas: r.actualizadas || 0, extras: r.extras || 0, motivo: lista.ok ? (r.motivo || null) : "no-se-pudo-leer" };
}

// Para la tarea diaria: todos los alumnos con COROS, uno por uno, con presupuesto de tiempo.
// También es lo que descubre a tiempo (en menos de 24 horas) a quien retiró el permiso desde COROS.
export async function traerCorosDeTodos({ limiteMs = 40000 } = {}) {
  const informe = { leidos: 0, actualizadas: 0, extras: 0, salud: 0, pendientes: 0, fallos: [] };
  const arranque = Date.now();
  const roster = (await kvGet("roster")) || [];
  for (const e of roster) {
    if (!e?.id || !(await estaConectadoCoros(e.id))) continue;
    if (Date.now() - arranque > limiteMs) { informe.pendientes++; continue; }
    try {
      const s = await kvGet(`student:${e.id}`);
      if (!s) continue;
      const r = await traerDeCoros(s, { forzar: true });
      informe.leidos++;
      informe.actualizadas += r.actualizadas || 0;
      informe.extras += r.extras || 0;
      informe.salud += r.salud || 0;
      if (!r.ok) informe.fallos.push({ alumno: e.id, motivo: r.motivo });
    } catch (err) {
      informe.fallos.push({ alumno: e.id, motivo: err?.message || "error" });
    }
  }
  return informe;
}

// Los textos de salud de COROS. Con historial: 4 semanas (sueño y VFC por ventanas de 7 días,
// porque la VFC no da más de 7 por consulta).
async function leerSaludDeCoros(mcp, { historial = false, hoy = localDateISO() } = {}) {
  const texto = async (nombre, args) => { const x = await mcp.llamar(nombre, args); return x.ok ? C.textoDe(x.resultado) : ""; };
  if (!historial) {
    return {
      diario: await texto("queryDailyHealthData", { days: 7 }),
      reposo: await texto("queryRestingHeartRate", { days: 7 }),
      sueño: await texto("querySleepOverview", { days: 7 }),
      vfc: await texto("querySleepHrv", { days: 7 }),
    };
  }
  const sueño = [], vfc = [];
  for (let s = 0; s < 4; s++) {
    const rango = { startDate: compacta(haceDias(7 * s + 6, hoy)), endDate: compacta(haceDias(7 * s, hoy)) };
    sueño.push(await texto("querySleepOverview", rango));
    vfc.push(await texto("querySleepHrv", rango));
  }
  return {
    diario: await texto("queryDailyHealthData", { days: 28 }),
    reposo: await texto("queryRestingHeartRate", { days: 28 }),
    sueño: sueño.join("\n"),
    vfc: vfc.join("\n"),
  };
}

// Revisión de la conexión de salud, sin mostrar datos: qué responde cada consulta (dígitos
// cambiados por "#") y cuántos días se pudieron leer. Para encontrar un formato que no se lee.
export async function diagnosticoDeSalud(studentId) {
  const mcp = await abrirMcp(studentId);
  if (!mcp.ok) return { ok: false, motivo: mcp.motivo };
  const consultas = [
    ["querySleepOverview", { days: 3 }, (t) => C.sueñoDeCoros(t)],
    ["querySleepHrv", { days: 3 }, (t) => C.vfcDeCoros(t)],
    ["queryRestingHeartRate", { days: 3 }, (t) => C.reposoDeCoros(t)],
    ["queryDailyHealthData", { days: 3 }, (t) => C.diarioDeCoros(t)],
  ];
  const out = [];
  for (const [nombre, args, leer] of consultas) {
    const x = await mcp.llamar(nombre, args);
    const t = x.resultado ? C.textoDe(x.resultado) : "";
    out.push({
      consulta: nombre, ok: x.ok, estado: x.estado, error: x.resultado?.isError ? true : undefined,
      estructurado: !!x.resultado?.structuredContent, largo: t.length,
      diasLeidos: Object.keys(leer(t)).length, formato: C.enmascarar(t),
    });
  }
  const cuenta = await kvGet(K.cuenta(studentId));
  return { ok: true, consentimientoSalud: aceptoSalud(await leerConsentimiento(studentId)), ultimaSalud: cuenta?.ultimaSalud || null, historialSalud: !!cuenta?.historialSalud, consultas: out };
}

/* ---------------------------------------------------------------------------
   DESCONECTAR
--------------------------------------------------------------------------- */

// avisarACoros: false cuando es COROS quien ya no acepta el permiso.
// Los entrenamientos que ya están en el calendario de COROS se quedan (COROS no deja borrarlos
// desde otra app); el alumno los borra en la app COROS si quiere.
export async function desconectarCoros(studentId, { avisarACoros = true } = {}) {
  const cuenta = await kvGet(K.cuenta(studentId));
  if (cuenta?.refreshToken && avisarACoros) {
    // Se le pide a COROS que anule el permiso (si no lo acepta, igual se borra todo de nuestro lado).
    await pedirHttp(`${cuenta.issuer}/oauth2/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: cuenta.refreshToken, token_type_hint: "refresh_token", client_id: cuenta.clientId }).toString(),
    }, 8000);
  }
  if (cuenta?.sujeto) await kvDelete(K.usuario(cuenta.sujeto));
  await kvDelete(K.cuenta(studentId));
  await kvDelete(K.envios(studentId));
  await kvDelete(K.leidas(studentId));

  // Lo que vino de COROS: fuera el detalle, queda lo básico de cada sesión (acuerdo de COROS, 9.5).
  let detalleBorrado = 0;
  try {
    const s = await kvGet(`student:${studentId}`);
    if (s) {
      const { student: limpio, cambios } = C.sinDetalleDeCoros(s);
      detalleBorrado = cambios;
      const { coros: _c, ...resto } = limpio;
      await kvSet(`student:${studentId}`, resto);
    }
  } catch (e) {
    console.error("coros: no se pudo limpiar la ficha", e);
  }
  // Retira el consentimiento y borra sus datos de salud (política de privacidad).
  const salud = await alDesconectar(studentId);
  return { ok: true, detalleBorrado, saludBorrada: salud.borrados || 0 };
}
