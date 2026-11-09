// Pruebas del equipo de coaches (lib/equipo.mjs).
//
// Lo que más importa que no se rompa:
//   · que un coach adicional no vea ni toque alumnos que no son suyos;
//   · que el navegador nunca decida de qué coach es un alumno;
//   · que un coach no pueda borrar, al guardar el listado, a los alumnos de otro;
//   · que el administrador lo vea todo, y que las sesiones de antes sigan siendo suyas.
//
// Cómo correrlas:  npm test

import * as E from "../lib/equipo.mjs";
import * as M from "../lib/muro.mjs";

let passed = 0, failed = 0;
const failures = [];
function check(name, condition, detail) {
  if (condition) passed++;
  else { failed++; failures.push(`${name}${detail ? ` — ${detail}` : ""}`); }
}

const admin = { role: "coach", coachId: "admin" };
const adminViejo = { role: "coach" }; // sesión de antes del equipo
const luis = { role: "coach", coachId: "c-luis000001", v: 1 };
const maria = { role: "coach", coachId: "c-maria00001", v: 1 };
const alumno = { role: "student", studentId: "ana" };

const roster = [
  { id: "ana", name: "Ana" },
  { id: "beto", name: "Beto", coachId: "c-luis000001" },
  { id: "caro", name: "Caro" },
  { id: "dani", name: "Dani", coachId: "c-luis000001" },
  { id: "eva", name: "Eva", coachId: "c-maria00001" },
];

console.log("\n▸ Quién es quién");
check("Sesión del administrador", E.esAdmin(admin) && E.idCoachDeSesion(admin) === "admin");
check("Una sesión de coach de antes es del administrador", E.esAdmin(adminViejo));
check("Un coach adicional no es administrador", !E.esAdmin(luis) && E.idCoachDeSesion(luis) === "c-luis000001");
check("Un alumno no es coach", E.idCoachDeSesion(alumno) === null && !E.esAdmin(alumno));
check("Sin sesión no es nada", E.idCoachDeSesion(null) === null && !E.esAdmin(null));
check("Un alumno sin coach es del administrador", E.coachDeEntrada(roster[0]) === "admin");
check("Un alumno con coach es de ese coach", E.coachDeEntrada(roster[1]) === "c-luis000001");
check("Un coachId inválido cuenta como del administrador", E.coachDeEntrada({ id: "x", coachId: "../roster" }) === "admin");

console.log("\n▸ Ver alumnos");
check("El administrador ve a todos", E.filtrarRoster(admin, roster).length === 5);
check("Luis ve solo a los suyos", JSON.stringify(E.filtrarRoster(luis, roster).map((r) => r.id)) === '["beto","dani"]');
check("María ve solo a la suya", JSON.stringify(E.filtrarRoster(maria, roster).map((r) => r.id)) === '["eva"]');
check("Un alumno no maneja a nadie", !E.puedeManejar(alumno, roster[0]));
check("El administrador maneja a un alumno de Luis", E.puedeManejar(admin, roster[1]));
check("El administrador maneja a un alumno que aún no está en el listado", E.puedeManejar(admin, null));
check("Luis no maneja a un alumno que no está en el listado", !E.puedeManejar(luis, null));
check("Luis no maneja a un alumno del administrador", !E.puedeManejar(luis, roster[0]));
check("Luis no maneja a una alumna de María", !E.puedeManejar(luis, roster[4]));
check("Pagos/muro: el administrador ve como propios solo los suyos", E.esPropio(admin, roster[0]) && !E.esPropio(admin, roster[1]));
check("Pagos/muro: Luis ve como propios los suyos", E.esPropio(luis, roster[1]) && !E.esPropio(luis, roster[0]));

