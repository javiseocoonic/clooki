-- ============================================================
-- Migración 004: acceso MCP (Claude) con token personal
-- Ejecutar en: Supabase Dashboard → SQL Editor (después de 003)
--
-- Diseño (ROADMAP fase IA · 1):
-- - Cada persona genera UN token personal en /conexion-ia; solo se
--   guarda su hash SHA-256.
-- - El endpoint /api/mcp NO usa service role: llama a estas funciones
--   SECURITY DEFINER con la clave publishable; cada función valida el
--   token y aplica dentro las mismas reglas que el RLS (miembro = solo
--   lo suyo; admin = lectura de todo).
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- Tokens ----------

create table public.claves_api (
  id         uuid primary key default gen_random_uuid(),
  persona_id uuid not null references public.personas (id),
  hash       text not null unique,
  creada_en  timestamptz not null default now(),
  usada_en   timestamptz
);

-- Una clave por persona (regenerar = borrar + crear).
create unique index claves_api_persona_unica
  on public.claves_api (persona_id);

alter table public.claves_api enable row level security;

create policy claves_select on public.claves_api
  for select to authenticated
  using (persona_id = persona_actual_id());

create policy claves_insert on public.claves_api
  for insert to authenticated
  with check (persona_id = persona_actual_id());

create policy claves_delete on public.claves_api
  for delete to authenticated
  using (persona_id = persona_actual_id());

-- ---------- Validación interna ----------

create or replace function public.mcp_valida(p_clave text)
returns public.personas
language plpgsql
security definer
set search_path = public
as $$
declare
  v personas%rowtype;
begin
  select p.* into v
  from claves_api k
  join personas p on p.id = k.persona_id
  where k.hash = encode(digest(p_clave, 'sha256'), 'hex')
    and p.activo;
  if not found then
    raise exception 'Token inválido o revocado';
  end if;
  update claves_api
  set usada_en = now()
  where persona_id = v.id;
  return v;
end;
$$;

-- ---------- Identidad ----------

create or replace function public.mcp_persona(p_clave text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v personas%rowtype := mcp_valida(p_clave);
begin
  return jsonb_build_object('id', v.id, 'nombre', v.nombre, 'rol', v.rol);
end;
$$;

-- ---------- Catálogo (clientes/proyectos activos) ----------

create or replace function public.mcp_catalogo(p_clave text)
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
      'id', c.id,
      'nombre', c.nombre,
      'proyectos', (
        select coalesce(jsonb_agg(
          jsonb_build_object('id', pr.id, 'nombre', pr.nombre)
          order by pr.nombre), '[]'::jsonb)
        from proyectos pr
        where pr.cliente_id = c.id and pr.activo
      )
    ) order by c.nombre)
    from clientes c
    where c.activo
  ), '[]'::jsonb);
end;
$$;

-- ---------- Horas de un rango ----------
-- miembro: solo las suyas · admin: las de todo el equipo.

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
      'horas', h.horas,
      'nota', h.nota,
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

-- ---------- Personas activas (solo admin, para huecos de datos) ----------

create or replace function public.mcp_personas(p_clave text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v personas%rowtype := mcp_valida(p_clave);
begin
  if v.rol <> 'admin' then
    raise exception 'Solo admin';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'nombre', p.nombre)
      order by p.nombre)
    from personas p
    where p.activo
  ), '[]'::jsonb);
end;
$$;

-- ---------- Apuntar horas (misma semántica que la rejilla) ----------
-- p_horas = 0 y sin sumar → borra la celda. p_sumar → acumula (cap 24).

create or replace function public.mcp_apuntar(
  p_clave text,
  p_proyecto_id uuid,
  p_fecha date,
  p_horas numeric,
  p_nota text default null,
  p_sumar boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v personas%rowtype := mcp_valida(p_clave);
  v_total numeric;
begin
  if p_horas < 0 or p_horas > 24 or mod(p_horas, 0.25) <> 0 then
    raise exception 'Horas inválidas: usa pasos de 0,25 entre 0 y 24';
  end if;
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
      and cr.dia_atribuido = p_fecha and cr.fin is null
  ) then
    raise exception 'Hay un cronómetro en marcha en esa celda; páralo antes';
  end if;

  if p_horas = 0 and not p_sumar then
    delete from horas
    where persona_id = v.id and proyecto_id = p_proyecto_id and fecha = p_fecha;
    return jsonb_build_object('accion', 'borrado', 'total', 0);
  end if;

  insert into horas (persona_id, proyecto_id, fecha, horas, nota)
  values (v.id, p_proyecto_id, p_fecha, p_horas, p_nota)
  on conflict (persona_id, proyecto_id, fecha) do update
  set horas = case
        when p_sumar then least(24, horas.horas + excluded.horas)
        else excluded.horas
      end,
      nota = coalesce(excluded.nota, horas.nota);

  select h.horas into v_total from horas h
  where h.persona_id = v.id and h.proyecto_id = p_proyecto_id
    and h.fecha = p_fecha;

  return jsonb_build_object(
    'accion', case when p_sumar then 'sumado' else 'fijado' end,
    'total', v_total
  );
end;
$$;
