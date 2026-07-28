-- ============================================================
-- Migración 016: fuera la memoria de líneas (revierte la 015)
-- Ejecutar en: Supabase Dashboard → SQL Editor (después de 015)
--
-- Decisión (Javi, 28 jul 2026): la rejilla de Mi semana ya no
-- «recuerda» líneas de semanas anteriores — cada semana empieza vacía
-- y las líneas salen solo de las horas de la semana visible (o de un
-- cronómetro en marcha). Con eso, la papelera es definitiva por sí
-- sola (borra las horas de la semana) y la tabla lineas_ocultas deja
-- de tener sentido: se elimina con sus policies.
--
-- Si la 015 nunca se ejecutó en este proyecto, este drop no falla
-- gracias al «if exists».
-- ============================================================

begin;

drop table if exists public.lineas_ocultas;

commit;
