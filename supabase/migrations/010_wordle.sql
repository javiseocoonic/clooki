-- ============================================================
-- Migración 010: motor del Wordle semanal (fase Cuco, W·2)
-- Ejecutar en: Supabase Dashboard → SQL Editor (después de 009)
--
-- Diseño (roadmap-wordle.md §3):
-- - Tres tablas: `wordle_palabras` (pool de respuestas Y diccionario de
--   intentos válidos), `wordle_semanas` (la palabra elegida por semana,
--   fijada al primer juego para que reordenar la lista NO altere el
--   historial) y `wordle_partidas` (los intentos de cada persona).
-- - Las tres van con RLS y SIN políticas, y ADEMÁS se revoca todo acceso
--   directo a anon/authenticated: la ÚNICA vía de tocarlas es a través
--   de las funciones SECURITY DEFINER de abajo, que corren como su dueño
--   (bypass de RLS) y validan todo. Así:
--     · la palabra nunca viaja al navegador hasta terminar la partida
--       (wordle_semanas no es legible por el cliente ni por la REST API);
--     · no se puede falsear una partida escribiendo en la tabla (denegado)
--       — todo pasa por wordle_intentar, que comprueba diccionario,
--       aciertos y el máximo de 6 intentos.
-- - «Hoy» y el lunes de la semana se calculan en Europe/Madrid (equipo en
--   Málaga; la BD corre en UTC), igual que el candado de la 009.
-- - El desbloqueo (L–V con registro) se comprueba en servidor contra
--   `horas`, no en el cliente.
-- ============================================================

begin;

-- ---------- 1. Tablas ----------

create table public.wordle_palabras (
  palabra text primary key
          constraint wordle_palabra_valida
          check (palabra = upper(palabra) and palabra ~ '^[A-ZÑ]{5}$')
);

create table public.wordle_semanas (
  semana    date primary key,          -- lunes ISO de la semana
  palabra   text not null references public.wordle_palabras (palabra),
  creada_en timestamptz not null default now()
);

create table public.wordle_partidas (
  persona_id   uuid not null references public.personas (id),
  semana       date not null references public.wordle_semanas (semana),
  intentos     jsonb not null default '[]'::jsonb,  -- palabras probadas, en orden
  resuelta     boolean not null default false,
  terminada_en timestamptz,                          -- al resolver o agotar los 6
  primary key (persona_id, semana)
);

-- Ranking mensual (W·4): las partidas de una semana / mes.
create index wordle_partidas_semana_idx on public.wordle_partidas (semana);

-- ---------- 2. RLS: denegar todo acceso directo ----------
-- Sin políticas + revoke: nadie llega a estas tablas salvo las funciones
-- SECURITY DEFINER (que corren como el dueño y saltan la RLS).

alter table public.wordle_palabras enable row level security;
alter table public.wordle_semanas  enable row level security;
alter table public.wordle_partidas enable row level security;

revoke all on public.wordle_palabras from anon, authenticated;
revoke all on public.wordle_semanas  from anon, authenticated;
revoke all on public.wordle_partidas from anon, authenticated;

-- ---------- 3. Semilla del diccionario ----------
-- Lista curada de palabras españolas de 5 letras, sin tildes, con Ñ
-- (convención del Wordle en español). Es un dato vivo: el equipo puede
-- ampliarla con más migraciones. Incluye algunas temáticas de agencia de
-- dificultad media-alta (decisión del cliente).

