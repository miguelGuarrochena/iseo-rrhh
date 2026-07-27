-- ============================================================
-- Recibos: varios por mes, y con historial al rectificar.
--
-- El modelo asumía "un recibo = un mes" (`unique (empleado_id, periodo)`).
-- En la liquidación argentina eso no es cierto: un mismo período puede
-- tener el sueldo mensual, el SAC (junio y diciembre), un adelanto de
-- vacaciones, una gratificación o la liquidación final. Con la regla
-- vieja, cargar el aguinaldo de junio pisaba el sueldo de junio.
--
-- Y pisar era literal: la carga hace upsert, así que el PDF se
-- reemplazaba aunque el colaborador ya lo hubiera firmado. La constancia
-- de recepción quedaba apuntando a un archivo que esa persona nunca vio,
-- que es justamente lo que la LCT pide poder demostrar.
--
-- Ahora: un recibo por (empleado, período, tipo) entre los vigentes, y
-- rectificar archiva el anterior en vez de borrarlo.
-- ============================================================

-- ---------- 1. Tipo de recibo ----------
do $$ begin
  create type tipo_recibo as enum (
    'mensual',
    'sac',
    'vacaciones',
    'gratificacion',
    'liquidacion_final'
  );
exception when duplicate_object then null;
end $$;

alter table recibos
  add column if not exists tipo tipo_recibo not null default 'mensual';

-- ---------- 2. Historial ----------
-- Un recibo archivado deja de estar vigente pero conserva su archivo y su
-- firma. `rectifica_a` apunta al que vino a reemplazar, para poder
-- mostrar "este corrige al del 25/07".
alter table recibos
  add column if not exists archivado_en timestamptz,
  add column if not exists rectifica_a uuid references recibos (id) on delete set null;

comment on column recibos.archivado_en is
  'Si tiene fecha, dejó de ser el recibo vigente: quedó como historial.';
comment on column recibos.rectifica_a is
  'Recibo al que vino a corregir. El corregido queda archivado.';

-- ---------- 3. Unicidad por tipo, sólo entre los vigentes ----------
alter table recibos drop constraint if exists recibos_empleado_id_periodo_key;

create unique index if not exists recibos_vigente_unico_idx
  on recibos (empleado_id, periodo, tipo)
  where archivado_en is null;

-- ---------- 4. Que el empleado no vea los archivados ----------
-- Los archivados siguen existiendo para la empresa (son la prueba de lo
-- que se firmó en su momento) pero no aparecen en la lista del empleado.
drop policy if exists recibos_select on recibos;
create policy recibos_select on recibos for select
  using (
    es_superadmin()
    or (
      empresa_id = auth_empresa()
      and (
        es_gestor()
        or (
          empleado_id = auth_empleado()
          and firmado_empleador_en is not null
          and archivado_en is null
        )
      )
    )
  );

-- ---------- 5. El empleado sólo firma recibos vigentes ----------
drop policy if exists recibos_firma on recibos;
create policy recibos_firma on recibos for update
  using (
    empleado_id = auth_empleado()
    and firmado_empleador_en is not null
    and archivado_en is null
  )
  with check (empleado_id = auth_empleado());

notify pgrst, 'reload schema';
