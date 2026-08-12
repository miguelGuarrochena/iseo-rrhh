-- ============================================================
-- Feriados nacionales automáticos.
--
-- La agenda / vacaciones / fichadas leen la tabla `feriados`. Antes
-- no podían insertar (RLS: sólo admin_rrhh), así que si RRHH no
-- tocaba "Cargar feriados" el calendario quedaba vacío.
--
-- Esta RPC (security definer) deja que cualquier usuario autenticado
-- de la empresa asegure los nacionales del año: el listado lo manda
-- el cliente (misma fuente que `feriadosSugeridos`), y acá sólo se
-- insertan filas `tipo = nacional` faltantes. Puentes y días de la
-- empresa siguen cargándose a mano.
-- ============================================================

create or replace function public.asegurar_feriados_nacionales(
  p_feriados jsonb,
  p_empresa uuid default null
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa uuid;
  v_item jsonb;
  v_fecha date;
  v_nombre text;
  v_inserted int := 0;
  v_count int;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  v_empresa := case
    when p_empresa is null then auth_empresa()
    when es_superadmin() then p_empresa
    when p_empresa = auth_empresa() then p_empresa
    else null
  end;

  if v_empresa is null then
    raise exception 'No autorizado a cargar feriados de otra empresa';
  end if;

  if p_feriados is null or jsonb_typeof(p_feriados) <> 'array' then
    return 0;
  end if;

  -- Tope chico: un año ronda 16 nacionales; dos años ~32.
  if jsonb_array_length(p_feriados) > 64 then
    raise exception 'Demasiados feriados en un solo pedido';
  end if;

  for v_item in select value from jsonb_array_elements(p_feriados)
  loop
    -- Sólo nacionales: un colaborador no puede plantar puentes/empresa.
    if coalesce(v_item->>'tipo', 'nacional') <> 'nacional' then
      continue;
    end if;

    begin
      v_fecha := (v_item->>'fecha')::date;
    exception when others then
      continue;
    end;

    v_nombre := nullif(trim(coalesce(v_item->>'nombre', '')), '');
    if v_nombre is null then
      continue;
    end if;

    insert into feriados (empresa_id, fecha, nombre, tipo, no_laborable)
    values (
      v_empresa,
      v_fecha,
      v_nombre,
      'nacional',
      coalesce(
        (v_item->>'noLaborable')::boolean,
        (v_item->>'no_laborable')::boolean,
        true
      )
    )
    on conflict (empresa_id, fecha) do nothing;

    get diagnostics v_count = row_count;
    v_inserted := v_inserted + v_count;
  end loop;

  return v_inserted;
end;
$$;

revoke all on function public.asegurar_feriados_nacionales(jsonb, uuid) from public;
revoke all on function public.asegurar_feriados_nacionales(jsonb, uuid) from anon;
grant execute on function public.asegurar_feriados_nacionales(jsonb, uuid) to authenticated;

notify pgrst, 'reload schema';
