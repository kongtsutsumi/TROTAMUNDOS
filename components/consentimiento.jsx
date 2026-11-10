"use client";
// Consentimiento del alumno para los datos de su reloj, en la pestaña del reloj.
//
//   · ConsentimientoAntesDeConectar: las dos casillas (entrenamiento, obligatoria; salud,
//     opcional) que van antes del botón "Conectar mi reloj".
//   · PermisosDelReloj: con el reloj ya conectado, qué aceptó y cuándo, y el interruptor
//     para dar o retirar el de salud. A quien conectó antes de que existiera esto, le pide
//     confirmar sus permisos.
//
// El servidor (app/api/consentimiento) es quien decide y guarda; esto solo es la pantalla.
// Lo que se acepta está explicado en la política de privacidad (/privacidad).
import React, { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { COLORS } from "../lib/plan-engine.mjs";
import { consentimientoOp } from "../lib/storage";

const TEXTO_ENTRENAMIENTO = "Acepto que TROTAMUNDOS envíe mis entrenamientos a mi reloj y reciba mis actividades (distancia, ritmo, frecuencia cardíaca, vueltas, recorrido GPS y el archivo completo) para que mi coach haga seguimiento de mi plan.";
const TEXTO_SALUD = "Acepto también que reciba mis datos de salud (sueño, variabilidad de la frecuencia cardíaca, frecuencia cardíaca en reposo, estrés, energía, oxigenación, pasos y peso) para los reportes de recuperación que vemos mi coach y yo. Es opcional.";

const Politica = () => (
  <a href="/privacidad" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: COLORS.track }}>política de privacidad</a>
);

function Casilla({ checked, onChange, disabled, children, testid }) {
  return (
    <label className="flex items-start gap-2.5 cursor-pointer mb-2.5">
      <input type="checkbox" className="w-4 h-4 mt-0.5 shrink-0" checked={checked} disabled={disabled}
        onChange={(e) => onChange(e.target.checked)} data-testid={testid} />
      <span className="text-xs leading-relaxed" style={{ color: COLORS.textPrimary }}>{children}</span>
    </label>
  );
}

const fechaCorta = (iso) => {
  const t = Date.parse(iso || "");
  return Number.isFinite(t) ? new Date(t).toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" }) : "";
};

// Aviso propio de cada marca, cuando el acuerdo con ella lo exige. Garmin pide avisar que los
// entrenamientos se transfieren a Garmin Connect, enlazar su aviso de privacidad y pedir
// que no conecte quien tenga restringido subir esos datos a su cuenta.
const AVISO_DE_MARCA = {
  garmin: (
    <>
      Tus entrenamientos se enviarán a tu cuenta de Garmin Connect, que los trata según su{" "}
      <a href="https://www.garmin.com/privacy/connect" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: COLORS.track }}>aviso de privacidad</a>.
      Si tienes alguna restricción para subir datos a tu cuenta de Garmin Connect, no la conectes.
    </>
  ),
};

// Antes de conectar. onConectar se llama solo después de guardar el consentimiento.
//   marca: "garmin", "coros"… (o nada para intervals.icu) — agrega el aviso que esa marca pida.
export function ConsentimientoAntesDeConectar({ studentId, ocupado, onConectar, marca = null }) {
  const [entrenamiento, setEntrenamiento] = useState(false);
  const [salud, setSalud] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const continuar = async () => {
    setGuardando(true); setError("");
    const r = await consentimientoOp("guardar", studentId, { entrenamiento: true, salud });
    setGuardando(false);
    if (!r.ok) {
      return setError(/Solo tú/.test(r.error || "")
        ? "Esta pantalla está abierta con otra sesión (por ejemplo, la del coach). Sal y vuelve a entrar con el nombre y el PIN del alumno."
        : r.error || "No se pudo guardar tu consentimiento.");
    }
    onConectar();
  };

  return (
    <div data-testid="consentimiento-conectar">
      <Casilla checked={entrenamiento} onChange={(v) => { setEntrenamiento(v); if (!v) setSalud(false); }} testid="consent-entrenamiento">
        {TEXTO_ENTRENAMIENTO}
      </Casilla>
      <Casilla checked={salud} onChange={setSalud} disabled={!entrenamiento} testid="consent-salud">
        {TEXTO_SALUD}
      </Casilla>
      {AVISO_DE_MARCA[marca] && (
        <p className="text-xs mb-2.5" style={{ color: COLORS.textMuted }} data-testid="aviso-marca">{AVISO_DE_MARCA[marca]}</p>
      )}
      <p className="text-xs mb-3" style={{ color: COLORS.textMuted }}>
        Puedes retirar cualquiera de los dos cuando quieras desde esta pantalla. Detalles en la <Politica />.
      </p>
      {error && <p className="text-xs mb-2" style={{ color: COLORS.hard }}>{error}</p>}
      <button onClick={continuar} disabled={!entrenamiento || ocupado || guardando} data-testid="boton-conectar"
        className="px-4 py-2 rounded-lg text-sm font-semibold"
        style={{ background: COLORS.track, color: COLORS.lane, opacity: !entrenamiento ? 0.45 : 1 }}>
        {ocupado || guardando ? "Abriendo…" : "Conectar mi reloj"}
      </button>
    </div>
  );
}

