// Garmin directo, del lado del servidor: conectar la cuenta (OAuth 2.0 con PKCE), mandar
// los entrenamientos al calendario de Garmin Connect, recibir las actividades y la salud por
// push, y desconectar.
//
// Lo que se decide (formatos, conversiones) está en lib/garmin.mjs, que es puro y tiene
// pruebas. Acá está lo que toca a Garmin y a la base de datos.
//
// Filas (todas solo del servidor; /api/data no las deja leer ni escribir):
//   garmin:cuenta:<studentId>  → { accessToken, refreshToken, expiraEn, refreshExpiraEn,
//                                  userId, permisos, conectadoEl }
//   garmin:usuario:<userId>    → { studentId }   (los push de Garmin traen su userId)
//   garmin:pkce:<state>        → { studentId, verifier, creado }   (15 minutos)
//   garmin:envios:<studentId>  → { "<semana>": { "<dia>": { workoutId, scheduleId, firma, fecha } } }
// Y en la ficha del alumno, lo que se puede mostrar:
//   student.garmin → { conectado, conectadoEl, ultimoEnvio, ultimaLectura, dispositivo }
//
// Las credenciales (GARMIN_CLIENT_ID, GARMIN_CLIENT_SECRET) y los testigos de cada alumno
// NUNCA salen del servidor ni se comparten con nadie (acuerdo de Garmin).
//
// Mismo principio que intervals.icu: lo del reloj NUNCA puede romper el plan. Nada de acá
// lanza: todo devuelve un resultado que describe lo que pasó.

import crypto from "crypto";
import { kvGet, kvSet, kvDelete } from "./supabaseAdmin";
import { localDateISO } from "./plan-engine.mjs";
import { todayIn } from "./vigencia.mjs";
// "Hoy" para el reloj es el día en Lima: el servidor está en UTC y, después de las 7 p. m.,
// localDateISO() ya daría mañana y se saltaría la sesión de hoy.
const hoyLima = () => todayIn("America/Lima");
import { semanasParaReenviar, rangoDeSemana, alertasEfectivas } from "./intervals-icu.mjs";
import { leerAjustesReloj } from "./intervals-push";
import * as G from "./garmin.mjs";
import { ubicarActividad, repartirActividades, resumenDeActividad, kmPorKm, llevaPasoAPaso, pasoAPaso } from "./intervals-read.mjs";
import { guardarLectura } from "./intervals-pull";
import { guardarSaludDiaria, alDesconectar, leerConsentimiento, borrarSalud } from "./salud-servidor";
import { aceptoSalud } from "./consentimiento.mjs";

// Las direcciones son las de la documentación de Garmin. Se pueden cambiar por variable de
// entorno solo para las pruebas (un Garmin simulado).
const CONNECT_URL = () => process.env.GARMIN_CONNECT_URL || "https://connect.garmin.com/oauth2Confirm";
const TOKEN_URL = () => process.env.GARMIN_TOKEN_URL || "https://diauth.garmin.com/di-oauth2-service/oauth/token";
const API = () => process.env.GARMIN_API_URL || "https://apis.garmin.com";

export const estaConfigurado = () => !!(process.env.GARMIN_CLIENT_ID && process.env.GARMIN_CLIENT_SECRET);

const K = {
  cuenta: (id) => `garmin:cuenta:${id}`,
  usuario: (uid) => `garmin:usuario:${uid}`,
  pkce: (state) => `garmin:pkce:${state}`,
  envios: (id) => `garmin:envios:${id}`,
  // Lo último que llegó de Garmin para el alumno (tipo, deporte, fecha, qué se hizo): para
  // revisar desde el panel del coach si las actividades están llegando.
  recibido: (id) => `garmin:recibido:${id}`,
  // Los últimos avisos que llegaron a la app (de cualquier alumno): solo cuándo, qué tipos y
  // cuántos eran de cuentas unidas. Sirve para saber si Garmin está llamando.
  avisos: "garmin:avisos:ultimos",
};

