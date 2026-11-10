// Política de privacidad (español). El texto está en ./politica.jsx, junto con la versión en
// inglés que se publica en /privacy.
import { PoliticaDePrivacidad } from "./politica";

export const metadata = {
  title: "Política de privacidad · TROTAMUNDOS",
  description: "Qué datos guarda TROTAMUNDOS (incluidos los de relojes y dispositivos deportivos), para qué los usa y cómo ejercer tus derechos.",
};

export default function Privacidad() {
  return <PoliticaDePrivacidad lang="es" />;
}
