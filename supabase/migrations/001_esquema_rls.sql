-- ============================================================
-- Clooki · Coonic Registro de horas — MVP
-- Migración 001: esquema + políticas RLS
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

-- ---------- 1. Tipos ----------

create type rol_persona as enum ('admin', 'miembro');

-- ---------- 2. Tablas ----------

create table public.personas (
  id     uuid primary key default gen_random_uuid(),
  nombre text not null,
  email  text not null unique check (email = lower(email)),
  rol    rol_persona not null default 'miembro',
  activo boolean not null default true
);

create table public.clientes (
  id     uuid primary key default gen_random_uuid(),
  nombre text not null,
  activo boolean not null default true
);

create table public.proyectos (
  id         uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id),
  nombre     text not null,
  activo     boolean not null default true
);

create index proyectos_cliente_idx on public.proyectos (cliente_id);

create table public.horas (
  id             uuid primary key default gen_random_uuid(),
  persona_id     uuid not null references public.personas (id),
  proyecto_id    uuid not null references public.proyectos (id),
  fecha          date not null,
  horas          numeric(4, 1) not null
                 check (horas > 0 and horas <= 24 and mod(horas, 0.5) = 0),
  nota           text,
  actualizado_en timestamptz not null default now(),
  -- La celda de la rejilla es exactamente un registro:
  -- editar = upsert sobre esta clave; vaciar = delete.
  unique (persona_id, proyecto_id, fecha)
);

create index horas_persona_fecha_idx on public.horas (persona_id, fecha);
create index horas_fecha_idx on public.horas (fecha);
create index horas_proyecto_idx on public.horas (proyecto_id);

-- ---------- 3. Trigger: actualizado_en ----------

create or replace function public.tocar_actualizado_en()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

create trigger horas_actualizado_en
  before update on public.horas
  for each row
  execute function public.tocar_actualizado_en();

-- ---------- 4. Helpers de identidad (para RLS) ----------
-- SECURITY DEFINER: consultan `personas` sin pasar por sus propias
-- políticas RLS (evita recursión). El email viene del JWT de Supabase Auth.

create or replace function public.persona_actual_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from personas
  where email = lower(auth.jwt() ->> 'email')
    and activo;
$$;

create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from personas
    where email = lower(auth.jwt() ->> 'email')
      and rol = 'admin'
      and activo
  );
$$;

-- ---------- 5. RLS ----------
-- miembro: lee/escribe SOLO sus horas; lee clientes y proyectos activos.
-- admin:   lee todo; único que escribe en clientes/proyectos/personas.
-- Quien no tenga fila en `personas` (o esté inactivo) no ve nada,
-- aunque se haya autenticado.

alter table public.personas  enable row level security;
alter table public.clientes  enable row level security;
alter table public.proyectos enable row level security;
alter table public.horas     enable row level security;

-- personas
create policy personas_select on public.personas
  for select to authenticated
  using (email = lower(auth.jwt() ->> 'email') or es_admin());

create policy personas_insert_admin on public.personas
  for insert to authenticated
  with check (es_admin());

create policy personas_update_admin on public.personas
  for update to authenticated
  using (es_admin())
  with check (es_admin());

create policy personas_delete_admin on public.personas
  for delete to authenticated
  using (es_admin());

-- clientes
create policy clientes_select on public.clientes
  for select to authenticated
  using ((activo and persona_actual_id() is not null) or es_admin());

create policy clientes_insert_admin on public.clientes
  for insert to authenticated
  with check (es_admin());

create policy clientes_update_admin on public.clientes
  for update to authenticated
  using (es_admin())
  with check (es_admin());

create policy clientes_delete_admin on public.clientes
  for delete to authenticated
  using (es_admin());

-- proyectos
create policy proyectos_select on public.proyectos
  for select to authenticated
  using ((activo and persona_actual_id() is not null) or es_admin());

create policy proyectos_insert_admin on public.proyectos
  for insert to authenticated
  with check (es_admin());

create policy proyectos_update_admin on public.proyectos
  for update to authenticated
  using (es_admin())
  with check (es_admin());

create policy proyectos_delete_admin on public.proyectos
  for delete to authenticated
  using (es_admin());

-- horas
create policy horas_select on public.horas
  for select to authenticated
  using (persona_id = persona_actual_id() or es_admin());

create policy horas_insert_propias on public.horas
  for insert to authenticated
  with check (persona_id = persona_actual_id());

create policy horas_update_propias on public.horas
  for update to authenticated
  using (persona_id = persona_actual_id())
  with check (persona_id = persona_actual_id());

create policy horas_delete_propias on public.horas
  for delete to authenticated
  using (persona_id = persona_actual_id());
