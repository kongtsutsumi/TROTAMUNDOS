// Publicación automática de la semana, del lado del servidor.
//
// La decisión de QUÉ publicar vive en el motor (lib/plan-engine.mjs, función
// autoPublishDueWeek), que es código puro y está cubierto por las pruebas. Acá solo está
// la parte que toca la base de datos: leer, decidir, guardar, y dejar el reporte de la
// semana cerrada para que el coach lo vea igual que si la hubiera cerrado él.
//
// Lo usan dos lugares:
//   1. /api/data, cuando un alumno pide su propio registro. Esta es LA GARANTÍA: la semana
//      se crea en el mismo pedido con que el alumno la consulta, así que es imposible que
//      entre un lunes y no la vea. No depende de que ninguna tarea haya corrido antes.
//   2. /api/cron, la tarea del lunes a las 00:00 de Lima. Es el adelanto: deja las semanas
//      listas aunque nadie abra la app, para que el panel del coach y la cola de reportes
//      estén al día el lunes a primera hora.

import { kvGet, kvSet } from "./supabaseAdmin";
import { autoPublishDueWeek, localDateISO, sanitizeLocalDate } from "./plan-engine.mjs";

export { sanitizeLocalDate };

// Publica la semana pendiente de UN alumno y la guarda. Devuelve el registro actualizado
// (o el original, si no había nada que publicar) para que quien llame pueda responder con
// el dato fresco sin volver a leer.
export async function publishDueWeekFor(studentId, record, localDate) {
  const student = record ?? (await kvGet(`student:${studentId}`));
  if (!student) return { student: null, published: null };

  const result = autoPublishDueWeek(student, localDate || localDateISO());
  if (!result.published) return { student, published: null, reason: result.reason };

  const saved = await kvSet(`student:${studentId}`, result.updated);
  // Si no se pudo guardar, se devuelve el registro original: es preferible que el alumno
  // vea su semana anterior a que vea una semana que en realidad no quedó registrada.
  if (!saved) return { student, published: null, reason: "no-se-pudo-guardar" };

  // De acá en adelante todo es complementario: si algo falla, la semana ya está publicada
  // y el alumno ya la tiene. Nada de esto debe poder tumbar la respuesta.
  await Promise.allSettled([
    appendAutoReport(result, student),
    syncRosterEntry(studentId, result.published),
  ]);

  return { student: result.updated, published: result.published, kind: result.kind, note: result.note };
}

// El coach revisa sus semanas cerradas en la lista de reportes. Una semana que se cerró
// sola tiene que aparecer ahí igual, y marcada como automática.
async function appendAutoReport(result, previousStudent) {
  if (result.closedWeekNumber == null) return;
  const reports = (await kvGet("reports")) || [];
  const already = reports.some(
    (r) => r?.studentId === previousStudent.id && r?.weekNumber === result.closedWeekNumber
  );
  if (already) return;
  reports.push({
    id: `auto-${previousStudent.id}-${result.closedWeekNumber}`,
    studentId: previousStudent.id,
    studentName: previousStudent.name,
    weekNumber: result.closedWeekNumber,
    weeklyKm: result.closedWeeklyKm ?? previousStudent.weeks?.[result.closedWeekNumber]?.weeklyKm ?? null,
    phase: result.closedPhase ?? previousStudent.weeks?.[result.closedWeekNumber]?.phase ?? null,
    adherencePct: result.adherencePct ?? null,
    avgRpe: result.avgRpe ?? null,
    note: result.note,
    closedAt: new Date().toISOString(),
    autoPublished: true,
  });
  await kvSet("reports", reports);
}

// El listado del coach muestra en qué semana va cada alumno. Se actualiza solo esa entrada,
// no la lista completa, para no pisar cambios de otra acción simultánea.
async function syncRosterEntry(studentId, weekNumber) {
  const roster = (await kvGet("roster")) || [];
  if (!roster.some((r) => r?.id === studentId)) return;
  const next = roster.map((r) => (r.id === studentId ? { ...r, weekNumber, waitingApproval: false } : r));
  await kvSet("roster", next);
}

// Recorre todo el listado. Lo usa la tarea del lunes. Cada alumno se procesa por separado:
// si uno falla, los demás siguen.
export async function publishDueWeeksForAll(localDate) {
  const roster = (await kvGet("roster")) || [];
  const results = [];
  for (const entry of roster) {
    if (!entry?.id) continue;
    try {
      const r = await publishDueWeekFor(entry.id, null, localDate);
      results.push({ id: entry.id, name: entry.name ?? null, published: r.published, kind: r.kind ?? null, reason: r.reason ?? null });
    } catch (e) {
      results.push({ id: entry.id, name: entry.name ?? null, published: null, reason: "error:" + (e?.message || "desconocido") });
    }
  }
  return results;
}
