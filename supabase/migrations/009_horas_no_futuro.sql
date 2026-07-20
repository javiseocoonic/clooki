-- ============================================================
-- Migración 009: candado de días futuros en `horas`
-- Ejecutar en: Supabase Dashboard → SQL Editor (después de 008)
--
-- No se pueden apuntar horas de días posteriores a HOY (fase Cuco,
-- roadmap-wordle.md §2). Doble motivo: protege la honestidad del dato
-- (horas de pasado mañana son ruido) y evita desbloquear el Wordle
-- semanal antes de tiempo.
--
-- La garantía vive aquí, en un trigger: cubre de una vez el upsert de
-- la rejilla, el insert de mcp_apuntar y el upsert de la entrada
-- natural (todos escriben en `horas`). El front solo añade la
-- experiencia (celdas deshabilitadas, error amable).
--
-- «Hoy» es la fecha en Europe/Madrid, no la del servidor: el equipo
-- está en Málaga y el reloj de la BD corre en UTC — de madrugada,
-- current_date iría un día por detrás y bloquearía el día en curso.
--
-- `cronometros` no lo necesita: su día atribuido es siempre el de
-- arranque, que es hoy por construcción.
-- ============================================================

begin;

create or replace function public.rechazar_fecha_futura()
returns trigger
language plpgsql
as $$
begin
  if new.fecha > (now() at time zone 'Europe/Madrid')::date then
    raise exception 'No se pueden apuntar horas de días futuros';
  end if;
  return new;
end;
$$;

create trigger horas_no_futuro
  before insert or update on public.horas
  for each row
  execute function public.rechazar_fecha_futura();

commit;
