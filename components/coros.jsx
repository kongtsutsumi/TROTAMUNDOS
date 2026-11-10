"use client";
// COROS, en la pestaña del reloj del alumno: el estado de la conexión, sus permisos, traer lo
// entrenado, las sesiones que tiene que borrar en la app COROS y desconectar. Lo que decide y
// guarda está en el servidor (app/api/coros).
import React, { useState } from "react";
import { Activity, RefreshCcw } from "lucide-react";
import { COLORS } from "../lib/plan-engine.mjs";
import { corosOp } from "../lib/storage";
import { PermisosDelReloj } from "./consentimiento";

const fecha = (iso) => {
  const t = Date.parse(iso || "");
  return Number.isFinite(t) ? new Date(t).toLocaleString("es-PE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
};
const dia = (f) => {
  const t = Date.parse(`${f}T12:00:00`);
  return Number.isFinite(t) ? new Date(t).toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "short" }) : f;
};

export function ConexionCoros({ student, estado, onCambio, onLectura }) {
  const [ocupado, setOcupado] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [trayendo, setTrayendo] = useState(false);
  const [aviso, setAviso] = useState(null);

  const desconectar = async () => {
    setOcupado(true);
    await corosOp("desconectar", student.id);
    setConfirmar(false);
    setOcupado(false);
    await onCambio?.();
  };
  const traer = async () => {
    setTrayendo(true); setAviso(null);
    const r = await corosOp("traer", student.id, { forzar: true });
    if (r?.actualizadas || r?.extras) {
      setAviso(`Listo: ${r.actualizadas} sesi${r.actualizadas === 1 ? "ón" : "ones"} al día.`);
      await onLectura?.();
    } else if (r?.motivo === "permiso-revocado") {
      setAviso("COROS ya no acepta el permiso. Vuelve a conectar tu reloj.");
      await onCambio?.();
    } else if (r?.ok) {
      setAviso("No hay nada nuevo. Si acabas de entrenar, sincroniza tu reloj con la app COROS y prueba en unos minutos.");
    } else {
      setAviso("No se pudo consultar a COROS ahora. Prueba en un rato.");
    }
    setTrayendo(false);
  };

  const envio = estado?.ultimoEnvio;
  const porBorrar = Array.isArray(estado?.porBorrar) ? estado.porBorrar : [];
  return (
    <div className="rounded-xl p-4 mb-4" style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }} data-testid="conexion-coros">
      <div className="flex items-center gap-2 mb-1">
        <Activity size={16} style={{ color: COLORS.easy }} />
        <span className="text-sm font-semibold" style={{ color: COLORS.textPrimary }}>
          Tu {estado?.dispositivo || "COROS"} está conectado
        </span>
      </div>
      <p className="text-sm mb-2" style={{ color: COLORS.textMuted }}>
        Tus entrenamientos llegan a tu calendario de COROS: sincroniza tu reloj con la app COROS para tenerlos. Lo que corres
        se trae a la app cuando la abres (o con el botón de abajo).
        {envio && (envio.ok
          ? ` Último envío: semana ${envio.semana}, ${envio.enviados} sesi${envio.enviados === 1 ? "ón" : "ones"} (${fecha(envio.fecha)}).`
          : ` El último envío no salió del todo (${envio.motivo}). Avísale a tu coach si no te aparecen.`)}
      </p>
      {porBorrar.length > 0 && (
        <div className="rounded-lg p-3 mb-3" style={{ background: COLORS.bg, border: `1px solid ${COLORS.moderate}88` }} data-testid="coros-por-borrar">
          <p className="text-xs mb-1" style={{ color: COLORS.textPrimary }}>
            <b>Bórralas en la app COROS</b> (Calendario): tu coach las quitó del plan y COROS no deja que otras apps las borren.
          </p>
          <ul className="text-xs list-disc pl-4" style={{ color: COLORS.textMuted }}>
            {porBorrar.map((x) => <li key={`${x.fecha}-${x.nombre}`}>{dia(x.fecha)}: {x.nombre}</li>)}
          </ul>
        </div>
      )}
      <PermisosDelReloj studentId={student.id} consentimiento={estado?.consentimiento} onCambio={onCambio} />
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <button type="button" onClick={traer} disabled={trayendo} data-testid="coros-traer"
          className="flex items-center gap-1 text-xs px-2 py-1 rounded"
          style={{ background: COLORS.bg, color: COLORS.track, border: `1px solid ${COLORS.track}55`, opacity: trayendo ? 0.6 : 1 }}>
          <RefreshCcw size={11} /> {trayendo ? "Buscando…" : "Traer lo que entrené"}
        </button>
        {aviso && <span className="text-xs" style={{ color: COLORS.textMuted }}>{aviso}</span>}
      </div>
      <p className="text-[11px] mb-2" style={{ color: COLORS.textMuted }}>Datos de actividad y salud proporcionados por COROS. Solo con fines de entrenamiento y rendimiento; no son consejo médico.</p>
      {confirmar ? (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs" style={{ color: COLORS.textMuted }}>
            Se borrarán el detalle de tus actividades de COROS y tus datos de salud; en tu registro queda lo básico de cada
            sesión (hecha, km y ritmo). Los entrenamientos que ya están en tu calendario de COROS se quedan: bórralos en la app si no los quieres.
          </span>
          <button onClick={desconectar} disabled={ocupado} className="px-3 py-1.5 rounded text-xs font-semibold" style={{ background: COLORS.hard, color: COLORS.lane }} data-testid="desconectar-coros">
            Sí, desconectar
          </button>
          <button onClick={() => setConfirmar(false)} className="px-3 py-1.5 rounded text-xs" style={{ color: COLORS.textMuted, border: `1px solid ${COLORS.border}` }}>Cancelar</button>
        </div>
      ) : (
        <button onClick={() => setConfirmar(true)} className="underline text-xs" style={{ color: COLORS.textMuted }}>Desconectar mi COROS</button>
      )}
    </div>
  );
}
