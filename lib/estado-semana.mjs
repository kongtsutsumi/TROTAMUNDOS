// Estado de la semana de un alumno, para el listado del coach.
//
// Un semáforo con una frase en palabras ("Al día", "Le falta 1 sesión", "Atrasado") y, debajo,
// lo hecho contra lo planificado: sesiones y km de TODA la semana.
//
// Solo cuentan como faltas las sesiones de días que ya pasaron: la de hoy todavía se puede
// hacer. Los km cuentan lo que no corrió (12 de 40 km si faltó a sesiones). Si marcó una
// sesión como hecha sin anotar km, se cuentan los km del plan de esa sesión.
//
// Sin dependencias: se usa en el servidor y se prueba con Node.

const MS_DIA = 86400000;

function diaUTC(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null;
}

// 0 = lunes de esa semana; negativo = todavía no empieza; 7 o más = ya terminó.
export function diaDeLaSemana(planStartMonday, weekNum, hoy) {
  const inicio = diaUTC(planStartMonday);
  const h = diaUTC(hoy);
  if (inicio == null || h == null || !(weekNum >= 1)) return null;
  const lunes = inicio + (weekNum - 1) * 7 * MS_DIA;
  return Math.round((h - lunes) / MS_DIA);
}

const redondear = (n) => Math.round(n * 10) / 10;

function kmDeLaSesion(dia, registro) {
  if (!registro?.completed) return 0;
  const km = Number(registro.actualKm);
  if (registro.actualKm !== "" && registro.actualKm != null && Number.isFinite(km) && km >= 0) return km;
  return Number(dia.km) > 0 ? Number(dia.km) : 0;
}

export function estadoDeLaSemana(student, hoy) {
  const weekNum = student?.currentWeek;
  const week = student?.weeks?.[weekNum];
  if (!week || !Array.isArray(week.plan)) return null;

  let hechas = 0, total = 0, kmHechos = 0, kmPlan = 0;
  const sesiones = [];
  week.plan.forEach((d, i) => {
    if (!d?.paceKey) return;
    const reg = week.log?.[i];
    total++;
    kmPlan += Number(d.km) > 0 ? Number(d.km) : 0;
    if (reg?.completed) hechas++;
    kmHechos += kmDeLaSesion(d, reg);
    sesiones.push({ i, hecha: !!reg?.completed });
  });
  if (!total) return null;

  const base = { hechas, total, kmHechos: redondear(kmHechos), kmPlan: redondear(kmPlan) };

  if (week.paused) return { ...base, tono: "gris", frase: "Semana pausada" };
  if (hechas === total) return { ...base, tono: "verde", frase: "Semana completa" };

  // Si el alumno ya envió su semana, todo lo que no hizo cuenta como falta.
  const enviada = !!(week.submitted || week.studentSubmitted);
  const hoyEs = diaDeLaSemana(student.planStartMonday, weekNum, hoy);
  if (!enviada && hoyEs != null && hoyEs < 0) return { ...base, tono: "gris", frase: "Semana por empezar" };

  // Sin fecha de arranque no se sabe qué día es: se mira la semana completa.
  const limite = enviada || hoyEs == null ? 7 : hoyEs;
  const faltan = sesiones.filter((s) => s.i < limite && !s.hecha).length;

  if (faltan === 0) return { ...base, tono: "verde", frase: "Al día" };
  if (faltan === 1) return { ...base, tono: "amarillo", frase: "Le falta 1 sesión" };
  return { ...base, tono: "rojo", frase: `Atrasado: le faltan ${faltan} sesiones` };
}

export function textoDelDetalle(e) {
  if (!e) return "";
  const km = (n) => String(n).replace(".", ",");
  const sesiones = `Hizo ${e.hechas} de ${e.total} ${e.total === 1 ? "sesión" : "sesiones"}`;
  return e.kmPlan > 0 ? `${sesiones} · ${km(e.kmHechos)} de ${km(e.kmPlan)} km` : sesiones;
}
