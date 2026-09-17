-- ============================================================
-- Migración 022: tablero en tiempo real
-- Ejecutar en: Supabase Dashboard → SQL Editor (después de 021)
--
-- Cambios de otras personas (estado, texto, asignaciones, subtareas,
-- comentarios) se ven al momento sin recargar: las tablas del tablero
-- entran en la publicación que Realtime retransmite. RLS sigue
-- mandando: cada persona solo recibe lo que puede leer.
-- ============================================================

alter publication supabase_realtime add table
  public.tarjetas,
  public.tarjeta_asignaciones,
  public.tarjeta_checks,
  public.tarjeta_comentarios;
