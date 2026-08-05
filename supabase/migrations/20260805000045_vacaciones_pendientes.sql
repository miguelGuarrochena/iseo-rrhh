-- ============================================================
-- Días de vacaciones pendientes de años anteriores.
--
-- Pedido del cliente, textual: "si no se tomó vacaciones que se le
-- sumen al período que arranca. Por ej en 2025 le quedaron 7 días
-- pendientes, en las vacaciones correspondientes al 2026 se le
-- acumulen las anteriores. (…) A lo sumo si se dejan cargarlas en un
-- ítem de días de vacaciones pendientes. Creo que ahí sería más
-- fácil, se termina el año y se cargan las vacaciones que no usó."
--
-- Se hace así, cargado a mano, y no calculado solo. El motivo es que
-- el arrastre de vacaciones no es automático en la LCT: el art. 164
-- deja acumular como máximo un tercio del período inmediatamente
-- anterior, y el resto caduca. Calcularlo solo obligaría a decidir
-- por el cliente qué días caducaron y cuáles no, con la ley de un
-- lado y lo que el cliente arregló con su gente del otro. Cargarlo a
-- mano deja esa decisión donde corresponde y queda registrado quién
-- la tomó.
--
-- Una fila por empleado y año destino: "a este empleado, para el
-- período 2026, se le suman 7 días que le quedaron de antes".
-- ============================================================

create table if not exists vacaciones_pendientes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  empleado_id uuid not null references empleados (id) on delete cascade,
  -- Año al que se le suman los días (el período que arranca).
  anio int not null check (anio between 2000 and 2100),
  dias int not null check (dias >= 0 and dias <= 365),
  -- Por qué quedaron pendientes. Sirve cuando alguien pregunta dos
  -- años después de dónde salieron esos días.
  motivo text,
  cargado_por uuid references usuarios (id),
  creado_en timestamptz not null default now(),
  unique (empleado_id, anio)
);

create index if not exists vacaciones_pendientes_empresa_idx
  on vacaciones_pendientes (empresa_id, anio);

alter table vacaciones_pendientes enable row level security;

-- El empleado ve los suyos: es parte de su saldo y tiene que poder
-- entender de dónde sale el número que le muestra la app.
drop policy if exists vacaciones_pendientes_select on vacaciones_pendientes;
create policy vacaciones_pendientes_select on vacaciones_pendientes for select
  using (
    es_superadmin()
    or (empresa_id = auth_empresa()
        and (es_gestor() or empleado_id = auth_empleado()))
  );

-- Cargarlos y corregirlos es de RRHH: es un ajuste sobre el saldo.
drop policy if exists vacaciones_pendientes_gestion on vacaciones_pendientes;
create policy vacaciones_pendientes_gestion on vacaciones_pendientes for all
  using (
    es_superadmin()
    or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa())
  )
  with check (
    es_superadmin()
    or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa())
  );

notify pgrst, 'reload schema';
