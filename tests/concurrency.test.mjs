// Pruebas de escrituras simultáneas entre el coach y el alumno.
//
// El problema que resuelven: antes, ambos guardaban el registro COMPLETO del alumno, así que
// si los dos tenían la pantalla abierta a la vez, el último en guardar borraba los cambios del
// otro — sin ningún aviso. Ahora el servidor fusiona campo por campo según quién sea el dueño
// de cada dato: el coach del plan, el alumno de su registro de sesiones.
//
// Se replica aquí la lógica de app/api/data/route.js para poder probarla sin levantar el servidor.

let passed = 0, failed = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) passed++;
  else { failed++; failures.push(`${name}${detail ? ` — ${detail}` : ""}`); }
}

function isPureReorder(basePlan, incomingPlan) {
  if (!Array.isArray(basePlan) || !Array.isArray(incomingPlan)) return false;
  if (basePlan.length !== incomingPlan.length) return false;
  const fp = (d) => { const { day, movedFrom, ...rest } = d || {}; return JSON.stringify(rest); };
  const a = basePlan.map(fp).sort(), b = incomingPlan.map(fp).sort();
  return a.every((x, i) => x === b[i]);
}
function mergeAsStudent(current, value) {
  const mergedWeeks = { ...current.weeks };
  for (const [wkNum, incoming] of Object.entries(value?.weeks || {})) {
    const base = current.weeks?.[wkNum];
    if (!base) continue;
    mergedWeeks[wkNum] = {
      ...base,
      log: incoming.log ?? base.log,
      plan: isPureReorder(base.plan, incoming.plan) ? incoming.plan : base.plan,
      submitted: incoming.submitted ?? base.submitted,
      studentSubmitted: incoming.studentSubmitted ?? base.studentSubmitted,
    };
  }
  return { ...current, weeks: mergedWeeks, pinHash: current.pinHash, goal: current.goal,
           paces: current.paces, currentWeek: current.currentWeek, name: current.name };
}
function mergeAsCoach(current, value) {
  if (!current?.weeks || !value?.weeks) return value;
  const mergedWeeks = { ...value.weeks };
  for (const [wkNum, incoming] of Object.entries(value.weeks)) {
    const stored = current.weeks[wkNum];
    if (!stored?.log || !incoming) continue;
    const mergedLog = (incoming.log || []).map((entry, i) => {
      const se = stored.log[i];
      return se?.completed && !entry?.completed ? se : entry;
    });
    mergedWeeks[wkNum] = { ...incoming, log: mergedLog };
  }
  return { ...value, weeks: mergedWeeks };
}

const base = () => ({
  id: "s1", name: "Ana", goal: "42k", paces: { E: 4.4 }, pinHash: "abc", currentWeek: 3,
  weeks: { 3: { plan: [{ day: "Lun", km: 10 }, { day: "Mar", km: 12 }],
                log: [{ completed: false }, { completed: false }] } },
});
const copy = (o) => JSON.parse(JSON.stringify(o));

console.log("\n▸ El coach edita el plan mientras el alumno registra");
{
  let db = base();
  const coach = copy(db), student = copy(db);
  coach.weeks[3].plan[0].km = 15;
  student.weeks[3].log[0] = { completed: true, actualKm: 10 };
  db = mergeAsCoach(db, coach);
  db = mergeAsStudent(db, student);
  check("El cambio del coach sobrevive", db.weeks[3].plan[0].km === 15, `km quedó en ${db.weeks[3].plan[0].km}`);
  check("El registro del alumno sobrevive", db.weeks[3].log[0].completed === true);
}

console.log("▸ El mismo caso en orden inverso");
{
  let db = base();
  const coach = copy(db), student = copy(db);
  coach.weeks[3].plan[1].km = 20;
  student.weeks[3].log[1] = { completed: true, actualKm: 12 };
  db = mergeAsStudent(db, student);
  db = mergeAsCoach(db, coach);
  check("El cambio del coach sobrevive (orden inverso)", db.weeks[3].plan[1].km === 20);
  check("El registro del alumno sobrevive (orden inverso)", db.weeks[3].log[1].completed === true);
}

console.log("▸ El alumno no puede alterar su propio plan");
{
  let db = base();
  const bad = copy(db);
  bad.weeks[3].plan[0].km = 1;
  bad.goal = "5k";
  bad.paces = { E: 99 };
  bad.pinHash = "hackeado";
  db = mergeAsStudent(db, bad);
  check("No puede cambiar los km de su plan", db.weeks[3].plan[0].km === 10);
  check("No puede cambiar su objetivo", db.goal === "42k");
  check("No puede cambiar sus ritmos", db.paces.E === 4.4);
  check("No puede cambiar su PIN", db.pinHash === "abc");
}

console.log("▸ El alumno sí puede reordenar sus días");
{
  let db = base();
  const moved = copy(db);
  const tmp = moved.weeks[3].plan[0];
  moved.weeks[3].plan[0] = { ...moved.weeks[3].plan[1], day: "Lun" };
  moved.weeks[3].plan[1] = { ...tmp, day: "Mar" };
  db = mergeAsStudent(db, moved);
  check("Mover una sesión a otro día sí se acepta", db.weeks[3].plan[0].km === 12,
    `el lunes quedó con ${db.weeks[3].plan[0].km} km`);
}

console.log("▸ El coach no borra lo que el alumno ya marcó");
{
  let db = base();
  db.weeks[3].log[0] = { completed: true, actualKm: 10 };
  const staleCoach = base(); // copia vieja del coach, sin ese registro
  staleCoach.weeks[3].plan[0].km = 18;
  db = mergeAsCoach(db, staleCoach);
  check("El registro del alumno no se borra", db.weeks[3].log[0].completed === true);
  check("Y el cambio del coach sí se aplica", db.weeks[3].plan[0].km === 18);
}

console.log("\n" + "─".repeat(52));
if (failed === 0) {
  console.log(`✓ ${passed} verificaciones, todas correctas.`);
  process.exit(0);
} else {
  console.log(`✗ ${failed} de ${passed + failed} fallaron:\n`);
  failures.forEach((f) => console.log(`   • ${f}`));
  process.exit(1);
}
