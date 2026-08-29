-- ============================================================
-- F-20 — Validar las constraints que la migración 51 dejó NOT VALID.
--
-- NO es una migración. Vive fuera de `migrations/` a propósito: un
-- `VALIDATE CONSTRAINT` escanea la tabla y **falla** si hay una sola fila
-- vieja que no cumple. Corriéndolo en el deploy, esa falla dejaría la
-- migración a mitad de camino, que es exactamente lo que la migración 51
-- quiso evitar cuando las creó como NOT VALID.
--
-- Cómo usarlo
-- -----------
--   1. Correr el BLOQUE 1 (sólo lecturas). Devuelve las filas que
--      incumplen cada constraint. Si todo da cero, seguir.
--   2. Si alguna devuelve filas, corregirlas con RRHH — no desde acá:
--      son datos del cliente y hay que saber cuál es el valor correcto.
--   3. Correr el BLOQUE 2, que valida. No bloquea escrituras: toma un
--      SHARE UPDATE EXCLUSIVE, así que la app sigue andando mientras
--      escanea.
--
-- Idempotente: `validate constraint` sobre una constraint ya validada no
-- hace nada.
-- ============================================================

-- ------------------------------------------------------------
-- BLOQUE 1 — Diagnóstico. Sólo lecturas.
-- ------------------------------------------------------------

-- Montos negativos en remuneraciones.
select 'remuneraciones_montos_no_negativos' as constraint_,
       count(*) as filas_que_incumplen
  from remuneraciones
 where not (
   monto_bruto >= 0
   and monto_neto >= 0
   and no_remunerativo >= 0
   and aportes >= 0
   and otros_descuentos >= 0
 );

-- Períodos con formato distinto de YYYY-MM.
select 'remuneraciones_periodo_formato' as constraint_, count(*) as filas_que_incumplen
  from remuneraciones where periodo !~ '^\d{4}-(0[1-9]|1[0-2])$'
union all
select 'recibos_periodo_formato', count(*)
  from recibos where periodo !~ '^\d{4}-(0[1-9]|1[0-2])$'
union all
select 'adelantos_periodo_formato', count(*)
  from adelantos where periodo is not null
    and periodo !~ '^\d{4}-(0[1-9]|1[0-2])$';

-- Bajas anteriores al ingreso.
select 'empleados_baja_posterior_al_ingreso' as constraint_,
       count(*) as filas_que_incumplen
  from empleados
 where fecha_baja is not null and fecha_baja < fecha_ingreso;

-- El detalle de las que incumplen, para poder arreglarlas.
-- (Descomentar la que haga falta.)
--
-- select id, empresa_id, empleado_id, periodo, monto_bruto, monto_neto,
--        no_remunerativo, aportes, otros_descuentos
--   from remuneraciones
--  where not (monto_bruto >= 0 and monto_neto >= 0 and no_remunerativo >= 0
--             and aportes >= 0 and otros_descuentos >= 0);
--
-- select id, empresa_id, nombre, apellido, fecha_ingreso, fecha_baja
--   from empleados
--  where fecha_baja is not null and fecha_baja < fecha_ingreso;

-- ------------------------------------------------------------
-- BLOQUE 2 — Validación. Correr sólo con el bloque 1 en cero.
-- ------------------------------------------------------------

-- alter table remuneraciones validate constraint remuneraciones_montos_no_negativos;
-- alter table remuneraciones validate constraint remuneraciones_periodo_formato;
-- alter table recibos        validate constraint recibos_periodo_formato;
-- alter table adelantos      validate constraint adelantos_periodo_formato;
-- alter table empleados      validate constraint empleados_baja_posterior_al_ingreso;
