// Datos de salud diarios de cada alumno (sueño, VFC, FC en reposo, estrés, energía…), tal
// como llegan de su reloj. Se guardan en la tabla "salud_diaria" de Supabase
// (supabase/salud.sql), una fila por alumno, día y fuente.
//
// Esto es la parte pura: qué fuentes se aceptan y cómo se limpia una fila antes de
// guardarla. La parte que habla con la base de datos está en lib/salud-servidor.js.
// Pruebas: tests/salud.test.mjs.

// Marcas y plataformas de las que puede venir un dato. Una fuente nueva se agrega acá.
export const FUENTES = ["garmin", "coros", "polar", "suunto", "apple", "wahoo", "amazfit", "huawei", "samsung", "fitbit", "intervals"];

// Campos conocidos y su rango razonable. Lo que no está acá no se guarda: así no entra
// nada que no hayamos previsto (y declarado en la política).
const CAMPOS = {
  sueñoMin:        [0, 1440],   // minutos dormidos
  sueñoProfundoMin:[0, 1440],
  sueñoLigeroMin:  [0, 1440],
  sueñoRemMin:     [0, 1440],
  despiertoMin:    [0, 1440],
  sueñoPuntaje:    [0, 100],
  vfc:             [1, 300],    // ms (rMSSD nocturno)
  fcReposo:        [20, 150],   // ppm
  fcMax:           [40, 250],
  estres:          [0, 100],
  energiaMax:      [0, 100],    // p. ej. Body Battery
  energiaMin:      [0, 100],
  respiracion:     [3, 60],     // respiraciones por minuto
  spo2:            [50, 100],   // %
  pasos:           [0, 200000],
  calorias:        [0, 20000],
  minutosIntensidad:[0, 1440],
  vo2max:          [10, 100],
  pesoKg:          [20, 300],
  grasaPct:        [1, 70],
};
export const CAMPOS_DE_SALUD = Object.keys(CAMPOS);

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
export const fechaValida = (f) => typeof f === "string" && FECHA.test(f) && !Number.isNaN(Date.parse(`${f}T00:00:00Z`));
export const fuenteValida = (f) => FUENTES.includes(f);

// Deja solo los campos conocidos, como números, dentro de su rango. Devuelve null si no
// queda nada que guardar.
export function limpiarDatos(datos) {
  if (!datos || typeof datos !== "object") return null;
  const out = {};
  for (const [k, [min, max]] of Object.entries(CAMPOS)) {
    const v = Number(datos[k]);
    if (datos[k] === null || datos[k] === undefined || datos[k] === "" || !Number.isFinite(v)) continue;
    if (v < min || v > max) continue;
    out[k] = Math.round(v * 10) / 10;
  }
  return Object.keys(out).length ? out : null;
}

// Una fila lista para guardar, o { error }.
export function filaDeSalud({ studentId, fecha, fuente, datos }) {
  if (typeof studentId !== "string" || !studentId || studentId.length > 80) return { error: "alumno inválido" };
  if (!fechaValida(fecha)) return { error: "fecha inválida" };
  if (!fuenteValida(fuente)) return { error: "fuente desconocida" };
  const limpios = limpiarDatos(datos);
  if (!limpios) return { error: "sin datos" };
  return { fila: { student_id: studentId, fecha, fuente, datos: limpios } };
}

// Un día de "wellness" de intervals.icu → { fecha, datos } con nuestros campos (o null).
// intervals.icu junta ahí lo que le manda el reloj del alumno (Garmin, Polar, Suunto…).
export function saludDesdeIntervals(w) {
  const fecha = typeof w?.id === "string" ? w.id.slice(0, 10) : null;
  if (!fecha || !fechaValida(fecha)) return null;
  const n = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const crudo = {
    sueñoMin: n(w.sleepSecs) != null ? Math.round(w.sleepSecs / 60) : null,
    sueñoPuntaje: n(w.sleepScore),
    vfc: n(w.hrv),
    fcReposo: n(w.restingHR),
    pasos: n(w.steps),
    spo2: n(w.spO2),
    respiracion: n(w.respiration),
    vo2max: n(w.vo2max),
    pesoKg: n(w.weight),
    grasaPct: n(w.bodyFat),
  };
  const datos = limpiarDatos(crudo);
  return datos ? { fecha, datos } : null;
}
