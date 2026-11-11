// Datos de salud del reloj para las pantallas (pestaña Salud del alumno y botón Salud del coach).
//
//   leer   → { estado, marca, filas }: el alumno o su coach. Las cuentas (puntaje, normal de
//            cada dato, historial) se hacen en la pantalla con lib/recuperacion.mjs.
//   equipo → { alumnos: { id: { banda, puntaje, fecha } } }: solo coach, para el punto de
//            color junto a cada alumno en la lista.
//
// "estado" dice qué mostrar:
//   ok · sin-reloj · sin-permiso (no dio el consentimiento de salud) · reconectar (intervals.icu
//   conectado sin el permiso WELLNESS:READ) · proximamente (Garmin, hasta que pase la revisión
//   de pantallas que pide su acuerdo).
//
// Garmin: las pantallas con sus datos de salud se le enviaron el 10 de noviembre de 2026 (su
// soporte respondió que en el nivel Starter no hacen revisiones) y se activaron ese mismo día.
// Para ocultarlas sin tocar el código: variable SALUD_GARMIN=pausada en Vercel.
import { NextResponse } from "next/server";
import { kvGet, supabaseAdmin } from "../../../lib/supabaseAdmin";
import { sesionDelPedido, entradaDe } from "../../../lib/equipo-servidor";
import { puedeManejar, filtrarRoster } from "../../../lib/equipo.mjs";
import { leerSalud, leerConsentimiento } from "../../../lib/salud-servidor";
import { aceptoSalud } from "../../../lib/consentimiento.mjs";
import { porDia, evaluarDia, ultimoDiaConDatos } from "../../../lib/recuperacion.mjs";
import { compartiendoSalud } from "../../../lib/garmin.mjs";

export const dynamic = "force-dynamic";

const mal = (error, status = 400) => NextResponse.json({ ok: false, error }, { status });
const saludGarminActiva = () => process.env.SALUD_GARMIN !== "pausada";

function hoyEnLima() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function haceDias(n) {
  const d = new Date(`${hoyEnLima()}T12:00:00`);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function marcaDe(student) {
  if (student?.garmin?.conectado) return "garmin";
  if (student?.coros?.conectado) return "coros";
  if (student?.intervals?.token || student?.intervals?.pruebaConClaveDelCoach) return "intervals";
  return null;
}

async function estadoDe(student) {
  const marca = marcaDe(student);
  if (!marca) return { estado: "sin-reloj", marca };
  if (!aceptoSalud(await leerConsentimiento(student.id))) return { estado: "sin-permiso", marca };
  if (marca === "garmin" && !saludGarminActiva()) return { estado: "proximamente", marca };
  if (marca === "garmin" && !compartiendoSalud((await kvGet(`garmin:cuenta:${student.id}`))?.permisos)) return { estado: "garmin-sin-salud", marca };
  if (marca === "intervals" && (await kvGet(`salud:lectura:${student.id}`))?.sinPermiso) return { estado: "reconectar", marca };
  return { estado: "ok", marca };
}

const visibles = (filas) => (saludGarminActiva() ? filas : filas.filter((f) => f.fuente !== "garmin"));

export async function POST(request) {
  const session = await sesionDelPedido();
  if (!session) return mal("No autorizado", 401);
  let body;
  try { body = await request.json(); } catch (e) { return mal("Petición inválida"); }
  const { op, studentId } = body || {};

  if (op === "leer") {
    if (typeof studentId !== "string") return mal("Faltan datos");
    const esElMismoAlumno = session.role === "student" && session.studentId === studentId;
    const esCoach = session.role === "coach" && puedeManejar(session, await entradaDe(studentId));
    if (!esElMismoAlumno && !esCoach) return mal("Sin permiso", 403);
    const student = await kvGet(`student:${studentId}`);
    if (!student) return mal("Alumno no encontrado", 404);
    const { estado, marca } = await estadoDe(student);
    const filas = estado === "ok" ? visibles(await leerSalud(studentId, { desde: haceDias(70), limite: 200 })) : [];
    return NextResponse.json({ ok: true, estado, marca, hoy: hoyEnLima(), filas });
  }

  if (op === "equipo") {
    if (session.role !== "coach") return mal("Sin permiso", 403);
    const roster = filtrarRoster(session, (await kvGet("roster")) || []);
    const ids = roster.map((r) => r?.id).filter((id) => typeof id === "string");
    const alumnos = {};
    if (!ids.length) return NextResponse.json({ ok: true, alumnos });
    const { data, error } = await supabaseAdmin.from("salud_diaria").select("student_id, fecha, fuente, datos")
      .in("student_id", ids).gte("fecha", haceDias(35)).order("fecha", { ascending: false }).limit(5000);
    if (error) return NextResponse.json({ ok: true, alumnos });
    const porAlumno = {};
    for (const f of visibles(data || [])) (porAlumno[f.student_id] ||= []).push(f);
    const hoy = hoyEnLima();
    for (const [id, filas] of Object.entries(porAlumno)) {
      const dias = porDia(filas);
      const fecha = ultimoDiaConDatos(dias, hoy, 1);
      if (!fecha) continue;
      const e = evaluarDia(dias, fecha);
      if (e.banda) alumnos[id] = { banda: e.banda, puntaje: e.puntaje, fecha };
    }
    return NextResponse.json({ ok: true, alumnos });
  }

  return mal("Operación desconocida");
}
