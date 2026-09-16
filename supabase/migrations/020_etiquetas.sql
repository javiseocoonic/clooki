-- ============================================================
-- Migración 020: etiqueta de prioridad en las tarjetas (columna propia)
-- Ejecutar en: Supabase Dashboard → SQL Editor (después de 019)
--
-- OPCIONAL de momento. Desde el 16 sep 2026 la etiqueta funciona SIN
-- esta migración: la app la guarda como marca al final de la
-- descripción («[etiqueta:mediana]») y la oculta al mostrarla (ver
-- src/lib/etiquetas.ts). Esta migración la pasa a una columna de
-- verdad y limpia las marcas. Cuando se ejecute, hay que cambiar la
-- app para leer/escribir la columna en vez de la marca.
--
-- Etiquetas, en el orden en que se apilan dentro de cada columna:
--   urgente · mediana · (sin etiqueta) · no_urgente ·
--   pendiente_aprobacion · pausado
-- ============================================================

begin;

alter table public.tarjetas
  add column etiqueta text not null default 'ninguna'
  constraint tarjetas_etiqueta_valida
  check (etiqueta in (
    'urgente', 'mediana', 'ninguna', 'no_urgente',
    'pendiente_aprobacion', 'pausado'
  ));

-- ---------- Relleno desde la marca de la descripción ----------
update public.tarjetas
set etiqueta = substring(descripcion from '\[etiqueta:([a-z_]+)\]\s*$')
where descripcion ~ '\[etiqueta:(urgente|mediana|no_urgente|pendiente_aprobacion|pausado)\]\s*$';

-- Sin marca pero con el booleano antiguo: urgente.
update public.tarjetas set etiqueta = 'urgente'
where etiqueta = 'ninguna' and urgente;

-- ---------- Quitar la marca del texto ----------
update public.tarjetas
set descripcion = nullif(
  rtrim(regexp_replace(descripcion, '\s*\[etiqueta:[a-z_]+\]\s*$', '')),
  ''
)
where descripcion ~ '\[etiqueta:[a-z_]+\]\s*$';

-- ---------- urgente = (etiqueta = 'urgente'), siempre ----------
create or replace function public.tocar_urgente_desde_etiqueta()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE'
     and new.etiqueta = old.etiqueta
     and new.urgente is distinct from old.urgente then
    new.etiqueta := case
      when new.urgente then 'urgente'
      when new.etiqueta = 'urgente' then 'ninguna'
      else new.etiqueta
    end;
  elsif tg_op = 'INSERT' and new.etiqueta = 'ninguna' and new.urgente then
    new.etiqueta := 'urgente';
  end if;
  new.urgente := (new.etiqueta = 'urgente');
  return new;
end;
$$;

create trigger tarjetas_urgente_desde_etiqueta
  before insert or update on public.tarjetas
  for each row
  execute function public.tocar_urgente_desde_etiqueta();

commit;
