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
  // Las operaciones que actúan sobre el listado completo (rosterSummary, updateRosterEntry)
  // no llevan "key" — solo se exige para las que leen o escriben un registro concreto.
  const needsKey = op === "get" || op === "set" || op === "delete";
  if (!op || (needsKey && !key)) return NextResponse.json({ error: "Faltan datos" }, { status: 400 });

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

  if (op === "rosterSummary") {
    // Devuelve solo el RESUMEN que necesita el panel del coach (sesiones hechas y volumen
    // reciente de cada alumno), en una sola petición. Antes el navegador descargaba el
    // historial completo de cada alumno para calcular lo mismo — cientos de KB innecesarios
    // y una petición por alumno.
    if (session.role !== "coach") return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    const roster = (await kvGet("roster")) || [];
    const records = await Promise.all(roster.map((r) => kvGet(`student:${r.id}`)));
    const summary = {};
    roster.forEach((r, i) => {
      const s = records[i];
      if (!s) return;
      const week = s.weeks?.[s.currentWeek];
      const total = (week?.plan || []).filter((d) => d?.paceKey).length;
      const completed = (week?.plan || []).filter((d, k) => d?.paceKey && week.log?.[k]?.completed).length;
      // Cumplimiento de las últimas semanas cerradas (mismo criterio que la app).
      const closed = Object.entries(s.weeks || {})
        .map(([n, w]) => ({ n: Number(n), w }))
        .filter((x) => x.w && (x.w.submitted || x.w.studentSubmitted))
        .sort((a, b) => b.n - a.n).slice(0, 4);
      let sDone = 0, sTotal = 0, kmDone = 0, kmPlanned = 0;
      for (const { w } of closed) {
        if (!Array.isArray(w.plan) || !Array.isArray(w.log)) continue;
        w.plan.forEach((d, k) => {
          if (!d?.paceKey) return;
          sTotal++;
          const l = w.log[k];
          if (!l?.completed) return;
          sDone++;
          const km = Number(l.actualKm);
          if (l.actualKm !== "" && l.actualKm != null && !isNaN(km) && d.km > 0) { kmDone += km; kmPlanned += d.km; }
        });
      }
      summary[r.id] = {
        completed, total,
        compliance: sTotal ? {
          weeks: closed.length, sessionsDone: sDone, sessionsTotal: sTotal,
          sessionsPct: sDone / sTotal,
          volumePct: kmPlanned > 0 ? kmDone / kmPlanned : null,
        } : null,
      };
    });
    return NextResponse.json({ summary });
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