// Los permisos que el alumno dio en Garmin Connect. La ruta documentada es la de wellness-api;
// la de partner-gateway queda de respaldo. null = no se pudo saber (no es lo mismo que []).
async function leerPermisos(token) {
  let ultimo = null;
  for (const ruta of ["/wellness-api/rest/user/permissions", "/partner-gateway/rest/user/permissions"]) {
    const r = await llamarConToken(token, "GET", ruta);
    ultimo = r;
    const lista = Array.isArray(r.datos) ? r.datos : r.datos?.permissions;
    if (r.ok && Array.isArray(lista)) return { permisos: lista, estado: r.estado, ruta };
  }
  return { permisos: null, estado: ultimo?.estado ?? 0, ruta: null };
}

const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/* ---------------------------------------------------------------------------
   CONECTAR (OAuth 2.0 + PKCE)
--------------------------------------------------------------------------- */

export async function urlDeAutorizacion(studentId, origen) {
  if (!estaConfigurado()) return null;
  const verifier = b64url(crypto.randomBytes(48));                 // 64 caracteres
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  const state = b64url(crypto.randomBytes(24));
  if (!(await kvSet(K.pkce(state), { studentId, verifier, creado: Date.now() }))) return null;
  const p = new URLSearchParams({
    response_type: "code",
    client_id: process.env.GARMIN_CLIENT_ID,
    code_challenge: challenge,
    code_challenge_method: "S256",
    redirect_uri: `${origen}/api/garmin/callback`,
    state,
  });
  return `${CONNECT_URL()}?${p.toString()}`;
}

const basic = () => `Basic ${Buffer.from(`${process.env.GARMIN_CLIENT_ID}:${process.env.GARMIN_CLIENT_SECRET}`).toString("base64")}`;

async function pedirToken(campos) {
  try {
    const res = await fetch(TOKEN_URL(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: basic() },
      body: new URLSearchParams({ client_id: process.env.GARMIN_CLIENT_ID, client_secret: process.env.GARMIN_CLIENT_SECRET, ...campos }).toString(),
    });
    if (!res.ok) return { ok: false, motivo: `rechazado:${res.status}` };
    const j = await res.json();
    if (!j?.access_token) return { ok: false, motivo: "sin-testigo" };
    const ahora = Date.now();
    return {
      ok: true,
      accessToken: j.access_token,
      refreshToken: j.refresh_token || null,
      // Se renueva 10 minutos antes de que venza, como recomienda Garmin.
      expiraEn: ahora + (Number(j.expires_in) || 86400) * 1000,
      refreshExpiraEn: ahora + (Number(j.refresh_token_expires_in) || 7776000) * 1000,
    };
  } catch (e) {
    return { ok: false, motivo: "red" };
  }
}

// De qué alumno es un viaje de conexión (sin consumirlo), para comprobar la sesión antes.
export async function alumnoDelViaje(state) {
  if (typeof state !== "string" || !state) return null;
  const v = await kvGet(K.pkce(state));
  return v?.studentId && Date.now() - (v.creado || 0) <= 15 * 60 * 1000 ? v.studentId : null;
}

