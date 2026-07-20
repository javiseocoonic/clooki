-- ============================================================
-- Migración 011: aceptar cualquier palabra de 5 letras como intento
-- Ejecutar en: Supabase Dashboard → SQL Editor (después de 010)
--
-- La 010 validaba los intentos contra `wordle_palabras`, pero esa lista
-- (157) es a la vez el bote de respuestas Y el diccionario de intentos:
-- demasiado pequeña, así que casi cualquier palabra real que teclee el
-- usuario sale «no está en la lista» y el juego es injugable.
--
-- Un diccionario español de miles de palabras fiable no es práctico de
-- mantener a mano. Para un juego interno la decisión es aceptar cualquier
-- palabra bien formada (5 letras A–Z o Ñ) como intento; el bote de
-- respuestas sigue curado (las soluciones son siempre palabras reales).
-- Único coste: se puede sondear con no-palabras — irrelevante aquí.
--
-- Solo cambia wordle_intentar: se quita el bloque que devolvía
-- 'desconocida'. El resto (formato, aciertos, máximo de 6) intacto.
-- ============================================================

begin;

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
  -- Solo formato: 5 letras A–Z o Ñ. Ya no se exige que esté en el
  -- diccionario (cualquier palabra bien formada vale como intento).
  if char_length(v_norm) <> 5 or v_norm !~ '^[A-ZÑ]{5}$' then
    return jsonb_build_object('ok', false, 'motivo', 'formato');
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

commit;
