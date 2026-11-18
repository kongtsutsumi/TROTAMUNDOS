// Avisos (push) de Garmin: actividades, salud, desconexiones y cambios de permisos.
//
// Garmin manda cada aviso como un POST con JSON a la dirección configurada en sus API Tools:
//   https://app.trotamundos.pe/api/garmin/webhook/<GARMIN_WEBHOOK_SECRET>
// (el portal de Garmin borra lo que va después de "?", por eso la clave va en la ruta; la forma
// antigua ?k=<clave> se sigue aceptando, ver ./[clave]/route.js).
// La clave de la dirección es nuestra prueba de que el aviso viene de quien la conoce
// (Garmin); sin ella no se procesa nada. Además, solo se aceptan datos de cuentas de Garmin
// unidas a un alumno.
//
// Garmin exige responder 200 dentro de 30 segundos; si no, reintenta cada hora durante 7
// días. Se procesa con un tope de 20 segundos y se responde 200 siempre que la clave sea
// correcta: un aviso mal formado no tiene arreglo reintentándolo.
import { recibirAviso } from "../../../../lib/garmin-webhook";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request) {
  return recibirAviso(request, new URL(request.url).searchParams.get("k"));
}