// La vuelta desde Garmin: canjea el código, identifica al usuario de Garmin y guarda todo.
export async function completarConexion({ state, code, origen }) {
  if (!estaConfigurado()) return { ok: false, motivo: "sin-configurar" };
  if (typeof state !== "string" || typeof code !== "string") return { ok: false, motivo: "faltan-datos" };
  const viaje = await kvGet(K.pkce(state));
  await kvDelete(K.pkce(state)); // de un solo uso
  if (!viaje?.studentId || Date.now() - (viaje.creado || 0) > 15 * 60 * 1000) return { ok: false, motivo: "expirado" };
  const studentId = viaje.studentId;

  const t = await pedirToken({ grant_type: "authorization_code", code, code_verifier: viaje.verifier, redirect_uri: `${origen}/api/garmin/callback` });
  if (!t.ok) return { ok: false, motivo: t.motivo, studentId };

  const id = await llamarConToken(t.accessToken, "GET", "/partner-gateway/rest/user/id");
  const userId = id.ok ? id.datos?.userId : null;
  if (!userId) return { ok: false, motivo: "sin-usuario", studentId };

  // Una cuenta de Garmin, un alumno: si ya está unida a otro, no se toca.
  const dueño = await kvGet(K.usuario(userId));
  if (dueño?.studentId && dueño.studentId !== studentId) return { ok: false, motivo: "cuenta-de-otro-alumno", studentId };

  const { permisos } = await leerPermisos(t.accessToken);
  const cuenta = {
    accessToken: t.accessToken, refreshToken: t.refreshToken, expiraEn: t.expiraEn, refreshExpiraEn: t.refreshExpiraEn,
    userId, permisos, conectadoEl: new Date().toISOString(),
  };
  if (!(await kvSet(K.cuenta(studentId), cuenta))) return { ok: false, motivo: "no-se-pudo-guardar", studentId };
  await kvSet(K.usuario(userId), { studentId });
  await marcarEnFicha(studentId, { conectado: true, conectadoEl: cuenta.conectadoEl, ultimoEnvio: null, errorDeLectura: null });

  // Y de una vez, la semana en curso y la siguiente al reloj.
  try {
    const student = await kvGet(`student:${studentId}`);
    if (student) for (const n of semanasVigentes(student)) await enviarSemanaAGarmin(student, n);
  } catch (e) {
    console.error("garmin: no se pudo hacer el primer envío", e);
  }
  return { ok: true, studentId };
}

/* ---------------------------------------------------------------------------
   LLAMADAS A LA API
--------------------------------------------------------------------------- */

async function llamarConToken(token, metodo, ruta, cuerpo) {
  try {
    const res = await fetch(`${API()}${ruta}`, {
      method: metodo,
      headers: { Authorization: `Bearer ${token}`, ...(cuerpo ? { "Content-Type": "application/json" } : {}) },
      ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}),
    });
    const texto = await res.text().catch(() => "");
    let datos = null;
    try { datos = texto ? JSON.parse(texto) : null; } catch (e) { datos = texto; }
    return { ok: res.ok, estado: res.status, datos };
  } catch (e) {
    return { ok: false, estado: 0, datos: null };
  }
}

// Un testigo vigente para el alumno (renovándolo si hace falta).
async function tokenDe(studentId) {
  const cuenta = await kvGet(K.cuenta(studentId));
  if (!cuenta?.accessToken) return null;
  if (Date.now() < (cuenta.expiraEn || 0) - 600 * 1000) return cuenta.accessToken;
  if (!cuenta.refreshToken || Date.now() > (cuenta.refreshExpiraEn || 0)) return null;
  const t = await pedirToken({ grant_type: "refresh_token", refresh_token: cuenta.refreshToken });
  if (!t.ok) return null;
  // Garmin entrega un refresh nuevo cada vez: se guarda el nuevo.
  await kvSet(K.cuenta(studentId), { ...cuenta, ...t, refreshToken: t.refreshToken || cuenta.refreshToken });
  return t.accessToken;
}

async function llamar(studentId, metodo, ruta, cuerpo) {
  const token = await tokenDe(studentId);
  if (!token) return { ok: false, estado: 401, datos: null };
  return llamarConToken(token, metodo, ruta, cuerpo);
}

export async function estaConectadoGarmin(studentId) {
  return !!(await kvGet(K.cuenta(studentId)))?.accessToken;
}

async function marcarEnFicha(studentId, cambios) {
  try {
    const s = await kvGet(`student:${studentId}`);
    if (!s) return;
    if (cambios === null) {
      const { garmin: _g, ...resto } = s;
      await kvSet(`student:${studentId}`, resto);
      return;
    }
    await kvSet(`student:${studentId}`, { ...s, garmin: { ...(s.garmin || {}), ...cambios } });
  } catch (e) {
    console.error("garmin: no se pudo anotar en la ficha", e);
  }
}

