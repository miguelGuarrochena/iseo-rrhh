-- ============================================================
-- Constancia de firma: evidencia de QUÉ documento se firmó.
--
-- Qué hay hoy
-- -----------
-- `recibos.estado_firma` + `firmado_en`. Eso alcanza para saber que
-- alguien firmó y cuándo, pero no para saber **qué**: el archivo vive en
-- Storage y nada ata la firma a un contenido concreto. Si el PDF se
-- reemplaza por otro con el mismo nombre, el registro sigue diciendo
-- "firmado" y no hay forma de notar el cambio.
--
-- Qué se agrega
-- -------------
-- El hash SHA-256 del PDF exacto que la persona tuvo delante al firmar,
-- calculado en el navegador sobre los bytes que se descargaron. Con eso
-- se puede afirmar después: "esta persona firmó exactamente este
-- archivo, este día". Si el archivo cambia, el hash deja de coincidir y
-- se ve.
--
-- Qué NO es
-- ---------
-- **No es firma digital certificada** (Ley 25.506): no hay certificado
-- ni autoridad certificante. Es firma electrónica con evidencia de
-- integridad del documento, que es una cosa distinta y más modesta. La
-- app no la llama de otra manera en ningún lado.
--
-- Inmutabilidad
-- -------------
-- Una vez escrito, el hash y la fecha de firma no se pueden cambiar ni
-- borrar. El trigger de abajo lo hace cumplir para cualquiera con sesión
-- —incluido el superadmin—: una evidencia que el dueño de la plataforma
-- puede reescribir no es evidencia. Corregir un recibo ya firmado se
-- hace como se hacía: publicando uno nuevo que rectifica al anterior
-- (`rectifica_a`, migración 26), no pisando el firmado.
--
-- Idempotente. Los recibos ya firmados quedan sin hash: la firma vale
-- igual, sólo que sin evidencia del contenido. No se inventa nada
-- retroactivamente.
-- ============================================================

alter table recibos
  add column if not exists hash_firmado text,
  add column if not exists hash_algoritmo text;

comment on column recibos.hash_firmado is
  'SHA-256 en hexadecimal del PDF exacto que se firmó. Nulo en los '
  'recibos firmados antes de existir esta columna: la firma vale igual, '
  'pero sin evidencia del contenido.';
comment on column recibos.hash_algoritmo is
  'Con qué se calculó el hash. Se guarda para que dentro de unos años se '
  'pueda verificar aunque el algoritmo por defecto haya cambiado.';

/*
 * Un hash tiene que parecer un hash. No valida que sea EL hash correcto
 * —eso se verifica contra el archivo— pero corta la basura.
 */
alter table recibos drop constraint if exists recibos_hash_formato;
alter table recibos
  add constraint recibos_hash_formato
  check (hash_firmado is null or hash_firmado ~ '^[0-9a-f]{64}$')
  not valid;

/**
 * La constancia no se reescribe.
 *
 * Una vez que hay hash y fecha de firma, esos dos campos —y quién es el
 * dueño del recibo— quedan congelados. Aplica a todos los roles con
 * sesión: el sentido de la evidencia es que nadie pueda cambiarla
 * después, y "nadie" incluye a ISEO.
 *
 * Sin JWT (service role, migraciones) no se frena, igual que el resto de
 * los triggers de la base: el freno es contra el uso de la app.
 */
create or replace function public.trg_constancia_firma_inmutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  -- Sólo importa cuando ya había una firma registrada.
  if old.estado_firma is distinct from 'firmado' then
    return new;
  end if;

  if new.hash_firmado is distinct from old.hash_firmado then
    raise exception
      'CONSTANCIA_INMUTABLE: no se puede cambiar el hash de un recibo ya firmado';
  end if;
  if new.firmado_en is distinct from old.firmado_en then
    raise exception
      'CONSTANCIA_INMUTABLE: no se puede cambiar la fecha de firma';
  end if;
  if new.empleado_id is distinct from old.empleado_id then
    raise exception
      'CONSTANCIA_INMUTABLE: no se puede cambiar de quién es un recibo firmado';
  end if;
  /*
   * El archivo tampoco: si cambiara, el hash guardado dejaría de
   * corresponder al documento y la evidencia quedaría apuntando al
   * lugar equivocado. Para corregir un recibo firmado hay que publicar
   * uno nuevo que rectifique al anterior.
   */
  if new.archivo_url is distinct from old.archivo_url then
    raise exception
      'CONSTANCIA_INMUTABLE: un recibo firmado no cambia de archivo. Publicá uno nuevo que lo rectifique.';
  end if;

  return new;
end;
$$;

drop trigger if exists constancia_firma_inmutable on recibos;
create trigger constancia_firma_inmutable
  before update on recibos
  for each row execute function trg_constancia_firma_inmutable();

/**
 * Firma el recibo propio dejando la constancia del documento.
 *
 * Reemplaza a `firmar_recibo(uuid)` de la migración 57 sumando el hash.
 * Se mantiene la anterior para no romper una sesión abierta con el
 * bundle viejo: sin hash, firma igual — es exactamente lo que hacía.
 *
 * El hash lo calcula el navegador sobre los bytes que efectivamente
 * descargó y mostró. No se puede calcular en el servidor sin bajar el
 * archivo de Storage, y sobre todo: el que vale es el del documento que
 * la persona tuvo delante, no el que el servidor cree que hay.
 *
 * Que el cliente pueda mandar cualquier hash no rompe nada. La evidencia
 * no dice "el servidor verificó el archivo", dice "esto es lo que se
 * firmó"; si alguien manda un hash que no corresponde, la verificación
 * posterior falla y eso es justamente lo que tiene que pasar.
 */
create or replace function public.firmar_recibo_con_constancia(
  p_recibo_id uuid,
  p_hash text,
  p_algoritmo text default 'SHA-256'
)
returns setof public.recibos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emp uuid := auth_empleado();
  v_empresa uuid := auth_empresa();
  v_recibo public.recibos;
begin
  if auth.uid() is null then
    raise exception 'Sin sesión';
  end if;
  if v_emp is null then
    raise exception 'Tu cuenta no está vinculada a un legajo';
  end if;
  if v_empresa is null then
    raise exception 'Sin empresa activa';
  end if;
  if p_hash is not null and p_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'El hash del documento no tiene el formato esperado';
  end if;

  update public.recibos r
     set estado_firma = 'firmado',
         firmado_en = now(),
         hash_firmado = p_hash,
         hash_algoritmo = case when p_hash is null then null else p_algoritmo end
   where r.id = p_recibo_id
     and r.empleado_id = v_emp
     and r.empresa_id = v_empresa
     and r.firmado_empleador_en is not null
     and r.archivado_en is null
     and r.estado_firma = 'pendiente'
  returning * into v_recibo;

  -- Ya firmado, ajeno, no publicado o inexistente: vacío. Mismo criterio
  -- que `firmar_recibo`, para que el llamador no distinga esos casos.
  if not found then
    return;
  end if;

  return next v_recibo;
end;
$$;

comment on function public.firmar_recibo_con_constancia(uuid, text, text) is
  'Firma one-shot del recibo propio, guardando el hash del PDF firmado. '
  'Firma electrónica con evidencia de integridad; NO es firma digital '
  'certificada (Ley 25.506).';

revoke all on function public.firmar_recibo_con_constancia(uuid, text, text) from public;
revoke all on function public.firmar_recibo_con_constancia(uuid, text, text) from anon;
grant execute on function public.firmar_recibo_con_constancia(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
