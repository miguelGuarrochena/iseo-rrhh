-- ============================================================
-- ISEO RH — Esquema inicial
-- Multi-tenant: una base, empresa_id en cada tabla + RLS.
-- Espejo de src/types/rrhh.ts (fuente de verdad del dominio).
-- ============================================================

-- ---------- Enums ----------

create type rol_usuario as enum ('superadmin', 'admin_rrhh', 'supervisor', 'empleado');
create type estado_empresa as enum ('activa', 'suspendida');
create type metodo_fichaje as enum ('facial_tablet', 'celular');
create type tipo_fichaje as enum ('ingreso', 'egreso');
create type estado_civil as enum ('soltero', 'casado', 'divorciado', 'viudo', 'union_convivencial');
create type nivel_estudios as enum ('primario', 'secundario', 'terciario', 'universitario', 'posgrado');
create type modalidad_contratacion as enum ('indeterminado', 'plazo_fijo', 'eventual', 'pasantia', 'monotributista');
create type modalidad_pago as enum ('mensual', 'quincenal', 'semanal', 'jornal');
create type categoria_documento as enum ('dni', 'contrato', 'alta_afip', 'certificado', 'licencia', 'estudio_medico', 'titulo', 'curso', 'otro');
create type estado_firma as enum ('pendiente', 'firmado');
create type tipo_ausencia as enum ('vacaciones', 'enfermedad', 'estudio', 'mudanza', 'fallecimiento', 'especial');
create type estado_ausencia as enum ('pendiente', 'aprobada', 'rechazada');
create type tipo_alerta as enum ('contrato_plazo', 'examen_medico', 'art', 'documento', 'custom');
create type estado_alerta as enum ('pendiente', 'notificada', 'resuelta');
create type tipo_evento as enum ('evento', 'capacitacion', 'cumpleanios', 'vencimiento');
create type tipo_notificacion as enum ('ausencia_solicitada', 'ausencia_resuelta', 'recibo_disponible', 'vencimiento', 'evento', 'general');

-- ---------- Tablas ----------

create table empresas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  cuit text not null unique,
  logo_url text,
  estado estado_empresa not null default 'activa',
  contacto_nombre text not null,
  contacto_email text not null,
  -- ConfigEmpresa: metodos_fichaje, tolerancia, horarios, dias_aviso
  config jsonb not null default '{
    "metodosFichaje": ["celular"],
    "toleranciaLlegadaTardeMin": 10,
    "horaEntrada": "08:00",
    "horaSalida": "17:00",
    "diasAvisoVencimiento": 30
  }'::jsonb,
  creada_en timestamptz not null default now()
);

-- Perfil de usuario: extiende auth.users (mismo id).
create table usuarios (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  rol rol_usuario not null default 'empleado',
  empresa_id uuid references empresas (id) on delete cascade,
  empleado_id uuid, -- FK diferida: empleados se crea después
  nombre_completo text not null,
  avatar_url text,
  creado_en timestamptz not null default now(),
  -- superadmin es el único sin empresa
  constraint empresa_por_rol check (rol = 'superadmin' or empresa_id is not null)
);

create table empleados (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  -- Datos personales
  nombre text not null,
  apellido text not null,
  dni text not null,
  cuil text not null default '',
  fecha_nacimiento date,
  estado_civil estado_civil not null default 'soltero',
  nivel_estudios nivel_estudios not null default 'secundario',
  domicilio text not null default '',
  telefono text not null default '',
  email text not null default '',
  contacto_emergencia jsonb not null default '{}'::jsonb,
  grupo_familiar jsonb not null default '[]'::jsonb,
  foto_url text,
  -- Datos laborales
  fecha_ingreso date not null,
  puesto text not null,
  sector text not null,
  supervisor_id uuid references empleados (id) on delete set null,
  modalidad_contratacion modalidad_contratacion not null default 'indeterminado',
  fecha_fin_contrato date,
  modalidad_pago modalidad_pago not null default 'mensual',
  banco text not null default '',
  cbu text not null default '',
  obra_social text not null default '',
  art text not null default '',
  -- Estado
  activo boolean not null default true,
  fecha_baja date,
  motivo_baja text,
  checklist_alta jsonb not null default '[]'::jsonb,
  creado_en timestamptz not null default now(),
  constraint plazo_fijo_con_fin check (modalidad_contratacion <> 'plazo_fijo' or fecha_fin_contrato is not null),
  unique (empresa_id, dni)
);

alter table usuarios
  add constraint usuarios_empleado_fk foreign key (empleado_id) references empleados (id) on delete set null;

create table documentos_legajo (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  empleado_id uuid not null references empleados (id) on delete cascade,
  categoria categoria_documento not null default 'otro',
  nombre text not null,
  archivo_url text not null,
  fecha_vencimiento date,
  creado_en timestamptz not null default now()
);

create table recibos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  empleado_id uuid not null references empleados (id) on delete cascade,
  periodo text not null, -- YYYY-MM
  archivo_url text not null,
  estado_firma estado_firma not null default 'pendiente',
  firmado_en timestamptz,
  unique (empleado_id, periodo)
);