/* ---------------------------------------------------------------------------
   ENTRENAMIENTOS AL RELOJ
--------------------------------------------------------------------------- */

function semanasVigentes(student, hoy = hoyLima()) {
  return Object.keys(student?.weeks || {}).map(Number)
    .filter((n) => { const r = rangoDeSemana(student, n); return r && r.hasta >= hoy; })
    .sort((a, b) => a - b).slice(0, 2);
}

// Deja el calendario de Garmin igual al plan en esa semana: crea lo nuevo o cambiado,
// borra lo que ya no está. Solo toca lo que puso esta app, y nunca lo pasado.
export async function enviarSemanaAGarmin(student, weekNum, { general, hoy = hoyLima() } = {}) {
  const resultado = { ok: false, enviados: 0, retirados: 0, motivo: null, semana: weekNum };
  if (!student?.id || !(await estaConectadoGarmin(student.id))) return { ...resultado, motivo: "sin-conexion" };

  const generalAlertas = general ?? (await leerAjustesReloj()).alertasRitmo;
  let deseados = [];
  try {
    deseados = G.semanaAWorkouts(student, weekNum, { alertas: alertasEfectivas(student, generalAlertas) });
  } catch (e) {
    return { ...resultado, motivo: "error-traduciendo" };
  }
  const todos = (await kvGet(K.envios(student.id))) || {};
  const enviados = { ...(todos[weekNum] || {}) };
  const plan = G.planDeEnvio(deseados, enviados, hoy);

  let fallos = 0;
  // La primera respuesta de error de Garmin, para poder ver qué rechazó (no lleva datos del
  // alumno: es el código y el mensaje de Garmin).
  let detalle = null;
  const anotar = (paso, r) => {
    if (detalle) return;
    const m = typeof r?.datos === "string" ? r.datos : r?.datos ? JSON.stringify(r.datos) : "";
    detalle = { paso, estado: r?.estado ?? 0, mensaje: m.slice(0, 300) };
  };
  for (const b of plan.borrar) {
    if (b.workoutId != null) {
      const r = await llamar(student.id, "DELETE", `/training-api/workout/v2/${b.workoutId}`);
      // 404: ya no existía (el alumno lo borró en Garmin Connect). Da igual.
      if (!r.ok && r.estado !== 404) { anotar("borrar", r); fallos++; continue; }
    }
    delete enviados[String(b.dia)];
    resultado.retirados++;
  }
  for (const d of plan.crear) {
    // La documentación da esta ruta para crear (y training-api para lo demás). Si Garmin la
    // cambia, se prueba la otra.
    let ruta = "/workoutportal/workout/v2";
    let r = await llamar(student.id, "POST", ruta, d.workout);
    if (!r.ok && r.estado === 404) { ruta = "/training-api/workout/v2"; r = await llamar(student.id, "POST", ruta, d.workout); }
    const workoutId = r.ok ? r.datos?.workoutId : null;
    if (workoutId == null) { anotar("crear", r); fallos++; if (r.estado === 401 || r.estado === 412) { resultado.motivo = r.estado === 412 ? "sin-permiso" : "permiso-revocado"; break; } continue; }
    const sch = await llamar(student.id, "POST", "/training-api/schedule/", { workoutId, date: d.fecha });
    const scheduleId = sch.ok ? (typeof sch.datos === "object" ? sch.datos?.scheduleId ?? null : Number(sch.datos) || null) : null;
    if (!sch.ok) {
      anotar("programar", sch);
      // Sin fecha no le sirve al alumno: se retira el entrenamiento suelto.
      await llamar(student.id, "DELETE", `/training-api/workout/v2/${workoutId}`);
      fallos++; continue;
    }
    enviados[String(d.dia)] = { workoutId, scheduleId, firma: d.firma, fecha: d.fecha, ruta };
    resultado.enviados++;
  }

  const frescos = (await kvGet(K.envios(student.id))) || {};
  await kvSet(K.envios(student.id), { ...frescos, [weekNum]: enviados });
  const final = { ...resultado, ok: fallos === 0, motivo: resultado.motivo || (fallos ? "algunos-fallaron" : deseados.length ? null : "sin-sesiones") };
  if (detalle) console.error("garmin: envío rechazado", detalle);
  await marcarEnFicha(student.id, { ultimoEnvio: { semana: weekNum, ok: final.ok, enviados: final.enviados, motivo: final.motivo, detalle, fecha: new Date().toISOString() } });
  return { ...final, detalle };
}

