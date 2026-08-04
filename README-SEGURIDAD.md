# Actualización de seguridad — pasos a seguir

Esta versión cierra un problema importante: **antes, cualquiera podía descargar los datos
de todos los alumnos** leyendo el código de la página, sin pasar por ningún PIN. Ahora la
verificación ocurre en el servidor y la base de datos queda cerrada al navegador.

**Tus 9 alumnos siguen entrando con el mismo PIN de siempre, y tú con tu misma contraseña.**
No hay que migrar ni resetear nada.

---

## Paso 0 — Respaldo (hazlo primero)

En tu app publicada, panel del coach → botón **"Respaldo"**. Guarda ese archivo.

---

## Paso 1 — Conseguir la clave secreta de Supabase

1. Entra a tu proyecto en supabase.com → **Project Settings** → **API Keys**.
2. En la sección **"Secret keys"**, junto a `sb_secret_...`, toca el ícono del ojo y luego copiar.
3. Guárdala a mano un momento (la usarás en el paso 3).

Esta es la clave que dijimos que **nunca** debía ir al navegador. Ahora sí se usa, pero solo
del lado del servidor, donde nadie puede verla.

---

## Paso 2 — Generar una clave para firmar las sesiones

En la Terminal, corre esto y copia el resultado:

```
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Es una cadena larga y aleatoria. Sirve para que nadie pueda falsificar una sesión.

---

## Paso 3 — Agregar las dos variables nuevas en Vercel

1. Entra a vercel.com → tu proyecto → **Settings** → **Environment Variables**.
2. Agrega estas dos (además de las que ya tienes):

   - `SUPABASE_SECRET_KEY` → la clave del paso 1 (`sb_secret_...`)
   - `SESSION_SECRET` → la cadena del paso 2

3. Guarda.

---

## Paso 4 — Subir el código nuevo

Reemplaza los archivos de tu proyecto por los de esta versión y, en la Terminal:

```
git add .
git commit -m "Seguridad: verificacion en servidor y cierre del acceso publico a la base"
git push
```

Espera a que Vercel termine de publicar (un par de minutos).

---

## Paso 5 — PROBAR ANTES DE CERRAR LA BASE

Abre tu app publicada y verifica:

- [ ] Entras como coach con tu contraseña de siempre
- [ ] Ves tus 9 alumnos
- [ ] Entras al portal de un alumno con su PIN
- [ ] El alumno ve su plan y puede marcar una sesión

**Si algo falla aquí, avísame antes de continuar.** La base todavía está abierta, así que
todo sigue funcionando como antes mientras lo resolvemos.

---

## Paso 6 — Cerrar el acceso público (el paso final)

Solo cuando el paso 5 haya salido bien:

1. Entra a Supabase → **SQL Editor** → **New query**.
2. Pega y ejecuta el contenido de `supabase/schema-lockdown.sql`.
3. Vuelve a probar la app: debe seguir funcionando exactamente igual.

A partir de aquí, la base de datos ya no responde a nadie que no pase por tu servidor.

---

## Si algo sale mal después del paso 6

Puedes reabrir temporalmente la base ejecutando esto en el SQL Editor, y avisarme:

```sql
create policy "acceso abierto kv_store" on kv_store for all using (true) with check (true);
```
