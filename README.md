# TROTAMUNDOS — app de coaching de running

Migrado desde el prototipo de artefacto de Claude a una aplicación web real,
lista para desplegar en Vercel con Supabase como base de datos.

## 1. Configurar Supabase

1. Crea una cuenta en [supabase.com](https://supabase.com) y un proyecto nuevo.
2. En el panel de tu proyecto, ve a **SQL Editor > New query**.
3. Copia y pega todo el contenido de `supabase/schema.sql`, y ejecútalo.
4. Ve a **Project Settings > API** y copia:
   - **Project URL**
   - **anon public key**

## 2. Configurar las variables de entorno localmente (para probar antes de publicar)

1. Copia `.env.example` a un archivo nuevo llamado `.env.local`.
2. Completa `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` con los valores del paso anterior.

## 3. Probar localmente (opcional, requiere Node.js instalado)

```bash
npm install
npm run dev
```

Abre http://localhost:3000 en tu navegador.

## 4. Subir a GitHub

1. Crea un repositorio nuevo en GitHub (puede ser privado).
2. Sube todo el contenido de esta carpeta a ese repositorio.

## 5. Desplegar en Vercel

1. Crea una cuenta en [vercel.com](https://vercel.com) (puedes entrar directo con tu cuenta de GitHub).
2. "Add New... > Project" y selecciona el repositorio que acabas de subir.
3. En **Environment Variables**, agrega las mismas dos variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Toca **Deploy**.

En un par de minutos tendrás un enlace funcionando (algo como `trotamundos.vercel.app`).
Cada vez que subas cambios nuevos a la rama principal de GitHub, Vercel los publica
automáticamente — ya no hace falta ningún botón de "Publicar" manual.

## Notas importantes

- **La seguridad de acceso sigue viviendo en el PIN del alumno y la contraseña del
  coach**, igual que en la versión de artefacto — no en permisos de base de datos.
- **El código de la app en sí (`app/page.jsx`) es casi idéntico al del artefacto** —
  solo cambió la forma en que se guarda y lee la información (ahora usa Supabase
  en vez de `window.storage`). Toda la lógica de planes, ritmos, fases, etc. es
  la misma que ya estaba probada.
- Si en algún momento quieres una base de datos más "ordenada" (tablas separadas
  para alumnos, semanas, etc. en vez de una tabla clave-valor), es un paso natural
  a futuro una vez que confirmes que esta versión funciona bien en producción.
