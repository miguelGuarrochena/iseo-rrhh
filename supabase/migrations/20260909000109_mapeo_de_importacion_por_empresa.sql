-- ============================================================
-- El mapeo de columnas de cada empresa.
--
-- El problema
-- -----------
-- Cada empresa trabaja con su estudio contable, y cada estudio arma la
-- planilla a su manera: "Sueldo" en una, "Haberes" en otra, "Hs 50%" en
-- una tercera. Hasta ahora el mapeo vivía en el estado del componente y
-- se perdía al cerrar el modal: RRHH tenía que volver a explicar las
-- mismas columnas todos los meses.
--
-- La decisión
-- -----------
-- Un mapeo activo por empresa, guardado como JSONB. No se normaliza
-- columna por columna en filas: no hay ninguna consulta que quiera
-- preguntar "qué empresas mapean algo a `sueldo`", y una tabla de
-- pares clave-valor para eso sería estructura sin uso.
--
-- Tampoco va en `empresas.config`: ese objeto lo reescribe entero el
-- formulario de Configuración (`actualizarConfigEmpresa` manda el
-- `config` completo), así que un mapeo guardado ahí sería un mapeo a la
-- espera de que alguien toque un horario y lo borre sin enterarse.
--
-- Qué NO es
-- ---------
-- No es una entidad "estudio contable". Si mañana varias empresas
-- comparten formato se podrá evolucionar; hoy sería una tabla más para
-- representar algo que nadie pidió.
--
-- Qué se guarda
-- -------------
-- Todas las columnas del último archivo, incluidas las que se decidió
-- **no** importar. Saber que "Obs." ya se vio y se descartó a propósito
-- vale igual que saber cuál era el sueldo, y es lo que permite darse
-- cuenta de que el estudio cambió el formato.
--
-- Idempotente. Sin mapeo guardado, la importación funciona como venía
-- funcionando: sugiere por nombre y la persona corrige.
-- ============================================================

create table if not exists public.mapeos_importacion_remuneraciones (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  /* { "Sueldo básico": "sueldo", "Obs.": "__ignorar__", ... } */
  mapeo jsonb not null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid references public.usuarios(id) on delete set null
);

comment on table public.mapeos_importacion_remuneraciones is
  'Cómo se interpretan las columnas de la planilla del estudio contable '
  'de cada empresa. Un mapeo activo por empresa.';
comment on column public.mapeos_importacion_remuneraciones.mapeo is
  'Columna del archivo → clave de campo, o "__ignorar__". Incluye las '
  'columnas descartadas a propósito: es lo que permite detectar que el '
  'estudio cambió el formato.';

/* Un mapeo activo por empresa: no hay "el de este mes" y "el de aquel". */
create unique index if not exists uq_mapeo_importacion_empresa
  on public.mapeos_importacion_remuneraciones (empresa_id);

alter table public.mapeos_importacion_remuneraciones
  drop constraint if exists mapeo_importacion_objeto;
alter table public.mapeos_importacion_remuneraciones
  add constraint mapeo_importacion_objeto
  check (jsonb_typeof(mapeo) = 'object')
  not valid;

alter table public.mapeos_importacion_remuneraciones enable row level security;

/*
 * El mapeo es de la empresa y lo maneja quien importa.
 *
 * Los mismos que pueden cargar remuneraciones (`remuneraciones_gestion_*`):
 * admin_rrhh de esa empresa, y superadmin. El supervisor y el empleado
 * quedan afuera —no importan liquidaciones—, y una empresa no ve el
 * formato de la planilla de otra.
 */
drop policy if exists mapeo_importacion_select on public.mapeos_importacion_remuneraciones;
create policy mapeo_importacion_select
  on public.mapeos_importacion_remuneraciones for select
  using (
    es_superadmin()
    or (auth_rol() = 'admin_rrhh'::rol_usuario and empresa_id = auth_empresa())
  );

drop policy if exists mapeo_importacion_insert on public.mapeos_importacion_remuneraciones;
create policy mapeo_importacion_insert
  on public.mapeos_importacion_remuneraciones for insert
  with check (
    es_superadmin()
    or (auth_rol() = 'admin_rrhh'::rol_usuario and empresa_id = auth_empresa())
  );

/*
 * En el update se controlan las dos puntas. Sin `with check`, un admin
 * podría tomar su propio mapeo y reasignarlo a otra empresa.
 */
drop policy if exists mapeo_importacion_update on public.mapeos_importacion_remuneraciones;
create policy mapeo_importacion_update
  on public.mapeos_importacion_remuneraciones for update
  using (
    es_superadmin()
    or (auth_rol() = 'admin_rrhh'::rol_usuario and empresa_id = auth_empresa())
  )
  with check (
    es_superadmin()
    or (auth_rol() = 'admin_rrhh'::rol_usuario and empresa_id = auth_empresa())
  );

drop policy if exists mapeo_importacion_delete on public.mapeos_importacion_remuneraciones;
create policy mapeo_importacion_delete
  on public.mapeos_importacion_remuneraciones for delete
  using (
    es_superadmin()
    or (auth_rol() = 'admin_rrhh'::rol_usuario and empresa_id = auth_empresa())
  );

/**
 * Quién y cuándo, sin confiar en lo que mande el cliente.
 */
create or replace function public.trg_mapeo_importacion_sello()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.actualizado_en := now();
  if auth.uid() is not null then
    new.actualizado_por := auth.uid();
  end if;
  if tg_op = 'UPDATE' then
    -- El mapeo no cambia de empresa: si hiciera falta uno nuevo, se crea.
    new.empresa_id := old.empresa_id;
    new.creado_en := old.creado_en;
  end if;
  return new;
end;
$$;

drop trigger if exists mapeo_importacion_sello on public.mapeos_importacion_remuneraciones;
create trigger mapeo_importacion_sello
  before insert or update on public.mapeos_importacion_remuneraciones
  for each row execute function trg_mapeo_importacion_sello();

grant select, insert, update, delete
  on table public.mapeos_importacion_remuneraciones to authenticated;

notify pgrst, 'reload schema';
