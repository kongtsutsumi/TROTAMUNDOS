// El muro de anuncios.
//
// Todos los que tienen sesión (el coach y cada alumno) leen el muro completo: es un muro
// común del grupo. Lo que cambia según quién sea:
//   · publicar: el coach publica anuncios (con enlace, evento y fijado); un alumno, mensajes
//     de texto. Esa diferencia la aplica lib/muro.mjs, no esta ruta.
//   · borrar: el coach, cualquier cosa; un alumno, solo lo suyo.
//   · fijar: solo el coach.
//
// La identidad nunca viene del navegador: sale de la sesión firmada.

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionToken, SESSION_COOKIE } from "../../../lib/session";
import { autorDeSesion, verMuro, publicar, responder, borrar, fijar, marcarLeido } from "../../../lib/muro-servidor";

export const dynamic = "force-dynamic";

// El día de hoy en Lima, para saber qué eventos ya pasaron.
function hoyEnLima() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

const responderJson = (r) => NextResponse.json(r, { status: r?.estado || (r?.ok === false ? 400 : 200) });

export async function POST(request) {
  const store = await cookies();
  const session = verifySessionToken(store.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const autor = await autorDeSesion(session);
  if (!autor) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let body;
  try { body = await request.json(); } catch (e) { return NextResponse.json({ error: "Petición inválida" }, { status: 400 }); }
  const { op } = body || {};

  try {
    if (op === "listar") return NextResponse.json({ ok: true, ...(await verMuro(autor, hoyEnLima())) });
    if (op === "pendientes") {
      const m = await verMuro(autor, hoyEnLima(), { conLecturas: false });
      return NextResponse.json({ ok: true, noLeidos: m.noLeidos });
    }
    if (op === "publicar") return responderJson(await publicar(autor, body.datos));
    if (op === "responder") return responderJson(await responder(autor, body.idPost, body.datos));
    if (op === "borrar") return responderJson(await borrar(autor, body.idPost, body.idRespuesta ?? null));
    if (op === "fijar") return responderJson(await fijar(autor, body.idPost, body.fijado));
    if (op === "leer") return responderJson(await marcarLeido(autor));
  } catch (e) {
    console.error("muro:", op, e);
    return NextResponse.json({ ok: false, error: "Algo falló. Prueba de nuevo." }, { status: 500 });
  }

  return NextResponse.json({ error: "Operación desconocida" }, { status: 400 });
}
