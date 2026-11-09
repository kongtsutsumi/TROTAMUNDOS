// Los coaches del equipo. Todo acá es SOLO del administrador: crear un coach, cambiarle la
// contraseña y quitarlo. Un coach adicional no puede ni ver la lista.
//
// Al quitar un coach:
//   · sus alumnos pasan al administrador (con sus planes, pagos y todo lo demás),
//   · sus anuncios del muro pasan al grupo del administrador,
//   · su sesión deja de valer en el acto.
import { NextResponse } from "next/server";
import { kvGet, kvSet, kvDelete, kvList } from "../../../lib/supabaseAdmin";
import { hashText, genSalt } from "../../../lib/hash";
import { sesionDelPedido, leerCoaches, guardarCoaches } from "../../../lib/equipo-servidor";
import * as E from "../../../lib/equipo.mjs";

export const dynamic = "force-dynamic";

const mal = (msg, status = 400) => NextResponse.json({ ok: false, error: msg }, { status });

export async function POST(request) {
  const session = await sesionDelPedido();
  if (!session) return mal("No autorizado", 401);
  if (!E.esAdmin(session)) return mal("Sin permiso", 403);

  let body;
  try { body = await request.json(); } catch (e) { return mal("Petición inválida"); }
  const { op } = body || {};
  const coaches = await leerCoaches();

  if (op === "listar") {
    const roster = (await kvGet("roster")) || [];
    const alumnos = {};
    for (const r of roster) { const c = E.coachDeEntrada(r); alumnos[c] = (alumnos[c] || 0) + 1; }
    return NextResponse.json({
      ok: true,
      coaches: coaches.map((c) => ({ ...E.coachPublico(c), alumnos: alumnos[c.id] || 0 })),
      alumnosAdmin: alumnos[E.ADMIN_ID] || 0,
    });
  }

  if (op === "crear") {
    const nombre = E.limpiarNombre(body.nombre);
    if (!nombre) return mal("Escribe el nombre del coach.");
    if (coaches.some((c) => c.nombre.toLowerCase() === nombre.toLowerCase())) return mal("Ya hay un coach con ese nombre.");
    const err = E.validarClave(body.password);
    if (err) return mal(err);
    const salt = genSalt();
    const nuevo = { id: E.nuevoIdCoach(), nombre, salt, hash: hashText(body.password, salt), v: 1, creado: new Date().toISOString() };
    if (!(await guardarCoaches([...coaches, nuevo]))) return mal("No se pudo guardar. Prueba de nuevo.", 500);
    return NextResponse.json({ ok: true, coach: E.coachPublico(nuevo) });
  }

  if (op === "clave") {
    const c = coaches.find((x) => x.id === body.id);
    if (!c) return mal("Ese coach no existe.", 404);
    const err = E.validarClave(body.password);
    if (err) return mal(err);
    const salt = genSalt();
    // Sube "v": las sesiones abiertas con la contraseña anterior dejan de valer.
    const lista = coaches.map((x) => (x.id === c.id ? { ...x, salt, hash: hashText(body.password, salt), v: (x.v || 1) + 1 } : x));
    if (!(await guardarCoaches(lista))) return mal("No se pudo guardar. Prueba de nuevo.", 500);
    return NextResponse.json({ ok: true });
  }

  if (op === "eliminar") {
    const c = coaches.find((x) => x.id === body.id);
    if (!c) return mal("Ese coach no existe.", 404);

    // 1) Sus alumnos pasan al administrador. Primero esto: si algo fallara después, nadie
    //    queda con alumnos de un coach que ya no existe.
    const roster = (await kvGet("roster")) || [];
    const movidos = roster.filter((r) => r?.coachId === c.id).length;
    if (!(await kvSet("roster", E.rosterSinCoach(roster, c.id)))) return mal("No se pudo guardar. Prueba de nuevo.", 500);

    // 2) Sus anuncios pasan al grupo del administrador.
    for (const f of await kvList("muro:post:")) {
      if (f.value?.grupo === c.id) {
        const { grupo: _g, ...resto } = f.value;
        await kvSet(f.key, resto);
      }
    }
    await kvDelete(`muro:leido:coach-${c.id}`);
    await kvDelete(`pagos:ajustes:${c.id}`);

    // 3) Se quita de la lista: su sesión deja de valer.
    if (!(await guardarCoaches(coaches.filter((x) => x.id !== c.id)))) return mal("No se pudo guardar. Prueba de nuevo.", 500);
    return NextResponse.json({ ok: true, alumnosMovidos: movidos });
  }

  return mal("Operación desconocida");
}
