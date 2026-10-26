// El muro de anuncios, del lado del servidor: leer y escribir las filas.
//
// Las decisiones (quién puede qué, qué es nuevo, en qué orden) están en lib/muro.mjs, que
// es puro y está cubierto por las pruebas. Acá solo se carga, se guarda, y se aplica lo que
// ese módulo decide.
//
// Filas:
//   muro:post:<id>              una publicación
//   muro:resp:<idPost>:<id>     una respuesta
//   muro:leido:<quien>          lo que leyó UNA persona ("coach" o "alumno-<id>")
//
// Todo identificador que llega del navegador se valida antes de usarse para armar una
// clave: si no, alguien podría mandar "x:../student:ana" y tocar filas ajenas.

import { kvGet, kvSet, kvDelete, kvList, kvDeleteRespuestasDe } from "./supabaseAdmin";
import * as M from "./muro.mjs";

const POST = "muro:post:";
const RESP = "muro:resp:";
const LEIDO = "muro:leido:";

// La identidad sale SIEMPRE de la sesión firmada, nunca del navegador. El nombre del
// alumno se lee de su ficha en el momento de escribir.
export async function autorDeSesion(session) {
  if (session?.role === "coach") return { rol: "coach", id: null, nombre: "Coach" };
  if (session?.role === "student" && session.studentId) {
    const ficha = await kvGet(`student:${session.studentId}`);
    if (!ficha) return null;
    return { rol: "alumno", id: session.studentId, nombre: ficha.name || "Alumno" };
  }
  return null;
}

async function cargarTodo() {
  const [posts, resps] = await Promise.all([kvList(POST), kvList(RESP)]);
  return {
    publicaciones: posts.map((f) => f.value).filter(Boolean),
    respuestas: resps.map((f) => f.value).filter(Boolean),
  };
}

// El muro tal como lo ve esta persona. Al coach se le agregan las lecturas de los alumnos
// que siguen en el listado, para el "leído por N de M".
export async function verMuro(autor, hoy, { conLecturas = true } = {}) {
  const { publicaciones, respuestas } = await cargarTodo();
  const leido = (await kvGet(LEIDO + M.claveDeLector(autor))) || {};
  let extra = {};
  if (autor.rol === "coach" && conLecturas) {
    const roster = (await kvGet("roster")) || [];
    const ids = roster.map((r) => r?.id).filter(Boolean);
    const filas = await kvList(`${LEIDO}alumno-`);
    const porClave = Object.fromEntries(filas.map((f) => [f.key.slice(LEIDO.length), f.value || {}]));
    const lecturasDeAlumnos = Object.fromEntries(ids.map((id) => [`alumno-${id}`, porClave[`alumno-${id}`] || {}]));
    extra = { lecturasDeAlumnos, totalAlumnos: ids.length };
  }
  return M.armarMuro(publicaciones, respuestas, { lector: autor, leido, hoy, ...extra });
}

export async function publicar(autor, datos) {
  const r = M.nuevaPublicacion(datos, autor);
  if (!r.ok) return r;
  const ok = await kvSet(POST + r.publicacion.id, r.publicacion);
  return ok ? { ok: true, id: r.publicacion.id } : { ok: false, error: "No se pudo guardar. Probá de nuevo." };
}

export async function responder(autor, idPost, datos) {
  if (!M.idValido(idPost)) return { ok: false, error: "Esa publicación no existe." };
  const post = await kvGet(POST + idPost);
  if (!post) return { ok: false, error: "Esa publicación ya no existe." };
  const r = M.nuevaRespuesta(datos, autor, idPost);
  if (!r.ok) return r;
  const ok = await kvSet(`${RESP}${idPost}:${r.respuesta.id}`, r.respuesta);
  return ok ? { ok: true, id: r.respuesta.id } : { ok: false, error: "No se pudo guardar. Probá de nuevo." };
}

// Borra una respuesta (si llega idRespuesta) o una publicación entera con sus respuestas.
export async function borrar(autor, idPost, idRespuesta) {
  if (!M.idValido(idPost)) return { ok: false, error: "No existe." };
  if (idRespuesta != null) {
    if (!M.idValido(idRespuesta)) return { ok: false, error: "No existe." };
    const clave = `${RESP}${idPost}:${idRespuesta}`;
    const resp = await kvGet(clave);
    if (!resp) return { ok: true }; // ya no estaba: el resultado es el que se quería
    if (!M.puedeBorrar(autor, resp)) return { ok: false, error: "Sin permiso.", estado: 403 };
    return { ok: await kvDelete(clave) };
  }
  const post = await kvGet(POST + idPost);
  if (!post) return { ok: true };
  if (!M.puedeBorrar(autor, post)) return { ok: false, error: "Sin permiso.", estado: 403 };
  // Primero las respuestas: si se cortara a mitad, queda la publicación (que se puede
  // volver a borrar) y no respuestas huérfanas que nadie ve.
  await kvDeleteRespuestasDe(idPost);
  return { ok: await kvDelete(POST + idPost) };
}

export async function fijar(autor, idPost, fijado) {
  if (!M.puedeFijar(autor)) return { ok: false, error: "Sin permiso.", estado: 403 };
  if (!M.idValido(idPost)) return { ok: false, error: "No existe." };
  const post = await kvGet(POST + idPost);
  if (!post) return { ok: false, error: "Esa publicación ya no existe." };
  return { ok: await kvSet(POST + idPost, { ...post, fijado: !!fijado }) };
}

// Al abrir el muro: todo lo que hay queda leído. Cada persona escribe solo su fila.
export async function marcarLeido(autor) {
  const { publicaciones } = await cargarTodo();
  const clave = LEIDO + M.claveDeLector(autor);
  const actual = (await kvGet(clave)) || {};
  return { ok: await kvSet(clave, M.marcarTodoLeido(actual, publicaciones)) };
}
