-- =========================================================
-- PASO DE SEGURIDAD — ejecutar SOLO cuando la nueva versión ya esté
-- publicada y funcionando (ver README, sección "Cerrar el acceso público").
--
-- Esto elimina el acceso abierto desde el navegador. A partir de aquí, la única
-- forma de leer o escribir datos es a través del servidor de la app, que verifica
-- primero quién eres (contraseña del coach o PIN del alumno).
-- =========================================================

drop policy if exists "acceso abierto kv_store" on kv_store;

-- Sin políticas y con RLS activo, la clave pública del navegador no puede leer nada.
-- La clave secreta del servidor (SUPABASE_SECRET_KEY) sí puede, porque las omite por diseño.
alter table kv_store enable row level security;
