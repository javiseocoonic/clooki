-- ============================================================
-- Migración 012: ranking mensual del Wordle (fase Cuco, W·4)
-- Ejecutar en: Supabase Dashboard → SQL Editor (después de 011)
--
-- Reglas cerradas con el cliente (roadmap-wordle.md):
-- - Puntuación tipo golf por semana: intentos usados (1–6) si se resuelve,
--   7 si se agotó sin acertar. Una semana solo puntúa cuando la partida
--   ha TERMINADO (resuelta o 6 intentos); en curso o no jugada no cuenta.
-- - Mensual: MEDIA de intentos de las semanas jugadas (no la suma), así
--   faltar una semana (vacaciones) no hunde a nadie.
-- - Mínimo 2 semanas jugadas para entrar «en concurso»; con menos, la
--   persona sale «fuera de concurso» (no compite por el premio).
-- - Desempate: más semanas jugadas.
-- - La semana pertenece al MES de su lunes (columna `semana`).
--
-- Solo expone el agregado (media, nº de semanas): nunca los intentos ni
-- la palabra. Security definer + grant a authenticated; el ranking lo ve
-- todo el equipo (transparencia del juego).
-- ============================================================

begin;

create or replace function public.wordle_ranking(p_mes date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_persona uuid := persona_actual_id();
  v_mes     date;
begin
  if v_persona is null then
    raise exception 'Sin sesión';
  end if;
  -- Mes de referencia (por defecto, el actual en Madrid), al día 1.
  v_mes := date_trunc(
    'month',
    coalesce(p_mes, (now() at time zone 'Europe/Madrid')::date)
  )::date;

  return coalesce((
    select jsonb_agg(
             to_jsonb(f)
             order by f.en_concurso desc, f.media asc, f.semanas desc, f.nombre asc
           )
    from (
      select
        pe.id                                                        as persona_id,
        pe.nombre,
        count(*)::int                                                as semanas,
        round(
          avg(case when pa.resuelta
                   then jsonb_array_length(pa.intentos)
                   else 7 end)::numeric,
          2
        )                                                            as media,
        (count(*) >= 2)                                              as en_concurso
      from wordle_partidas pa
      join personas pe on pe.id = pa.persona_id and pe.activo
      where date_trunc('month', pa.semana) = v_mes
        and (pa.resuelta or jsonb_array_length(pa.intentos) >= 6)
      group by pe.id, pe.nombre
    ) f
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.wordle_ranking(date) from public;
grant execute on function public.wordle_ranking(date) to authenticated;

commit;