// Revisión (solo coach): cómo quedó guardado en Garmin el próximo entrenamiento enviado, para
// comparar con lo que se mandó. Son datos del plan (pasos, ritmos), no de la alumna.
export async function revisarEnvio(studentId, { hoy = hoyLima(), maximo = 8 } = {}) {
  const todos = (await kvGet(K.envios(studentId))) || {};
  const lista = Object.entries(todos).flatMap(([semana, dias]) => Object.entries(dias || {}).map(([dia, e]) => ({ semana: Number(semana), dia: Number(dia), ...e })))
    .filter((e) => e.workoutId != null && e.fecha >= hoy).sort((a, b) => a.fecha.localeCompare(b.fecha)).slice(0, maximo);
  // Qué permisos dio el alumno en Garmin Connect y qué ha llegado últimamente.
  // Los permisos se preguntan a Garmin en el momento (y se actualizan en la cuenta).
  const cuenta = await kvGet(K.cuenta(studentId));
  const token = await tokenDe(studentId);
  const lectura = token ? await leerPermisos(token) : { permisos: null, estado: 401 };
  if (cuenta && lectura.permisos) await kvSet(K.cuenta(studentId), { ...cuenta, permisos: lectura.permisos });
  const extra = {
    permisos: lectura.permisos ?? cuenta?.permisos ?? null, permisosEnVivo: !!lectura.permisos, permisosEstado: lectura.estado,
    recibido: (await kvGet(K.recibido(studentId))) || [], avisos: (await kvGet(K.avisos)) || [],
  };
  if (!lista.length) return { ok: false, motivo: "sin-envios", ...extra };
  const student = await kvGet(`student:${studentId}`);
  const general = (await leerAjustesReloj()).alertasRitmo;
  const alertas = alertasEfectivas(student, general);
  const porSemana = new Map();
  const deLaSemana = (n) => { if (!porSemana.has(n)) { try { porSemana.set(n, G.semanaAWorkouts(student, n, { alertas })); } catch (e) { porSemana.set(n, []); } } return porSemana.get(n); };
  const contar = (w) => {
    const pasos = [...(w?.segments || []).flatMap((s) => s.steps || []), ...(w?.steps || [])];
    return pasos.reduce((n, p) => n + (Array.isArray(p.steps) ? p.steps.length : 1), 0);
  };
  const sesiones = [];
  for (const e of lista) {
    const actual = deLaSemana(e.semana).find((x) => x.dia === e.dia) || null;
    const r = await llamar(studentId, "GET", `/training-api/workout/v2/${e.workoutId}`);
    sesiones.push({
      fecha: e.fecha, nombre: actual?.workout?.workoutName || (r.ok && r.datos?.workoutName) || "",
      estado: r.estado, workoutId: e.workoutId, ruta: e.ruta || "(anterior a este registro)",
      creado: r.ok ? r.datos?.createdDate || null : null,
      pasosQueCorresponden: contar(actual?.workout), pasosEnGarmin: r.ok ? contar(r.datos) : null,
      // false: lo que está en Garmin es una versión anterior → hay que volver a enviar.
      alDia: !!actual && actual.firma === e.firma,
      guardado: typeof r.datos === "string" ? r.datos.slice(0, 3000) : JSON.stringify(r.datos, null, 1)?.slice(0, 3000),
    });
  }
  return { ok: sesiones.every((x) => x.estado === 200), hoy, sesiones, ...extra };
}

