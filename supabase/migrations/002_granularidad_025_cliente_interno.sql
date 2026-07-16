-- ============================================================
-- Migración 002: granularidad de horas a 0,25 + cliente interno
-- Ejecutar en: Supabase Dashboard → SQL Editor (después de 001)
-- ============================================================

-- ---------- 1. Horas en pasos de 0,25 ----------
-- numeric(4,1) no puede almacenar 1,25 → pasa a numeric(5,2).
-- Todos los datos existentes (múltiplos de 0,5) son múltiplos de 0,25.

alter table public.horas
  alter column horas type numeric(5, 2);

alter table public.horas
  drop constraint horas_horas_check;

alter table public.horas
  add constraint horas_horas_check
  check (horas > 0 and horas <= 24 and mod(horas, 0.25) = 0);

-- ---------- 2. Cliente interno ----------
-- Cajón legítimo para trabajo no imputable a clientes reales.
-- El futuro Resumen lo excluye del análisis de rentabilidad.

insert into public.clientes (nombre)
select 'Coonic (interno)'
where not exists (
  select 1 from public.clientes where nombre = 'Coonic (interno)'
);

insert into public.proyectos (cliente_id, nombre)
select c.id, p.nombre
from public.clientes c
cross join (values
  ('Gestión interna'),
  ('Formación'),
  ('Comercial')
) as p (nombre)
where c.nombre = 'Coonic (interno)'
  and not exists (
    select 1 from public.proyectos pr
    where pr.cliente_id = c.id and pr.nombre = p.nombre
  );
