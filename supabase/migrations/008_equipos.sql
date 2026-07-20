-- ============================================================
-- Migración 008: equipos de trabajo
-- Ejecutar en: Supabase Dashboard → SQL Editor (después de 007)
--
-- Cada persona puede pertenecer a 0..n equipos de trabajo (decisión
-- del cliente, jul 2026): contenidos y rrss, diseño, audiovisual,
-- desarrollo y prácticas. Lista cerrada en un check (mismo patrón que
-- tarjetas.estado): añadir un equipo = migración + lista en
-- src/lib/equipos.ts. Sin tabla catálogo a propósito — no hay gestión
-- de equipos, solo pertenencia, que se asigna en Gestión → Personas.
--
-- La pertenencia alimenta el filtro por equipo del tablero /tareas:
-- una tarjeta «es» de un equipo si alguna persona asignada pertenece.
-- ============================================================

begin;

create table public.persona_equipos (
  persona_id uuid not null references public.personas (id) on delete cascade,
  equipo     text not null
             constraint persona_equipos_equipo_valido
             check (equipo in (
               'contenidos_rrss',
               'diseno',
               'audiovisual',
               'desarrollo',
               'practicas'
             )),
  primary key (persona_id, equipo)
);

-- El filtro del tablero pregunta «¿quién está en este equipo?».
create index persona_equipos_equipo_idx
  on public.persona_equipos (equipo);

-- RLS: la pertenencia la ve todo el equipo activo (el filtro del
-- tablero la necesita entera); la escribe solo admin (Gestión).
alter table public.persona_equipos enable row level security;

create policy persona_equipos_select on public.persona_equipos
  for select to authenticated
  using (persona_actual_id() is not null);

create policy persona_equipos_insert_admin on public.persona_equipos
  for insert to authenticated
  with check (es_admin());

create policy persona_equipos_delete_admin on public.persona_equipos
  for delete to authenticated
  using (es_admin());

-- Sin policy de UPDATE a propósito: filas (persona, equipo) puras —
-- se crean y se borran, nunca se editan (como tarjeta_asignaciones).

commit;
