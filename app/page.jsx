"use client";
import { safeGet, safeSet, safeDelete, safeGetWithRetry, updateRosterEntry, fetchRosterSummary, intervalsOp, muroOp, safeGetPersonal, safeSetPersonal, safeDeletePersonal, authStatus, coachSetup, coachLogin, studentList, studentLogin, logout } from "../lib/storage";
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { fusionarLoDelReloj, extrasDelDia, kmAdicionalesDe } from "../lib/intervals-read.mjs";
import {
  Users, User, Plus, ArrowLeft, Check, Flag, TrendingUp, TrendingDown,
  Minus, X, ChevronRight, ChevronLeft, ChevronDown, RotateCw, Activity, Search, AlertCircle, Lock, KeyRound,
  FileText, RefreshCcw, Trash2, BarChart2, Clock, Edit3, Download, QrCode, CalendarDays, Watch, LogOut, Megaphone, Pin, Send, Link2
} from "lucide-react";
import {
  applyIntermediateRaceDayPatch,
  AUTO_PUBLISH_LABEL,
  BEGINNER_STAGES,
  COLORS,
  COLOR_KIND_FILL,
  COLOR_KIND_LABEL,
  DAYS,
  DISTANCE_KM,
  FITNESS16_STAGES,
  FITNESS_GOAL_LEVELS,
  GOALS,
  GOAL_LABEL,
  I_DISTANCES,
  LEVELS,
  LEVEL_LABEL,
  OTRO_TEMPLATES,
  PACE_KEY_LABEL,
  PACE_OPTIONS,
  PHASE_LABEL,
  R_DISTANCES,
  T_DURATIONS,
  T_VARIANTS,
  ZONE_BY_PACEKEY,
  ZONE_COLOR,
  anchorPacesToGoal,
  applyPaceAdjustment,
  balanceWeeklyVolume,
  buildBeginnerPlan,
  buildInitialRacePlan,
  buildLiveSegments,
  buildRacePlan,
  buildWeekProposal,
  capLongRunKm,
  computeAdherence,
  computeHistoricalAdherence,
  computeImpliedKm,
  computeIntermediateRaceOverrides,
  computePeakKm,
  computeTrainingPaces,
  computeVDOT,
  deriveAllFromHM,
  deriveAllFromM,
  displayPaceKey,
  emptyLog,
  ensureWeekShape,
  evaluateQualityAdjustment,
  finalizeWeekPlan,
  fitnessStageIndexFromWeeksToGoal,
  formatDist,
  formatISOToDDMMYY,
  formatPace,
  genSalt,
  getActiveLogWeek,
  getAnomalyWarnings,
  getCustomBlocks,
  getCyclePosition,
  getDefaultTitle,
  getDisplayWeekLabel,
  getIPace,
  getRPace,
  getRepresentativePace,
  getSessionBars,
  getSessionDetail,
  getStageTable,
  getTPaceForDuration,
  getTaperWeeks,
  getTodayWeekNum,
  getWeekDateRange,
  getWeekDates,
  getWeekTitle,
  impliedQKm,
  isFitnessGoal,
  markInactiveWeeks,
  mondayOf,
  paceDiffLabel,
  parseDDMMYYToISO,
  parsePaceToDecimal,
  parseTimeToMinutes,
  interpretarTiempoObjetivo,
  repartirVolumen,
  esDiaDeVolumen,
  projectWeeklyVolumes,
  r1,
  suggestQualityPaces,
  uid,
  weeksBetween,
} from "../lib/plan-engine.mjs";

