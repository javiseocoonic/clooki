-- ============================================================
-- Clooki · Semilla del MVP
-- Ejecutar DESPUÉS de 001_esquema_rls.sql
-- Sustituye los datos de EJEMPLO por los clientes/proyectos/personas
-- reales de Coonic antes de (o después de) ejecutar — se pueden
-- gestionar también desde la pantalla de Gestión una vez construida.
-- ============================================================

-- ---------- Personas ----------
-- IMPORTANTE: el email debe coincidir con el del login (magic link).
insert into public.personas (nombre, email, rol) values
  ('Ignacio Luque',      'iluque@coonic.com',     'admin'),
  ('Javier Fernández',   'jfernandez@coonic.com', 'admin'),
  ('Kary Whaite',        'kwhaite@coonic.com',    'admin'),
  ('Alejandro Cerezo',   'acerezo@coonic.com',    'miembro'),
  ('Elizabet Belda',     'ebelda@coonic.com',     'miembro'),
  ('Maria Luisa Gomez',  'mlgomez@coonic.com',    'miembro'),
  ('Alice Berthoud',     'aberthoud@coonic.com',  'miembro'),
  ('Norberto Obregon',   'nobregon@coonic.com',   'miembro'),
  ('Carlos Ramirez',     'cramirez@coonic.com',   'miembro'),
  ('Pablo Marinetto',    'pmarinetto@coonic.com', 'miembro'),
  ('Maria Delgado',      'mdelgado@coonic.com',   'miembro'),
  ('Nacho Rubio',        'irubio@coonic.com',     'miembro'),
  ('Laura Quintero',     'lquintero@coonic.com',  'miembro');

-- ---------- Clientes ----------
insert into public.clientes (nombre) values
  ('Viamed'),
  ('Ayuntamiento de Málaga'),
  ('El Ingenio'),
  ('Cervezas Victoria'),
  ('Alphabio Iberia'),
  ('Peña Juan Breva'),
  ('Academia Gastronómica'),
  ('Fesempla'),
  ('Faeplayas'),
  ('Limasam');

-- ---------- Proyectos/tareas ----------
-- Mismos proyectos/tareas comunes para todos los clientes. Se pueden
-- ajustar o ampliar por cliente desde la pantalla de Gestión (admin).
insert into public.proyectos (cliente_id, nombre)
select c.id, p.nombre
from public.clientes c
cross join (values
  ('Desarrollo web'),
  ('RRSS'),
  ('Prensa'),
  ('Consultoría'),
  ('Contenidos')
) as p (nombre);

-- ---------- Cliente interno (añadido en migración 002; aquí para
-- instalaciones desde cero) ----------
insert into public.clientes (nombre)
select 'Coonic (interno)'
where not exists (select 1 from public.clientes where nombre = 'Coonic (interno)');

insert into public.proyectos (cliente_id, nombre)
select c.id, p.nombre
from public.clientes c
cross join (values ('Gestión interna'), ('Formación'), ('Comercial')) as p (nombre)
where c.nombre = 'Coonic (interno)'
  and not exists (
    select 1 from public.proyectos pr
    where pr.cliente_id = c.id and pr.nombre = p.nombre
  );
