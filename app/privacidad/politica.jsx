// Política de privacidad de la app TROTAMUNDOS, en español (/privacidad) y en inglés (/privacy).
// Página estática y pública: no lee la base de datos, no pide sesión y no importa nada del motor
// ni de la app. Vive aparte a propósito, para que no pueda afectar al resto.
//
// La piden los programas de desarrolladores de las marcas de relojes (Garmin, COROS, Polar,
// Suunto…) y intervals.icu, pero sobre todo la necesitan los alumnos: sus datos de entrenamiento
// y de salud son datos personales, y los de salud son datos sensibles (Ley N.º 29733).
//
// Si cambias algo de fondo, cambia también ACTUALIZADO y las dos versiones (es y en).

const C = {
  bg: "#12151B", surface: "#1B2029", border: "#2E3644",
  track: "#C8452E", lane: "#F5F3EA", muted: "#8B93A3",
};

export const ACTUALIZADO = { es: "10 de noviembre de 2026", en: "November 10, 2026" };
const CONTACTO = "admin@trotamundos.pe";
const EMPRESA = {
  razon: "Trotamundos S.A.C.",
  ruc: "20616594908",
  domicilio: "Calle San Martín 734, departamento 601, Miraflores, Lima, Perú",
};

const Mail = () => <a href={`mailto:${CONTACTO}`} style={{ color: C.track }}>{CONTACTO}</a>;
const B = ({ children }) => <strong style={{ color: C.lane }}>{children}</strong>;
const Lista = ({ items }) => (
  <ul style={{ paddingLeft: 22, margin: "0 0 10px", listStyle: "disc" }}>
    {items.map((it, i) => <li key={i} style={{ marginBottom: 6 }}>{it}</li>)}
  </ul>
);
const P = ({ children }) => <p style={{ margin: "0 0 10px" }}>{children}</p>;

const MARCAS_ES = "Garmin, COROS, Polar, Suunto, Apple (Apple Watch y Salud), Wahoo, Amazfit, Huawei, Samsung, Fitbit y cualquier otra marca de relojes, pulsómetros, sensores o equipos deportivos";
const MARCAS_EN = "Garmin, COROS, Polar, Suunto, Apple (Apple Watch and Health), Wahoo, Amazfit, Huawei, Samsung, Fitbit and any other brand of watches, heart-rate monitors, sensors or sports equipment";

