// Política de privacidad. Es una página estática y pública: no lee la base de datos, no
// pide sesión y no importa nada del motor ni de la app. Vive aparte a propósito, para que
// no pueda afectar al funcionamiento del resto.
//
// La necesita el registro de la app en intervals.icu, pero sobre todo la necesitan los
// alumnos: sus datos de entrenamiento son datos personales.

export const metadata = {
  title: "Política de privacidad · TROTAMUNDOS",
  description: "Qué datos guarda TROTAMUNDOS, para qué los usa y cómo ejercer tus derechos.",
};

const C = {
  bg: "#12151B", surface: "#1B2029", border: "#2E3644",
  track: "#C8452E", lane: "#F5F3EA", muted: "#8B93A3",
};

const ACTUALIZADO = "16 de octubre de 2026";
const CONTACTO = "kongtsutsumi@gmail.com";

function Seccion({ titulo, children }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{
        fontFamily: "'Oswald', sans-serif", fontSize: 18, fontWeight: 600,
        color: C.lane, marginBottom: 10, letterSpacing: "0.02em",
      }}>{titulo}</h2>
      <div style={{ color: C.muted, fontSize: 15, lineHeight: 1.65 }}>{children}</div>
    </section>
  );
}

export default function Privacidad() {
  return (
    <main style={{ background: C.bg, minHeight: "100vh", padding: "48px 20px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <p style={{
          fontFamily: "'Oswald', sans-serif", fontSize: 13, letterSpacing: "0.18em",
          color: C.track, marginBottom: 6, textTransform: "uppercase",
        }}>TROTAMUNDOS</p>
        <h1 style={{
          fontFamily: "'Oswald', sans-serif", fontSize: 32, fontWeight: 600,
          color: C.lane, marginBottom: 8, lineHeight: 1.2,
        }}>Política de privacidad</h1>
        <p style={{ color: C.muted, fontSize: 14, marginBottom: 36 }}>
          Última actualización: {ACTUALIZADO}
        </p>

        <div style={{
          background: C.surface, border: `1px solid ${C.border}`,
          borderRadius: 12, padding: "18px 20px", marginBottom: 36,
        }}>
          <p style={{ color: C.lane, fontSize: 15, lineHeight: 1.6, margin: 0 }}>
            TROTAMUNDOS es la aplicación con la que Jaime Kong Tsutsumi, coach de running
            certificado en Lima, Perú, prepara y hace seguimiento de los planes de
            entrenamiento de sus alumnos. Sus datos se usan para entrenarlos: para nada más.
            No se venden, no se alquilan y no se comparten con anunciantes.
          </p>
        </div>

        <Seccion titulo="Quién es responsable de tus datos">
          Jaime Kong Tsutsumi, en Lima, Perú. Para cualquier consulta sobre esta política o
          sobre tus datos, escribe a{" "}
          <a href={`mailto:${CONTACTO}`} style={{ color: C.track }}>{CONTACTO}</a>.
        </Seccion>

        <Seccion titulo="Qué datos se guardan">
          <p style={{ marginBottom: 10 }}>Solo lo necesario para armar y seguir tu plan:</p>
          <ul style={{ paddingLeft: 22, margin: 0, listStyle: "disc" }}>
            <li style={{ marginBottom: 6 }}>
              <strong style={{ color: C.lane }}>Para identificarte:</strong> tu nombre y un PIN
              de acceso. El PIN se guarda cifrado — ni siquiera tu coach puede verlo.
            </li>
            <li style={{ marginBottom: 6 }}>
              <strong style={{ color: C.lane }}>Para entrenarte:</strong> tu objetivo, tu nivel,
              tus marcas y ritmos, la fecha de tu carrera, y el plan semanal que arma tu coach.
            </li>
            <li style={{ marginBottom: 6 }}>
              <strong style={{ color: C.lane }}>Lo que registras:</strong> qué sesiones
              completaste, kilómetros, ritmo, esfuerzo percibido y las notas que escribas.
            </li>
            <li>
              <strong style={{ color: C.lane }}>Si conectas tu reloj:</strong> las actividades
              que vuelven de ese servicio — distancia, duración, ritmo, vueltas y, cuando
              existe, frecuencia cardíaca.
            </li>
          </ul>
          <p style={{ marginTop: 10 }}>
            No se pide ni se guarda documento de identidad, dirección, datos bancarios ni
            información de salud más allá de lo que tú registres sobre tus entrenamientos.
          </p>
        </Seccion>

        <Seccion titulo="Para qué se usan">
          Para diseñar tu plan, ajustarlo según cómo vienes respondiendo, llevar tu historial y
          que tu coach pueda darte seguimiento. Tu coach ve tus datos de entrenamiento: esa es
          justamente la razón de ser de la aplicación. Los demás alumnos no los ven.
        </Seccion>

        <Seccion titulo="Conectar tu reloj">
          <p style={{ marginBottom: 10 }}>
            Puedes conectar tu cuenta de intervals.icu para que los entrenamientos lleguen solos
            a tu reloj y las actividades que completes vuelvan a tu plan. Esa conexión:
          </p>
          <ul style={{ paddingLeft: 22, margin: 0, listStyle: "disc" }}>
            <li style={{ marginBottom: 6 }}>Es <strong style={{ color: C.lane }}>voluntaria</strong>. Sin ella la aplicación funciona igual.</li>
            <li style={{ marginBottom: 6 }}>La autorizas tú, viendo antes qué permisos se piden.</li>
            <li style={{ marginBottom: 6 }}>Se limita a escribir entrenamientos en tu calendario y leer tus actividades.</li>
            <li>La puedes <strong style={{ color: C.lane }}>cortar cuando quieras</strong>, desde la propia aplicación o desde tu cuenta de intervals.icu.</li>
          </ul>
          <p style={{ marginTop: 10 }}>
            Al conectarla, esos datos pasan por intervals.icu según su propia política de
            privacidad, que no controlamos.
          </p>
        </Seccion>

        <Seccion titulo="Con quién se comparten">
          <p style={{ marginBottom: 10 }}>
            Con nadie, salvo los servicios que hacen funcionar la aplicación:
          </p>
          <ul style={{ paddingLeft: 22, margin: 0, listStyle: "disc" }}>
            <li style={{ marginBottom: 6 }}><strong style={{ color: C.lane }}>Supabase</strong> — guarda la base de datos.</li>
            <li style={{ marginBottom: 6 }}><strong style={{ color: C.lane }}>Vercel</strong> — publica la aplicación en internet.</li>
            <li><strong style={{ color: C.lane }}>intervals.icu</strong> — solo si tú conectas tu reloj.</li>
          </ul>
          <p style={{ marginTop: 10 }}>
            Tus datos no se venden ni se ceden a terceros con fines comerciales o publicitarios.
          </p>
        </Seccion>

        <Seccion titulo="Cuánto tiempo se conservan">
          Mientras entrenes con el coach, porque tu historial es parte de tu progresión. Si
          dejas de entrenar y quieres que se borren, pídelo y se eliminan.
        </Seccion>

        <Seccion titulo="Tus derechos">
          <p style={{ marginBottom: 10 }}>
            Puedes pedir en cualquier momento acceder a tus datos, corregirlos, llevártelos o
            borrarlos, y retirar tu consentimiento para la conexión con tu reloj. Basta con
            escribir a{" "}
            <a href={`mailto:${CONTACTO}`} style={{ color: C.track }}>{CONTACTO}</a>.
          </p>
          <p>
            En Perú estos derechos están reconocidos por la Ley N.º 29733 de Protección de
            Datos Personales y su reglamento.
          </p>
        </Seccion>

        <Seccion titulo="Menores de edad">
          La aplicación está pensada para personas mayores de edad. Si un menor va a entrenar
          con el coach, la cuenta la gestiona su padre, madre o tutor.
        </Seccion>

        <Seccion titulo="Seguridad">
          El acceso está protegido con PIN y sesión cifrada; la base de datos está cerrada a
          internet y solo el servidor de la aplicación puede leerla. Ningún sistema es
          infalible, pero esos son los resguardos que están puestos.
        </Seccion>

        <Seccion titulo="Cambios en esta política">
          Si cambia algo relevante se actualiza esta página y la fecha de arriba. Si el cambio
          afecta a cómo se usan tus datos, se te avisa.
        </Seccion>

        <p style={{
          color: C.muted, fontSize: 13, borderTop: `1px solid ${C.border}`,
          paddingTop: 20, marginTop: 44,
        }}>
          TROTAMUNDOS · Lima, Perú ·{" "}
          <a href="/" style={{ color: C.track }}>Volver a la aplicación</a>
        </p>
      </div>
    </main>
  );
}
