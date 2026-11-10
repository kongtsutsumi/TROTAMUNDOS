-- =========================================================
-- TROTAMUNDOS — tabla de datos de salud diarios
-- Ejecuta este archivo completo en: Supabase > SQL Editor > New query
-- (una sola vez; si la tabla ya existe, no hace nada).
--
-- Una fila por alumno, día y fuente (garmin, coros, polar, suunto, apple…), con los datos
-- de salud de ese día: sueño, VFC, FC en reposo, estrés, energía, SpO2, pasos, etc.
-- Qué campos se aceptan lo decide lib/salud.mjs.
--
-- Son datos SENSIBLES (Ley N.º 29733). Por eso:
--   · La tabla queda cerrada al público: RLS activo y SIN políticas. Solo el servidor de la
--     app (con la clave secreta) puede leerla o escribirla, igual que kv_store.
--   · El servidor solo guarda si el alumno aceptó el consentimiento de salud, y la borra
--     al retirarlo, al desconectar el reloj o al borrar al alumno (lib/salud-servidor.js).
-- =========================================================

create table if not exists salud_diaria (
  student_id   text        not null,
  fecha        date        not null,
  fuente       text        not null,
  datos        jsonb       not null default '{}'::jsonb,
  recibido_at  timestamptz not null default now(),
  primary key (student_id, fecha, fuente)
);

create index if not exists idx_salud_diaria_alumno_fecha on salud_diaria (student_id, fecha desc);

alter table salud_diaria enable row level security;
-- Sin políticas a propósito: el navegador (clave pública) no puede leer ni escribir nada.
