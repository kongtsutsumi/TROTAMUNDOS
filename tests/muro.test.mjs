// Pruebas del muro de anuncios (lib/muro.mjs).
//
// Lo que más importa que no se rompa:
//   · que un alumno no pueda publicar como anuncio, fijar, ni borrar lo de otro;
//   · que un enlace no pueda llevar código (javascript:);
//   · que el punto rojo avise de lo nuevo de otros, y no de lo propio;
//   · que el coach vea bien cuántos leyeron cada anuncio.
//
// Cómo correrlas:  npm test

import * as M from "../lib/muro.mjs";

let passed = 0, failed = 0;
const failures = [];
function check(name, condition, detail) {
  if (condition) passed++;
  else { failed++; failures.push(`${name}${detail ? ` — ${detail}` : ""}`); }
}

const coach = { rol: "coach", id: null, nombre: "Coach" };
const ana = { rol: "alumno", id: "ana", nombre: "Ana" };
const beto = { rol: "alumno", id: "beto", nombre: "Beto" };
const en = (iso) => ({ ahora: new Date(iso) });

console.log("\n▸ Publicar");
{
  const a = M.nuevaPublicacion({ texto: "  Fondo grupal el domingo  ", enlace: "inscripciones.pe/fondo", evento: { fecha: "2026-11-01", hora: "06:30", lugar: "Malecón" }, fijado: true }, coach, en("2026-10-26T12:00:00Z"));
  check("El coach publica un anuncio", a.ok && a.publicacion.tipo === "anuncio");
  check("El texto se limpia", a.publicacion.texto === "Fondo grupal el domingo");
  check("Un enlace sin protocolo se completa con https", a.publicacion.enlace === "https://inscripciones.pe/fondo", a.publicacion.enlace);
  check("Guarda el evento", a.publicacion.evento?.fecha === "2026-11-01" && a.publicacion.evento?.hora === "06:30" && a.publicacion.evento?.lugar === "Malecón");
  check("Puede fijarlo", a.publicacion.fijado === true);
  check("Lleva su fecha de creación", a.publicacion.creado === "2026-10-26T12:00:00.000Z");
  check("Tiene un identificador válido", M.idValido(a.publicacion.id), a.publicacion.id);

  const m = M.nuevaPublicacion({ texto: "¿Alguien para un rodaje el sábado?", enlace: "x.com", evento: { fecha: "2026-11-01" }, fijado: true }, ana);
  check("Un alumno publica un mensaje, no un anuncio", m.ok && m.publicacion.tipo === "mensaje");
  check("Un alumno no puede adjuntar enlace", m.publicacion.enlace === null);
  check("Ni evento", m.publicacion.evento === null);
  check("Ni fijar", m.publicacion.fijado === false);
  check("La autoría es la que pone el servidor", m.publicacion.autor.id === "ana" && m.publicacion.autor.nombre === "Ana");

  check("No se publica vacío", !M.nuevaPublicacion({ texto: "   " }, coach).ok);
  check("Sin autor no se publica", !M.nuevaPublicacion({ texto: "hola" }, null).ok);
  check("Un rol inventado no publica", !M.nuevaPublicacion({ texto: "hola" }, { rol: "admin" }).ok);
  check("Un texto larguísimo se recorta",
    M.nuevaPublicacion({ texto: "a".repeat(5000) }, ana).publicacion.texto.length === M.MAX_TEXTO_PUBLICACION);
}

console.log("\n▸ Enlaces y eventos");
{
  check("Rechaza javascript:", !M.validarEnlace("javascript:alert(1)").ok);
  check("Rechaza data:", !M.validarEnlace("data:text/html,<script>").ok);
  // El caso que engaña a un control ingenuo: tiene "dominio", así que solo lo frena
  // comprobar el protocolo.
  check("Rechaza javascript: disfrazado con dominio", !M.validarEnlace("javascript://ejemplo.com/%0Aalert(1)").ok);
  check("Rechaza basura", !M.validarEnlace("no es un enlace").ok);
  check("Acepta https", M.validarEnlace("https://maratondelima.com").ok);
  check("Vacío no es error", M.validarEnlace("").ok && M.validarEnlace("").valor === null);
  check("Un anuncio con enlace peligroso no se publica",
    !M.nuevaPublicacion({ texto: "mirá", enlace: "javascript:alert(1)" }, coach).ok);

  check("Evento sin fecha no vale", !M.validarEvento({ hora: "06:30" }).ok);
  check("Fecha imposible no vale", !M.validarEvento({ fecha: "2026-13-40" }).ok);
  check("Hora mal escrita no vale", !M.validarEvento({ fecha: "2026-11-01", hora: "6.30" }).ok);
  check("Hora opcional", M.validarEvento({ fecha: "2026-11-01" }).ok);
  check("Sin datos no hay evento", M.validarEvento({}).valor === null);
}

