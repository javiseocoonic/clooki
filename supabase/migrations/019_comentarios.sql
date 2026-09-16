-- ============================================================
-- Migración 019: hilo de comentarios en las tarjetas + notificaciones
-- Ejecutar en: Supabase Dashboard → SQL Editor (después de 018)
--
-- Petición Javi (16 sep 2026):
-- 1. Debajo de la descripción de cada tarjeta, un hilo de conversación
--    al estilo de las subtareas donde escribir texto y mencionar a
--    compañeros con @.
-- 2. Una campana en la cabecera con el número de avisos y su lista:
--    «te han mencionado» y «te han asignado una tarjeta». Al pulsar uno
--    se abre la tarjeta (y el comentario) en el tablero.
--
-- Comentarios:
-- - `texto` guarda las menciones como «@Nombre Apellido» (legible tal
--   cual); `menciones` guarda los ids de las personas mencionadas.
-- - Leer, todo el equipo activo; escribir, cualquiera, firmando como sí
--   mismo; borrar, el autor o un admin. No hay edición.
--
-- Notificaciones:
-- - Las crean triggers (security definer): al insertar una asignación a
--   otra persona y al insertar un comentario con menciones. Nadie las
--   escribe desde la app; cada cual lee, marca leídas y borra las suyas.
-- - Sin persona autenticada (importador con clave de servicio) no se
--   generan: una migración masiva no debe disparar cientos de avisos.
-- ============================================================

begin;

-- ---------- 1. Comentarios ----------

create table public.tarjeta_comentarios (
  id          uuid primary key default gen_random_uuid(),
  tarjeta_id  uuid not null references public.tarjetas (id) on delete cascade,
  persona_id  uuid not null references public.personas (id),
  texto       text not null
              constraint tarjeta_comentarios_texto_valido
              check (texto = btrim(texto)
                     and char_length(texto) between 1 and 2000),
  menciones   uuid[] not null default '{}',
  creada_en   timestamptz not null default now()
);

create index tarjeta_comentarios_tarjeta_idx
  on public.tarjeta_comentarios (tarjeta_id, creada_en);

create index tarjeta_comentarios_menciones_idx
  on public.tarjeta_comentarios using gin (menciones);

alter table public.tarjeta_comentarios enable row level security;

create policy comentarios_select on public.tarjeta_comentarios
  for select to authenticated
  using (persona_actual_id() is not null);

create policy comentarios_insert on public.tarjeta_comentarios
  for insert to authenticated
  with check (persona_id = persona_actual_id());

create policy comentarios_delete on public.tarjeta_comentarios
  for delete to authenticated
  using (persona_id = persona_actual_id() or es_admin());

-- ---------- 2. Notificaciones ----------

create table public.notificaciones (
  id            uuid primary key default gen_random_uuid(),
  -- Destinataria.
  persona_id    uuid not null references public.personas (id) on delete cascade,
  tipo          text not null
                constraint notificaciones_tipo_valido
                check (tipo in ('mencion', 'asignacion')),
  tarjeta_id    uuid not null references public.tarjetas (id) on delete cascade,
  comentario_id uuid references public.tarjeta_comentarios (id) on delete cascade,
  -- Quien la provoca (menciona o asigna).
  origen_id     uuid references public.personas (id),
  creada_en     timestamptz not null default now(),
  leida_en      timestamptz
);

-- La campana lee «las mías, no leídas primero, recientes primero».
create index notificaciones_persona_idx
  on public.notificaciones (persona_id, leida_en, creada_en desc);

alter table public.notificaciones enable row level security;

create policy notificaciones_select on public.notificaciones
  for select to authenticated
  using (persona_id = persona_actual_id());

-- Solo se puede tocar leida_en de las propias (la app no cambia más).
create policy notificaciones_update on public.notificaciones
  for update to authenticated
  using (persona_id = persona_actual_id())
  with check (persona_id = persona_actual_id());

create policy notificaciones_delete on public.notificaciones
  for delete to authenticated
  using (persona_id = persona_actual_id());

-- Sin policy de insert a propósito: las crean los triggers.

-- 2a. Asignación → aviso a la persona asignada (si no es quien asigna).
create or replace function public.notificar_asignacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := persona_actual_id();
begin
  if actor is not null and new.persona_id <> actor then
    insert into public.notificaciones (persona_id, tipo, tarjeta_id, origen_id)
    values (new.persona_id, 'asignacion', new.tarjeta_id, actor);
  end if;
  return new;
end;
$$;

create trigger tarjeta_asignaciones_notificar
  after insert on public.tarjeta_asignaciones
  for each row
  execute function public.notificar_asignacion();

-- 2b. Comentario con menciones → aviso a cada mencionada (salvo el autor).
create or replace function public.notificar_menciones()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  mencionada uuid;
begin
  foreach mencionada in array new.menciones loop
    if mencionada <> new.persona_id then
      insert into public.notificaciones
        (persona_id, tipo, tarjeta_id, comentario_id, origen_id)
      values
        (mencionada, 'mencion', new.tarjeta_id, new.id, new.persona_id);
    end if;
  end loop;
  return new;
end;
$$;

create trigger tarjeta_comentarios_notificar
  after insert on public.tarjeta_comentarios
  for each row
  execute function public.notificar_menciones();

commit;