// Después de guardar la ficha: reenvía las semanas cuyo contenido para el reloj cambió.
export async function reenviarGarminCambiadas(antes, despues, { hoy = hoyLima(), limiteMs = 6000 } = {}) {
  if (!despues?.id || !(await estaConectadoGarmin(despues.id))) return { ok: true, semanas: [] };
  const general = (await leerAjustesReloj()).alertasRitmo;
  let semanas;
  try { semanas = semanasParaReenviar(antes, despues, hoy, { general }).slice(0, 4); } catch (e) { return { ok: false, semanas: [] }; }
  if (!semanas.length) return { ok: true, semanas: [] };
  const trabajo = (async () => { const r = []; for (const n of semanas) r.push(await enviarSemanaAGarmin(despues, n, { general, hoy })); return r; })().catch(() => null);
  const tope = new Promise((res) => setTimeout(() => res(null), limiteMs));
  const resultados = await Promise.race([trabajo, tope]);
  return { ok: !!resultados && resultados.every((r) => r.ok), semanas, resultados };
}

// Después de publicar una semana nueva.
export async function enviarAGarminSiCorresponde(student, weekNum) {
  if (!student?.id || !(await estaConectadoGarmin(student.id))) return { ok: true, motivo: "sin-conexion" };
  return enviarSemanaAGarmin(student, weekNum);
}

/* ---------------------------------------------------------------------------
   DESCONECTAR
--------------------------------------------------------------------------- */

// avisarAGarmin: false cuando es Garmin quien avisa que el usuario se desconectó.
export async function desconectarGarmin(studentId, { avisarAGarmin = true, hoy = hoyLima() } = {}) {
  const cuenta = await kvGet(K.cuenta(studentId));
  let retirados = 0;
  if (cuenta?.accessToken && avisarAGarmin) {
    // Se retiran del calendario los entrenamientos futuros que puso esta app.
    const todos = (await kvGet(K.envios(studentId))) || {};
    for (const semana of Object.values(todos)) {
      for (const e of Object.values(semana || {})) {
        if (e?.workoutId == null || (e.fecha && e.fecha < hoy)) continue;
        const r = await llamar(studentId, "DELETE", `/training-api/workout/v2/${e.workoutId}`);
        if (r.ok) retirados++;
      }
    }
    // Garmin exige avisar cuando el usuario se desconecta desde nuestra app.
    await llamar(studentId, "DELETE", "/partner-gateway/rest/user/registration");
  }
  if (cuenta?.userId) await kvDelete(K.usuario(cuenta.userId));
  await kvDelete(K.cuenta(studentId));
  await kvDelete(K.envios(studentId));
  await kvDelete(K.recibido(studentId));
  await marcarEnFicha(studentId, null);
  // Retira el consentimiento y borra sus datos de salud (política de privacidad).
  const salud = await alDesconectar(studentId);
  return { ok: true, retirados, saludBorrada: salud.borrados || 0 };
}

/* ---------------------------------------------------------------------------
   PUSH: ACTIVIDADES, SALUD Y AVISOS DE GARMIN
--------------------------------------------------------------------------- */

async function alumnoDeUsuario(userId) {
  const m = await kvGet(K.usuario(userId));
  return m?.studentId || null;
}

