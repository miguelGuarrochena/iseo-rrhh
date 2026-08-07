-- Índices que faltan y constraints de integridad.
--
-- Casi todas las tablas se consultan filtrando por `empresa_id` —RLS lo
-- exige siempre— pero varias sólo tenían índice por `empleado_id` o
-- directamente ninguno. Con decenas de empleados no se nota; con miles
-- de recibos y remuneraciones cada carga de grilla es un scan.

-- ---------------------------------------------------------------------
-- Índices
-- ---------------------------------------------------------------------

-- `getRecibosTodos()` filtra por empresa + vigentes y ordena por período.
-- El índice parcial deja afuera los archivados, que son la mayoría con el
-- tiempo y nunca aparecen en esa pantalla.
create index if not exists recibos_empresa_periodo_idx
  on recibos (empresa_id, periodo desc)
  where archivado_en is null;

-- `getRemuneracionesTodas()`: mismo patrón.
create index if not exists remuneraciones_empresa_periodo_idx
  on remuneraciones (empresa_id, periodo desc);

-- `getTurnosEntre()` (control de jornadas) filtra por empresa y rango de
-- fechas. Había índices sueltos de empleado y de fecha, pero no el
-- compuesto que esta consulta necesita.
create index if not exists turnos_empresa_fecha_idx
  on turnos (empresa_id, fecha);

-- El hilo de mensajes se lee por comunicación, y la policy de
-- `comunicacion_mensajes` hace un `exists` contra `comunicaciones` en
-- cada fila. Sin este índice eso escala con el total de mensajes de la
-- empresa, no con los del hilo — y encima tiene Realtime encima.
create index if not exists comunicacion_mensajes_hilo_idx
  on comunicacion_mensajes (comunicacion_id, creado_en);

create index if not exists comunicaciones_empresa_idx
  on comunicaciones (empresa_id, creado_en desc);

create index if not exists documentos_firma_empresa_idx
  on documentos_firma (empresa_id, creado_en desc);

-- "Mis documentos pendientes de firma": se entra por empleado. El único
-- índice que había era el unique (documento_id, empleado_id), que para
-- este acceso obliga a recorrerlo entero.
create index if not exists doc_firma_dest_empleado_idx
  on documento_firma_destinatarios (empleado_id);

create index if not exists adelantos_empresa_idx
  on adelantos (empresa_id, periodo desc);

-- ---------------------------------------------------------------------
-- Constraints de integridad
--
-- Van como NOT VALID a propósito: validan lo que entra de ahora en más
-- sin escanear lo que ya está. Es deliberado — al mergear a main estas
-- migraciones corren solas contra la base productiva, y una constraint
-- que falla por una fila vieja mal formada dejaría el deploy a mitad de
-- camino. Cuando los datos estén revisados se corre el VALIDATE, que sí
-- escanea pero no bloquea escrituras.
-- ---------------------------------------------------------------------

-- Un sueldo negativo es siempre un bug de carga, nunca un dato real.
-- `adelantos.monto` y `descuentos_recurrentes.monto` ya tenían su check;
-- las remuneraciones, que son el monto que más importa, no.
alter table remuneraciones
  add constraint remuneraciones_montos_no_negativos
  check (
    monto_bruto >= 0
    and monto_neto >= 0
    and no_remunerativo >= 0
    and aportes >= 0
    and otros_descuentos >= 0
  ) not valid;

-- `periodo` es texto libre en seis tablas y en todas se espera 'YYYY-MM'.
-- Un valor con otro formato no rompe nada visible: simplemente no entra
-- en ninguna agregación por período y el mes aparece vacío.
alter table remuneraciones
  add constraint remuneraciones_periodo_formato
  check (periodo ~ '^\d{4}-(0[1-9]|1[0-2])$') not valid;

alter table recibos
  add constraint recibos_periodo_formato
  check (periodo ~ '^\d{4}-(0[1-9]|1[0-2])$') not valid;

alter table adelantos
  add constraint adelantos_periodo_formato
  check (periodo ~ '^\d{4}-(0[1-9]|1[0-2])$') not valid;

-- La fecha de baja no puede ser anterior al ingreso.
alter table empleados
  add constraint empleados_baja_posterior_al_ingreso
  check (fecha_baja is null or fecha_baja >= fecha_ingreso) not valid;

-- ---------------------------------------------------------------------
-- Integridad referencial: FKs que bloquean el offboarding
--
-- `notas_internas.autor_id` y `ausencias.resuelta_por` apuntan a
-- `usuarios` sin `on delete`, o sea NO ACTION. Como `usuarios` cascadea
-- desde `auth.users`, borrar a alguien del staff que alguna vez resolvió
-- una ausencia fallaba por violación de FK. `documentos_firma.creado_por`
-- y `auditoria_acciones.actor_id` ya usan `set null`: esto los alinea.
-- ---------------------------------------------------------------------

alter table notas_internas
  drop constraint if exists notas_internas_autor_id_fkey;
alter table notas_internas
  add constraint notas_internas_autor_id_fkey
  foreign key (autor_id) references usuarios(id) on delete set null;

alter table ausencias
  drop constraint if exists ausencias_resuelta_por_fkey;
alter table ausencias
  add constraint ausencias_resuelta_por_fkey
  foreign key (resuelta_por) references usuarios(id) on delete set null;
