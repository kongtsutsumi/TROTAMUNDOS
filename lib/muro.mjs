// El muro de anuncios: lógica pura, sin red ni base de datos.
//
// Qué es: un muro común del grupo.
//   · El coach publica ANUNCIOS: texto, y opcionalmente un enlace, un evento (fecha, hora y
//     lugar) y la marca de fijado arriba.
//   · Los alumnos publican MENSAJES: solo texto.
//   · Todos responden a todo, y todos ven las respuestas.
//   · El coach puede borrar cualquier cosa (moderación). Cada uno puede borrar lo suyo.
//   · Hay "no leídos" para el punto rojo, y el coach ve cuántos alumnos leyeron cada anuncio.
//
// Cómo se guarda (lo hace lib/muro-servidor.js, no este archivo):
//   muro:post:<id>                 una publicación por fila
//   muro:resp:<idPost>:<id>        una respuesta por fila
//   muro:leido:<quien>             { idPost: fecha } de UNA persona, que solo escribe ella
// Publicar o responder siempre crea una fila nueva y nunca reescribe una lista compartida:
// así, dos personas escribiendo a la vez no pueden pisarse.
//
// La identidad del autor no viene nunca del navegador: la pone el servidor a partir de la
// sesión. Este archivo la recibe ya decidida.

export const MAX_TEXTO_PUBLICACION = 2000;
export const MAX_TEXTO_RESPUESTA = 1000;
export const MAX_LUGAR = 120;

const ID_VALIDO = /^[a-z0-9]{6,40}(-[a-z0-9]{2,20})?$/;
export function idValido(id) { return typeof id === "string" && ID_VALIDO.test(id); }

// Identificadores que se ordenan solos por fecha y no chocan.
export function nuevoId(ahoraMs = Date.now(), azar = Math.random) {
  const sufijo = Math.floor(azar() * 36 ** 6).toString(36).padStart(6, "0");
  return `${ahoraMs.toString(36)}-${sufijo}`;
}

// Quién es cada persona en las claves de lectura.
export function claveDeLector(autor) {
  if (!autor) return null;
  return autor.rol === "coach" ? "coach" : autor.id ? `alumno-${autor.id}` : null;
}

/* ---------------------------------------------------------------------------
   VALIDACIÓN
--------------------------------------------------------------------------- */

export function limpiarTexto(texto, max) {
  if (typeof texto !== "string") return "";
  return texto
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "") // controles invisibles
    .replace(/\n{4,}/g, "\n\n\n")
    .trim()
    .slice(0, max);
}

// Solo enlaces web. Un "javascript:" en un enlace que otros tocan es la forma clásica de
// meterle código ajeno a la app de otra persona.
export function validarEnlace(enlace) {
  if (enlace == null || String(enlace).trim() === "") return { ok: true, valor: null };
  let texto = String(enlace).trim();
  if (!/^[a-z][a-z0-9+.-]*:/i.test(texto)) texto = `https://${texto}`;
  let url;
  try { url = new URL(texto); } catch (e) { return { ok: false, error: "Ese enlace no es una dirección web válida." }; }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, error: "Solo se aceptan enlaces web (http o https)." };
  }
  if (!url.hostname.includes(".")) return { ok: false, error: "Ese enlace no es una dirección web válida." };
  return { ok: true, valor: url.toString().slice(0, 500) };
}

export function validarEvento(evento) {
  if (!evento || (!evento.fecha && !evento.hora && !evento.lugar)) return { ok: true, valor: null };
  const fecha = String(evento.fecha || "").trim();
  const hora = String(evento.hora || "").trim();
  const lugar = limpiarTexto(evento.lugar || "", MAX_LUGAR);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || isNaN(new Date(`${fecha}T00:00:00`))) {
    return { ok: false, error: "El evento necesita una fecha válida." };
  }
  if (hora && !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) {
    return { ok: false, error: "La hora tiene que ir como 06:30." };
  }
  return { ok: true, valor: { fecha, hora: hora || null, lugar: lugar || null } };
}

/* ---------------------------------------------------------------------------
   CREAR
--------------------------------------------------------------------------- */

// Devuelve { ok, publicacion } o { ok: false, error }.
// Un alumno solo publica mensajes de texto: si el navegador mandara un enlace, un evento o
// la marca de fijado, se descartan acá. No es un error, simplemente no le corresponde.
export function nuevaPublicacion(datos, autor, { ahora = new Date(), id = nuevoId(ahora.getTime()) } = {}) {
  if (!autor || (autor.rol !== "coach" && autor.rol !== "alumno")) return { ok: false, error: "Sin permiso." };
  const texto = limpiarTexto(datos?.texto, MAX_TEXTO_PUBLICACION);
  if (!texto) return { ok: false, error: "Escribe algo antes de publicar." };

  const esCoach = autor.rol === "coach";
  let enlace = null, evento = null;
  if (esCoach) {
    const e = validarEnlace(datos?.enlace);
    if (!e.ok) return e;
    enlace = e.valor;
    const v = validarEvento(datos?.evento);
    if (!v.ok) return v;
    evento = v.valor;
  }

  return {
    ok: true,
    publicacion: {
      id,
      tipo: esCoach ? "anuncio" : "mensaje",
      autor: { rol: autor.rol, id: autor.id ?? null, nombre: autor.nombre ?? (esCoach ? "Coach" : "Alumno") },
      texto,
      enlace,
      evento,
      fijado: esCoach ? !!datos?.fijado : false,
      creado: ahora.toISOString(),
    },
  };
}

