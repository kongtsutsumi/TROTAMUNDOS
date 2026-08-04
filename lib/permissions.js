// Decide qué puede leer y escribir cada tipo de sesión. Esta es la pieza clave que
// reemplaza la "confianza en el navegador" que teníamos antes: ahora el servidor decide,
// y el navegador no puede saltárselo.

// El coach puede todo.
// Un alumno solo puede: leer su propio registro, leer el listado (para el buscador de
// ingreso — que solo expone nombres, no datos de entrenamiento), y escribir su propio registro.
export function canRead(session, key) {
  if (!session) return false;
  if (session.role === "coach") return true;
  if (session.role === "student") {
    if (key === `student:${session.studentId}`) return true;
    if (key === "roster") return true; // se filtra antes de devolverlo (ver sanitizeForSession)
    return false;
  }
  return false;
}

export function canWrite(session, key) {
  if (!session) return false;
  if (session.role === "coach") return true;
  if (session.role === "student") {
    // el alumno solo puede guardar su propio registro
    return key === `student:${session.studentId}`;
  }
  return false;
}

export function canDelete(session, key) {
  return !!session && session.role === "coach";
}

// Un alumno no necesita ver los datos de sus compañeros: del listado solo recibe su
// propia entrada. El listado completo (con adherencias de todos) es solo para el coach.
export function sanitizeForSession(session, key, value) {
  if (!session || session.role === "coach") return value;
  if (session.role === "student" && key === "roster" && Array.isArray(value)) {
    return value.filter((r) => r.id === session.studentId);
  }
  return value;
}

// Campos que nunca deben salir del servidor hacia el navegador de un alumno.
export function stripSecrets(value) {
  if (!value || typeof value !== "object") return value;
  const { pinHash, pinSalt, ...rest } = value;
  return rest;
}
