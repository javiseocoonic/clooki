-- ============================================================
-- Migración 015: ocultación persistente de líneas recordadas
-- Ejecutar en: Supabase Dashboard → SQL Editor (después de 014)
--
-- Bug (Javi, 23 jul 2026): la papelera sobre una línea sin horas solo
-- la ocultaba en estado local — al recargar reaparecía, porque las
-- líneas «recordadas» se derivan de las horas de las últimas 6 semanas
-- (mi-semana.ts). Incluso borrando las horas de la semana visible, las
-- de semanas pasadas resucitaban la línea.
--
-- Arreglo: la ocultación se persiste por (persona, semana, línea). Al
-- cargar, una línea oculta no se recuerda — pero si tiene horas ESTA
-- semana o un cronómetro en marcha, esas fuentes mandan y se muestra.
-- Volver a añadir la línea retira la ocultación.
-- ============================================================

begin;

create table public.lineas_ocultas (
  persona_id  uuid not null references public.personas (id) on delete cascade,
  -- Lunes ISO de la semana en la que se ocultó.
  semana      date not null,
  proyecto_id uuid not null references public.proyectos (id),
  -- '' = línea sin tarea; forma parte de la identidad (como en horas).
  tarea       text not null default '',
  primary key (persona_id, semana, proyecto_id, tarea)
);

-- RLS: la ocultación es personal — cada cual ve y toca solo la suya.
alter table public.lineas_ocultas enable row level security;

create policy lineas_ocultas_select on public.lineas_ocultas
  for select to authenticated
  using (persona_id = persona_actual_id());

create policy lineas_ocultas_insert on public.lineas_ocultas
  for insert to authenticated
  with check (persona_id = persona_actual_id());

create policy lineas_ocultas_delete on public.lineas_ocultas
  for delete to authenticated
  using (persona_id = persona_actual_id());

-- Sin policy de UPDATE a propósito: filas identidad puras, se crean y
-- se borran (mismo criterio que tarjeta_asignaciones).

commit;
