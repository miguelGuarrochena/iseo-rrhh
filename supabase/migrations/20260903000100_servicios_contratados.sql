-- ============================================================
-- Servicios contratados por empresa (el primero: la asesoría de ISEO).
--
-- Por qué una columna nueva y no algo de lo que ya hay
-- ---------------------------------------------------
--   * `config.modulos` es lo que la empresa **usa** de la app, y lo
--     escribe su propio admin_rrhh desde Configuración. Un servicio que
--     se contrata no puede vivir ahí: el cliente se lo prendería solo.
--   * `plan` es texto libre y `abono_mensual` un número: describen lo
--     comercial, no habilitan nada. Atar una capacidad a que el plan se
--     llame "Full" es adivinar con strings.
--   * Un booleano suelto (`servicio_asesoria`) resolvía hoy y obligaba a
--     una migración por cada servicio que venga después.
--
-- Queda entonces `empresas.servicios`: una bolsa de capacidades
-- contratadas, `{"asesoria": true}`. Sumar un servicio más adelante es
-- agregar una clave, sin tocar el esquema.
--
-- Diferencia con los módulos, y es a propósito:
--   * módulo ausente = ENCENDIDO. Apagar es una decisión explícita del
--     cliente sobre algo que ya tiene.
--   * servicio ausente = NO CONTRATADO. Prenderlo es una decisión
--     explícita de ISEO sobre algo que se vende aparte.
--   Por eso las empresas que ya existen quedan sin ningún servicio, que
--   es exactamente su situación real.
--
-- Autoridad en la base, no en la UI
-- ---------------------------------
-- La policy `empresas_update_admin` deja que el admin_rrhh actualice la
-- fila de SU empresa sin restricción de columnas. Esconder el
-- interruptor no alcanzaría: con un PATCH a mano el cliente se
-- habilitaría el servicio. Quien lo impide es el trigger
-- `columnas_de_iseo` de la migración 101, que protege ésta y el resto de
-- las columnas comerciales con un solo criterio.
--
-- Idempotente.
-- ============================================================

alter table empresas
  add column if not exists servicios jsonb not null default '{}'::jsonb;

comment on column empresas.servicios is
  'Servicios contratados a ISEO, p. ej. {"asesoria": true}. Clave ausente '
  '= no contratado. Sólo el superadmin puede cambiarla (trigger '
  'columnas_de_iseo, migración 101).';

-- El corte por columna —quién puede cambiar `servicios` y el resto de lo
-- comercial— lo pone la migración 101, que lo resuelve para todas las
-- columnas de ISEO a la vez. Acá sólo se agrega la columna: separarlo así
-- evita tener dos triggers sobre `empresas` diciendo lo mismo.

notify pgrst, 'reload schema';