// Con el reloj conectado.
export function PermisosDelReloj({ studentId, consentimiento, onCambio }) {
  const [ocupado, setOcupado] = useState(false);
  const [confirmarRetiro, setConfirmarRetiro] = useState(false);
  const [aviso, setAviso] = useState("");
  const [error, setError] = useState("");
  const [saludNueva, setSaludNueva] = useState(false);
  const c = consentimiento || {};

  const guardar = async (cambios, mensaje) => {
    setOcupado(true); setError(""); setAviso("");
    const r = await consentimientoOp("guardar", studentId, cambios);
    setOcupado(false); setConfirmarRetiro(false);
    if (!r.ok) {
      return setError(/Solo tú/.test(r.error || "")
        ? "Esta pantalla está abierta con otra sesión (por ejemplo, la del coach). Sal y vuelve a entrar con el nombre y el PIN del alumno."
        : r.error || "No se pudo guardar.");
    }
    setAviso(mensaje);
    await onCambio?.();
  };

  const caja = { background: COLORS.bg, border: `1px solid ${COLORS.border}` };

  // Conectó antes de que existiera el registro, o aceptó una versión anterior de la política.
  if (!c.registrado || !c.entrenamiento?.aceptado || !c.vigente) {
    return (
      <div className="rounded-lg p-3 mb-3" style={{ background: COLORS.bg, border: `1px solid ${COLORS.moderate}88` }} data-testid="consentimiento-confirmar">
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck size={14} style={{ color: COLORS.moderate }} />
          <span className="text-sm font-semibold" style={{ color: COLORS.textPrimary }}>Confirma tus permisos</span>
        </div>
        <p className="text-xs mb-2.5" style={{ color: COLORS.textMuted }}>
          Actualizamos nuestra <Politica />. Para seguir usando tu reloj con TROTAMUNDOS, confirma qué aceptas:
        </p>
        <Casilla checked disabled onChange={() => {}}>{TEXTO_ENTRENAMIENTO}</Casilla>
        <Casilla checked={saludNueva} onChange={setSaludNueva} testid="confirmar-salud">{TEXTO_SALUD}</Casilla>
        {error && <p className="text-xs mb-2" style={{ color: COLORS.hard }}>{error}</p>}
        <button onClick={() => guardar({ entrenamiento: true, salud: saludNueva }, "Gracias, tus permisos quedaron guardados.")} disabled={ocupado}
          className="px-3 py-1.5 rounded text-xs font-semibold" style={{ background: COLORS.track, color: COLORS.lane }} data-testid="confirmar-permisos">
          Confirmar
        </button>
        <p className="text-xs mt-2" style={{ color: COLORS.textMuted }}>Si no estás de acuerdo, puedes desconectar tu reloj más abajo.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg p-3 mb-3" style={caja} data-testid="permisos-reloj">
      <div className="flex items-center gap-2 mb-2">
        <ShieldCheck size={14} style={{ color: COLORS.easy }} />
        <span className="text-sm font-semibold" style={{ color: COLORS.textPrimary }}>Tus permisos</span>
      </div>
      <p className="text-xs mb-2" style={{ color: COLORS.textMuted }}>
        <b style={{ color: COLORS.textPrimary }}>Datos de entrenamiento:</b> aceptado{c.entrenamiento?.fecha ? ` el ${fechaCorta(c.entrenamiento.fecha)}` : ""}.
        Para retirarlo, desconecta tu reloj.
      </p>
      <label className="flex items-center justify-between gap-3 cursor-pointer">
        <span className="text-xs" style={{ color: COLORS.textMuted }}>
          <b style={{ color: COLORS.textPrimary }}>Datos de salud</b> (sueño, VFC, FC en reposo, estrés, energía):{" "}
          {c.salud?.aceptado ? `aceptado${c.salud.fecha ? ` el ${fechaCorta(c.salud.fecha)}` : ""}` : "no aceptado"}.
        </span>
        <input type="checkbox" className="w-5 h-5 shrink-0" checked={!!c.salud?.aceptado} disabled={ocupado} data-testid="interruptor-salud"
          onChange={(e) => {
            if (e.target.checked) guardar({ salud: true }, "Listo: aceptaste tus datos de salud.");
            else setConfirmarRetiro(true);
          }} />
      </label>
      {confirmarRetiro && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs" style={{ color: COLORS.textMuted }}>Se borrarán todos tus datos de salud guardados y no se recibirán más.</span>
          <button onClick={() => guardar({ salud: false }, "Retiraste tu consentimiento: tus datos de salud se borraron.")} disabled={ocupado}
            className="px-3 py-1.5 rounded text-xs font-semibold" style={{ background: COLORS.hard, color: COLORS.lane }} data-testid="retirar-salud">
            Sí, retirar
          </button>
          <button onClick={() => setConfirmarRetiro(false)} className="px-3 py-1.5 rounded text-xs"
            style={{ color: COLORS.textMuted, border: `1px solid ${COLORS.border}` }}>Cancelar</button>
        </div>
      )}
      {aviso && <p className="text-xs mt-2" style={{ color: COLORS.easy }}>{aviso}</p>}
      {error && <p className="text-xs mt-2" style={{ color: COLORS.hard }}>{error}</p>}
    </div>
  );
}
