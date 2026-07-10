-- ============================================================
-- Remuneraciones: descuentos recurrentes y adelantos.
-- Recibos: firma del empleador (el empleado recién lo ve cuando
-- el empleador lo firmó/publicó).
-- ============================================================

-- ---------- Descuentos recurrentes por empleado ----------
-- Conceptos fijos (sindicato, comedor, etc.) que se arrastran
-- como sugerencia al cargar la remuneración de cada período.

create table descuentos_recurrentes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  empleado_id uuid not null references empleados (id) on delete cascade,
  concepto text not null,
  monto numeric(14, 2) not null check (monto >= 0),
  creado_en timestamptz not null default now()
);

create index descuentos_recurrentes_empleado_idx
  on descuentos_recurrentes (empleado_id);

alter table descuentos_recurrentes enable row level security;

-- El empleado ve los suyos; el admin gestiona los de su empresa.
create policy descuentos_select on descuentos_recurrentes for select
  using (
    es_superadmin()
    or (empresa_id = auth_empresa()
        and (auth_rol() = 'admin_rrhh' or empleado_id = auth_empleado()))
  );
create policy descuentos_gestion on descuentos_recurrentes for all
  using (es_superadmin() or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa()))
  with check (es_superadmin() or empresa_id = auth_empresa());

comment on table descuentos_recurrentes is
  'Descuentos fijos por empleado que se sugieren en cada período.';

-- ---------- Adelantos / anticipos ----------
-- El empleado pide, el admin aprueba o rechaza. Al aprobar se fija
-- el período (YYYY-MM) en el que se descuenta del neto.

create table adelantos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  empleado_id uuid not null references empleados (id) on delete cascade,
  monto numeric(14, 2) not null check (monto > 0),
  motivo text,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'aprobado', 'rechazado')),
  periodo text, -- YYYY-MM en el que se descuenta (se fija al aprobar)
  resuelto_en timestamptz,
  creado_en timestamptz not null default now()
);

create index adelantos_empleado_idx on adelantos (empleado_id);

alter table adelantos enable row level security;

-- El empleado ve y pide los suyos; los gestores ven y resuelven todos.
create policy adelantos_select on adelantos for select
  using (
    es_superadmin()
    or (empresa_id = auth_empresa()
        and (es_gestor() or empleado_id = auth_empleado()))
  );
create policy adelantos_pedir on adelantos for insert
  with check (empresa_id = auth_empresa() and empleado_id = auth_empleado());
create policy adelantos_gestion on adelantos for all
  using (es_superadmin() or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa()))
  with check (es_superadmin() or empresa_id = auth_empresa());

comment on table adelantos is
  'Pedidos de adelanto de sueldo; aprobados se descuentan del período.';

-- Nuevos tipos de notificación para el circuito de adelantos.
alter type tipo_notificacion add value if not exists 'adelanto_solicitado';
alter type tipo_notificacion add value if not exists 'adelanto_resuelto';

-- ---------- Recibos: firma del empleador ----------
-- Un recibo recién cargado puede quedar "sin publicar" hasta que el
-- empleador lo firma. Los existentes quedan como ya publicados.

alter table recibos add column firmado_empleador_en timestamptz;
update recibos set firmado_empleador_en = now()
  where firmado_empleador_en is null;

-- El empleado solo ve (y firma) recibos publicados por el empleador.
drop policy recibos_select on recibos;
create policy recibos_select on recibos for select
  using (
    es_superadmin()
    or (empresa_id = auth_empresa()
        and (es_gestor()
             or (empleado_id = auth_empleado()
                 and firmado_empleador_en is not null)))
  );

drop policy recibos_firma on recibos;
create policy recibos_firma on recibos for update
  using (empleado_id = auth_empleado() and firmado_empleador_en is not null)
  with check (empleado_id = auth_empleado());
