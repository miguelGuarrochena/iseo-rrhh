-- ============================================================
-- El tope imponible de aportes deja de ser opcional.
--
-- Qué pasaba
-- ----------
-- `empresas.config.topeImponibleAportes` era opcional y, si faltaba, los
-- aportes se calculaban sobre el bruto completo. Eso **parece** un
-- cálculo: la remuneración se guarda con `aportes` y `monto_neto` ya
-- resueltos, así que el neto quedaba grabado más bajo que el que la
-- persona iba a cobrar, y el error crecía justo en los sueldos altos —
-- los únicos donde el tope importa. Un dato faltante no puede tener un
-- resultado por defecto indistinguible de uno correcto.
--
-- Qué se hace
-- -----------
-- No se puede guardar una remuneración de una empresa en relación de
-- dependencia si esa empresa no tiene el tope cargado. En régimen
-- simplificado no se pide: ahí no hay aportes de ley que retener y el
-- tope no entra en ninguna cuenta.
--
-- Por qué en la base
-- ------------------
-- La validación del formulario y la del servicio corren en el navegador.
-- Cualquiera con el token de un admin puede escribir en la tabla por la
-- API sin pasar por ninguna de las dos. Éste es el único punto que no se
-- puede saltear.
--
-- Sobre lo ya cargado
-- -------------------
-- El trigger mira `auth.uid()`: sin JWT (migraciones, service role) no
-- frena. Las remuneraciones históricas **no se tocan ni se recalculan**
-- — guardan su propio `aportes` y `monto_neto`, así que cambiar el tope
-- hoy no mueve ningún período anterior. Ése es justamente el motivo por
-- el que el valor puede vivir en la configuración sin necesitar
-- historia: el resultado ya está congelado en cada fila.
--
-- Idempotente.
-- ============================================================

/**
 * ¿A esta empresa se le retienen aportes de ley?
 *
 * Espejo de `tieneAportesDeLey()` en `remuneraciones.ts`. Son dos, y no
 * hay forma de que sea una sola: el cálculo vive en el cliente y el
 * freno tiene que vivir acá. El test de base fija que coincidan.
 */
create or replace function public.empresa_con_aportes_de_ley(p_empresa uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select e.regimen from public.empresas e where e.id = p_empresa),
    'relacion_dependencia'
  ) = 'relacion_dependencia';
$$;

/**
 * El tope configurado por la empresa, o null si no hay uno usable.
 *
 * Un cero, un negativo o un texto que no es número cuentan como "no
 * cargado": el JSON de configuración no tiene tipos, y un
 * `"topeImponibleAportes": ""` no puede pasar por un tope válido.
 */
create or replace function public.tope_imponible_de_empresa(p_empresa uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_texto text;
  v_valor numeric;
begin
  select e.config ->> 'topeImponibleAportes'
    into v_texto
    from public.empresas e
   where e.id = p_empresa;

  if v_texto is null or btrim(v_texto) = '' then
    return null;
  end if;

  begin
    v_valor := v_texto::numeric;
  exception when others then
    return null;
  end;

  if v_valor <= 0 then
    return null;
  end if;
  return v_valor;
end;
$$;

comment on function public.tope_imponible_de_empresa(uuid) is
  'Tope imponible de aportes de la empresa (art. 9, Ley 24.241), o NULL '
  'si no está cargado o no es un importe positivo.';

/**
 * Sin tope no se guarda una remuneración.
 */
create or replace function public.trg_exigir_tope_de_aportes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if not empresa_con_aportes_de_ley(new.empresa_id) then
    return new;
  end if;

  if tope_imponible_de_empresa(new.empresa_id) is null then
    raise exception
      'TOPE_APORTES_SIN_CONFIGURAR: configurá el tope imponible de aportes en Configuración antes de liquidar';
  end if;

  return new;
end;
$$;

drop trigger if exists exigir_tope_de_aportes on public.remuneraciones;
create trigger exigir_tope_de_aportes
  before insert or update on public.remuneraciones
  for each row execute function trg_exigir_tope_de_aportes();

/**
 * Un tope guardado tiene que ser un importe positivo.
 *
 * Se valida al escribir la configuración y no sólo al liquidar, para que
 * el error aparezca donde se cometió. Sólo mira el campo cuando está
 * presente: una empresa nueva puede crearse sin tope y cargarlo después
 * —lo que no puede es liquidar.
 */
create or replace function public.trg_validar_tope_de_aportes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_texto text := new.config ->> 'topeImponibleAportes';
  v_valor numeric;
begin
  if auth.uid() is null then
    return new;
  end if;
  if v_texto is null then
    return new;
  end if;

  if btrim(v_texto) = '' then
    raise exception
      'TOPE_APORTES_INVALIDO: el tope imponible de aportes no puede quedar vacío. Borrá el campo o cargá un importe.';
  end if;

  begin
    v_valor := v_texto::numeric;
  exception when others then
    raise exception 'TOPE_APORTES_INVALIDO: el tope imponible de aportes tiene que ser un número';
  end;

  if v_valor <= 0 then
    raise exception 'TOPE_APORTES_INVALIDO: el tope imponible de aportes tiene que ser mayor a cero';
  end if;

  return new;
end;
$$;

drop trigger if exists validar_tope_de_aportes on public.empresas;
create trigger validar_tope_de_aportes
  before insert or update on public.empresas
  for each row execute function trg_validar_tope_de_aportes();

revoke all on function public.empresa_con_aportes_de_ley(uuid) from public, anon;
revoke all on function public.tope_imponible_de_empresa(uuid) from public, anon;
grant execute on function public.empresa_con_aportes_de_ley(uuid) to authenticated;
grant execute on function public.tope_imponible_de_empresa(uuid) to authenticated;

notify pgrst, 'reload schema';