console.log("\n▸ Guardar el listado (coach adicional)");
{
  // Luis tiene en pantalla solo a los suyos; cambia a Beto, quita a Dani y agrega a Fer.
  const entrante = [{ id: "beto", name: "Beto R." }, { id: "fer", name: "Fer" }];
  const r = E.fusionarRoster(luis, roster, entrante);
  const ids = r.map((x) => x.id);
  check("Los alumnos de otros coaches siguen ahí", ["ana", "caro", "eva"].every((id) => ids.includes(id)), ids.join(","));
  check("Su cambio se guarda", r.find((x) => x.id === "beto")?.name === "Beto R.");
  check("Lo que quitó, se quita", !ids.includes("dani"));
  check("El nuevo es suyo", r.find((x) => x.id === "fer")?.coachId === "c-luis000001");
  check("Los demás quedan intactos", JSON.stringify(r.find((x) => x.id === "eva")) === JSON.stringify(roster[4]));

  // Intenta "robar" o tocar a alumnos ajenos desde su navegador.
  const malo = [
    { id: "beto", name: "Beto", coachId: "c-maria00001" },  // pasárselo a María
    { id: "ana", name: "Ana HACKEADA" },                    // editar a una del administrador
    { id: "eva", name: "Eva", coachId: "c-luis000001" },    // quedarse con la de María
  ];
  const r2 = E.fusionarRoster(luis, roster, malo);
  check("No puede pasar un alumno a otro coach", r2.find((x) => x.id === "beto")?.coachId === "c-luis000001");
  check("No puede editar a un alumno del administrador", r2.find((x) => x.id === "ana")?.name === "Ana");
  check("No puede quedarse con la alumna de otro coach", r2.find((x) => x.id === "eva")?.coachId === "c-maria00001");
  check("Ni duplicarla", r2.filter((x) => x.id === "eva").length === 1);

  const vacio = E.fusionarRoster(luis, roster, []);
  check("Un listado vacío solo quita a los suyos", vacio.length === 3 && !vacio.some((x) => x.coachId === "c-luis000001"));
}

console.log("\n▸ Guardar el listado (administrador)");
{
  // El administrador tiene a todos en pantalla, pero su copia puede venir sin coachId.
  const entrante = roster.map(({ coachId, ...r }) => r).concat([{ id: "gabi", name: "Gabi", coachId: "c-luis000001" }]);
  const r = E.fusionarRoster(admin, roster, entrante);
  check("El administrador no le quita el coach a nadie al guardar", r.find((x) => x.id === "beto")?.coachId === "c-luis000001" && r.find((x) => x.id === "eva")?.coachId === "c-maria00001");
  check("Un alumno nuevo del administrador es suyo, diga lo que diga el navegador", !("coachId" in r.find((x) => x.id === "gabi")));
  const sinCaro = E.fusionarRoster(admin, roster, roster.filter((x) => x.id !== "caro"));
  check("El administrador puede quitar a cualquiera", !sinCaro.some((x) => x.id === "caro") && sinCaro.length === 4);
  const sesionVieja = E.fusionarRoster(adminViejo, roster, roster);
  check("Una sesión de antes guarda como administrador", sesionVieja.length === 5);
}

console.log("\n▸ Listas por alumno (alertas de ritmo, reportes)");
{
  const alertas = [{ id: 1, studentId: "ana" }, { id: 2, studentId: "beto" }, { id: 3, studentId: "eva" }];
  const propiosLuis = new Set(["beto", "dani"]);
  check("Luis ve solo las de sus alumnos", JSON.stringify(E.filtrarLista(luis, alertas, propiosLuis).map((a) => a.id)) === "[2]");
  check("El administrador ve todas", E.filtrarLista(admin, alertas, new Set()).length === 3);
  const r = E.fusionarLista(luis, alertas, [{ id: 2, studentId: "beto", resuelta: true }, { id: 9, studentId: "eva" }], propiosLuis);
  check("Al guardar, las ajenas se conservan", r.some((a) => a.id === 1) && r.some((a) => a.id === 3));
  check("La suya se actualiza", r.find((a) => a.id === 2)?.resuelta === true);
  check("No puede agregar una de un alumno ajeno", !r.some((a) => a.id === 9));
  const borra = E.fusionarLista(luis, alertas, [], propiosLuis);
  check("Si borra todas, solo se borran las suyas", borra.length === 2 && !borra.some((a) => a.id === 2));
}