create table remuneraciones (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  empleado_id uuid not null references empleados (id) on delete cascade,
  periodo text not null,
  monto_bruto numeric(14, 2) not null,
  monto_neto numeric(14, 2) not null,
  unique (empleado_id, periodo)
);

create table ausencias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  empleado_id uuid not null references empleados (id) on delete cascade,
  tipo tipo_ausencia not null,
  fecha_desde date not null,
  fecha_hasta date not null,
  dias int not null,
  estado estado_ausencia not null default 'pendiente',
  adjuntos jsonb not null default '[]'::jsonb,
  comentario_empleado text,
  resuelta_por uuid references usuarios (id),
  comentario_resolucion text,
  resuelta_en timestamptz,
  creada_en timestamptz not null default now(),
  constraint rango_valido check (fecha_hasta >= fecha_desde)
);

create table fichajes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  empleado_id uuid not null references empleados (id) on delete cascade,
  tipo tipo_fichaje not null,
  ts timestamptz not null default now(),
  metodo metodo_fichaje not null default 'celular',
  foto_url text,
  geo jsonb, -- { lat, lng }
  dispositivo_id text
);

create table eventos_agenda (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  tipo tipo_evento not null default 'evento',
  titulo text not null,
  fecha date not null,
  descripcion text,
  creado_en timestamptz not null default now()
);

create table alertas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  empleado_id uuid references empleados (id) on delete cascade,
  tipo tipo_alerta not null default 'custom',
  titulo text not null,
  fecha date not null,
  dias_aviso int not null default 30,
  estado estado_alerta not null default 'pendiente'
);

create table notificaciones (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios (id) on delete cascade,
  tipo tipo_notificacion not null default 'general',
  titulo text not null,
  cuerpo text not null default '',
  link text,
  leida boolean not null default false,
  creada_en timestamptz not null default now()
);

-- Configuración general de la plataforma (una sola fila, superadmin).
create table config_plataforma (
  id int primary key default 1 check (id = 1),
  config jsonb not null default '{
    "metodosFichajeDefault": ["celular"],
    "toleranciaDefaultMin": 10,
    "horaEntradaDefault": "08:00",
    "horaSalidaDefault": "17:00",
    "diasAvisoDefault": 30,
    "emailAvisos": "",
    "pushHabilitado": false,
    "resumenSemanalEmail": false
  }'::jsonb
);
insert into config_plataforma (id) values (1);

-- ---------- Índices ----------

create index empleados_empresa_idx on empleados (empresa_id) where activo;
create index ausencias_empresa_estado_idx on ausencias (empresa_id, estado);
create index ausencias_empleado_idx on ausencias (empleado_id);
create index fichajes_empresa_ts_idx on fichajes (empresa_id, ts desc);
create index fichajes_empleado_ts_idx on fichajes (empleado_id, ts desc);
create index recibos_empleado_idx on recibos (empleado_id);
create index documentos_empleado_idx on documentos_legajo (empleado_id);
create index eventos_empresa_fecha_idx on eventos_agenda (empresa_id, fecha);
create index alertas_empresa_fecha_idx on alertas (empresa_id, fecha);
create index notificaciones_usuario_idx on notificaciones (usuario_id, leida);

-- ---------- Helpers para RLS ----------
-- security definer para no recursar sobre las policies de usuarios.

create or replace function auth_rol()
returns rol_usuario
language sql stable security definer set search_path = public
as $$
  select rol from usuarios where id = auth.uid();
$$;

create or replace function auth_empresa()
returns uuid
language sql stable security definer set search_path = public
as $$
  select empresa_id from usuarios where id = auth.uid();
$$;

create or replace function auth_empleado()
returns uuid
language sql stable security definer set search_path = public
as $$
  select empleado_id from usuarios where id = auth.uid();
$$;

create or replace function es_superadmin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(auth_rol() = 'superadmin', false);
$$;

create or replace function es_gestor()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(auth_rol() in ('superadmin', 'admin_rrhh', 'supervisor'), false);
$$;

-- ---------- RLS ----------

alter table empresas enable row level security;
alter table usuarios enable row level security;
alter table empleados enable row level security;
alter table documentos_legajo enable row level security;
alter table recibos enable row level security;
alter table remuneraciones enable row level security;
alter table ausencias enable row level security;
alter table fichajes enable row level security;
alter table eventos_agenda enable row level security;
alter table alertas enable row level security;
alter table notificaciones enable row level security;
alter table config_plataforma enable row level security;

-- Empresas: superadmin todo; el resto ve la suya.
create policy empresas_select on empresas for select
  using (es_superadmin() or id = auth_empresa());
create policy empresas_superadmin on empresas for all
  using (es_superadmin()) with check (es_superadmin());
create policy empresas_update_admin on empresas for update
  using (auth_rol() = 'admin_rrhh' and id = auth_empresa())
  with check (id = auth_empresa());

