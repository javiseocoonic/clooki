-- ============================================================
-- Migración 021: avisos en tiempo real
-- Ejecutar en: Supabase Dashboard → SQL Editor (después de 019)
--
-- La campana ya se refresca sola cada 30 s. Con esto, además, Supabase
-- empuja cada aviso nuevo al navegador en el momento (Realtime): la
-- tabla entra en la publicación que Realtime escucha. RLS sigue
-- mandando: cada persona solo recibe los suyos.
-- ============================================================

alter publication supabase_realtime add table public.notificaciones;
