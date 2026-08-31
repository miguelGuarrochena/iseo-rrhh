-- ============================================================
-- Embargo judicial: marcarlo en el descuento que lo materializa.
--
-- Qué resuelve
-- ------------
-- El art. 133 de la LCT topea las deducciones en el 20% de la
-- remuneración en dinero, y `errorDeLimitesLiquidacion` lo hacía cumplir
-- bloqueando la carga. Está bien como regla general, pero deja afuera el
-- caso que el cliente planteó: **un embargo judicial puede superar ese
-- tope** (el art. 120 y el decreto 484/87 fijan su propia escala sobre el
-- salario mínimo), y ahí el tope general no es la regla que manda.
--
-- Con el bloqueo puesto, RRHH no podía cargar la liquidación de alguien
-- embargado. La decisión del cliente fue: que avise, no que bloquee.
--
-- Por qué acá y no en `empleados`
-- -------------------------------
-- El embargo no es un atributo de la persona: es un descuento concreto,
-- con un concepto, un monto y una vigencia, que ya se modela en
-- `descuentos_recurrentes`. Marcarlo ahí da trazabilidad —se ve cuál de
-- los descuentos es el embargo y por cuánto— sin duplicar nada. Un flag
-- en el legajo diría "tiene un embargo" sin decir cuál.
--
-- Qué NO hace
-- -----------
-- No calcula la escala del decreto 484/87 ni topea el embargo por su
-- cuenta: cuánto se retiene lo fija el oficio judicial y lo carga RRHH.
-- El sistema registra, avisa y deja rastro.
--
-- Idempotente.
-- ============================================================

alter table descuentos_recurrentes
  add column if not exists es_embargo boolean not null default false;

comment on column descuentos_recurrentes.es_embargo is
  'El descuento responde a un embargo judicial u otra deducción '
  'autorizada que puede superar el tope del 20% del art. 133 LCT. '
  'No cambia ningún cálculo: habilita la advertencia en vez del bloqueo.';

-- Para encontrar rápido si un legajo tiene embargo vigente al liquidar.
create index if not exists descuentos_embargo_idx
  on descuentos_recurrentes (empleado_id)
  where es_embargo;

notify pgrst, 'reload schema';
