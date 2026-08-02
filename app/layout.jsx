import "./globals.css";

export const metadata = {
  title: "TROTAMUNDOS",
  description: "Plan de entrenamiento — coach y alumnos",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
