// Página de soporte: cómo conectar y desconectar el reloj, qué hacer si algo falla, y cómo
// reportar un problema o un abuso. Pública y estática, como la política de privacidad.
//
// La piden los programas de las marcas: COROS exige una página de soporte para los usuarios
// de la integración, y el acuerdo de Garmin pide un canal para reportar abusos.

export const metadata = {
  title: "Soporte · TROTAMUNDOS",
  description: "Ayuda para conectar tu reloj (Garmin, COROS, intervals.icu y otros) con TROTAMUNDOS, y cómo contactarnos.",
};

const C = {
  bg: "#12151B", surface: "#1B2029", border: "#2E3644",
  track: "#C8452E", lane: "#F5F3EA", muted: "#8B93A3",
};
const CONTACTO = "admin@trotamundos.pe";
const Mail = ({ asunto }) => (
  <a href={`mailto:${CONTACTO}${asunto ? `?subject=${encodeURIComponent(asunto)}` : ""}`} style={{ color: C.track }}>{CONTACTO}</a>
);

function Seccion({ titulo, children }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{ fontFamily: "'Oswald', sans-serif", fontSize: 18, fontWeight: 600, color: C.lane, marginBottom: 10, letterSpacing: "0.02em" }}>{titulo}</h2>
      <div style={{ color: C.muted, fontSize: 15, lineHeight: 1.65 }}>{children}</div>
    </section>
  );
}
const Lista = ({ items, ordenada }) => {
  const Tag = ordenada ? "ol" : "ul";
  return (
    <Tag style={{ paddingLeft: 22, margin: "0 0 10px", listStyle: ordenada ? "decimal" : "disc" }}>
      {items.map((it, i) => <li key={i} style={{ marginBottom: 6 }}>{it}</li>)}
    </Tag>
  );
};
const B = ({ children }) => <strong style={{ color: C.lane }}>{children}</strong>;

export default function Soporte() {
  return (
    <main style={{ background: C.bg, minHeight: "100vh", padding: "48px 20px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <p style={{ fontFamily: "'Oswald', sans-serif", fontSize: 13, letterSpacing: "0.18em", color: C.track, marginBottom: 6, textTransform: "uppercase" }}>TROTAMUNDOS</p>
        <h1 style={{ fontFamily: "'Oswald', sans-serif", fontSize: 32, fontWeight: 600, color: C.lane, marginBottom: 8, lineHeight: 1.2 }}>Soporte</h1>
        <p style={{ color: C.muted, fontSize: 15, marginBottom: 36 }}>
          ¿Algo no funciona o tienes una duda? Escríbenos a <Mail asunto="Soporte TROTAMUNDOS" /> y te respondemos dentro de 2 días hábiles.
        </p>

        <Seccion titulo="Conectar tu reloj">
          <Lista ordenada items={[
            <>Entra a la aplicación en <a href="/" style={{ color: C.track }}>app.trotamundos.pe</a> con tu nombre y tu PIN.</>,
            <>Ve a <B>Perfil → Tu reloj</B>.</>,
            <>Marca las casillas de consentimiento: la de datos de entrenamiento es necesaria; la de datos de salud es opcional.</>,
            <>Toca <B>Conectar</B> y autoriza el acceso en la página de tu marca (Garmin, COROS o intervals.icu).</>,
            <>Listo: los entrenamientos de tu plan te llegan solos al reloj, y lo que corres vuelve a la aplicación.</>,
          ]} />
        </Seccion>

        <Seccion titulo="Desconectar tu reloj">
          <Lista items={[
            <>En <B>Perfil → Tu reloj</B>, toca <B>Desconectar mi reloj</B>. Se quitan del calendario los entrenamientos futuros y se borran tus datos de salud.</>,
            <>También puedes quitar el acceso desde tu cuenta de la marca (por ejemplo, en Garmin Connect o en la app de COROS).</>,
            <>Para retirar solo los datos de salud, apaga el interruptor <B>Datos de salud</B> en la misma pantalla.</>,
          ]} />
        </Seccion>

        <Seccion titulo="Si algo no funciona">
          <Lista items={[
            <><B>No me llega el entrenamiento al reloj:</B> sincroniza el reloj con la app de tu marca y espera unos minutos. Si sigue sin aparecer, avísale a tu coach.</>,
            <><B>No aparece lo que corrí:</B> sincroniza el reloj y toca <B>Traer lo que entrené</B> en Perfil → Tu reloj.</>,
            <><B>Me pide confirmar permisos:</B> actualizamos la política de privacidad; revisa las casillas y toca <B>Confirmar</B>.</>,
            <>Si nada de esto lo resuelve, escríbenos a <Mail asunto="Problema con mi reloj" /> contándonos qué marca y modelo usas.</>,
          ]} />
        </Seccion>

        <Seccion titulo="Reportar un problema o un abuso">
          <p style={{ margin: "0 0 10px" }}>
            Si ves un uso indebido de la aplicación, un contenido inapropiado en el muro, o crees que alguien accedió a tus datos sin permiso,
            escríbenos a <Mail asunto="Reporte de abuso" />. Lo revisamos y, si corresponde, restringimos el acceso de quien lo haya causado.
          </p>
        </Seccion>

        <Seccion titulo="Tus datos">
          <p style={{ margin: 0 }}>
            Qué datos guardamos, para qué y cómo pedir que se borren está en la <a href="/privacidad" style={{ color: C.track }}>política de privacidad</a> (
            <a href="/privacy" style={{ color: C.track }}>English</a>).
          </p>
        </Seccion>

        <p style={{ color: C.muted, fontSize: 13, borderTop: `1px solid ${C.border}`, paddingTop: 20, marginTop: 44 }}>
          Trotamundos S.A.C. · RUC 20616594908 · Lima, Perú · <a href="/" style={{ color: C.track }}>Volver a la aplicación</a>
        </p>
      </div>
    </main>
  );
}
