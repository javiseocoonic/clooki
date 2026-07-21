-- ============================================================
-- Migración 014: fecha de entrega, urgencia y subtareas (checks)
-- Ejecutar en: Supabase Dashboard → SQL Editor (después de 013)
--
-- Mejoras del tablero (Javi, 21 jul 2026):
-- - `fecha_limite` y `urgente` en tarjetas: la fecha colorea la tarjeta
--   según lo cerca que esté la entrega; la urgencia es una marca manual
--   independiente del plazo (urgente ≠ vence pronto).
-- - `tarjeta_checks`: checklist tipo Trello dentro de la tarjeta, con
--   persona y fecha opcionales POR ÍTEM — subtareas dentro de una tarea
--   principal sin el peso de tarjetas anidadas.
--
-- Permisos (mismo espíritu que tarjetas): leer, todo el equipo activo;
-- crear/borrar/editar checks, quien puede editar la tarjeta madre; y
-- ADEMÁS marcar/desmarcar puede hacerlo la persona asignada al ítem
-- aunque no esté asignada a la tarjeta (es su subtarea).
-- ============================================================

begin;

-- ---------- 1. Tarjetas: fecha de entrega y urgencia ----------

alter table public.tarjetas
  add column fecha_limite date,
  add column urgente boolean not null default false;

-- ---------- 2. Subtareas ----------

create table public.tarjeta_checks (
  id           uuid primary key default gen_random_uuid(),
  tarjeta_id   uuid not null references public.tarjetas (id) on delete cascade,
  texto        text not null
               constraint tarjeta_checks_texto_valido
               check (texto = btrim(texto)
                      and char_length(texto) between 1 and 200),
  hecho        boolean not null default false,
  persona_id   uuid references public.personas (id),
  fecha_limite date,
  -- Mismo esquema fraccional que tarjetas.posicion (007).
  posicion     numeric not null,
  creada_en    timestamptz not null default now()
);

create index tarjeta_checks_tarjeta_idx
  on public.tarjeta_checks (tarjeta_id, posicion);

-- ---------- 3. RLS ----------

-- ¿Puede esta persona editar la tarjeta? (creador, asignado o admin).
-- Mismo predicado que la policy tarjetas_update, en función para no
-- repetirlo en cada policy de los checks. Derechos del invocador: el
-- equipo ya puede leer tarjetas y asignaciones.
create or replace function public.puede_editar_tarjeta(t_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.tarjetas t
    where t.id = t_id
      and (t.creada_por = persona_actual_id()
           or es_admin()
           or exists (
             select 1 from public.tarjeta_asignaciones a
             where a.tarjeta_id = t.id
               and a.persona_id = persona_actual_id()
           ))
  );
$$;

alter table public.tarjeta_checks enable row level security;

create policy checks_select on public.tarjeta_checks
  for select to authenticated
  using (persona_actual_id() is not null);

create policy checks_insert on public.tarjeta_checks
  for insert to authenticated
  with check (puede_editar_tarjeta(tarjeta_id));

create policy checks_update on public.tarjeta_checks
  for update to authenticated
  using (
    puede_editar_tarjeta(tarjeta_id)
    or persona_id = persona_actual_id()
  )
  with check (
    puede_editar_tarjeta(tarjeta_id)
    or persona_id = persona_actual_id()
  );

create policy checks_delete on public.tarjeta_checks
  for delete to authenticated
  using (puede_editar_tarjeta(tarjeta_id));

commit;