console.log("\n▸ Responder");
{
  const r = M.nuevaRespuesta({ texto: "¡Yo voy!" }, ana, "lx1abc2-a1b2c3");
  check("Un alumno responde", r.ok && r.respuesta.texto === "¡Yo voy!" && r.respuesta.autor.id === "ana");
  check("No se responde vacío", !M.nuevaRespuesta({ texto: "" }, ana, "lx1abc2-a1b2c3").ok);
  check("No se responde a un identificador inventado", !M.nuevaRespuesta({ texto: "hola" }, ana, "../roster").ok);
}

console.log("\n▸ Quién puede borrar y fijar");
{
  const deAna = M.nuevaPublicacion({ texto: "hola" }, ana).publicacion;
  const delCoach = M.nuevaPublicacion({ texto: "anuncio" }, coach).publicacion;
  check("Ana borra lo suyo", M.puedeBorrar(ana, deAna));
  check("Beto NO borra lo de Ana", !M.puedeBorrar(beto, deAna));
  check("Ana NO borra un anuncio del coach", !M.puedeBorrar(ana, delCoach));
  check("El coach borra cualquier cosa", M.puedeBorrar(coach, deAna) && M.puedeBorrar(coach, delCoach));
  check("Solo el coach fija", M.puedeFijar(coach) && !M.puedeFijar(ana));
  check("Un alumno sin id no es autor de nada", !M.esAutor({ rol: "alumno" }, { autor: { rol: "alumno", id: null } }));
}