const TEXTO = {
  es: {
    titulo: "Política de privacidad",
    actualizado: "Última actualización",
    otroIdioma: { href: "/privacy", texto: "Read this policy in English" },
    intro: <>TROTAMUNDOS es la aplicación con la que tu coach prepara y hace seguimiento de tu plan de entrenamiento de running. Tus datos se usan para entrenarte: para nada más. <B>No se venden, no se alquilan, no se usan para publicidad y no se usan para entrenar modelos de inteligencia artificial.</B></>,
    volver: "Volver a la aplicación",
    secciones: [
      ["1. Quién es responsable de tus datos", <>
        <P><B>{EMPRESA.razon}</B>, con RUC {EMPRESA.ruc} y domicilio en {EMPRESA.domicilio}, es la responsable del tratamiento de los datos personales de la aplicación TROTAMUNDOS (app.trotamundos.pe).</P>
        <P>Para cualquier consulta sobre esta política o sobre tus datos, escribe a <Mail />.</P>
      </>],
      ["2. Qué datos se guardan", <>
        <P>Solo lo necesario para armar y seguir tu plan:</P>
        <Lista items={[
          <><B>Para identificarte:</B> tu nombre y un PIN de acceso. El PIN se guarda cifrado: ni siquiera tu coach puede verlo.</>,
          <><B>Para entrenarte:</B> tu objetivo, nivel, marcas, ritmos, la fecha de tu carrera y el plan que arma tu coach.</>,
          <><B>Lo que registras tú:</B> sesiones completadas, kilómetros, ritmo, esfuerzo percibido, notas, y lo que publiques en el muro de tu grupo.</>,
          <><B>Tu membresía:</B> fechas y montos de tus pagos, para controlar tu vigencia. No guardamos tarjetas ni datos bancarios.</>,
          <><B>Si conectas un reloj o dispositivo:</B> los datos de entrenamiento y, si lo autorizas, de salud que se describen en la sección 3.</>,
        ]} />
        <P>No pedimos documento de identidad ni dirección.</P>
      </>],
      ["3. Datos de relojes y dispositivos deportivos", <>
        <P>Puedes conectar a TROTAMUNDOS tu cuenta de {MARCAS_ES}, directamente o a través de una plataforma intermedia como intervals.icu. Según lo que autorices, recibimos:</P>
        <Lista items={[
          <><B>Datos de entrenamiento:</B> tus actividades (tipo, fecha, distancia, duración, ritmo, velocidad, vueltas, frecuencia cardíaca, cadencia, potencia, altitud, dinámica de carrera y el recorrido GPS cuando existe) y el archivo completo de la actividad.</>,
          <><B>Datos de salud y bienestar:</B> sueño (duración, fases y puntaje), variabilidad de la frecuencia cardíaca (VFC), frecuencia cardíaca en reposo y a lo largo del día, estrés, indicadores de energía o recuperación (por ejemplo, Body Battery), respiración, oxigenación en sangre (SpO2), pasos, calorías, minutos de intensidad, VO2máx estimado y, si tienes balanza compatible, peso y composición corporal.</>,
        ]} />
        <P>Además, enviamos a tu cuenta de esa marca los entrenamientos de tu plan, para que te aparezcan en el reloj.</P>
        <P>Los datos de salud son <B>datos sensibles</B> según la Ley N.º 29733. Por eso:</P>
        <Lista items={[
          <>Conectar un dispositivo es <B>voluntario</B>: la aplicación funciona igual sin hacerlo.</>,
          <>Antes de conectar, la aplicación te pide tu <B>consentimiento expreso</B>, y lo pide <B>por separado</B> para los datos de entrenamiento y para los de salud. Puedes dar uno sin el otro.</>,
          <>La autorización la das tú en la propia página de la marca, donde ves qué permisos se piden.</>,
          <>Puedes <B>retirar tu consentimiento y desconectar</B> cuando quieras, desde la aplicación o desde tu cuenta de la marca.</>,
        ]} />
        <P>Cada marca y cada plataforma intermedia trata tus datos según su propia política de privacidad, que no controlamos. Las marcas mencionadas son de sus respectivos dueños; TROTAMUNDOS no está afiliada a ellas ni patrocinada por ellas.</P>
      </>],
      ["4. Para qué se usan", <>
        <Lista items={[
          "Diseñar tu plan y ajustarlo según cómo vienes respondiendo.",
          "Comparar lo que corriste con lo planificado (paso a paso y kilómetro a kilómetro).",
          "Enviar tus entrenamientos a tu reloj.",
          "Preparar reportes diarios de recuperación (sueño, VFC, frecuencia cardíaca en reposo, energía) para ti y para tu coach, y avisarle si tus indicadores sugieren bajar la carga.",
          "Llevar tu historial y el control de tu membresía.",
        ]} />
        <P>La aplicación puede <B>sugerir</B> ajustes, pero las decisiones sobre tu entrenamiento las toma siempre una persona: tu coach. No se toman decisiones automatizadas que te afecten sin intervención humana.</P>
      </>],
      ["5. Quién puede verlos", <>
        <Lista items={[
          <><B>Tu coach</B>, que es justamente para lo que existe la aplicación.</>,
          <><B>El administrador de TROTAMUNDOS</B> (Jaime Kong Tsutsumi), que gestiona la plataforma y puede revisar los planes de todos los alumnos.</>,
          <>Los demás alumnos <B>no</B> ven tus datos. En el muro solo ven lo que tú publiques.</>,
        ]} />
      </>],
      ["6. Con quién se comparten", <>
        <P>No vendemos ni cedemos tus datos. Solo los procesan, por encargo nuestro y bajo obligaciones de seguridad y confidencialidad, los servicios que hacen funcionar la aplicación:</P>
        <Lista items={[
          <><B>Supabase</B>: base de datos donde se guardan tus datos.</>,
          <><B>Vercel</B>: servidores que publican la aplicación.</>,
          <><B>La marca de tu dispositivo o la plataforma intermedia</B> que conectes (por ejemplo, intervals.icu): solo si tú la conectas, y solo para enviar tus entrenamientos y recibir tus datos.</>,
        ]} />
        <P>Ningún proveedor de analítica, publicidad o inteligencia artificial recibe datos de tus dispositivos. Esos servidores pueden estar fuera del Perú; en ese caso aplicamos las medidas que la ley exige para la transferencia internacional de datos. Solo revelaríamos información por mandato de una autoridad competente.</P>
      </>],
      ["7. Cuánto tiempo se conservan", <>
        <Lista items={[
          "Mientras entrenes con TROTAMUNDOS, porque tu historial es parte de tu progresión.",
          <>Si <B>desconectas un dispositivo</B>, dejamos de recibir sus datos de inmediato. Los datos de salud recibidos de ese dispositivo se eliminan dentro de los 30 días siguientes. Tus actividades quedan en tu historial de entrenamiento, salvo que pidas borrarlas.</>,
          "Si dejas de entrenar y pides que se borre tu cuenta, eliminamos tus datos dentro de los 30 días siguientes, salvo los registros de pagos que la ley obligue a conservar.",
        ]} />
      </>],
      ["8. Tus derechos", <>
        <P>Conforme a la Ley N.º 29733, Ley de Protección de Datos Personales, y su reglamento, puedes en cualquier momento acceder a tus datos, rectificarlos, cancelarlos (borrarlos), oponerte a su tratamiento, pedir una copia para llevártelos y retirar tu consentimiento. Escribe a <Mail /> indicando tu pedido; te responderemos dentro de los plazos legales.</P>
        <P>Si consideras que no se atendieron tus derechos, puedes acudir a la Autoridad Nacional de Protección de Datos Personales del Ministerio de Justicia y Derechos Humanos.</P>
      </>],
      ["9. Seguridad", <>
        <P>Toda la comunicación va cifrada (HTTPS). El acceso está protegido con PIN y sesión firmada. La base de datos está cerrada a internet y solo el servidor de la aplicación puede leerla. Las autorizaciones de conexión con tu reloj se guardan solo en el servidor y nunca llegan al navegador. Ningún sistema es infalible, pero esos son los resguardos que están puestos.</P>
      </>],
      ["10. Menores de edad", <>
        <P>La aplicación está pensada para personas mayores de edad. Si un menor va a entrenar con el coach, la cuenta y los consentimientos los gestiona su padre, madre o tutor.</P>
      </>],
      ["11. Cambios en esta política", <>
        <P>Si cambia algo relevante, se actualiza esta página y la fecha de arriba. Si el cambio afecta a cómo se usan tus datos, te avisamos en la aplicación y, cuando la ley lo exija, te pedimos de nuevo tu consentimiento.</P>
      </>],
    ],
  },
  en: {
    titulo: "Privacy Policy",
    actualizado: "Last updated",
    otroIdioma: { href: "/privacidad", texto: "Leer esta política en español" },
    intro: <>TROTAMUNDOS is the app your coach uses to build and follow up on your running training plan. Your data is used to coach you, and for nothing else. <B>It is never sold, rented, used for advertising, or used to train artificial intelligence models.</B></>,
    volver: "Back to the app",
    secciones: [
      ["1. Data controller", <>
        <P><B>{EMPRESA.razon}</B> (Peruvian tax ID / RUC {EMPRESA.ruc}), with registered address at {EMPRESA.domicilio}, is the controller of the personal data processed in the TROTAMUNDOS app (app.trotamundos.pe).</P>
        <P>For any question about this policy or your data, write to <Mail />.</P>
      </>],
      ["2. What data we keep", <>
        <P>Only what is needed to build and follow your plan:</P>
        <Lista items={[
          <><B>To identify you:</B> your name and an access PIN. The PIN is stored hashed; not even your coach can see it.</>,
          <><B>To coach you:</B> your goal, level, race times, paces, race date and the plan your coach builds.</>,
          <><B>What you log:</B> completed sessions, kilometres, pace, perceived effort, notes, and anything you post on your group's wall.</>,
          <><B>Your membership:</B> dates and amounts of your payments, to track your active period. We do not store cards or bank details.</>,
          <><B>If you connect a watch or device:</B> the training data and, if you authorize it, the health data described in section 3.</>,
        ]} />
        <P>We do not ask for ID documents or your home address.</P>
      </>],
      ["3. Data from watches and sports devices", <>
        <P>You can connect your {MARCAS_EN} account to TROTAMUNDOS, either directly or through an intermediary platform such as intervals.icu. Depending on what you authorize, we receive:</P>
        <Lista items={[
          <><B>Training data:</B> your activities (type, date, distance, duration, pace, speed, laps, heart rate, cadence, power, elevation, running dynamics and GPS track when available) and the full activity file.</>,
          <><B>Health and wellness data:</B> sleep (duration, stages and score), heart rate variability (HRV), resting and all-day heart rate, stress, energy or recovery indicators (e.g. Body Battery), respiration, blood oxygen (SpO2), steps, calories, intensity minutes, estimated VO2 max and, with a compatible scale, weight and body composition.</>,
        ]} />
        <P>We also send the workouts of your plan to your account with that brand, so they appear on your watch.</P>
        <P>Health data is <B>sensitive data</B> under Peruvian Law No. 29733. Therefore:</P>
        <Lista items={[
          <>Connecting a device is <B>voluntary</B>; the app works the same without it.</>,
          <>Before connecting, the app asks for your <B>explicit consent</B>, <B>separately</B> for training data and for health data. You can give one without the other.</>,
          <>You grant access on the brand's own authorization page, where you see which permissions are requested.</>,
          <>You can <B>withdraw your consent and disconnect</B> at any time, from the app or from your account with the brand.</>,
        ]} />
        <P>Each brand and intermediary platform processes your data under its own privacy policy, which we do not control. The brands mentioned are trademarks of their respective owners; TROTAMUNDOS is not affiliated with or endorsed by them.</P>
      </>],
      ["4. How we use it", <>
        <Lista items={[
          "To design your plan and adjust it to how you are responding.",
          "To compare what you ran with what was planned (step by step and kilometre by kilometre).",
          "To send your workouts to your watch.",
          "To prepare daily recovery reports (sleep, HRV, resting heart rate, energy) for you and your coach, and to alert your coach when your indicators suggest reducing the load.",
          "To keep your history and track your membership.",
        ]} />
        <P>The app may <B>suggest</B> adjustments, but decisions about your training are always made by a person: your coach. No automated decisions affecting you are made without human involvement.</P>
      </>],
      ["5. Who can see it", <>
        <Lista items={[
          <><B>Your coach</B>, which is the very purpose of the app.</>,
          <><B>The TROTAMUNDOS administrator</B> (Jaime Kong Tsutsumi), who manages the platform and can review all athletes' plans.</>,
          <>Other athletes <B>cannot</B> see your data. On the wall they only see what you post.</>,
        ]} />
      </>],
      ["6. Who we share it with", <>
        <P>We do not sell or transfer your data. It is processed only on our behalf, under security and confidentiality obligations, by the services that run the app:</P>
        <Lista items={[
          <><B>Supabase</B>: the database where your data is stored.</>,
          <><B>Vercel</B>: the servers that host the app.</>,
          <><B>Your device brand or intermediary platform</B> (e.g. intervals.icu): only if you connect it, and only to send your workouts and receive your data.</>,
        ]} />
        <P>No analytics, advertising or artificial intelligence provider receives data from your devices. These servers may be located outside Peru; in that case we apply the safeguards the law requires for international data transfers. We would only disclose information under an order from a competent authority.</P>
      </>],
      ["7. How long we keep it", <>
        <Lista items={[
          "While you train with TROTAMUNDOS, because your history is part of your progression.",
          <>If you <B>disconnect a device</B>, we stop receiving its data immediately. Health data received from that device is deleted within 30 days. Your activities remain in your training history unless you ask us to delete them.</>,
          "If you stop training and ask us to delete your account, we delete your data within 30 days, except payment records we are legally required to keep.",
        ]} />
      </>],
      ["8. Your rights", <>
        <P>Under Peruvian Law No. 29733 (Personal Data Protection Law) and its regulations, you may at any time access, rectify, cancel (delete) or object to the processing of your data, request a copy to take with you, and withdraw your consent. Write to <Mail /> with your request; we will respond within the legal time limits.</P>
        <P>If you believe your rights have not been respected, you may contact the National Personal Data Protection Authority of Peru's Ministry of Justice and Human Rights.</P>
      </>],
      ["9. Security", <>
        <P>All communication is encrypted (HTTPS). Access is protected by PIN and a signed session. The database is closed to the internet and only the app's server can read it. Authorizations to connect your watch are stored only on the server and never reach the browser. No system is infallible, but these are the safeguards in place.</P>
      </>],
      ["10. Minors", <>
        <P>The app is intended for adults. If a minor trains with the coach, the account and consents are managed by their parent or legal guardian.</P>
      </>],
      ["11. Changes to this policy", <>
        <P>If anything relevant changes, this page and the date above are updated. If the change affects how your data is used, we will notify you in the app and, where the law requires, ask for your consent again.</P>
      </>],
    ],
  },
};

