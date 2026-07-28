-- ============================================================
-- Migración 017: vacaciones
-- Ejecutar en: Supabase Dashboard → SQL Editor (después de 016)
--
-- Decisión (Javi, 28 jul 2026): cada persona apunta sus periodos de
-- vacaciones en su pestaña «Vacaciones» — directo, sin flujo de
-- aprobación, en línea con «calidad del dato, no control». Los admin
-- ven un calendario del equipo en el Resumen, y los días de vacaciones
-- dejan de contar como «días sin registro».
--
-- Modelo: un periodo = rango inclusivo [desde, hasta] con nota
-- opcional. Sin tipos de ausencia (solo vacaciones); si algún día se
-- amplía, se añade una columna tipo con default 'vacaciones' sin dolor.
-- Sin solapes por persona (restricción de exclusión): así el conteo de
-- días es una suma simple y sin duplicados.
-- ============================================================

begin;

-- ---------- 1. Extensión ----------

-- Para la restricción de exclusión persona + rango.
create extension if not exists btree_gist;

-- ---------- 2. Tabla ----------

create table public.vacaciones (
  id          uuid primary key default gen_random_uuid(),
  persona_id  uuid not null references public.personas (id) on delete cascade,
  -- Rango inclusivo: un solo día = desde = hasta.
  desde       date not null,
  hasta       date not null,
  -- '' = sin nota. Recortada y corta: es una aclaración, no un parte.
  nota        text not null default '',
  creada_en   timestamptz not null default now(),
  constraint vacaciones_rango_valido
    check (hasta >= desde and hasta - desde < 60),
  constraint vacaciones_nota_valida
    check (nota = btrim(nota) and char_length(nota) <= 120),
  -- Un mismo día no puede estar en dos periodos de la misma persona.
  constraint vacaciones_sin_solapes
    exclude using gist (
      persona_id with =,
      daterange(desde, hasta, '[]') with &&
    )
);

create index vacaciones_persona_idx on public.vacaciones (persona_id, desde);

-- ---------- 3. RLS ----------

-- Cada cual gestiona las suyas; los admin ven las de todo el equipo
-- (mismo patrón que horas). Sin policy de UPDATE a propósito: un
-- periodo se borra y se vuelve a crear (filas identidad, como
-- tarjeta_asignaciones).
alter table public.vacaciones enable row level security;

create policy vacaciones_select on public.vacaciones
  for select to authenticated
  using (persona_id = persona_actual_id() or es_admin());

create policy vacaciones_insert on public.vacaciones
  for insert to authenticated
  with check (persona_id = persona_actual_id());

create policy vacaciones_delete on public.vacaciones
  for delete to authenticated
  using (persona_id = persona_actual_id());

commit;
