-- ============================================================
-- Features cliente: ausencias (tipos + carga admin), fichajes
-- manual, legajo, descuentos %, monotributo, comunicaciones,
-- documentos a firmar, cupos de licencia, cumpleaños visibles.
-- ============================================================

-- ---------- Nuevos tipos de ausencia ----------
alter type tipo_ausencia add value if not exists 'entrada_tarde';
alter type tipo_ausencia add value if not exists 'salida_anticipada';
alter type tipo_ausencia add value if not exists 'salida_intermedia';
alter type tipo_ausencia add value if not exists 'home_office';
alter type tipo_ausencia add value if not exists 'casamiento';
alter type tipo_ausencia add value if not exists 'donacion_sangre';
alter type tipo_ausencia add value if not exists 'examenes';

-- ---------- Ausencias: gestores pueden cargar por otro empleado ----------
drop policy if exists ausencias_solicitar on ausencias;
create policy ausencias_solicitar on ausencias for insert
  with check (
    empresa_id = auth_empresa()
    and (empleado_id = auth_empleado() or es_gestor())
  );

-- ---------- Fichajes: gestores pueden cargar a mano ----------
drop policy if exists fichajes_fichar on fichajes;
create policy fichajes_fichar on fichajes for insert
  with check (
    empresa_id = auth_empresa()
    and (empleado_id = auth_empleado() or es_gestor())
  );

-- ---------- Número de legajo (para matching en carga masiva) ----------
alter table empleados
  add column if not exists numero_legajo text;

create index if not exists empleados_legajo_idx
  on empleados (empresa_id, numero_legajo)
  where numero_legajo is not null;

-- ---------- Descuentos fijos: monto o porcentaje del bruto ----------
alter table descuentos_recurrentes
  add column if not exists modo text not null default 'monto'
    check (modo in ('monto', 'porcentaje'));
alter table descuentos_recurrentes
  add column if not exists porcentaje numeric(5, 2);

-- ---------- Facturas / costo monotributo ----------
create table if not exists facturas_monotributo (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  empleado_id uuid not null references empleados (id) on delete cascade,
  periodo text not null,
  monto numeric(14, 2) not null check (monto >= 0),
  archivo_url text,
  creado_en timestamptz not null default now(),
  unique (empleado_id, periodo)
);

alter table facturas_monotributo enable row level security;

create policy facturas_mono_select on facturas_monotributo for select
  using (
    es_superadmin()
    or (empresa_id = auth_empresa() and (es_gestor() or empleado_id = auth_empleado()))
  );
create policy facturas_mono_gestion on facturas_monotributo for all
  using (es_superadmin() or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa()))
  with check (es_superadmin() or empresa_id = auth_empresa());

-- ---------- Cupos anuales de licencias legales (por empresa) ----------
create table if not exists cupos_licencia (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  tipo tipo_ausencia not null,
  dias_anuales int not null default 0 check (dias_anuales >= 0),
  unique (empresa_id, tipo)
);

alter table cupos_licencia enable row level security;

create policy cupos_licencia_select on cupos_licencia for select
  using (es_superadmin() or empresa_id = auth_empresa());
create policy cupos_licencia_gestion on cupos_licencia for all
  using (es_superadmin() or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa()))
  with check (es_superadmin() or empresa_id = auth_empresa());

-- ---------- Comunicaciones: consultas / reclamos / pedidos ----------
do $$ begin
  create type tipo_comunicacion as enum ('consulta', 'reclamo', 'pedido');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type estado_comunicacion as enum ('abierta', 'en_curso', 'cerrada');
exception when duplicate_object then null;
end $$;

