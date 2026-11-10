// Consentimiento del alumno para los datos de sus relojes y dispositivos.
//
// Lo que promete la política de privacidad (app/privacidad/politica.jsx), y esto cumple:
//   · Conectar un dispositivo es voluntario y requiere el consentimiento EXPRESO del alumno.
//   · Se pide POR SEPARADO para datos de entrenamiento y para datos de salud: puede dar uno
//     sin el otro. Sin el de entrenamiento no se conecta nada; sin el de salud, no se guarda
//     ningún dato de salud aunque el dispositivo los mande.
//   · Lo puede retirar cuando quiera. Retirar el de salud borra sus datos de salud.
//   · Queda registro de cuándo aceptó o retiró cada uno, y con qué versión de la política.
//
// Solo el propio alumno (o su padre, madre o tutor, con su sesión) da o retira el
// consentimiento. El coach puede verlo, pero no darlo por él.
//
// Fila:  consentimiento:<studentId> → {
//   version,                                   // de la política aceptada
//   entrenamiento: { aceptado, fecha },
//   salud:         { aceptado, fecha },
//   historial: [{ tipo, aceptado, fecha, version }]   // los últimos 50 cambios
// }
//
// Este archivo es puro y tiene pruebas en tests/consentimiento.test.mjs.

// Cambia cuando cambie de fondo lo que la política dice sobre estos datos.
export const VERSION_POLITICA = "2026-11-10";
export const TIPOS = ["entrenamiento", "salud"];
const MAX_HISTORIAL = 50;

const vacio = () => ({
  version: null,
  entrenamiento: { aceptado: false, fecha: null },
  salud: { aceptado: false, fecha: null },
  historial: [],
});

// Lo guardado, sano y completo (o uno vacío si no hay nada).
export function normalizar(rec) {
  const v = vacio();
  if (!rec || typeof rec !== "object") return v;
  for (const t of TIPOS) {
    const x = rec[t];
    if (x && typeof x === "object") v[t] = { aceptado: x.aceptado === true, fecha: typeof x.fecha === "string" ? x.fecha : null };
  }
  v.version = typeof rec.version === "string" ? rec.version : null;
  v.historial = Array.isArray(rec.historial) ? rec.historial.slice(-MAX_HISTORIAL) : [];
  return v;
}

// ¿Hay registro? Los alumnos que conectaron su reloj antes de esto no lo tienen.
export function tieneRegistro(rec) {
  const r = normalizar(rec);
  return r.historial.length > 0 || r.entrenamiento.fecha !== null || r.salud.fecha !== null;
}

export const aceptoEntrenamiento = (rec) => normalizar(rec).entrenamiento.aceptado;
// Salud exige también el de entrenamiento: sin dispositivo conectado no llega nada.
export const aceptoSalud = (rec) => { const r = normalizar(rec); return r.entrenamiento.aceptado && r.salud.aceptado; };

// Aplica lo que el alumno eligió. Devuelve el registro nuevo y qué cambió.
//   cambios: { entrenamiento?: boolean, salud?: boolean }
// Retirar el de entrenamiento retira también el de salud.
export function aplicar(rec, cambios, ahora = new Date().toISOString()) {
  const r = normalizar(rec);
  const pedido = {};
  for (const t of TIPOS) if (typeof cambios?.[t] === "boolean") pedido[t] = cambios[t];
  if (pedido.entrenamiento === false) pedido.salud = false;
  if (pedido.salud === true && !(pedido.entrenamiento ?? r.entrenamiento.aceptado)) {
    return { ok: false, error: "Para aceptar los datos de salud, primero acepta los de entrenamiento." };
  }

  const cambiados = [];
  const historial = [...r.historial];
  for (const t of TIPOS) {
    if (!(t in pedido)) continue;
    // Volver a aceptar con una versión nueva de la política también queda registrado.
    if (pedido[t] === r[t].aceptado && !(pedido[t] && r.version !== VERSION_POLITICA)) continue;
    r[t] = { aceptado: pedido[t], fecha: ahora };
    historial.push({ tipo: t, aceptado: pedido[t], fecha: ahora, version: VERSION_POLITICA });
    cambiados.push(t);
  }
  if (cambiados.length && (r.entrenamiento.aceptado || r.salud.aceptado)) r.version = VERSION_POLITICA;
  r.historial = historial.slice(-MAX_HISTORIAL);
  return {
    ok: true,
    registro: r,
    cambiados,
    retiroSalud: cambiados.includes("salud") && r.salud.aceptado === false,
  };
}

// Lo que se le muestra al coach o al alumno (sin historial completo).
export function resumen(rec) {
  const r = normalizar(rec);
  return {
    registrado: tieneRegistro(r),
    version: r.version,
    vigente: r.version === VERSION_POLITICA,
    entrenamiento: r.entrenamiento,
    salud: { aceptado: aceptoSalud(r), fecha: r.salud.fecha },
  };
}