// Procesa el cuerpo de un push. Devuelve un pequeño informe (para las pruebas y el registro).
export async function procesarPush(cuerpo) {
  const informe = { actividades: 0, salud: 0, desconectados: 0, ignorados: 0, pings: 0 };
  const porAlumno = new Map();
  const tiposDelAviso = {};
  for (const n of G.notificaciones(cuerpo)) {
    tiposDelAviso[n.tipo] = (tiposDelAviso[n.tipo] || 0) + 1;
    const studentId = await alumnoDeUsuario(n.userId);
    if (!studentId) { informe.ignorados++; continue; }
    if (!porAlumno.has(studentId)) porAlumno.set(studentId, []);
    // Modo "Ping": se van a buscar los datos al callbackURL, con el testigo del alumno.
    if (G.esPing(n.dato)) {
      informe.pings++;
      for (const dato of await traerDePing(studentId, n.dato.callbackURL)) porAlumno.get(studentId).push({ tipo: n.tipo, userId: n.userId, dato });
      continue;
    }
    porAlumno.get(studentId).push(n);
  }

  try {
    const previos = (await kvGet(K.avisos)) || [];
    await kvSet(K.avisos, [{ cuando: new Date().toISOString(), tipos: tiposDelAviso, deAlumnos: [...porAlumno.values()].reduce((n, l) => n + l.length, 0), ignorados: informe.ignorados }, ...previos].slice(0, 20));
  } catch (e) { /* el registro nunca rompe el procesamiento */ }

  for (const [studentId, lista] of porAlumno) {
    const notas = [];
    await anotarRecibido(studentId, lista, notas);
    try {
      // Desconexión desde Garmin Connect: se limpia todo de nuestro lado.
      if (lista.some((n) => n.tipo === "deregistrations")) {
        await desconectarGarmin(studentId, { avisarAGarmin: false });
        informe.desconectados++;
        continue;
      }
      for (const n of lista.filter((x) => x.tipo === "userPermissionsChange")) {
        const cuenta = await kvGet(K.cuenta(studentId));
        const permisos = n.dato?.permissions || [];
        if (cuenta) await kvSet(K.cuenta(studentId), { ...cuenta, permisos });
        // Dejó de compartir su salud desde Garmin Connect: se borra lo que vino de Garmin.
        if (!G.compartiendoSalud(permisos)) await borrarSalud(studentId, "garmin");
      }

      // Salud: solo con consentimiento (guardarSaludDiaria lo vuelve a comprobar).
      const saludables = lista.filter((n) => G.TIPOS_DE_SALUD.includes(n.tipo));
      const permisos = (await kvGet(K.cuenta(studentId)))?.permisos;
      if (saludables.length && G.compartiendoSalud(permisos) && aceptoSalud(await leerConsentimiento(studentId))) {
        for (const n of saludables) {
          const s = G.saludDesdeGarmin(n.tipo, n.dato);
          if (!s) continue;
          const r = await guardarSaludDiaria({ studentId, fecha: s.fecha, fuente: "garmin", datos: s.datos });
          if (r.ok) informe.salud++;
        }
      }

      // Actividades: "activityDetails" trae el segundo a segundo (km por km, vueltas). Si solo
      // llega el resumen ("activities"), se guarda igual —sin km por km— para que la sesión no
      // quede vacía; el detalle lo reemplaza cuando llegue.
      const conDetalle = lista.filter((n) => n.tipo === "activityDetails").map((n) => n.dato);
      const soloResumen = lista.filter((n) => TIPOS_DE_RESUMEN.includes(n.tipo)).map((n) => n.dato);
      if (conDetalle.length) informe.actividades += await guardarActividades(studentId, conDetalle, { notas });
      if (soloResumen.length) informe.actividades += await guardarActividades(studentId, soloResumen, { notas, soloResumen: true });
    } catch (e) {
      console.error("garmin: error procesando el push de un alumno", e);
      notas.push({ resultado: `error: ${String(e?.message || e).slice(0, 120)}` });
    }
    // Se vuelve a guardar con lo que se hizo con cada actividad.
    if (notas.length) await anotarRecibido(studentId, lista, notas, { reemplazar: true });
  }
  return informe;
}

async function traerDePing(studentId, url) {
  if (!G.urlDePingValida(url, API())) return [];
  const token = await tokenDe(studentId);
  if (!token) return [];
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
    if (!res.ok) return [];
    const j = await res.json().catch(() => null);
    return Array.isArray(j) ? j : [];
  } catch (e) {
    return [];
  }
}

