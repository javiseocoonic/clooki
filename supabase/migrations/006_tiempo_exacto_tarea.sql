-- ============================================================
-- Migración 006: tiempo exacto (segundos) + tarea por línea
-- Ejecutar en: Supabase Dashboard → SQL Editor (después de 005)
--
-- Decisión del cliente (jul 2026, levanta restricciones del brief):
-- - Sin cortes de 0,25 h: el tiempo se guarda al segundo. La columna
--   pasa a `segundos integer` (aritmética exacta; numeric en horas no
--   representa 1 s = 0,000277… periódico). `horas` sobrevive como
--   columna GENERADA de solo lectura: los lectores antiguos siguen
--   funcionando y el CSV decimal sale de ahí. Un upsert antiguo que
--   envíe `horas` falla con error visible — nunca corrompe.
-- - La celda pasa a (persona, proyecto, fecha, TAREA): varias líneas
--   del mismo proyecto con tareas distintas. `tarea` sustituye a
--   `nota` (los textos existentes se migran).
-- - Los RPC conservan compatibilidad con el front desplegado durante
--   la ventana de deploy: `parar_cronometro` acepta p_horas o
--   p_segundos; `mcp_apuntar` conserva p_nota como alias de p_tarea.
--
-- ANTES de ejecutar, snapshot para cuadrar después:
--   select count(*), sum(horas) from public.horas;
--   select count(*) from public.horas where nota is not null and btrim(nota) <> '';
-- DESPUÉS:
--   select count(*), sum(segundos)::numeric/3600, sum(horas) from public.horas;
--   select count(*) from public.horas where tarea <> '';
-- ============================================================

begin;

-- ---------- 1. horas: tarea (migrando nota) ----------

alter table public.horas add column tarea text not null default '';

update public.horas
set tarea = btrim(nota)
where nota is not null and btrim(nota) <> '';

alter table public.horas add constraint horas_tarea_valida
  check (tarea = btrim(tarea) and char_length(tarea) <= 120);

alter table public.horas drop column nota;

-- ---------- 2. horas: segundos exactos ----------

alter table public.horas add column segundos integer;

-- 0,25 h = 900 s exactos: sin pérdida sobre los datos históricos.
update public.horas set segundos = round(horas * 3600)::integer;

alter table public.horas alter column segundos set not null;
alter table public.horas add constraint horas_segundos_check
  check (segundos > 0 and segundos <= 86400);

alter table public.horas drop constraint horas_horas_check;
alter table public.horas drop column horas;

-- Compat de lectura: horas decimales derivadas, solo lectura.
alter table public.horas add column horas numeric(10, 6)
  generated always as (round(segundos::numeric / 3600, 6)) stored;

-- ---------- 3. horas: nueva identidad (persona, proyecto, fecha, tarea) ----------

-- El unique de 001 no tiene nombre explícito: se localiza y se elimina.
do $$
declare
  v_con text;
begin
  select conname into strict v_con
  from pg_constraint
  where conrelid = 'public.horas'::regclass and contype = 'u';
  execute format('alter table public.horas drop constraint %I', v_con);
end $$;

-- Sin conflicto posible: cada fila ya era única por (persona, proyecto, fecha).
alter table public.horas add constraint horas_identidad_unica
  unique (persona_id, proyecto_id, fecha, tarea);

-- ---------- 4. cronometros: tarea + segundos volcados ----------

alter table public.cronometros add column tarea text not null default '';
alter table public.cronometros add constraint cronometros_tarea_valida
  check (tarea = btrim(tarea) and char_length(tarea) <= 120);

alter table public.cronometros add column segundos_volcados integer;
update public.cronometros
set segundos_volcados = round(horas_volcadas * 3600)::integer
where horas_volcadas is not null;
alter table public.cronometros drop column horas_volcadas;

-- Máx. una sesión ACTIVA por (persona, proyecto, tarea).
drop index public.cronometros_activo_unico;
create unique index cronometros_activo_unico
  on public.cronometros (persona_id, proyecto_id, tarea)
  where fin is null;

-- ---------- 5. parar_cronometro: sin redondeo, con tarea ----------
-- DROP obligatorio: `create or replace` con otra lista de argumentos
-- crearía una SOBRECARGA y PostgREST fallaría por ambigüedad en todas
-- las llamadas. La firma nueva acepta p_horas (front viejo, en horas)
-- o p_segundos (front nuevo); sin ninguno, el tiempo exacto de la
-- sesión. 0 = descartar sin sumar.

drop function public.parar_cronometro(uuid, numeric);

create function public.parar_cronometro(
  p_id uuid,
  p_horas numeric default null,
  p_segundos integer default null
)
returns jsonb
language plpgsql
as $$
declare
  c     public.cronometros%rowtype;
  v_seg integer;
  v_tot integer;
