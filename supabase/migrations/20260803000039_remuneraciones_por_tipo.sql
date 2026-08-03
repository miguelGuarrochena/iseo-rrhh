-- ============================================================
-- Remuneraciones: varias por mes, igual que ya se resolvió para
-- Recibos (ver 20260727000026_recibos_por_tipo_y_version.sql).
--
-- El modelo asumía "una remuneración = un mes" (unique (empleado_id,
-- periodo)). Eso impedía generar el aguinaldo (SAC) como una
-- remuneración propia: cargarlo para junio pisaba el sueldo mensual
-- de junio en vez de sumarse como una línea aparte.
--
-- Reutiliza el mismo enum tipo_recibo (mensual/sac/vacaciones/
-- gratificacion/liquidacion_final) que ya existe para recibos: es el
-- mismo concepto aplicado a la remuneración en vez de al PDF.
-- ============================================================

alter table remuneraciones
  add column if not exists tipo tipo_recibo not null default 'mensual';

alter table remuneraciones drop constraint if exists remuneraciones_empleado_id_periodo_key;

create unique index if not exists remuneraciones_unica_idx
  on remuneraciones (empleado_id, periodo, tipo);

comment on column remuneraciones.tipo is
  'Mensual, SAC, vacaciones, gratificación o liquidación final. Junto con el período, evita que el aguinaldo pise el sueldo del mismo mes.';

notify pgrst, 'reload schema';