console.log("\n▸ El muro de cada uno: orden, punto rojo y lecturas");
{
  const p = (datos, autor, iso) => M.nuevaPublicacion(datos, autor, en(iso)).publicacion;
  const fijado = p({ texto: "Reglamento del grupo", fijado: true }, coach, "2026-10-01T10:00:00Z");
  const viejo = p({ texto: "Bienvenidos" }, coach, "2026-10-20T10:00:00Z");
  const deAna = p({ texto: "¿Rodaje el sábado?" }, ana, "2026-10-25T10:00:00Z");
  const eventoPasado = p({ texto: "Carrera 10K", evento: { fecha: "2026-10-18" }, fijado: true }, coach, "2026-10-10T10:00:00Z");
  const eventoProximo = p({ texto: "Fondo grupal", evento: { fecha: "2026-11-01", hora: "06:30" } }, coach, "2026-10-26T09:00:00Z");
  const todas = [viejo, deAna, fijado, eventoPasado, eventoProximo];
  const resp = [M.nuevaRespuesta({ texto: "Yo voy" }, beto, deAna.id, en("2026-10-25T12:00:00Z")).respuesta];

  // Beto abrió el muro el 24: todo lo posterior que no es suyo es nuevo.
  const deBeto = M.armarMuro(todas, resp, { lector: beto, leido: { [viejo.id]: "2026-10-24T00:00:00Z", [fijado.id]: "2026-10-24T00:00:00Z" }, hoy: "2026-10-26" });
  check("Los fijados van primero", deBeto.fijados.length === 1 && deBeto.fijados[0].id === fijado.id);
  check("Después, lo más nuevo primero",
    deBeto.recientes.map((x) => x.id).join() === [eventoProximo.id, deAna.id, viejo.id].join(),
    deBeto.recientes.map((x) => x.texto).join(" | "));
  check("El evento que ya pasó va aparte, aunque estuviera fijado",
    deBeto.pasados.length === 1 && deBeto.pasados[0].id === eventoPasado.id);
  check("Lo ya leído no es nuevo", !deBeto.recientes.find((x) => x.id === viejo.id).nuevo);
  check("Lo de otro posterior a la última visita es nuevo", deBeto.recientes.find((x) => x.id === eventoProximo.id).nuevo);
  check("Las respuestas vienen ordenadas y marcadas como propias",
    deBeto.recientes.find((x) => x.id === deAna.id).respuestas[0].mio === true);

  // Ana: su propio mensaje NO es nuevo para ella, pero la respuesta de Beto sí lo vuelve nuevo.
  const deAnaVista = M.armarMuro(todas, resp, { lector: ana, leido: { [deAna.id]: "2026-10-25T10:30:00Z" }, hoy: "2026-10-26" });
  check("Una respuesta ajena vuelve nueva la publicación propia", deAnaVista.recientes.find((x) => x.id === deAna.id).nuevo);
  const sinResp = M.armarMuro(todas, [], { lector: ana, leido: { [deAna.id]: "2026-10-25T10:30:00Z" }, hoy: "2026-10-26" });
  check("Lo propio, sin nada ajeno, no es nuevo", !sinResp.recientes.find((x) => x.id === deAna.id).nuevo);
  // Y aunque lo haya publicado después de su última visita: lo que uno escribe nunca le
  // enciende el punto rojo a uno mismo.
  const sinVisitas = M.armarMuro(todas, [], { lector: ana, leido: {}, hoy: "2026-10-26" });
  check("Lo propio nunca es nuevo para uno, ni sin visitas previas", !sinVisitas.recientes.find((x) => x.id === deAna.id).nuevo);
  check("Ana puede borrar su mensaje y no los anuncios",
    deAnaVista.recientes.find((x) => x.id === deAna.id).borrable && !deAnaVista.recientes.find((x) => x.id === viejo.id).borrable);

  // Después de abrir el muro no queda nada nuevo.
  const leido = M.marcarTodoLeido({}, todas, new Date("2026-10-26T13:00:00Z"));
  const despues = M.armarMuro(todas, resp, { lector: beto, leido, hoy: "2026-10-26" });
  check("Al abrir el muro el punto rojo se apaga", despues.noLeidos === 0, String(despues.noLeidos));
  check("Lo borrado se olvida", Object.keys(M.marcarTodoLeido({ "fantasma-123456": "x" }, todas)).every((k) => k !== "fantasma-123456"));

  // El coach: cuántos leyeron cada anuncio.
  const lecturas = {
    "alumno-ana": { [eventoProximo.id]: "2026-10-26T10:00:00Z" },     // lo leyó después de publicado
    "alumno-beto": { [eventoProximo.id]: "2026-10-26T08:00:00Z" },    // abrió ANTES de que existiera
    "alumno-caro": {},
  };
  const delCoach = M.armarMuro(todas, resp, { lector: coach, leido: {}, hoy: "2026-10-26", lecturasDeAlumnos: lecturas, totalAlumnos: 3 });
  const ev = delCoach.recientes.find((x) => x.id === eventoProximo.id);
  check("El coach ve cuántos leyeron su anuncio", ev.leidoPor?.leyeron === 1 && ev.leidoPor?.total === 3, JSON.stringify(ev.leidoPor));
  check("Los mensajes de alumnos no llevan contador", delCoach.recientes.find((x) => x.id === deAna.id).leidoPor === undefined);
  check("Un alumno nunca ve los contadores", deBeto.recientes.every((x) => x.leidoPor === undefined));
  check("Para el coach, lo de los alumnos es nuevo", delCoach.recientes.find((x) => x.id === deAna.id).nuevo);
}

console.log("\n▸ Identificadores");
{
  const a = M.nuevoId(1793000000000, () => 0.123);
  const b = M.nuevoId(1793000000001, () => 0.123);
  check("Son válidos", M.idValido(a) && M.idValido(b), `${a} ${b}`);
  check("Se ordenan por fecha", a < b);
  check("No aceptan caracteres raros", !M.idValido("abc%") && !M.idValido("a:b") && !M.idValido(""));
  check("Clave de lectura del coach", M.claveDeLector(coach) === "coach");
  check("Clave de lectura de un alumno", M.claveDeLector(ana) === "alumno-ana");
}

console.log(`\n${"═".repeat(50)}`);
console.log(`  ${passed} pruebas del muro pasaron, ${failed} fallaron`);
if (failures.length) { console.log("\n  Fallos:"); for (const f of failures) console.log(`   ✗ ${f}`); }
console.log(`${"═".repeat(50)}\n`);
process.exit(failed ? 1 : 0);