// Estas tres NO viven en el motor: tocan la base de datos o el cifrado del navegador, así que
// se quedan del lado de la aplicación.
async function hashText(text, salt) {
  const enc = new TextEncoder().encode(salt ? `${salt}:${text}` : text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function pushReport(report) {
  const reports = (await safeGet("reports")) || [];
  reports.push(report);
  await safeSet("reports", reports);
}
async function pushPaceAlert(alert) {
  const alerts = (await safeGet("paceAlerts")) || [];
  alerts.push(alert);
  await safeSet("paceAlerts", alerts);
}

/* ---------------------------------------------------------
   TOKENS
--------------------------------------------------------- */

function SessionBarChart({ day }) {
  const bars = getSessionBars(day);
  if (!bars || bars.length === 0) return null;
  const totalMin = bars.reduce((s, b) => s + Math.max(0.2, b.durationMin), 0) || 1;
  const paces = bars.map((b) => b.pace).filter((p) => p != null);
  const minP = paces.length ? Math.min(...paces) : 5;
  const maxP = paces.length ? Math.max(...paces) : 5;
  const W = 600, H = 90, baseY = 78, maxH = 68, minFrac = 0.22;
  function heightFrac(pace) {
    if (pace == null || minP === maxP) return 0.55;
    const t = (pace - minP) / (maxP - minP); // 0 = más rápido, 1 = más lento
    return 1 - t * (1 - minFrac);
  }
  let x = 0;
  const gap = bars.length > 40 ? 0.3 : 1;
  const rects = bars.map((b, i) => {
    const wRaw = (Math.max(0.2, b.durationMin) / totalMin) * W;
    const w = Math.max(1.2, wRaw - gap);
    const h = heightFrac(b.pace) * maxH;
    const fill = COLOR_KIND_FILL[b.colorKind] ?? COLORS.easy;
    const rect = <rect key={i} x={x} y={baseY - h} width={w} height={h} rx={1.5} fill={fill} opacity={0.9} />;
    x += wRaw;
    return rect;
  });
  const kindsPresent = [...new Set(bars.map((b) => b.colorKind))];
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 56, display: "block" }} preserveAspectRatio="none">
        <line x1={0} y1={baseY} x2={W} y2={baseY} stroke={COLORS.border} strokeWidth={1} />
        {rects}
      </svg>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
        {kindsPresent.map((k) => (
          <div key={k} className="flex items-center gap-1">
            <span style={{ width: 7, height: 7, borderRadius: 999, background: COLOR_KIND_FILL[k], display: "inline-block" }} />
            <span className="text-[9px]" style={{ color: COLORS.textMuted }}>{COLOR_KIND_LABEL[k]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   SMALL UI PRIMITIVES
--------------------------------------------------------- */
function Pill({ children, color }) {
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium tracking-wide"
      style={{ background: color + "22", color, border: `1px solid ${color}55` }}>
      {children}
    </span>
  );
}
// Arma el reporte semanal del alumno: cumplimiento, km, RPE, ritmo real vs objetivo, y
// conclusiones/recomendaciones generadas con reglas simples según esos números.
function buildWeeklyReportData(student, weekRaw, weekNum) {
  const week = ensureWeekShape(weekRaw);
  const slots = (week?.plan || []).map((d, i) => ({ d, i })).filter((x) => !!x.d?.paceKey);
  const completedSlots = slots.filter((x) => week.log[x.i]?.completed);
  const daysPlanned = slots.length;
  const daysCompleted = completedSlots.length;
  const kmPlanned = r1(slots.reduce((s, x) => s + (x.d.km || 0), 0));
  const kmActual = r1(completedSlots.reduce((s, x) => {
    const l = week.log[x.i];
    const km = l.actualKm !== "" && l.actualKm != null && !isNaN(Number(l.actualKm)) ? Number(l.actualKm) : x.d.km;
    return s + (km || 0);
  }, 0));
  const rpeValues = completedSlots.map((x) => week.log[x.i]?.rpe).filter((v) => v !== "" && v != null).map(Number);
  const avgRpe = rpeValues.length ? r1(rpeValues.reduce((a, b) => a + b, 0) / rpeValues.length) : null;
  const qualityTypes = ["R", "I", "T", "brokenT", "M", "race", "combo1k500"];
  const paceComparisons = completedSlots
    .filter((x) => qualityTypes.includes(x.d?.paceKey))
    .map((x) => {
      const l = week.log[x.i];
      const target = getRepresentativePace(x.d);
      const actual = parsePaceToDecimal(l.actualPaceStr);
      if (target == null || actual == null) return null;
      return { day: x.d.day, type: x.d.type, target, actual, diffSec: Math.round((actual - target) * 60) };
    })
    .filter(Boolean);
  const notes = completedSlots.map((x) => ({ day: week.plan[x.i].day, note: week.log[x.i]?.note })).filter((n) => n.note);

  const adherencePct = daysPlanned ? daysCompleted / daysPlanned : 1;
  const kmPct = kmPlanned ? kmActual / kmPlanned : 1;

  // Conclusiones y recomendaciones (reglas simples, sin IA — basadas en los números de esta semana)
  const conclusions = [];
  if (adherencePct >= 0.9 && kmPct >= 0.9) {
    conclusions.push("Cumplimiento sólido esta semana — completó prácticamente todo lo planeado. Buen punto para mantener o progresar ligeramente la carga la próxima semana.");
  } else if (adherencePct < 0.7) {
    conclusions.push(`Solo completó ${daysCompleted} de ${daysPlanned} sesiones planeadas. Vale la pena conversar con el alumno para entender qué está dificultando el cumplimiento (tiempo, motivación, cansancio, lesión) antes de ajustar el plan.`);
  } else {
    conclusions.push(`Cumplimiento parcial (${daysCompleted} de ${daysPlanned} sesiones). Revisar si hay un patrón (¿siempre el mismo día?) que convenga ajustar en el plan.`);
  }
  if (kmPlanned > 0 && kmPct < 0.75) {
    conclusions.push(`El kilometraje real (${kmActual} km) quedó bastante por debajo de lo planeado (${kmPlanned} km). Considera si el volumen semanal es sostenible para este alumno en este momento.`);
  } else if (kmPlanned > 0 && kmPct > 1.15) {
    conclusions.push(`El alumno corrió más de lo planeado (${kmActual} km vs ${kmPlanned} km). Confirma que no se esté excediendo por su cuenta, sobre todo si hay riesgo de sobrecarga.`);
  }
  if (avgRpe != null && avgRpe >= 8) {
    conclusions.push(`El esfuerzo percibido promedio fue alto (RPE ${avgRpe}/10). Vale la pena bajar intensidad o dar más recuperación la próxima semana.`);
  } else if (avgRpe != null && avgRpe <= 4 && adherencePct >= 0.9) {
    conclusions.push(`El esfuerzo percibido fue bajo (RPE ${avgRpe}/10) con buen cumplimiento — hay margen para progresar la carga si el objetivo lo permite.`);
  }
  const slowSessions = paceComparisons.filter((p) => p.diffSec > 10);
  if (slowSessions.length >= 2) {
    conclusions.push(`En ${slowSessions.length} sesión(es) de calidad el ritmo real fue notablemente más lento que el objetivo (10+ seg/km). Si esto se repite, considera revisar el ritmo objetivo o investigar fatiga/condiciones externas.`);
  }
  if (notes.length) {
    conclusions.push("Revisa las notas que dejó el alumno en sus sesiones — pueden dar contexto directo sobre cómo se sintió.");
  }
  // Lo que corrió por fuera del plan no entra en el cumplimiento (no eran sesiones
  // planificadas), pero sí en la carga real de la semana: es lo que el coach necesita
  // ver para detectar a quien se está pasando de volumen por su cuenta.
  const kmAdicionales = kmAdicionalesDe(week);
  const salidasAdicionales = Array.isArray(week?.extras) ? week.extras.length : 0;
  if (salidasAdicionales > 0) {
    const total = Math.round((kmActual + kmAdicionales) * 10) / 10;
    conclusions.push(`Además del plan, el reloj registró ${salidasAdicionales} salida${salidasAdicionales === 1 ? "" : "s"} adicional${salidasAdicionales === 1 ? "" : "es"} (${kmAdicionales} km). Con eso, la carga real de la semana fue de ${total} km.`);
  }
  if (conclusions.length === 0) conclusions.push("Sin datos suficientes esta semana para sacar conclusiones claras — revisa directamente el detalle de cada sesión.");

  return { daysPlanned, daysCompleted, kmPlanned, kmActual, kmAdicionales, salidasAdicionales, avgRpe, paceComparisons, notes, conclusions, adherencePct, kmPct };
}
const COLOR_KIND_HEX = { easy: "#4C9A6A", recovery: "#4A5568", moderate: "#D99A3D", hard: "#C8452E" };
function buildSessionBarSVG(day) {
  const bars = getSessionBars(day);
  if (!bars || bars.length === 0) return "";
  const totalMin = bars.reduce((s, b) => s + Math.max(0.2, b.durationMin), 0) || 1;
  const paces = bars.map((b) => b.pace).filter((p) => p != null);
  const minP = paces.length ? Math.min(...paces) : 5;
  const maxP = paces.length ? Math.max(...paces) : 5;
  const W = 600, H = 60, baseY = 52, maxH = 44, minFrac = 0.22;
  const heightFrac = (pace) => {
    if (pace == null || minP === maxP) return 0.55;
    const t = (pace - minP) / (maxP - minP);
    return 1 - t * (1 - minFrac);
  };
  let x = 0;
  const gap = bars.length > 40 ? 0.3 : 1;
  const rects = bars.map((b) => {
    const wRaw = (Math.max(0.2, b.durationMin) / totalMin) * W;
    const w = Math.max(1.2, wRaw - gap);
    const h = heightFrac(b.pace) * maxH;
    const fill = COLOR_KIND_HEX[b.colorKind] || "#4C9A6A";
    const rect = `<rect x="${x}" y="${baseY - h}" width="${w}" height="${h}" rx="1.5" fill="${fill}" opacity="0.9"></rect>`;
    x += wRaw;
    return rect;
  }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:40px;display:block;" preserveAspectRatio="none">
    <line x1="0" y1="${baseY}" x2="${W}" y2="${baseY}" stroke="#ddd" stroke-width="1"></line>
    ${rects}
  </svg>`;
}
function buildPrintableHTML(student, week, weekNum) {
  const esc = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const daysHtml = week.plan.map((d, i) => {
    const detail = d.paceKey ? getSessionDetail(d) : null;
    const barSvg = d.paceKey ? buildSessionBarSVG(d) : "";
    const detailHtml = detail
      ? detail.map((seg) => `<div style="font-size:12px;color:#333;margin-top:3px;"><b>${esc(seg.label)}:</b> ${esc(seg.text)}</div>`).join("")
      : `<div style="font-size:12px;color:#777;">Descanso</div>`;
    return `
      <div style="margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid #ddd;break-inside:avoid;">
        <div style="font-weight:bold;font-size:14px;">${esc(DAYS[i])} — ${esc(d.type)}${d.paceKey ? ` (${d.km} km)` : ""}</div>
        ${barSvg}
        ${detailHtml}
      </div>`;
  }).join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(student.name)} — ${esc(getWeekTitle(student, weekNum))}</title>
    <style>body{font-family:Arial,sans-serif;color:#111;padding:32px;max-width:700px;margin:0 auto;}</style>
    </head><body>
    <h1 style="font-size:22px;margin-bottom:2px;">${esc(student.name)}</h1>
    <p style="font-size:13px;color:#555;margin-bottom:4px;">
      ${esc(GOAL_LABEL[student.goal])} · ${esc(LEVEL_LABEL[student.level])} · ${esc(getWeekTitle(student, weekNum))}${week.weeklyKm != null ? ` · ${week.weeklyKm} km` : ""}
    </p>
    ${student.raceDate ? `<p style="font-size:12px;color:#777;margin-bottom:16px;">Fecha de carrera: ${esc(student.raceDate)}</p>` : ""}
    ${week.note ? `<p style="font-size:12px;color:#777;margin-bottom:16px;font-style:italic;">${esc(week.note)}</p>` : ""}
    ${daysHtml}
    <p style="font-size:11px;color:#999;margin-top:24px;">Para guardarlo como PDF: usa Archivo &gt; Imprimir (Cmd/Ctrl+P) y elige "Guardar como PDF" como destino.</p>
    <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 200); };</script>
    </body></html>`;
}
// Descarga el plan como archivo HTML (en vez de intentar abrir una ventana o imprimir dentro del
// artefacto): las descargas de archivos funcionan de forma consistente en todos los navegadores,
// incluyendo Safari, a diferencia de window.open()/window.print(), que Safari puede bloquear cuando
// la página vive dentro de un iframe de terceros (como es el caso de este artefacto).
function exportWeekToPDF(student, week, weekNum) {
  const html = buildPrintableHTML(student, week, weekNum);
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${student.name.replace(/[^a-z0-9]+/gi, "_")}_${getWeekTitle(student, weekNum).replace(/[^a-z0-9]+/gi, "_")}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function buildWeeklyReportHTML(student, week, weekNum) {
  const esc = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const r = buildWeeklyReportData(student, week, weekNum);
  const pct = (v) => `${Math.round(v * 100)}%`;
  const paceRows = r.paceComparisons.map((p) => `
    <tr>
      <td style="padding:4px 8px;border-bottom:1px solid #eee;">${esc(p.day)}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #eee;">${esc(p.type)}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #eee;">${esc(formatPace(p.target))}/km</td>
      <td style="padding:4px 8px;border-bottom:1px solid #eee;">${esc(formatPace(p.actual))}/km</td>
      <td style="padding:4px 8px;border-bottom:1px solid #eee;color:${p.diffSec > 10 ? "#c0392b" : p.diffSec < -10 ? "#1e7e34" : "#555"};">
        ${p.diffSec > 0 ? "+" : ""}${p.diffSec}s/km
      </td>
    </tr>`).join("");
  const notesHtml = r.notes.map((n) => `<li style="margin-bottom:4px;"><b>${esc(n.day)}:</b> "${esc(n.note)}"</li>`).join("");
  const conclusionsHtml = r.conclusions.map((c) => `<li style="margin-bottom:8px;">${esc(c)}</li>`).join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Reporte semanal — ${esc(student.name)}</title>
    <style>body{font-family:Arial,sans-serif;color:#111;padding:32px;max-width:750px;margin:0 auto;}
    .stat{display:inline-block;min-width:140px;margin:8px 16px 8px 0;}
    .stat b{display:block;font-size:22px;}
    .stat span{font-size:12px;color:#666;}
    table{border-collapse:collapse;width:100%;font-size:13px;margin-top:8px;}
    th{text-align:left;padding:4px 8px;border-bottom:2px solid #333;font-size:12px;}
    </style></head><body>
    <h1 style="font-size:22px;margin-bottom:2px;">Reporte semanal — ${esc(student.name)}</h1>
    <p style="font-size:13px;color:#555;margin-bottom:16px;">
      ${esc(GOAL_LABEL[student.goal])} · ${esc(LEVEL_LABEL[student.level])} · ${esc(getWeekTitle(student, weekNum))}
    </p>
    <div style="border-top:1px solid #ddd;border-bottom:1px solid #ddd;padding:8px 0;margin-bottom:16px;">
      <div class="stat"><b>${r.daysCompleted}/${r.daysPlanned}</b><span>días entrenados (${pct(r.adherencePct)})</span></div>
      <div class="stat"><b>${r.kmActual} km</b><span>de ${r.kmPlanned} km planeados (${pct(r.kmPct)})${r.kmAdicionales ? ` · +${r.kmAdicionales} km fuera del plan` : ""}</span></div>
      <div class="stat"><b>${r.avgRpe != null ? r.avgRpe : "—"}</b><span>RPE promedio (de 10)</span></div>
    </div>
    ${r.paceComparisons.length ? `
      <h2 style="font-size:15px;">Ritmo real vs. objetivo (sesiones de calidad)</h2>
      <table><thead><tr><th>Día</th><th>Tipo</th><th>Objetivo</th><th>Real</th><th>Diferencia</th></tr></thead>
      <tbody>${paceRows}</tbody></table>` : ""}
    ${r.notes.length ? `<h2 style="font-size:15px;margin-top:20px;">Notas del alumno</h2><ul style="font-size:13px;padding-left:20px;">${notesHtml}</ul>` : ""}
    <h2 style="font-size:15px;margin-top:20px;">Conclusiones y recomendaciones</h2>
    <ul style="font-size:13px;padding-left:20px;">${conclusionsHtml}</ul>
    <p style="font-size:11px;color:#999;margin-top:24px;">Para guardarlo como PDF: usa Archivo &gt; Imprimir (Cmd/Ctrl+P) y elige "Guardar como PDF" como destino.</p>
    <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 200); };</script>
    </body></html>`;
}
function exportWeeklyReport(student, week, weekNum) {
  const html = buildWeeklyReportHTML(student, week, weekNum);
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Reporte_${student.name.replace(/[^a-z0-9]+/gi, "_")}_${getWeekTitle(student, weekNum).replace(/[^a-z0-9]+/gi, "_")}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const PHASE_COLOR_PRINT = { base: "#8a9199", build: "#4a7fb5", peak: "#c8452e", taper: "#d99a3f", race: "#1e7e34", principiante: "#8a9199" };
function buildFullPlanOverviewHTML(student) {
  const esc = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const projection = projectWeeklyVolumes(student);
  const isBeginner = projection.kind === "beginner";
  const rows = isBeginner
    ? [...projection.rows].reverse().map((r) => ({
        weekLabel: `Semana ${r.weekNum}`, phaseLabel: r.label, phaseColor: "#8a9199",
        km: r1(r.totalMin / 60), isPeak: false, isRecovery: false,
      }))
    : [...projection.rows].sort((a, b) => b.weeksToRace - a.weeksToRace).map((r) => ({
        weekLabel: `Faltan ${r.weeksToRace} sem.`, phaseLabel: PHASE_LABEL[r.phase] || r.phase, phaseColor: PHASE_COLOR_PRINT[r.phase] || "#8a9199",
        km: r.km, isPeak: r.isPeak, isRecovery: r.isRecovery,
      }));
  const maxKm = Math.max(1, ...rows.map((r) => r.km));
  const rowsHtml = rows.map((r) => `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px;font-size:11px;">
      <div style="width:110px;flex-shrink:0;color:#555;">${esc(r.weekLabel)}</div>
      <div style="width:90px;flex-shrink:0;color:${r.phaseColor};font-weight:${r.isPeak ? "bold" : "normal"};">${esc(r.phaseLabel)}${r.isPeak ? " ★" : ""}${r.isRecovery ? " (asim.)" : ""}</div>
      <div style="flex:1;background:#eee;border-radius:3px;overflow:hidden;height:14px;">
        <div style="width:${Math.max(2, (r.km / maxKm) * 100)}%;background:${r.phaseColor};height:100%;"></div>
      </div>
      <div style="width:55px;flex-shrink:0;text-align:right;font-family:monospace;">${r.km} km</div>
    </div>`).join("");
  const legend = isBeginner ? "" : Object.entries(PHASE_LABEL).filter(([k]) => PHASE_COLOR_PRINT[k]).map(([k, label]) => `
    <span style="display:inline-flex;align-items:center;gap:4px;margin-right:14px;font-size:11px;color:#555;">
      <span style="width:10px;height:10px;border-radius:2px;background:${PHASE_COLOR_PRINT[k]};display:inline-block;"></span>${esc(label)}
    </span>`).join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Resumen del plan — ${esc(student.name)}</title>
    <style>body{font-family:Arial,sans-serif;color:#111;padding:32px;max-width:800px;margin:0 auto;}</style>
    </head><body>
    <h1 style="font-size:22px;margin-bottom:2px;">Resumen del plan — ${esc(student.name)}</h1>
    <p style="font-size:13px;color:#555;margin-bottom:4px;">${esc(GOAL_LABEL[student.goal])} · ${esc(LEVEL_LABEL[student.level])}</p>
    ${student.raceDate ? `<p style="font-size:12px;color:#777;margin-bottom:12px;">Fecha de carrera: ${esc(student.raceDate)}</p>` : ""}
    <div style="margin-bottom:16px;">${legend}</div>
    ${rowsHtml}
    <p style="font-size:11px;color:#999;margin-top:24px;">Vista resumida del volumen semanal planeado, desde la semana actual hasta el objetivo. Para el detalle día por día de una semana específica, usa "Exportar a PDF" desde esa semana. Para guardarlo como PDF: usa Archivo &gt; Imprimir (Cmd/Ctrl+P) y elige "Guardar como PDF".</p>
    <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 200); };</script>
    </body></html>`;
}
function exportFullPlanOverview(student) {
  const html = buildFullPlanOverviewHTML(student);
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Plan_completo_${student.name.replace(/[^a-z0-9]+/gi, "_")}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
/* ---------------------------------------------------------
   GENERADOR DE CÓDIGO QR (autónomo, sin dependencias externas)
   Implementación compacta del algoritmo estándar QR (dominio público,
   basada en el trabajo de Kazuhiko Arase). No depende de internet.
--------------------------------------------------------- */
// QR Code generator - implementación compacta, dominio público (basada en el algoritmo estándar
// de Kazuhiko Arase / qrcode-generator), sin dependencias externas.
const QRMode = { MODE_8BIT_BYTE: 4 };
const QRErrorCorrectLevel = { L: 1, M: 0, Q: 3, H: 2 };
const QRMaskPattern = { PATTERN000: 0, PATTERN001: 1, PATTERN010: 2, PATTERN011: 3, PATTERN100: 4, PATTERN101: 5, PATTERN110: 6, PATTERN111: 7 };

const QRUtil = (function () {
  const PATTERN_POSITION_TABLE = [
    [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
    [6, 30, 54], [6, 32, 58], [6, 34, 62], [6, 26, 46, 66], [6, 26, 48, 70], [6, 26, 50, 74], [6, 30, 54, 78],
    [6, 30, 56, 82], [6, 30, 58, 86], [6, 34, 62, 90], [6, 28, 50, 72, 94], [6, 26, 50, 74, 98],
    [6, 30, 54, 78, 102], [6, 28, 54, 80, 106], [6, 32, 58, 84, 110], [6, 30, 58, 86, 114],
    [6, 34, 62, 90, 118], [6, 26, 50, 74, 98, 122], [6, 30, 54, 78, 102, 126], [6, 26, 52, 78, 104, 130],
    [6, 30, 56, 82, 108, 134], [6, 34, 60, 86, 112, 138], [6, 30, 58, 86, 114, 142], [6, 34, 62, 90, 118, 146],
    [6, 30, 54, 78, 102, 126, 150], [6, 24, 50, 76, 102, 128, 154], [6, 28, 54, 80, 106, 132, 158],
    [6, 32, 58, 84, 110, 136, 162], [6, 26, 54, 82, 110, 138, 166], [6, 30, 58, 86, 114, 142, 170]
  ];
  const G15 = (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0);
  const G18 = (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | (1 << 0);
  const G15_MASK = (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1);
  function getBCHDigit(data) { let digit = 0; while (data !== 0) { digit++; data >>>= 1; } return digit; }
  function getBCHTypeInfo(data) {
    let d = data << 10;
    while (getBCHDigit(d) - getBCHDigit(G15) >= 0) d ^= (G15 << (getBCHDigit(d) - getBCHDigit(G15)));
    return ((data << 10) | d) ^ G15_MASK;
  }
  function getBCHTypeNumber(data) {
    let d = data << 12;
    while (getBCHDigit(d) - getBCHDigit(G18) >= 0) d ^= (G18 << (getBCHDigit(d) - getBCHDigit(G18)));
    return (data << 12) | d;
  }
  function getPatternPosition(typeNumber) { return PATTERN_POSITION_TABLE[typeNumber - 1]; }
  function getMask(maskPattern, i, j) {
    switch (maskPattern) {
      case QRMaskPattern.PATTERN000: return (i + j) % 2 === 0;
      case QRMaskPattern.PATTERN001: return i % 2 === 0;
      case QRMaskPattern.PATTERN010: return j % 3 === 0;
      case QRMaskPattern.PATTERN011: return (i + j) % 3 === 0;
      case QRMaskPattern.PATTERN100: return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0;
      case QRMaskPattern.PATTERN101: return (i * j) % 2 + (i * j) % 3 === 0;
      case QRMaskPattern.PATTERN110: return ((i * j) % 2 + (i * j) % 3) % 2 === 0;
      case QRMaskPattern.PATTERN111: return ((i * j) % 3 + (i + j) % 2) % 2 === 0;
      default: throw new Error("bad maskPattern:" + maskPattern);
    }
  }
  function getErrorCorrectPolynomial(errorCorrectLength) {
    let a = new QRPolynomial([1], 0);
    for (let i = 0; i < errorCorrectLength; i++) a = a.multiply(new QRPolynomial([1, QRMath.gexp(i)], 0));
    return a;
  }
  function getLengthInBits(mode, type) {
    if (type >= 1 && type < 10) { if (mode === QRMode.MODE_8BIT_BYTE) return 8; }
    else if (type < 27) { if (mode === QRMode.MODE_8BIT_BYTE) return 16; }
    else if (type < 41) { if (mode === QRMode.MODE_8BIT_BYTE) return 16; }
    else throw new Error("type:" + type);
    throw new Error("mode:" + mode);
  }
  function getLostPoint(qrCode) {
    const moduleCount = qrCode.getModuleCount();
    let lostPoint = 0;
    for (let row = 0; row < moduleCount; row++) for (let col = 0; col < moduleCount; col++) {
      let sameCount = 0; const dark = qrCode.isDark(row, col);
      for (let r = -1; r <= 1; r++) { if (row + r < 0 || moduleCount <= row + r) continue; for (let c = -1; c <= 1; c++) { if (col + c < 0 || moduleCount <= col + c) continue; if (r === 0 && c === 0) continue; if (dark === qrCode.isDark(row + r, col + c)) sameCount++; } }
      if (sameCount > 5) lostPoint += (3 + sameCount - 5);
    }
    for (let row = 0; row < moduleCount - 1; row++) for (let col = 0; col < moduleCount - 1; col++) {
      let count = 0;
      if (qrCode.isDark(row, col)) count++; if (qrCode.isDark(row + 1, col)) count++; if (qrCode.isDark(row, col + 1)) count++; if (qrCode.isDark(row + 1, col + 1)) count++;
      if (count === 0 || count === 4) lostPoint += 3;
    }
    for (let row = 0; row < moduleCount; row++) for (let col = 0; col < moduleCount - 6; col++) {
      if (qrCode.isDark(row, col) && !qrCode.isDark(row, col + 1) && qrCode.isDark(row, col + 2) && qrCode.isDark(row, col + 3) && qrCode.isDark(row, col + 4) && !qrCode.isDark(row, col + 5) && qrCode.isDark(row, col + 6)) lostPoint += 40;
    }
    for (let col = 0; col < moduleCount; col++) for (let row = 0; row < moduleCount - 6; row++) {
      if (qrCode.isDark(row, col) && !qrCode.isDark(row + 1, col) && qrCode.isDark(row + 2, col) && qrCode.isDark(row + 3, col) && qrCode.isDark(row + 4, col) && !qrCode.isDark(row + 5, col) && qrCode.isDark(row + 6, col)) lostPoint += 40;
    }
    let darkCount = 0;
    for (let col = 0; col < moduleCount; col++) for (let row = 0; row < moduleCount; row++) if (qrCode.isDark(row, col)) darkCount++;
    const ratio = Math.abs(100 * darkCount / moduleCount / moduleCount - 50) / 5;
    lostPoint += ratio * 10;
    return lostPoint;
  }
  return { getBCHTypeInfo, getBCHTypeNumber, getPatternPosition, getMask, getErrorCorrectPolynomial, getLengthInBits, getLostPoint, G15_MASK };
})();

const QRMath = (function () {
  const EXP_TABLE = new Array(256); const LOG_TABLE = new Array(256);
  for (let i = 0; i < 8; i++) EXP_TABLE[i] = 1 << i;
  for (let i = 8; i < 256; i++) EXP_TABLE[i] = EXP_TABLE[i - 4] ^ EXP_TABLE[i - 5] ^ EXP_TABLE[i - 6] ^ EXP_TABLE[i - 8];
  for (let i = 0; i < 255; i++) LOG_TABLE[EXP_TABLE[i]] = i;
  return {
    glog(n) { if (n < 1) throw new Error("glog(" + n + ")"); return LOG_TABLE[n]; },
    gexp(n) { while (n < 0) n += 255; while (n >= 256) n -= 255; return EXP_TABLE[n]; }
  };
})();

function QRPolynomial(num, shift) {
  let offset = 0;
  while (offset < num.length && num[offset] === 0) offset++;
  this.num = new Array(num.length - offset + shift);
  for (let i = 0; i < num.length - offset; i++) this.num[i] = num[i + offset];
}
QRPolynomial.prototype = {
  get(index) { return this.num[index]; },
  getLength() { return this.num.length; },
  multiply(e) {
    const num = new Array(this.getLength() + e.getLength() - 1);
    for (let i = 0; i < this.getLength(); i++) for (let j = 0; j < e.getLength(); j++) num[i + j] ^= QRMath.gexp(QRMath.glog(this.get(i)) + QRMath.glog(e.get(j)));
    return new QRPolynomial(num, 0);
  },
  mod(e) {
    if (this.getLength() - e.getLength() < 0) return this;
    const ratio = QRMath.glog(this.get(0)) - QRMath.glog(e.get(0));
    const num = new Array(this.getLength());
    for (let i = 0; i < this.getLength(); i++) num[i] = this.get(i);
    for (let i = 0; i < e.getLength(); i++) num[i] ^= QRMath.gexp(QRMath.glog(e.get(i)) + ratio);
    return new QRPolynomial(num, 0).mod(e);
  }
};

const QRRSBlock = (function () {
  const RS_BLOCK_TABLE = [
    [1, 26, 19], [1, 26, 16], [1, 26, 13], [1, 26, 9],
    [1, 44, 34], [1, 44, 28], [1, 44, 22], [1, 44, 16],
    [1, 70, 55], [1, 70, 44], [2, 35, 17], [2, 35, 13],
    [1, 100, 80], [2, 50, 32], [2, 50, 24], [4, 25, 9],
    [1, 134, 108], [2, 67, 43], [2, 33, 15, 2, 34, 16], [2, 33, 11, 2, 34, 12],
    [2, 86, 68], [4, 43, 27], [4, 43, 19], [4, 43, 15],
    [2, 98, 78], [4, 49, 31], [2, 32, 14, 4, 33, 15], [4, 39, 13, 1, 40, 14],
    [2, 121, 97], [2, 60, 38, 2, 61, 39], [4, 40, 18, 2, 41, 19], [4, 40, 14, 2, 41, 15],
    [2, 146, 116], [3, 58, 36, 2, 59, 37], [4, 36, 16, 4, 37, 17], [4, 36, 12, 4, 37, 13],
    [2, 86, 68, 2, 87, 69], [4, 69, 43, 1, 70, 44], [6, 43, 19, 2, 44, 20], [6, 43, 15, 2, 44, 16]
  ];
  function qrRSBlock(totalCount, dataCount) { this.totalCount = totalCount; this.dataCount = dataCount; }
  function getRsBlockTable(typeNumber, errorCorrectLevel) {
    switch (errorCorrectLevel) {
      case QRErrorCorrectLevel.L: return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 0];
      case QRErrorCorrectLevel.M: return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 1];
      case QRErrorCorrectLevel.Q: return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 2];
      case QRErrorCorrectLevel.H: return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 3];
    }
  }
  return {
    getRSBlocks(typeNumber, errorCorrectLevel) {
      const rsBlock = getRsBlockTable(typeNumber, errorCorrectLevel);
      if (rsBlock === undefined) throw new Error("bad rs block @ typeNumber:" + typeNumber + "/errorCorrectLevel:" + errorCorrectLevel);
      const length = rsBlock.length / 3;
      const list = [];
      for (let i = 0; i < length; i++) {
        const count = rsBlock[i * 3 + 0], totalCount = rsBlock[i * 3 + 1], dataCount = rsBlock[i * 3 + 2];
        for (let j = 0; j < count; j++) list.push(new qrRSBlock(totalCount, dataCount));
      }
      return list;
    }
  };
})();

function QRBitBuffer() { this.buffer = []; this.length = 0; }
QRBitBuffer.prototype = {
  get(index) { const bufIndex = Math.floor(index / 8); return ((this.buffer[bufIndex] >>> (7 - index % 8)) & 1) === 1; },
  put(num, length) { for (let i = 0; i < length; i++) this.putBit(((num >>> (length - i - 1)) & 1) === 1); },
  getLengthInBits() { return this.length; },
  putBit(bit) {
    const bufIndex = Math.floor(this.length / 8);
    if (this.buffer.length <= bufIndex) this.buffer.push(0);
    if (bit) this.buffer[bufIndex] |= (0x80 >>> (this.length % 8));
    this.length++;
  }
};

function QR8bitByte(data) {
  this.mode = QRMode.MODE_8BIT_BYTE;
  this.data = data;
  // codificar en UTF-8
  this.bytes = [];
  const s = unescape(encodeURIComponent(data));
  for (let i = 0; i < s.length; i++) this.bytes.push(s.charCodeAt(i));
}
QR8bitByte.prototype = {
  getLength() { return this.bytes.length; },
  write(buffer) { for (let i = 0; i < this.bytes.length; i++) buffer.put(this.bytes[i], 8); }
};

function QRCodeModel(typeNumber, errorCorrectLevel) {
  this.typeNumber = typeNumber; this.errorCorrectLevel = errorCorrectLevel;
  this.modules = null; this.moduleCount = 0; this.dataCache = null; this.dataList = [];
}
QRCodeModel.prototype = {
  addData(data) { this.dataList.push(new QR8bitByte(data)); this.dataCache = null; },
  isDark(row, col) {
    if (row < 0 || this.moduleCount <= row || col < 0 || this.moduleCount <= col) throw new Error(row + "," + col);
    return this.modules[row][col];
  },
  getModuleCount() { return this.moduleCount; },
  make() { this.makeImpl(false, this.getBestMaskPattern()); },
  makeImpl(test, maskPattern) {
    this.moduleCount = this.typeNumber * 4 + 17;
    this.modules = new Array(this.moduleCount);
    for (let row = 0; row < this.moduleCount; row++) { this.modules[row] = new Array(this.moduleCount); for (let col = 0; col < this.moduleCount; col++) this.modules[row][col] = null; }
    this.setupPositionProbePattern(0, 0);
    this.setupPositionProbePattern(this.moduleCount - 7, 0);
    this.setupPositionProbePattern(0, this.moduleCount - 7);
    this.setupPositionAdjustPattern();
    this.setupTimingPattern();
    this.setupTypeInfo(test, maskPattern);
    if (this.typeNumber >= 7) this.setupTypeNumber(test);
    if (this.dataCache === null) this.dataCache = QRCodeModel.createData(this.typeNumber, this.errorCorrectLevel, this.dataList);
    this.mapData(this.dataCache, maskPattern);
  },
  setupPositionProbePattern(row, col) {
    for (let r = -1; r <= 7; r++) { if (row + r <= -1 || this.moduleCount <= row + r) continue; for (let c = -1; c <= 7; c++) {
      if (col + c <= -1 || this.moduleCount <= col + c) continue;
      if ((0 <= r && r <= 6 && (c === 0 || c === 6)) || (0 <= c && c <= 6 && (r === 0 || r === 6)) || (2 <= r && r <= 4 && 2 <= c && c <= 4)) this.modules[row + r][col + c] = true;
      else this.modules[row + r][col + c] = false;
    } }
  },
  getBestMaskPattern() {
    let minLostPoint = 0, pattern = 0;
    for (let i = 0; i < 8; i++) {
      this.makeImpl(true, i);
      const lostPoint = QRUtil.getLostPoint(this);
      if (i === 0 || minLostPoint > lostPoint) { minLostPoint = lostPoint; pattern = i; }
    }
    return pattern;
  },
  setupTimingPattern() {
    for (let r = 8; r < this.moduleCount - 8; r++) { if (this.modules[r][6] !== null) continue; this.modules[r][6] = (r % 2 === 0); }
    for (let c = 8; c < this.moduleCount - 8; c++) { if (this.modules[6][c] !== null) continue; this.modules[6][c] = (c % 2 === 0); }
  },
  setupPositionAdjustPattern() {
    const pos = QRUtil.getPatternPosition(this.typeNumber);
    for (let i = 0; i < pos.length; i++) for (let j = 0; j < pos.length; j++) {
      const row = pos[i], col = pos[j];
      if (this.modules[row][col] !== null) continue;
      for (let r = -2; r <= 2; r++) for (let c = -2; c <= 2; c++) {
        if (r === -2 || r === 2 || c === -2 || c === 2 || (r === 0 && c === 0)) this.modules[row + r][col + c] = true; else this.modules[row + r][col + c] = false;
      }
    }
  },
  setupTypeNumber(test) {
    const bits = QRUtil.getBCHTypeNumber(this.typeNumber);
    for (let i = 0; i < 18; i++) { const mod = (!test && ((bits >> i) & 1) === 1); this.modules[Math.floor(i / 3)][i % 3 + this.moduleCount - 8 - 3] = mod; }
    for (let i = 0; i < 18; i++) { const mod = (!test && ((bits >> i) & 1) === 1); this.modules[i % 3 + this.moduleCount - 8 - 3][Math.floor(i / 3)] = mod; }
  },
  setupTypeInfo(test, maskPattern) {
    const data = (this.errorCorrectLevel << 3) | maskPattern;
    const bits = QRUtil.getBCHTypeInfo(data);
    for (let i = 0; i < 15; i++) {
      const mod = (!test && ((bits >> i) & 1) === 1);
      if (i < 6) this.modules[i][8] = mod; else if (i < 8) this.modules[i + 1][8] = mod; else this.modules[this.moduleCount - 15 + i][8] = mod;
    }
    for (let i = 0; i < 15; i++) {
      const mod = (!test && ((bits >> i) & 1) === 1);
      if (i < 8) this.modules[8][this.moduleCount - i - 1] = mod; else if (i < 9) this.modules[8][15 - i - 1 + 1] = mod; else this.modules[8][15 - i - 1] = mod;
    }
    this.modules[this.moduleCount - 8][8] = (!test);
  },
  mapData(data, maskPattern) {
    let inc = -1, row = this.moduleCount - 1, bitIndex = 7, byteIndex = 0;
    for (let col = this.moduleCount - 1; col > 0; col -= 2) {
      if (col === 6) col--;
      while (true) {
        for (let c = 0; c < 2; c++) {
          if (this.modules[row][col - c] === null) {
            let dark = false;
            if (byteIndex < data.length) dark = (((data[byteIndex] >>> bitIndex) & 1) === 1);
            const mask = QRUtil.getMask(maskPattern, row, col - c);
            if (mask) dark = !dark;
            this.modules[row][col - c] = dark;
            bitIndex--;
            if (bitIndex === -1) { byteIndex++; bitIndex = 7; }
          }
        }
        row += inc;
        if (row < 0 || this.moduleCount <= row) { row -= inc; inc = -inc; break; }
      }
    }
  }
};
QRCodeModel.PAD0 = 0xEC; QRCodeModel.PAD1 = 0x11;
QRCodeModel.createData = function (typeNumber, errorCorrectLevel, dataList) {
  const rsBlocks = QRRSBlock.getRSBlocks(typeNumber, errorCorrectLevel);
  const buffer = new QRBitBuffer();
  for (let i = 0; i < dataList.length; i++) {
    const data = dataList[i];
    buffer.put(data.mode, 4);
    buffer.put(data.getLength(), QRUtil.getLengthInBits(data.mode, typeNumber));
    data.write(buffer);
  }
  let totalDataCount = 0;
  for (let i = 0; i < rsBlocks.length; i++) totalDataCount += rsBlocks[i].dataCount;
  if (buffer.getLengthInBits() > totalDataCount * 8) throw new Error("code length overflow. (" + buffer.getLengthInBits() + ">" + totalDataCount * 8 + ")");
  if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) buffer.put(0, 4);
  while (buffer.getLengthInBits() % 8 !== 0) buffer.putBit(false);
  while (true) {
    if (buffer.getLengthInBits() >= totalDataCount * 8) break;
    buffer.put(QRCodeModel.PAD0, 8);
    if (buffer.getLengthInBits() >= totalDataCount * 8) break;
    buffer.put(QRCodeModel.PAD1, 8);
  }
  return QRCodeModel.createBytes(buffer, rsBlocks);
};
QRCodeModel.createBytes = function (buffer, rsBlocks) {
  let offset = 0, maxDcCount = 0, maxEcCount = 0;
  const dcdata = new Array(rsBlocks.length), ecdata = new Array(rsBlocks.length);
  for (let r = 0; r < rsBlocks.length; r++) {
    const dcCount = rsBlocks[r].dataCount, ecCount = rsBlocks[r].totalCount - dcCount;
    maxDcCount = Math.max(maxDcCount, dcCount); maxEcCount = Math.max(maxEcCount, ecCount);
    dcdata[r] = new Array(dcCount);
    for (let i = 0; i < dcdata[r].length; i++) dcdata[r][i] = 0xff & buffer.buffer[i + offset];
    offset += dcCount;
    const rsPoly = QRUtil.getErrorCorrectPolynomial(ecCount);
    const rawPoly = new QRPolynomial(dcdata[r], rsPoly.getLength() - 1);
    const modPoly = rawPoly.mod(rsPoly);
    ecdata[r] = new Array(rsPoly.getLength() - 1);
    for (let i = 0; i < ecdata[r].length; i++) { const modIndex = i + modPoly.getLength() - ecdata[r].length; ecdata[r][i] = (modIndex >= 0) ? modPoly.get(modIndex) : 0; }
  }
  let totalCodeCount = 0;
  for (let i = 0; i < rsBlocks.length; i++) totalCodeCount += rsBlocks[i].totalCount;
  const data = new Array(totalCodeCount); let index = 0;
  for (let i = 0; i < maxDcCount; i++) for (let r = 0; r < rsBlocks.length; r++) if (i < dcdata[r].length) data[index++] = dcdata[r][i];
  for (let i = 0; i < maxEcCount; i++) for (let r = 0; r < rsBlocks.length; r++) if (i < ecdata[r].length) data[index++] = ecdata[r][i];
  return data;
};

// Selecciona automáticamente la version minima que soporte los datos (modo byte, EC level M)
function createQRCode(text, ecLevel) {
  ecLevel = ecLevel || QRErrorCorrectLevel.M;
  for (let typeNumber = 1; typeNumber <= 40; typeNumber++) {
    try {
      const qr = new QRCodeModel(typeNumber, ecLevel);
      qr.addData(text);
      qr.make();
      return qr;
    } catch (e) {
      if (typeNumber === 40) throw e;
      continue;
    }
  }
}


// Genera un pitido corto con Web Audio API — sin depender de ningún archivo de audio externo.
// Un solo AudioContext compartido, reutilizado en cada pitido — en iOS, el sonido necesita
// "desbloquearse" con un toque real del usuario (ver unlockAudio, llamado desde el botón
// "Iniciar"); crear un contexto nuevo cada vez puede quedar en silencio sin ese desbloqueo previo.
let __sharedAudioCtx = null;
function getAudioContext() {
  if (!__sharedAudioCtx) {
    try { __sharedAudioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (e) { return null; }
  }
  return __sharedAudioCtx;
}
function unlockAudio() {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  // sonido silencioso e inmediato, solo para "activar" el audio en este toque de usuario
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.01);
  } catch (e) { /* no crítico */ }
}
function playBeep(freq = 880, durationMs = 180) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + durationMs / 1000);
  } catch (e) { /* audio no disponible, no es crítico */ }
}
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function formatClock(totalSec) {
  const h = Math.floor(totalSec / 3600), m = Math.floor((totalSec % 3600) / 60), s = Math.floor(totalSec % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}
function PhaseOverviewStrip({ segments, currentIdx }) {
  return (
    <div className="w-full overflow-x-auto mb-4">
      <div className="flex gap-1.5 px-1 pb-1" style={{ minWidth: "max-content" }}>
        {segments.map((s, i) => (
          <div key={i}
            className="flex flex-col items-center justify-center rounded-lg px-2.5 py-1.5 text-[10px] font-semibold whitespace-nowrap"
            style={{
              background: i === currentIdx ? COLORS.track : i < currentIdx ? COLORS.surface2 : COLORS.bg,
              color: i === currentIdx ? COLORS.lane : i < currentIdx ? COLORS.textMuted : COLORS.textMuted,
              border: `1px solid ${i === currentIdx ? COLORS.track : COLORS.border}`,
              opacity: i < currentIdx ? 0.6 : 1,
            }}>
            <span>{i + 1}. {s.label}</span>
            <span style={{ opacity: 0.8 }}>{s.type === "time" ? `${s.target < 1 ? Math.round(s.target * 60) + "s" : s.target + "'"}` : `${s.target} km`}</span>
          </div>
        ))}
        <div className="flex flex-col items-center justify-center rounded-lg px-2.5 py-1.5 text-[10px] font-semibold whitespace-nowrap"
          style={{ background: currentIdx >= segments.length ? COLORS.track : COLORS.bg, color: currentIdx >= segments.length ? COLORS.lane : COLORS.textMuted, border: `1px solid ${COLORS.border}` }}>
          <span>{segments.length + 1}. Libre</span>
          <span style={{ opacity: 0.8 }}>hasta Terminar</span>
        </div>
      </div>
    </div>
  );
}
function LiveTrainingScreen({ day, easyPace, onClose, onComplete }) {
  const segments = useMemo(() => buildLiveSegments(day, easyPace), [day, easyPace]);
  const [status, setStatus] = useState("ready"); // ready | running | paused | done
  const [segIdx, setSegIdx] = useState(0); // segments.length o mas = fase final libre
  const [segDistanceKm, setSegDistanceKm] = useState(0);
  const [segElapsedSec, setSegElapsedSec] = useState(0);
  const [totalKm, setTotalKm] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [gpsMode, setGpsMode] = useState("pending"); // pending | real | manual | denied
  const [flash, setFlash] = useState(null);
  const [screenFlash, setScreenFlash] = useState(false);
  const lastPosRef = React.useRef(null);
  const watchIdRef = React.useRef(null);
  const timerRef = React.useRef(null);
  const wakeLockRef = React.useRef(null);
  const [wakeLockOn, setWakeLockOn] = useState(false);

  const isOpenPhase = segIdx >= segments.length;
  const currentSeg = isOpenPhase ? { label: "Fase final (libre)", type: "open" } : segments[segIdx];
  const isLastDefinedSeg = segIdx === segments.length - 1;

  // Mantiene la pantalla encendida mientras el entrenamiento está corriendo o pausado, para que
  // el cronómetro y las alertas de cada fase sigan funcionando (en iOS, con la pantalla apagada,
  // el navegador deja de ejecutar el código en segundo plano). Se libera al cerrar o terminar.
  useEffect(() => {
    let cancelled = false;
    const acquire = async () => {
      if (!("wakeLock" in navigator)) return;
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (cancelled) { lock.release().catch(() => {}); return; }
        wakeLockRef.current = lock;
        setWakeLockOn(true);
        lock.addEventListener("release", () => { wakeLockRef.current = null; setWakeLockOn(false); });
      } catch (e) { setWakeLockOn(false); }
    };
    const release = () => {
      if (wakeLockRef.current) { wakeLockRef.current.release().catch(() => {}); wakeLockRef.current = null; }
      setWakeLockOn(false);
    };
    if (status === "running" || status === "paused") acquire();
    else release();
    // iOS libera el wake lock si la pestaña pierde visibilidad (cambiaste de app un momento) —
    // lo volvemos a pedir apenas la app vuelve a estar visible.
    const onVisibility = () => {
      if (document.visibilityState === "visible" && (status === "running" || status === "paused") && !wakeLockRef.current) acquire();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { cancelled = true; document.removeEventListener("visibilitychange", onVisibility); };
  }, [status]);
  useEffect(() => () => { if (wakeLockRef.current) wakeLockRef.current.release().catch(() => {}); }, []);

  useEffect(() => {
    if (status !== "running") return;
    timerRef.current = setInterval(() => { setElapsedSec((s) => s + 1); setSegElapsedSec((s) => s + 1); }, 1000);
    return () => clearInterval(timerRef.current);
  }, [status]);

  useEffect(() => {
    if (status !== "running") return;
    if (!("geolocation" in navigator)) { setGpsMode("manual"); return; }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsMode("real");
        const { latitude, longitude } = pos.coords;
        if (lastPosRef.current) {
          const d = haversineKm(lastPosRef.current.lat, lastPosRef.current.lon, latitude, longitude);
          if (d > 0.001 && d < 0.2) { // filtra saltos irreales de precisión GPS
            setSegDistanceKm((v) => v + d);
            setTotalKm((v) => v + d);
          }
        }
        lastPosRef.current = { lat: latitude, lon: longitude };
      },
      () => setGpsMode((m) => (m === "real" ? m : "denied")),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 8000 }
    );
    watchIdRef.current = id;
    return () => { if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current); };
  }, [status]);

  // avanzar de fase automáticamente al llegar a la meta del segmento actual (por tiempo o
  // por distancia, según corresponda) — al terminar la última fase definida, pasa a una fase
  // final libre que solo se cierra al presionar "Terminar".
  useEffect(() => {
    if (status !== "running" || isOpenPhase || !currentSeg) return;
    const reached = currentSeg.type === "time" ? segElapsedSec >= (currentSeg.target || 0.1) * 60 : segDistanceKm >= (currentSeg.target || 0.05);
    if (reached) {
      playBeep(isLastDefinedSeg ? 660 : 990, 220);
      if (navigator.vibrate) navigator.vibrate(isLastDefinedSeg ? [200, 100, 200] : 200);
      setScreenFlash(true);
      setTimeout(() => setScreenFlash(false), 500);
      setSegIdx((i) => i + 1);
      setSegDistanceKm(0);
      setSegElapsedSec(0);
      setFlash(isLastDefinedSeg ? "¡Fase final! Sigue acumulando o presiona Terminar cuando quieras." : `Siguiente: ${segments[segIdx + 1]?.label}`);
      setTimeout(() => setFlash(null), 3500);
    }
  }, [segDistanceKm, segElapsedSec, status]);

  const addManualDistance = (km) => {
    setSegDistanceKm((v) => v + km);
    setTotalKm((v) => v + km);
  };

  const start = () => { unlockAudio(); setStatus("running"); };
  const pause = () => setStatus("paused");
  const resume = () => { unlockAudio(); setStatus("running"); };
  const finishNow = () => { setStatus("done"); playBeep(660, 220); };

  const avgPace = totalKm > 0.05 ? elapsedSec / 60 / totalKm : null;

  if (status === "done") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center px-6" style={{ background: COLORS.bg }}>
        <Check size={48} style={{ color: COLORS.easy }} />
        <h2 className="text-2xl font-bold mt-4 mb-1" style={{ fontFamily: "'Oswald', sans-serif", color: COLORS.textPrimary }}>¡Listo!</h2>
        <p className="text-sm mb-6" style={{ color: COLORS.textMuted }}>Resumen de tu sesión</p>
        <div className="grid grid-cols-3 gap-4 mb-8 w-full max-w-sm">
          <div className="text-center">
            <div className="text-2xl font-bold font-mono" style={{ color: COLORS.track }}>{r1(totalKm)}</div>
            <div className="text-[10px] uppercase" style={{ color: COLORS.textMuted }}>km</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold font-mono" style={{ color: COLORS.track }}>{formatClock(elapsedSec)}</div>
            <div className="text-[10px] uppercase" style={{ color: COLORS.textMuted }}>tiempo</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold font-mono" style={{ color: COLORS.track }}>{avgPace ? formatPace(avgPace) : "—"}</div>
            <div className="text-[10px] uppercase" style={{ color: COLORS.textMuted }}>ritmo/km</div>
          </div>
        </div>
        {gpsMode !== "real" && (
          <p className="text-xs text-center mb-6 max-w-sm" style={{ color: COLORS.moderate }}>
            El GPS no estuvo disponible en esta prueba — la distancia de arriba es simulada/manual, no una medición real.
          </p>
        )}
        <div className="flex gap-3 w-full max-w-sm">
          <button onClick={onClose} className="flex-1 px-4 py-3 rounded-lg text-sm font-semibold" style={{ background: COLORS.surface2, color: COLORS.lane }}>
            Cerrar sin guardar
          </button>
          <button
            onClick={() => onComplete({ actualKm: r1(totalKm), actualPaceStr: avgPace ? formatPace(avgPace) : "" })}
            className="flex-1 px-4 py-3 rounded-lg text-sm font-semibold" style={{ background: COLORS.track, color: COLORS.lane }}>
            Guardar como completado
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: COLORS.bg }}>
      {screenFlash && (
        <div className="fixed inset-0 z-[60] pointer-events-none" style={{ background: COLORS.track, animation: "screenFlashPulse 0.5s ease-out" }} />
      )}
      <div className="flex items-center justify-between px-5 pt-5">
        <button onClick={onClose} className="p-2 rounded-lg" style={{ color: COLORS.textMuted }}><X size={20} /></button>
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-xs uppercase tracking-wide" style={{ color: COLORS.textMuted }}>
            {gpsMode === "real" ? "📍 GPS activo" : gpsMode === "denied" ? "⚠️ Sin GPS — modo manual" : gpsMode === "manual" ? "✋ Modo manual" : "Listo para empezar"}
          </span>
          {(status === "running" || status === "paused") && (
            <span className="text-[10px]" style={{ color: wakeLockOn ? COLORS.easy : COLORS.moderate }}>
              {wakeLockOn ? "🔆 Pantalla se mantiene encendida" : "⚠️ No se pudo evitar que la pantalla se apague"}
            </span>
          )}
        </div>
        <div style={{ width: 36 }} />
      </div>

      <div className="px-3 pt-3">
        <PhaseOverviewStrip segments={segments} currentIdx={segIdx} />
      </div>

      {flash && (
        <div className="mx-5 mt-1 rounded-lg p-3 text-center text-sm font-semibold animate-fadein" style={{ background: COLORS.track, color: COLORS.lane }}>
          {flash}
        </div>
      )}

      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="text-xs uppercase tracking-wide mb-2" style={{ color: COLORS.track }}>
          {isOpenPhase ? "Fase libre" : `Fase ${segIdx + 1} de ${segments.length}`}
        </div>
        <div className="text-3xl font-bold mb-1 text-center" style={{ fontFamily: "'Oswald', sans-serif", color: COLORS.textPrimary }}>
          {currentSeg?.label}
        </div>
        {currentSeg?.pace && (
          <div className="text-sm mb-8" style={{ color: COLORS.textMuted }}>Ritmo objetivo: {formatPace(currentSeg.pace)}/km</div>
        )}
        {!currentSeg?.pace && <div className="mb-8" />}

        <div className="text-6xl font-bold font-mono mb-2" style={{ color: COLORS.lane }}>{formatClock(elapsedSec)}</div>

        {isOpenPhase ? (
          <div className="text-lg font-mono mb-1" style={{ color: COLORS.textMuted }}>
            {formatClock(segElapsedSec)} · {r1(segDistanceKm)} km en esta fase
          </div>
        ) : currentSeg?.type === "time" ? (
          <div className="text-lg font-mono mb-1" style={{ color: COLORS.textMuted }}>
            {formatClock(segElapsedSec)} / {formatClock((currentSeg?.target || 0) * 60)} de esta fase
          </div>
        ) : (
          <div className="text-lg font-mono mb-1" style={{ color: COLORS.textMuted }}>
            {r1(segDistanceKm)} / {r1(currentSeg?.target || 0)} km de esta fase
          </div>
        )}

        {!isOpenPhase && (
          <div className="w-full max-w-xs h-2 rounded-full overflow-hidden mb-8" style={{ background: COLORS.surface2 }}>
            <div className="h-full" style={{
              width: `${Math.min(100, currentSeg?.type === "time" ? (segElapsedSec / ((currentSeg?.target || 1) * 60)) * 100 : (segDistanceKm / (currentSeg?.target || 1)) * 100)}%`,
              background: COLORS.track,
            }} />
          </div>
        )}
        {isOpenPhase && <div className="mb-8" />}

        {gpsMode !== "real" && status === "running" && (
          <div className="flex gap-2 mb-6">
            <button onClick={() => addManualDistance(0.1)} className="px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: COLORS.surface2, color: COLORS.lane }}>+100 m</button>
            <button onClick={() => addManualDistance(0.5)} className="px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: COLORS.surface2, color: COLORS.lane }}>+500 m</button>
            <button onClick={() => addManualDistance(1)} className="px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: COLORS.surface2, color: COLORS.lane }}>+1 km</button>
          </div>
        )}

        {status === "ready" && (
          <button onClick={start} className="px-10 py-4 rounded-full text-base font-bold" style={{ background: COLORS.track, color: COLORS.lane }}>
            Iniciar
          </button>
        )}
        {status === "running" && (
          <div className="flex gap-3">
            <button onClick={pause} className="px-6 py-3 rounded-full text-sm font-semibold" style={{ background: COLORS.surface2, color: COLORS.lane }}>Pausar</button>
            <button onClick={finishNow} className="px-6 py-3 rounded-full text-sm font-semibold" style={{ background: COLORS.moderate, color: COLORS.lane }}>Terminar</button>
          </div>
        )}
        {status === "paused" && (
          <div className="flex gap-3">
            <button onClick={resume} className="px-6 py-3 rounded-full text-sm font-semibold" style={{ background: COLORS.track, color: COLORS.lane }}>Reanudar</button>
            <button onClick={finishNow} className="px-6 py-3 rounded-full text-sm font-semibold" style={{ background: COLORS.moderate, color: COLORS.lane }}>Terminar</button>
          </div>
        )}
      </div>
    </div>
  );
}
function QRCodeSVG({ text, size = 220 }) {
  const qr = useMemo(() => {
    try { return createQRCode(text, QRErrorCorrectLevel.M); }
    catch (e) { return null; }
  }, [text]);
  if (!qr) return null;
  const count = qr.getModuleCount();
  const margin = 2; // módulos de margen blanco
  const total = count + margin * 2;
  const rects = [];
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) rects.push(`M${col + margin},${row + margin}h1v1h-1z`);
    }
  }
  return (
    <svg viewBox={`0 0 ${total} ${total}`} width={size} height={size} style={{ background: "#fff", borderRadius: 8 }}>
      <path d={rects.join("")} fill="#000" />
    </svg>
  );
}
function PrintableWeek({ student, week, weekNum }) {
  if (!student || !week) return null;
  return (
    <div className="print-only" style={{ padding: "32px", color: "#111", background: "#fff", fontFamily: "Arial, sans-serif" }}>
      <h1 style={{ fontSize: 22, marginBottom: 2 }}>{student.name}</h1>
      <p style={{ fontSize: 13, color: "#555", marginBottom: 4 }}>
        {GOAL_LABEL[student.goal]} · {LEVEL_LABEL[student.level]} · {getWeekTitle(student, weekNum)}
        {week.weeklyKm != null ? ` · ${week.weeklyKm} km` : ""}
      </p>
      {student.raceDate && <p style={{ fontSize: 12, color: "#777", marginBottom: 16 }}>Fecha de carrera: {student.raceDate}</p>}
      {week.note && <p style={{ fontSize: 12, color: "#777", marginBottom: 16, fontStyle: "italic" }}>{week.note}</p>}
      {week.plan.map((d, i) => {
        const detail = d.paceKey ? getSessionDetail(d) : null;
        return (
          <div key={i} style={{ marginBottom: 14, paddingBottom: 10, borderBottom: "1px solid #ddd", breakInside: "avoid" }}>
            <div style={{ fontWeight: "bold", fontSize: 14 }}>
              {DAYS[i]} — {d.type}{d.paceKey ? ` (${d.km} km)` : ""}
            </div>
            {!d.paceKey && <div style={{ fontSize: 12, color: "#777" }}>Descanso</div>}
            {detail && detail.map((seg, si) => (
              <div key={si} style={{ fontSize: 12, color: "#333", marginTop: 3 }}>
                <b>{seg.label}:</b> {seg.text}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
// Muestra el cumplimiento reciente en dos datos separados: sesiones hechas y volumen
// corrido. Antes se combinaban en un solo porcentaje, lo que ocultaba la diferencia entre
// "faltó a una sesión" y "las hizo todas pero más cortas".
function AdherenceBadge({ compliance }) {
  if (!compliance) return <Pill color={COLORS.textMuted}>Sin datos</Pill>;
  const { sessionsDone, sessionsTotal, sessionsPct, volumePct, weeks } = compliance;
  const sColor = sessionsPct >= 0.9 ? COLORS.easy : sessionsPct < 0.7 ? COLORS.track : COLORS.moderate;
  const vPctNum = volumePct != null ? Math.round(volumePct * 100) : null;
  const vColor = vPctNum == null ? COLORS.textMuted
    : vPctNum >= 90 && vPctNum <= 110 ? COLORS.easy
    : vPctNum < 75 || vPctNum > 125 ? COLORS.track : COLORS.moderate;
  const title = `Últimas ${weeks} semana${weeks === 1 ? "" : "s"}: ${sessionsDone} de ${sessionsTotal} sesiones`
    + (vPctNum != null ? ` · ${vPctNum}% del volumen planificado` : " · sin km registrados");
  return (
    <span className="inline-flex items-center gap-1.5" title={title}>
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold"
        style={{ background: sColor + "22", color: sColor, border: `1px solid ${sColor}55` }}>
        {sessionsDone}/{sessionsTotal}
      </span>
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold"
        style={{ background: vColor + "22", color: vColor, border: `1px solid ${vColor}55` }}>
        {vPctNum != null ? `${vPctNum}%` : "— km"}
      </span>
    </span>
  );
}

function SessionDetail({ segments }) {
  if (!segments) return null;
  return (
    <div className="mt-2 space-y-1 rounded-lg p-2" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}` }}>
      {segments.map((s, i) => (
        <div key={i} className="flex items-start gap-2 text-xs">
          <span style={{ width: 8, height: 8, borderRadius: 999, background: s.color, marginTop: 4, flexShrink: 0 }} />
          <span style={{ color: COLORS.textMuted }}><strong style={{ color: COLORS.textPrimary }}>{s.label}:</strong> {s.text}</span>
        </div>
      ))}
    </div>
  );
}

/* Barras de progreso histórico del alumno (adherencia semanal vs objetivo) */
// Racha: cuántas semanas SEGUIDAS (contando hacia atrás, las que el alumno mismo envió)
// tuvo una adherencia de 90% o más.
function computeStreak(student) {
  const weekNums = Object.keys(student.weeks).map(Number)
    .filter((n) => student.weeks[n]?.studentSubmitted)
    .sort((a, b) => b - a);
  let streak = 0;
  for (const n of weekNums) {
    if ((student.weeks[n]?.adherencePct ?? 0) >= 0.9) streak++;
    else break;
  }
  return streak;
}
// Kilometraje acumulado real (lo efectivamente corrido) desde el 1 de enero del año en curso.
function computeYearToDateKm(student) {
  const currentYear = new Date().getFullYear();
  let total = 0;
  Object.keys(student.weeks).forEach((wkNum) => {
    const { monday } = getWeekDates(student, Number(wkNum));
    if (monday.getFullYear() !== currentYear) return;
    const week = student.weeks[wkNum];
    (week.log || []).forEach((l, i) => {
      const planDay = week.plan?.[i];
      if (l?.completed && planDay?.paceKey) {
        const km = l.actualKm !== "" && l.actualKm != null && !isNaN(Number(l.actualKm)) ? Number(l.actualKm) : planDay.km;
        total += km || 0;
      }
    });
  });
  return r1(total);
}
// Kilometraje real (lo efectivamente corrido) de cada semana del historial completo del alumno.
function getStudentKmHistory(student) {
  return Object.keys(student.weeks).map((wkNum) => {
    const n = Number(wkNum);
    const { monday } = getWeekDates(student, n);
    const week = student.weeks[wkNum];
    let km = 0;
    (week.log || []).forEach((l, i) => {
      const planDay = week.plan?.[i];
      if (l?.completed && planDay?.paceKey) {
        const dayKm = l.actualKm !== "" && l.actualKm != null && !isNaN(Number(l.actualKm)) ? Number(l.actualKm) : planDay.km;
        km += dayKm || 0;
      }
    });
    return { weekNum: n, monday, km: r1(km) };
  }).sort((a, b) => a.weekNum - b.weekNum);
}
// Agrupa el historial semanal en totales por mes o por año.
function aggregateKmHistory(history, groupBy) {
  const groups = {};
  const order = [];
  history.forEach((row) => {
    let key, label;
    if (groupBy === "month") {
      key = `${row.monday.getFullYear()}-${String(row.monday.getMonth() + 1).padStart(2, "0")}`;
      label = `${MONTH_NAMES_ES[row.monday.getMonth()]} ${row.monday.getFullYear()}`;
    } else {
      key = String(row.monday.getFullYear());
      label = key;
    }
    if (!(key in groups)) { groups[key] = { label, km: 0 }; order.push(key); }
    groups[key].km += row.km;
  });
  return order.map((key) => ({ label: groups[key].label, km: r1(groups[key].km) }));
}
const MONTH_NAMES_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
function ProgressChart({ student, activeWeekNum }) {
  const viewedWeekNum = activeWeekNum ?? student.currentWeek;
  const week = ensureWeekShape(student.weeks[viewedWeekNum] ?? student.weeks[student.currentWeek]);
  const trainSlots = (week?.plan || []).map((d, i) => ({ d, i })).filter((x) => !!x.d?.paceKey);
  const completedCount = trainSlots.filter((x) => week.log[x.i]?.completed).length;
  const totalCount = trainSlots.length;
  const dailyPct = totalCount > 0 ? completedCount / totalCount : 0;

  const isRaceGoal = !isFitnessGoal(student.goal) && student.level !== "principiante" && !!student.raceDate;
  const bars = [];
  for (let w = 1; w <= student.currentWeek; w++) {
    const wk = student.weeks[w];
    if (!wk) continue;
    const { adherencePct } = computeAdherence(wk.plan, wk.log);
    const load = wk.weeklyKm ?? null;
    bars.push({ weekNum: w, load, adherencePct, ghost: false, current: w === viewedWeekNum });
  }
  if (isRaceGoal) {
    const projection = projectWeeklyVolumes(student);
    if (projection.kind === "race") {
      projection.rows.filter((r) => r.weekNum > student.currentWeek).forEach((r) => {
        bars.push({ weekNum: r.weekNum, load: r.km, ghost: true, current: r.weekNum === viewedWeekNum });
      });
    }
  }
  const loads = bars.map((b) => b.load).filter((l) => l != null);
  const maxLoad = loads.length ? Math.max(...loads) : 1;
  const lastBar = bars[bars.length - 1];
  const streak = computeStreak(student);
  const ytdKm = computeYearToDateKm(student);

  return (
    <div className="rounded-xl p-4 space-y-4" style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm font-semibold" style={{ color: COLORS.textPrimary, fontFamily: "'Oswald', sans-serif" }}>TU EVOLUCIÓN</div>
        <div className="flex items-center gap-3 text-xs" style={{ color: COLORS.textMuted }}>
          {streak >= 2 && (
            <span className="flex items-center gap-1 font-semibold" style={{ color: COLORS.track }}>🔥 {streak} semanas seguidas</span>
          )}
          <span>{ytdKm} km en {new Date().getFullYear()}</span>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs" style={{ color: COLORS.textMuted }}>Esta semana</span>
          <span className="text-xs font-semibold" style={{ color: COLORS.textPrimary }}>{completedCount}/{totalCount} sesiones</span>
        </div>
        <div className="w-full rounded-full overflow-hidden" style={{ height: 12, background: COLORS.surface2 }}>
          <div style={{ width: `${Math.max(2, dailyPct * 100)}%`, height: "100%", background: dailyPct >= 1 ? COLORS.easy : COLORS.track, transition: "width 0.4s ease" }} />
        </div>
      </div>

      {bars.length > 1 && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs" style={{ color: COLORS.textMuted }}>{getWeekTitle(student, bars[0].weekNum)}</span>
            <span className="text-xs" style={{ color: COLORS.textMuted }}>
              {isRaceGoal ? getWeekTitle(student, lastBar.weekNum) : "Hoy"}
            </span>
          </div>
          <div className="flex items-end gap-1" style={{ height: 90 }}>
            {bars.map((b) => {
              const h = b.load != null ? Math.max(6, (b.load / maxLoad) * 100) : (b.ghost ? 15 : Math.max(6, b.adherencePct * 100));
              const fillColor = b.adherencePct >= 0.9 ? COLORS.easy : b.adherencePct < 0.7 ? COLORS.track : COLORS.moderate;
              return (
                <div key={b.weekNum} className="flex flex-col items-center justify-end flex-1" style={{ height: "100%", minWidth: 6 }}>
                  <div style={{
                    width: "100%", maxWidth: 22, height: `${h}%`, borderRadius: 4,
                    background: b.ghost ? "transparent" : fillColor,
                    border: b.ghost ? `1.5px dashed ${COLORS.border}` : (b.current ? `2px solid ${COLORS.lane}` : "none"),
                    opacity: b.ghost ? 0.6 : 1,
                  }} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   LO QUE TRAJO EL RELOJ

   Dos niveles de detalle, a propósito.

   El alumno ve lo justo para reconocer su salida y entender que no tiene que escribirla:
   kilómetros, tiempo, ritmo y pulso medio. Lo único que le queda por poner es el RPE, que
   no lo mide ningún sensor.

   El coach ve además lo que le sirve para decidir: pulso máximo, cadencia, desnivel,
   carga, y los parciales de cada serie. Y la diferencia contra lo planificado, que es la
   pregunta que de verdad se hace al abrir la ficha.

   Lo planificado no se toca nunca: si corrió 8 donde había 5, se ven los dos números.
--------------------------------------------------------- */
function segundosATexto(seg) {
  if (seg == null || !Number.isFinite(seg)) return null;
  const m = Math.floor(seg / 60);
  return `${m}:${String(Math.round(seg - m * 60)).padStart(2, "0")}`;
}

function DatoDelReloj({ valor, etiqueta }) {
  if (valor == null || valor === "") return null;
  return (
    <span className="text-xs whitespace-nowrap" style={{ color: COLORS.textMuted }}>
      <span style={{ color: COLORS.lane, fontFamily: "'JetBrains Mono', monospace" }}>{valor}</span>{" "}{etiqueta}
    </span>
  );
}

function DatosDelReloj({ reloj, day, esCoach, titulo = "Del reloj" }) {
  const [verVueltas, setVerVueltas] = useState(false);
  if (!reloj) return null;

  const planKm = day?.km ?? null;
  const difKm = planKm > 0 && reloj.km != null ? Math.round((reloj.km - planKm) * 10) / 10 : null;
  const tiempo = reloj.min != null ? segundosATexto(reloj.min * 60) : null;

  return (
    <div className="mt-2 rounded-lg px-3 py-2" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}` }}>
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <Activity size={11} style={{ color: COLORS.track }} />
        <span className="text-[10px] uppercase tracking-wide" style={{ color: COLORS.track }}>{titulo}</span>
        {reloj.dispositivo && <span className="text-[10px]" style={{ color: COLORS.textMuted }}>{reloj.dispositivo}</span>}
        {reloj.via === "fecha" && (
          <span className="text-[10px]" style={{ color: COLORS.textMuted }}
            title="Esta actividad no venía enlazada al entrenamiento planificado; se asignó porque cayó ese día.">
            · asignada por fecha
          </span>
        )}
      </div>

      <div className="flex items-center gap-x-3 gap-y-1 flex-wrap">
        <DatoDelReloj valor={reloj.km} etiqueta="km" />
        <DatoDelReloj valor={tiempo} etiqueta="min" />
        <DatoDelReloj valor={reloj.ritmo} etiqueta="/km" />
        <DatoDelReloj valor={reloj.fcMedia} etiqueta="ppm" />
        {esCoach && (
          <>
            <DatoDelReloj valor={reloj.fcMax} etiqueta="ppm máx" />
            <DatoDelReloj valor={reloj.cadencia} etiqueta="pasos/min" />
            <DatoDelReloj valor={reloj.subida != null ? `+${reloj.subida}` : null} etiqueta="m" />
            <DatoDelReloj valor={reloj.carga} etiqueta="carga" />
            <DatoDelReloj valor={reloj.calorias} etiqueta="kcal" />
          </>
        )}
      </div>

      {difKm != null && Math.abs(difKm) >= 0.5 && (
        <div className="text-[11px] mt-1" style={{ color: COLORS.textMuted }}>
          {difKm > 0 ? `${difKm} km más` : `${Math.abs(difKm)} km menos`} de lo planificado ({planKm} km)
        </div>
      )}

      {esCoach && reloj.vueltas?.length > 0 && (
        <>
          <button type="button" onClick={() => setVerVueltas((v) => !v)}
            className="text-[11px] mt-1" style={{ color: COLORS.track }}>
            {verVueltas ? "Ocultar los parciales" : `Ver los ${reloj.vueltas.length} parciales`}
          </button>
          {verVueltas && (
            <div className="mt-1 space-y-0.5">
              {reloj.vueltas.map((v, i) => (
                <div key={i} className="flex gap-3 text-[11px]"
                  style={{ fontFamily: "'JetBrains Mono', monospace", color: COLORS.textMuted }}>
                  <span className="w-5 text-right">{i + 1}</span>
                  <span className="w-16 text-right">{v.km != null ? `${v.km} km` : "—"}</span>
                  <span className="w-14 text-right">{segundosATexto(v.seg) || "—"}</span>
                  <span style={{ color: COLORS.lane }}>{v.ritmo ? `${v.ritmo}/km` : ""}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   SALIDAS ADICIONALES

   Lo que el alumno corrió ese día además de su sesión: una segunda salida, un trote
   suelto, o una salida en un día de descanso. Se ve en la tarjeta de ese día —también en
   los de descanso— con el mismo detalle que la sesión. No se compara con lo planificado,
   porque no había nada planificado con qué compararla.
--------------------------------------------------------- */
function horaDe(fecha) {
  const m = /T(\d{2}):(\d{2})/.exec(String(fecha || ""));
  return m ? `${m[1]}:${m[2]}` : null;
}

function SalidasAdicionales({ extras, esCoach }) {
  if (!Array.isArray(extras) || !extras.length) return null;
  return (
    <div className="mt-2 space-y-2">
      {extras.map((e, i) => (
        <DatosDelReloj key={e.id ?? i} reloj={e} day={null} esCoach={esCoach}
          titulo={`Salida adicional${horaDe(e.fecha) ? ` · ${horaDe(e.fecha)}` : ""}`} />
      ))}
    </div>
  );
}

function LapCard({ day: dayRaw, index, mode, log, onChangeDay, onChangeLog, isToday, isRaceGoal, onStartLive, onSwapDay, onMoveSession, esCoach, extras }) {
  // Un día puede faltar en planes guardados por versiones anteriores; se trata como descanso
  // en vez de tumbar la pantalla completa del alumno.
  const day = dayRaw || { day: DAYS[index] ?? "", type: "Descanso", paceKey: "", km: 0 };
  const zone = ZONE_BY_PACEKEY[day.paceKey] || "rest";
  const zoneColor = ZONE_COLOR[zone];
  const isRest = !day.paceKey;
  const detail = getSessionDetail(day);
  const highlightToday = isToday && !log?.completed;

  return (
    <div className="rounded-xl overflow-hidden flex flex-col animate-fadein"
      style={{
        background: COLORS.surface2,
        border: highlightToday ? `2px solid ${COLORS.track}` : `1px solid ${COLORS.border}`,
        boxShadow: highlightToday ? `0 0 0 3px ${COLORS.track}33` : "none",
        opacity: log?.completed ? 0.55 : 1, transition: "opacity 0.25s ease, box-shadow 0.25s ease",
      }}>
      {highlightToday && (
        <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-widest" style={{ background: COLORS.track, color: COLORS.lane }}>
          Hoy · te toca esto
        </div>
      )}
      <div className="flex items-stretch">
        <div style={{ width: 6, background: zoneColor, flexShrink: 0 }} />
        <div className="p-3 flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-semibold tracking-widest uppercase"
              style={{ fontFamily: "'Oswald', sans-serif", color: COLORS.textMuted }}>
              {String(index + 1).padStart(2, "0")} · {day.day}
            </span>
            <div className="flex items-center gap-2">
              {mode === "edit" && onSwapDay && (
                <select value="" onChange={(e) => { if (e.target.value !== "") onSwapDay(index, Number(e.target.value)); }}
                  className="text-[10px] rounded px-1 py-0.5" style={{ background: COLORS.bg, color: COLORS.track, border: `1px solid ${COLORS.track}55` }}>
                  <option value="">🔀 Mover a…</option>
                  {DAYS.map((d, i) => i !== index && <option key={i} value={i}>{d}</option>)}
                </select>
              )}
              {log?.completed && <span style={{ color: COLORS.easy }}><Check size={16} /></span>}
            </div>
          </div>

          {mode === "edit" ? (
            <input type="text" value={day.type}
              onChange={(e) => onChangeDay(index, { ...day, type: e.target.value })}
              className="mt-0.5 w-full rounded px-2 py-1 text-sm font-semibold"
              style={{ background: COLORS.bg, color: COLORS.textPrimary, border: `1px solid ${COLORS.border}`, fontFamily: "'Oswald', sans-serif" }} />
          ) : (
            <div className="mt-0.5 text-base font-semibold truncate" style={{ fontFamily: "'Oswald', sans-serif", color: COLORS.textPrimary }}>{day.type}</div>
          )}

          {mode === "edit" ? (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <select value={displayPaceKey(day.paceKey)}
                onChange={(e) => { const paceKey = e.target.value; onChangeDay(index, { ...day, paceKey, km: paceKey ? day.km : 0 }); }}
                className="rounded px-2 py-1 text-xs" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                {PACE_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
              <input type="number" min="0" step="0.5" value={day.km}
                onChange={(e) => onChangeDay(index, { ...day, km: Number(e.target.value) || 0 })}
                className="rounded px-2 py-1 text-xs font-mono" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
              {day.kmFijado && day.paceKey === "E" && (
                <button type="button" onClick={() => onChangeDay(index, { ...day, liberar: true })}
                  title="Este día lo fijaste a mano y el reajuste no lo mueve. Tocá para que vuelva a ajustarse solo."
                  className="col-span-2 text-left text-[11px]" style={{ color: COLORS.textMuted }}>
                  Fijado a mano · <span style={{ color: COLORS.track }}>↺ que se ajuste solo</span>
                </button>
              )}
              {displayPaceKey(day.paceKey) === "T" && (
                <select value={day.paceKey} onChange={(e) => onChangeDay(index, { ...day, paceKey: e.target.value })}
                  className="col-span-2 rounded px-2 py-1 text-xs" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                  {T_VARIANTS.map((v) => <option key={v.key} value={v.key}>Umbral · {v.label}</option>)}
                </select>
              )}
              {displayPaceKey(day.paceKey) === "custom" && (
                <select value={day.paceKey} onChange={(e) => onChangeDay(index, { ...day, paceKey: e.target.value })}
                  className="col-span-2 rounded px-2 py-1 text-xs" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                  {OTRO_TEMPLATES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              )}
              {day.paceKey === "E" && !day.stageLabel && (
                <label className="col-span-2 flex items-center gap-2 text-xs cursor-pointer" style={{ color: COLORS.textMuted }}>
                  <input type="checkbox" checked={!!day.runWalk} onChange={(e) => {
                      const runWalk = e.target.checked;
                      const defaultTitles = ["Easy", "Recuperación", "Run/Walk"];
                      const type = defaultTitles.includes(day.type) ? (getDefaultTitle("E", day.isMondayRecovery, runWalk) ?? day.type) : day.type;
                      onChangeDay(index, { ...day, runWalk, type });
                    }} style={{ accentColor: COLORS.track }} />
                  Estructurar como Run/Walk
                </label>
              )}
              {(day.paceKey === "R" || day.paceKey === "I" || day.paceKey === "T") && (
                <div className="col-span-2 flex flex-wrap gap-2 pt-1" style={{ borderTop: `1px dashed ${COLORS.border}` }}>
                  <div style={{ minWidth: 90 }}>
                    <label className="block text-[9px] uppercase tracking-wide mb-1" style={{ color: COLORS.textMuted }}>
                      {day.paceKey === "T" ? "Duración (min)" : "Distancia"}
                    </label>
                    <select value={day.distOverride ?? ""} onChange={(e) => {
                        const next = { ...day, distOverride: e.target.value ? Number(e.target.value) : null, repsOverride: null };
                        onChangeDay(index, { ...next, km: computeImpliedKm(next) });
                      }}
                      className="w-full rounded px-1.5 py-1 text-[11px]" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                      <option value="">Auto</option>
                      {(day.paceKey === "T" ? T_DURATIONS : day.paceKey === "I" ? I_DISTANCES : R_DISTANCES).map((v) => (
                        <option key={v} value={v}>{day.paceKey === "T" ? `${v}'` : formatDist(v)}</option>
                      ))}
                    </select>
                  </div>
                  {day.paceKey !== "T" && (
                    <div style={{ minWidth: 80 }}>
                      <label className="block text-[9px] uppercase tracking-wide mb-1" style={{ color: COLORS.textMuted }}>Repeticiones</label>
                      <select value={day.repsOverride ?? ""} onChange={(e) => {
                          const next = { ...day, repsOverride: e.target.value ? Number(e.target.value) : null };
                          onChangeDay(index, { ...next, km: computeImpliedKm(next) });
                        }}
                        className="w-full rounded px-1.5 py-1 text-[11px]" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                        <option value="">Auto</option>
                        {(day.paceKey === "I" ? [2, 3, 4, 5, 6, 8, 10] : [6, 8, 10, 12, 14]).map((v) => (
                          <option key={v} value={v}>{v}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div style={{ minWidth: 90 }}>
                    <label className="block text-[9px] uppercase tracking-wide mb-1" style={{ color: COLORS.textMuted }}>Ritmo (m:ss)</label>
                    <input type="text" placeholder="Auto" value={day.paceOverrideStr ?? ""}
                      onChange={(e) => {
                        const str = e.target.value;
                        const parsed = parsePaceToDecimal(str);
                        const next = { ...day, paceOverrideStr: str, paceOverride: parsed };
                        onChangeDay(index, { ...next, km: computeImpliedKm(next) });
                      }}
                      className="w-full rounded px-1.5 py-1 text-[11px] font-mono" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
                  </div>
                  {day.paceKey !== "T" && (
                    <div style={{ minWidth: 90 }}>
                      <label className="block text-[9px] uppercase tracking-wide mb-1" style={{ color: COLORS.textMuted }}>Descanso (min)</label>
                      <input type="number" min="0" step="0.25" placeholder="Auto" value={day.recoveryOverride ?? ""}
                        onChange={(e) => {
                          const next = { ...day, recoveryOverride: e.target.value ? Number(e.target.value) : null };
                          onChangeDay(index, { ...next, km: computeImpliedKm(next) });
                        }}
                        className="w-full rounded px-1.5 py-1 text-[11px] font-mono" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
                    </div>
                  )}
                </div>
              )}
              {day.paceKey === "brokenT" && (
                <div className="col-span-2 flex flex-wrap gap-2 pt-1" style={{ borderTop: `1px dashed ${COLORS.border}` }}>
                  <div style={{ minWidth: 90 }}>
                    <label className="block text-[9px] uppercase tracking-wide mb-1" style={{ color: COLORS.textMuted }}>Duración pasada (min)</label>
                    <input type="number" min="1" step="1" value={day.distOverride ?? 8}
                      onChange={(e) => {
                        const next = { ...day, distOverride: e.target.value ? Number(e.target.value) : 8 };
                        onChangeDay(index, { ...next, km: computeImpliedKm(next) });
                      }}
                      className="w-full rounded px-1.5 py-1 text-[11px] font-mono" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
                  </div>
                  <div style={{ minWidth: 100 }}>
                    <label className="block text-[9px] uppercase tracking-wide mb-1" style={{ color: COLORS.textMuted }}>Umbral de referencia</label>
                    <select value={day.brokenTRefMin ?? 25}
                      onChange={(e) => {
                        const next = { ...day, brokenTRefMin: Number(e.target.value) };
                        onChangeDay(index, { ...next, km: computeImpliedKm(next) });
                      }}
                      className="w-full rounded px-1.5 py-1 text-[11px]" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                      {T_DURATIONS.map((v) => <option key={v} value={v}>{v}'</option>)}
                    </select>
                  </div>
                  <div style={{ minWidth: 90 }}>
                    <label className="block text-[9px] uppercase tracking-wide mb-1" style={{ color: COLORS.textMuted }}>Descanso (min)</label>
                    <input type="number" min="0" step="0.5" value={day.recoveryOverride ?? 3}
                      onChange={(e) => {
                        const next = { ...day, recoveryOverride: e.target.value ? Number(e.target.value) : 3 };
                        onChangeDay(index, { ...next, km: computeImpliedKm(next) });
                      }}
                      className="w-full rounded px-1.5 py-1 text-[11px] font-mono" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
                  </div>
                  <div style={{ minWidth: 90 }}>
                    <label className="block text-[9px] uppercase tracking-wide mb-1" style={{ color: COLORS.textMuted }}>Ritmo (m:ss)</label>
                    <input type="text" placeholder="Auto" value={day.paceOverrideStr ?? ""}
                      onChange={(e) => {
                        const str = e.target.value;
                        const parsed = parsePaceToDecimal(str);
                        onChangeDay(index, { ...day, paceOverrideStr: str, paceOverride: parsed });
                      }}
                      className="w-full rounded px-1.5 py-1 text-[11px] font-mono" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
                  </div>
                </div>
              )}
              {day.paceKey === "custom" && (
                <div className="col-span-2 flex flex-col gap-2 pt-1" style={{ borderTop: `1px dashed ${COLORS.border}` }}>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { key: "customWarmKm", label: "Calent. (km)", step: 0.5, def: 2 },
                      { key: "customCoolKm", label: "Enfr. (km)", step: 0.5, def: 2 },
                    ].map((f) => (
                      <div key={f.key} style={{ minWidth: 90 }}>
                        <label className="block text-[9px] uppercase tracking-wide mb-1" style={{ color: COLORS.textMuted }}>{f.label}</label>
                        <input type="number" min="0" step={f.step} value={day[f.key] ?? f.def}
                          onChange={(e) => {
                            const next = { ...day, [f.key]: e.target.value ? Number(e.target.value) : f.def };
                            onChangeDay(index, { ...next, km: computeImpliedKm(next) });
                          }}
                          className="w-full rounded px-1.5 py-1 text-[11px] font-mono" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
                      </div>
                    ))}
                  </div>
                  {getCustomBlocks(day).map((block, bi) => (
                    <div key={bi} className="flex flex-wrap items-end gap-2 rounded p-2" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}` }}>
                      <span className="text-[9px] uppercase tracking-wide" style={{ color: COLORS.textMuted, minWidth: 50 }}>Bloque {bi + 1}</span>
                      {[
                        { key: "reps", label: "Repeticiones", step: 1, def: 6 },
                        { key: "distKm", label: "Distancia (km)", step: 0.1, def: 0.4 },
                        { key: "recoveryMin", label: "Descanso (min)", step: 0.25, def: 2 },
                      ].map((f) => (
                        <div key={f.key} style={{ minWidth: 80 }}>
                          <label className="block text-[9px] uppercase tracking-wide mb-1" style={{ color: COLORS.textMuted }}>{f.label}</label>
                          <input type="number" min="0" step={f.step} value={block[f.key] ?? f.def}
                            onChange={(e) => {
                              const blocks = getCustomBlocks(day).map((b, i) => i === bi ? { ...b, [f.key]: e.target.value ? Number(e.target.value) : f.def } : b);
                              const next = { ...day, customBlocks: blocks };
                              onChangeDay(index, { ...next, km: computeImpliedKm(next) });
                            }}
                            className="w-full rounded px-1.5 py-1 text-[11px] font-mono" style={{ background: COLORS.surface, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
                        </div>
                      ))}
                      <div style={{ minWidth: 80 }}>
                        <label className="block text-[9px] uppercase tracking-wide mb-1" style={{ color: COLORS.textMuted }}>Ritmo (m:ss)</label>
                        <input type="text" placeholder="Ej: 4:00" value={block.paceStr ?? ""}
                          onChange={(e) => {
                            const blocks = getCustomBlocks(day).map((b, i) => i === bi ? { ...b, paceStr: e.target.value } : b);
                            onChangeDay(index, { ...day, customBlocks: blocks });
                          }}
                          className="w-full rounded px-1.5 py-1 text-[11px] font-mono" style={{ background: COLORS.surface, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
                      </div>
                      {getCustomBlocks(day).length > 1 && (
                        <button onClick={() => {
                            const blocks = getCustomBlocks(day).filter((_, i) => i !== bi);
                            const next = { ...day, customBlocks: blocks };
                            onChangeDay(index, { ...next, km: computeImpliedKm(next) });
                          }}
                          className="px-2 py-1 rounded text-[10px]" style={{ background: COLORS.surface, color: COLORS.track, border: `1px solid ${COLORS.track}` }}>
                          Quitar
                        </button>
                      )}
                    </div>
                  ))}
                  <button onClick={() => {
                      const blocks = [...getCustomBlocks(day), { reps: 6, distKm: 0.4, paceStr: "", recoveryMin: 2 }];
                      const next = { ...day, customBlocks: blocks };
                      onChangeDay(index, { ...next, km: computeImpliedKm(next) });
                    }}
                    className="self-start px-2 py-1 rounded text-[10px] font-semibold" style={{ background: COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                    + Agregar bloque
                  </button>
                  <div className="w-full">
                    <label className="block text-[9px] uppercase tracking-wide mb-1" style={{ color: COLORS.textMuted }}>Nota / instrucciones adicionales</label>
                    <input type="text" placeholder="Cualquier detalle extra para el alumno" value={day.customNote ?? ""}
                      onChange={(e) => onChangeDay(index, { ...day, customNote: e.target.value })}
                      className="w-full rounded px-2 py-1 text-[11px]" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
                  </div>
                </div>
              )}
              {day.paceKey === "long" && (
                <div className="col-span-2 pt-1" style={{ borderTop: `1px dashed ${COLORS.border}` }}>
                  <div className="grid grid-cols-4 gap-1 text-[9px] uppercase tracking-wide mb-1" style={{ color: COLORS.textMuted }}>
                    <span>Paso</span><span>Km</span><span>Ritmo</span><span></span>
                  </div>
                  {[
                    { key: "warm", label: "Calent." },
                    { key: "body", label: "Bloque principal" },
                    ...(day.longProgressive ? [{ key: "close", label: "Cierre fuerte" }] : []),
                    { key: "cool", label: "Enfr." },
                  ].map((step) => {
                    const ov = day.longOverrides || {};
                    const kmKey = `${step.key}Km`, paceKey2 = `${step.key}Pace`;
                    return (
                      <div key={step.key} className="grid grid-cols-4 gap-1 mb-1 items-center">
                        <span className="text-[10px]" style={{ color: COLORS.textMuted }}>{step.label}</span>
                        <input type="number" min="0" step="0.5" placeholder="Auto" value={ov[kmKey] ?? ""}
                          onChange={(e) => onChangeDay(index, { ...day, longOverrides: { ...ov, [kmKey]: e.target.value ? Number(e.target.value) : null } })}
                          className="rounded px-1 py-1 text-[10px] font-mono" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
                        <input type="text" placeholder="Auto" value={ov[`${step.key}PaceStr`] ?? ""}
                          onChange={(e) => {
                            const str = e.target.value;
                            const parsed = parsePaceToDecimal(str);
                            onChangeDay(index, { ...day, longOverrides: { ...ov, [`${step.key}PaceStr`]: str, [paceKey2]: parsed } });
                          }}
                          className="rounded px-1 py-1 text-[10px] font-mono" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
                        <span />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            !isRest && (
              <div className="mt-1 flex items-center gap-2 flex-wrap">
                <span className="text-lg font-semibold" style={{ fontFamily: "'JetBrains Mono', monospace", color: COLORS.lane }}>{day.km} km</span>
                <span className="text-xs" style={{ color: zoneColor }}>
                  {day.paceKey && getRepresentativePace(day) ? `${PACE_KEY_LABEL[day.paceKey]} · ${formatPace(getRepresentativePace(day))}/km` : PACE_KEY_LABEL[day.paceKey] || ""}
                </span>
              </div>
            )
          )}
          {isRest && mode !== "edit" && (
            <div className="mt-1 text-xs" style={{ color: COLORS.textMuted }}>
              {mode === "log"
                ? (index === (isRaceGoal ? 6 : 0)
                    ? "Hoy toca descanso — es parte del plan, aprovecha para estirar y recuperar."
                    : "Hoy toca descanso, pero puedes aprovechar para fortalecer.")
                : "Descanso"}
            </div>
          )}
          {!isRest && <div className="mt-2"><SessionBarChart day={day} /></div>}
          {!isRest && <SessionDetail segments={detail} />}
          {!isRest && <DatosDelReloj reloj={log?.reloj} day={day} esCoach={esCoach} />}
          <SalidasAdicionales extras={extras} esCoach={esCoach} />

          {mode === "log" && !isRest && (
            <div className="mt-3 pt-3 space-y-2" style={{ borderTop: `1px dashed ${COLORS.border}` }}>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: COLORS.textMuted }}>
                  <input type="checkbox" checked={!!log?.completed} onChange={(e) => onChangeLog(index, { ...log, completed: e.target.checked }, true)} style={{ accentColor: COLORS.track }} />
                  Sesión completada
                </label>
                <div className="flex items-center gap-2">
                  {!log?.completed && onMoveSession && (
                    <>
                      {onMoveSession.canMove(index, index - 1) && (
                        <button type="button" onClick={() => onMoveSession.move(index, index - 1)}
                          title="Adelantar esta sesión un día"
                          className="flex items-center text-xs px-1.5 py-1 rounded" style={{ background: COLORS.bg, color: COLORS.textMuted, border: `1px solid ${COLORS.border}` }}>
                          <ChevronLeft size={11} />
                        </button>
                      )}
                      {onMoveSession.canMove(index, index + 1) && (
                        <button type="button" onClick={() => onMoveSession.move(index, index + 1)}
                          title="Aplazar esta sesión un día"
                          className="flex items-center text-xs px-1.5 py-1 rounded" style={{ background: COLORS.bg, color: COLORS.textMuted, border: `1px solid ${COLORS.border}` }}>
                          <ChevronRight size={11} />
                        </button>
                      )}
                    </>
                  )}
                  {!log?.completed && onStartLive && (
                    <button type="button" onClick={() => onStartLive(index)}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded" style={{ background: COLORS.bg, color: COLORS.track, border: `1px solid ${COLORS.track}55` }}>
                      <Activity size={11} /> Iniciar
                    </button>
                  )}
                  <button type="button"
                    onClick={() => onChangeLog(index, { ...log, completed: true, actualKm: day.km, actualPaceStr: log?.actualPaceStr || (getRepresentativePace(day) ? formatPace(getRepresentativePace(day)) : "") }, true)}
                    className="text-xs px-2 py-1 rounded" style={{ background: COLORS.bg, color: COLORS.easy, border: `1px solid ${COLORS.easy}55` }}>
                    ✓ Tal cual estaba planeado
                  </button>
                </div>
              </div>
              <div className={`grid gap-2 ${["R", "I", "T"].includes(day.paceKey) ? "grid-cols-3" : "grid-cols-2"}`}>
                <div>
                  <label className="block text-[10px] uppercase tracking-wide mb-1" style={{ color: COLORS.textMuted }}>Km reales</label>
                  <input type="number" min="0" step="0.1" placeholder="0" value={log?.actualKm ?? ""}
                    onChange={(e) => onChangeLog(index, { ...log, actualKm: e.target.value })}
                    className="w-full rounded px-2 py-1 text-sm font-mono" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
                </div>
                {["R", "I", "T"].includes(day.paceKey) && (
                  <div>
                    <label className="block text-[10px] uppercase tracking-wide mb-1" style={{ color: COLORS.textMuted }}>Ritmo real</label>
                    <input type="text" placeholder="5:30" value={log?.actualPaceStr ?? ""}
                      onChange={(e) => onChangeLog(index, { ...log, actualPaceStr: e.target.value })}
                      className="w-full rounded px-2 py-1 text-sm font-mono" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
                  </div>
                )}
                <div>
                  <label className="block text-[10px] uppercase tracking-wide mb-1" style={{ color: COLORS.textMuted }}>RPE (1–10)</label>
                  <input type="number" min="1" max="10" placeholder="—" value={log?.rpe ?? ""}
                    onChange={(e) => onChangeLog(index, { ...log, rpe: e.target.value })}
                    className="w-full rounded px-2 py-1 text-sm font-mono" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
                </div>
              </div>
              {["R", "I", "T"].includes(day.paceKey) && (
                <p className="text-[10px]" style={{ color: COLORS.textMuted }}>
                  El ritmo real es solo del {day.paceKey === "T" ? "bloque de umbral" : "bloque de series/intervalos"} — no cuentes el warm-up, cool-down ni los descansos.
                </p>
              )}
              <p className="text-[10px]" style={{ color: COLORS.textMuted }}>
                {log?.reloj
                  ? "Tu reloj ya anotó los kilómetros y el ritmo. Lo único que falta es tu RPE: eso no lo mide ningún sensor."
                  : "RPE = Índice de Esfuerzo Percibido."}
              </p>
              {(() => {
                const diff = paceDiffLabel(log?.actualPaceStr, getRepresentativePace(day));
                return diff ? <div className="text-xs" style={{ color: diff.color }}>Ritmo real: {diff.text}</div> : null;
              })()}
              <input type="text" placeholder="Nota (opcional)" value={log?.note ?? ""}
                onChange={(e) => onChangeLog(index, { ...log, note: e.target.value })}
                className="w-full rounded px-2 py-1 text-xs" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
            </div>
          )}
          {mode === "view" && !isRest && log?.completed && (
            <div className="mt-2 text-xs" style={{ color: COLORS.textMuted }}>
              Real: {log.actualKm || "—"} km · Ritmo: {log.actualPaceStr || "—"} · RPE {log.rpe || "—"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   AUTH GATES
--------------------------------------------------------- */
const COACH_SETUP_CODE = "TROTAMUNDOS-JK"; // solo tú deberías conocer este código

function CoachGate({ onSuccess, onBack }) {
  const [mode, setMode] = useState("loading");
  const [setupVerified, setSetupVerified] = useState(false);
  const [setupCode, setSetupCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { authStatus().then((r) => setMode(r.coachConfigured ? "enter" : "set")); }, []);

  const verifySetup = () => {
    if (setupCode !== COACH_SETUP_CODE) return setError("Código de configuración incorrecto.");
    setError("");
    setSetupVerified(true);
  };
  const handleSet = async () => {
    if (password.length < 6) return setError("La contraseña debe tener al menos 6 caracteres.");
    if (password !== confirm) return setError("Las contraseñas no coinciden.");
    const r = await coachSetup(setupCode, password);
    if (r.ok) onSuccess();
    else setError(r.error || "No se pudo configurar la contraseña.");
  };
  const handleEnter = async () => {
    const r = await coachLogin(password);
    if (r.ok) onSuccess();
    else setError(r.error || "Contraseña incorrecta.");
  };

  return (
    <div className="max-w-sm mx-auto px-4 py-20">
      <button onClick={onBack} className="mb-6 p-2 rounded-lg" style={{ color: COLORS.textMuted }}><ArrowLeft size={18} /></button>
      <div className="text-center mb-6">
        <Lock size={24} style={{ color: COLORS.track, margin: "0 auto" }} />
        <div className="mt-2 text-lg font-semibold" style={{ fontFamily: "'Oswald', sans-serif", color: COLORS.textPrimary }}>
          {mode === "set" ? (setupVerified ? "Crea tu contraseña de coach" : "Código de configuración") : "Acceso del coach"}
        </div>
      </div>
      {mode === "set" && !setupVerified && (
        <div className="space-y-3">
          <p className="text-xs text-center" style={{ color: COLORS.textMuted }}>Aún no hay contraseña de coach configurada. Ingresa el código de configuración para poder crearla.</p>
          <input type="password" placeholder="Código de configuración" value={setupCode} onChange={(e) => setSetupCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && verifySetup()}
            className="w-full rounded-lg px-3 py-2.5 text-sm" style={{ background: COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
          {error && <p className="text-xs" style={{ color: COLORS.track }}>{error}</p>}
          <button onClick={verifySetup} className="w-full py-2.5 rounded-lg text-sm font-semibold" style={{ background: COLORS.track, color: COLORS.lane }}>Continuar</button>
        </div>
      )}
      {mode !== "loading" && (mode === "enter" || setupVerified) && (
        <div className="space-y-3">
          <input type="password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (mode === "set" ? handleSet() : handleEnter())}
            className="w-full rounded-lg px-3 py-2.5 text-sm" style={{ background: COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
          {mode === "set" && (
            <input type="password" placeholder="Confirma la contraseña" value={confirm} onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSet()}
              className="w-full rounded-lg px-3 py-2.5 text-sm" style={{ background: COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
          )}
          {error && <p className="text-xs" style={{ color: COLORS.track }}>{error}</p>}
          <button onClick={mode === "set" ? handleSet : handleEnter}
            className="w-full py-2.5 rounded-lg text-sm font-semibold" style={{ background: COLORS.track, color: COLORS.lane }}>
            {mode === "set" ? "Guardar y entrar" : "Entrar"}
          </button>
        </div>
      )}
    </div>
  );
}

function StudentGate({ roster, onSuccess, onBack }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const filtered = search.trim() ? roster.filter((r) => r.name.toLowerCase().includes(search.toLowerCase())) : [];

  const handleEnter = async () => {
    // El PIN se verifica en el servidor — el navegador ya no recibe los datos del alumno
    // antes de comprobar la identidad.
    const r = await studentLogin(selected.id, pin);
    if (r.ok) {
      await safeSetPersonal("rememberedStudent", { id: selected.id });
      onSuccess(selected.id);
    } else setError(r.error === "PIN incorrecto" ? "PIN incorrecto." : (r.error || "No se pudo ingresar."));
  };

  return (
    <div className="max-w-sm mx-auto px-4 py-16">
      <button onClick={() => (selected ? setSelected(null) : onBack())} className="mb-6 p-2 rounded-lg" style={{ color: COLORS.textMuted }}><ArrowLeft size={18} /></button>
      {!selected ? (
        <>
          <div className="text-center mb-6">
            <User size={24} style={{ color: COLORS.track, margin: "0 auto" }} />
            <div className="mt-2 text-lg font-semibold" style={{ fontFamily: "'Oswald', sans-serif", color: COLORS.textPrimary }}>Busca tu nombre</div>
          </div>
          <div className="relative mb-4">
            <Search size={16} style={{ position: "absolute", left: 12, top: 12, color: COLORS.textMuted }} />
            <input type="text" placeholder="Tu nombre" value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 rounded-lg text-sm" style={{ background: COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
          </div>
          {roster.length === 0 && <p className="text-sm" style={{ color: COLORS.textMuted }}>Tu coach todavía no te ha registrado.</p>}
          {roster.length > 0 && !search.trim() && <p className="text-sm" style={{ color: COLORS.textMuted }}>Escribe tu nombre para encontrarte.</p>}
          {roster.length > 0 && search.trim() && filtered.length === 0 && <p className="text-sm" style={{ color: COLORS.textMuted }}>Sin resultados para "{search}".</p>}
          <div className="space-y-2">
            {filtered.map((r) => (
              <button key={r.id} onClick={() => setSelected(r)} className="w-full text-left rounded-lg p-3 flex items-center justify-between"
                style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}>
                <span className="text-sm font-semibold" style={{ color: COLORS.textPrimary }}>{r.name}</span>
                <ChevronRight size={14} style={{ color: COLORS.textMuted }} />
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="text-center mb-6">
            <KeyRound size={24} style={{ color: COLORS.track, margin: "0 auto" }} />
            <div className="mt-2 text-lg font-semibold" style={{ fontFamily: "'Oswald', sans-serif", color: COLORS.textPrimary }}>Hola, {selected.name}</div>
            <p className="text-xs mt-1" style={{ color: COLORS.textMuted }}>Ingresa el PIN que te dio tu coach.</p>
          </div>
          <input type="password" inputMode="numeric" maxLength={4} placeholder="PIN de 4 dígitos" value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && handleEnter()}
            className="w-full rounded-lg px-3 py-2.5 text-sm text-center tracking-[0.5em]"
            style={{ background: COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
          {error && <p className="text-xs mt-2" style={{ color: COLORS.track }}>{error}</p>}
          <button onClick={handleEnter} className="w-full mt-3 py-2.5 rounded-lg text-sm font-semibold" style={{ background: COLORS.track, color: COLORS.lane }}>Entrar</button>
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   COACH DASHBOARD — piezas auxiliares
--------------------------------------------------------- */
// Debajo del campo de tiempo objetivo, cómo lo entendió la app. Así el coach ve al
// instante si "3:20" quedó como 3 h 20 min, antes de crear un plan con eso.
function LecturaDelTiempo({ texto, goal }) {
  if (!texto || !String(texto).trim()) return null;
  const leido = interpretarTiempoObjetivo(texto, DISTANCE_KM[goal]);
  return (
    <p className="text-xs mt-1" style={{ color: leido ? COLORS.easy : COLORS.textMuted }}>
      {leido
        ? `= ${leido.lectura} · ritmo ${formatPace(leido.ritmo)}/km`
        : "Todavía no lo entiendo: escribí 3:20 o 3:20:00 para 3 h 20 min, o 45:00 para 45 min."}
    </p>
  );
}

function ChangeGoalForm({ student, onCancel, onSave, busy }) {
  const [goal, setGoal] = useState(student.goal);
  const [level, setLevel] = useState(student.level);
  const [raceDate, setRaceDate] = useState(student.raceDate || "");
  const [raceDateText, setRaceDateText] = useState(formatISOToDDMMYY(student.raceDate));
  const [goalInputMode, setGoalInputMode] = useState("pace");
  const [targetPaceStr, setTargetPaceStr] = useState(student.targetPaceStr || "");
  const [targetTimeStr, setTargetTimeStr] = useState("");
  const [peakKmOverride, setPeakKmOverride] = useState("");
  const [applyTiming, setApplyTiming] = useState("current"); // "current" | "next"
  const [error, setError] = useState("");
  const needsRaceInfo = !isFitnessGoal(goal);
  const goalOptions = GOALS.filter((g) => !isFitnessGoal(g.id) || FITNESS_GOAL_LEVELS.includes(level));
  // Si el nivel elegido ya no admite el objetivo actual (ej. pasar a un nivel sin planes de
  // fitness), se corrige solo para no quedar en una combinación imposible.
  useEffect(() => {
    if (!goalOptions.some((g) => g.id === goal)) setGoal(goalOptions[0]?.id ?? goal);
  }, [level]);

  const submit = () => {
    let finalPaceStr = targetPaceStr;
    if (needsRaceInfo) {
      if (!raceDate) return setError("Ingresa una fecha de carrera válida (dd/mm/aa).");
      if (goalInputMode === "time") {
        const leido = interpretarTiempoObjetivo(targetTimeStr, DISTANCE_KM[goal]);
        if (!leido) return setError("No entendí ese tiempo para esta distancia. Escribilo como 3:20 o 3:20:00 para 3 h 20 min, o 45:00 para 45 min.");
        finalPaceStr = formatPace(leido.ritmo);
      } else if (parsePaceToDecimal(targetPaceStr) === null) {
        return setError("Ritmo objetivo inválido. Usa el formato m:ss, ej. 5:30.");
      }
    }
    const peakKmManual = peakKmOverride.trim() !== "" ? Number(peakKmOverride) : null;
    if (peakKmManual != null && (isNaN(peakKmManual) || peakKmManual <= 0)) return setError("El km pico debe ser un número positivo.");
    setError("");
    onSave({ goal, level, raceDate: needsRaceInfo ? raceDate : null, targetPaceStr: needsRaceInfo ? finalPaceStr : null, peakKmOverride: peakKmManual, applyTiming });
  };

  return (
    <div className="rounded-xl p-4 mb-4" style={{ background: COLORS.surface2, border: `1px solid ${COLORS.track}` }}>
      <div className="text-sm font-semibold mb-1" style={{ color: COLORS.textPrimary, fontFamily: "'Oswald', sans-serif" }}>CAMBIAR OBJETIVO</div>
      <p className="text-xs mb-3" style={{ color: COLORS.textMuted }}>Se mantiene el historial — el plan se regenera según el nuevo objetivo.</p>
      <div className="mb-3">
        <label className="block text-[10px] uppercase tracking-wide mb-1" style={{ color: COLORS.textMuted }}>¿Cuándo aplica el cambio?</label>
        <select value={applyTiming} onChange={(e) => setApplyTiming(e.target.value)}
          className="w-full rounded px-3 py-2 text-sm" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
          <option value="current">Esta semana (reemplaza la semana en curso)</option>
          <option value="next">La próxima semana (la actual queda como está)</option>
        </select>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] uppercase tracking-wide mb-1" style={{ color: COLORS.textMuted }}>Objetivo</label>
          <select value={goal} onChange={(e) => setGoal(e.target.value)} className="w-full rounded px-3 py-2 text-sm" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
            {goalOptions.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wide mb-1" style={{ color: COLORS.textMuted }}>
            Nivel {level !== student.level && <span style={{ color: COLORS.track }}>· cambia de {LEVELS.find((l) => l.id === student.level)?.days} a {LEVELS.find((l) => l.id === level)?.days} días</span>}
          </label>
          <select value={level} onChange={(e) => setLevel(e.target.value)} className="w-full rounded px-3 py-2 text-sm" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
            {LEVELS.map((l) => <option key={l.id} value={l.id}>{l.label} · {l.days}x/sem</option>)}
          </select>
        </div>
        {needsRaceInfo && (
          <>
            <div>
              <label className="block text-[10px] uppercase tracking-wide mb-1" style={{ color: COLORS.textMuted }}>Fecha objetivo (carrera)</label>
              <div className="flex gap-1.5">
                <input type="text" placeholder="dd/mm/aa" value={raceDateText}
                  onChange={(e) => { setRaceDateText(e.target.value); setRaceDate(parseDDMMYYToISO(e.target.value) || ""); }}
                  className="flex-1 min-w-0 rounded px-3 py-2 text-sm font-mono" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
                <input type="date" value={raceDate || ""} aria-label="Elegir fecha en calendario"
                  onChange={(e) => { const iso = e.target.value; setRaceDate(iso); setRaceDateText(iso ? formatISOToDDMMYY(iso) : ""); }}
                  className="w-11 rounded text-sm" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}`, colorScheme: "dark" }} />
              </div>
            </div>
            <div className="sm:col-span-2">
              <div className="flex items-center gap-3 mb-1">
                <label className="text-[10px] uppercase tracking-wide" style={{ color: COLORS.textMuted }}>Objetivo como:</label>
                <label className="flex items-center gap-1 text-xs cursor-pointer" style={{ color: COLORS.textMuted }}>
                  <input type="radio" checked={goalInputMode === "pace"} onChange={() => setGoalInputMode("pace")} style={{ accentColor: COLORS.track }} /> Ritmo
                </label>
                <label className="flex items-center gap-1 text-xs cursor-pointer" style={{ color: COLORS.textMuted }}>
                  <input type="radio" checked={goalInputMode === "time"} onChange={() => setGoalInputMode("time")} style={{ accentColor: COLORS.track }} /> Tiempo total
                </label>
              </div>
              {goalInputMode === "pace" ? (
                <input type="text" placeholder="5:30 (min:seg / km)" value={targetPaceStr} onChange={(e) => setTargetPaceStr(e.target.value)}
                  className="w-full rounded px-3 py-2 text-sm font-mono" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
              ) : (
                <>
                  <input type="text" placeholder={DISTANCE_KM[goal] >= 21 ? "3:20 o 3:20:00 (horas:minutos)" : "45:00 (minutos:segundos)"}
                    value={targetTimeStr} onChange={(e) => setTargetTimeStr(e.target.value)}
                    className="w-full rounded px-3 py-2 text-sm font-mono" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
                  <LecturaDelTiempo texto={targetTimeStr} goal={goal} />
                </>
              )}
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[10px] uppercase tracking-wide mb-1" style={{ color: COLORS.textMuted }}>Km pico semanal (opcional, deja vacío para recalcular)</label>
              <input type="number" min="1" step="1" placeholder={`Actual: ${student.peakKm} km`} value={peakKmOverride} onChange={(e) => setPeakKmOverride(e.target.value)}
                className="w-full rounded px-3 py-2 text-sm font-mono" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
            </div>
          </>
        )}
      </div>
      {error && <p className="text-xs mt-2" style={{ color: COLORS.track }}>{error}</p>}
      <div className="flex justify-end gap-2 mt-3">
        <button onClick={onCancel} className="px-3 py-1.5 rounded text-sm" style={{ color: COLORS.textMuted }}>Cancelar</button>
        <button onClick={submit} disabled={busy} className="px-4 py-1.5 rounded text-sm font-semibold" style={{ background: COLORS.track, color: COLORS.lane }}>Guardar nuevo objetivo</button>
      </div>
    </div>
  );
}

function AddStudentForm({ onCancel, onCreate }) {
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("42k");
  const [level, setLevel] = useState("intermedio1");
  const [pin, setPin] = useState("");
  const [raceDate, setRaceDate] = useState("");
  const [raceDateText, setRaceDateText] = useState("");
  const [goalInputMode, setGoalInputMode] = useState("pace");
  const [targetPaceStr, setTargetPaceStr] = useState("");
  const [targetTimeStr, setTargetTimeStr] = useState("");
  const [peakKmOverride, setPeakKmOverride] = useState("");
  const [fitnessStartWeek, setFitnessStartWeek] = useState(16);
  const [customTrainDays, setCustomTrainDays] = useState([0, 2, 5]); // Lun, Mié, Sáb por defecto
  const [planTiming, setPlanTiming] = useState("current"); // "current" | "next"
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const needsRaceInfo = !isFitnessGoal(goal);
  const levelOptions = isFitnessGoal(goal) ? LEVELS.filter((l) => FITNESS_GOAL_LEVELS.includes(l.id)) : LEVELS;
  useEffect(() => {
    if (!levelOptions.some((l) => l.id === level)) setLevel(levelOptions[0].id);
  }, [goal]); // eslint-disable-line

  let suggestedPeak = null;
  if (needsRaceInfo) {
    const effectivePaceStr = goalInputMode === "time"
      ? (interpretarTiempoObjetivo(targetTimeStr, DISTANCE_KM[goal]) ? formatPace(interpretarTiempoObjetivo(targetTimeStr, DISTANCE_KM[goal]).ritmo) : null)
      : targetPaceStr;
    const paceDecimal = parsePaceToDecimal(effectivePaceStr);
    if (paceDecimal != null) suggestedPeak = computePeakKm(goal, level, computeVDOT(DISTANCE_KM[goal], paceDecimal));
  }

  const submit = () => {
    if (submitting) return; // evita doble creación si se toca el botón dos veces seguidas
    if (!name.trim()) return setError("Ingresa el nombre del alumno.");
    if (!/^\d{4}$/.test(pin)) return setError("El PIN debe tener exactamente 4 dígitos.");
    let finalPaceStr = targetPaceStr;
    if (needsRaceInfo) {
      if (!raceDate) return setError("Ingresa una fecha de carrera válida (dd/mm/aa).");
      if (goalInputMode === "time") {
        const leido = interpretarTiempoObjetivo(targetTimeStr, DISTANCE_KM[goal]);
        if (!leido) return setError("No entendí ese tiempo para esta distancia. Escribilo como 3:20 o 3:20:00 para 3 h 20 min, o 45:00 para 45 min.");
        finalPaceStr = formatPace(leido.ritmo);
      } else if (parsePaceToDecimal(targetPaceStr) === null) {
        return setError("Ritmo objetivo inválido. Usa el formato m:ss, ej. 5:30.");
      }
    }
    const peakKmManual = peakKmOverride.trim() !== "" ? Number(peakKmOverride) : null;
    if (peakKmManual != null && (isNaN(peakKmManual) || peakKmManual <= 0)) return setError("El km pico debe ser un número positivo.");
    if (level === "principiante" && customTrainDays.length !== 3) return setError("Elige exactamente 3 días de entrenamiento.");
    setError("");
    setSubmitting(true);
    onCreate({ name: name.trim(), goal, level, pin, raceDate: needsRaceInfo ? raceDate : null, targetPaceStr: needsRaceInfo ? finalPaceStr : null, peakKmOverride: peakKmManual, fitnessStartWeek: isFitnessGoal(goal) ? fitnessStartWeek : null, planTiming, trainDays: customTrainDays });
  };

  return (
    <div className="rounded-xl p-4 mb-4" style={{ background: COLORS.surface2, border: `1px solid ${COLORS.border}` }}>
      <div className="text-sm font-semibold mb-3" style={{ color: COLORS.textPrimary, fontFamily: "'Oswald', sans-serif" }}>NUEVO ALUMNO</div>
      <div className="grid sm:grid-cols-2 gap-3">
        <input type="text" placeholder="Nombre del alumno" value={name} onChange={(e) => setName(e.target.value)}
          className="rounded px-3 py-2 text-sm sm:col-span-2" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
        <div className="sm:col-span-2">
          <label className="block text-[10px] uppercase tracking-wide mb-1" style={{ color: COLORS.textMuted }}>¿Cuándo empieza el plan?</label>
          <select value={planTiming} onChange={(e) => setPlanTiming(e.target.value)}
            className="w-full rounded px-3 py-2 text-sm" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
            <option value="current">Esta semana (en curso)</option>
            <option value="next">La próxima semana</option>
          </select>
        </div>
        <select value={goal} onChange={(e) => setGoal(e.target.value)} className="rounded px-3 py-2 text-sm" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
          {GOALS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
        </select>
        <select value={level} onChange={(e) => setLevel(e.target.value)} className="rounded px-3 py-2 text-sm" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
          {levelOptions.map((l) => <option key={l.id} value={l.id}>{l.label} · {l.days}x/sem</option>)}
        </select>
        {isFitnessGoal(goal) && (
          <div className="sm:col-span-2">
            <label className="block text-[10px] uppercase tracking-wide mb-1" style={{ color: COLORS.textMuted }}>
              Semana de inicio (cuenta regresiva hacia el objetivo final)
            </label>
            <select value={fitnessStartWeek} onChange={(e) => setFitnessStartWeek(Number(e.target.value))}
              className="w-full rounded px-3 py-2 text-sm" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
              {Array.from({ length: 15 }, (_, i) => 16 - i).map((w) => (
                <option key={w} value={w}>Semana {w}{w === 16 ? " (desde el inicio)" : ""}</option>
              ))}
            </select>
          </div>
        )}
        {level === "principiante" && (
          <div className="sm:col-span-2">
            <label className="block text-[10px] uppercase tracking-wide mb-1" style={{ color: COLORS.textMuted }}>
              Elige los 3 días de entrenamiento ({customTrainDays.length}/3 elegidos)
            </label>
            <div className="flex gap-1.5 flex-wrap">
              {DAYS.map((d, i) => {
                const selected = customTrainDays.includes(i);
                return (
                  <button key={i} type="button"
                    onClick={() => {
                      if (selected) setCustomTrainDays(customTrainDays.filter((x) => x !== i));
                      else if (customTrainDays.length < 3) setCustomTrainDays([...customTrainDays, i].sort((a, b) => a - b));
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                    style={{ background: selected ? COLORS.track : COLORS.bg, color: COLORS.lane, border: `1px solid ${selected ? COLORS.track : COLORS.border}` }}>
                    {d}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {needsRaceInfo && (
          <>
            <div>
              <label className="block text-[10px] uppercase tracking-wide mb-1" style={{ color: COLORS.textMuted }}>Fecha objetivo (carrera)</label>
              <div className="flex gap-1.5">
                <input type="text" placeholder="dd/mm/aa" value={raceDateText}
                  onChange={(e) => { setRaceDateText(e.target.value); setRaceDate(parseDDMMYYToISO(e.target.value) || ""); }}
                  className="flex-1 min-w-0 rounded px-3 py-2 text-sm font-mono" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
                <input type="date" value={raceDate || ""} aria-label="Elegir fecha en calendario"
                  onChange={(e) => { const iso = e.target.value; setRaceDate(iso); setRaceDateText(iso ? formatISOToDDMMYY(iso) : ""); }}
                  className="w-11 rounded text-sm" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}`, colorScheme: "dark" }} />
              </div>
            </div>
            <div className="sm:col-span-2">
              <div className="flex items-center gap-3 mb-1">
                <label className="text-[10px] uppercase tracking-wide" style={{ color: COLORS.textMuted }}>Objetivo como:</label>
                <label className="flex items-center gap-1 text-xs cursor-pointer" style={{ color: COLORS.textMuted }}>
                  <input type="radio" checked={goalInputMode === "pace"} onChange={() => setGoalInputMode("pace")} style={{ accentColor: COLORS.track }} /> Ritmo
                </label>
                <label className="flex items-center gap-1 text-xs cursor-pointer" style={{ color: COLORS.textMuted }}>
                  <input type="radio" checked={goalInputMode === "time"} onChange={() => setGoalInputMode("time")} style={{ accentColor: COLORS.track }} /> Tiempo total
                </label>
              </div>
              {goalInputMode === "pace" ? (
                <input type="text" placeholder="5:30 (min:seg / km)" value={targetPaceStr} onChange={(e) => setTargetPaceStr(e.target.value)}
                  className="w-full rounded px-3 py-2 text-sm font-mono" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
              ) : (
                <>
                  <input type="text" placeholder={DISTANCE_KM[goal] >= 21 ? "3:20 o 3:20:00 (horas:minutos)" : "45:00 (minutos:segundos)"}
                    value={targetTimeStr} onChange={(e) => setTargetTimeStr(e.target.value)}
                    className="w-full rounded px-3 py-2 text-sm font-mono" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
                  <LecturaDelTiempo texto={targetTimeStr} goal={goal} />
                </>
              )}
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[10px] uppercase tracking-wide mb-1" style={{ color: COLORS.textMuted }}>
                Km pico semanal (semana de mayor carga de todo el ciclo)
              </label>
              <input type="number" min="1" step="1" placeholder={suggestedPeak ? `Sugerido: ${suggestedPeak} km (según ritmo y nivel)` : "Ej. 90"}
                value={peakKmOverride} onChange={(e) => setPeakKmOverride(e.target.value)}
                className="w-full rounded px-3 py-2 text-sm font-mono" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
              <p className="text-[10px] mt-1" style={{ color: COLORS.textMuted }}>
                Déjalo vacío para usar el valor sugerido automáticamente. Ninguna semana del plan superará este número.
              </p>
            </div>
          </>
        )}
        <input type="text" inputMode="numeric" maxLength={4} placeholder="PIN de acceso (4 dígitos)" value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          className="rounded px-3 py-2 text-sm sm:col-span-2" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
      </div>
      {error && <p className="text-xs mt-2" style={{ color: COLORS.track }}>{error}</p>}
      <div className="flex justify-end gap-2 mt-3">
        <button onClick={onCancel} className="px-3 py-1.5 rounded text-sm" style={{ color: COLORS.textMuted }}>Cancelar</button>
        <button onClick={submit} disabled={submitting} className="px-4 py-1.5 rounded text-sm font-semibold disabled:opacity-50" style={{ background: COLORS.track, color: COLORS.lane }}>
          {submitting ? "Creando…" : "Crear alumno"}
        </button>
      </div>
    </div>
  );
}

function ProposalPanel({ proposal, values, setValues, onConfirm, onCancel, busy, weekDateRange }) {
  if (proposal.kind === "principiante") {
    return (
      <div className="rounded-xl p-4 mb-4" style={{ background: COLORS.surface2, border: `1px solid ${COLORS.track}` }}>
        <div className="text-sm font-semibold mb-1" style={{ color: COLORS.textPrimary, fontFamily: "'Oswald', sans-serif" }}>PROPUESTA DE LA PRÓXIMA SEMANA</div>
        {weekDateRange && <div className="text-xs mb-2" style={{ color: COLORS.track, fontFamily: "'JetBrains Mono', monospace" }}>{weekDateRange}</div>}
        <p className="text-xs mb-3" style={{ color: COLORS.textMuted }}>
          {proposal.wasPaused
            ? "La semana anterior estuvo pausada (lesión/viaje): se repetirá la misma etapa al retomar, sin subir la carga."
            : "Se avanzará o mantendrá la etapa de acondicionamiento según la adherencia registrada."}
        </p>
        <div className="flex gap-2">
          <button onClick={() => onConfirm()} disabled={busy} className="px-4 py-1.5 rounded text-sm font-semibold" style={{ background: COLORS.track, color: COLORS.lane }}>Confirmar y generar</button>
          <button onClick={onCancel} className="px-3 py-1.5 rounded text-sm" style={{ color: COLORS.textMuted }}>Cancelar</button>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-xl p-4 mb-4" style={{ background: COLORS.surface2, border: `1px solid ${COLORS.track}` }}>
      <div className="text-sm font-semibold mb-1" style={{ color: COLORS.textPrimary, fontFamily: "'Oswald', sans-serif" }}>PROPUESTA DE LA PRÓXIMA SEMANA</div>
      {weekDateRange && <div className="text-xs mb-2" style={{ color: COLORS.track, fontFamily: "'JetBrains Mono', monospace" }}>{weekDateRange}</div>}
      <p className="text-xs mb-3" style={{ color: COLORS.textMuted }}>{proposal.note}</p>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] uppercase tracking-wide mb-1" style={{ color: COLORS.textMuted }}>Km totales de la semana</label>
          <input type="number" min="0" step="0.5" value={values.weeklyKm}
            onChange={(e) => setValues((v) => ({ ...v, weeklyKm: Number(e.target.value) }))}
            className="w-full rounded px-3 py-2 text-sm font-mono" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
        </div>
        {proposal.kind === "race" && (
          <>
            <div>
              <label className="block text-[10px] uppercase tracking-wide mb-1" style={{ color: COLORS.textMuted }}>Km del fondo del domingo</label>
              <input type="number" min="0" step="0.5" value={values.longRunKm}
                onChange={(e) => setValues((v) => ({ ...v, longRunKm: Number(e.target.value) }))}
                className="w-full rounded px-3 py-2 text-sm font-mono" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wide mb-1" style={{ color: COLORS.textMuted }}>Calidad del martes</label>
              <select value={displayPaceKey(values.q1PaceKey)} onChange={(e) => setValues((v) => ({ ...v, q1PaceKey: e.target.value }))}
                className="w-full rounded px-3 py-2 text-sm" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                {PACE_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
              {displayPaceKey(values.q1PaceKey) === "T" && (
                <select value={values.q1PaceKey} onChange={(e) => setValues((v) => ({ ...v, q1PaceKey: e.target.value }))}
                  className="w-full rounded px-3 py-2 text-sm mt-1" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                  {T_VARIANTS.map((t) => <option key={t.key} value={t.key}>Umbral · {t.label}</option>)}
                </select>
              )}
              {displayPaceKey(values.q1PaceKey) === "custom" && (
                <select value={values.q1PaceKey} onChange={(e) => setValues((v) => ({ ...v, q1PaceKey: e.target.value }))}
                  className="w-full rounded px-3 py-2 text-sm mt-1" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                  {OTRO_TEMPLATES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              )}
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wide mb-1" style={{ color: COLORS.textMuted }}>Calidad del jueves</label>
              <select value={displayPaceKey(values.q2PaceKey)} onChange={(e) => setValues((v) => ({ ...v, q2PaceKey: e.target.value }))}
                className="w-full rounded px-3 py-2 text-sm" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                {PACE_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
              {displayPaceKey(values.q2PaceKey) === "T" && (
                <select value={values.q2PaceKey} onChange={(e) => setValues((v) => ({ ...v, q2PaceKey: e.target.value }))}
                  className="w-full rounded px-3 py-2 text-sm mt-1" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                  {T_VARIANTS.map((t) => <option key={t.key} value={t.key}>Umbral · {t.label}</option>)}
                </select>
              )}
              {displayPaceKey(values.q2PaceKey) === "custom" && (
                <select value={values.q2PaceKey} onChange={(e) => setValues((v) => ({ ...v, q2PaceKey: e.target.value }))}
                  className="w-full rounded px-3 py-2 text-sm mt-1" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                  {OTRO_TEMPLATES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              )}
            </div>
          </>
        )}
      </div>
      <div className="flex gap-2 mt-3">
        <button onClick={() => onConfirm()} disabled={busy} className="px-4 py-1.5 rounded text-sm font-semibold" style={{ background: COLORS.track, color: COLORS.lane }}>Confirmar y aplicar</button>
        <button onClick={onCancel} className="px-3 py-1.5 rounded text-sm" style={{ color: COLORS.textMuted }}>Cancelar</button>
      </div>
    </div>
  );
}

function PanoramaPanel({ data, student, currentWeek, edits, longEdits, qualityEdits, onEdit, onEditLong, onEditQuality, onSave, busy }) {
  if (data.kind === "flat") {
    return (
      <p className="text-sm" style={{ color: COLORS.textMuted }}>
        Este objetivo (Fitness general) no tiene fecha de carrera ni semana pico — el volumen se mantiene estable en torno a <strong style={{ color: COLORS.textPrimary }}>{data.weeklyKm} km/semana</strong>, ajustándose semana a semana solo según la adherencia registrada.
      </p>
    );
  }
  if (data.kind === "beginner") {
    return (
      <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
        {data.rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs"
            style={{ background: COLORS.surface2, border: `1px solid ${r.isCurrent ? COLORS.track : COLORS.border}` }}>
            <span style={{ color: COLORS.textMuted }}>
              {getWeekTitle(student, r.weekNum)} — {r.label}{r.isCurrent ? " (actual)" : ""}
            </span>
            <span style={{ color: COLORS.textPrimary, fontFamily: "'JetBrains Mono', monospace" }}>
              {r.walk > 0 ? `${r.run}'trote+${r.walk}'camina x${r.reps}` : `${r.run}' continuo`} (~{r.totalMin}')
            </span>
          </div>
        ))}
        <p className="text-xs mt-2" style={{ color: COLORS.textMuted }}>
          Progresión estimada suponiendo buena adherencia cada semana; si alguna semana no se cumple, se repite la etapa hasta consolidarla.
        </p>
      </div>
    );
  }
  const rows = data.rows;
  if (rows.length === 0) return <p className="text-sm" style={{ color: COLORS.textMuted }}>No hay panorama disponible para este alumno.</p>;
  const hasEdits = Object.keys(edits).length > 0 || Object.keys(longEdits).length > 0 || Object.keys(qualityEdits).length > 0;
  return (
    <div>
      <div className="flex text-[10px] uppercase tracking-wide px-3 mb-1" style={{ color: COLORS.textMuted }}>
        <span className="flex-1">Semana</span>
        <span className="w-20 text-right mr-2">Total</span>
        <span className="w-20 text-right mr-2">Fondo Dom.</span>
        <span className="w-20 text-right">Fase</span>
      </div>
      <div className="space-y-2 max-h-[32rem] overflow-y-auto pr-1">
        {rows.map((r) => {
          const isFuture = r.weekNum >= currentWeek;
          const val = edits[r.weekNum] !== undefined ? edits[r.weekNum] : r.km;
          const longVal = longEdits[r.weekNum] !== undefined ? longEdits[r.weekNum] : r.longKm;
          return (
            <div key={r.weekNum} className="rounded-lg px-3 py-2 text-xs"
              style={{ background: COLORS.surface2, border: `1px solid ${r.isPeak ? COLORS.track : COLORS.border}` }}>
              <div className="flex items-center gap-2">
                <span className="flex-1" style={{ color: COLORS.textMuted }}>
                  {getWeekTitle(student, r.weekNum)} {r.weeksToRace === 0 ? "(carrera)" : `· faltan ${r.weeksToRace} sem.`}
                </span>
                {isFuture ? (
                  <input type="number" min="0" step="0.5" value={val}
                    onChange={(e) => onEdit(r.weekNum, Number(e.target.value))}
                    className="w-20 rounded px-2 py-1 text-xs font-mono text-right"
                    style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
                ) : (
                  <span className="w-20 text-right" style={{ color: COLORS.textPrimary, fontFamily: "'JetBrains Mono', monospace" }}>{val} km</span>
                )}
                {isFuture ? (
                  <input type="number" min="0" step="0.5" value={longVal}
                    onChange={(e) => onEditLong(r.weekNum, Number(e.target.value))}
                    className="w-20 rounded px-2 py-1 text-xs font-mono text-right"
                    style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
                ) : (
                  <span className="w-20 text-right" style={{ color: COLORS.textPrimary, fontFamily: "'JetBrains Mono', monospace" }}>{longVal} km</span>
                )}
                <span className="w-20 flex justify-end">
                  <Pill color={r.phase === "taper" || r.phase === "race" ? COLORS.track : (r.isPeak ? COLORS.track : (r.isRecovery ? COLORS.moderate : COLORS.easy))}>
                    {r.phase === "taper" || r.phase === "race" ? PHASE_LABEL[r.phase] : (r.isPeak ? "★ Pico" : r.isRecovery ? "Asimil." : PHASE_LABEL[r.phase])}
                  </Pill>
                </span>
              </div>
              {(r.q1Detail || r.q2Detail || r.q3Detail) && (
                <div className="mt-1.5 pt-1.5 space-y-1" style={{ borderTop: `1px dashed ${COLORS.border}` }}>
                  {["q1", "q2", "q3"].map((qk) => {
                    const dayLabel = qk === "q1" ? "Mar" : qk === "q2" ? "Jue" : "Sáb";
                    const detail = r[`${qk}Detail`];
                    if (!detail) return null;
                    if (!isFuture) {
                      return <div key={qk}><span style={{ color: COLORS.textMuted }}>{dayLabel}: <span style={{ color: COLORS.textPrimary }}>{detail}</span></span></div>;
                    }
                    const qEdit = qualityEdits[r.weekNum]?.[qk] || {};
                    const typeVal = qEdit.type !== undefined ? qEdit.type : r[`${qk}Type`];
                    const distVal = qEdit.dist !== undefined ? qEdit.dist : r[`${qk}Dist`];
                    const repsVal = qEdit.reps !== undefined ? qEdit.reps : r[`${qk}Reps`];
                    const typeOptions = qk === "q3" ? [{ v: "E", l: "Run/Walk" }, { v: "broken", l: "Pre-carga (series largas)" }]
                      : [{ v: "R", l: "Series" }, { v: "I", l: "Intervalos" }, { v: "T", l: "Umbral continuo" }, { v: "brokenT", l: "Umbral fraccionado" }, { v: "combo1k500", l: "Intervalos 1k + 500" }];
                    const distOptions = typeVal === "R" ? R_DISTANCES : typeVal === "I" ? I_DISTANCES : typeVal === "T" ? T_DURATIONS : null;
                    const repsOptions = typeVal === "I" ? [2, 3, 4, 5, 6, 8, 10] : typeVal === "R" ? [6, 8, 10, 12, 14] : null;
                    return (
                      <div key={qk} className="flex items-center gap-1.5 flex-wrap">
                        <span style={{ color: COLORS.textMuted, minWidth: 24 }}>{dayLabel}:</span>
                        <select value={typeVal} onChange={(e) => onEditQuality(r.weekNum, qk, "type", e.target.value)}
                          className="rounded px-1.5 py-0.5 text-[11px]" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                          {typeOptions.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                        </select>
                        {distOptions && (
                          <select value={distVal ?? ""} onChange={(e) => onEditQuality(r.weekNum, qk, "dist", e.target.value ? Number(e.target.value) : null)}
                            className="rounded px-1.5 py-0.5 text-[11px]" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                            <option value="">Auto</option>
                            {distOptions.map((v) => <option key={v} value={v}>{typeVal === "T" ? `${v}'` : formatDist(v)}</option>)}
                          </select>
                        )}
                        {repsOptions && (
                          <select value={repsVal ?? ""} onChange={(e) => onEditQuality(r.weekNum, qk, "reps", e.target.value ? Number(e.target.value) : null)}
                            className="rounded px-1.5 py-0.5 text-[11px]" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                            <option value="">Auto reps</option>
                            {repsOptions.map((v) => <option key={v} value={v}>{v} reps</option>)}
                          </select>
                        )}
                        <span className="text-[10px]" style={{ color: COLORS.textMuted }}>({detail})</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {hasEdits && (
        <button onClick={onSave} disabled={busy} className="mt-3 px-4 py-1.5 rounded text-sm font-semibold" style={{ background: COLORS.track, color: COLORS.lane }}>
          Guardar cambios del panorama
        </button>
      )}
    </div>
  );
}

function RitmosPanel({ student, onSave, busy }) {
  const paces = student.paces || {};
  const [vals, setVals] = useState({
    E: formatPace(paces.E), long: formatPace(paces.long), M: formatPace(paces.M),
    HM: formatPace(paces.HM), R: formatPace(paces.R),
  });
  const [msg, setMsg] = useState("");
  if (!paces.M) {
    return (
      <p className="text-sm" style={{ color: COLORS.textMuted }}>
        {isFitnessGoal(student.goal)
          ? "Este objetivo (Fitness 12/16) no usa ritmos específicos — los trotes son a esfuerzo libre/conversacional."
          : "Este alumno todavía no tiene un objetivo de carrera definido, así que no hay ritmos calculados aún. Usa \"Cambiar objetivo\" para definir uno."}
      </p>
    );
  }

  const row = (label, pace) => (
    <div className="flex items-center justify-between rounded-lg px-3 py-2 text-xs" style={{ background: COLORS.surface2, border: `1px solid ${COLORS.border}` }}>
      <span style={{ color: COLORS.textMuted }}>{label}</span>
      <span style={{ color: COLORS.textPrimary, fontFamily: "'JetBrains Mono', monospace" }}>{formatPace(pace)}/km</span>
    </div>
  );
  const editRow = (key, label) => (
    <div className="flex items-center justify-between rounded-lg px-3 py-2 text-xs gap-2" style={{ background: COLORS.surface2, border: `1px solid ${COLORS.track}` }}>
      <span style={{ color: COLORS.textMuted }}>{label}</span>
      <input type="text" value={vals[key]} onChange={(e) => setVals((v) => ({ ...v, [key]: e.target.value }))}
        className="w-20 rounded px-2 py-1 text-xs font-mono text-right" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
    </div>
  );

  const recalcFromM = () => {
    const m = parsePaceToDecimal(vals.M);
    if (m == null) return setMsg("Ingresa un ritmo maratón válido (m:ss) antes de recalcular.");
    const derived = deriveAllFromM(m);
    setVals({ E: formatPace(derived.E), long: formatPace(derived.long), M: formatPace(derived.M), HM: formatPace(derived.HM), R: formatPace(derived.R) });
    setMsg("Tabla recalculada desde el ritmo maratón. Revisa y guarda si está bien.");
  };
  const recalcFromHM = () => {
    const hm = parsePaceToDecimal(vals.HM);
    if (hm == null) return setMsg("Ingresa un ritmo media maratón válido (m:ss) antes de recalcular.");
    const derived = deriveAllFromHM(hm);
    setVals({ E: formatPace(derived.E), long: formatPace(derived.long), M: formatPace(derived.M), HM: formatPace(derived.HM), R: formatPace(derived.R) });
    setMsg("Ritmo de media maratón convertido a ritmo maratón equivalente, y tabla recalculada. Revisa y guarda si está bien.");
  };

  const save = async () => {
    const parsed = {};
    for (const k of ["E", "long", "M", "HM", "R"]) {
      const p = parsePaceToDecimal(vals[k]);
      if (p != null) parsed[k] = p;
    }
    setMsg("");
    const ok = await onSave(parsed);
    setMsg(ok ? "Ritmos actualizados. Se usarán desde la próxima semana que generes." : "No se pudo guardar.");
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl p-4" style={{ background: COLORS.bg, border: `1px solid ${COLORS.track}` }}>
        <div className="text-xs font-semibold mb-2" style={{ color: COLORS.track }}>RITMO MARATÓN — REFERENCIA PRINCIPAL</div>
        <p className="text-xs mb-3" style={{ color: COLORS.textMuted }}>Todo el resto de la tabla (repeticiones, intervalos, umbral, fondo, suave) se deriva de este valor. Si el objetivo del alumno es media maratón, conviértelo primero.</p>
        <div className="flex flex-wrap items-center gap-2">
          <input type="text" value={vals.M} onChange={(e) => setVals((v) => ({ ...v, M: e.target.value }))}
            className="w-24 rounded px-2 py-1.5 text-sm font-mono text-center" style={{ background: COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
          <span className="text-xs" style={{ color: COLORS.textMuted }}>min/km</span>
          <button onClick={recalcFromM} className="px-3 py-1.5 rounded text-xs font-semibold" style={{ background: COLORS.track, color: COLORS.lane }}>Recalcular tabla desde M</button>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <span className="text-xs" style={{ color: COLORS.textMuted }}>o desde media maratón:</span>
          <input type="text" value={vals.HM} onChange={(e) => setVals((v) => ({ ...v, HM: e.target.value }))}
            className="w-24 rounded px-2 py-1.5 text-sm font-mono text-center" style={{ background: COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
          <button onClick={recalcFromHM} className="px-3 py-1.5 rounded text-xs font-semibold" style={{ background: COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>Convertir HM → M y recalcular</button>
        </div>
        {msg && <p className="text-xs mt-2" style={{ color: COLORS.moderate }}>{msg}</p>}
      </div>
      <p className="text-xs" style={{ color: COLORS.textMuted }}>
        También puedes editar cualquier fila individual a mano en cualquier momento (sin recalcular el resto).
      </p>
      <div>
        <div className="text-xs font-semibold mb-2" style={{ color: COLORS.textMuted }}>RECUPERACIÓN / RODAJE SUAVE</div>
        <div className="space-y-1.5">{editRow("E", "Suave / recuperación (E)")}</div>
      </div>
      <div>
        <div className="text-xs font-semibold mb-2" style={{ color: COLORS.textMuted }}>FONDO ESTRUCTURADO</div>
        <div className="space-y-1.5">
          {editRow("long", "Cuerpo (rango 30-60\" más lento que M)")}
        </div>
      </div>
      <div>
        <div className="text-xs font-semibold mb-2" style={{ color: COLORS.textMuted }}>REPETICIONES (base 200m, resto se extrapola)</div>
        <div className="space-y-1.5">
          {editRow("R", "200 m")}
          {R_DISTANCES.filter((d) => d !== 0.2).map((d) => row(formatDist(d), getRPace(parsePaceToDecimal(vals.R) ?? paces.R, parsePaceToDecimal(vals.HM) ?? paces.HM, d)))}
        </div>
      </div>
      <div>
        <div className="text-xs font-semibold mb-2" style={{ color: COLORS.textMuted }}>INTERVALOS (por distancia)</div>
        <div className="space-y-1.5">{I_DISTANCES.map((d) => row(formatDist(d), getIPace(parsePaceToDecimal(vals.HM) ?? paces.HM, parsePaceToDecimal(vals.M) ?? paces.M, d)))}</div>
      </div>
      <div>
        <div className="text-xs font-semibold mb-2" style={{ color: COLORS.textMuted }}>UMBRAL CONTINUO (por duración)</div>
        <div className="space-y-1.5">{T_DURATIONS.map((t) => row(`${t} minutos`, getTPaceForDuration(parsePaceToDecimal(vals.HM) ?? paces.HM, parsePaceToDecimal(vals.M) ?? paces.M, t)))}</div>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={busy} className="px-4 py-1.5 rounded text-sm font-semibold" style={{ background: COLORS.track, color: COLORS.lane }}>Guardar ritmos</button>
        {msg && <span className="text-xs" style={{ color: COLORS.textMuted }}>{msg}</span>}
      </div>
    </div>
  );
}

function CoachDashboard({ roster: rosterProp, refreshRoster: refreshRosterProp, onBack }) {
  // El coach necesita el listado COMPLETO (objetivo, nivel, semana, adherencia). La lista que
  // llega desde la pantalla de inicio viene recortada a nombre e id por seguridad, así que
  // aquí se pide el listado real — el servidor ya sabe que hay una sesión de coach válida.
  const [roster, setRoster] = useState(rosterProp || []);
  const refreshRoster = useCallback(async () => {
    const full = await safeGetWithRetry("roster", 3, 350);
    if (full != null) setRoster(full);
    if (refreshRosterProp) refreshRosterProp();
  }, [refreshRosterProp]);
  useEffect(() => { refreshRoster(); }, []);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(null);
  const [goalFilter, setGoalFilter] = useState("");
  const [rosterProgress, setRosterProgress] = useState({});
  const [showDailyActivity, setShowDailyActivity] = useState(false);
  const [dailyActivity, setDailyActivity] = useState(null);
  const [activityStudentFilter, setActivityStudentFilter] = useState("");
  const [activityDateFrom, setActivityDateFrom] = useState("");
  const [activityDateTo, setActivityDateTo] = useState("");
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [studentLoading, setStudentLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [student, setStudent] = useState(null);
  const [busy, setBusy] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [justClosed, setJustClosed] = useState(null);
  const [undoSnapshot, setUndoSnapshot] = useState(null);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [showPinChange, setShowPinChange] = useState(false);
  const [showNameChange, setShowNameChange] = useState(false);
  const [newName, setNewName] = useState("");
  const [nameMsg, setNameMsg] = useState("");
  const [showObjetivoInfo, setShowObjetivoInfo] = useState(false);
  const [showEditUser, setShowEditUser] = useState(false);
  const [showOtros, setShowOtros] = useState(false);
  const [showChangeGoal, setShowChangeGoal] = useState(false);
  const [showIntermediateRace, setShowIntermediateRace] = useState(false);
  const [showRollback, setShowRollback] = useState(false);
  const [rollbackStage, setRollbackStage] = useState(null);
  const [interRaceGoal, setInterRaceGoal] = useState("21k");
  const [interRaceDate, setInterRaceDate] = useState("");
  const [newPin, setNewPin] = useState("");
  const [pinMsg, setPinMsg] = useState("");
  const [showReports, setShowReports] = useState(false);
  const [showMuro, setShowMuro] = useState(false);
  const [pendientesMuro, setPendientesMuro] = useState(0);
  useEffect(() => {
    let vivo = true;
    const mirar = async () => {
      const r = await muroOp("pendientes");
      if (vivo && r?.ok) setPendientesMuro(r.noLeidos || 0);
    };
    mirar();
    const t = setInterval(mirar, 60000);
    return () => { vivo = false; clearInterval(t); };
  }, []);
  const [reports, setReports] = useState([]);
  const [showPaceAlerts, setShowPaceAlerts] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [showKmSummary, setShowKmSummary] = useState(false);
  const [reportWeekNum, setReportWeekNum] = useState(null);
  const [kmGroupBy, setKmGroupBy] = useState("week");
  const [qrUrl, setQrUrl] = useState("https://trotamundos-seven.vercel.app");
  const [paceAlerts, setPaceAlerts] = useState([]);
  const [showPanorama, setShowPanorama] = useState(false);
  const [showRitmos, setShowRitmos] = useState(false);
  const [panoramaEdits, setPanoramaEdits] = useState({});
  const [panoramaLongEdits, setPanoramaLongEdits] = useState({});
  const [qualityEdits, setQualityEdits] = useState({});
  const [proposal, setProposal] = useState(null);
  const [proposalValues, setProposalValues] = useState({});

  useEffect(() => {
    let active = true;
    if (!selectedId) { setStudent(null); return; }
    setStudentLoading(true);
    setJustClosed(null);
    setResetConfirm(false);
    setDeleteConfirm(false);
    setShowPinChange(false);
    setShowNameChange(false);
    setNameMsg("");
    setShowObjetivoInfo(false);
    setShowEditUser(false);
    setShowOtros(false);
    setShowPanorama(false);
    setShowRitmos(false);
    setViewedWeek(null);
    setShowChangeGoal(false);
    setShowIntermediateRace(false);
    setInterRaceDate("");
    setShowRollback(false);
    setRollbackStage(null);
    setUndoSnapshot(null);
    setPanoramaEdits({});
    setPanoramaLongEdits({});
    setQualityEdits({});
    setProposal(null);
    setPinMsg("");
    safeGetWithRetry(`student:${selectedId}`).then((s) => { if (active) { setStudent(s); setStudentLoading(false); } });
    return () => { active = false; };
  }, [selectedId]);

  // Al abrir la ficha de un alumno se trae de intervals.icu lo que haya entrenado. La
  // fusión incorpora SOLO lo que escribe el servidor, así que no pisa nada que el coach
  // tenga a medio editar en pantalla.
  useEffect(() => {
    if (!selectedId) return undefined;
    let activo = true;
    (async () => {
      const r = await intervalsOp("traer", selectedId);
      if (!activo || !(r?.actualizadas || r?.extras)) return;
      const fresco = await safeGet(`student:${selectedId}`);
      if (!activo || !fresco) return;
      setStudent((previo) => fusionarLoDelReloj(previo, fresco));
    })();
    return () => { activo = false; };
  }, [selectedId]);

  useEffect(() => { if (showReports) safeGet("reports").then((r) => setReports(r || [])); }, [showReports]);
  const loadPaceAlerts = useCallback(() => { safeGet("paceAlerts").then((a) => setPaceAlerts(a || [])); }, []);
  useEffect(() => { loadPaceAlerts(); }, [loadPaceAlerts]);
  useEffect(() => { if (showPaceAlerts) loadPaceAlerts(); }, [showPaceAlerts, loadPaceAlerts]);

  const pendingAlertsCount = paceAlerts.filter((a) => a.status === "pending").length;

  const resolvePaceAlert = async (alert, apply) => {
    setBusy(true);
    if (apply) {
      const target = await safeGet(`student:${alert.studentId}`);
      if (target) {
        const newPaces = applyPaceAdjustment(target.paces || {}, alert.trigger, alert.q1PaceKey, alert.q2PaceKey, target.goal);
        const updatedTarget = { ...target, paces: newPaces };
        await safeSet(`student:${alert.studentId}`, updatedTarget);
        if (student && student.id === alert.studentId) setStudent(updatedTarget);
      }
    }
    const allAlerts = (await safeGet("paceAlerts")) || [];
    const newAlerts = allAlerts.map((a) => (a.id === alert.id ? { ...a, status: apply ? "applied" : "dismissed" } : a));
    await safeSet("paceAlerts", newAlerts);
    setPaceAlerts(newAlerts);
    setBusy(false);
  };

  const changeGoal = async ({ goal, level, raceDate, targetPaceStr, peakKmOverride, applyTiming }) => {
    if (!student) return;
    setBusy(true);
    // El coach puede cambiar también el nivel (días por semana) junto con el objetivo;
    // si no lo cambia, se mantiene el que ya tenía.
    const newLevel = level || student.level;
    const applyNext = applyTiming === "next";
    // Si el alumno estuvo inactivo, su semana de plan quedó atrás respecto al calendario.
    // El plan nuevo debe arrancar en la semana que le corresponde HOY — si no, se generaría
    // en una semana del pasado y el alumno nunca lo vería.
    const todayWeek = getTodayWeekNum(student);
    const resumeWeek = Math.max(student.currentWeek, todayWeek);
    const targetWeekNum = applyNext ? resumeWeek + 1 : resumeWeek;
    // Las semanas que pasaron sin actividad se marcan como tales, para que el historial
    // muestre el hueco en vez de saltárselo.
    const baseWeeks = markInactiveWeeks(student, student.currentWeek, targetWeekNum);
    const studentForChange = { ...student, weeks: baseWeeks };
    const existingTargetWeek = baseWeeks[targetWeekNum];
    let updated;
    if (isFitnessGoal(goal)) {
      const plan = buildBeginnerPlan(0, goal, newLevel, student.trainDays);
      const weekEntry = { weeklyKm: null, phase: "principiante", plan, log: emptyLog(), note: `Objetivo actualizado: ${GOAL_LABEL[goal]}.`, submitted: false };
      updated = {
        ...studentForChange, goal, level: newLevel, raceDate: null, targetPaceStr: null, paces: {}, peakKm: null, peakLongKm: null,
        volumeOverrides: {}, longRunOverrides: {}, qualityStreaks: { q1: 0, q2: 0 },
        weeksToRace: null, currentWeek: targetWeekNum, beginnerStage: 0,
        weeks: { ...baseWeeks, [targetWeekNum]: weekEntry },
      };
    } else if (newLevel === "principiante") {
      const vdot = computeVDOT(DISTANCE_KM[goal], parsePaceToDecimal(targetPaceStr));
      const paces = computeTrainingPaces(vdot);
      paces.race = parsePaceToDecimal(targetPaceStr);
      anchorPacesToGoal(paces, goal);
      const peakKm = peakKmOverride || computePeakKm(goal, newLevel, vdot);
      const plan = buildBeginnerPlan(student.beginnerStage ?? 0, "fitness", newLevel, student.trainDays);
      const weekEntry = applyNext
        ? { weeklyKm: null, phase: "principiante", plan, log: emptyLog(), note: `Objetivo actualizado: ${GOAL_LABEL[goal]}.`, submitted: false }
        : { ...existingTargetWeek, plan, note: `Objetivo actualizado: ${GOAL_LABEL[goal]}.` };
      updated = {
        ...studentForChange, goal, level: newLevel, raceDate, targetPaceStr, paces, peakKm, currentWeek: targetWeekNum, weeksToRace: weeksBetween(raceDate),
        volumeOverrides: {}, longRunOverrides: {}, qualityStreaks: { q1: 0, q2: 0 },
        weeks: { ...baseWeeks, [targetWeekNum]: weekEntry },
      };
    } else {
      const vdot = computeVDOT(DISTANCE_KM[goal], parsePaceToDecimal(targetPaceStr));
      const paces = computeTrainingPaces(vdot);
      paces.race = parsePaceToDecimal(targetPaceStr);
      anchorPacesToGoal(paces, goal);
      const peakKm = peakKmOverride || computePeakKm(goal, newLevel, vdot);
      const peakLongKm = capLongRunKm(goal, newLevel, 999);
      const weeksToRace = weeksBetween(raceDate);
      const { phase, weeklyKm, plan } = buildInitialRacePlan(goal, newLevel, peakKm, peakLongKm, weeksToRace, paces);
      const note = `Objetivo actualizado: ${GOAL_LABEL[goal]}. Fase: ${PHASE_LABEL[phase]}.`;
      const weekEntry = applyNext
        ? { weeklyKm, phase, plan, log: emptyLog(), note, submitted: false }
        : { ...existingTargetWeek, weeklyKm, phase, plan, note };
      updated = {
        ...studentForChange, goal, level: newLevel, raceDate, targetPaceStr, paces, peakKm, peakLongKm, weeksToRace, currentWeek: targetWeekNum,
        volumeOverrides: {}, longRunOverrides: {}, qualityStreaks: { q1: 0, q2: 0 },
        weeks: { ...baseWeeks, [targetWeekNum]: weekEntry },
      };
    }
    await safeSet(`student:${student.id}`, updated);
    await updateRosterEntry(student.id, {
      goal: updated.goal, level: updated.level, raceDate: updated.raceDate, weekNumber: updated.currentWeek,
    });
    setStudent(updated);
    refreshRoster();
    setShowChangeGoal(false);
    setBusy(false);
  };

  const saveRitmos = async (parsed) => {
    if (!student) return false;
    setBusy(true);
    const newPaces = { ...(student.paces || {}), ...parsed };
    const updated = { ...student, paces: newPaces };
    const ok = await safeSet(`student:${student.id}`, updated);
    if (ok) setStudent(updated);
    setBusy(false);
    return ok;
  };

  const exportBackup = async () => {
    setBusy(true);
    try {
      const currentRoster = (await safeGet("roster")) || [];
      const students = {};
      const records = await Promise.all(currentRoster.map((r) => safeGet(`student:${r.id}`)));
      currentRoster.forEach((r, idx) => { if (records[idx]) students[r.id] = records[idx]; });
      const allReports = (await safeGet("reports")) || [];
      const allAlerts = (await safeGet("paceAlerts")) || [];
      const coachAuthData = await safeGet("coachAuth");
      const backup = {
        app: "TROTAMUNDOS", exportedAt: new Date().toISOString(),
        roster: currentRoster, students, reports: allReports, paceAlerts: allAlerts, coachAuth: coachAuthData,
      };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `trotamundos-respaldo-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("backup export error", e);
    }
    setBusy(false);
  };

  const waitingCount = roster.filter((r) => r.waitingApproval).length;
  // "Adherencia baja" ahora se mide por sesiones hechas en las últimas semanas, que es el
  // dato que de verdad indica si el alumno está siguiendo el plan.
  const isLowCompliance = (r) => {
    const cp = rosterProgress[r.id]?.compliance;
    return !!cp && cp.sessionsPct < 0.7;
  };
  const lowAdherenceCount = roster.filter(isLowCompliance).length;
  const pausedCount = roster.filter((r) => r.paused).length;
  let filteredRoster = search.trim() ? roster.filter((r) => r.name.toLowerCase().includes(search.toLowerCase())) : roster;
  if (statusFilter === "waiting") filteredRoster = filteredRoster.filter((r) => r.waitingApproval);
  else if (statusFilter === "low") filteredRoster = filteredRoster.filter(isLowCompliance);
  else if (statusFilter === "paused") filteredRoster = filteredRoster.filter((r) => r.paused);
  if (goalFilter) filteredRoster = filteredRoster.filter((r) => r.goal === goalFilter);
  filteredRoster = [...filteredRoster].sort((a, b) => a.name.localeCompare(b.name, "es"));

  const loadDailyActivity = async () => {
    setLoadingActivity(true);
    const rows = [];
    // Igual que arriba: todas las peticiones en paralelo en vez de una por una.
    const records = await Promise.all(roster.map((r) => safeGet(`student:${r.id}`)));
    for (let idx = 0; idx < roster.length; idx++) {
      const r = roster[idx];
      const s = records[idx];
      if (!s) continue;
      // revisa la semana actual y la anterior, para no perder actividad de ayer/anteayer justo
      // cuando el coach ya haya cerrado la semana.
      const weekNumsToCheck = [s.currentWeek, s.currentWeek - 1].filter((n) => n >= 1 && s.weeks[n]);
      weekNumsToCheck.forEach((wk) => {
        const week = s.weeks[wk];
        const { monday } = getWeekDates(s, wk);
        (week.plan || []).forEach((d, i) => {
          const l = week.log?.[i];
          if (d.paceKey && l?.completed) {
            const dayDate = new Date(monday);
            dayDate.setDate(monday.getDate() + i);
            rows.push({
              studentName: s.name, dayLabel: d.day, type: d.type,
              plannedKm: d.km, actualKm: l.actualKm !== "" && l.actualKm != null ? Number(l.actualKm) : d.km,
              rpe: l.rpe !== "" && l.rpe != null ? l.rpe : null, note: l.note || "",
              date: dayDate,
            });
          }
        });
      });
    }
    rows.sort((a, b) => b.date - a.date);
    setDailyActivity(rows);
    setLoadingActivity(false);
  };

  // Cuántos entrenos lleva registrados cada alumno esta semana (ej. "3 de 5") — se carga sola
  // cada vez que cambia la lista de alumnos, sin bloquear el resto del panel.
  const loadRosterProgress = useCallback(async () => {
    // Una sola petición que devuelve el resumen ya calculado en el servidor. Antes se pedía
    // el registro completo de cada alumno (una petición por alumno, con todo su historial)
    // solo para mostrar "4/4 sesiones" — mucho más lento de lo necesario.
    const summary = await fetchRosterSummary();
    if (summary) setRosterProgress(summary);
  }, []);
  // Se recarga el progreso solo cuando cambia la composición real de la lista (alumnos o su
  // semana), no en cada refresco. Antes, cualquier acción que refrescara el listado disparaba
  // una recarga completa de todos los alumnos, aunque nada relevante hubiera cambiado.
  const rosterSignature = roster.map((r) => `${r.id}:${r.weekNumber}:${r.waitingApproval ? 1 : 0}`).join("|");
  useEffect(() => { loadRosterProgress(); }, [rosterSignature]);

  const createStudent = async ({ name, goal, level, pin, raceDate, targetPaceStr, peakKmOverride, fitnessStartWeek, planTiming, trainDays, forceCreate }) => {
    if (busy) return; // segunda capa: evita crear dos veces si algo dispara la acción por duplicado
    setBusy(true);
    const id = uid();
    const pinSalt = genSalt();
    const pinHash = await hashText(pin, pinSalt);
    const msMonday = mondayOf(new Date());
    if (planTiming === "next") msMonday.setDate(msMonday.getDate() + 7);
    const planStartMonday = `${msMonday.getFullYear()}-${String(msMonday.getMonth() + 1).padStart(2, "0")}-${String(msMonday.getDate()).padStart(2, "0")}`;
    const finalTrainDays = level === "principiante" && trainDays && trainDays.length === 3 ? trainDays : undefined;
    let newStudent;
    if (isFitnessGoal(goal)) {
      const startWeek = fitnessStartWeek || FITNESS16_STAGES.length;
      const initialStage = fitnessStageIndexFromWeeksToGoal(startWeek);
      const plan = buildBeginnerPlan(initialStage, goal, level, finalTrainDays);
      newStudent = {
        id, name, goal, level, pinHash, pinSalt, raceDate: null, targetPaceStr: null, paces: {}, peakKm: null, peakLongKm: null,
        volumeOverrides: {}, longRunOverrides: {}, qualityStreaks: { q1: 0, q2: 0 }, planStartMonday, trainDays: finalTrainDays,
        weeksToRace: null, currentWeek: 1, beginnerStage: initialStage,
        weeks: { 1: { weeklyKm: null, phase: "principiante", plan, log: emptyLog(), note: `Plan inicial (semana ${startWeek}): ${getStageTable(goal)[initialStage].label}.`, submitted: false } },
      };
    } else if (level === "principiante") {
      const plan = buildBeginnerPlan(0, "fitness", level, finalTrainDays);
      const vdot = computeVDOT(DISTANCE_KM[goal], parsePaceToDecimal(targetPaceStr));
      const paces = computeTrainingPaces(vdot);
      paces.race = parsePaceToDecimal(targetPaceStr);
      anchorPacesToGoal(paces, goal);
      const peakKm = peakKmOverride || computePeakKm(goal, level, vdot);
      newStudent = {
        id, name, goal, level, pinHash, pinSalt, raceDate, targetPaceStr, paces, peakKm, volumeOverrides: {}, longRunOverrides: {}, qualityStreaks: { q1: 0, q2: 0 }, planStartMonday, trainDays: finalTrainDays,
        weeksToRace: weeksBetween(raceDate), currentWeek: 1, beginnerStage: 0,
        weeks: { 1: { weeklyKm: null, phase: "principiante", plan, log: emptyLog(), note: `Plan de acondicionamiento inicial: ${BEGINNER_STAGES[0].label}.`, submitted: false } },
      };
    } else {
      const vdot = computeVDOT(DISTANCE_KM[goal], parsePaceToDecimal(targetPaceStr));
      const paces = computeTrainingPaces(vdot);
      paces.race = parsePaceToDecimal(targetPaceStr);
      anchorPacesToGoal(paces, goal);
      const peakKm = peakKmOverride || computePeakKm(goal, level, vdot);
      const peakLongKm = capLongRunKm(goal, level, 999);
      const weeksToRace = weeksBetween(raceDate);
      const { phase, weeklyKm, plan } = buildInitialRacePlan(goal, level, peakKm, peakLongKm, weeksToRace, paces);
      newStudent = {
        id, name, goal, level, pinHash, pinSalt, raceDate, targetPaceStr, paces, peakKm, peakLongKm, volumeOverrides: {}, longRunOverrides: {}, qualityStreaks: { q1: 0, q2: 0 }, weeksToRace, currentWeek: 1, planStartMonday,
        weeks: { 1: { weeklyKm, phase, plan, log: emptyLog(), note: `Fase inicial: ${PHASE_LABEL[phase]}.`, submitted: false } },
      };
    }
    if (!forceCreate) {
      const firstWeekPlan = newStudent.weeks[1]?.plan;
      const warnings = getAnomalyWarnings(firstWeekPlan);
      if (warnings.length) {
        setPendingCreate({ args: { name, goal, level, pin, raceDate, targetPaceStr, peakKmOverride, fitnessStartWeek, planTiming, trainDays }, warnings });
        setBusy(false);
        return;
      }
    }
    setPendingCreate(null);
    await safeSet(`student:${id}`, newStudent);
    const freshRoster2 = (await safeGet("roster")) || [];
    const newRoster = [...freshRoster2, { id, name, goal, level, weekNumber: 1, lastAdherence: null, raceDate: isFitnessGoal(goal) ? null : raceDate, waitingApproval: false }];
    await safeSet("roster", newRoster);
    setShowAdd(false);
    refreshRoster();
    setSelectedId(id);
    setSearch(name);
    setBusy(false);
  };

  // Al cambiar un día, los easy y run/walk se reajustan entre todos para que la semana
  // siga sumando su objetivo (ver repartirVolumen en el motor). Solo en planes de carrera:
  // los de principiante y fitness avanzan por etapas y no se tocan.
  //
  // Un easy o run/walk que el coach cambia a mano queda FIJO: es una decisión suya y el
  // reajuste no lo mueve. Para devolverlo al reparto automático, la tarjeta manda
  // { liberar: true }.
  const updateDay = (index, newDay) => {
    setStudent((s) => {
      const week = s.weeks[s.currentWeek];
      const anterior = week.plan[index];
      let dia = newDay;
      if (newDay?.liberar) {
        const { liberar, kmFijado, ...resto } = newDay;
        dia = resto;
      } else if (esDiaDeVolumen(anterior) && (Number(newDay.km) !== Number(anterior.km) || newDay.paceKey !== anterior.paceKey)) {
        const { descansoPorVolumen, ...resto } = newDay;
        dia = { ...resto, kmFijado: true };
      }
      let plan = week.plan.map((d, i) => (i === index ? dia : d));
      const seReajusta = !isFitnessGoal(s.goal) && week.weeklyKm > 0 && !["principiante", "fitness"].includes(week.phase);
      if (seReajusta) plan = repartirVolumen(plan, week.weeklyKm).plan;
      return { ...s, weeks: { ...s.weeks, [s.currentWeek]: { ...week, plan } } };
    });
  };
  // Intercambia el contenido completo de dos días entre sí (tipo, ritmo, km, overrides, etc.),
  // manteniendo la etiqueta de día (Lun, Mar...) fija a su posición real de la semana.
  const swapDays = (indexA, indexB) => {
    if (indexA === indexB) return;
    setStudent((s) => {
      const week = s.weeks[s.currentWeek];
      const plan = [...week.plan];
      const dayLabelA = plan[indexA].day, dayLabelB = plan[indexB].day;
      const a = { ...plan[indexB], day: dayLabelA };
      const b = { ...plan[indexA], day: dayLabelB };
      plan[indexA] = a;
      plan[indexB] = b;
      return { ...s, weeks: { ...s.weeks, [s.currentWeek]: { ...week, plan } } };
    });
  };
  // Una semana publicada automáticamente deja de estar marcada en cuanto el coach la toca:
  // guardar cambios equivale a hacerla propia. La nota del sistema se conserva, pero sin el
  // prefijo que la señalaba como automática.
  const clearAutoFlag = (s, weekNum) => {
    const wk = s?.weeks?.[weekNum];
    if (!wk?.autoPublished) return s;
    const { autoPublished, autoPublishedKind, autoPublishedFromWeek, ...rest } = wk;
    const note = typeof rest.note === "string"
      ? rest.note.replace(new RegExp(`^${AUTO_PUBLISH_LABEL}[:.]?\\s*`), "")
      : rest.note;
    return { ...s, weeks: { ...s.weeks, [weekNum]: { ...rest, note } } };
  };
  const persistEdits = async () => {
    if (!student) return;
    setBusy(true);
    const toSave = clearAutoFlag(student, student.currentWeek);
    await safeSet(`student:${student.id}`, toSave);
    setStudent(toSave);
    setBusy(false);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
  };
  // Enviar la semana al reloj del alumno. Es una acción aparte del guardado: el plan ya
  // está guardado, esto solo lo empuja al reloj. Si falla, se dice por qué y no se toca nada.
  const [enviandoReloj, setEnviandoReloj] = useState(false);
  const [envioReloj, setEnvioReloj] = useState(null);
  const enviarSemanaAlReloj = async (weekNum) => {
    if (!student) return;
    setEnviandoReloj(true);
    setEnvioReloj(null);
    const r = await intervalsOp("enviar", student.id, { weekNum });
    setEnvioReloj(r);
    setEnviandoReloj(false);
    if (r?.ok) setTimeout(() => setEnvioReloj(null), 6000);
  };

  // "Revisada, está bien así": el coach acepta la semana automática tal cual.
  const markAutoWeekReviewed = async () => {
    if (!student) return;
    setBusy(true);
    const toSave = clearAutoFlag(student, activeWeekNum);
    await safeSet(`student:${student.id}`, toSave);
    setStudent(toSave);
    setBusy(false);
  };

  const openProposal = () => {
    if (!student) return;
    const p = buildWeekProposal(student);
    setProposal(p);
    setProposalValues({
      weeklyKm: p.suggestedWeeklyKm ?? "", longRunKm: p.suggestedLongRunKm ?? "",
      q1PaceKey: p.suggestedQ1 ?? "", q2PaceKey: p.suggestedQ2 ?? "",
    });
  };
  const [anomalyWarnings, setAnomalyWarnings] = useState(null);
  const [pendingCreate, setPendingCreate] = useState(null);
  const confirmProposal = async (force) => {
    if (!student || !proposal) return;
    setBusy(true);
    let studentWithStreaks = student;
    if (student.level !== "principiante" && proposal.kind !== "principiante" && !student.weeks[student.currentWeek].paused && student.weeks[student.currentWeek].submitted) {
      const closedWeek = student.weeks[student.currentWeek];
      const qEval = evaluateQualityAdjustment(student, closedWeek);
      studentWithStreaks = { ...student, qualityStreaks: qEval.newStreaks };
      if (qEval.trigger) {
        await pushPaceAlert({
          id: uid(), studentId: student.id, studentName: student.name, weekNumber: student.currentWeek,
          trigger: qEval.trigger, q1PaceKey: qEval.q1PaceKey, q2PaceKey: qEval.q2PaceKey,
          q1Note: qEval.q1Note, q2Note: qEval.q2Note, q1ActualPace: qEval.q1ActualPace, q2ActualPace: qEval.q2ActualPace,
          q1TargetPace: qEval.q1TargetPace, q2TargetPace: qEval.q2TargetPace,
          status: "pending", createdAt: new Date().toISOString(),
        });
      }
    }
    const finalized = finalizeWeekPlan(studentWithStreaks, proposal, proposalValues);
    const updated = applyIntermediateRaceDayPatch(finalized.updated);
    const note = finalized.note;
    if (!force) {
      const newPlan = updated.weeks[updated.currentWeek]?.plan;
      const warnings = getAnomalyWarnings(newPlan);
      if (warnings.length) {
        setAnomalyWarnings(warnings);
        setBusy(false);
        return;
      }
    }
    setAnomalyWarnings(null);
    const freshRoster3Before = (await safeGet("roster")) || [];
    // Copia del estado ANTES de aplicar, para poder deshacer si el coach se arrepiente.
    const snapshot = {
      student: JSON.parse(JSON.stringify(student)),
      roster: JSON.parse(JSON.stringify(freshRoster3Before)),
      closedWeekNumber: proposal.closedWeekNumber,
    };
    await safeSet(`student:${student.id}`, updated);
    const freshRoster3 = freshRoster3Before;
    const newRoster = freshRoster3.map((r) => (r.id === student.id ? { ...r, weekNumber: updated.currentWeek, waitingApproval: false } : r));
    await safeSet("roster", newRoster);
    await pushReport({
      id: uid(), studentId: student.id, studentName: student.name, weekNumber: proposal.closedWeekNumber,
      weeklyKm: proposal.closedWeeklyKm, phase: proposal.closedPhase, adherencePct: proposal.adherencePct, avgRpe: proposal.avgRpe,
      note, closedAt: new Date().toISOString(),
    });
    setStudent(updated);
    refreshRoster();
    setJustClosed(note);
    setUndoSnapshot(snapshot);
    setProposal(null);
    setBusy(false);
  };
  // Deshacer el último cierre de semana: restaura el alumno y el listado tal como estaban
  // justo antes de confirmar. Solo está disponible mientras no se salga de la pantalla.
  const undoLastClose = async () => {
    if (!undoSnapshot) return;
    setBusy(true);
    await safeSet(`student:${undoSnapshot.student.id}`, undoSnapshot.student);
    await safeSet("roster", undoSnapshot.roster);
    setStudent(undoSnapshot.student);
    refreshRoster();
    setUndoSnapshot(null);
    setJustClosed(null);
    setBusy(false);
  };

  const handleEditQuality = (wk, qKey, field, val) => {
    const row = panoramaData.rows?.find((r) => r.weekNum === wk);
    if (row && (field === "dist" || field === "reps" || field === "type")) {
      const curEdit = qualityEdits[wk]?.[qKey] || {};
      const oldType = curEdit.type !== undefined ? curEdit.type : row[`${qKey}Type`];
      const oldDist = curEdit.dist !== undefined ? curEdit.dist : row[`${qKey}Dist`];
      const oldReps = curEdit.reps !== undefined ? curEdit.reps : row[`${qKey}Reps`];
      const oldKm = impliedQKm(oldType, oldDist, oldReps, student.paces);
      const newType = field === "type" ? val : oldType;
      const newDist = field === "dist" ? val : oldDist;
      const newReps = field === "reps" ? val : oldReps;
      const newKm = impliedQKm(newType, newDist, newReps, student.paces);
      if (oldKm != null && newKm != null && oldKm !== newKm) {
        const curWeeklyKm = panoramaEdits[wk] !== undefined ? panoramaEdits[wk] : row.km;
        setPanoramaEdits((e) => ({ ...e, [wk]: Math.max(0, r1(curWeeklyKm - oldKm + newKm)) }));
      }
    }
    setQualityEdits((e) => ({ ...e, [wk]: { ...e[wk], [qKey]: { ...(e[wk]?.[qKey] || {}), [field]: val } } }));
  };

  const reopenWeek = async () => {
    if (!student || isViewingLive) return;
    const targetWeek = activeWeekNum;
    const targetWeekData = student.weeks[targetWeek];
    if (!targetWeekData) return;
    setBusy(true);
    // El nuevo "weeksToRace" para la semana reabierta se reconstruye a partir del valor actual,
    // ya que cada cierre de semana lo desplaza en exactamente 1.
    const newWeeksToRace = student.weeksToRace != null ? student.weeksToRace + (student.currentWeek - targetWeek) : null;
    const newWeeks = {};
    Object.keys(student.weeks).forEach((k) => {
      if (Number(k) <= targetWeek) newWeeks[k] = student.weeks[k];
    });
    newWeeks[targetWeek] = { ...targetWeekData, submitted: false };
    const updated = { ...student, currentWeek: targetWeek, weeksToRace: newWeeksToRace, weeks: newWeeks };
    await safeSet(`student:${student.id}`, updated);
    setStudent(updated);
    setViewedWeek(null);
    refreshRoster();
    setBusy(false);
  };

  const refreshTitles = async () => {
    if (!student) return;
    setBusy(true);
    const cw = student.currentWeek;
    const week = student.weeks[cw];
    const newPlan = week.plan.map((d, i) => {
      const isMondayRecovery = i === 0 && d.slot === "easy";
      return { ...d, type: getDefaultTitle(d.paceKey, isMondayRecovery, d.runWalk) ?? d.type };
    });
    const updated = { ...student, weeks: { ...student.weeks, [cw]: { ...week, plan: newPlan } } };
    await safeSet(`student:${student.id}`, updated);
    setStudent(updated);
    setBusy(false);
  };

  const savePanorama = async () => {
    if (!student) return;
    setBusy(true);
    const qualityOverrides = { ...(student.qualityOverrides || {}) };
    for (const [wk, edits] of Object.entries(qualityEdits)) {
      const merged = { ...(qualityOverrides[wk] || {}) };
      if (edits.q1?.type !== undefined) merged.q1Type = edits.q1.type;
      if (edits.q1?.dist !== undefined) merged.q1Dist = edits.q1.dist;
      if (edits.q1?.reps !== undefined) merged.q1Reps = edits.q1.reps;
      if (edits.q2?.type !== undefined) merged.q2Type = edits.q2.type;
      if (edits.q2?.dist !== undefined) merged.q2Dist = edits.q2.dist;
      if (edits.q2?.reps !== undefined) merged.q2Reps = edits.q2.reps;
      if (edits.q3?.type !== undefined) merged.q3Type = edits.q3.type;
      qualityOverrides[wk] = merged;
    }
    let updated = {
      ...student,
      volumeOverrides: { ...(student.volumeOverrides || {}), ...panoramaEdits },
      longRunOverrides: { ...(student.longRunOverrides || {}), ...panoramaLongEdits },
      qualityOverrides,
    };
    const cw = student.currentWeek;
    const cwQuality = qualityOverrides[cw];
    const editsThisWeek = panoramaEdits[cw] !== undefined || panoramaLongEdits[cw] !== undefined || qualityEdits[cw] !== undefined;
    if (editsThisWeek && !isFitnessGoal(student.goal) && student.level !== "principiante") {
      const week = student.weeks[cw];
      const currentLongDay = week.plan.find((d) => d.slot === "long");
      const newWeeklyKm = panoramaEdits[cw] !== undefined ? panoramaEdits[cw] : week.weeklyKm;
      const newLongKm = panoramaLongEdits[cw] !== undefined ? panoramaLongEdits[cw] : (currentLongDay ? currentLongDay.km : newWeeklyKm * 0.4);
      const q1Day = week.plan.find((d) => d.slot === "q1");
      const q2Day = week.plan.find((d) => d.slot === "q2");
      const taperWeeks = getTaperWeeks(student.goal);
      const weeksToRaceNow = student.weeksToRace != null ? student.weeksToRace : weeksBetween(student.raceDate);
      const cyclePosNow = getCyclePosition(weeksToRaceNow, taperWeeks);
      const qpNow = suggestQualityPaces(student.goal, week.phase, weeksToRaceNow, taperWeeks, cyclePosNow, student.level);
      const q1PaceKey = cwQuality?.q1Type || (q1Day ? q1Day.paceKey : "E");
      const q2PaceKey = cwQuality?.q2Type || (q2Day ? q2Day.paceKey : "E");
      let newPlan = buildRacePlan(
        student.goal, week.phase, student.level, newWeeklyKm, newLongKm,
        q1PaceKey, q2PaceKey, student.paces || {}, weeksToRaceNow, taperWeeks
      );
      const q1TypeChanged = cwQuality?.q1Type && cwQuality.q1Type !== qpNow.q1;
      const q2TypeChanged = cwQuality?.q2Type && cwQuality.q2Type !== qpNow.q2;
      const q1Dist = cwQuality?.q1Dist || (q1TypeChanged ? null : qpNow.q1Dist);
      const q1Reps = cwQuality?.q1Reps ?? (cwQuality?.q1Dist || q1TypeChanged ? null : qpNow.q1Reps);
      const q2Dist = cwQuality?.q2Dist || (q2TypeChanged ? null : qpNow.q2Dist);
      const q2Reps = cwQuality?.q2Reps ?? (cwQuality?.q2Dist || q2TypeChanged ? null : qpNow.q2Reps);
      newPlan = newPlan.map((d) => {
        if (d.slot === "q1" && q1Dist) { const next = { ...d, distOverride: q1Dist, repsOverride: q1Reps || undefined }; return { ...next, km: computeImpliedKm(next) }; }
        if (d.slot === "q2" && q2Dist && q2PaceKey === "brokenT") { const next = { ...d, distOverride: q2Dist, brokenTRefMin: q2TypeChanged ? null : qpNow.q2RefMin, recoveryOverride: q2Reps }; return { ...next, km: computeImpliedKm(next) }; }
        if (d.slot === "q2" && q2Dist && q2PaceKey === "I") { const next = { ...d, distOverride: q2Dist, repsOverride: q2Reps || undefined }; return { ...next, km: computeImpliedKm(next) }; }
        if (d.slot === "q3" && cwQuality?.q3Type) return { ...d, paceKey: cwQuality.q3Type === "broken" ? "broken" : "E", runWalk: cwQuality.q3Type !== "broken" };
        return d;
      });
      newPlan = balanceWeeklyVolume(newPlan, newWeeklyKm);
      updated = { ...updated, weeks: { ...updated.weeks, [cw]: { ...week, weeklyKm: newWeeklyKm, plan: newPlan } } };
    }
    await safeSet(`student:${student.id}`, updated);
    setStudent(updated);
    setPanoramaEdits({});
    setPanoramaLongEdits({});
    setQualityEdits({});
    setBusy(false);
  };

  const applyIntermediateRace = async () => {
    if (!student || !interRaceDate) return;
    setBusy(true);
    const ov = computeIntermediateRaceOverrides(student, interRaceGoal, interRaceDate);
    const updated = {
      ...student,
      volumeOverrides: { ...(student.volumeOverrides || {}), ...ov.volumeOverrides },
      longRunOverrides: { ...(student.longRunOverrides || {}), ...ov.longRunOverrides },
      qualityOverrides: { ...(student.qualityOverrides || {}), ...ov.qualityOverrides },
      intermediateRace: { goalId: interRaceGoal, date: interRaceDate, raceWeekNum: ov.raceWeekNum, recoveryWeekNum: ov.recoveryWeekNum },
    };
    await safeSet(`student:${student.id}`, updated);
    setStudent(updated);
    setInterRaceDate("");
    setBusy(false);
  };
  const removeIntermediateRace = async () => {
    if (!student || !student.intermediateRace) return;
    setBusy(true);
    const { raceWeekNum, recoveryWeekNum } = student.intermediateRace;
    const volumeOverrides = { ...(student.volumeOverrides || {}) };
    const longRunOverrides = { ...(student.longRunOverrides || {}) };
    const qualityOverrides = { ...(student.qualityOverrides || {}) };
    delete volumeOverrides[raceWeekNum]; delete volumeOverrides[recoveryWeekNum];
    delete longRunOverrides[raceWeekNum];
    delete qualityOverrides[raceWeekNum]; delete qualityOverrides[recoveryWeekNum];
    const updated = { ...student, volumeOverrides, longRunOverrides, qualityOverrides, intermediateRace: null };
    await safeSet(`student:${student.id}`, updated);
    setStudent(updated);
    setBusy(false);
  };
// Retroceder a una etapa anterior del plan de fitness/principiante. No borra nada del
// historial: crea una semana NUEVA que repite la etapa elegida, para retomar después de una
// pausa larga (viaje, lesión) sin tener que reiniciar todo desde cero.
const rollbackToStage = async (targetStage) => {
  if (!student) return;
  setBusy(true);
  const stages = getStageTable(student.goal);
  const stage = Math.max(0, Math.min(stages.length - 1, targetStage));
  const nextWeekNum = student.currentWeek + 1;
  const plan = buildBeginnerPlan(stage, student.goal, student.level, student.trainDays);
  const note = `Se retoma en la etapa de ${stages[stage].label} (elegida por el coach al volver de una pausa).`;
  const updated = {
    ...student, currentWeek: nextWeekNum, beginnerStage: stage,
    weeks: {
      ...student.weeks,
      [student.currentWeek]: { ...student.weeks[student.currentWeek], submitted: true },
      [nextWeekNum]: { weeklyKm: null, phase: "principiante", plan, log: emptyLog(), note, submitted: false },
    },
  };
  await safeSet(`student:${student.id}`, updated);
  const freshRosterRb = (await safeGet("roster")) || [];
  await safeSet("roster", freshRosterRb.map((r) => (r.id === student.id ? { ...r, weekNumber: nextWeekNum, waitingApproval: false } : r)));
  setStudent(updated);
  refreshRoster();
  setShowRollback(false);
  setBusy(false);
};
const resetPlan = async () => {
    if (!student) return;
    setBusy(true);
    let updated;
    if (isFitnessGoal(student.goal) || student.level === "principiante") {
      updated = { ...student, currentWeek: 1, beginnerStage: 0, weeks: { 1: { weeklyKm: null, phase: "principiante", plan: buildBeginnerPlan(0, student.goal, student.level, student.trainDays), log: emptyLog(), note: "Plan reiniciado desde cero.", submitted: false } } };
    } else {
      const weeksToRace = weeksBetween(student.raceDate);
      const peakLongKm = student.peakLongKm || capLongRunKm(student.goal, student.level, 999);
      const { phase, weeklyKm, plan } = buildInitialRacePlan(student.goal, student.level, student.peakKm, peakLongKm, weeksToRace, student.paces || {});
      updated = { ...student, currentWeek: 1, weeksToRace, peakLongKm, volumeOverrides: {}, longRunOverrides: {}, qualityStreaks: { q1: 0, q2: 0 }, weeks: { 1: { weeklyKm, phase, plan, log: emptyLog(), note: "Plan reiniciado desde cero.", submitted: false } } };
    }
    await safeSet(`student:${student.id}`, updated);
    const freshRoster4 = (await safeGet("roster")) || [];
    const newRoster = freshRoster4.map((r) => (r.id === student.id ? { ...r, weekNumber: 1, lastAdherence: null, waitingApproval: false } : r));
    await safeSet("roster", newRoster);
    setStudent(updated);
    refreshRoster();
    setJustClosed(null);
    setResetConfirm(false);
    setBusy(false);
  };

  const changePin = async () => {
    if (!student || !/^\d{4}$/.test(newPin)) { setPinMsg("El PIN debe tener 4 dígitos."); return; }
    setBusy(true);
    const pinSalt = genSalt();
    const pinHash = await hashText(newPin, pinSalt);
    const updated = { ...student, pinHash, pinSalt };
    await safeSet(`student:${student.id}`, updated);
    setStudent(updated);
    setPinMsg("PIN actualizado.");
    setNewPin("");
    setBusy(false);
  };

  const changeName = async () => {
    if (!student || !newName.trim()) { setNameMsg("Ingresa un nombre válido."); return; }
    setBusy(true);
    const updated = { ...student, name: newName.trim() };
    await safeSet(`student:${student.id}`, updated);
    const freshRoster = (await safeGet("roster")) || roster;
    const newRoster = freshRoster.map((r) => (r.id === student.id ? { ...r, name: newName.trim() } : r));
    await safeSet("roster", newRoster);
    setStudent(updated);
    setNameMsg("Nombre actualizado.");
    setNewName("");
    refreshRoster();
    setBusy(false);
  };

  const togglePauseWeek = async () => {
    if (!student) return;
    setBusy(true);
    const week = student.weeks[student.currentWeek];
    const nowPaused = !week.paused;
    const updated = {
      ...student,
      weeks: {
        ...student.weeks,
        [student.currentWeek]: {
          ...week, paused: nowPaused,
          note: nowPaused ? "Semana pausada por lesión/viaje. No se contará como fallo ni penalizará el volumen del ciclo." : week.note,
        },
      },
    };
    await safeSet(`student:${student.id}`, updated);
    setStudent(updated);
    const rosterNow = await safeGet("roster");
    if (rosterNow) {
      const newRoster = rosterNow.map((r) => (r.id === student.id ? { ...r, paused: nowPaused } : r));
      await safeSet("roster", newRoster);
      refreshRoster();
    }
    setBusy(false);
  };

  const deleteStudent = async () => {
    if (!student) return;
    setBusy(true);
    const freshRoster = (await safeGet("roster")) || roster;
    const newRoster = freshRoster.filter((r) => r.id !== student.id);
    await safeSet("roster", newRoster);
    await safeDelete(`student:${student.id}`);
    setSelectedId(null);
    setStudent(null);
    setDeleteConfirm(false);
    refreshRoster();
    setBusy(false);
  };

  const [viewedWeek, setViewedWeek] = useState(null);
  useEffect(() => { setViewedWeek(null); }, [student?.currentWeek]);
  const activeWeekNum = viewedWeek ?? (student ? student.currentWeek : null);
  const week = student ? ensureWeekShape(student.weeks[activeWeekNum]) : null;
  const isViewingLive = !student || activeWeekNum === student.currentWeek;
  const panoramaData = student ? projectWeeklyVolumes(student) : { kind: "flat", rows: [] };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="p-2 rounded-lg" style={{ color: COLORS.textMuted }}><ArrowLeft size={18} /></button>
        <Users size={20} style={{ color: COLORS.track }} />
        <h1 className="text-xl font-semibold tracking-wide flex-1" style={{ fontFamily: "'Oswald', sans-serif", color: COLORS.textPrimary }}>PANEL DEL COACH</h1>
        <button onClick={exportBackup} disabled={busy}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold"
          style={{ background: COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
          <Download size={14} /> Respaldo
        </button>
        <button onClick={() => setShowQR((v) => !v)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold"
          style={{ background: showQR ? COLORS.track : COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
          <QrCode size={14} /> Código QR
        </button>
        <button onClick={async () => { const next = !showDailyActivity; setShowDailyActivity(next); if (next && !dailyActivity) await loadDailyActivity(); }}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold"
          style={{ background: showDailyActivity ? COLORS.track : COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
          <Activity size={14} /> Actividad diaria
        </button>
        <button onClick={() => setShowPaceAlerts((v) => !v)}
          className="relative flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold"
          style={{ background: showPaceAlerts ? COLORS.moderate : COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
          <AlertCircle size={14} /> Ajustes de ritmo
          {pendingAlertsCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 rounded-full text-[10px] font-bold flex items-center justify-center"
              style={{ width: 18, height: 18, background: COLORS.track, color: COLORS.lane }}>
              {pendingAlertsCount}
            </span>
          )}
        </button>
        <button onClick={() => setShowReports((v) => !v)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold"
          style={{ background: showReports ? COLORS.track : COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
          <FileText size={14} /> Reportes
        </button>
        <button onClick={() => setShowMuro((v) => !v)}
          className="relative flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold"
          style={{ background: showMuro ? COLORS.track : COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
          <Megaphone size={14} /> Anuncios
          {pendientesMuro > 0 && (
            <span className="absolute -top-1.5 -right-1.5 rounded-full text-[10px] font-bold flex items-center justify-center"
              style={{ width: 18, height: 18, background: COLORS.track, color: COLORS.lane }}>
              {pendientesMuro}
            </span>
          )}
        </button>
      </div>

      {showMuro && (
        <div className="mb-6">
          <div className="text-sm font-semibold mb-3" style={{ color: COLORS.textPrimary, fontFamily: "'Oswald', sans-serif" }}>ANUNCIOS</div>
          <MuroAnuncios esCoach onLeido={() => setPendientesMuro(0)} />
        </div>
      )}

      {showQR && (
        <div className="rounded-xl p-4 mb-6" style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}>
          <div className="text-sm font-semibold mb-2" style={{ color: COLORS.textPrimary, fontFamily: "'Oswald', sans-serif" }}>CÓDIGO QR</div>
          <p className="text-xs mb-3" style={{ color: COLORS.textMuted }}>
            Pega aquí el enlace publicado de esta app (el que compartes con tus alumnos) para generar un código QR que puedan escanear en vez de escribir la URL.
          </p>
          <input type="text" placeholder="https://claude.ai/..." value={qrUrl} onChange={(e) => setQrUrl(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm mb-3" style={{ background: COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
          {qrUrl.trim() && (
            <div className="flex flex-col items-start gap-2">
              <QRCodeSVG text={qrUrl.trim()} size={220} />
              <p className="text-[10px]" style={{ color: COLORS.textMuted }}>
                Generado directamente en la app, sin depender de internet ni de ningún servicio externo.
              </p>
            </div>
          )}
        </div>
      )}

      {showDailyActivity && (() => {
        let filteredActivity = dailyActivity || [];
        if (activityStudentFilter) filteredActivity = filteredActivity.filter((r) => r.studentName === activityStudentFilter);
        if (activityDateFrom) { const from = new Date(activityDateFrom + "T00:00:00"); filteredActivity = filteredActivity.filter((r) => r.date >= from); }
        if (activityDateTo) { const to = new Date(activityDateTo + "T23:59:59"); filteredActivity = filteredActivity.filter((r) => r.date <= to); }
        const groups = [];
        filteredActivity.forEach((row) => {
          const key = row.date.toDateString();
          let g = groups.find((x) => x.key === key);
          if (!g) { g = { key, date: row.date, rows: [] }; groups.push(g); }
          g.rows.push(row);
        });
        const studentNames = [...new Set(roster.map((r) => r.name))].sort();
        return (
          <div className="rounded-xl p-4 mb-6" style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold" style={{ color: COLORS.textPrimary, fontFamily: "'Oswald', sans-serif" }}>ACTIVIDAD DIARIA — TODOS LOS ALUMNOS</div>
              <button onClick={loadDailyActivity} disabled={loadingActivity} className="text-xs underline" style={{ color: COLORS.textMuted }}>
                {loadingActivity ? "Actualizando…" : "Actualizar"}
              </button>
            </div>
            <p className="text-xs mb-3" style={{ color: COLORS.textMuted }}>
              Sesiones que tus alumnos ya marcaron como completadas, de más reciente a más antigua — sin esperar a que termine la semana.
            </p>
            <div className="flex flex-wrap gap-2 mb-3">
              <select value={activityStudentFilter} onChange={(e) => setActivityStudentFilter(e.target.value)}
                className="rounded-lg px-2 py-1.5 text-xs" style={{ background: COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                <option value="">Todos los alumnos</option>
                {studentNames.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <div className="flex items-center gap-1">
                <label className="text-xs" style={{ color: COLORS.textMuted }}>Desde</label>
                <input type="date" value={activityDateFrom} onChange={(e) => setActivityDateFrom(e.target.value)}
                  className="rounded-lg px-2 py-1.5 text-xs" style={{ background: COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
              </div>
              <div className="flex items-center gap-1">
                <label className="text-xs" style={{ color: COLORS.textMuted }}>Hasta</label>
                <input type="date" value={activityDateTo} onChange={(e) => setActivityDateTo(e.target.value)}
                  className="rounded-lg px-2 py-1.5 text-xs" style={{ background: COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
              </div>
              {(activityStudentFilter || activityDateFrom || activityDateTo) && (
                <button onClick={() => { setActivityStudentFilter(""); setActivityDateFrom(""); setActivityDateTo(""); }}
                  className="text-xs underline" style={{ color: COLORS.textMuted }}>
                  Quitar filtros
                </button>
              )}
            </div>
            {loadingActivity && <p className="text-sm" style={{ color: COLORS.textMuted }}>Cargando…</p>}
            {!loadingActivity && groups.length === 0 && <p className="text-sm" style={{ color: COLORS.textMuted }}>No hay sesiones para mostrar con estos filtros.</p>}
            <div className="space-y-4 max-h-[32rem] overflow-y-auto">
              {groups.map((g) => (
                <div key={g.key}>
                  <div className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: COLORS.track }}>
                    {DAYS[(g.date.getDay() + 6) % 7]} {String(g.date.getDate()).padStart(2, "0")}/{String(g.date.getMonth() + 1).padStart(2, "0")}
                  </div>
                  <div className="space-y-1.5">
                    {g.rows.map((r, i) => (
                      <div key={i} className="rounded-lg p-2.5 text-sm" style={{ background: COLORS.surface2 }}>
                        <div className="flex items-center justify-between flex-wrap gap-1">
                          <span className="font-semibold" style={{ color: COLORS.textPrimary }}>{r.studentName}</span>
                          <span style={{ color: COLORS.textMuted }}>{r.type}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs mt-1 flex-wrap" style={{ color: COLORS.textMuted }}>
                          <span>{r.actualKm} km{r.actualKm !== r.plannedKm ? ` (plan: ${r.plannedKm} km)` : ""}</span>
                          {r.rpe != null && <span>RPE {r.rpe}</span>}
                        </div>
                        {r.note && <p className="text-xs mt-1 italic" style={{ color: COLORS.textMuted }}>"{r.note}"</p>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {showPaceAlerts && (
        <div className="rounded-xl p-4 mb-6" style={{ background: COLORS.surface, border: `1px solid ${COLORS.moderate}` }}>
          <div className="text-sm font-semibold mb-3" style={{ color: COLORS.textPrimary, fontFamily: "'Oswald', sans-serif" }}>AJUSTES DE RITMO SUGERIDOS</div>
          <p className="text-xs mb-4" style={{ color: COLORS.textMuted }}>
            Se generan cuando un alumno falla el ritmo objetivo (10-15+ seg/km más lento) en martes y/o jueves. Revisa la nota del alumno antes de decidir.
          </p>
          <div className="space-y-2">
            {paceAlerts.filter((a) => a.status === "pending").length === 0 && (
              <p className="text-sm" style={{ color: COLORS.textMuted }}>No hay ajustes pendientes.</p>
            )}
            {paceAlerts.filter((a) => a.status === "pending").slice().reverse().map((a) => (
              <div key={a.id} className="rounded-lg p-3" style={{ background: COLORS.surface2, border: `1px solid ${COLORS.border}` }}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="text-sm font-semibold" style={{ color: COLORS.textPrimary }}>{a.studentName} · Semana {a.weekNumber}</div>
                  <Pill color={COLORS.moderate}>
                    {a.trigger === "general" ? "Ajuste general (martes y jueves)" : a.trigger === "q1" ? "Solo martes" : "Solo jueves"}
                  </Pill>
                </div>
                <div className="text-xs mt-2 space-y-1" style={{ color: COLORS.textMuted }}>
                  {a.q1TargetPace != null && (
                    <div>Martes: objetivo {formatPace(a.q1TargetPace)}/km, real {a.q1ActualPace || "—"}/km{a.q1Note ? ` · Nota: "${a.q1Note}"` : ""}</div>
                  )}
                  {a.q2TargetPace != null && (
                    <div>Jueves: objetivo {formatPace(a.q2TargetPace)}/km, real {a.q2ActualPace || "—"}/km{a.q2Note ? ` · Nota: "${a.q2Note}"` : ""}</div>
                  )}
                </div>
                <div className="flex gap-2 mt-3">
                  <button onClick={() => resolvePaceAlert(a, true)} disabled={busy}
                    className="px-3 py-1.5 rounded text-xs font-semibold" style={{ background: COLORS.track, color: COLORS.lane }}>
                    Aplicar ajuste
                  </button>
                  <button onClick={() => resolvePaceAlert(a, false)} disabled={busy}
                    className="px-3 py-1.5 rounded text-xs" style={{ color: COLORS.textMuted }}>
                    Descartar (fue algo puntual)
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showReports ? (
        <div className="rounded-xl p-4" style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}>
          <div className="text-sm font-semibold mb-3" style={{ color: COLORS.textPrimary, fontFamily: "'Oswald', sans-serif" }}>REPORTES SEMANALES</div>
          <p className="text-xs mb-4" style={{ color: COLORS.textMuted }}>Se genera un reporte cada vez que se cierra una semana. No llega por correo ni notificación push.</p>
          <div className="space-y-2">
            {reports.length === 0 && <p className="text-sm" style={{ color: COLORS.textMuted }}>Aún no hay reportes semanales.</p>}
            {reports.slice().sort((a, b) => new Date(b.closedAt) - new Date(a.closedAt)).map((r) => (
              <div key={r.id} className="rounded-lg p-3" style={{ background: COLORS.surface2, border: `1px solid ${COLORS.border}` }}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="text-sm font-semibold" style={{ color: COLORS.textPrimary }}>{r.studentName} · Semana {r.weekNumber}</div>
                  <AdherenceBadge pct={r.adherencePct} />
                </div>
                <div className="text-xs mt-1" style={{ color: COLORS.textMuted }}>{PHASE_LABEL[r.phase] || r.phase} · {r.weeklyKm} km{r.avgRpe ? ` · RPE prom. ${r.avgRpe.toFixed(1)}` : ""}</div>
                <div className="text-xs mt-2" style={{ color: COLORS.textMuted }}>{r.note}</div>
                <div className="text-[10px] mt-2" style={{ color: COLORS.textMuted }}>{new Date(r.closedAt).toLocaleString("es-PE")}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
      <div className="space-y-6">
        <div>
          <button onClick={() => setShowAdd((v) => !v)}
            className="w-full mb-3 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold"
            style={{ background: COLORS.track, color: COLORS.lane }}>
            <Plus size={16} /> Añadir alumno
          </button>
          {showAdd && <AddStudentForm onCancel={() => setShowAdd(false)} onCreate={createStudent} />}
          {pendingCreate && (
            <div className="rounded-xl p-4 mb-4" style={{ background: COLORS.moderate + "18", border: `1px solid ${COLORS.moderate}` }}>
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle size={16} style={{ color: COLORS.moderate }} />
                <span className="text-sm font-semibold" style={{ color: COLORS.textPrimary }}>El plan inicial tiene algo que revisar</span>
              </div>
              <ul className="text-xs mb-3 space-y-1 list-disc pl-4" style={{ color: COLORS.textMuted }}>
                {pendingCreate.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
              <div className="flex gap-2">
                <button onClick={() => createStudent({ ...pendingCreate.args, forceCreate: true })} disabled={busy}
                  className="px-3 py-1.5 rounded text-xs font-semibold" style={{ background: COLORS.moderate, color: COLORS.bg }}>
                  Crear de todas formas
                </button>
                <button onClick={() => setPendingCreate(null)} className="px-3 py-1.5 rounded text-xs" style={{ color: COLORS.textMuted }}>
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {roster.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              <button onClick={loadRosterProgress} title="Actualizar progreso semanal de todos los alumnos"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
                style={{ background: COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                <RefreshCcw size={12} /> Actualizar progreso
              </button>
              <button onClick={() => setStatusFilter(statusFilter === "waiting" ? null : "waiting")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
                style={{
                  background: (statusFilter === "waiting" || waitingCount > 0) ? COLORS.track : COLORS.surface2,
                  color: COLORS.lane,
                  border: `1px solid ${COLORS.track}${waitingCount > 0 ? "" : "55"}`,
                  boxShadow: waitingCount > 0 ? `0 0 0 3px ${COLORS.track}22` : "none",
                }}>
                <Clock size={12} /> {waitingCount} esperando aprobación
              </button>
              <button onClick={() => setStatusFilter(statusFilter === "low" ? null : "low")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
                style={{ background: statusFilter === "low" ? COLORS.track : COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.track}55` }}>
                <TrendingDown size={12} /> {lowAdherenceCount} con adherencia baja
              </button>
              <button onClick={() => setStatusFilter(statusFilter === "paused" ? null : "paused")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
                style={{ background: statusFilter === "paused" ? COLORS.track : COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.track}55` }}>
                ⏸ {pausedCount} pausados
              </button>
              <select value={goalFilter} onChange={(e) => setGoalFilter(e.target.value)}
                className="px-3 py-1.5 rounded-full text-xs font-semibold" style={{ background: goalFilter ? COLORS.track : COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.track}55` }}>
                <option value="">Todos los objetivos</option>
                {GOALS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
              </select>
              {(statusFilter || goalFilter) && (
                <button onClick={() => { setStatusFilter(null); setGoalFilter(""); }} className="text-xs underline" style={{ color: COLORS.textMuted }}>
                  Quitar filtro
                </button>
              )}
            </div>
          )}

          <div className="relative mb-3">
            <Search size={16} style={{ position: "absolute", left: 12, top: 12, color: COLORS.textMuted }} />
            <input type="text" placeholder="Busca un alumno por nombre" value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 rounded-lg text-sm" style={{ background: COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
          </div>

          <div className="space-y-2">
            {roster.length === 0 && <p className="text-sm px-1" style={{ color: COLORS.textMuted }}>Aún no tienes alumnos registrados.</p>}
            {roster.length > 0 && filteredRoster.length === 0 && <p className="text-sm px-1" style={{ color: COLORS.textMuted }}>Sin resultados para "{search}".</p>}
            {filteredRoster.map((r) => (
              <button key={r.id} onClick={() => setSelectedId(selectedId === r.id ? null : r.id)}
                className="w-full text-left rounded-lg p-3 flex items-center justify-between transition-colors"
                style={{
                  background: r.waitingApproval ? COLORS.track + "1A" : (selectedId === r.id ? COLORS.surface2 : COLORS.surface),
                  border: `${r.waitingApproval ? 2 : 1}px solid ${r.waitingApproval ? COLORS.track : (selectedId === r.id ? COLORS.track : COLORS.border)}`,
                  boxShadow: r.waitingApproval ? `0 0 0 3px ${COLORS.track}22` : "none",
                }}>
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate flex items-center gap-2" style={{ color: COLORS.textPrimary }}>
                    {r.name}
                  </div>
                  {r.waitingApproval && (
                    <div className="flex items-center gap-1.5 mt-1 px-2 py-0.5 rounded-full w-fit" style={{ background: COLORS.track }}>
                      <Check size={11} style={{ color: COLORS.lane }} />
                      <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: COLORS.lane }}>
                        Semana enviada · cerrar y generar la siguiente
                      </span>
                    </div>
                  )}
                  <div className="text-xs mt-0.5" style={{ color: COLORS.textMuted }}>
                    {GOAL_LABEL[r.goal]} · {LEVEL_LABEL[r.level]} · Semana {r.weekNumber}
                    {r.raceDate ? ` · faltan ${weeksBetween(r.raceDate)} sem.` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  {rosterProgress[r.id]?.autoPublished && (
                    <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded" title="La semana se publicó automáticamente y todavía no la revisaste"
                      style={{ background: COLORS.moderate + "22", color: COLORS.moderate, border: `1px solid ${COLORS.moderate}66` }}>
                      Auto
                    </span>
                  )}
                  {rosterProgress[r.id] && rosterProgress[r.id].total > 0 && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: COLORS.bg, color: COLORS.textMuted, border: `1px solid ${COLORS.border}` }}>
                      {rosterProgress[r.id].completed} de {rosterProgress[r.id].total}
                    </span>
                  )}
                  <AdherenceBadge compliance={rosterProgress[r.id]?.compliance} />
                  {selectedId === r.id ? <ChevronDown size={14} style={{ color: COLORS.track }} /> : <ChevronRight size={14} style={{ color: COLORS.textMuted }} />}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div>
          {!student && !selectedId && (
            <div className="rounded-xl p-10 text-center" style={{ background: COLORS.surface, border: `1px dashed ${COLORS.border}` }}>
              <Activity size={28} style={{ color: COLORS.textMuted, margin: "0 auto" }} />
              <p className="mt-3 text-sm" style={{ color: COLORS.textMuted }}>Busca y selecciona un alumno para ver y ajustar su plan semanal.</p>
            </div>
          )}
          {!student && selectedId && studentLoading && (
            <div className="rounded-xl p-10 text-center" style={{ background: COLORS.surface, border: `1px dashed ${COLORS.border}` }}>
              <p className="text-sm" style={{ color: COLORS.textMuted }}>Cargando…</p>
            </div>
          )}
          {!student && selectedId && !studentLoading && (
            <div className="rounded-xl p-6 text-center" style={{ background: COLORS.surface, border: `1px dashed ${COLORS.track}` }}>
              <AlertCircle size={24} style={{ color: COLORS.track, margin: "0 auto" }} />
              <p className="mt-3 text-sm" style={{ color: COLORS.textPrimary }}>No se encontró el registro de este alumno.</p>
              <p className="mt-1 text-xs" style={{ color: COLORS.textMuted }}>Aparece en la lista pero su información ya no existe (registro huérfano). Puedes quitarlo de la lista y volver a crearlo.</p>
              <button onClick={async () => {
                setBusy(true);
                const freshRoster = (await safeGet("roster")) || roster;
                await safeSet("roster", freshRoster.filter((r) => r.id !== selectedId));
                setSelectedId(null);
                refreshRoster();
                setBusy(false);
              }} disabled={busy} className="mt-3 px-4 py-1.5 rounded text-sm font-semibold" style={{ background: COLORS.track, color: COLORS.lane }}>
                Quitar de la lista
              </button>
            </div>
          )}

          {student && week && (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <div className="text-2xl font-semibold" style={{ fontFamily: "'Oswald', sans-serif", color: COLORS.textPrimary }}>{student.name}</div>
                  <div className="flex items-center gap-1 mt-1 mb-1">
                    <button onClick={() => setViewedWeek(Math.max(1, activeWeekNum - 1))} disabled={activeWeekNum <= 1}
                      className="p-1 rounded disabled:opacity-30" style={{ color: COLORS.textMuted }}>
                      <ChevronLeft size={16} />
                    </button>
                    <span className="text-xs" style={{ color: COLORS.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>
                      {getWeekDateRange(student, activeWeekNum)}
                    </span>
                    <button onClick={() => setViewedWeek(Math.min(student.currentWeek, activeWeekNum + 1))} disabled={activeWeekNum >= student.currentWeek}
                      className="p-1 rounded disabled:opacity-30" style={{ color: COLORS.textMuted }}>
                      <ChevronRight size={16} />
                    </button>
                    {!isViewingLive && (
                      <button onClick={() => setViewedWeek(null)} className="text-xs underline ml-1" style={{ color: COLORS.track }}>volver a la semana actual</button>
                    )}
                    {!isViewingLive && getWeekDates(student, activeWeekNum).sunday >= new Date() && (
                      <button onClick={reopenWeek} disabled={busy}
                        className="flex items-center gap-1 text-xs px-2 py-1 rounded font-semibold ml-2"
                        style={{ background: COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.track}` }}>
                        <RotateCw size={12} /> Reabrir esta semana
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <Pill color={COLORS.track}>{getWeekTitle(student, activeWeekNum)}{week.weeklyKm != null ? ` · ${week.weeklyKm} km` : ""}{!isViewingLive ? " (solo lectura)" : ""}</Pill>
                    <Pill color={COLORS.moderate}>{PHASE_LABEL[week.phase]}{student.raceDate ? ` · faltan ${getDisplayWeekLabel(student, activeWeekNum)} sem.` : ""}</Pill>
                    {isViewingLive && week.submitted && <Pill color={COLORS.track}>Esperando tu aprobación</Pill>}
                    {isViewingLive && week.paused && <Pill color={COLORS.moderate}>⏸ Semana pausada</Pill>}
                    {/* "Por adelantado" solo si de verdad lo está: que su lunes todavía no haya
                        llegado. Antes se mostraba también en la semana en curso, y ahora que una
                        semana puede publicarse el propio lunes, decirlo sería directamente falso. */}
                    {!student.weeks[activeWeekNum]?.submitted && activeWeekNum >= student.currentWeek && activeWeekNum > getTodayWeekNum(student) && <Pill color={COLORS.lane}>📅 Preparada por adelantado</Pill>}
                  </div>
                  {showObjetivoInfo && (
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <Pill color={COLORS.lane}>{GOAL_LABEL[student.goal]}</Pill>
                      <Pill color={COLORS.lane}>{LEVEL_LABEL[student.level]}</Pill>
                      {student.targetPaceStr && <Pill color={COLORS.lane}>Objetivo: {student.targetPaceStr}/km</Pill>}
                      <button onClick={() => setShowChangeGoal((v) => !v)}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                        style={{ background: showChangeGoal ? COLORS.track : COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.track}55` }}>
                        <Edit3 size={11} /> Cambiar objetivo
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {!proposal && isViewingLive && (
                    <button onClick={openProposal} disabled={busy}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
                      style={{ background: COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.track}` }}>
                      <RotateCw size={14} /> Cerrar semana y generar siguiente
                    </button>
                  )}
                  <button onClick={() => setShowPanorama((v) => !v)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold"
                    style={{ background: showPanorama ? COLORS.track : COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                    <BarChart2 size={14} /> Panorama
                  </button>
                  <button onClick={() => setShowRitmos((v) => !v)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold"
                    style={{ background: showRitmos ? COLORS.track : COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                    <Activity size={14} /> Ritmos
                  </button>
                  <button onClick={() => setShowKmSummary((v) => !v)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold"
                    style={{ background: showKmSummary ? COLORS.track : COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                    <BarChart2 size={14} /> Kilometraje
                  </button>
                  <button onClick={() => setShowObjetivoInfo((v) => !v)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold"
                    style={{ background: showObjetivoInfo ? COLORS.track : COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                    <Flag size={14} /> Objetivo
                  </button>
                  <button onClick={() => setShowEditUser((v) => !v)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold"
                    style={{ background: showEditUser ? COLORS.track : COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                    <Edit3 size={14} /> Editar usuario
                  </button>
                  <button onClick={() => setShowOtros((v) => !v)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold"
                    style={{ background: showOtros ? COLORS.track : COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                    <RotateCw size={14} /> Otros
                  </button>
                </div>
              </div>

              {showEditUser && (
                <div className="rounded-lg p-3 mb-4 flex flex-wrap gap-2" style={{ background: COLORS.surface2, border: `1px solid ${COLORS.border}` }}>
                  <button onClick={() => setShowNameChange((v) => !v)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold"
                    style={{ background: showNameChange ? COLORS.track : COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                    <Edit3 size={14} /> Cambiar nombre
                  </button>
                  <button onClick={() => setShowPinChange((v) => !v)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold"
                    style={{ background: showPinChange ? COLORS.track : COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                    <KeyRound size={14} /> Cambiar PIN
                  </button>
                  {!deleteConfirm ? (
                    <button onClick={() => setDeleteConfirm(true)}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold"
                      style={{ background: COLORS.bg, color: COLORS.track, border: `1px solid ${COLORS.track}` }}>
                      <Trash2 size={14} /> Eliminar alumno
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-xs" style={{ color: COLORS.textMuted }}>¿Eliminar a {student.name}?</span>
                      <button onClick={deleteStudent} disabled={busy} className="px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: COLORS.track, color: COLORS.lane }}>Confirmar</button>
                      <button onClick={() => setDeleteConfirm(false)} className="px-3 py-2 rounded-lg text-xs" style={{ color: COLORS.textMuted }}>Cancelar</button>
                    </div>
                  )}
                </div>
              )}

              {showOtros && (
                <div className="rounded-lg p-3 mb-4 flex flex-wrap gap-2" style={{ background: COLORS.surface2, border: `1px solid ${COLORS.border}` }}>
                  {isViewingLive && (
                    <button onClick={refreshTitles} disabled={busy}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold"
                      style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                      <RefreshCcw size={14} /> Actualizar títulos
                    </button>
                  )}
                  {isViewingLive && !isFitnessGoal(student.goal) && student.level !== "principiante" && (
                    <button onClick={() => setShowIntermediateRace((v) => !v)} disabled={busy}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold"
                      style={{ background: showIntermediateRace ? COLORS.track : COLORS.bg, color: COLORS.lane, border: `1px solid ${showIntermediateRace ? COLORS.track : COLORS.border}` }}>
                      <Flag size={14} /> Carrera intermedia
                    </button>
                  )}
                  {isViewingLive && (isFitnessGoal(student.goal) || student.level === "principiante") && (
                    <button onClick={() => { setShowRollback((v) => !v); setRollbackStage((student.beginnerStage ?? 0)); }} disabled={busy}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold"
                      style={{ background: showRollback ? COLORS.track : COLORS.bg, color: COLORS.lane, border: `1px solid ${showRollback ? COLORS.track : COLORS.border}` }}>
                      <ChevronLeft size={14} /> Retomar en otra semana
                    </button>
                  )}
                  {isViewingLive && (
                    <button onClick={togglePauseWeek} disabled={busy}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold"
                      style={{ background: week.paused ? COLORS.moderate : COLORS.bg, color: week.paused ? COLORS.bg : COLORS.lane, border: `1px solid ${week.paused ? COLORS.moderate : COLORS.border}` }}>
                      <Clock size={14} /> {week.paused ? "Reanudar semana" : "Pausar semana (lesión/viaje)"}
                    </button>
                  )}
                  {!resetConfirm ? (
                    <button onClick={() => setResetConfirm(true)}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold"
                      style={{ background: COLORS.bg, color: COLORS.track, border: `1px solid ${COLORS.track}` }}>
                      <RefreshCcw size={14} /> Reiniciar plan
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-xs" style={{ color: COLORS.textMuted }}>¿Borrar todo el progreso?</span>
                      <button onClick={resetPlan} disabled={busy} className="px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: COLORS.track, color: COLORS.lane }}>Confirmar</button>
                      <button onClick={() => setResetConfirm(false)} className="px-3 py-2 rounded-lg text-xs" style={{ color: COLORS.textMuted }}>Cancelar</button>
                    </div>
                  )}
                </div>
              )}

              {showNameChange && (
                <div className="rounded-lg p-3 mb-4 flex flex-wrap items-center gap-2" style={{ background: COLORS.surface2, border: `1px solid ${COLORS.border}` }}>
                  <input type="text" placeholder={`Nombre actual: ${student.name}`} value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="rounded px-3 py-1.5 text-sm" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
                  <button onClick={changeName} disabled={busy} className="px-3 py-1.5 rounded text-sm font-semibold" style={{ background: COLORS.track, color: COLORS.lane }}>Guardar nombre</button>
                  {nameMsg && <span className="text-xs" style={{ color: COLORS.textMuted }}>{nameMsg}</span>}
                </div>
              )}

              {showPinChange && (
                <div className="rounded-lg p-3 mb-4 flex flex-wrap items-center gap-2" style={{ background: COLORS.surface2, border: `1px solid ${COLORS.border}` }}>
                  <input type="text" inputMode="numeric" maxLength={4} placeholder="Nuevo PIN (4 dígitos)" value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
                    onKeyDown={(e) => e.key === "Enter" && changePin()}
                    className="rounded px-3 py-1.5 text-sm" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
                  <button onClick={changePin} disabled={busy} className="px-3 py-1.5 rounded text-sm font-semibold" style={{ background: COLORS.track, color: COLORS.lane }}>Guardar PIN</button>
                  {pinMsg && <span className="text-xs" style={{ color: COLORS.textMuted }}>{pinMsg}</span>}
                </div>
              )}

              {showChangeGoal && (
                <ChangeGoalForm student={student} busy={busy} onCancel={() => setShowChangeGoal(false)} onSave={changeGoal} />
              )}

              {showRollback && (isFitnessGoal(student.goal) || student.level === "principiante") && (() => {
                const stages = getStageTable(student.goal);
                const current = student.beginnerStage ?? 0;
                const sel = rollbackStage ?? current;
                const s = stages[sel];
                const detail = s.walk > 0
                  ? `${s.reps} x (${s.run}' trote + ${s.walk}' caminata)`
                  : `${s.run}' de trote continuo`;
                return (
                  <div className="rounded-xl p-4 mb-4" style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}>
                    <div className="flex items-center gap-2 mb-1">
                      <ChevronLeft size={16} style={{ color: COLORS.track }} />
                      <div className="text-sm font-semibold" style={{ color: COLORS.textPrimary, fontFamily: "'Oswald', sans-serif" }}>RETOMAR EN OTRA SEMANA</div>
                    </div>
                    <p className="text-xs mb-3" style={{ color: COLORS.textMuted }}>
                      Después de una pausa larga (viaje, lesión), elige en qué punto del plan retomar.
                      Se crea una semana nueva con esa carga — el historial anterior no se borra.
                    </p>
                    <label className="block text-[10px] uppercase tracking-wide mb-1" style={{ color: COLORS.textMuted }}>
                      Retomar en
                    </label>
                    <select value={sel} onChange={(e) => setRollbackStage(Number(e.target.value))}
                      className="w-full rounded px-3 py-2 text-sm mb-3" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                      {stages.map((st, i) => (
                        <option key={i} value={i}>
                          {st.label}{i === current ? " · etapa actual" : i < current ? "  (retrocede)" : "  (adelanta)"}
                        </option>
                      ))}
                    </select>
                    <div className="rounded-lg px-3 py-2 mb-3" style={{ background: COLORS.bg, borderLeft: `3px solid ${COLORS.track}` }}>
                      <div className="text-xs" style={{ color: COLORS.lane }}>
                        Sesión principal: <span style={{ fontFamily: "'JetBrains Mono', monospace", color: COLORS.track }}>{detail}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => rollbackToStage(sel)} disabled={busy}
                        className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: COLORS.track, color: COLORS.lane }}>
                        Generar la semana con esta carga
                      </button>
                      <button onClick={() => setShowRollback(false)} className="px-3 py-2 rounded-lg text-sm" style={{ color: COLORS.textMuted }}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                );
              })()}

              {showIntermediateRace && (
                <div className="rounded-xl p-4 mb-4" style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}>
                  <div className="flex items-center gap-2 mb-1">
                    <Flag size={16} style={{ color: COLORS.track }} />
                    <div className="text-sm font-semibold" style={{ color: COLORS.textPrimary, fontFamily: "'Oswald', sans-serif" }}>CARRERA INTERMEDIA</div>
                  </div>
                  {student.intermediateRace ? (
                    <div>
                      <p className="text-xs mb-3" style={{ color: COLORS.textMuted }}>
                        Activa: <span style={{ color: COLORS.lane, fontWeight: 600 }}>{GOALS.find((g) => g.id === student.intermediateRace.goalId)?.label}</span> el {(() => { const d = new Date(student.intermediateRace.date + "T00:00:00"); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`; })()} — ajustando la semana {student.intermediateRace.raceWeekNum} y la {student.intermediateRace.recoveryWeekNum}.
                      </p>
                      <button onClick={removeIntermediateRace} disabled={busy}
                        className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: COLORS.bg, color: COLORS.track, border: `1px solid ${COLORS.track}` }}>
                        Volver al plan original (quitar carrera intermedia)
                      </button>
                    </div>
                  ) : (
                    <>
                  <p className="text-xs mb-3" style={{ color: COLORS.textMuted }}>
                    Se ajustan solo la semana de la carrera y la siguiente — el resto del plan sigue exactamente igual.
                  </p>
                  <div className="grid sm:grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="block text-[10px] uppercase tracking-wide mb-1" style={{ color: COLORS.textMuted }}>Distancia</label>
                      <select value={interRaceGoal} onChange={(e) => setInterRaceGoal(e.target.value)}
                        className="w-full rounded px-3 py-2 text-sm" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                        {GOALS.filter((g) => !isFitnessGoal(g.id)).map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-wide mb-1" style={{ color: COLORS.textMuted }}>Fecha de la carrera</label>
                      <input type="date" value={interRaceDate} onChange={(e) => setInterRaceDate(e.target.value)}
                        className="w-full rounded px-3 py-2 text-sm" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }} />
                    </div>
                  </div>
                  {interRaceDate && (() => {
                    const preview = computeIntermediateRaceOverrides(student, interRaceGoal, interRaceDate);
                    return (
                      <div className="space-y-2 mb-3">
                        <div className="text-[10px] uppercase tracking-wide" style={{ color: COLORS.textMuted }}>Se va a ajustar</div>
                        <div className="rounded-lg px-3 py-2 flex items-center justify-between" style={{ background: COLORS.bg, borderLeft: `3px solid ${COLORS.track}` }}>
                          <span className="text-xs" style={{ color: COLORS.lane }}>Semana {preview.raceWeekNum} · puesta a punto — {GOALS.find((g) => g.id === interRaceGoal)?.label} el domingo</span>
                          <span className="text-xs font-bold" style={{ color: COLORS.track }}>{preview.taperVolume} km</span>
                        </div>
                        <div className="rounded-lg px-3 py-2 flex items-center justify-between" style={{ background: COLORS.bg, borderLeft: `3px solid ${COLORS.moderate}` }}>
                          <span className="text-xs" style={{ color: COLORS.lane }}>Semana {preview.recoveryWeekNum} · recuperación — umbral corto (25')</span>
                          <span className="text-xs font-bold" style={{ color: COLORS.moderate }}>{preview.recoveryVolume} km</span>
                        </div>
                        <div className="text-xs" style={{ color: COLORS.textMuted }}>Semana {preview.recoveryWeekNum + 1} en adelante: sin ningún cambio.</div>
                      </div>
                    );
                  })()}
                  <div className="flex gap-2">
                    <button onClick={applyIntermediateRace} disabled={busy || !interRaceDate}
                      className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: COLORS.track, color: COLORS.lane, opacity: !interRaceDate ? 0.5 : 1 }}>
                      Aplicar carrera intermedia
                    </button>
                    <button onClick={() => setShowIntermediateRace(false)} className="px-3 py-2 rounded-lg text-sm" style={{ color: COLORS.textMuted }}>
                      Cancelar
                    </button>
                  </div>
                  </>
                  )}
                </div>
              )}

              {showRitmos && (
                <div className="rounded-xl p-4 mb-4" style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}>
                  <div className="text-sm font-semibold mb-3" style={{ color: COLORS.textPrimary, fontFamily: "'Oswald', sans-serif" }}>RITMOS DE ENTRENAMIENTO</div>
                  <p className="text-xs mb-3" style={{ color: COLORS.textMuted }}>Referencia completa de los ritmos que se manejan con este alumno, según su ritmo maratón (VDOT).</p>
                  <RitmosPanel student={student} busy={busy} onSave={saveRitmos} />
                </div>
              )}

              {showKmSummary && (() => {
                const history = getStudentKmHistory(student);
                const grandTotal = r1(history.reduce((sum, r) => sum + r.km, 0));
                const rows = kmGroupBy === "week"
                  ? history.map((r) => ({ label: `Semana ${r.weekNum} (${getWeekDateRange(student, r.weekNum)})`, km: r.km }))
                  : aggregateKmHistory(history, kmGroupBy);
                return (
                  <div className="rounded-xl p-4 mb-4" style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}>
                    <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                      <div className="text-sm font-semibold" style={{ color: COLORS.textPrimary, fontFamily: "'Oswald', sans-serif" }}>KILOMETRAJE ACUMULADO</div>
                      <div className="flex gap-1">
                        {[["week", "Semanas"], ["month", "Meses"], ["year", "Años"]].map(([key, label]) => (
                          <button key={key} onClick={() => setKmGroupBy(key)}
                            className="px-3 py-1 rounded-lg text-xs font-semibold"
                            style={{ background: kmGroupBy === key ? COLORS.track : COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <p className="text-xs mb-3" style={{ color: COLORS.textMuted }}>
                      Kilometraje real registrado (lo efectivamente corrido, no lo planeado) desde que este alumno inició. Total acumulado: <b style={{ color: COLORS.textPrimary }}>{grandTotal} km</b>.
                    </p>
                    {rows.length === 0 && <p className="text-sm" style={{ color: COLORS.textMuted }}>Todavía no hay sesiones registradas.</p>}
                    <div className="space-y-1 max-h-80 overflow-y-auto">
                      {[...rows].reverse().map((r, i) => (
                        <div key={i} className="flex items-center justify-between text-sm px-2 py-1.5 rounded" style={{ background: COLORS.surface2 }}>
                          <span style={{ color: COLORS.textMuted }}>{r.label}</span>
                          <span className="font-mono font-semibold" style={{ color: COLORS.textPrimary }}>{r.km} km</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {showPanorama && (
                <div className="rounded-xl p-4 mb-4" style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}>
                  <div className="text-sm font-semibold mb-3" style={{ color: COLORS.textPrimary, fontFamily: "'Oswald', sans-serif" }}>PANORAMA: VOLUMEN Y ESTRUCTURA SEMANAL</div>
                  <p className="text-xs mb-3" style={{ color: COLORS.textMuted }}>Proyección hasta la carrera: 3 semanas de carga + 1 de asimilación, con afinamiento al final. Puedes editar el volumen de semanas futuras.</p>
                  <PanoramaPanel data={panoramaData} student={student} currentWeek={student.currentWeek} edits={panoramaEdits} longEdits={panoramaLongEdits} qualityEdits={qualityEdits}
                    onEdit={(wk, val) => setPanoramaEdits((e) => ({ ...e, [wk]: val }))}
                    onEditLong={(wk, val) => setPanoramaLongEdits((e) => ({ ...e, [wk]: val }))}
                    onEditQuality={handleEditQuality}
                    onSave={savePanorama} busy={busy} />
                </div>
              )}

              {anomalyWarnings && (
                <div className="rounded-xl p-4 mb-4" style={{ background: COLORS.moderate + "18", border: `1px solid ${COLORS.moderate}` }}>
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle size={16} style={{ color: COLORS.moderate }} />
                    <span className="text-sm font-semibold" style={{ color: COLORS.textPrimary }}>Esta semana tiene algo que revisar</span>
                  </div>
                  <ul className="text-xs mb-3 space-y-1 list-disc pl-4" style={{ color: COLORS.textMuted }}>
                    {anomalyWarnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                  <div className="flex gap-2">
                    <button onClick={() => confirmProposal(true)} disabled={busy} className="px-3 py-1.5 rounded text-xs font-semibold" style={{ background: COLORS.moderate, color: COLORS.bg }}>
                      Aplicar de todas formas
                    </button>
                    <button onClick={() => setAnomalyWarnings(null)} className="px-3 py-1.5 rounded text-xs" style={{ color: COLORS.textMuted }}>
                      Volver a revisar
                    </button>
                  </div>
                </div>
              )}
              {proposal && (
                <ProposalPanel proposal={proposal} values={proposalValues} setValues={setProposalValues}
                  onConfirm={confirmProposal} onCancel={() => setProposal(null)} busy={busy}
                  weekDateRange={getWeekDateRange(student, student.currentWeek + 1)} />
              )}

              {week.inactive && (
                <div className="rounded-lg p-3 mb-4 text-sm flex items-start gap-2" style={{ background: COLORS.moderate + "18", border: `1px solid ${COLORS.moderate}55`, color: COLORS.moderate }}>
                  <Clock size={14} style={{ marginTop: 2, flexShrink: 0 }} />
                  Semana sin actividad registrada — el alumno no entrenó ni registró nada en estas fechas.
                </div>
              )}
              {/* Semana que la app publicó sola porque no se confirmó a tiempo. Se avisa
                  acá para que el coach la revise: el alumno ya la está viendo. */}
              {week.autoPublished && !week.inactive && (
                <div className="rounded-lg p-3 mb-4 text-sm" style={{ background: COLORS.moderate + "18", border: `1px solid ${COLORS.moderate}99` }}>
                  <div className="flex items-start gap-2 mb-1.5">
                    <AlertCircle size={14} style={{ color: COLORS.moderate, marginTop: 2, flexShrink: 0 }} />
                    <span className="font-semibold" style={{ color: COLORS.textPrimary }}>
                      Esta semana se publicó automáticamente — conviene revisarla
                    </span>
                  </div>
                  <p className="text-xs mb-2" style={{ color: COLORS.textMuted }}>
                    {week.autoPublishedKind === "repetida"
                      ? "El alumno venía de semanas sin plan, así que se repitió una estructura anterior sin avanzar el ciclo. Si corresponde retomar en otra etapa, cambiala."
                      : "Es la sugerencia del sistema, sin tus ajustes. El alumno ya la tiene disponible; cualquier cambio que hagas le llega al instante."}
                  </p>
                  <p className="text-xs" style={{ color: COLORS.textMuted }}>{week.note}</p>
                  <button onClick={markAutoWeekReviewed} disabled={busy}
                    className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold"
                    style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                    <Check size={12} /> Revisada, está bien así
                  </button>
                </div>
              )}
              {week.note && !week.inactive && !week.autoPublished && (
                <div className="rounded-lg p-3 mb-4 text-sm flex items-start gap-2" style={{ background: COLORS.surface2, border: `1px solid ${COLORS.border}`, color: COLORS.textMuted }}>
                  <Flag size={14} style={{ color: COLORS.track, marginTop: 2, flexShrink: 0 }} />
                  {week.note}
                </div>
              )}
              {justClosed && (
                <div className="rounded-lg p-3 mb-4 text-sm" style={{ background: COLORS.easy + "18", border: `1px solid ${COLORS.easy}55`, color: COLORS.easy }}>
                  <div className="mb-2">Semana cerrada. Nuevo plan generado: {justClosed}</div>
                  {undoSnapshot && (
                    <button onClick={undoLastClose} disabled={busy}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold"
                      style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                      <RotateCw size={12} style={{ transform: "scaleX(-1)" }} /> Deshacer — volver a la semana {undoSnapshot.closedWeekNumber}
                    </button>
                  )}
                </div>
              )}

              {/* Lo que suma la semana contra su objetivo, a la vista mientras se edita. */}
              {isViewingLive && week.weeklyKm > 0 && (() => {
                const suma = Math.round(week.plan.reduce((t, d) => t + (Number(d?.km) || 0), 0) * 10) / 10;
                const dif = Math.round((suma - week.weeklyKm) * 10) / 10;
                const cuadra = Math.abs(dif) < 0.15;
                return (
                  <div className="text-xs mb-2" style={{ color: cuadra ? COLORS.textMuted : COLORS.moderate }}>
                    Suma de la semana: <b style={{ color: COLORS.lane }}>{suma} km</b> de {week.weeklyKm} km
                    {!cuadra && (dif > 0
                      ? ` · ${dif} km por encima: el fondo y la calidad ya pasan el objetivo`
                      : ` · ${-dif} km por debajo: lo que queda no alcanza para un easy`)}
                  </div>
                );
              })()}
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
                {week.plan.map((d, i) => <LapCard key={i} day={d} index={i} mode={isViewingLive ? "edit" : "view"} log={week.log[i]} esCoach extras={extrasDelDia(week, i, student, activeWeekNum)} onChangeDay={updateDay} onSwapDay={isViewingLive ? swapDays : undefined} />)}
              </div>
              <div className="flex flex-wrap gap-2">
                {isViewingLive && (
                  <button onClick={persistEdits} disabled={busy} className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg font-semibold" style={{ background: savedFlash ? COLORS.easy : COLORS.track, color: COLORS.lane, transition: "background 0.2s ease" }}>
                    {savedFlash ? (<><Check size={14} /> Guardado</>) : "Guardar cambios de esta semana"}
                  </button>
                )}
                <button onClick={() => exportWeekToPDF(student, week, activeWeekNum)} className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg font-semibold" style={{ background: COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                  <Download size={14} /> Exportar a PDF
                </button>
                {/* Solo aparece si el alumno conectó su reloj. Para el resto no hay botón
                    que no lleve a ninguna parte. El coach recibe el registro completo, así
                    que ve el testigo; el alumno recibe solo el indicador "conectado", porque
                    el servidor le quita el testigo antes de responderle. */}
                {(student.intervals?.conectado || student.intervals?.token || student.intervals?.pruebaConClaveDelCoach) && (
                  <button onClick={() => enviarSemanaAlReloj(activeWeekNum)} disabled={busy || enviandoReloj}
                    className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg font-semibold"
                    style={{ background: COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                    <Activity size={14} />
                    {enviandoReloj ? "Enviando…" : "Enviar al reloj"}
                  </button>
                )}
                {envioReloj && (
                  <span className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg"
                    style={{
                      color: envioReloj.ok ? COLORS.easy : COLORS.hard,
                      background: (envioReloj.ok ? COLORS.easy : COLORS.hard) + "18",
                    }}>
                    {envioReloj.ok
                      ? <><Check size={12} /> {envioReloj.enviados} sesiones enviadas · pueden tardar unos minutos en aparecer</>
                      : <><AlertCircle size={12} /> No se pudo enviar ({envioReloj.motivo})</>}
                  </span>
                )}
                <div className="flex items-center gap-1.5">
                  <select value={reportWeekNum ?? activeWeekNum} onChange={(e) => setReportWeekNum(Number(e.target.value))}
                    className="text-sm px-2 py-2 rounded-lg" style={{ background: COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                    {Object.keys(student.weeks).map(Number).sort((a, b) => a - b).map((n) => (
                      <option key={n} value={n}>Semana {n}</option>
                    ))}
                  </select>
                  <button onClick={() => exportWeeklyReport(student, student.weeks[reportWeekNum ?? activeWeekNum], reportWeekNum ?? activeWeekNum)}
                    className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg font-semibold" style={{ background: COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                    <FileText size={14} /> Reporte semanal
                  </button>
                </div>
                <button onClick={() => exportFullPlanOverview(student)} className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg font-semibold" style={{ background: COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                  <BarChart2 size={14} /> Resumen del plan completo
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   STUDENT PORTAL
--------------------------------------------------------- */
/* Conectar el reloj del alumno con intervals.icu.
   Es opcional y reversible: sin esto la app funciona igual. Se dice de forma explícita qué
   se va a hacer con el permiso, porque el alumno está autorizando acceso a su cuenta. */
function ConexionReloj({ student, onCambio, onLectura }) {
  const [estado, setEstado] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [confirmarCorte, setConfirmarCorte] = useState(false);
  const [trayendo, setTrayendo] = useState(false);
  const [avisoLectura, setAvisoLectura] = useState(null);

  const cargar = useCallback(async () => {
    if (!student?.id) return;
    const r = await intervalsOp("estado", student.id);
    setEstado(r);
  }, [student?.id]);
  useEffect(() => { cargar(); }, [cargar]);

  // Al volver de autorizar, la dirección trae el resultado. Se lee, se limpia de la barra
  // (para que no quede pegado al recargar) y se refresca el registro.
  const [aviso, setAviso] = useState(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    const r = p.get("reloj");
    if (!r) return;
    setAviso({ estado: r, motivo: p.get("motivo") });
    window.history.replaceState({}, "", window.location.pathname);
    if (r === "conectado") { cargar(); onCambio?.(); }
  }, [cargar, onCambio]);

  // Ahora el reloj tiene su propia pestaña: si esto no pintara nada, el alumno vería una
  // pantalla en blanco. Mientras carga se dice, y si la conexión no está disponible en el
  // servidor se explica en vez de enseñar un botón que no lleva a ninguna parte.
  if (!estado) {
    return <p className="text-sm" style={{ color: COLORS.textMuted }}>Consultando tu reloj…</p>;
  }
  if (!estado.disponible && !estado.conectado) {
    return (
      <div className="rounded-xl p-4" style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}>
        <p className="text-sm" style={{ color: COLORS.textMuted }}>
          La conexión con relojes no está disponible en este momento. Tus entrenamientos siguen acá como siempre; si
          la necesitás, avisale a tu coach.
        </p>
      </div>
    );
  }

  const conectar = async () => {
    setOcupado(true);
    const r = await intervalsOp("autorizar", student.id);
    if (r?.url) { window.location.href = r.url; return; }
    setAviso({ estado: "error", motivo: r?.motivo || "no-disponible" });
    setOcupado(false);
  };
  // "Actualizar ahora": fuerza la consulta aunque se haya hecho hace poco. El tope baja a
  // un minuto, suficiente para que nadie martille el servicio sin querer.
  const actualizarDesdeElReloj = async () => {
    setTrayendo(true);
    setAvisoLectura(null);
    const r = await intervalsOp("traer", student.id, { forzar: true });
    if (r?.actualizadas || r?.extras) {
      setAvisoLectura(`Listo: ${r.actualizadas} sesión${r.actualizadas === 1 ? "" : "es"} al día.`);
      await onLectura?.();
    } else if (r?.motivo === "permiso-revocado") {
      setAvisoLectura("intervals.icu ya no acepta el permiso. Volvé a conectar tu reloj.");
    } else if (r?.ok) {
      setAvisoLectura("No hay nada nuevo. Si acabás de entrenar, dale unos minutos a que el reloj sincronice.");
    } else {
      setAvisoLectura("No se pudo consultar ahora. Probá en un rato.");
    }
    setTrayendo(false);
    await cargar();
  };

  const desconectar = async () => {
    setOcupado(true);
    await intervalsOp("desconectar", student.id);
    setConfirmarCorte(false);
    await cargar();
    onCambio?.();
    setOcupado(false);
  };

  return (
    <div className="rounded-xl p-4 mb-4" style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}>
      <div className="flex items-center gap-2 mb-1">
        <Activity size={16} style={{ color: estado.conectado ? COLORS.easy : COLORS.textMuted }} />
        <span className="text-sm font-semibold" style={{ color: COLORS.textPrimary }}>
          {estado.conectado ? "Tu reloj está conectado" : "Conectá tu reloj"}
        </span>
      </div>

      {aviso && (
        <p className="text-xs mb-2" style={{ color: aviso.estado === "conectado" ? COLORS.easy : COLORS.hard }}>
          {aviso.estado === "conectado" && "Listo. Tus entrenamientos empezarán a llegarte al reloj."}
          {aviso.estado === "cancelado" && "No autorizaste la conexión. No pasa nada: todo sigue igual."}
          {aviso.estado === "error" && `No se pudo conectar (${aviso.motivo}). Probá de nuevo.`}
        </p>
      )}

      {estado.conectado ? (
        <>
          <p className="text-sm mb-2" style={{ color: COLORS.textMuted }}>
            Tus entrenamientos de la semana te llegan solos al reloj.
            {estado.ultimoEnvio && (
              estado.ultimoEnvio.ok
                ? ` Último envío: semana ${estado.ultimoEnvio.semana}, ${estado.ultimoEnvio.enviados} sesiones.`
                : ` El último envío no salió (${estado.ultimoEnvio.motivo}) — avisale a tu coach si no te aparecen.`
            )}
          </p>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <button type="button" onClick={actualizarDesdeElReloj} disabled={trayendo}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded"
              style={{ background: COLORS.bg, color: COLORS.track, border: `1px solid ${COLORS.track}55`, opacity: trayendo ? 0.6 : 1 }}>
              <RefreshCcw size={11} /> {trayendo ? "Buscando…" : "Traer lo que entrené"}
            </button>
            {avisoLectura && <span className="text-xs" style={{ color: COLORS.textMuted }}>{avisoLectura}</span>}
          </div>

          {confirmarCorte ? (
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs" style={{ color: COLORS.textMuted }}>
                Se quitarán del calendario los entrenamientos futuros. Lo ya entrenado no se toca.
              </span>
              <button onClick={desconectar} disabled={ocupado} className="px-3 py-1.5 rounded text-xs font-semibold"
                style={{ background: COLORS.hard, color: COLORS.lane }}>Sí, desconectar</button>
              <button onClick={() => setConfirmarCorte(false)} className="px-3 py-1.5 rounded text-xs"
                style={{ color: COLORS.textMuted, border: `1px solid ${COLORS.border}` }}>Cancelar</button>
            </div>
          ) : (
            <button onClick={() => setConfirmarCorte(true)} className="underline text-xs" style={{ color: COLORS.textMuted }}>
              Desconectar mi reloj
            </button>
          )}
        </>
      ) : (
        <>
          <p className="text-sm mb-2" style={{ color: COLORS.textMuted }}>
            Si conectás tu cuenta de intervals.icu, los entrenamientos que arma tu coach te
            aparecen solos en el reloj, con sus ritmos. Es opcional y lo podés cortar cuando quieras.
          </p>
          <p className="text-xs mb-3" style={{ color: COLORS.textMuted }}>
            Se piden dos permisos: escribir los entrenamientos en tu calendario y leer las
            actividades que completás. Nada más.
          </p>
          <button onClick={conectar} disabled={ocupado} className="px-4 py-2 rounded-lg text-sm font-semibold"
            style={{ background: COLORS.track, color: COLORS.lane }}>
            {ocupado ? "Abriendo…" : "Conectar mi reloj"}
          </button>
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   ANUNCIOS — el muro del grupo

   Lo usan el coach y los alumnos, con la misma pantalla. Lo que cambia según quién sea
   (quién publica anuncios, quién puede borrar qué, quién ve las lecturas) lo decide el
   servidor con lib/muro.mjs: esta pantalla solo muestra lo que le llega.

   Al abrirlo, primero se carga y recién después se marca como leído: así lo nuevo de esta
   visita se ve resaltado, y el punto rojo se apaga.
--------------------------------------------------------- */
function cuandoFue(iso) {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return "";
  const seg = Math.max(0, (Date.now() - t) / 1000);
  if (seg < 60) return "recién";
  if (seg < 3600) return `hace ${Math.floor(seg / 60)} min`;
  if (seg < 86400) return `hace ${Math.floor(seg / 3600)} h`;
  if (seg < 172800) return "ayer";
  return new Date(t).toLocaleDateString("es-PE", { day: "numeric", month: "short" });
}

function fechaDeEvento(ev) {
  if (!ev?.fecha) return "";
  const dia = new Date(`${ev.fecha}T00:00:00`).toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" });
  return [dia.charAt(0).toUpperCase() + dia.slice(1), ev.hora, ev.lugar].filter(Boolean).join(" · ");
}

function hostDe(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch (e) { return url; }
}

const ESTILO_CAMPO = { background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` };

function PublicacionDelMuro({ p, esCoach, recargar }) {
  const [respuesta, setRespuesta] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [confirmar, setConfirmar] = useState(null); // "post" o el id de una respuesta
  const [error, setError] = useState("");

  const accion = async (op, extra) => {
    setError("");
    const r = await muroOp(op, extra);
    if (r?.ok === false) setError(r.error || "No se pudo.");
    setConfirmar(null);
    await recargar();
    return r;
  };
  const responder = async () => {
    if (!respuesta.trim()) return;
    setEnviando(true);
    const r = await accion("responder", { idPost: p.id, datos: { texto: respuesta } });
    setEnviando(false);
    if (r?.ok) setRespuesta("");
  };

  const BotonBorrar = ({ que, extra }) => (
    confirmar === que ? (
      <span className="text-[11px] whitespace-nowrap" style={{ color: COLORS.textMuted }}>
        ¿Borrar?{" "}
        <button type="button" onClick={() => accion("borrar", extra)} style={{ color: COLORS.hard }}>Sí</button>{" · "}
        <button type="button" onClick={() => setConfirmar(null)}>No</button>
      </span>
    ) : (
      <button type="button" onClick={() => setConfirmar(que)} className="text-[11px]" style={{ color: COLORS.textMuted }}>Borrar</button>
    )
  );

  return (
    <article className="rounded-xl p-4" style={{ background: COLORS.surface, border: `1px solid ${p.nuevo ? COLORS.track + "99" : COLORS.border}` }}>
      <header className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold" style={{ color: p.autor?.rol === "coach" ? COLORS.track : COLORS.textPrimary }}>{p.autor?.nombre}</span>
            {p.tipo === "anuncio" && (
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: COLORS.track + "22", color: COLORS.track }}>Anuncio</span>
            )}
            {p.fijado && !p.pasado && <Pin size={12} style={{ color: COLORS.moderate }} />}
            {p.nuevo && <span className="text-[10px] font-bold tracking-wider" style={{ color: COLORS.track }}>NUEVO</span>}
          </div>
          <div className="text-[11px]" style={{ color: COLORS.textMuted }}>{cuandoFue(p.creado)}</div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {esCoach && p.tipo === "anuncio" && !p.pasado && (
            <button type="button" onClick={() => accion("fijar", { idPost: p.id, fijado: !p.fijado })}
              className="text-[11px]" style={{ color: COLORS.textMuted }}>{p.fijado ? "Desfijar" : "Fijar"}</button>
          )}
          {p.borrable && <BotonBorrar que="post" extra={{ idPost: p.id }} />}
        </div>
      </header>

      <p className="text-sm whitespace-pre-wrap break-words" style={{ color: COLORS.lane }}>{p.texto}</p>

      {p.evento && (
        <div className="mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-sm" style={{ background: COLORS.bg, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
          <CalendarDays size={15} style={{ color: COLORS.track, marginTop: 2, flexShrink: 0 }} />
          <span>{fechaDeEvento(p.evento)}</span>
        </div>
      )}
      {p.enlace && (
        <a href={p.enlace} target="_blank" rel="noopener noreferrer nofollow"
          className="mt-3 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold"
          style={{ background: COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
          <Link2 size={14} /> {hostDe(p.enlace)}
        </a>
      )}
      {p.leidoPor && (
        <div className="text-[11px] mt-2" style={{ color: COLORS.textMuted }}>Leído por {p.leidoPor.leyeron} de {p.leidoPor.total}</div>
      )}

      {p.respuestas?.length > 0 && (
        <div className="mt-3 pt-3 space-y-2.5" style={{ borderTop: `1px dashed ${COLORS.border}` }}>
          {p.respuestas.map((r) => (
            <div key={r.id} className="text-sm">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold" style={{ color: r.autor?.rol === "coach" ? COLORS.track : COLORS.textPrimary }}>{r.autor?.nombre}</span>
                <span className="text-[11px]" style={{ color: COLORS.textMuted }}>{cuandoFue(r.creado)}</span>
                {r.borrable && <BotonBorrar que={r.id} extra={{ idPost: p.id, idRespuesta: r.id }} />}
              </div>
              <p className="whitespace-pre-wrap break-words" style={{ color: COLORS.lane }}>{r.texto}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <input type="text" value={respuesta} onChange={(e) => setRespuesta(e.target.value)} maxLength={1000}
          onKeyDown={(e) => { if (e.key === "Enter") responder(); }}
          placeholder="Responder…" className="flex-1 min-w-0 rounded-lg px-3 py-2 text-sm" style={ESTILO_CAMPO} />
        <button type="button" onClick={responder} disabled={!respuesta.trim() || enviando} aria-label="Enviar respuesta"
          className="p-2 rounded-lg disabled:opacity-40" style={{ background: COLORS.track, color: COLORS.lane }}>
          <Send size={16} />
        </button>
      </div>
      {error && <p className="text-xs mt-2" style={{ color: COLORS.hard }}>{error}</p>}
    </article>
  );
}

function MuroAnuncios({ esCoach, onLeido }) {
  const [muro, setMuro] = useState(null);
  const [error, setError] = useState("");
  const [texto, setTexto] = useState("");
  const [enlace, setEnlace] = useState("");
  const [conEvento, setConEvento] = useState(false);
  const [evento, setEvento] = useState({ fecha: "", hora: "", lugar: "" });
  const [fijado, setFijado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [verPasados, setVerPasados] = useState(false);

  const cargar = useCallback(async () => {
    const r = await muroOp("listar");
    if (r?.ok) { setMuro(r); setError(""); } else setError(r?.error || "No se pudo cargar el muro.");
    return r;
  }, []);

  useEffect(() => {
    let vivo = true;
    const abrir = async () => {
      const r = await cargar();
      if (!vivo || !r?.ok) return;
      if (r.noLeidos > 0) await muroOp("leer");
      if (vivo) onLeido?.();
    };
    abrir();
    // Mientras el muro está abierto se mira cada medio minuto si hay algo nuevo.
    const t = setInterval(abrir, 30000);
    return () => { vivo = false; clearInterval(t); };
  }, [cargar]);

  const publicar = async () => {
    setEnviando(true); setError("");
    const datos = esCoach
      ? { texto, enlace, evento: conEvento ? evento : null, fijado }
      : { texto };
    const r = await muroOp("publicar", { datos });
    setEnviando(false);
    if (!r?.ok) { setError(r?.error || "No se pudo publicar."); return; }
    setTexto(""); setEnlace(""); setConEvento(false); setEvento({ fecha: "", hora: "", lugar: "" }); setFijado(false);
    await cargar();
  };

  const vigentes = muro ? [...muro.fijados, ...muro.recientes] : [];

  return (
    <div>
      <div className="rounded-xl p-4 mb-4" style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}>
        <textarea rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={2000}
          placeholder={esCoach ? "Escribí un anuncio para el grupo…" : "Escribí un mensaje para el grupo…"}
          className="w-full rounded-lg px-3 py-2 text-sm resize-y" style={ESTILO_CAMPO} />
        {esCoach && (
          <div className="mt-2 space-y-2">
            <input type="text" value={enlace} onChange={(e) => setEnlace(e.target.value)}
              placeholder="Enlace (opcional): inscripción, formulario, video…"
              className="w-full rounded-lg px-3 py-2 text-sm" style={ESTILO_CAMPO} />
            <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: COLORS.textMuted }}>
              <input type="checkbox" checked={conEvento} onChange={(e) => setConEvento(e.target.checked)} style={{ accentColor: COLORS.track }} />
              Es un evento (fecha, hora y lugar)
            </label>
            {conEvento && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <input type="date" value={evento.fecha} onChange={(e) => setEvento((v) => ({ ...v, fecha: e.target.value }))}
                  className="rounded-lg px-3 py-2 text-sm" style={ESTILO_CAMPO} />
                <input type="time" value={evento.hora} onChange={(e) => setEvento((v) => ({ ...v, hora: e.target.value }))}
                  className="rounded-lg px-3 py-2 text-sm" style={ESTILO_CAMPO} />
                <input type="text" value={evento.lugar} onChange={(e) => setEvento((v) => ({ ...v, lugar: e.target.value }))} maxLength={120}
                  placeholder="Lugar" className="col-span-2 sm:col-span-1 rounded-lg px-3 py-2 text-sm" style={ESTILO_CAMPO} />
              </div>
            )}
            <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: COLORS.textMuted }}>
              <input type="checkbox" checked={fijado} onChange={(e) => setFijado(e.target.checked)} style={{ accentColor: COLORS.track }} />
              Fijar arriba
            </label>
          </div>
        )}
        {error && <p className="text-xs mt-2" style={{ color: COLORS.hard }}>{error}</p>}
        <div className="flex justify-end mt-2">
          <button type="button" onClick={publicar} disabled={!texto.trim() || enviando}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
            style={{ background: COLORS.track, color: COLORS.lane }}>
            <Send size={14} /> {enviando ? "Publicando…" : "Publicar"}
          </button>
        </div>
      </div>

      {!muro && !error && <p className="text-sm" style={{ color: COLORS.textMuted }}>Cargando…</p>}
      {muro && vigentes.length === 0 && (
        <p className="text-sm" style={{ color: COLORS.textMuted }}>
          Todavía no hay nada. {esCoach ? "Publicá el primer anuncio." : "Cuando tu coach o tus compañeros publiquen algo, lo vas a ver acá."}
        </p>
      )}
      <div className="space-y-3">
        {vigentes.map((p) => <PublicacionDelMuro key={p.id} p={p} esCoach={esCoach} recargar={cargar} />)}
      </div>

      {muro?.pasados?.length > 0 && (
        <div className="mt-6">
          <button type="button" onClick={() => setVerPasados((v) => !v)} className="text-xs font-semibold mb-3" style={{ color: COLORS.textMuted }}>
            {verPasados ? "Ocultar" : "Ver"} eventos pasados ({muro.pasados.length})
          </button>
          {verPasados && (
            <div className="space-y-3 opacity-80">
              {muro.pasados.map((p) => <PublicacionDelMuro key={p.id} p={p} esCoach={esCoach} recargar={cargar} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Las cuatro pestañas de la barra inferior del alumno. El reloj vive dentro de Perfil.
const PESTANAS_ALUMNO = [
  { id: "semana", etiqueta: "Semana", Icono: CalendarDays },
  { id: "progreso", etiqueta: "Progreso", Icono: BarChart2 },
  { id: "anuncios", etiqueta: "Anuncios", Icono: Megaphone },
  { id: "perfil", etiqueta: "Perfil", Icono: User },
];

function StudentPortal({ studentId, refreshRoster, onBack }) {
  const [student, setStudent] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [viewedWeek, setViewedWeek] = useState(null);

  // Pestaña activa de la barra inferior. Al cambiar de pestaña se vuelve arriba, como en
  // cualquier app: si no, se aterriza a media página de la sección anterior.
  const [pestana, setPestana] = useState("semana");
  // Cuántas publicaciones del muro tiene sin leer: se mira al entrar y cada minuto.
  const [pendientesMuro, setPendientesMuro] = useState(0);
  useEffect(() => {
    let vivo = true;
    const mirar = async () => {
      const r = await muroOp("pendientes");
      if (vivo && r?.ok) setPendientesMuro(r.noLeidos || 0);
    };
    mirar();
    const t = setInterval(mirar, 60000);
    return () => { vivo = false; clearInterval(t); };
  }, []);
  const irA = useCallback((p) => {
    setPestana(p);
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }, []);
  // Al volver de autorizar el reloj, la dirección trae "?reloj=…". El aviso lo muestra el
  // panel del reloj, que está en Perfil: hay que abrir esa pestaña o no lo vería nunca.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).has("reloj")) setPestana("perfil");
  }, []);

  useEffect(() => { safeGet(`student:${studentId}`).then(setStudent); }, [studentId]);

  // Trae lo del reloj a la pantalla sin recargarla entera: solo el bloque que escribe el
  // servidor. Si el alumno está escribiendo su RPE en ese momento, no se lo pisa.
  const aplicarLectura = useCallback(async () => {
    const fresco = await safeGet(`student:${studentId}`);
    if (fresco) setStudent((previo) => fusionarLoDelReloj(previo, fresco));
  }, [studentId]);

  // Al abrir, se le pide al servidor que traiga de intervals.icu lo entrenado. Si el alumno
  // no tiene reloj conectado —o si ya se consultó hace un rato— esto no cuesta nada: el
  // servidor contesta que no hay nada que hacer y la pantalla sigue igual.
  useEffect(() => {
    let activo = true;
    (async () => {
      const r = await intervalsOp("traer", studentId);
      if (!activo || !(r?.actualizadas || r?.extras)) return;
      await aplicarLectura();
    })();
    return () => { activo = false; };
  }, [studentId, aplicarLectura]);

  // Vuelve a leer el registro desde el servidor. Lo usa la conexión del reloj, que cambia
  // el registro del lado del servidor y no por el camino normal de guardado.
  const reloadStudent = useCallback(async () => {
    const fresh = await safeGet(`student:${studentId}`);
    if (fresh) setStudent(fresh);
  }, [studentId]);

  // Refresco automático en segundo plano: si el coach hace un cambio (por ejemplo edita
  // una sesión o aprueba la siguiente semana), se refleja acá sin que el alumno tenga que
  // recargar la página. Solo se aplica si no hay cambios locales sin guardar, para no perderlos.
  useEffect(() => {
    const interval = setInterval(() => {
      if (!saved) return;
      safeGet(`student:${studentId}`).then((fresh) => { if (fresh) setStudent(fresh); });
    }, 20000);
    return () => clearInterval(interval);
  }, [studentId, saved]);

  useEffect(() => { setViewedWeek(null); }, [student?.currentWeek]);

  // Autoguardado: al marcar una sesión o escribir un dato, se guarda solo — sin botón aparte.
  // Se espera un momento antes de guardar para no mandar una petición por cada tecla mientras
  // el alumno escribe los km o una nota; al marcar una casilla el guardado es inmediato.
  const saveTimerRef = React.useRef(null);
  const pendingStudentRef = React.useRef(null);
  const persistNow = useCallback(async () => {
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    const toSave = pendingStudentRef.current;
    if (!toSave) return;
    pendingStudentRef.current = null;
    setSaving(true);
    await safeSet(`student:${toSave.id}`, toSave);
    setSaving(false);
    setSaved(true);
  }, []);
  const changeLog = (index, entry, immediate) => {
    setStudent((s) => {
      const wk = getActiveLogWeek(s);
      const week = s.weeks[wk];
      const log = week.log.map((l, i) => (i === index ? entry : l));
      const updated = { ...s, weeks: { ...s.weeks, [wk]: { ...week, log } } };
      pendingStudentRef.current = updated;
      return updated;
    });
    setSaved(false);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { persistNow(); }, immediate ? 0 : 900);
  };
  // Si el alumno cierra o cambia de pantalla con algo sin guardar, se intenta guardar antes.
  useEffect(() => () => { if (pendingStudentRef.current) persistNow(); }, [persistNow]);
  // El alumno puede mover una sesión a un día contiguo (el anterior o el siguiente), siempre
  // que ese día esté libre y todavía no haya pasado. Intercambia el contenido de los dos días
  // manteniendo la etiqueta de cada uno en su posición real de la semana.
  const moveSession = async (fromIdx, toIdx) => {
    if (!student) return;
    const wk = getActiveLogWeek(student);
    const week = student.weeks[wk];
    const todayIdx = (new Date().getDay() + 6) % 7; // 0=Lunes ... 6=Domingo
    if (!week || Math.abs(toIdx - fromIdx) !== 1) return;
    if (toIdx < 0 || toIdx > 6) return;
    if (week.plan[toIdx]?.paceKey) return;      // el día destino ya tiene entrenamiento
    if (week.log[fromIdx]?.completed) return;   // ya la hizo, no tiene sentido moverla
    if (toIdx < todayIdx) return;               // no se mueve a un día que ya pasó

    const plan = [...week.plan];
    const log = [...week.log];
    const fromLabel = plan[fromIdx].day, toLabel = plan[toIdx].day;
    plan[toIdx] = { ...plan[fromIdx], day: toLabel, movedFrom: fromLabel };
    plan[fromIdx] = { ...week.plan[toIdx], day: fromLabel };
    log[toIdx] = log[fromIdx];
    log[fromIdx] = { completed: false, actualKm: "", actualPaceStr: "", rpe: "", note: "" };

    const updated = { ...student, weeks: { ...student.weeks, [wk]: { ...week, plan, log } } };
    setStudent(updated);
    setBusy(true);
    await safeSet(`student:${student.id}`, updated);
    setBusy(false);
    setSaved(true);
  };
  // Guarda de inmediato el resultado del "entrenamiento en vivo" — a diferencia del resto del
  // registro manual, aquí tiene más sentido que quede guardado al toque, sin un paso extra.
  const saveLiveTrainingResult = async (index, entry) => {
    if (!student) return;
    const wk = getActiveLogWeek(student);
    const week = student.weeks[wk];
    const log = week.log.map((l, i) => (i === index ? entry : l));
    const updated = { ...student, weeks: { ...student.weeks, [wk]: { ...week, log } } };
    setStudent(updated);
    setBusy(true);
    await safeSet(`student:${student.id}`, updated);
    setBusy(false);
    setSaved(true);
  };
  const submitWeek = async () => {
    if (!student) return;
    setBusy(true);
    // Si quedaba algo por guardar (el alumno escribió algo justo antes de enviar), se guarda
    // primero para que no se pierda.
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    pendingStudentRef.current = null;
    const wk = getActiveLogWeek(student);
    const week = student.weeks[wk];
    const { adherencePct, avgRpe } = computeAdherence(week.plan, week.log);
    const updated = { ...student, weeks: { ...student.weeks, [wk]: { ...week, submitted: true, studentSubmitted: true, adherencePct, avgRpe } } };
    await safeSet(`student:${student.id}`, updated);
    // Se actualiza SOLO la entrada de este alumno en el listado. Antes se reescribía la lista
    // completa desde la copia del navegador, lo que podía borrar cambios hechos en paralelo
    // (por ejemplo, si el coach acababa de cerrar la semana de otro alumno).
    await updateRosterEntry(student.id, {
      lastAdherence: computeHistoricalAdherence(updated),
      waitingApproval: true,
    });
    await pushReport({
      id: uid(), studentId: student.id, studentName: student.name, weekNumber: wk,
      weeklyKm: week.weeklyKm, phase: week.phase, adherencePct, avgRpe, note: "El alumno envió su semana para aprobación.",
      closedAt: new Date().toISOString(),
    });
    setStudent(updated);
    refreshRoster();
    setBusy(false);
  };
  const reopenWeek = async () => {
    if (!student) return;
    setBusy(true);
    const wk = getActiveLogWeek(student);
    const week = student.weeks[wk];
    const updated = { ...student, weeks: { ...student.weeks, [wk]: { ...week, submitted: false } } };
    await safeSet(`student:${student.id}`, updated);
    setStudent(updated);
    setBusy(false);
  };

  const furthestApprovedWeek = student ? Math.max(1, ...Object.keys(student.weeks).map(Number)) : null;
  const activeLogWeek = student ? getActiveLogWeek(student) : null;
  const activeWeekNum = student ? Math.min(Math.max(viewedWeek ?? activeLogWeek, activeLogWeek), furthestApprovedWeek) : null;
  const isViewingCurrent = !student || activeWeekNum === activeLogWeek;
  const week = student ? ensureWeekShape(student.weeks[activeWeekNum]) : null;
  const currentWeekData = student ? ensureWeekShape(student.weeks[activeLogWeek]) : null;
  // La semana que se está viendo es un "adelanto" si su lunes todavía no llegó: se puede
  // mirar, pero no marcar nada hasta que empiece de verdad.
  const todayWeekNum = student ? getTodayWeekNum(student) : null;
  const isPreviewWeek = !!(student && activeWeekNum > todayWeekNum);
  // Una semana queda como registro terminado en dos casos: cuando el propio alumno la envió,
  // o cuando su semana de calendario ya pasó. Que el coach haya dejado lista la siguiente NO
  // la cierra: mientras el alumno siga dentro de esa semana, debe poder registrar lo que le
  // falte — antes esto le bloqueaba las sesiones pendientes apenas el coach generaba la
  // semana siguiente.
  const isClosedWeek = !!(week?.studentSubmitted || (activeWeekNum != null && todayWeekNum != null && activeWeekNum < todayWeekNum));
  const canEditWeek = !!(student && isViewingCurrent && !isPreviewWeek && !isClosedWeek);
  const todayDowIndex = (new Date().getDay() + 6) % 7; // 0=Lunes ... 6=Domingo
  const [dismissedYesterdayReminder, setDismissedYesterdayReminder] = useState(false);
  const [liveTrainingDayIdx, setLiveTrainingDayIdx] = useState(null);
  const yesterdayIdx = todayDowIndex - 1; // -1 si hoy es lunes: no hay día anterior que preguntar
  const yesterdayDay = canEditWeek && currentWeekData && yesterdayIdx >= 0 ? currentWeekData.plan[yesterdayIdx] : null;
  const yesterdayLog = canEditWeek && currentWeekData && yesterdayIdx >= 0 ? currentWeekData.log[yesterdayIdx] : null;
  const needsYesterdayConfirm = !!(yesterdayDay?.paceKey && !yesterdayLog?.completed && !dismissedYesterdayReminder);
  const submitSlots = currentWeekData ? (currentWeekData.plan || []).map((d, i) => ({ d, i })).filter((x) => !!x.d?.paceKey) : [];
  const submitCompletedCount = currentWeekData ? submitSlots.filter((x) => currentWeekData.log[x.i]?.completed).length : 0;
  const submitTotalCount = submitSlots.length;
  // Ya no depende de la fecha: espera al coach solo cuando la última semana disponible ya
  // fue confirmada (enviada) y todavía no hay una siguiente preparada.
  const waitingForCoach = !!(currentWeekData?.submitted && activeLogWeek >= furthestApprovedWeek);

  // En los planes de fitness el alumno puede mover una sesión a un día contiguo, para
  // acomodarla a su semana sin depender del coach.
  const canMoveSessions = !!(student && isFitnessGoal(student.goal) && canEditWeek && !waitingForCoach);
  const moveHelper = {
    canMove: (fromIdx, toIdx) => {
      if (!week || toIdx < 0 || toIdx > 6) return false;
      if (!week.plan[fromIdx]?.paceKey) return false;   // no hay sesión que mover
      if (week.plan[toIdx]?.paceKey) return false;      // el destino ya tiene entrenamiento
      if (week.log[fromIdx]?.completed) return false;   // ya la hizo
      if (toIdx < todayDowIndex) return false;          // ese día ya pasó
      return true;
    },
    move: (fromIdx, toIdx) => moveSession(fromIdx, toIdx),
  };

  return (
    <div className="max-w-4xl mx-auto px-4" style={{ paddingBottom: "calc(6rem + env(safe-area-inset-bottom))" }}>
      {/* Cabecera fija con el logo. Respeta la zona de la hora y la batería del teléfono
          cuando la app se abre desde la pantalla de inicio. */}
      <header className="sticky top-0 z-30 -mx-4 px-4 mb-4 flex items-center justify-between gap-3"
        style={{ background: COLORS.bg, paddingTop: "calc(0.75rem + env(safe-area-inset-top))", paddingBottom: "0.75rem", borderBottom: `1px solid ${COLORS.border}` }}>
        <img src="/logo.png" alt="Trotamundos" style={{ height: 26, width: "auto" }} />
        {student && (
          <span className="text-sm truncate" style={{ color: COLORS.textMuted, maxWidth: "50%" }}>{student.name}</span>
        )}
      </header>

      {!student && <p className="text-sm" style={{ color: COLORS.textMuted }}>Cargando…</p>}

      {pestana === "semana" && needsYesterdayConfirm && (
        <div className="rounded-xl p-4 mb-4" style={{ background: COLORS.moderate + "18", border: `1px solid ${COLORS.moderate}55` }}>
          <p className="text-sm font-semibold mb-1" style={{ color: COLORS.textPrimary }}>
            ¿Completaste tu sesión de {DAYS[yesterdayIdx]}?
          </p>
          <p className="text-xs mb-3" style={{ color: COLORS.textMuted }}>
            Todavía no la marcaste como hecha — tu coach necesita saber si la entrenaste, para llevar un registro exacto.
          </p>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => { changeLog(yesterdayIdx, { ...yesterdayLog, completed: true, actualKm: yesterdayDay.km, actualPaceStr: yesterdayLog?.actualPaceStr || (getRepresentativePace(yesterdayDay) ? formatPace(getRepresentativePace(yesterdayDay)) : "") }); setDismissedYesterdayReminder(true); }}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: COLORS.track, color: COLORS.lane }}>
              Sí, tal cual estaba planeado
            </button>
            <button onClick={() => setDismissedYesterdayReminder(true)} className="px-3 py-1.5 rounded-lg text-xs" style={{ color: COLORS.textMuted, border: `1px solid ${COLORS.border}` }}>
              No, o fue distinto — la registro yo
            </button>
          </div>
        </div>
      )}

      {student && week && pestana === "semana" && (
        <div>
          <div className="rounded-xl p-4 mb-4 flex items-center justify-between flex-wrap gap-3"
            style={{ background: COLORS.surface2, border: `1px solid ${COLORS.track}` }}>
            <div>
              <div className="flex items-center gap-2">
                {furthestApprovedWeek > activeLogWeek && (
                  <button onClick={() => setViewedWeek(Math.max(activeLogWeek, activeWeekNum - 1))} disabled={isViewingCurrent}
                    className="p-1 rounded disabled:opacity-30" style={{ color: COLORS.textMuted }}><ChevronLeft size={18} /></button>
                )}
                <div className="text-3xl font-bold" style={{ fontFamily: "'Oswald', sans-serif", color: COLORS.lane }}>{getWeekTitle(student, activeWeekNum)}</div>
                {furthestApprovedWeek > activeLogWeek && (
                  <button onClick={() => setViewedWeek(Math.min(furthestApprovedWeek, activeWeekNum + 1))} disabled={activeWeekNum >= furthestApprovedWeek}
                    className="p-1 rounded disabled:opacity-30" style={{ color: COLORS.textMuted }}><ChevronRight size={18} /></button>
                )}
                {!isViewingCurrent && <Pill color={COLORS.moderate}>Próxima semana (vista previa)</Pill>}
              </div>
              <div className="text-sm mt-1" style={{ color: COLORS.textMuted }}>
                {getWeekDateRange(student, activeWeekNum)}
                {student.raceDate ? ` · Faltan ${getDisplayWeekLabel(student, activeWeekNum)} semanas para tu carrera` : ` · ${PHASE_LABEL[week.phase]}`}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Pill color={COLORS.lane}>{GOAL_LABEL[student.goal]}</Pill>
              <Pill color={COLORS.track}>{week.weeklyKm != null ? `${week.weeklyKm} km` : PHASE_LABEL[week.phase]}</Pill>
              <Pill color={COLORS.moderate}>{PHASE_LABEL[week.phase]}</Pill>
              {week.paused && <Pill color={COLORS.moderate}>⏸ Pausada por tu coach</Pill>}
              <button onClick={() => exportWeekToPDF(student, week, activeWeekNum)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                style={{ background: COLORS.surface, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                <Download size={12} /> Descargar PDF
              </button>
            </div>
          </div>


          {/* Semana que la app publicó sola. El alumno la entrena con normalidad; solo se
              le avisa que el coach todavía puede retocarla, para que no se sorprenda si
              algún día cambia. Nada de "falta tu coach": el plan es válido. */}
          {week.autoPublished && (
            <div className="rounded-lg p-3 mb-4 text-sm flex items-start gap-2" style={{ background: COLORS.surface2, border: `1px solid ${COLORS.border}`, color: COLORS.textMuted }}>
              <Flag size={14} style={{ color: COLORS.track, marginTop: 2, flexShrink: 0 }} />
              <span>Tu plan de esta semana ya está activo. Tu coach puede ajustarlo en los próximos días — si lo hace, lo verás acá actualizado.</span>
            </div>
          )}
          {week.note && !week.autoPublished && (
            <div className="rounded-lg p-3 mb-4 text-sm flex items-start gap-2" style={{ background: COLORS.surface2, border: `1px solid ${COLORS.border}`, color: COLORS.textMuted }}>
              <Flag size={14} style={{ color: COLORS.track, marginTop: 2, flexShrink: 0 }} />
              {week.note}
            </div>
          )}

          {isPreviewWeek && (
            <div className="rounded-xl p-4 mb-4" style={{ background: COLORS.moderate + "18", border: `1px solid ${COLORS.moderate}55` }}>
              <div className="flex items-center gap-2 mb-1">
                <Clock size={16} style={{ color: COLORS.moderate }} />
                <span className="text-sm font-semibold" style={{ color: COLORS.textPrimary }}>Adelanto de la próxima semana</span>
              </div>
              <p className="text-sm" style={{ color: COLORS.textMuted }}>
                Puedes ver lo que viene, pero todavía no se puede registrar nada. Se activa sola el lunes a las 00:00.
              </p>
            </div>
          )}

          {isClosedWeek && !waitingForCoach && (
            <div className="rounded-xl p-4 mb-4" style={{ background: COLORS.easy + "18", border: `1px solid ${COLORS.easy}55` }}>
              <div className="flex items-center gap-2 mb-1">
                <Check size={16} style={{ color: COLORS.easy }} />
                <span className="text-sm font-semibold" style={{ color: COLORS.textPrimary }}>Semana finalizada</span>
              </div>
              <p className="text-sm" style={{ color: COLORS.textMuted }}>
                Esta semana ya está cerrada. Tu próxima semana ya está lista y se activa el lunes.
              </p>
            </div>
          )}

          {waitingForCoach && currentWeekData && (
            <div className="rounded-xl p-4 mb-4" style={{ background: COLORS.easy + "18", border: `1px solid ${COLORS.easy}55` }}>
              <div className="flex items-center gap-2 mb-2">
                <Check size={16} style={{ color: COLORS.easy }} />
                <span className="text-sm font-semibold" style={{ color: COLORS.textPrimary }}>¡Semana enviada!</span>
              </div>
              {(() => {
                const slots = (currentWeekData.plan || []).map((d, i) => ({ d, i })).filter((x) => !!x.d?.paceKey);
                const completed = slots.filter((x) => currentWeekData.log[x.i]?.completed);
                const kmDone = r1(completed.reduce((sum, x) => {
                  const l = currentWeekData.log[x.i];
                  const km = l.actualKm !== "" && l.actualKm != null && !isNaN(Number(l.actualKm)) ? Number(l.actualKm) : x.d.km;
                  return sum + (km || 0);
                }, 0));
                return (
                  <p className="text-sm" style={{ color: COLORS.textMuted }}>
                    Completaste <b style={{ color: COLORS.textPrimary }}>{completed.length} de {slots.length}</b> entrenamientos
                    y corriste <b style={{ color: COLORS.textPrimary }}>{kmDone} km</b> esta semana. Tu coach está preparando la siguiente — te avisará cuando esté lista.
                  </p>
                );
              })()}
              <button onClick={reopenWeek} disabled={busy} className="mt-2 underline text-xs" style={{ color: COLORS.textMuted }}>
                Reabrir mi semana para corregir algo
              </button>
            </div>
          )}

          {canEditWeek && !waitingForCoach && week.plan[todayDowIndex]?.paceKey && !week.log[todayDowIndex]?.completed && (
            <button onClick={() => setLiveTrainingDayIdx(todayDowIndex)}
              className="w-full rounded-xl p-4 mb-4 flex items-center gap-3 text-left animate-fadein"
              style={{ background: COLORS.track, border: `2px solid ${COLORS.track}`, boxShadow: `0 0 0 4px ${COLORS.track}33` }}>
              <div className="flex items-center justify-center rounded-full flex-shrink-0" style={{ width: 48, height: 48, background: "rgba(255,255,255,0.2)" }}>
                <Activity size={24} style={{ color: COLORS.lane }} />
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest mb-0.5" style={{ color: COLORS.lane, opacity: 0.85 }}>Hoy · te toca esto</div>
                <div className="text-base font-bold" style={{ color: COLORS.lane, fontFamily: "'Oswald', sans-serif" }}>Iniciar entrenamiento en vivo</div>
              </div>
            </button>
          )}

          <div className="grid sm:grid-cols-2 gap-3 mb-4">
            {week.plan.map((d, i) => <LapCard key={i} day={d} index={i} mode={canEditWeek && !waitingForCoach ? "log" : "view"} log={week.log[i]} extras={extrasDelDia(week, i, student, activeWeekNum)} onChangeLog={canEditWeek ? changeLog : undefined} isToday={canEditWeek && i === todayDowIndex} isRaceGoal={!isFitnessGoal(student.goal)} onStartLive={canEditWeek && !waitingForCoach ? (idx) => setLiveTrainingDayIdx(idx) : undefined} onMoveSession={canMoveSessions ? moveHelper : undefined} />)}
          </div>

          {liveTrainingDayIdx != null && week.plan[liveTrainingDayIdx] && (
            <LiveTrainingScreen
              day={week.plan[liveTrainingDayIdx]}
              easyPace={student.paces?.E}
              onClose={() => setLiveTrainingDayIdx(null)}
              onComplete={({ actualKm, actualPaceStr }) => {
                saveLiveTrainingResult(liveTrainingDayIdx, { ...week.log[liveTrainingDayIdx], completed: true, actualKm, actualPaceStr });
                setLiveTrainingDayIdx(null);
              }}
            />
          )}

          <button onClick={() => exportWeekToPDF(student, week, activeWeekNum)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold mb-4"
            style={{ background: COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
            <Download size={14} /> Descargar mi semana en PDF
          </button>


          {canEditWeek && !waitingForCoach && (
            <>
              <div className="flex flex-wrap gap-2 items-center">
                <span className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs"
                  style={{ color: saving ? COLORS.textMuted : COLORS.easy }}>
                  {saving ? (<><RotateCw size={12} /> Guardando…</>) : (<><Check size={12} /> Se guarda solo</>)}
                </span>
                {!showSubmitConfirm && (
                  <button onClick={() => setShowSubmitConfirm(true)} disabled={busy}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
                    style={{ background: COLORS.track, color: COLORS.lane }}>
                    <RotateCw size={14} /> Enviar semana a mi coach
                  </button>
                )}
              </div>
              {showSubmitConfirm && (
                <div className="rounded-xl p-4 mt-3" style={{ background: COLORS.surface2, border: `1px solid ${COLORS.track}` }}>
                  <p className="text-sm font-semibold mb-1" style={{ color: COLORS.textPrimary }}>
                    Has cumplido {submitCompletedCount} de {submitTotalCount} entrenamientos.
                  </p>
                  <p className="text-xs mb-3" style={{ color: COLORS.textMuted }}>
                    {submitCompletedCount < submitTotalCount
                      ? "Todavía tienes sesiones sin marcar — revísalas antes de enviar, así tu coach ve exactamente lo que hiciste."
                      : "Completaste todas las sesiones de la semana."} ¿Seguro que quieres enviar esta semana a tu coach?
                  </p>
                  <div className="flex gap-2">
                    <button onClick={async () => { await submitWeek(); setShowSubmitConfirm(false); }} disabled={busy}
                      className="px-4 py-1.5 rounded-lg text-sm font-semibold" style={{ background: COLORS.track, color: COLORS.lane }}>
                      Sí, enviar
                    </button>
                    <button onClick={() => setShowSubmitConfirm(false)} className="px-3 py-1.5 rounded-lg text-sm" style={{ color: COLORS.textMuted }}>
                      Todavía no
                    </button>
                  </div>
                </div>
              )}
              <p className="text-xs mt-3 flex items-center gap-1" style={{ color: COLORS.textMuted }}>
                <AlertCircle size={12} /> Registra tus sesiones y luego envía la semana; tu coach revisará y preparará la siguiente.
              </p>
            </>
          )}
        </div>
      )}

      {student && pestana === "progreso" && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold" style={{ fontFamily: "'Oswald', sans-serif", color: COLORS.textPrimary }}>Tu progreso</h2>
          <ProgressChart student={student} activeWeekNum={activeWeekNum} />
        </div>
      )}

      {student && pestana === "anuncios" && (
        <div>
          <h2 className="text-lg font-semibold mb-3" style={{ fontFamily: "'Oswald', sans-serif", color: COLORS.textPrimary }}>Anuncios</h2>
          <MuroAnuncios onLeido={() => setPendientesMuro(0)} />
        </div>
      )}

      {student && pestana === "perfil" && (
        <div className="space-y-3">
          <div className="rounded-xl p-4" style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}>
            <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: COLORS.textMuted }}>Alumno</div>
            <div className="text-2xl font-semibold" style={{ fontFamily: "'Oswald', sans-serif", color: COLORS.textPrimary }}>{student.name}</div>
            <div className="flex flex-wrap gap-2 mt-3">
              <Pill color={COLORS.lane}>{GOAL_LABEL[student.goal]}</Pill>
              {student.raceDate && (
                <Pill color={COLORS.track}>Carrera: {String(student.raceDate).slice(0, 10).split("-").reverse().join("/")}</Pill>
              )}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: COLORS.textMuted }}>Tu reloj</div>
            <ConexionReloj student={student} onCambio={reloadStudent} onLectura={aplicarLectura} />
          </div>
          {week && (
            <button onClick={() => exportWeekToPDF(student, week, activeWeekNum)}
              className="w-full flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold"
              style={{ background: COLORS.surface, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
              <Download size={16} /> Descargar mi semana en PDF
            </button>
          )}
          <button onClick={onBack}
            className="w-full flex items-center gap-2 px-4 py-3 rounded-xl text-sm"
            style={{ background: COLORS.surface, color: COLORS.textMuted, border: `1px solid ${COLORS.border}` }}>
            <ArrowLeft size={16} /> Volver al inicio
          </button>
          <button onClick={async () => { await safeDeletePersonal("rememberedStudent"); onBack(); }}
            className="w-full flex items-center gap-2 px-4 py-3 rounded-xl text-sm"
            style={{ background: COLORS.surface, color: COLORS.textMuted, border: `1px solid ${COLORS.border}` }}>
            <LogOut size={16} /> No soy {student.name} — cambiar de alumno
          </button>
        </div>
      )}

      {/* Barra fija inferior. Se oculta durante el entrenamiento en vivo, que ocupa la
          pantalla entera. El relleno inferior la levanta por encima de la línea de inicio
          del iPhone. */}
      {student && liveTrainingDayIdx == null && (
        <nav className="fixed bottom-0 inset-x-0 z-40"
          style={{ background: COLORS.surface, borderTop: `1px solid ${COLORS.border}`, paddingBottom: "env(safe-area-inset-bottom)" }}>
          <div className="max-w-4xl mx-auto grid grid-cols-4">
            {PESTANAS_ALUMNO.map(({ id, etiqueta, Icono }) => {
              const activa = pestana === id;
              return (
                <button key={id} type="button" onClick={() => irA(id)} aria-current={activa ? "page" : undefined}
                  className="flex flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium"
                  style={{ color: activa ? COLORS.track : COLORS.textMuted, minHeight: 58 }}>
                  <span className="relative">
                    <Icono size={22} strokeWidth={activa ? 2.4 : 1.8} />
                    {id === "anuncios" && pendientesMuro > 0 && (
                      <span className="absolute -top-0.5 -right-1 rounded-full" aria-label="Hay anuncios nuevos"
                        style={{ width: 10, height: 10, background: COLORS.track, border: `2px solid ${COLORS.surface}` }} />
                    )}
                  </span>
                  {etiqueta}
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   ROLE SELECT
--------------------------------------------------------- */
function RoleSelect({ onSelect }) {
  return (
    <div className="max-w-2xl mx-auto px-4 py-16">
      <div className="text-center mb-12">
        <img src="/logo.png" alt="Trotamundos" className="mx-auto" style={{ width: "min(320px, 80vw)", height: "auto" }} />
        <div className="text-sm font-semibold tracking-[0.3em] uppercase mt-1" style={{ color: COLORS.track }}>el app · V.04</div>
        <div className="w-16 h-1 mx-auto mt-3 mb-4" style={{ background: COLORS.track }} />
        <p className="text-sm" style={{ color: COLORS.textMuted }}>Tú cumples el plan, tu coach lo diseña semana a semana.</p>
      </div>
      <button onClick={() => onSelect("student")} className="w-full rounded-xl p-6 text-left transition-transform hover:-translate-y-0.5"
        style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}>
        <User size={24} style={{ color: COLORS.track }} />
        <div className="mt-3 text-lg font-semibold" style={{ fontFamily: "'Oswald', sans-serif", color: COLORS.textPrimary }}>Soy alumno</div>
        <p className="text-sm mt-1" style={{ color: COLORS.textMuted }}>Consulta tu plan de la semana y registra tus sesiones.</p>
      </button>
      <div className="text-center mt-6">
        <button onClick={() => onSelect("coach")} className="text-xs underline" style={{ color: COLORS.textMuted }}>
          Acceso coach
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   APP ROOT
--------------------------------------------------------- */
export default function App() {
  const [view, setView] = useState("select");
  const [authedStudentId, setAuthedStudentId] = useState(null);
  const [roster, setRoster] = useState([]);
  const [loading, setLoading] = useState(true);

  // Antes de iniciar sesión solo se pide la lista mínima (nombres e id) para el buscador —
  // ya no se descarga el listado completo con datos de entrenamiento de todos los alumnos.
  const refreshRoster = useCallback(async () => {
    const r = await studentList();
    if (r && Array.isArray(r.students)) setRoster(r.students);
  }, []);
  useEffect(() => {
    (async () => {
      await refreshRoster();
      const remembered = await safeGetPersonal("rememberedStudent");
      if (remembered && remembered.id) {
        // solo entra directo si la sesión guardada en el servidor sigue siendo válida
        const record = await safeGet(`student:${remembered.id}`);
        if (record) { setAuthedStudentId(remembered.id); setView("student"); }
      }
      setLoading(false);
    })();
  }, [refreshRoster]);

  const goSelect = () => { setView("select"); setAuthedStudentId(null); };

  return (
    <div className="min-h-screen w-full" style={{ background: COLORS.bg }}>
      {loading ? (
        <div className="flex items-center justify-center h-64" style={{ color: COLORS.textMuted }}>Cargando…</div>
      ) : view === "select" ? (
        <RoleSelect onSelect={(role) => setView(role === "coach" ? "coach-auth" : "student-auth")} />
      ) : view === "coach-auth" ? (
        <CoachGate onSuccess={() => setView("coach")} onBack={goSelect} />
      ) : view === "coach" ? (
        <CoachDashboard roster={roster} refreshRoster={refreshRoster} onBack={goSelect} />
      ) : view === "student-auth" ? (
        <StudentGate roster={roster} onSuccess={(id) => { setAuthedStudentId(id); setView("student"); }} onBack={goSelect} />
      ) : (
        <StudentPortal studentId={authedStudentId} refreshRoster={refreshRoster} onBack={goSelect} />
      )}
    </div>
  );
}
