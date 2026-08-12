-- ============================================================
-- Sembrar feriados nacionales 2026–2027 en todas las empresas.
--
-- La migración 71 sólo creó la RPC: no insertaba filas. Si el front
-- todavía no llama a asegurar_feriados_nacionales, la agenda queda
-- vacía aunque la función exista. Acá se cargan los nacionales del
-- año en curso y el siguiente para cada empresa (idempotente).
-- ============================================================

with nacionales (fecha, nombre) as (
  values
    -- 2026
    ('2026-01-01'::date, 'Año Nuevo'),
    ('2026-02-16'::date, 'Carnaval'),
    ('2026-02-17'::date, 'Carnaval'),
    ('2026-03-24'::date, 'Día de la Memoria'),
    ('2026-04-02'::date, 'Día del Veterano y de los Caídos en Malvinas'),
    ('2026-04-03'::date, 'Viernes Santo'),
    ('2026-05-01'::date, 'Día del Trabajador'),
    ('2026-05-25'::date, 'Día de la Revolución de Mayo'),
    ('2026-06-15'::date, 'Paso a la Inmortalidad del Gral. Don Martín Miguel de Güemes'),
    ('2026-06-20'::date, 'Paso a la Inmortalidad del Gral. Belgrano'),
    ('2026-07-09'::date, 'Día de la Independencia'),
    ('2026-08-17'::date, 'Paso a la Inmortalidad del Gral. Don José de San Martín'),
    ('2026-10-12'::date, 'Día del Respeto a la Diversidad Cultural'),
    ('2026-11-23'::date, 'Día de la Soberanía Nacional'),
    ('2026-12-08'::date, 'Inmaculada Concepción de María'),
    ('2026-12-25'::date, 'Navidad'),
    -- 2027
    ('2027-01-01'::date, 'Año Nuevo'),
    ('2027-02-08'::date, 'Carnaval'),
    ('2027-02-09'::date, 'Carnaval'),
    ('2027-03-24'::date, 'Día de la Memoria'),
    ('2027-03-26'::date, 'Viernes Santo'),
    ('2027-04-02'::date, 'Día del Veterano y de los Caídos en Malvinas'),
    ('2027-05-01'::date, 'Día del Trabajador'),
    ('2027-05-25'::date, 'Día de la Revolución de Mayo'),
    ('2027-06-20'::date, 'Paso a la Inmortalidad del Gral. Belgrano'),
    ('2027-06-21'::date, 'Paso a la Inmortalidad del Gral. Don Martín Miguel de Güemes'),
    ('2027-07-09'::date, 'Día de la Independencia'),
    ('2027-08-16'::date, 'Paso a la Inmortalidad del Gral. Don José de San Martín'),
    ('2027-10-11'::date, 'Día del Respeto a la Diversidad Cultural'),
    ('2027-11-20'::date, 'Día de la Soberanía Nacional'),
    ('2027-12-08'::date, 'Inmaculada Concepción de María'),
    ('2027-12-25'::date, 'Navidad')
)
insert into feriados (empresa_id, fecha, nombre, tipo, no_laborable)
select e.id, n.fecha, n.nombre, 'nacional'::tipo_feriado, true
from empresas e
cross join nacionales n
on conflict (empresa_id, fecha) do nothing;
