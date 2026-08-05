-- ============================================================
-- Régimen laboral de la empresa (las "dos formas" que pidió el
-- cliente: una en blanco y otra para el emprendedor).
--
-- Contexto del pedido: hay clientes chicos —el caso concreto fue
-- Joaco Mendi— que no liquidan bajo relación de dependencia. Le
-- sirve que la gente fiche en la tablet y llevar ausencias y pagos
-- para sacar métricas, pero la pantalla de remuneración actual le
-- descuenta jubilación, PAMI y obra social sobre un sueldo que no
-- tiene aportes, así que el neto que muestra no es el que paga.
--
-- Se resuelve con UN flag por empresa, no por empleado. Es lo que
-- pidió el cliente y además es lo honesto: una empresa liquida de
-- una forma o de la otra, y mezclar los dos criterios en la misma
-- razón social es justo lo que después no se puede explicar.
--
-- Qué cambia con 'simplificado':
--   * Remuneración: sin aportes de ley; el neto es lo que se paga.
--   * Aparece "monotributo a cargo de la empresa" como costo del
--     período (se apoya en `facturas_monotributo`, que ya existe).
--   * Los colaboradores pueden quedar sin cuenta de usuario: fichan
--     en la tablet y no acceden a recibos, legajo ni documentos.
--
-- Qué NO cambia: fichaje, ausencias, feriados, reportes. Toda la
-- parte de control es igual en los dos regímenes.
--
-- Las empresas que ya existen quedan en 'relacion_dependencia', que
-- es como venían funcionando.
-- ============================================================

do $$ begin
  create type regimen_laboral as enum ('relacion_dependencia', 'simplificado');
exception when duplicate_object then null;
end $$;

alter table empresas
  add column if not exists regimen regimen_laboral not null
    default 'relacion_dependencia';

comment on column empresas.regimen is
  'relacion_dependencia = liquidación con aportes de ley (default). '
  'simplificado = monotributo/pago directo: sin descuentos de ley y con '
  'el costo del monotributo a cargo de la empresa como concepto aparte.';

-- ---------- Empleados sin cuenta de usuario ----------
-- En el régimen simplificado el cliente prefiere no darle acceso a la
-- app a la gente. La ficha del colaborador y el fichaje facial en la
-- tablet funcionan igual sin usuario: lo único que se apaga es el
-- login propio. Se guarda explícito en vez de deducirlo de "no tiene
-- usuario asociado", porque son dos cosas distintas: uno es el estado
-- (todavía no lo invité) y el otro la decisión (no va a tener).
alter table empleados
  add column if not exists sin_usuario boolean not null default false;

comment on column empleados.sin_usuario is
  'El colaborador no va a tener cuenta en la app: ficha en la terminal '
  'y RRHH le carga todo. No se le mandan invitaciones ni documentos '
  'para firmar.';

-- ---------- Monotributo a cargo de la empresa ----------
-- `facturas_monotributo` ya guarda la cuota del período. Faltaba
-- distinguir quién la paga: si la paga el colaborador es un dato
-- administrativo, y si la paga la empresa es costo laboral y tiene
-- que sumar al costo del período.
alter table facturas_monotributo
  add column if not exists a_cargo_empresa boolean not null default false;

comment on column facturas_monotributo.a_cargo_empresa is
  'La cuota la paga la empresa (suma al costo laboral del período) en '
  'vez del colaborador.';

notify pgrst, 'reload schema';