create table if not exists comunicaciones (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  empleado_id uuid not null references empleados (id) on delete cascade,
  autor_id uuid not null references usuarios (id) on delete cascade,
  tipo tipo_comunicacion not null default 'consulta',
  asunto text not null,
  cuerpo text not null default '',
  estado estado_comunicacion not null default 'abierta',
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table if not exists comunicacion_mensajes (
  id uuid primary key default gen_random_uuid(),
  comunicacion_id uuid not null references comunicaciones (id) on delete cascade,
  autor_id uuid not null references usuarios (id) on delete cascade,
  cuerpo text not null,
  creado_en timestamptz not null default now()
);

alter table comunicaciones enable row level security;
alter table comunicacion_mensajes enable row level security;

create policy comunicaciones_select on comunicaciones for select
  using (
    es_superadmin()
    or (empresa_id = auth_empresa() and (es_gestor() or empleado_id = auth_empleado()))
  );
create policy comunicaciones_insert on comunicaciones for insert
  with check (
    empresa_id = auth_empresa()
    and (empleado_id = auth_empleado() or es_gestor())
  );
create policy comunicaciones_update on comunicaciones for update
  using (es_superadmin() or (empresa_id = auth_empresa() and es_gestor()))
  with check (empresa_id = auth_empresa());

create policy comunicacion_mensajes_select on comunicacion_mensajes for select
  using (
    exists (
      select 1 from comunicaciones c
      where c.id = comunicacion_id
        and (
          es_superadmin()
          or (c.empresa_id = auth_empresa() and (es_gestor() or c.empleado_id = auth_empleado()))
        )
    )
  );
create policy comunicacion_mensajes_insert on comunicacion_mensajes for insert
  with check (
    exists (
      select 1 from comunicaciones c
      where c.id = comunicacion_id
        and (
          es_superadmin()
          or (c.empresa_id = auth_empresa() and (es_gestor() or c.empleado_id = auth_empleado()))
        )
    )
  );

-- ---------- Documentos para firma digital (políticas, reglamentos…) ----------
create table if not exists documentos_firma (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  titulo text not null,
  descripcion text,
  archivo_url text not null,
  creado_por uuid references usuarios (id) on delete set null,
  creado_en timestamptz not null default now()
);

create table if not exists documento_firma_destinatarios (
  id uuid primary key default gen_random_uuid(),
  documento_id uuid not null references documentos_firma (id) on delete cascade,
  empleado_id uuid not null references empleados (id) on delete cascade,
  firmado_en timestamptz,
  unique (documento_id, empleado_id)
);

alter table documentos_firma enable row level security;
alter table documento_firma_destinatarios enable row level security;

create policy documentos_firma_select on documentos_firma for select
  using (
    es_superadmin()
    or empresa_id = auth_empresa()
  );
create policy documentos_firma_gestion on documentos_firma for all
  using (es_superadmin() or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa()))
  with check (es_superadmin() or empresa_id = auth_empresa());

create policy doc_firma_dest_select on documento_firma_destinatarios for select
  using (
    es_superadmin()
    or exists (
      select 1 from documentos_firma d
      where d.id = documento_id and d.empresa_id = auth_empresa()
        and (es_gestor() or empleado_id = auth_empleado())
    )
  );
create policy doc_firma_dest_gestion on documento_firma_destinatarios for all
  using (
    es_superadmin()
    or exists (
      select 1 from documentos_firma d
      where d.id = documento_id
        and d.empresa_id = auth_empresa()
        and (auth_rol() = 'admin_rrhh' or empleado_id = auth_empleado())
    )
  )
  with check (
    exists (
      select 1 from documentos_firma d
      where d.id = documento_id and d.empresa_id = auth_empresa()
    )
  );

-- ---------- Cumpleaños visibles para toda la empresa ----------
-- Los empleados solo ven su propia ficha por RLS; esta función
-- security definer expone solo nombre/apellido/fecha de nacimiento.
create or replace function public.cumples_de_empresa()
returns table (
  empleado_id uuid,
  nombre text,
  apellido text,
  fecha_nacimiento date
)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.nombre, e.apellido, e.fecha_nacimiento
  from empleados e
  where e.empresa_id = auth_empresa()
    and e.activo = true
    and e.fecha_nacimiento is not null;
$$;

grant execute on function public.cumples_de_empresa() to authenticated;

-- ---------- Notificaciones: tipo para comunicaciones ----------
do $$ begin
  alter type tipo_notificacion add value if not exists 'comunicacion';
exception when duplicate_object then null;
end $$;

do $$ begin
  alter type tipo_notificacion add value if not exists 'documento_firma';
exception when duplicate_object then null;
end $$;
