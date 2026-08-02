-- =========================================================
-- TROTAMUNDOS — esquema de base de datos para Supabase
-- Ejecuta este archivo completo en: Supabase > SQL Editor > New query
--
-- Diseño: una tabla simple "clave -> valor" (kv_store), que refleja
-- exactamente cómo ya funcionaba el guardado en la versión de artefacto
-- (student:{id}, roster, coachAuth, reports, etc.) — esto permite migrar
-- con el menor riesgo posible, reutilizando casi todo el código ya
-- probado. Si más adelante quieres una base de datos más "relacional"
-- (tablas separadas para alumnos, semanas, etc.), es un paso natural a
-- futuro una vez que la migración inicial esté funcionando y estable.
-- =========================================================

create extension if not exists "pgcrypto";

create table if not exists kv_store (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_kv_store_key_prefix on kv_store (key text_pattern_ops);

alter table kv_store enable row level security;

-- Nota sobre seguridad: dejamos la tabla con acceso abierto vía la clave
-- pública "anon" de Supabase — igual que en el prototipo de artefacto, la
-- seguridad real recae en el PIN de cada alumno y la contraseña del coach,
-- no en permisos de base de datos. Si más adelante quieres reforzarlo,
-- aquí es donde se agregarían políticas más estrictas.
create policy "acceso abierto kv_store" on kv_store for all using (true) with check (true);
