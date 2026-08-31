-- ============================================================
-- Importación de liquidaciones: dónde cae lo que trae el estudio.
--
-- El problema
-- -----------
-- `remuneraciones` tiene tres importes: bruto, no remunerativo y
-- descuentos. La planilla del estudio contable trae el desglose —básico,
-- antigüedad, presentismo, extras, adicionales—, y esos conceptos suman
-- dentro del bruto. Si se importaran a una tabla propia habría dos
-- fuentes para el mismo período y ninguna sería la buena.
--
-- La decisión
-- -----------
-- Los conceptos se suman a los campos que ya existen —eso sigue siendo
-- la única fuente de verdad para liquidar— y el desglose se guarda al
-- lado, en `detalle`, para no perder lo que el estudio informó. No es
-- una segunda fuente: nada lo lee para calcular. Es la trazabilidad de
-- de dónde salió el bruto.
--
-- `origen` distingue lo cargado a mano de lo importado. Sirve para que
-- RRHH sepa qué está por pisar cuando reimporta un mes, que es la
-- situación en la que se rompen los datos.
--
-- Lo que NO agrega
-- ----------------
-- Ninguna regla nueva de aislamiento ni de período. Ya existen y siguen
-- valiendo tal cual: `trg_assert_empleado_de_empresa` impide adjuntar
-- una remuneración al empleado de otra empresa, `bloquear_periodo_cerrado`
-- impide escribir en un mes cerrado, y `remuneraciones_unica_idx`
-- (empleado, período, tipo) impide duplicar. La importación pasa por los
-- tres como cualquier otra escritura.
--
-- Idempotente.
-- ============================================================

alter table public.remuneraciones
  add column if not exists detalle jsonb,
  add column if not exists origen text not null default 'manual';

comment on column public.remuneraciones.detalle is
  'Desglose informado por el estudio contable (básico, antigüedad, '
  'presentismo, extras, adicionales, descuentos). Es trazabilidad: los '
  'importes que valen para liquidar son las columnas, no esto.';
comment on column public.remuneraciones.origen is
  'De dónde salió la fila: cargada a mano o importada de una planilla.';

alter table public.remuneraciones drop constraint if exists remuneraciones_origen_valido;
alter table public.remuneraciones
  add constraint remuneraciones_origen_valido
  check (origen in ('manual', 'importacion'))
  not valid;

/*
 * El desglose es un objeto de conceptos, no una lista ni un número. Sin
 * esto, un `detalle` con cualquier forma pasaría y la pantalla que lo
 * muestra tendría que defenderse de todo.
 */
alter table public.remuneraciones drop constraint if exists remuneraciones_detalle_objeto;
alter table public.remuneraciones
  add constraint remuneraciones_detalle_objeto
  check (detalle is null or jsonb_typeof(detalle) = 'object')
  not valid;

notify pgrst, 'reload schema';
