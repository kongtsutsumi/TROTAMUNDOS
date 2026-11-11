// Pruebas de COROS por su MCP (lib/coros.mjs): el entrenamiento en formato "course", qué hacer
// con una semana, y la lectura de las respuestas (que COROS manda casi siempre en texto).
//
// Los textos de ejemplo siguen los de la documentación de COROS MCP (tools.md) y lo que otro
// proyecto relevó con una cuenta real (ai-running-coach, octubre de 2026).
//
// Cómo correrlas:  npm test

import * as C from "../lib/coros.mjs";

let passed = 0, failed = 0;
const failures = [];
function check(name, condition, detail) {
  if (condition) passed++;
  else { failed++; failures.push(`${name}${detail ? ` — ${detail}` : ""}`); }
}
const texto = (t) => ({ content: [{ type: "text", text: t }] });

const easy = 6.3833;
const calidad = { paceKey: "custom", type: "Calidad", km: 11, easyPace: easy, customBlocks: [{ reps: 5, distKm: 1.2, paceStr: "4:55", recoveryMin: 2 }] };
const fondo = { paceKey: "long", km: 16, easyPace: easy };

console.log("▸ Entrenamiento → course");
{
  // Con alertas de ritmo, el ritmo va como objetivo; sin ellas, solo en el texto.
  const c = C.sesionACourse(calidad, easy, { libre: true, alertas: true });
  check("Corre (sportType 1)", c.sportType === 1);
  check("Nombre corto", c.courseName.length <= 100 && /11 km/.test(c.courseName), c.courseName);
  check("Descripción con los pasos", /Calentamiento 2 km/.test(c.courseDescription) && /5 x \(Repetición 1\.2 km a 4:55\/km/.test(c.courseDescription), c.courseDescription);
  check("Descripción ≤ 500", c.courseDescription.length <= 500);
  const [cal, grupo, enf] = c.sections;
  check("Calentamiento libre (LAP)", cal.sectionType === 1 && cal.targetType === 4 && cal.targetValue === undefined, JSON.stringify(cal));
  check("Enfriamiento libre", enf.sectionType === 4 && enf.targetType === 4);
  check("Grupo de 5", grupo.intervalGroup === true && grupo.repeats === 5 && grupo.sets.length === 2, JSON.stringify(grupo));
  const [rep, rec] = grupo.sets;
  check("Repetición: 1200 m", rep.sectionType === 2 && rep.targetType === 1 && rep.targetValue === 1200);
  check("Repetición: ritmo 4:55 ±5 s (lento primero)", rep.intensityType === 2 && rep.intensityValueStart === 300 && rep.intensityValueEnd === 290, JSON.stringify(rep));
  check("Recuperación: 2 min, sin ritmo", rec.sectionType === 3 && rec.targetType === 2 && rec.targetValue === 120 && rec.intensityType === undefined, JSON.stringify(rec));
  check("El grupo no lleva objetivo propio", grupo.targetType === undefined && grupo.intensityType === undefined);

  const sinLibre = C.sesionACourse(calidad, easy, { libre: false });
  check("Sin calentamiento libre: 2000 m", sinLibre.sections[0].targetType === 1 && sinLibre.sections[0].targetValue === 2000);
  const repSin = sinLibre.sections[1].sets[0];
  check("Sin alertas: el ritmo va en el texto, no como objetivo", repSin.intensityType === undefined && /Repetición 1\.2 km \(ritmo 4:55\/km\)/.test(sinLibre.courseDescription), sinLibre.courseDescription);

  const f = C.sesionACourse(fondo, easy);
  check("Fondo: una sección de 16 km", f.sections.length === 1 && f.sections[0].targetValue === 16000 && f.sections[0].sectionType === 2);
  check("Descanso: nada", C.sesionACourse({ paceKey: "" }, easy) === null);

  const muchas = C.sesionACourse({ ...calidad, customBlocks: [{ reps: 25, distKm: 0.2, paceStr: "4:00", recoveryMin: 1 }] }, easy);
  const grupos = muchas.sections.filter((s) => s.intervalGroup);
  check("Más de 20 repeticiones: se parte (20 + 5)", grupos.length === 2 && grupos[0].repeats === 20 && grupos[1].repeats === 5, JSON.stringify(grupos.map((g) => g.repeats)));
  check("Dentro de un grupo solo trabajo o recuperación", grupos.every((g) => g.sets.every((s) => s.sectionType === 2 || s.sectionType === 3)));

  check("Firma estable", C.firmaDeCourse(c) === C.firmaDeCourse(C.sesionACourse(calidad, easy, { libre: true, alertas: true })));
  check("Firma cambia con el contenido", C.firmaDeCourse(c) !== C.firmaDeCourse(sinLibre));
  check("Aviso de sesión retirada válido", C.COURSE_RETIRADO.sections[0].targetType === 4 && C.COURSE_RETIRADO.courseName.length <= 100);
}

console.log("▸ Semana");
{
  const student = { id: "ana", planStartMonday: "2026-11-09", paces: { E: easy }, weeks: { 1: { plan: [calidad, { paceKey: "" }, { paceKey: "E", type: "Rodaje", km: 8, easyPace: easy }, { paceKey: "" }, { paceKey: "" }, fondo, { paceKey: "" }] } } };
  const s = C.semanaACourses(student, 1);
  check("Tres sesiones con fecha", s.length === 3 && s[0].fecha === "2026-11-09" && s[2].fecha === "2026-11-14", JSON.stringify(s.map((x) => x.fecha)));
  check("Semana inexistente", C.semanaACourses(student, 9).length === 0);
}

console.log("▸ Plan de envío (sin borrar: COROS no deja)");
{
  const d = (dia, fecha, firma) => ({ dia, fecha, firma, course: { courseName: `S${dia}` } });
  const hoy = "2026-11-10";
  let p = C.planDeEnvioCoros([d(1, "2026-11-10", "a"), d(2, "2026-11-11", "b")], {}, hoy);
  check("Todo nuevo se crea", p.crear.length === 2 && !p.editar.length && !p.retirar.length);
  p = C.planDeEnvioCoros([d(0, "2026-11-09", "a")], {}, hoy);
  check("Lo pasado no se toca", !p.crear.length);
  const ya = { 1: { idInPlan: "3", firma: "a", fecha: "2026-11-10", nombre: "S1" }, 2: { idInPlan: "4", firma: "b", fecha: "2026-11-11", nombre: "S2" }, 4: { idInPlan: "5", firma: "x", fecha: "2026-11-13", nombre: "S4" } };
  p = C.planDeEnvioCoros([d(1, "2026-11-10", "a"), d(2, "2026-11-11", "B")], ya, hoy);
  check("Igual se deja", p.igual.includes(1));
  check("Cambiado se edita en su lugar", p.editar.length === 1 && p.editar[0].idInPlan === "4" && !p.crear.length, JSON.stringify(p));
  check("Quitado se retira", p.retirar.length === 1 && p.retirar[0].dia === 4 && p.retirar[0].idInPlan === "5");
  p = C.planDeEnvioCoros([d(4, "2026-11-13", "x")], { 4: { idInPlan: "5", firma: null, fecha: "2026-11-13", retirado: true } }, hoy);
  check("Un día retirado que vuelve se edita (no se duplica)", p.editar.length === 1 && p.editar[0].idInPlan === "5" && !p.crear.length);
  p = C.planDeEnvioCoros([], { 4: { idInPlan: "5", fecha: "2026-11-13", retirado: true } }, hoy);
  check("Lo ya retirado no se retira otra vez", !p.retirar.length);
  p = C.planDeEnvioCoros([], { 0: { idInPlan: "1", fecha: "2026-11-09", firma: "a" } }, hoy);
  check("Lo pasado no se retira", !p.retirar.length);
  p = C.planDeEnvioCoros([d(1, "2026-11-12", "a")], { 1: { idInPlan: "3", fecha: "2026-11-10", firma: "a", nombre: "S1" } }, hoy);
  check("Cambió de fecha: se retira la vieja y se crea la nueva", p.retirar.length === 1 && p.crear.length === 1);
  p = C.planDeEnvioCoros([d(1, "2026-11-10", "z")], { 1: { idInPlan: null, fecha: "2026-11-10", firma: "a", nombre: "S1" } }, hoy);
  check("Sin idInPlan no se puede editar: se crea y se avisa la vieja", p.crear.length === 1 && p.retirar.length === 1);
}

console.log("▸ Respuestas del MCP");
{
  const sse = 'event: message\ndata: {"jsonrpc":"2.0","id":3,"result":{"content":[{"type":"text","text":"ok"}]}}\n\n';
  check("SSE", C.leerRespuestaMcp(sse, 3)?.result?.content?.[0]?.text === "ok");
  check("JSON", C.leerRespuestaMcp('{"jsonrpc":"2.0","id":1,"result":{"x":1}}', 1)?.result?.x === 1);
  check("Vacío", C.leerRespuestaMcp("", 1) === null);
  check("Error JSON-RPC", C.leerRespuestaMcp('{"jsonrpc":"2.0","id":2,"error":{"code":-32602,"message":"x"}}', 2)?.error?.code === -32602);
  check("Texto de varias partes", C.textoDe({ content: [{ type: "text", text: "a" }, { type: "image" }, { type: "text", text: "b" }] }) === "a\nb");
  check("isError es rechazo", C.esRechazo({ isError: true, content: [] }) && !C.esRechazo(texto("Workout created")));

  check("idInPlan del texto", C.idInPlanDe(texto("Scheduled workout created on 2026-11-12.\nidInPlan: 2")) === "2");
  check("idInPlan estructurado", C.idInPlanDe({ content: [], structuredContent: { data: { idInPlan: 7 } } }) === "7");
  check("Sin idInPlan", C.idInPlanDe(texto("Saved.")) === null);
}

console.log("▸ Actividades");
{
  const lista = texto(`Sport Records — 2026-11-01 to 2026-11-10 (3 records)

1. Run(100) — 2026-11-09
   LabelId: 481221836600803431 | SportType: 100
   Duration: 0:58:10 | Distance: 11.02 km
   Average Pace: 5:17 /km
2. Bike(200) — 2026-11-08
   LabelId: 481221836600803499 | SportType: 200
3. Trail Run(102) — 2026-11-07
   labelId=481221836600800001
   Duration: 1:30:00`);
  const a = C.actividadesDe(lista);
  check("Tres actividades", a.length === 3, JSON.stringify(a));
  check("Con labelId, código y fecha", a[0].labelId === "481221836600803431" && a[0].sportType === 100 && a[0].fecha === "2026-11-09", JSON.stringify(a[0]));
  check("Código desde el encabezado", a[2].sportType === 102 && a[2].fecha === "2026-11-07", JSON.stringify(a[2]));
  check("Correr sí, bici no", C.esCarreraCoros(a[0].sportType) && !C.esCarreraCoros(a[1].sportType) && C.esCarreraCoros(102));
  const json = { content: [], structuredContent: { records: [{ labelId: "481221836600803431", sportType: 100, date: "20261109" }] } };
  check("Estructurado", C.actividadesDe(json)[0]?.fecha === "2026-11-09");
  check("Sin actividades", C.actividadesDe(texto("No sport records found.")).length === 0);

  const fit = texto("Files:\n481221836600803431.fit: https://oss.coros.com/fit/abc/481221836600803431.fit?sig=xyz.\nOther: https://coros.com/help");
  check("Enlace del FIT", C.enlaceFitDe(fit) === "https://oss.coros.com/fit/abc/481221836600803431.fit?sig=xyz", C.enlaceFitDe(fit));
  check("Sin enlace", C.enlaceFitDe(texto("No file")) === null);
}

console.log("▸ Reloj y atribución");
{
  check("Modelo con marca", C.modeloCoros("PACE 4") === "COROS PACE 4" && C.modeloCoros("coros VERTIX 2S") === "COROS VERTIX 2S" && C.modeloCoros("") === "COROS");
  check("Atribución", C.atribucionCoros("PACE 3") === "COROS PACE 3 · datos de COROS");
  check("Dispositivo del texto", C.dispositivoDe(texto("Bound devices:\n1. COROS PACE 4 Pro (firmware 3.1)")) === "COROS PACE 4 Pro", C.dispositivoDe(texto("Bound devices:\n1. COROS PACE 4 Pro (firmware 3.1)")));
  check("El reloj, no la banda de frecuencia", C.dispositivoDe(texto("Bound devices:\n1. COROS HEART RATE (firmware 1.2)\n2. COROS PACE 4 (firmware 3.1)")) === "COROS PACE 4");
  check("Solo una banda: ningún reloj", C.dispositivoDe(texto("Bound devices:\n1. COROS HEART RATE")) === null);
  check("Qué es reloj", C.esReloj("COROS PACE 4") && C.esReloj("COROS VERTIX 2S") && !C.esReloj("COROS HEART RATE") && !C.esReloj("COROS POD 2") && !C.esReloj("COROS") && !C.esReloj(null));
  check("Dispositivo por etiqueta", C.dispositivoDe(texto("Device name: APEX 2 Pro")) === "APEX 2 Pro");
  check("Dispositivo estructurado", C.dispositivoDe({ content: [], structuredContent: { devices: [{ deviceName: "PACE 3" }] } }) === "PACE 3");
}

console.log("▸ Salud");
{
  const sueño = `Sleep Overview

2026-10-15
Sleep Score: 91
Daily Sleep: 7h 57min (incl. naps)
Main Sleep (asleep): 7h 57min
Deep Sleep Ratio: 27%
Awake Time: 5 min
Main Sleep Window: 2026-10-15 00:28 - 2026-10-15 08:30

2026-10-16
Sleep Score: 0
Sleep detail for this day is not available yet`;
  const s = C.sueñoDeCoros(sueño);
  check("Sueño: puntaje, minutos y despierto", s["2026-10-15"]?.sueñoPuntaje === 91 && s["2026-10-15"]?.sueñoMin === 477 && s["2026-10-15"]?.despiertoMin === 5, JSON.stringify(s));
  check("Sueño: 0 es 'todavía no', no un puntaje", !s["2026-10-16"]);
  check("La ventana de sueño no abre otro día", Object.keys(s).length === 1);

  const vfc = C.vfcDeCoros("Sleep HRV\n\n2026-10-24\nHRV Avg: 23 ms\nNormal Range: 30-50 ms\n\n2026-10-25\nHRV Baseline: 42 ms\nAverage HRV: 45 ms");
  check("VFC", vfc["2026-10-24"]?.vfc === 23 && vfc["2026-10-25"]?.vfc === 45, JSON.stringify(vfc));

  const rep = C.reposoDeCoros("Resting Heart Rate\n2026-10-22: 66 bpm\n2026-10-23: No data\n2026-10-24: 64 bpm");
  check("FC en reposo (sin inventar los días sin dato)", rep["2026-10-22"]?.fcReposo === 66 && !rep["2026-10-23"] && rep["2026-10-24"]?.fcReposo === 64, JSON.stringify(rep));

  const dia = C.diarioDeCoros("Resting HR: 68 bpm | HRV Baseline: 42 ms\n\n2026-10-22\nSteps: 12,345\nCalories: 2,310 kcal\nAverage Stress: 31");
  check("Diario: pasos, calorías, estrés", dia["2026-10-22"]?.pasos === 12345 && dia["2026-10-22"]?.calorias === 2310 && dia["2026-10-22"]?.estres === 31, JSON.stringify(dia));

  const todo = C.saludDesdeCoros({ sueño, vfc: "2026-10-15\nHRV Avg: 50 ms", reposo: "2026-10-15: 60 bpm", diario: "2026-10-15\nSteps: 9000" });
  check("Se junta por día", todo["2026-10-15"]?.sueñoMin === 477 && todo["2026-10-15"]?.vfc === 50 && todo["2026-10-15"]?.fcReposo === 60 && todo["2026-10-15"]?.pasos === 9000, JSON.stringify(todo));
  check("Nada que leer", Object.keys(C.saludDesdeCoros({})).length === 0);
  const compacta = C.reposoDeCoros("Resting HR\n20261022: 66 bpm\nDate: 2026/10/23 - 64 bpm");
  check("Fechas en otros formatos", compacta["2026-10-22"]?.fcReposo === 66 && compacta["2026-10-23"]?.fcReposo === 64, JSON.stringify(compacta));
  check("Máscara del diagnóstico", C.enmascarar("HRV Avg: 48 ms on 2026-11-10") === "HRV Avg: ## ms on ####-##-##");
}

console.log("▸ Al desconectar: fuera el detalle de COROS");
{
  const reloj = { id: "coros-1", fuente: "coros", fecha: "2026-11-09T07:00:00", km: 11, min: 58, ritmo: "5:17", fcMedia: 150, vueltas: [{}], kms: [{}], pasos: {}, dispositivo: "COROS PACE 4 · datos de COROS" };
  const student = { id: "ana", weeks: {
    1: { plan: [{}, {}], log: [{ completed: true, actualKm: "11", actualPaceStr: "5:17", rpe: 6, reloj }, { completed: true, reloj: { id: "g1", fuente: "garmin", km: 5 } }],
      extras: [{ ...reloj, id: "coros-2", dia: 3 }, { id: "i1", km: 3 }] },
  } };
  const { student: s, cambios } = C.sinDetalleDeCoros(student);
  const l = s.weeks[1].log;
  check("Dos cambios", cambios === 2, cambios);
  check("La sesión conserva lo del alumno", l[0].completed && l[0].actualKm === "11" && l[0].actualPaceStr === "5:17" && l[0].rpe === 6);
  check("Sin el bloque del reloj de COROS", l[0].reloj === undefined);
  check("Lo de Garmin no se toca", l[1].reloj?.fuente === "garmin");
  const x = s.weeks[1].extras[0];
  check("Salida suelta: solo lo básico", x.km === 11 && x.min === 58 && x.fecha === "2026-11-09" && x.retirado && x.vueltas === undefined && x.fcMedia === undefined && x.dispositivo === undefined, JSON.stringify(x));
  check("Otras salidas no se tocan", s.weeks[1].extras[1].km === 3 && s.weeks[1].extras[1].retirado === undefined);
  check("Una segunda vez no cambia nada", C.sinDetalleDeCoros(s).cambios === 0);
  check("El original no se modifica", student.weeks[1].log[0].reloj === reloj);
}

console.log(`\n${passed} pruebas OK, ${failed} fallidas.`);
if (failed) {
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
