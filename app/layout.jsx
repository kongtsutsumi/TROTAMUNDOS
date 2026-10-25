import "./globals.css";

// Lo que hace que el teléfono trate esto como una app y no como una página web:
//
//   · manifest.json con "display: standalone": al guardarla en la pantalla de inicio se
//     abre a pantalla completa, sin la barra del navegador.
//   · apple-touch-icon: el icono de la T en iPhone. Safari no lee los iconos del manifest.
//   · appleWebApp: lo mismo para iPhone, con la barra de estado sobre el fondo oscuro.
//   · viewportFit "cover": deja que la app llegue hasta los bordes del teléfono. La barra
//     inferior se encarga de no quedar debajo de la línea de inicio del iPhone.
export const metadata = {
  title: "Trotamundos",
  description: "Plan de entrenamiento — coach y alumnos",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icono-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    title: "Trotamundos",
    statusBarStyle: "black-translucent",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#12151B",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
