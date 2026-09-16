-- ============================================================
-- Migración 019: hilo de comentarios en las tarjetas
-- Ejecutar en: Supabase Dashboard → SQL Editor (después de 018)
--
-- Petición Javi (16 sep 2026): debajo de la descripción de cada
-- tarjeta, un hilo de conversación al estilo de las subtareas donde
-- escribir texto y mencionar a compañeros con @.
--
-- - `texto` guarda las menciones como «@Nombre Apellido» (legible tal
--   cual); `menciones` guarda los ids de las personas mencionadas para
--   poder consultarlas sin parsear texto («tarjetas donde me nombran»).
-- - Leer, todo el equipo activo (transparencia del tablero, como las
--   tarjetas). Escribir, cualquiera que pueda leer la tarjeta, firmando
--   como sí mismo. Borrar, el autor o un admin. No hay edición: un
--   comentario se borra y se vuelve a escribir.
-- ============================================================

begin;

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

-- El hilo se lee por tarjeta y en orden cronológico.
create index tarjeta_comentarios_tarjeta_idx
  on public.tarjeta_comentarios (tarjeta_id, creada_en);

-- «Tarjetas donde me mencionan».
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

commit;
