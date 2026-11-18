// Avisos de Garmin con la clave dentro de la ruta:
//   https://app.trotamundos.pe/api/garmin/webhook/<GARMIN_WEBHOOK_SECRET>
// El portal de Garmin guarda la dirección sin lo que va después de "?", así que la clave no
// puede ir como ?k=. Todo lo demás es igual que en ../route.js.
import { recibirAviso } from "../../../../../lib/garmin-webhook";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request, { params }) {
  return recibirAviso(request, typeof params?.clave === "string" ? decodeURIComponent(params.clave) : null);
}
