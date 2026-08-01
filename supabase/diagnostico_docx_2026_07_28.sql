-- ============================================================
-- Diagnóstico de los puntos del documento "Cambios y modificaciones 28-7".
--
-- Es SOLO DE LECTURA: no cambia nada. Corrémelo en el SQL Editor del
-- proyecto del cliente y pasame el resultado. Cada fila dice si la base
-- tiene o no lo que el código necesita para que ese punto funcione.
-- ============================================================

with chequeos as (

  -- 1. Fichaje manual: el enum tiene que aceptar 'manual' y 'remoto'.
  select
    '3 · Fichaje manual'::text as punto,
    'enum metodo_fichaje acepta manual'::text as necesita,
    exists (
      select 1
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
      where t.typname = 'metodo_fichaje' and e.enumlabel = 'manual'
    ) as ok,
    'migración 20260801000035'::text as lo_arregla

  union all
  select
    '3 · Fichaje manual',
    'columna fichajes.registrado_por',
    exists (
      select 1 from information_schema.columns
      where table_name = 'fichajes' and column_name = 'registrado_por'
    ),
    'migración 20260705000010 / 20260727000024'

  union all
  select
    '3 · Fichaje manual',
    'política fichajes_fichar con salida por superadmin',
    exists (
      select 1 from pg_policies
      where tablename = 'fichajes' and policyname = 'fichajes_fichar'
        and with_check like '%es_superadmin%'
    ),
    'migración 20260727000024'

  -- 4. Recibos masivos: tipo y versión.
  union all
  select
    '4 · Recibos masivos',
    'tipo tipo_recibo existe',
    exists (select 1 from pg_type where typname = 'tipo_recibo'),
    'migración 20260727000026'

  union all
  select
    '4 · Recibos masivos',
    'columna recibos.tipo',
    exists (
      select 1 from information_schema.columns
      where table_name = 'recibos' and column_name = 'tipo'
    ),
    'migración 20260727000026'

  -- "Vigente" no es una columna: un recibo está vigente mientras
  -- `archivado_en` sea null. Rectificar archiva el anterior en vez de
  -- pisarlo, para no perder el PDF que el colaborador ya firmó.
  union all
  select
    '4 · Recibos masivos',
    'columnas recibos.archivado_en y rectifica_a',
    (
      select count(*) = 2 from information_schema.columns
      where table_name = 'recibos'
        and column_name in ('archivado_en', 'rectifica_a')
    ),
    'migración 20260727000026'

  union all
  select
    '4 · Recibos masivos',
    'índice recibos_vigente_unico_idx',
    exists (
      select 1 from pg_indexes
      where tablename = 'recibos' and indexname = 'recibos_vigente_unico_idx'
    ),
    'migración 20260727000026'

  union all
  select
    '4 · Recibos masivos',
    'unique viejo (empleado_id, periodo) ya NO existe',
    not exists (
      select 1 from pg_indexes
      where tablename = 'recibos' and indexname = 'recibos_empleado_id_periodo_key'
    ),
    'migración 20260727000026'

  -- 8. Envío de documentación para firma.
  union all
  select
    '8 · Documentos para firma',
    'tabla documentos_firma existe',
    exists (select 1 from information_schema.tables where table_name = 'documentos_firma'),
    'migración 20260724000023'

  union all
  select
    '8 · Documentos para firma',
    'tabla documento_firma_destinatarios existe',
    exists (select 1 from information_schema.tables where table_name = 'documento_firma_destinatarios'),
    'migración 20260724000023'

  union all
  select
    '8 · Documentos para firma',
    'política storage_insert_gestores (subida del PDF)',
    exists (
      select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and policyname = 'storage_insert_gestores'
    ),
    'migración 20260727000031'

  union all
  select
    '8 · Documentos para firma',
    'bucket documentos existe',
    exists (select 1 from storage.buckets where id = 'documentos'),
    'migración 20260703000001'

  union all
  select
    '8 · Documentos para firma',
    'políticas de documentos_firma al día',
    exists (
      select 1 from pg_policies
      where tablename = 'documentos_firma' and policyname = 'documentos_firma_select'
    ),
    'migración 20260727000029'

  -- 1. Borrar pedido de adelanto.
  union all
  select
    '1 · Borrar adelanto',
    'política adelantos_borrar',
    exists (
      select 1 from pg_policies
      where tablename = 'adelantos' and policyname = 'adelantos_borrar'
    ),
    'migración 20260801000034'

  -- 2. Fichaje facial. No hay tabla aparte: el descriptor y el
  -- consentimiento son columnas de `empleados`, y la confianza del match
  -- queda en `fichajes`.
  union all
  select
    '2 · Fichaje facial',
    'columnas empleados.descriptor_facial y consentimiento_biometrico',
    (
      select count(*) = 2 from information_schema.columns
      where table_name = 'empleados'
        and column_name in ('descriptor_facial', 'consentimiento_biometrico')
    ),
    'migración 20260704000004'

  union all
  select
    '2 · Fichaje facial',
    'columna fichajes.confianza',
    exists (
      select 1 from information_schema.columns
      where table_name = 'fichajes' and column_name = 'confianza'
    ),
    'migración 20260704000004'

  -- 7. Comunicaciones: leído / no leído.
  union all
  select
    '7 · Comunicaciones',
    'tabla comunicacion_lecturas',
    exists (
      select 1 from information_schema.tables
      where table_name = 'comunicacion_lecturas'
    ),
    'migración 20260801000036'

  -- 5. Feriados.
  union all
  select
    '5 · Feriados',
    'tabla feriados',
    exists (
      select 1 from information_schema.tables where table_name = 'feriados'
    ),
    'migración 20260801000037'

  -- Causa raíz histórica: superadmin sin empresa_id.
  union all
  select
    'Base · superadmin',
    'función auth_empresa() existe',
    exists (select 1 from pg_proc where proname = 'auth_empresa'),
    'migración 20260703000001'
)

select
  punto,
  necesita,
  case when ok then '✅ ok' else '❌ FALTA' end as estado,
  case when ok then '' else lo_arregla end as aplicar
from chequeos
order by punto, necesita;