export function nuevaRespuesta(datos, autor, idPost, { ahora = new Date(), id = nuevoId(ahora.getTime()) } = {}) {
  if (!autor || (autor.rol !== "coach" && autor.rol !== "alumno")) return { ok: false, error: "Sin permiso." };
  if (!idValido(idPost)) return { ok: false, error: "Esa publicación no existe." };
  const texto = limpiarTexto(datos?.texto, MAX_TEXTO_RESPUESTA);
  if (!texto) return { ok: false, error: "Escribe algo antes de responder." };
  return {
    ok: true,
    respuesta: {
      id, idPost,
      autor: { rol: autor.rol, id: autor.id ?? null, nombre: autor.nombre ?? (autor.rol === "coach" ? "Coach" : "Alumno") },
      texto,
      creado: ahora.toISOString(),
    },
  };
}

/* ---------------------------------------------------------------------------
   PERMISOS
--------------------------------------------------------------------------- */

export function esAutor(autor, item) {
  if (!autor || !item?.autor) return false;
  if (autor.rol === "coach") return item.autor.rol === "coach";
  return item.autor.rol === "alumno" && item.autor.id != null && item.autor.id === autor.id;
}

export function puedeBorrar(autor, item) {
  if (!autor || !item) return false;
  if (autor.rol === "coach") return true; // moderación
  return esAutor(autor, item);
}

export function puedeFijar(autor) { return autor?.rol === "coach"; }

/* ---------------------------------------------------------------------------
   ARMAR EL MURO PARA UNA PERSONA

   Orden:
     1. Fijados (los más nuevos primero).
     2. El resto, de lo más nuevo a lo más viejo.
     3. Aparte, plegados, los eventos que ya pasaron. Un evento pasado deja de estar
        fijado en la práctica: ya no hace falta tenerlo arriba.

   "Nuevo" para alguien: algo que no escribió esa persona y que apareció después de la
   última vez que abrió el muro. Una respuesta nueva de otro también vuelve "nueva" a la
   publicación, para que el punto rojo avise de la conversación y no solo del anuncio.
--------------------------------------------------------------------------- */

const ts = (iso) => { const t = Date.parse(iso || ""); return Number.isFinite(t) ? t : 0; };

export function armarMuro(publicaciones, respuestas, { lector, leido = {}, hoy, lecturasDeAlumnos = null, totalAlumnos = 0 } = {}) {
  const porPost = new Map();
  for (const r of respuestas || []) {
    if (!r?.idPost) continue;
    if (!porPost.has(r.idPost)) porPost.set(r.idPost, []);
    porPost.get(r.idPost).push(r);
  }

  const vistas = (publicaciones || []).filter((p) => p?.id && p?.creado).map((p) => {
    const resp = (porPost.get(p.id) || []).sort((a, b) => ts(a.creado) - ts(b.creado));
    const ultimaVez = ts(leido?.[p.id]);
    const ajenoNuevo = [p, ...resp].some((x) => !esAutor(lector, x) && ts(x.creado) > ultimaVez);
    const pasado = !!(p.evento?.fecha && hoy && p.evento.fecha < hoy);

    const vista = {
      ...p,
      respuestas: resp.map((r) => ({ ...r, mio: esAutor(lector, r), borrable: puedeBorrar(lector, r) })),
      nuevo: ajenoNuevo,
      pasado,
      mio: esAutor(lector, p),
      borrable: puedeBorrar(lector, p),
    };

    // Solo el coach ve quién leyó sus anuncios. Cuenta como leído si el alumno abrió el
    // muro DESPUÉS de que se publicara.
    if (lector?.rol === "coach" && p.tipo === "anuncio" && lecturasDeAlumnos) {
      const leyeron = Object.values(lecturasDeAlumnos).filter((l) => ts(l?.[p.id]) >= ts(p.creado)).length;
      vista.leidoPor = { leyeron, total: totalAlumnos };
    }
    return vista;
  });

  const masNuevoPrimero = (a, b) => ts(b.creado) - ts(a.creado);
  const vigentes = vistas.filter((v) => !v.pasado);
  return {
    fijados: vigentes.filter((v) => v.fijado).sort(masNuevoPrimero),
    recientes: vigentes.filter((v) => !v.fijado).sort(masNuevoPrimero),
    pasados: vistas.filter((v) => v.pasado).sort((a, b) => (b.evento.fecha).localeCompare(a.evento.fecha)),
    noLeidos: vistas.filter((v) => v.nuevo).length,
  };
}

// Al abrir el muro, todo lo que hay queda leído en este momento.
export function marcarTodoLeido(leidoActual, publicaciones, ahora = new Date()) {
  const siguiente = { ...(leidoActual || {}) };
  const iso = ahora.toISOString();
  const vivas = new Set();
  for (const p of publicaciones || []) {
    if (!p?.id) continue;
    siguiente[p.id] = iso;
    vivas.add(p.id);
  }
  // Las publicaciones borradas no hace falta recordarlas.
  for (const id of Object.keys(siguiente)) if (!vivas.has(id)) delete siguiente[id];
  return siguiente;
}
