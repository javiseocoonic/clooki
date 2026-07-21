-- ============================================================
-- Migración 013: fuera los equipos de trabajo de personas
-- Ejecutar en: Supabase Dashboard → SQL Editor (después de 012)
--
-- El filtro del tablero /tareas pasó a filtrar por TIPO de proyecto
-- (el nombre del proyecto: Audiovisual, Consultoría, Desarrollo web…),
-- que es un atributo de la tarea y no de las personas asignadas
-- (decisión Javi, 21 jul 2026). La pertenencia persona↔equipo se queda
-- sin ningún consumidor — ni tablero ni Gestión — así que se elimina
-- entera (tabla, índice y políticas caen con ella). Deshacer = re-crear
-- con la migración 008 (la pertenencia en sí no se conserva).
-- ============================================================

begin;

drop table public.persona_equipos;

commit;
