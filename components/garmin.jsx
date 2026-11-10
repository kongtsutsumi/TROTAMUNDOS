"use client";
// Garmin directo, en la pestaña del reloj del alumno: el estado de la conexión, sus permisos
// y desconectar. Lo que decide y guarda está en el servidor (app/api/garmin).
import React, { useState } from "react";
import { Activity } from "lucide-react";
import { COLORS } from "../lib/plan-engine.mjs";
import { garminOp } from "../lib/storage";
import { PermisosDelReloj } from "./consentimiento";

const fecha = (iso) => {
  const t = Date.parse(iso || "");
  return Number.isFinite(t) ? new Date(t).toLocaleString("es-PE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
};

export function ConexionGarmin({ student, estado, onCambio }) {
  const [ocupado, setOcupado] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const desconectar = async () => {
    setOcupado(true);
    await garminOp("desconectar", student.id);
    setConfirmar(false);
    setOcupado(false);
    await onCambio?.();
  };
  const envio = estado?.ultimoEnvio;
  return (
    <div className="rounded-xl p-4 mb-4" style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }} data-testid="conexion-garmin">
      <div className="flex items-center gap-2 mb-1">
        <Activity size={16} style={{ color: COLORS.easy }} />
        <span className="text-sm font-semibold" style={{ color: COLORS.textPrimary }}>Tu Garmin está conectado</span>
      </div>
      <p className="text-sm mb-2" style={{ color: COLORS.textMuted }}>
        Tus entrenamientos llegan a tu calendario de Garmin Connect: sincroniza tu reloj para tenerlos. Lo que corres vuelve
        solo a la app cuando sincronizas.
        {envio && (envio.ok
          ? ` Último envío: semana ${envio.semana}, ${envio.enviados} sesión${envio.enviados === 1 ? "" : "es"} (${fecha(envio.fecha)}).`
          : ` El último envío no salió (${envio.motivo}). Avísale a tu coach si no te aparecen.`)}
      </p>
      <PermisosDelReloj studentId={student.id} consentimiento={estado?.consentimiento} onCambio={onCambio} />
      {confirmar ? (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs" style={{ color: COLORS.textMuted }}>
            Se quitarán de Garmin Connect los entrenamientos futuros y se borrarán tus datos de salud. Lo ya entrenado no se toca.
          </span>
          <button onClick={desconectar} disabled={ocupado} className="px-3 py-1.5 rounded text-xs font-semibold" style={{ background: COLORS.hard, color: COLORS.lane }} data-testid="desconectar-garmin">
            Sí, desconectar
          </button>
          <button onClick={() => setConfirmar(false)} className="px-3 py-1.5 rounded text-xs" style={{ color: COLORS.textMuted, border: `1px solid ${COLORS.border}` }}>Cancelar</button>
        </div>
      ) : (
        <button onClick={() => setConfirmar(true)} className="underline text-xs" style={{ color: COLORS.textMuted }}>Desconectar mi Garmin</button>
      )}
    </div>
  );
}