-- Usuarios: cada uno se ve; gestores ven su empresa; superadmin todo.
create policy usuarios_select on usuarios for select
  using (id = auth.uid() or es_superadmin() or (es_gestor() and empresa_id = auth_empresa()));
create policy usuarios_admin on usuarios for all
  using (es_superadmin() or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa()))
  with check (es_superadmin() or empresa_id = auth_empresa());

-- Empleados: el empleado ve su ficha; gestores gestionan su empresa.
create policy empleados_select on empleados for select
  using (
    es_superadmin()
    or (empresa_id = auth_empresa() and (es_gestor() or id = auth_empleado()))
  );
create policy empleados_gestion on empleados for all
  using (es_superadmin() or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa()))
  with check (es_superadmin() or empresa_id = auth_empresa());

-- Documentos del legajo: dueño ve los suyos; gestores los de su empresa.
create policy documentos_select on documentos_legajo for select
  using (
    es_superadmin()
    or (empresa_id = auth_empresa() and (es_gestor() or empleado_id = auth_empleado()))
  );
create policy documentos_gestion on documentos_legajo for all
  using (es_superadmin() or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa()))
  with check (es_superadmin() or empresa_id = auth_empresa());

-- Recibos: dueño ve y firma los suyos; admin gestiona.
create policy recibos_select on recibos for select
  using (
    es_superadmin()
    or (empresa_id = auth_empresa() and (es_gestor() or empleado_id = auth_empleado()))
  );
create policy recibos_firma on recibos for update
  using (empleado_id = auth_empleado())
  with check (empleado_id = auth_empleado());
create policy recibos_gestion on recibos for all
  using (es_superadmin() or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa()))
  with check (es_superadmin() or empresa_id = auth_empresa());

-- Remuneraciones: solo admin (y el propio empleado la suya).
create policy remuneraciones_select on remuneraciones for select
  using (
    es_superadmin()
    or (empresa_id = auth_empresa() and (auth_rol() = 'admin_rrhh' or empleado_id = auth_empleado()))
  );
create policy remuneraciones_gestion on remuneraciones for all
  using (es_superadmin() or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa()))
  with check (es_superadmin() or empresa_id = auth_empresa());

-- Ausencias: el empleado crea y ve las suyas; gestores resuelven en su empresa.
create policy ausencias_select on ausencias for select
  using (
    es_superadmin()
    or (empresa_id = auth_empresa() and (es_gestor() or empleado_id = auth_empleado()))
  );
create policy ausencias_solicitar on ausencias for insert
  with check (empleado_id = auth_empleado() and empresa_id = auth_empresa());
create policy ausencias_gestion on ausencias for update
  using (es_superadmin() or (es_gestor() and empresa_id = auth_empresa()))
  with check (es_superadmin() or empresa_id = auth_empresa());

-- Fichajes: el empleado ficha y ve los suyos; gestores ven su empresa.
create policy fichajes_select on fichajes for select
  using (
    es_superadmin()
    or (empresa_id = auth_empresa() and (es_gestor() or empleado_id = auth_empleado()))
  );
create policy fichajes_fichar on fichajes for insert
  with check (empleado_id = auth_empleado() and empresa_id = auth_empresa());

-- Agenda: toda la empresa la ve; gestores la administran.
create policy eventos_select on eventos_agenda for select
  using (es_superadmin() or empresa_id = auth_empresa());
create policy eventos_gestion on eventos_agenda for all
  using (es_superadmin() or (es_gestor() and empresa_id = auth_empresa()))
  with check (es_superadmin() or empresa_id = auth_empresa());

-- Alertas: solo gestores.
create policy alertas_select on alertas for select
  using (es_superadmin() or (es_gestor() and empresa_id = auth_empresa()));
create policy alertas_gestion on alertas for all
  using (es_superadmin() or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa()))
  with check (es_superadmin() or empresa_id = auth_empresa());

-- Notificaciones: cada usuario las suyas.
create policy notificaciones_propias on notificaciones for select
  using (usuario_id = auth.uid());
create policy notificaciones_marcar on notificaciones for update
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- Config de plataforma: solo superadmin.
create policy config_superadmin on config_plataforma for all
  using (es_superadmin()) with check (es_superadmin());

-- ---------- Storage (fotos, documentos, recibos, logos) ----------

insert into storage.buckets (id, name, public)
values
  ('logos', 'logos', true),
  ('fotos', 'fotos', false),
  ('documentos', 'documentos', false),
  ('recibos-pdf', 'recibos-pdf', false)
on conflict (id) do nothing;

-- Los archivos van bajo <empresa_id>/... : la primera carpeta define el tenant.
create policy storage_select on storage.objects for select
  using (
    bucket_id = 'logos'
    or es_superadmin()
    or (name like auth_empresa()::text || '/%')
  );
create policy storage_insert on storage.objects for insert
  with check (
    es_superadmin()
    or (es_gestor() and name like auth_empresa()::text || '/%')
  );
create policy storage_delete on storage.objects for delete
  using (
    es_superadmin()
    or (auth_rol() = 'admin_rrhh' and name like auth_empresa()::text || '/%')
  );
