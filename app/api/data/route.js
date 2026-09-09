import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { kvGet, kvSet, kvDelete } from "../../../lib/supabaseAdmin";
import { verifySessionToken, SESSION_COOKIE } from "../../../lib/session";
import { canRead, canWrite, canDelete, sanitizeForSession } from "../../../lib/permissions";

async function getSession() {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

// Comprueba que el plan entrante sea el MISMO conjunto de sesiones, solo cambiadas de día.
// Se compara el contenido de cada día ignorando su etiqueta (Lun, Mar...), que es lo único
// que cambia legítimamente al mover una sesión.
function isPureReorder(basePlan, incomingPlan) {
  if (!Array.isArray(basePlan) || !Array.isArray(incomingPlan)) return false;
  if (basePlan.length !== incomingPlan.length) return false;
  const fingerprint = (d) => {
    const { day, movedFrom, ...rest } = d || {};
    return JSON.stringify(rest);
  };
  const a = basePlan.map(fingerprint).sort();
  const b = incomingPlan.map(fingerprint).sort();
  return a.every((x, i) => x === b[i]);
}

export async function POST(request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let body;
  try { body = await request.json(); } catch (e) { return NextResponse.json({ error: "Petición inválida" }, { status: 400 }); }
  const { op, key, value } = body || {};
  if (!op || !key) return NextResponse.json({ error: "Faltan datos" }, { status: 400 });

  if (op === "get") {
    if (!canRead(session, key)) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    const raw = await kvGet(key);
    return NextResponse.json({ value: sanitizeForSession(session, key, raw) });
  }

  if (op === "set") {
    if (!canWrite(session, key)) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    let toSave = value;
    if (session.role === "student") {
      const current = await kvGet(key);
      if (!current) return NextResponse.json({ error: "Registro no encontrado" }, { status: 404 });
      // El alumno solo es dueño de SU REGISTRO de sesiones (el "log") y del orden de sus días.
      // Todo lo demás — el plan que arma el coach, los ritmos, el objetivo — se conserva del
      // registro guardado. Antes se aceptaba el bloque "weeks" completo del navegador, así que
      // si el coach editaba el plan mientras el alumno marcaba una sesión, el cambio del coach
      // se perdía en silencio. Ahora se fusiona campo por campo.
      const mergedWeeks = { ...current.weeks };
      for (const [wkNum, incoming] of Object.entries(value?.weeks || {})) {
        const base = current.weeks?.[wkNum];
        if (!base) continue; // el alumno no puede crear semanas nuevas
        mergedWeeks[wkNum] = {
          ...base,
          log: incoming.log ?? base.log,
          // El alumno puede REORDENAR sus días (mover una sesión a otro día), pero no alterar
          // su contenido. Se acepta el nuevo orden solo si cada día del plan entrante existe
          // igual en el plan guardado — así el reordenamiento pasa y cualquier edición no.
          plan: isPureReorder(base.plan, incoming.plan) ? incoming.plan : base.plan,
          submitted: incoming.submitted ?? base.submitted,
          studentSubmitted: incoming.studentSubmitted ?? base.studentSubmitted,
          adherencePct: incoming.adherencePct ?? base.adherencePct,
          avgRpe: incoming.avgRpe ?? base.avgRpe,
        };
      }
      toSave = {
        ...current,
        weeks: mergedWeeks,
        pinHash: current.pinHash, pinSalt: current.pinSalt,
        goal: current.goal, level: current.level, paces: current.paces,
        peakKm: current.peakKm, peakLongKm: current.peakLongKm,
        raceDate: current.raceDate, targetPaceStr: current.targetPaceStr,
        currentWeek: current.currentWeek, name: current.name, id: current.id,
      };
    }
    if (session.role === "coach") {
      // El coach es dueño del plan, pero NO del registro de sesiones del alumno. Si el alumno
      // marcó algo mientras el coach tenía la pantalla abierta, ese registro se conserva —
      // antes la copia del coach lo pisaba en silencio.
      const current = await kvGet(key);
      if (current?.weeks && value?.weeks) {
        const mergedWeeks = { ...value.weeks };
        for (const [wkNum, incoming] of Object.entries(value.weeks)) {
          const stored = current.weeks[wkNum];
          if (!stored?.log || !incoming) continue;
          // Se conserva el registro guardado en los días donde el alumno ya marcó algo,
          // salvo que el coach esté escribiendo un registro más completo (al cerrar la semana).
          const mergedLog = (incoming.log || []).map((entry, i) => {
            const storedEntry = stored.log[i];
            if (storedEntry?.completed && !entry?.completed) return storedEntry;
            return entry;
          });
          mergedWeeks[wkNum] = { ...incoming, log: mergedLog };
        }
        toSave = { ...value, weeks: mergedWeeks };
      }
    }
    const ok = await kvSet(key, toSave);
    return NextResponse.json({ ok });
  }

  if (op === "updateRosterEntry") {
    // Actualiza SOLO la entrada de un alumno dentro del listado, en vez de reescribir la lista
    // completa. Evita que dos acciones casi simultáneas (por ejemplo, cerrar la semana de un
    // alumno mientras otro envía la suya) se pisen entre sí y se pierdan cambios.
    if (!canWrite(session, "roster") && session.role !== "coach") {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }
    const { studentId, patch } = body;
    if (!studentId || !patch) return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
    if (session.role === "student" && session.studentId !== studentId) {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }
    const roster = (await kvGet("roster")) || [];
    const next = roster.map((r) => (r.id === studentId ? { ...r, ...patch } : r));
    const ok = await kvSet("roster", next);
    return NextResponse.json({ ok });
  }

  if (op === "delete") {
    if (!canDelete(session, key)) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    const ok = await kvDelete(key);
    return NextResponse.json({ ok });
  }

  return NextResponse.json({ error: "Operación desconocida" }, { status: 400 });
}
