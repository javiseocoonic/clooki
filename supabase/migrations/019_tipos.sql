-- ============================================================
-- Migración 019: catálogo de tipos de proyecto
-- Ejecutar en: Supabase Dashboard → SQL Editor (después de 018)
--
-- Hasta ahora cada cliente tenía sus «proyectos» como texto libre
-- (Diseño, Audiovisual, RRSS…), con el resultado previsible: variantes
-- del mismo nombre («Gestión redes sociales» / «Gestión de redes
-- sociales», «Desarollo web»). Decisión Javi (16 sep 2026): los tipos
-- son UN catálogo común para todos los clientes, solo los admin añaden
-- tipos, y cada cliente marca con una casilla cuáles tiene activos.
--
-- Modelo: `tipos` es el catálogo; `proyectos` sigue siendo la fila
-- (cliente × tipo) a la que enlazan horas, cronómetros, tarjetas y
-- líneas ocultas, así que NO se toca su clave. Se le añade `tipo_id`
-- y se mantiene `nombre` como copia del nombre del tipo (todas las
-- pantallas lo leen de ahí). Casilla marcada = fila en proyectos con
-- activo = true; desmarcar solo pone activo = false (nunca se borra:
-- las horas cuelgan de ella).
-- ============================================================

begin;

-- ---------- 1. Catálogo ----------

create table public.tipos (
  id        uuid primary key default gen_random_uuid(),
  nombre    text not null unique
            constraint tipos_nombre_valido
            check (nombre = btrim(nombre)
                   and char_length(nombre) between 1 and 60),
  activo    boolean not null default true,
  creada_en timestamptz not null default now()
);

-- ---------- 2. Normalizar nombres existentes ----------
-- Variantes que se funden en un nombre canónico. Si el cliente ya tiene
-- el canónico, lo que cuelga de la variante se repunta y la variante se
-- borra; si no, la variante se renombra.

create temp table variantes (viejo text, nuevo text) on commit drop;
insert into variantes values
  ('Gestión redes sociales', 'Gestión de redes sociales'),
  ('Desarollo web',          'Desarrollo web'),
  ('Desarr',                 'Desarrollo web');

-- 2a. Clientes con variante Y canónico: repuntar y borrar la variante.
create temp table fusiones on commit drop as
select v.id as viejo_id, c.id as nuevo_id
from public.proyectos v
join variantes va on va.viejo = v.nombre
join public.proyectos c
  on c.cliente_id = v.cliente_id and c.nombre = va.nuevo;

update public.horas h set proyecto_id = f.nuevo_id
  from fusiones f where h.proyecto_id = f.viejo_id;
update public.cronometros s set proyecto_id = f.nuevo_id
  from fusiones f where s.proyecto_id = f.viejo_id;
update public.tarjetas t set proyecto_id = f.nuevo_id
  from fusiones f where t.proyecto_id = f.viejo_id;
-- Líneas ocultas (015): clave (persona, semana, proyecto, tarea); si ya
-- existe la misma línea en el canónico, la duplicada sobra.
delete from public.lineas_ocultas lo
  using fusiones f
  where lo.proyecto_id = f.viejo_id
    and exists (
      select 1 from public.lineas_ocultas x
      where x.persona_id = lo.persona_id
        and x.semana = lo.semana
        and x.proyecto_id = f.nuevo_id
        and x.tarea = lo.tarea
    );
update public.lineas_ocultas lo set proyecto_id = f.nuevo_id
  from fusiones f where lo.proyecto_id = f.viejo_id;

delete from public.proyectos p using fusiones f where p.id = f.viejo_id;

-- 2b. El resto de variantes: renombrar.
update public.proyectos p set nombre = va.nuevo
  from variantes va where p.nombre = va.viejo;

-- ---------- 3. Sembrar el catálogo con lo que hay ----------

insert into public.tipos (nombre)
select distinct nombre from public.proyectos
order by nombre;

-- ---------- 4. Enlazar proyectos con su tipo ----------

alter table public.proyectos
  add column tipo_id uuid references public.tipos (id);

update public.proyectos p set tipo_id = t.id
  from public.tipos t where t.nombre = p.nombre;

alter table public.proyectos alter column tipo_id set not null;

-- Un cliente tiene cada tipo como mucho una vez.
create unique index proyectos_cliente_tipo_uidx
  on public.proyectos (cliente_id, tipo_id);

-- ---------- 5. RLS ----------
-- Leer, todo el equipo activo (la pantalla de Gestión es solo admin,
-- pero el catálogo no es secreto). Escribir, solo admin.

alter table public.tipos enable row level security;

create policy tipos_select on public.tipos
  for select to authenticated
  using (persona_actual_id() is not null or es_admin());

create policy tipos_insert_admin on public.tipos
  for insert to authenticated
  with check (es_admin());

create policy tipos_update_admin on public.tipos
  for update to authenticated
  using (es_admin())
  with check (es_admin());

create policy tipos_delete_admin on public.tipos
  for delete to authenticated
  using (es_admin());

commit;
