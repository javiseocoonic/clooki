-- ============================================================
-- Migración 007: tablero de tareas (tarjetas + asignaciones)
-- Ejecutar en: Supabase Dashboard → SQL Editor (después de 006)
--
-- Modelo (roadmap-tareas.md §2):
-- - El tablero no inventa estructura: columna = cliente, tarjeta =
--   proyecto + título. `titulo` comparte límite con `horas.tarea`
--   (120, recortado) porque al llevar la tarjeta a Mi semana el título
--   SE COPIA como tarea de línea (vínculo por copia, no por FK).
-- - Asignación múltiple (decisión 18 jul): tabla de unión
--   `tarjeta_asignaciones`; cero filas = backlog del cliente.
--   Autoasignarse es un insert idempotente — dos personas «cogiéndola»
--   a la vez es un resultado válido, no una carrera.
-- - `hecha_en` existe porque el autoarchivado (30 días tras Hecha,
--   decisión §7.2) necesita saber CUÁNDO se hizo; `actualizado_en` no
--   sirve: cualquier edición posterior reiniciaría el reloj.
-- - `actualizado_en` (no «actualizada») para reutilizar el trigger
--   tocar_actualizado_en() de la 001, que fija esa columna por nombre.
-- - `posicion` fraccional: mover = media entre vecinas. Insertar con
--   saltos grandes (1024) y renumerar la columna cuando la diferencia
--   entre vecinas baje del umbral (lo hace la capa de datos, no la BD).
-- ============================================================

begin;

-- ---------- 1. Tablas ----------

create table public.tarjetas (
  id             uuid primary key default gen_random_uuid(),
  proyecto_id    uuid not null references public.proyectos (id),
  titulo         text not null
                 constraint tarjetas_titulo_valido
                 check (titulo = btrim(titulo)
                        and char_length(titulo) between 1 and 120),
  descripcion    text,
  creada_por     uuid not null references public.personas (id),
  estado         text not null default 'pendiente'
                 constraint tarjetas_estado_valido
                 check (estado in ('pendiente', 'en_curso', 'hecha')),
  posicion       numeric not null,
  hecha_en       timestamptz,
  creada_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table public.tarjeta_asignaciones (
  tarjeta_id uuid not null references public.tarjetas (id) on delete cascade,
  persona_id uuid not null references public.personas (id),
  primary key (tarjeta_id, persona_id)
);

-- ---------- 2. Índices ----------

-- El tablero ordena dentro de columna; la columna se deriva del proyecto.
create index tarjetas_proyecto_idx
  on public.tarjetas (proyecto_id, posicion);

-- «Mis tareas» (T·3): las tarjetas de una persona.
create index tarjeta_asignaciones_persona_idx
  on public.tarjeta_asignaciones (persona_id);

-- ---------- 3. Triggers ----------

create trigger tarjetas_actualizado_en
  before update on public.tarjetas
  for each row
  execute function public.tocar_actualizado_en();

-- hecha_en acompaña al estado: se fija al entrar en 'hecha' (si no lo
-- estaba ya) y se limpia al salir. Así el reloj del autoarchivado no se
-- reinicia por ediciones posteriores ni sobrevive a una reapertura.
create or replace function public.tocar_hecha_en()
returns trigger
language plpgsql
as $$
begin
  if new.estado = 'hecha' then
    -- Ifs anidados a propósito: en un INSERT, OLD no existe y el orden
    -- de evaluación de un OR no está garantizado en PL/pgSQL.
    if tg_op = 'INSERT' then
      new.hecha_en := now();
    elsif old.estado is distinct from 'hecha' then
      new.hecha_en := now();
    end if;
  else
    new.hecha_en := null;
  end if;
  return new;
end;
$$;

create trigger tarjetas_hecha_en
  before insert or update on public.tarjetas
  for each row
  execute function public.tocar_hecha_en();

-- ---------- 4. RLS ----------
-- Transparencia del tablero: todo el equipo activo lo lee entero.
-- Escribir es más fino: crear cualquiera (como sí mismo); editar el
-- creador, cualquier asignado o admin; borrar solo creador o admin.

alter table public.tarjetas enable row level security;
alter table public.tarjeta_asignaciones enable row level security;

create policy tarjetas_select on public.tarjetas
  for select to authenticated
  using (persona_actual_id() is not null);

create policy tarjetas_insert on public.tarjetas
  for insert to authenticated
  with check (creada_por = persona_actual_id());

create policy tarjetas_update on public.tarjetas
  for update to authenticated
  using (
    creada_por = persona_actual_id()
    or es_admin()
    or exists (
      select 1 from public.tarjeta_asignaciones a
      where a.tarjeta_id = tarjetas.id
        and a.persona_id = persona_actual_id()
    )
  )
  with check (
    creada_por = persona_actual_id()
    or es_admin()
    or exists (
      select 1 from public.tarjeta_asignaciones a
      where a.tarjeta_id = tarjetas.id
        and a.persona_id = persona_actual_id()
    )
  );

create policy tarjetas_delete on public.tarjetas
  for delete to authenticated
  using (creada_por = persona_actual_id() or es_admin());

create policy asignaciones_select on public.tarjeta_asignaciones
  for select to authenticated
  using (persona_actual_id() is not null);

-- Asignar: a ti mismo cualquiera («la cojo yo»); a otros, el creador de
-- la tarjeta o un admin (cubre el «asignar al crear» del roadmap).
create policy asignaciones_insert on public.tarjeta_asignaciones
  for insert to authenticated
  with check (
    persona_id = persona_actual_id()
    or es_admin()
    or exists (
      select 1 from public.tarjetas t
      where t.id = tarjeta_asignaciones.tarjeta_id
        and t.creada_por = persona_actual_id()
    )
  );

-- Quitarse uno mismo cualquiera; quitar a otros, creador o admin.
create policy asignaciones_delete on public.tarjeta_asignaciones
  for delete to authenticated
  using (
    persona_id = persona_actual_id()
    or es_admin()
    or exists (
      select 1 from public.tarjetas t
      where t.id = tarjeta_asignaciones.tarjeta_id
        and t.creada_por = persona_actual_id()
    )
  );

-- Sin policy de UPDATE en asignaciones a propósito: sus filas son
-- (tarjeta, persona) puros — se crean y se borran, nunca se editan.

-- ---------- 5. personas: lectura de equipo ----------
-- El tablero muestra a quién está asignada cada tarjeta y permite
-- asignar a cualquiera, así que el equipo necesita leer las personas
-- activas. La policy de 001 limitaba a «tu propia fila o admin»; pasa a
-- la misma forma que clientes/proyectos: filas activas para el equipo,
-- todo para admin (Gestión lista también inactivas), y tu propia fila
-- siempre (aunque estés inactivo: el login la comprueba).
-- Deliberado: nombre/email/rol de compañeros no son datos sensibles en
-- una herramienta interna de 10-25 personas.

drop policy personas_select on public.personas;
create policy personas_select on public.personas
  for select to authenticated
  using (
    email = lower(auth.jwt() ->> 'email')
    or (activo and persona_actual_id() is not null)
    or es_admin()
  );

commit;
