// Privacy policy (English). The text lives in ../privacidad/politica.jsx, next to the Spanish
// version published at /privacidad.
import { PoliticaDePrivacidad } from "../privacidad/politica";

export const metadata = {
  title: "Privacy Policy · TROTAMUNDOS",
  description: "What data TROTAMUNDOS keeps (including data from watches and sports devices), how it is used and how to exercise your rights.",
};

export default function Privacy() {
  return <PoliticaDePrivacidad lang="en" />;
}