begin
  select * into c from public.cronometros where id = p_id for update;
  if not found then
    raise exception 'Cronómetro no encontrado';
  end if;

  if c.fin is not null then
    -- Ya cerrado: mismo resultado, sin sumar dos veces.
    select h.segundos into v_tot from public.horas h
    where h.persona_id = c.persona_id
      and h.proyecto_id = c.proyecto_id
      and h.fecha = c.dia_atribuido
      and h.tarea = c.tarea;
    return jsonb_build_object(
      'segundos_volcados', coalesce(c.segundos_volcados, 0),
      'segundos_total', coalesce(v_tot, 0),
      'volcado', round(coalesce(c.segundos_volcados, 0) / 3600.0, 6),
      'total', round(coalesce(v_tot, 0) / 3600.0, 6)
    );
  end if;

  if p_segundos is not null then
    if p_segundos < 0 or p_segundos > 86400 then
      raise exception 'Duración inválida';
    end if;
    v_seg := p_segundos;
  elsif p_horas is not null then
    if p_horas < 0 or p_horas > 24 then
      raise exception 'Horas inválidas';
    end if;
    v_seg := round(p_horas * 3600)::integer;
  else
    v_seg := least(86400,
      greatest(0, round(extract(epoch from (now() - c.inicio)))::integer));
  end if;

  if v_seg > 0 then
    insert into public.horas (persona_id, proyecto_id, fecha, tarea, segundos)
    values (c.persona_id, c.proyecto_id, c.dia_atribuido, c.tarea, v_seg)
    on conflict (persona_id, proyecto_id, fecha, tarea)
    do update set segundos = least(86400, public.horas.segundos + excluded.segundos);
  end if;

  update public.cronometros
  set fin = now(), segundos_volcados = v_seg
  where id = c.id;

  select h.segundos into v_tot from public.horas h
  where h.persona_id = c.persona_id
    and h.proyecto_id = c.proyecto_id
    and h.fecha = c.dia_atribuido
    and h.tarea = c.tarea;

  return jsonb_build_object(
    'segundos_volcados', v_seg,
    'segundos_total', coalesce(v_tot, 0),
    'volcado', round(v_seg / 3600.0, 6),
    'total', round(coalesce(v_tot, 0) / 3600.0, 6)
  );
end;
$$;

-- ---------- 6. mcp_apuntar: sin pasos de 0,25, con tarea ----------
-- p_nota se conserva como alias legado de p_tarea (conectores MCP ya
-- configurados siguen funcionando). p_horas admite cualquier decimal.
-- horas = 0 sin sumar → borra la celda de ESA tarea (sin tarea, la de
-- tarea vacía).

drop function public.mcp_apuntar(text, uuid, date, numeric, text, boolean);

create function public.mcp_apuntar(
  p_clave text,
  p_proyecto_id uuid,
  p_fecha date,
  p_horas numeric,
  p_nota text default null,
  p_sumar boolean default false,
  p_tarea text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v personas%rowtype := mcp_valida(p_clave);
  v_tarea text := coalesce(btrim(coalesce(p_tarea, p_nota)), '');
  v_seg integer;
  v_tot integer;
begin
  if p_horas < 0 or p_horas > 24 then
    raise exception 'Horas inválidas: entre 0 y 24';
  end if;
  if char_length(v_tarea) > 120 then
    raise exception 'La tarea no puede superar los 120 caracteres';
  end if;
  v_seg := round(p_horas * 3600)::integer;

  if not exists (
    select 1 from proyectos pr
    join clientes c on c.id = pr.cliente_id
    where pr.id = p_proyecto_id and pr.activo and c.activo
  ) then
    raise exception 'Proyecto no encontrado o archivado';
  end if;
  -- Misma regla que la rejilla: celda bloqueada si hay cronómetro en marcha.
  if exists (
    select 1 from cronometros cr
    where cr.persona_id = v.id and cr.proyecto_id = p_proyecto_id
      and cr.tarea = v_tarea and cr.dia_atribuido = p_fecha and cr.fin is null
  ) then
    raise exception 'Hay un cronómetro en marcha en esa celda; páralo antes';
  end if;

  if v_seg = 0 and not p_sumar then
    delete from horas
    where persona_id = v.id and proyecto_id = p_proyecto_id
      and fecha = p_fecha and tarea = v_tarea;
    return jsonb_build_object('accion', 'borrado', 'segundos_total', 0, 'total', 0);
  end if;

  insert into horas (persona_id, proyecto_id, fecha, tarea, segundos)
  values (v.id, p_proyecto_id, p_fecha, v_tarea, v_seg)
  on conflict (persona_id, proyecto_id, fecha, tarea) do update
  set segundos = case
        when p_sumar then least(86400, horas.segundos + excluded.segundos)
        else excluded.segundos
      end;

  select h.segundos into v_tot from horas h
  where h.persona_id = v.id and h.proyecto_id = p_proyecto_id
    and h.fecha = p_fecha and h.tarea = v_tarea;

  return jsonb_build_object(
    'accion', case when p_sumar then 'sumado' else 'fijado' end,
    'segundos_total', v_tot,
    'total', round(v_tot / 3600.0, 6)
  );
end;
$$;

-- ---------- 7. mcp_horas_rango: exponer tarea y segundos ----------
-- Misma firma → create or replace vale. 'nota' desaparece del objeto.

create or replace function public.mcp_horas_rango(
  p_clave text, p_desde date, p_hasta date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v personas%rowtype := mcp_valida(p_clave);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'persona_id', h.persona_id,
      'persona', pe.nombre,
      'cliente', c.nombre,
      'proyecto', pr.nombre,
      'fecha', h.fecha,
      'tarea', h.tarea,
      'segundos', h.segundos,
      'horas', h.horas,
      'actualizado_en', h.actualizado_en
    ) order by h.fecha, pe.nombre)
    from horas h
    join proyectos pr on pr.id = h.proyecto_id
    join clientes c on c.id = pr.cliente_id
    join personas pe on pe.id = h.persona_id
    where h.fecha between p_desde and p_hasta
      and (v.rol = 'admin' or h.persona_id = v.id)
  ), '[]'::jsonb);
end;
$$;

commit;