console.log("\n▸ Qué claves puede tocar un coach adicional");
{
  const ctx = { idsPropios: new Set(["beto", "dani"]), idsDelListado: new Set(roster.map((r) => r.id)), existe: true };
  const ok = (op, key, extra = {}) => E.clavePermitidaParaCoach(luis, op, key, { ...ctx, ...extra });
  check("Leer el listado", ok("get", "roster"));
  check("Guardar el listado", ok("set", "roster"));
  check("No borrar el listado", !ok("delete", "roster"));
  check("Leer y guardar las alertas", ok("get", "paceAlerts") && ok("set", "paceAlerts") && ok("set", "reports"));
  check("Leer y guardar a su alumno", ok("get", "student:beto") && ok("set", "student:beto"));
  check("Borrar a su alumno", ok("delete", "student:dani"));
  check("No leer a un alumno ajeno", !ok("get", "student:ana"));
  check("No guardar a un alumno ajeno", !ok("set", "student:eva"));
  check("No borrar a un alumno ajeno", !ok("delete", "student:eva"));
  check("Crear la ficha de un alumno nuevo", ok("set", "student:fer", { existe: false }));
  check("No pisar una ficha que ya existe fuera del listado", !ok("set", "student:fantasma", { existe: true }));
  check("No leer una ficha fuera del listado", !ok("get", "student:fer", { existe: false }));
  check("No leer la contraseña del administrador", !ok("get", "coachAuth"));
  check("No leer los coaches", !ok("get", "coaches"));
  check("No tocar otras claves", !ok("set", "reloj:ajustes") && !ok("get", "pagos:ajustes"));
  check("El administrador puede todo", E.clavePermitidaParaCoach(admin, "get", "coachAuth", ctx));
  check("Un alumno no pasa por acá", !E.clavePermitidaParaCoach(alumno, "get", "roster", ctx));
}

console.log("\n▸ Coaches");
check("Nombre limpio", E.limpiarNombre("  Luis   Pérez ") === "Luis Pérez");
check("Nombre vacío", E.limpiarNombre(42) === "");
check("Contraseña corta", E.validarClave("12345") !== null);
check("Contraseña válida", E.validarClave("123456") === null);
{
  const id = E.nuevoIdCoach();
  check("Identificador de coach válido", E.idCoachValido(id), id);
  check("'admin' no es identificador de coach", !E.idCoachValido("admin"));
}
{
  const r = E.rosterSinCoach(roster, "c-luis000001");
  check("Al quitar a Luis, sus alumnos pasan al administrador", r.filter((x) => E.coachDeEntrada(x) === "admin").length === 4);
  check("Los de María siguen con ella", r.find((x) => x.id === "eva")?.coachId === "c-maria00001");
}
check("Lo público de un coach no lleva la contraseña", !("hash" in E.coachPublico({ id: "c-x00000", nombre: "X", hash: "h", salt: "s" })));

console.log("\n▸ Muro por grupo");
{
  const posts = [{ id: "a" }, { id: "b", grupo: "c-luis000001" }, { id: "c", grupo: "c-maria00001" }];
  check("Las publicaciones de antes son del administrador", JSON.stringify(E.publicacionesDelGrupo(posts, "admin").map((p) => p.id)) === '["a"]');
  check("Luis ve solo las de su grupo", JSON.stringify(E.publicacionesDelGrupo(posts, "c-luis000001").map((p) => p.id)) === '["b"]');
  check("Clave de lectura del administrador (la de siempre)", M.claveDeLector({ rol: "coach", id: null }) === "coach");
  check("Clave de lectura de un coach adicional", M.claveDeLector({ rol: "coach", id: "c-luis000001" }) === "coach-c-luis000001");
}

console.log(`\n${passed} pruebas OK, ${failed} fallidas.`);
if (failed) {
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
