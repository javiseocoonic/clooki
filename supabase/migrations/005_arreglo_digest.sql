-- ============================================================
-- Migración 005: arreglo de mcp_valida — en Supabase, pgcrypto vive
-- en el esquema `extensions` y el `search_path = public` de la 004
-- impedía encontrar digest(). Se cualifica explícitamente.
-- Ejecutar en: Supabase Dashboard → SQL Editor (después de 004)
-- ============================================================

create or replace function public.mcp_valida(p_clave text)
returns public.personas
language plpgsql
security definer
set search_path = public
as $$
declare
  v personas%rowtype;
begin
  select p.* into v
  from claves_api k
  join personas p on p.id = k.persona_id
  where k.hash = encode(extensions.digest(p_clave, 'sha256'), 'hex')
    and p.activo;
  if not found then
    raise exception 'Token inválido o revocado';
  end if;
  update claves_api
  set usada_en = now()
  where persona_id = v.id;
  return v;
end;
$$;
