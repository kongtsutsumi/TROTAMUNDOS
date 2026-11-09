// El equipo de coaches: quién ve y quién toca a cada alumno.
//
//   · El ADMINISTRADOR es el coach de siempre (la contraseña de "coachAuth"). Ve y edita a
//     todos los alumnos, crea y quita coaches y les cambia la contraseña. Sus alumnos son los
//     que no tienen coach asignado.
//   · Cada coach ADICIONAL ve y edita solo a sus alumnos (los que tienen su coachId en el
//     listado). No ve a los demás, ni sus pagos, ni el muro de los otros grupos, ni puede
//     tocar coaches.
//
// Pagos y muro van por coach: cada uno ve solo los de sus alumnos, también el administrador.
//
// Este archivo es puro (sin red ni base de datos) y está cubierto por tests/equipo.test.mjs.
// Las rutas del servidor lo usan para decidir; nunca deciden por lo que diga el navegador.

export const ADMIN_ID = "admin";

// Listas compartidas donde cada elemento es de un alumno (studentId).
export const LISTAS_POR_ALUMNO = new Set(["paceAlerts", "reports"]);

const ID_COACH = /^c-[a-z0-9]{6,24}$/;
export const idCoachValido = (id) => typeof id === "string" && ID_COACH.test(id);

// Sesiones de coach de antes de que existiera el equipo: no traen coachId, y solo podían ser
// del administrador (era el único acceso).
export function idCoachDeSesion(session) {
  if (session?.role !== "coach") return null;
  return session.coachId && session.coachId !== ADMIN_ID ? session.coachId : ADMIN_ID;
}
export function esAdmin(session) {
  return idCoachDeSesion(session) === ADMIN_ID;
}

// De qué coach es un alumno del listado.
export function coachDeEntrada(entrada) {
  return entrada && idCoachValido(entrada.coachId) ? entrada.coachId : ADMIN_ID;
}

// ¿Esta sesión puede ver y editar a este alumno (su entrada del listado)?
// El administrador maneja a cualquiera, incluso a un alumno que todavía no está en el
// listado (justo al crearlo).
export function puedeManejar(session, entrada) {
  if (session?.role !== "coach") return false;
  if (esAdmin(session)) return true;
  return !!entrada && coachDeEntrada(entrada) === idCoachDeSesion(session);
}

// ¿Es un alumno "suyo"? Para pagos y muro: también el administrador ve solo los suyos.
export function esPropio(session, entrada) {
  return !!entrada && session?.role === "coach" && coachDeEntrada(entrada) === idCoachDeSesion(session);
}

export function filtrarRoster(session, roster) {
  const lista = Array.isArray(roster) ? roster : [];
  if (esAdmin(session)) return lista;
  return lista.filter((r) => puedeManejar(session, r));
}

const limpiarCoachId = (entrada, dueño) => {
  const { coachId: _x, ...resto } = entrada;
  return dueño === ADMIN_ID ? resto : { ...resto, coachId: dueño };
};

// Guardar el listado completo desde el navegador de un coach.
//   · El dueño de cada alumno nunca lo decide el navegador: un alumno que ya existía sigue
//     siendo del mismo coach; uno nuevo es de quien lo crea.
//   · Un coach adicional solo puede agregar, cambiar o quitar a SUS alumnos: los de los
//     demás se conservan tal como están guardados, aunque su navegador no los conozca.
export function fusionarRoster(session, guardado, entrante) {
  const previo = Array.isArray(guardado) ? guardado.filter((r) => r && r.id) : [];
  const nuevo = Array.isArray(entrante) ? entrante.filter((r) => r && typeof r === "object" && r.id) : [];
  const porId = new Map(previo.map((r) => [r.id, r]));
  const yo = idCoachDeSesion(session);

  if (esAdmin(session)) {
    return nuevo.map((r) => limpiarCoachId(r, porId.has(r.id) ? coachDeEntrada(porId.get(r.id)) : ADMIN_ID));
  }

  const entrantePorId = new Map(nuevo.map((r) => [r.id, r]));
  const salida = [];
  for (const r of previo) {
    if (coachDeEntrada(r) !== yo) { salida.push(r); continue; }       // de otro coach: intacto
    const cambiado = entrantePorId.get(r.id);
    if (cambiado) salida.push(limpiarCoachId(cambiado, yo));            // suyo, actualizado
    // suyo y ya no viene: lo quitó
  }
  for (const r of nuevo) {
    if (!porId.has(r.id)) salida.push(limpiarCoachId(r, yo));           // nuevo: es suyo
  }
  return salida;
}

// Listas por alumno (paceAlerts, reports): cada coach ve y cambia solo lo de sus alumnos.
export function filtrarLista(session, lista, idsPropios) {
  const l = Array.isArray(lista) ? lista : [];
  if (esAdmin(session)) return l;
  return l.filter((x) => x && idsPropios.has(x.studentId));
}
export function fusionarLista(session, guardada, entrante, idsPropios) {
  const nueva = Array.isArray(entrante) ? entrante : [];
  if (esAdmin(session)) return nueva;
  const ajenos = (Array.isArray(guardada) ? guardada : []).filter((x) => !(x && idsPropios.has(x.studentId)));
  return [...ajenos, ...nueva.filter((x) => x && idsPropios.has(x.studentId))];
}

// Qué claves puede tocar un coach adicional con la API de datos. El administrador, todas.
//   op: "get" | "set" | "delete"
//   existe: si la clave ya tiene un registro guardado (para crear un alumno nuevo)
export function clavePermitidaParaCoach(session, op, key, { idsPropios, idsDelListado, existe }) {
  if (esAdmin(session)) return true;
  if (session?.role !== "coach" || typeof key !== "string") return false;
  if (key === "roster") return op === "get" || op === "set";
  if (LISTAS_POR_ALUMNO.has(key)) return op === "get" || op === "set";
  if (key.startsWith("student:")) {
    const id = key.slice("student:".length);
    if (idsPropios.has(id)) return true;
    // Un alumno nuevo: se guarda su ficha justo antes de sumarlo al listado.
    return op === "set" && !idsDelListado.has(id) && !existe;
  }
  return false;
}

/* --- Coaches --- */

export function limpiarNombre(nombre) {
  return typeof nombre === "string" ? nombre.replace(/\s+/g, " ").trim().slice(0, 60) : "";
}

export function validarClave(clave) {
  if (typeof clave !== "string" || clave.length < 6) return "La contraseña debe tener al menos 6 caracteres.";
  if (clave.length > 200) return "La contraseña es demasiado larga.";
  return null;
}

export function nuevoIdCoach(azar = Math.random) {
  let s = "";
  while (s.length < 10) s += Math.floor(azar() * 36).toString(36);
  return `c-${s}`;
}

// Al quitar un coach, sus alumnos pasan al administrador.
export function rosterSinCoach(roster, coachId) {
  return (Array.isArray(roster) ? roster : []).map((r) => (r && r.coachId === coachId ? limpiarCoachId(r, ADMIN_ID) : r));
}

// Lo que se puede mostrar de un coach (nunca el hash ni la sal).
export function coachPublico(c) {
  return c ? { id: c.id, nombre: c.nombre, creado: c.creado || null } : null;
}

/* --- Muro por grupo --- */

// Cada publicación del muro es del grupo de un coach. Las de antes no tienen grupo: son del
// administrador, que era el único coach.
export function grupoDePost(post) {
  return post && idCoachValido(post.grupo) ? post.grupo : ADMIN_ID;
}
export function publicacionesDelGrupo(publicaciones, grupo) {
  return (publicaciones || []).filter((p) => p && grupoDePost(p) === grupo);
}
