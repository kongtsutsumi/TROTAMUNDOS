// Página a la que vuelve el alumno después de autorizar su reloj cuando la autorización
// terminó FUERA de la app: por ejemplo, la app Garmin Connect abre la vuelta en Safari y no en
// la app TROTAMUNDOS instalada en la pantalla de inicio (que guarda su sesión aparte). La
// conexión ya quedó hecha en el servidor; acá solo se le dice y se le manda de vuelta.

export const metadata = { title: "Reloj · TROTAMUNDOS" };
export const dynamic = "force-dynamic";

const C = { bg: "#12151B", surface: "#1B2029", border: "#2E3644", track: "#C8452E", lane: "#F5F3EA", muted: "#8B93A3", easy: "#4C9A6A" };
const MARCAS = { garmin: "Garmin", coros: "COROS" };
const MOTIVOS = {
  "enlace-caducado": "El enlace caducó o ya se usó. Vuelve a la app TROTAMUNDOS y conecta tu reloj de nuevo.",
  "cuenta-de-otro-alumno": "Esa cuenta del reloj ya está conectada a otro alumno de TROTAMUNDOS.",
  "sin-permiso": "Esta pantalla está abierta con la sesión de otra persona. Vuelve a la app TROTAMUNDOS con tu nombre y PIN.",
};

export default function RelojConectado({ searchParams }) {
  const marca = MARCAS[searchParams?.marca] || "tu reloj";
  const estado = searchParams?.reloj;
  const ok = estado === "conectado";
  const cancelado = estado === "cancelado";
  const titulo = ok ? `¡Listo! ${marca === "tu reloj" ? "Tu reloj" : `Tu ${marca}`} quedó conectado` : cancelado ? "No se conectó" : "No se pudo conectar";
  const texto = ok
    ? "Ya puedes cerrar esta pestaña y volver a la app TROTAMUNDOS: tus entrenamientos empezarán a llegar a tu reloj."
    : cancelado ? "Cancelaste la autorización. Si fue sin querer, vuelve a la app TROTAMUNDOS y conecta tu reloj de nuevo."
    : MOTIVOS[searchParams?.motivo] || "Algo falló. Vuelve a la app TROTAMUNDOS y prueba de nuevo; si sigue, escríbenos a admin@trotamundos.pe.";
  return (
    <main style={{ minHeight: "100vh", background: C.bg, color: C.lane, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "Inter, system-ui, sans-serif" }}>
      <div style={{ maxWidth: 420, width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, padding: 28, textAlign: "center" }}>
        <div style={{ width: 56, height: 56, borderRadius: 28, margin: "0 auto 16px", background: (ok ? C.easy : C.track) + "22", color: ok ? C.easy : C.track, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 700 }}>
          {ok ? "✓" : "!"}
        </div>
        <h1 style={{ fontFamily: "'Oswald', sans-serif", fontSize: 22, fontWeight: 600, textTransform: "uppercase", margin: "0 0 10px" }} data-testid="reloj-conectado-titulo">{titulo}</h1>
        <p style={{ color: C.muted, fontSize: 15, lineHeight: 1.6, margin: "0 0 22px" }}>{texto}</p>
        <a href="/" style={{ display: "inline-block", background: C.track, color: C.lane, padding: "10px 18px", borderRadius: 10, fontWeight: 600, textDecoration: "none", fontSize: 14 }}>Abrir TROTAMUNDOS</a>
      </div>
    </main>
  );
}