// Las actividades de carrera van al plan del alumno, con el mismo análisis que las de
// intervals.icu.
const TIPOS_DE_RESUMEN = ["activities", "manuallyUpdatedActivities"];

// Las actividades que ya tienen km por km en el plan (para que un resumen tardío no las pise).
function idsConDetalle(student) {
  const ids = new Set();
  for (const w of Object.values(student?.weeks || {})) {
    for (const l of w?.log || []) if (l?.reloj?.id != null && l.reloj.kms?.length) ids.add(String(l.reloj.id));
    for (const x of w?.extras || []) if (x?.id != null && x.kms?.length) ids.add(String(x.id));
  }
  return ids;
}

// Guarda un registro corto de lo que llegó (sin datos de salud: solo tipo, deporte, fecha y km
// de las actividades) y qué se hizo con cada actividad.
async function anotarRecibido(studentId, lista, notas, { reemplazar = false } = {}) {
  try {
    const previo = ((await kvGet(K.recibido(studentId))) || []).slice(reemplazar ? 1 : 0);
    const cuando = new Date().toISOString();
    const tipos = {};
    for (const n of lista) tipos[n.tipo] = (tipos[n.tipo] || 0) + 1;
    const nuevo = [{ cuando, tipos, actividades: notas }, ...previo].slice(0, 15);
    await kvSet(K.recibido(studentId), nuevo);
  } catch (e) { /* el registro nunca rompe el procesamiento */ }
}

async function guardarActividades(studentId, detalles, { notas = [], soloResumen = false } = {}) {
  const student = await kvGet(`student:${studentId}`);
  if (!student) return 0;
  const yaConDetalle = soloResumen ? idsConDetalle(student) : new Set();
  const items = [];
  for (const det of detalles) {
    const c = G.actividadDesdeGarmin(det);
    const s = det?.summary || det || {};
    const nota = { deporte: s.activityType || null, fecha: c?.actividad?.start_date_local?.slice(0, 16) || null, km: s.distanceInMeters != null ? Math.round(s.distanceInMeters / 100) / 10 : null, detalle: !soloResumen, kms: c?.streams ? (kmPorKm(c.streams) || []).length : 0 };
    notas.push(nota);
    if (!c || c.actividad.type !== "Run") { nota.resultado = "no es carrera"; continue; }
    if (soloResumen && yaConDetalle.has(c.actividad.id)) { nota.resultado = "ya estaba con detalle"; continue; }
    const resumen = resumenDeActividad(c.actividad, c.vueltas, kmPorKm(c.streams));
    if (!resumen) { nota.resultado = "sin datos suficientes"; continue; }
    nota.resultado = "guardada";
    resumen.fuente = "garmin"; // para mostrar la atribución "Garmin [modelo]"
    items.push({ resumen, sitio: ubicarActividad(c.actividad, null, student), streams: c.streams });
  }
  if (!items.length) return 0;
  // El modelo del reloj (para la atribución en la pestaña Salud): el de la última actividad.
  const modelo = G.atribucionGarmin((detalles[detalles.length - 1]?.summary || detalles[detalles.length - 1])?.deviceName);
  if (modelo && modelo !== "Garmin" && modelo !== student.garmin?.dispositivo) await marcarEnFicha(studentId, { dispositivo: modelo });
  const { alPlan, adicionales } = repartirActividades(items, student);
  const easyPace = student.paces?.E ?? null;
  for (const x of alPlan) {
    const day = student.weeks?.[x.semana]?.plan?.[x.dia];
    if (!day || !llevaPasoAPaso(day, easyPace)) continue;
    const streams = items.find((i) => i.resumen.id === x.resumen.id)?.streams;
    const pasos = pasoAPaso({ vueltas: x.resumen.vueltas, streams }, day, easyPace);
    if (pasos) x.resumen = { ...x.resumen, pasos };
  }
  const r = await guardarLectura(student, alPlan, adicionales, { sello: "garmin" });
  return (r.actualizadas || 0) + (r.extras || 0);
}
