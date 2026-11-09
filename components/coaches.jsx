"use client";
// Panel de coaches — solo lo ve el administrador.
//   · crear un coach (nombre + contraseña),
//   · cambiarle la contraseña (cierra sus sesiones abiertas),
//   · quitarlo: sus alumnos pasan al administrador.
// El servidor vuelve a comprobar todo (app/api/coaches): esto es solo la pantalla.
import React, { useState, useEffect, useCallback } from "react";
import { Plus, KeyRound, Trash2, UserCog } from "lucide-react";
import { COLORS } from "../lib/plan-engine.mjs";
import { coachesOp } from "../lib/storage";

const OSWALD = { fontFamily: "'Oswald', sans-serif" };
const inputStyle = { background: COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` };
const card = { background: COLORS.surface, border: `1px solid ${COLORS.border}` };

export function PanelCoaches({ onCambio }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [creando, setCreando] = useState(false);
  const [nombre, setNombre] = useState("");
  const [clave, setClave] = useState("");
  const [abierto, setAbierto] = useState(null);       // id del coach con un formulario abierto
  const [modo, setModo] = useState(null);             // "clave" | "quitar"
  const [nuevaClave, setNuevaClave] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    const r = await coachesOp("listar");
    if (r.ok) { setDatos(r); setError(""); } else setError(r.error || "No se pudo cargar.");
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const avisar = (msg) => { setAviso(msg); setTimeout(() => setAviso(""), 3000); };
  const cerrar = () => { setAbierto(null); setModo(null); setNuevaClave(""); setError(""); };

  const crear = async () => {
    setOcupado(true);
    const r = await coachesOp("crear", { nombre, password: clave });
    setOcupado(false);
    if (!r.ok) return setError(r.error || "No se pudo crear.");
    setCreando(false); setNombre(""); setClave(""); setError("");
    avisar(`Listo: ${r.coach.nombre} ya puede entrar con su contraseña.`);
    await cargar(); onCambio?.();
  };
  const cambiarClave = async (c) => {
    setOcupado(true);
    const r = await coachesOp("clave", { id: c.id, password: nuevaClave });
    setOcupado(false);
    if (!r.ok) return setError(r.error || "No se pudo cambiar.");
    cerrar();
    avisar(`Contraseña de ${c.nombre} cambiada. Tendrá que entrar de nuevo.`);
  };
  const quitar = async (c) => {
    setOcupado(true);
    const r = await coachesOp("eliminar", { id: c.id });
    setOcupado(false);
    if (!r.ok) return setError(r.error || "No se pudo quitar.");
    cerrar();
    avisar(r.alumnosMovidos ? `${c.nombre} ya no tiene acceso. Sus ${r.alumnosMovidos} alumno(s) pasaron a ti.` : `${c.nombre} ya no tiene acceso.`);
    await cargar(); onCambio?.();
  };

  return (
    <div data-testid="panel-coaches">
      <div className="flex items-center gap-2 mb-1">
        <div className="text-sm font-semibold flex-1" style={{ ...OSWALD, color: COLORS.textPrimary }}>COACHES</div>
        {!creando && (
          <button onClick={() => { setCreando(true); cerrar(); }} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full"
            style={{ background: COLORS.track, color: COLORS.lane }}>
            <Plus size={13} /> Nuevo coach
          </button>
        )}
      </div>
      <p className="text-xs mb-3" style={{ color: COLORS.textMuted }}>
        Cada coach entra con su contraseña y ve solo a sus alumnos, sus pagos y su muro. No puede tocar tu cuenta ni la de otros coaches.
      </p>

      {aviso && <p className="text-xs mb-3 font-semibold" style={{ color: COLORS.easy }}>{aviso}</p>}

      {creando && (
        <div className="rounded-lg p-3 mb-3 space-y-2" style={card}>
          <input type="text" placeholder="Nombre del coach" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60}
            className="w-full rounded-lg px-3 py-2 text-sm" style={inputStyle} />
          <input type="password" placeholder="Contraseña (mínimo 6 caracteres)" value={clave} onChange={(e) => setClave(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && crear()} autoComplete="new-password"
            className="w-full rounded-lg px-3 py-2 text-sm" style={inputStyle} />
          {error && <p className="text-xs" style={{ color: COLORS.track }}>{error}</p>}
          <div className="flex gap-2">
            <button onClick={crear} disabled={ocupado} className="px-3 py-1.5 rounded text-xs font-semibold" style={{ background: COLORS.track, color: COLORS.lane }}>
              Crear acceso
            </button>
            <button onClick={() => { setCreando(false); setError(""); }} className="px-3 py-1.5 rounded text-xs" style={{ color: COLORS.textMuted }}>Cancelar</button>
          </div>
        </div>
      )}

      {!datos && !error && <p className="text-xs" style={{ color: COLORS.textMuted }}>Cargando…</p>}
      {datos && (
        <div className="space-y-2">
          <div className="rounded-lg p-3 flex items-center gap-3" style={card}>
            <UserCog size={16} style={{ color: COLORS.track }} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold" style={{ color: COLORS.textPrimary }}>Tú · Administrador</div>
              <div className="text-xs" style={{ color: COLORS.textMuted }}>{datos.alumnosAdmin} alumno(s) propios · ves a todos</div>
            </div>
          </div>
          {datos.coaches.length === 0 && (
            <p className="text-xs px-1" style={{ color: COLORS.textMuted }}>Todavía no hay otros coaches.</p>
          )}
          {datos.coaches.map((c) => (
            <div key={c.id} className="rounded-lg p-3" style={card}>
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate" style={{ color: COLORS.textPrimary }}>{c.nombre}</div>
                  <div className="text-xs" style={{ color: COLORS.textMuted }}>{c.alumnos} alumno(s)</div>
                </div>
                <button onClick={() => { cerrar(); setCreando(false); setAbierto(c.id); setModo("clave"); }} title="Cambiar contraseña"
                  className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-full"
                  style={{ background: COLORS.surface2, color: COLORS.lane, border: `1px solid ${COLORS.border}` }}>
                  <KeyRound size={12} /> Contraseña
                </button>
                <button onClick={() => { cerrar(); setCreando(false); setAbierto(c.id); setModo("quitar"); }} title="Quitar coach"
                  aria-label={`Quitar a ${c.nombre}`}
                  className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-full"
                  style={{ background: COLORS.surface2, color: COLORS.track, border: `1px solid ${COLORS.border}` }}>
                  <Trash2 size={12} />
                </button>
              </div>
              {abierto === c.id && modo === "clave" && (
                <div className="mt-3 space-y-2">
                  <input type="password" placeholder="Nueva contraseña (mínimo 6)" value={nuevaClave} onChange={(e) => setNuevaClave(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && cambiarClave(c)} autoComplete="new-password"
                    className="w-full rounded-lg px-3 py-2 text-sm" style={inputStyle} />
                  {error && <p className="text-xs" style={{ color: COLORS.track }}>{error}</p>}
                  <div className="flex gap-2">
                    <button onClick={() => cambiarClave(c)} disabled={ocupado} className="px-3 py-1.5 rounded text-xs font-semibold" style={{ background: COLORS.track, color: COLORS.lane }}>Guardar</button>
                    <button onClick={cerrar} className="px-3 py-1.5 rounded text-xs" style={{ color: COLORS.textMuted }}>Cancelar</button>
                  </div>
                </div>
              )}
              {abierto === c.id && modo === "quitar" && (
                <div className="mt-3 rounded-lg p-3" style={{ background: COLORS.track + "14", border: `1px solid ${COLORS.track}55` }}>
                  <p className="text-xs mb-2" style={{ color: COLORS.textPrimary }}>
                    ¿Quitar a <b>{c.nombre}</b>? Ya no podrá entrar.
                    {c.alumnos > 0 ? ` Sus ${c.alumnos} alumno(s) pasan a ti, con sus planes y pagos.` : ""}
                  </p>
                  {error && <p className="text-xs mb-2" style={{ color: COLORS.track }}>{error}</p>}
                  <div className="flex gap-2">
                    <button onClick={() => quitar(c)} disabled={ocupado} className="px-3 py-1.5 rounded text-xs font-semibold" style={{ background: COLORS.track, color: COLORS.lane }}>Sí, quitar</button>
                    <button onClick={cerrar} className="px-3 py-1.5 rounded text-xs" style={{ color: COLORS.textMuted }}>Cancelar</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {error && !creando && !abierto && <p className="text-xs mt-2" style={{ color: COLORS.track }}>{error}</p>}
    </div>
  );
}