export function PoliticaDePrivacidad({ lang = "es" }) {
  const t = TEXTO[lang] || TEXTO.es;
  return (
    <main lang={lang} style={{ background: C.bg, minHeight: "100vh", padding: "48px 20px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <p style={{
          fontFamily: "'Oswald', sans-serif", fontSize: 13, letterSpacing: "0.18em",
          color: C.track, marginBottom: 6, textTransform: "uppercase",
        }}>TROTAMUNDOS</p>
        <h1 style={{
          fontFamily: "'Oswald', sans-serif", fontSize: 32, fontWeight: 600,
          color: C.lane, marginBottom: 8, lineHeight: 1.2,
        }}>{t.titulo}</h1>
        <p style={{ color: C.muted, fontSize: 14, marginBottom: 6 }}>
          {t.actualizado}: {ACTUALIZADO[lang] || ACTUALIZADO.es}
        </p>
        <p style={{ fontSize: 14, marginBottom: 36 }}>
          <a href={t.otroIdioma.href} style={{ color: C.track }}>{t.otroIdioma.texto}</a>
        </p>

        <div style={{
          background: C.surface, border: `1px solid ${C.border}`,
          borderRadius: 12, padding: "18px 20px", marginBottom: 36,
        }}>
          <p style={{ color: C.lane, fontSize: 15, lineHeight: 1.6, margin: 0 }}>{t.intro}</p>
        </div>

        {t.secciones.map(([titulo, cuerpo]) => (
          <section key={titulo} style={{ marginBottom: 32 }}>
            <h2 style={{
              fontFamily: "'Oswald', sans-serif", fontSize: 18, fontWeight: 600,
              color: C.lane, marginBottom: 10, letterSpacing: "0.02em",
            }}>{titulo}</h2>
            <div style={{ color: C.muted, fontSize: 15, lineHeight: 1.65 }}>{cuerpo}</div>
          </section>
        ))}

        <p style={{
          color: C.muted, fontSize: 13, borderTop: `1px solid ${C.border}`,
          paddingTop: 20, marginTop: 44,
        }}>
          {EMPRESA.razon} · RUC {EMPRESA.ruc} · Lima, Perú ·{" "}
          <a href="/" style={{ color: C.track }}>{t.volver}</a>
        </p>
      </div>
    </main>
  );
}
