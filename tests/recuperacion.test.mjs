// Pruebas de la recuperación (lib/recuperacion.mjs) y de la lectura de "wellness" de
// intervals.icu (lib/salud.mjs). Cómo correrlas:  npm test

import * as R from "../lib/recuperacion.mjs";
import { saludDesdeIntervals } from "../lib/salud.mjs";

let passed = 0, failed = 0;
const failures = [];
function check(name, condition, detail) {
  if (condition) passed++;
  else { failed++; failures.push(`${name}${detail ? ` — ${detail}` : ""}`); }
}
const dia = (iso, n) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

// 28 días "normales" antes del 2026-11-10, con algo de variación.
const HOY = "2026-11-10";
function filasNormales({ hasta = dia(HOY, -1), n = 28, fuente = "coros" } = {}) {
  const filas = [];
  for (let i = 0; i < n; i++) {
    const f = dia(hasta, -i);
    filas.push({ fecha: f, fuente, datos: { vfc: 50 + ((i % 5) - 2) * 2, fcReposo: 50 + (i % 3) - 1, sueñoMin: 450 + ((i % 4) - 2) * 10 } });
  }
  return filas;
}

console.log("▸ Por día y normal");
{
  const d = R.porDia([{ fecha: HOY, fuente: "coros", datos: { vfc: 40 } }, { fecha: HOY, fuente: "intervals", datos: { vfc: 99, pasos: 100 } }]);
  check("Junta fuentes del mismo día sin pisar", d[HOY].datos.vfc === 40 && d[HOY].datos.pasos === 100);
  const dias = R.porDia(filasNormales());
  const b = R.lineaBase(dias, "vfc", HOY);
  check("Normal de 28 días", b.n === 28 && Math.abs(b.media - 50) < 1 && b.rango[0] < 50 && b.rango[1] > 50, JSON.stringify(b));
  check("No incluye el propio día", R.lineaBase({ ...dias, [HOY]: { datos: { vfc: 1000 } } }, "vfc", HOY).media < 60);
  check("Con pocos días, todavía no hay normal", R.lineaBase(R.porDia(filasNormales({ n: 3 })), "vfc", HOY).media === null);
}

console.log("▸ Semáforo");
{
  const base = filasNormales();
  const bien = R.evaluarDia(R.porDia([...base, { fecha: HOY, fuente: "coros", datos: { vfc: 52, fcReposo: 49, sueñoMin: 470 } }]), HOY);
  check("Día normal: listo", bien.banda === "listo" && bien.puntaje >= 70 && bien.tono === "bien", JSON.stringify([bien.puntaje, bien.banda]));
  check("Frase con consejo", /Dormiste 7 h 50/.test(bien.frase) && /entrena como está planeado/.test(bien.frase), bien.frase);
  check("Cada dato con su estado", bien.datos.vfc.tono === "bien" && bien.datos.fcReposo.tono === "bien" && bien.datos.sueño.tono === "bien");

  const mal = R.evaluarDia(R.porDia([...base, { fecha: HOY, fuente: "coros", datos: { vfc: 36, fcReposo: 56, sueñoMin: 320 } }]), HOY);
  check("Mala noche y VFC baja: recupera", mal.banda === "recupera" && mal.puntaje < 50 && mal.tono === "alerta", JSON.stringify([mal.puntaje, mal.banda]));
  check("Alerta en cada dato", mal.datos.vfc.tono === "alerta" && mal.datos.fcReposo.tono === "alerta" && mal.datos.sueño.tono === "alerta");
  check("Pide hablar con el coach", /coach/.test(mal.frase) && /Dormiste solo 5 h 20/.test(mal.frase), mal.frase);

  const medio = R.evaluarDia(R.porDia([...base, { fecha: HOY, fuente: "coros", datos: { vfc: 45, fcReposo: 52, sueñoMin: 400 } }]), HOY);
  check("Algo bajo: ve con calma", medio.banda === "calma", JSON.stringify([medio.puntaje, medio.banda]));

  const nuevo = R.evaluarDia(R.porDia([...filasNormales({ n: 2 }), { fecha: HOY, fuente: "coros", datos: { vfc: 50, sueñoMin: 450 } }]), HOY);
  check("Alumno nuevo: aprendiendo, sin puntaje", nuevo.puntaje === null && nuevo.aprendiendo && nuevo.faltan === 3, JSON.stringify([nuevo.puntaje, nuevo.faltan]));
  const soloSueño = R.evaluarDia(R.porDia([...base, { fecha: HOY, fuente: "coros", datos: { sueñoMin: 450 } }]), HOY);
  check("Un solo dato no alcanza para puntaje", soloSueño.puntaje === null);
  check("Puntaje entre 0 y 100", [bien, mal, medio].every((e) => e.puntaje >= 0 && e.puntaje <= 100));
  check("Bandas", R.bandaDe(70) === "listo" && R.bandaDe(69) === "calma" && R.bandaDe(49) === "recupera" && R.bandaDe(null) === null);
  check("Horas", R.horasTexto(432) === "7 h 12" && R.horasTexto(480) === "8 h" && R.horasTexto(null) === "—");
}