insert into public.wordle_palabras (palabra) values
  ('PERRO'), ('GATOS'), ('CASAS'), ('MESAS'), ('PLATO'), ('VASOS'), ('LIBRO'), ('CARTA'), ('PAPEL'), ('FUEGO'),
  ('CIELO'), ('NUBES'), ('NIEVE'), ('PLAYA'), ('MONTE'), ('VERDE'), ('NEGRO'), ('ROJOS'), ('CALOR'), ('NOCHE'),
  ('TARDE'), ('LUNES'), ('JUNIO'), ('JULIO'), ('MARZO'), ('ABRIL'), ('BANCO'), ('COCHE'), ('MOTOR'), ('RUEDA'),
  ('CALLE'), ('PLAZA'), ('CAMPO'), ('ARBOL'), ('FRUTA'), ('PERAS'), ('MANGO'), ('LIMON'), ('MELON'), ('PECES'),
  ('PATOS'), ('VACAS'), ('CABRA'), ('OVEJA'), ('CERDO'), ('POLLO'), ('HUEVO'), ('LECHE'), ('QUESO'), ('PASTA'),
  ('ARROZ'), ('CARNE'), ('DULCE'), ('SALSA'), ('CAFES'), ('TAZAS'), ('VINOS'), ('COPAS'), ('BOTAS'), ('GORRA'),
  ('FALDA'), ('TRAJE'), ('MANGA'), ('TELAS'), ('LANAS'), ('SEDAS'), ('CUERO'), ('METAL'), ('PLOMO'), ('PLATA'),
  ('COBRE'), ('ARENA'), ('BARRO'), ('POLVO'), ('LLAMA'), ('RAYOS'), ('MAREA'), ('COSTA'), ('ISLAS'), ('LAGOS'),
  ('POZOS'), ('RIEGO'), ('TRIGO'), ('AVENA'), ('HOJAS'), ('RAMAS'), ('TALLO'), ('GRANO'), ('FLACO'), ('GORDO'),
  ('ALTOS'), ('BAJOS'), ('LARGO'), ('CORTO'), ('NUEVO'), ('VIEJO'), ('JOVEN'), ('LENTO'), ('SUAVE'), ('DUROS'),
  ('SUCIO'), ('LLENO'), ('VACIO'), ('CLARO'), ('FELIZ'), ('VALOR'), ('MIEDO'), ('RISAS'), ('BESOS'), ('MANOS'),
  ('DEDOS'), ('BRAZO'), ('PECHO'), ('PISOS'), ('TECHO'), ('PARED'), ('LLAVE'), ('SILLA'), ('CAMAS'), ('SOFAS'),
  ('RELOJ'), ('GRUPO'), ('JUEGO'), ('DEBER'), ('VECES'), ('GENTE'), ('MUNDO'), ('LUGAR'), ('FORMA'), ('PARTE'),
  ('MARCA'), ('VIDEO'), ('PAUTA'), ('VALLA'), ('LOGOS'), ('COLOR'), ('TEXTO'), ('REDES'), ('FOTOS'), ('VOCES'),
  ('IDEAS'), ('PLANO'), ('GUION'), ('CROMA'), ('PUÑOS'), ('CAÑAS'), ('NIÑOS'), ('SUEÑO'), ('BAÑOS'), ('PEÑAS'),
  ('AÑADE'), ('LEÑAS'), ('MOÑOS'), ('RIÑON'), ('DUEÑO'), ('SUENA'), ('CANAS')
on conflict (palabra) do nothing;

-- ---------- 4. Pistas (colores) — dos pasadas ----------
-- Devuelve un array de 5: 'correcto' (verde), 'presente' (amarillo) o
-- 'ausente' (gris). Verdes primero; los amarillos se limitan a las letras
-- del secreto aún sin consumir (manejo correcto de letras repetidas).
-- Consumir = marcar NULL en `resto`: array_position nunca casa un NULL.

create or replace function public.wordle_pistas(p_secreto text, p_intento text)
returns jsonb
language plpgsql
immutable
as $$
declare
  s    text[] := regexp_split_to_array(p_secreto, '');
  g    text[] := regexp_split_to_array(p_intento, '');
  res  text[] := array['ausente','ausente','ausente','ausente','ausente'];
  resto text[] := '{}';
  i    int;
  pos  int;
begin
  for i in 1..5 loop
    if g[i] = s[i] then
      res[i] := 'correcto';
    else
      resto := array_append(resto, s[i]);
    end if;
  end loop;
  for i in 1..5 loop
    if res[i] <> 'correcto' then
      pos := array_position(resto, g[i]);
      if pos is not null then
        res[i] := 'presente';
        resto[pos] := '';  -- tumba: '' nunca casa con una letra
      end if;
    end if;
  end loop;
  return to_jsonb(res);
end;
$$;

-- ---------- 5. Utilidades internas ----------

-- Normaliza un intento: mayúsculas, sin tildes, conservando la Ñ.
create or replace function public.wordle_normaliza(p_texto text)
returns text
language sql
immutable
as $$
  select translate(
    upper(btrim(p_texto)),
    'ÁÉÍÓÚÀÈÌÒÙÄËÏÖÜÂÊÎÔÛ',
    'AEIOUAEIOUAEIOUAEIOU'
  );
$$;

-- Lunes ISO de la semana actual en Madrid.
create or replace function public.wordle_lunes_actual()
returns date
language sql
stable
as $$
  select (d - (extract(isodow from d)::int - 1))
  from (select (now() at time zone 'Europe/Madrid')::date as d) t;
$$;

-- Elige (idempotente) la palabra de una semana. Determinista por semana
-- y común a todo el equipo; fijada al primer juego para no cambiar si la
-- lista se reordena luego.
create or replace function public.wordle_asegura_semana(p_lunes date)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_palabra text;
begin
  insert into wordle_semanas (semana, palabra)
  select p_lunes,
         (select palabra from wordle_palabras
          order by md5(palabra || p_lunes::text) limit 1)
  on conflict (semana) do nothing;
  select palabra into v_palabra from wordle_semanas where semana = p_lunes;
  return v_palabra;
end;
$$;

-- ---------- 6. Estado del juego para el usuario actual ----------

create or replace function public.wordle_estado()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_persona   uuid := persona_actual_id();
  v_lunes     date := wordle_lunes_actual();
  v_completos int;
  v_palabra   text;
  v_intentos  jsonb;
  v_resuelta  boolean;
  v_pistas    jsonb := '[]'::jsonb;
  v_usados    int;
  v_terminada boolean;
  r           record;
