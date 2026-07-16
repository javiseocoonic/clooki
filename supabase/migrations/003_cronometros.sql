-- ============================================================
-- Migración 003: sesiones de cronómetro concurrentes
-- Ejecutar en: Supabase Dashboard → SQL Editor (después de 002)
--
-- Modelo (ux-ui-directrices.md §11.3/§11.4):
-- - Varias sesiones activas por persona (una por proyecto como máximo).
-- - El tiempo se atribuye al día de INICIO (zona horaria del usuario:
--   el cliente envía dia_atribuido al arrancar).
-- - Al parar: redondeo a 0,25 y SUMA sobre la celda de ese día,
--   capada a 24 h por celda. La suma entre proyectos NO se capa
--   (los solapes son intencionales).
-- - Parar es idempotente: reintentar sobre una sesión cerrada
--   devuelve el mismo resultado sin volver a sumar.
-- ============================================================

create table public.cronometros (
  id             uuid primary key default gen_random_uuid(),
  persona_id     uuid not null references public.personas (id),
  proyecto_id    uuid not null references public.proyectos (id),
  inicio         timestamptz not null default now(),
  dia_atribuido  date not null,
  fin            timestamptz,
  horas_volcadas numeric(5, 2)
);

-- Máx. una sesión ACTIVA por (persona, proyecto); históricas, las que hagan falta.
create unique index cronometros_activo_unico
  on public.cronometros (persona_id, proyecto_id)
  where fin is null;

create index cronometros_activos_idx
  on public.cronometros (persona_id)
  where fin is null;

-- ---------- RLS: cada persona solo ve/escribe sus sesiones ----------

alter table public.cronometros enable row level security;

create policy cronometros_select on public.cronometros
  for select to authenticated
  using (persona_id = persona_actual_id());

create policy cronometros_insert on public.cronometros
  for insert to authenticated
  with check (persona_id = persona_actual_id());

create policy cronometros_update on public.cronometros
  for update to authenticated
  using (persona_id = persona_actual_id())
  with check (persona_id = persona_actual_id());

-- ---------- Parar (idempotente, suma sobre la celda del día de inicio) ----------
-- p_horas: si se pasa (prompt de sesión antigua §11.3.f), sustituye al
-- cálculo automático. 0 = descartar sin sumar nada.

create or replace function public.parar_cronometro(p_id uuid, p_horas numeric default null)
returns jsonb
language plpgsql
as $$
declare
  c       public.cronometros%rowtype;
  v_horas numeric;
  v_total numeric;
begin
  select * into c from public.cronometros where id = p_id for update;
  if not found then
    raise exception 'Cronómetro no encontrado';
  end if;

  if c.fin is not null then
    -- Ya cerrado: mismo resultado, sin sumar dos veces.
    select h.horas into v_total from public.horas h
    where h.persona_id = c.persona_id
      and h.proyecto_id = c.proyecto_id
      and h.fecha = c.dia_atribuido;
    return jsonb_build_object(
      'volcado', coalesce(c.horas_volcadas, 0),
      'total', coalesce(v_total, 0)
    );
  end if;

  if p_horas is not null then
    if p_horas < 0 or p_horas > 24 or mod(p_horas, 0.25) <> 0 then
      raise exception 'Horas inválidas';
    end if;
    v_horas := p_horas;
  else
    v_horas := round((extract(epoch from (now() - c.inicio)) / 3600.0)::numeric * 4) / 4.0;
    v_horas := least(v_horas, 24);
  end if;

  if v_horas > 0 then
    insert into public.horas (persona_id, proyecto_id, fecha, horas)
    values (c.persona_id, c.proyecto_id, c.dia_atribuido, v_horas)
    on conflict (persona_id, proyecto_id, fecha)
    do update set horas = least(24, public.horas.horas + excluded.horas);
  end if;

  update public.cronometros
  set fin = now(), horas_volcadas = v_horas
  where id = c.id;

  select h.horas into v_total from public.horas h
  where h.persona_id = c.persona_id
    and h.proyecto_id = c.proyecto_id
    and h.fecha = c.dia_atribuido;

  return jsonb_build_object('volcado', v_horas, 'total', coalesce(v_total, 0));
end;
$$;