console.log("▸ Historial y último día");
{
  const dias = R.porDia(filasNormales());
  const h = R.historial(dias, HOY, 28);
  check("28 días en orden", h.length === 28 && h[27].fecha === HOY && h[0].fecha === dia(HOY, -27));
  check("Último día con datos (hoy todavía no llega)", R.ultimoDiaConDatos(dias, HOY) === dia(HOY, -1));
  check("Nada en 3 días: null", R.ultimoDiaConDatos({}, HOY) === null);
}

console.log("▸ Entrenamientos y lectura de la semana");
{
  const student = {
    planStartMonday: "2026-11-02",
    weeks: { 1: {
      plan: [{ paceKey: "E", km: 8, type: "Rodaje" }, { paceKey: "custom", km: 11, type: "Calidad" }, { paceKey: "" }, { paceKey: "E", km: 8 }, { paceKey: "" }, { paceKey: "long", km: 18 }, { paceKey: "" }],
      log: [{ completed: true, actualKm: "8.2" }, { completed: true }, {}, {}, {}, { completed: true, actualKm: "18.3" }, {}],
    } },
  };
  const s = R.sesionesPorFecha(student);
  check("Sesiones con fecha y tipo", s["2026-11-02"].tipo === "suave" && s["2026-11-03"].tipo === "calidad" && s["2026-11-07"].tipo === "fondo" && !s["2026-11-04"], JSON.stringify(Object.keys(s)));
  check("Km hechos", s["2026-11-02"].kmHechos === 8.2 && s["2026-11-03"].kmHechos === 11 && s["2026-11-05"].kmHechos === 0);
  const km = R.kmPorSemana(s, HOY, 2);
  check("Km por semana", km.length === 2 && km[0].desde === "2026-11-02" && km[0].km === 37.5 && km[1].km === 0, JSON.stringify(km));

  // VFC normal, cae el domingo 8 (día siguiente al fondo del sábado 7) y vuelve el martes 10.
  const filas = filasNormales({ hasta: "2026-11-06" });
  const vfcs = { "2026-11-07": 50, "2026-11-08": 36, "2026-11-09": 44, "2026-11-10": 50 };
  for (const [f, v] of Object.entries(vfcs)) filas.push({ fecha: f, fuente: "coros", datos: { vfc: v, fcReposo: 50, sueñoMin: 450 } });
  const sem = R.historial(R.porDia(filas), HOY, 7);
  const lectura = R.lecturaDeLaSemana(sem, s);
  check("Lectura: bajó después del fondo y volvió en 2 días", /fondo/i.test(lectura) && /sábado/.test(lectura) && /2 días/.test(lectura), lectura);
  const tranquila = R.lecturaDeLaSemana(R.historial(R.porDia(filasNormales({ hasta: HOY })), HOY, 7), s);
  check("Semana tranquila", /se mantuvo en tu normal/.test(tranquila), tranquila);
  const sinVuelta = R.lecturaDeLaSemana(R.historial(R.porDia([...filasNormales({ hasta: "2026-11-07" }), { fecha: "2026-11-08", fuente: "x", datos: { vfc: 34 } }, { fecha: "2026-11-09", fuente: "x", datos: { vfc: 38 } }]), "2026-11-09", 7), s);
  check("Todavía no vuelve: avisar al coach", /todavía no vuelve/.test(sinVuelta) && /coach/.test(sinVuelta), sinVuelta);
}

console.log("▸ Wellness de intervals.icu");
{
  const w = saludDesdeIntervals({ id: "2026-11-10", sleepSecs: 25920, sleepScore: 84, hrv: 48, restingHR: 52, steps: 10500, weight: 68.2, soreness: 2, mood: 3 });
  check("Campos traducidos", w.fecha === "2026-11-10" && w.datos.sueñoMin === 432 && w.datos.vfc === 48 && w.datos.fcReposo === 52 && w.datos.pasos === 10500 && w.datos.pesoKg === 68.2, JSON.stringify(w));
  check("Sin campos subjetivos", w.datos.soreness === undefined && w.datos.mood === undefined);
  check("Día vacío: null", saludDesdeIntervals({ id: "2026-11-10" }) === null);
  check("Fecha inválida: null", saludDesdeIntervals({ id: "ayer", hrv: 40 }) === null);
  check("Fuera de rango se descarta", saludDesdeIntervals({ id: "2026-11-10", restingHR: 400, hrv: 40 }).datos.fcReposo === undefined);
}

console.log(`\n${passed} pruebas OK, ${failed} fallidas.`);
if (failed) {
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