begin
  if v_persona is null then
    raise exception 'Sin sesión';
  end if;

  select count(distinct fecha) into v_completos
  from horas
  where persona_id = v_persona and fecha between v_lunes and v_lunes + 4;

  if v_completos < 5 then
    return jsonb_build_object(
      'semana', v_lunes,
      'desbloqueado', false,
      'dias_completos', v_completos,
      'max_intentos', 6
    );
  end if;

  v_palabra := wordle_asegura_semana(v_lunes);

  select intentos, resuelta into v_intentos, v_resuelta
  from wordle_partidas
  where persona_id = v_persona and semana = v_lunes;

  if v_intentos is null then
    v_intentos := '[]'::jsonb;
    v_resuelta := false;
  end if;

  for r in select value from jsonb_array_elements_text(v_intentos) loop
    v_pistas := v_pistas || jsonb_build_array(jsonb_build_object(
      'palabra', r.value,
      'pistas', wordle_pistas(v_palabra, r.value)
    ));
  end loop;

  v_usados := jsonb_array_length(v_intentos);
  v_terminada := v_resuelta or v_usados >= 6;

  return jsonb_build_object(
    'semana', v_lunes,
    'desbloqueado', true,
    'dias_completos', 5,
    'max_intentos', 6,
    'intentos', v_pistas,
    'usados', v_usados,
    'estado', case when v_resuelta then 'ganada'
                   when v_usados >= 6 then 'perdida'
                   else 'en_curso' end,
    -- La palabra solo se revela cuando la partida ha terminado.
    'palabra', case when v_terminada then v_palabra else null end
  );
end;
$$;

-- ---------- 7. Registrar un intento ----------

create or replace function public.wordle_intentar(p_palabra text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_persona   uuid := persona_actual_id();
  v_lunes     date := wordle_lunes_actual();
  v_completos int;
  v_norm      text;
  v_palabra   text;
  v_intentos  jsonb;
  v_resuelta  boolean;
  v_usados    int;
  v_pistas    jsonb;
  v_acierto   boolean;
  v_terminada boolean;
begin
  if v_persona is null then
    raise exception 'Sin sesión';
  end if;

  select count(distinct fecha) into v_completos
  from horas
  where persona_id = v_persona and fecha between v_lunes and v_lunes + 4;
  if v_completos < 5 then
    raise exception 'Aún no has desbloqueado el Wordle de esta semana';
  end if;

  v_norm := wordle_normaliza(p_palabra);
  if char_length(v_norm) <> 5 or v_norm !~ '^[A-ZÑ]{5}$' then
    return jsonb_build_object('ok', false, 'motivo', 'formato');
  end if;
  if not exists (select 1 from wordle_palabras where palabra = v_norm) then
    return jsonb_build_object('ok', false, 'motivo', 'desconocida');
  end if;

  v_palabra := wordle_asegura_semana(v_lunes);

  insert into wordle_partidas (persona_id, semana)
  values (v_persona, v_lunes)
  on conflict (persona_id, semana) do nothing;

  select intentos, resuelta into v_intentos, v_resuelta
  from wordle_partidas
  where persona_id = v_persona and semana = v_lunes
  for update;

  v_usados := jsonb_array_length(v_intentos);
  if v_resuelta or v_usados >= 6 then
    raise exception 'La partida de esta semana ya ha terminado';
  end if;

  v_pistas := wordle_pistas(v_palabra, v_norm);
  v_acierto := (v_norm = v_palabra);
  v_intentos := v_intentos || to_jsonb(v_norm);
  v_usados := v_usados + 1;
  v_terminada := v_acierto or v_usados >= 6;

  update wordle_partidas
  set intentos = v_intentos,
      resuelta = v_acierto,
      terminada_en = case when v_terminada then now() else terminada_en end
  where persona_id = v_persona and semana = v_lunes;

  return jsonb_build_object(
    'ok', true,
    'palabra_intentada', v_norm,
    'pistas', v_pistas,
    'usados', v_usados,
    'estado', case when v_acierto then 'ganada'
                   when v_usados >= 6 then 'perdida'
                   else 'en_curso' end,
    'palabra', case when v_terminada then v_palabra else null end
  );
end;
$$;

-- Cerrar los helpers: por defecto Postgres concede EXECUTE a PUBLIC, y
-- wordle_asegura_semana DEVUELVE LA PALABRA SECRETA — sin este revoke,
-- cualquier autenticado la sacaría llamándola directamente. Los helpers
-- se siguen usando desde dentro de las RPC (que corren como su dueño).
revoke execute on function public.wordle_pistas(text, text) from public;
revoke execute on function public.wordle_normaliza(text) from public;
revoke execute on function public.wordle_lunes_actual() from public;
revoke execute on function public.wordle_asegura_semana(date) from public;

-- Exponer solo las dos RPC del jugador, y solo a usuarios autenticados.
revoke execute on function public.wordle_estado() from public;
revoke execute on function public.wordle_intentar(text) from public;
grant execute on function public.wordle_estado() to authenticated;
grant execute on function public.wordle_intentar(text) to authenticated;

commit;
