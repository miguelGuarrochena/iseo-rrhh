-- ============================================================
-- L-03: maternidad, nacimiento y excedencia son licencias propias.
--
-- Qué pasaba
-- ----------
-- El enum `tipo_ausencia` no las tenía, así que en la práctica se
-- cargaban como `especial`. Y `especial` es uno de los tipos con cupo
-- anual configurable: una empresa que hubiera puesto, por ejemplo, cinco
-- días de licencia especial hacía que el trigger de cupos rechazara una
-- maternidad de noventa días.
--
-- Por qué van acá solas
-- ---------------------
-- `alter type … add value` no puede usarse en la misma transacción en la
-- que se agrega. Todo lo que nombre estos valores —la lista de licencias
-- por evento, el saldo, el trigger— vive en la migración siguiente.
--
-- Alcance
-- -------
-- Esta migración SÓLO agrega valores al enum. No convierte ninguna fila
-- existente: reclasificar una ausencia ya cargada es una decisión de
-- RRHH, caso por caso, y no algo que deba pasar solo en un deploy.
--
-- Idempotente.
-- ============================================================

alter type tipo_ausencia add value if not exists 'maternidad';
alter type tipo_ausencia add value if not exists 'nacimiento';
alter type tipo_ausencia add value if not exists 'excedencia';

notify pgrst, 'reload schema';
