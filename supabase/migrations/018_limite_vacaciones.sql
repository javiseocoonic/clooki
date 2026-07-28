-- ============================================================
-- Migración 018: cupo anual de vacaciones
-- Ejecutar en: Supabase Dashboard → SQL Editor (después de 017)
--
-- Decisión (Javi, 28 jul 2026): máximo 22 días laborables (L–V) de
-- vacaciones por persona y año natural. Un periodo que cruza el año
-- (p. ej. 28 dic – 5 ene) reparte su cuenta entre ambos años. Los
-- festivos no se descuentan (no hay tabla de festivos).
--
-- El trigger es la garantía real; la app solo traduce el error CL022
-- al aviso de la página (mismo criterio que el candado de fechas
-- futuras de la 009).
-- ============================================================

begin;

-- ---------- 1. Días laborables de un rango ----------

-- L–V, ambos extremos incluidos. Rango invertido → 0.
create or replace function public.dias_laborables(p_desde date, p_hasta date)
returns int
language sql
immutable
as $$
  select count(*)::int
  from generate_series(p_desde, p_hasta, interval '1 day') d
  where extract(isodow from d) < 6;
$$;

-- ---------- 2. Trigger del cupo ----------

create or replace function public.vacaciones_respetar_limite()
returns trigger
language plpgsql
as $$
declare
  limite constant int := 22;
  anio int;
  usados int;
begin
  -- Con el tope de 60 días por periodo, como mucho toca dos años.
  for anio in extract(year from new.desde)::int
           .. extract(year from new.hasta)::int loop
    select coalesce(sum(public.dias_laborables(
             greatest(v.desde, make_date(anio, 1, 1)),
             least(v.hasta, make_date(anio, 12, 31)))), 0)
      into usados
      from public.vacaciones v
     where v.persona_id = new.persona_id
       and v.desde <= make_date(anio, 12, 31)
       and v.hasta >= make_date(anio, 1, 1);
    usados := usados + public.dias_laborables(
      greatest(new.desde, make_date(anio, 1, 1)),
      least(new.hasta, make_date(anio, 12, 31)));
    if usados > limite then
      raise exception
        'Más de % días laborables de vacaciones en %', limite, anio
        using errcode = 'CL022';
    end if;
  end loop;
  return new;
end;
$$;

create trigger vacaciones_limite
  before insert on public.vacaciones
  for each row execute function public.vacaciones_respetar_limite();

commit;
