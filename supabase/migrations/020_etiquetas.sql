-- ============================================================
-- Migración 020: etiqueta de prioridad en las tarjetas
-- Ejecutar en: Supabase Dashboard → SQL Editor (después de 019)
--
-- Petición Javi (16 sep 2026): la marca «urgente» sí/no se queda corta.
-- Etiquetas, en el orden en que se apilan dentro de cada columna:
--   urgente · mediana · (sin etiqueta) · no_urgente ·
--   pendiente_aprobacion · pausado
-- Son las mismas cinco que usaba el equipo en Trello (Urgente, Mediana
-- importancia, No es emergencia, Pendiente aprobación, Pausado hasta
-- aviso), así que las importadas se rellenan desde la línea
-- «Prioridad: …» que el importador dejó en la descripción.
--
-- `urgente` se conserva (lo leen pantallas y filtros antiguos) pero deja
-- de ser editable a mano: un trigger lo deriva de la etiqueta.
-- ============================================================

begin;

alter table public.tarjetas
  add column etiqueta text not null default 'ninguna'
  constraint tarjetas_etiqueta_valida
  check (etiqueta in (
    'urgente', 'mediana', 'ninguna', 'no_urgente',
    'pendiente_aprobacion', 'pausado'
  ));

-- ---------- Relleno desde lo que ya hay ----------
-- Prioridad si una tarjeta tenía varias marcas en Trello: urgente >
-- pausado > pendiente de aprobación > mediana > no urgente.
update public.tarjetas set etiqueta = case
  when urgente then 'urgente'
  when descripcion ilike '%Prioridad:%PAUSADO HASTA AVISO%' then 'pausado'
  when descripcion ilike '%Prioridad:%PENDIENTE APROBACI%' then 'pendiente_aprobacion'
  when descripcion ilike '%Prioridad:%MEDIANA IMPORTANCIA%' then 'mediana'
  when descripcion ilike '%Prioridad:%NO URGENTE%'
    or descripcion ilike '%Prioridad:%NO ES EMERGENCIA%' then 'no_urgente'
  else 'ninguna'
end;

-- ---------- urgente y etiqueta, siempre de acuerdo ----------
-- Manda la etiqueta. Si una escritura solo toca `urgente` (una pestaña
-- con la versión anterior de la app, el importador viejo…), se deriva
-- la etiqueta de ahí para no dejar los dos campos en contradicción.
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
