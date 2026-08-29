-- ============================================================
-- Vacaciones legales (LCT arts. 150-153) y no regresión de la modalidad
-- de días hábiles.
--
-- Por qué esto importa del lado de la base y no sólo del cliente:
-- `exigir_saldo_vacaciones_al_insertar` rechaza una solicitud si pide más
-- días de los que quedan, y ese saldo sale de estas funciones. Si la base
-- y el cliente no calculan lo mismo, la pantalla ofrece días que el
-- trigger después rechaza.
--
-- Los números esperados son los mismos que fija
-- `src/tests/vacacionesLegales.test.ts`: es el test de paridad entre las
-- dos implementaciones de la misma regla.
--
-- Cómo se corre
-- -------------
--   supabase start && supabase db reset
--   docker exec -i supabase_db_<proyecto> psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f supabase/tests/vacaciones_legales.test.sql
-- ============================================================

\set ON_ERROR_STOP on
begin;

-- ============================================================
-- Art. 150 — los cortes son "hasta N años", no "menos de N"
-- ============================================================
do $$
begin
  assert tramo_legal_art150('2021-12-31', '2026-12-31') = 14,
    '5 años exactos al 31/12 son 14 días, no 21';
  assert tramo_legal_art150('2021-12-30', '2026-12-31') = 21,
    '5 años y 1 día son 21';
  assert tramo_legal_art150('2016-12-31', '2026-12-31') = 21,
    '10 años exactos son 21, no 28';
  assert tramo_legal_art150('2016-12-30', '2026-12-31') = 28,
    '10 años y 1 día son 28';
  assert tramo_legal_art150('2006-12-31', '2026-12-31') = 28,
    '20 años exactos son 28, no 35';
  assert tramo_legal_art150('2006-12-30', '2026-12-31') = 35,
    '20 años y 1 día son 35';
end $$;

-- El 29 de febrero cumple el 1 de marzo los años no bisiestos: adelantarlo
-- al 28 correría a la persona de tramo un día antes.
do $$
begin
  assert aniversario_de('2016-02-29', 10) = date '2026-03-01',
    'el aniversario de un 29/02 cae el 1 de marzo';
  assert aniversario_de('2016-02-29', 12) = date '2028-02-29',
    'y en el bisiesto vuelve al 29';
  assert tramo_legal_art150('2016-02-29', '2026-02-28') = 21,
    'todavía no cumplió los 10 al 28/02';
  assert tramo_legal_art150('2016-02-29', '2026-03-02') = 28,
    'ya los cumplió al 02/03';
end $$;

-- ============================================================
-- Art. 151 — los feriados cuentan como hábiles
-- ============================================================
do $$
begin
  assert dias_habiles_art151('2026-01-01', '2026-12-31') = 261,
    '2026 tiene 261 días hábiles de lunes a viernes';
  -- La semana del 15 al 19 de junio de 2026 tiene un feriado adentro
  -- (20/06 cae sábado, pero el 15 es feriado trasladado). Igual cuenta:
  -- el art. 151 mide los días en que DEBÍA prestar servicios.
  assert dias_habiles_art151('2026-06-15', '2026-06-19') = 5,
    'un feriado dentro de la semana no baja los hábiles del art. 151';
  assert dias_habiles_art151('2026-06-20', '2026-06-21') = 0,
    'el fin de semana no es hábil';
  assert dias_habiles_art151('2026-12-31', '2026-01-01') = 0,
    'un rango invertido da cero';
end $$;

-- ============================================================
-- Fixtures para el cálculo completo
-- ============================================================
insert into empresas (id, nombre, cuit, contacto_nombre, contacto_email, config) values
 -- Empresa LEGAL: días corridos (sin `vacacionesDiasHabiles`).
 ('bbbb0000-0000-0000-0000-0000000000a1','Vac-Legal','30-vac-1','A','vaca@t.test',
  '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,"diasAvisoVencimiento":30,"metodosFichaje":["celular"]}'::jsonb),
 -- Empresa HÁBILES: la modalidad propia, que NO se toca.
 ('bbbb0000-0000-0000-0000-0000000000a2','Vac-Habiles','30-vac-2','B','vacb@t.test',
  '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,"diasAvisoVencimiento":30,"metodosFichaje":["celular"],"vacacionesDiasHabiles":true}'::jsonb);

insert into empleados (id, empresa_id, nombre, apellido, dni, fecha_ingreso, puesto, sector) values
 -- Antigüedad exacta de 5 años al 31/12/2026.
 ('bbbb0000-0000-0000-0000-0000000000e1','bbbb0000-0000-0000-0000-0000000000a1',
  'Cinco','Exactos','vac-e1','2021-12-31','Op','Prod'),
 -- Ingresó el 1 de julio: alcanza la mitad de los hábiles.
 ('bbbb0000-0000-0000-0000-0000000000e2','bbbb0000-0000-0000-0000-0000000000a1',
  'Julio','Uno','vac-e2','2026-07-01','Op','Prod'),
 -- Ingresó el 1 de octubre: no alcanza, va al proporcional.
 ('bbbb0000-0000-0000-0000-0000000000e3','bbbb0000-0000-0000-0000-0000000000a1',
  'Octubre','Uno','vac-e3','2026-10-01','Op','Prod'),
 -- El mismo ingreso, pero en la empresa de días hábiles.
 ('bbbb0000-0000-0000-0000-0000000000e4','bbbb0000-0000-0000-0000-0000000000a2',
  'Octubre','Habiles','vac-e4','2026-10-01','Op','Prod'),
 -- Para el art. 152: una licencia larga por enfermedad inculpable.
 ('bbbb0000-0000-0000-0000-0000000000e6','bbbb0000-0000-0000-0000-0000000000a1',
  'Con','Enfermedad','vac-e6','2020-01-01','Op','Prod');

-- D-01: un legajo con BAJA a mitad de año. Es el caso en el que la base y
-- el cliente calculaban distinto, porque el despachador no le pasaba la
-- baja al cálculo legal.
insert into empleados (id, empresa_id, nombre, apellido, dni, fecha_ingreso,
  puesto, sector, activo, fecha_baja, motivo_baja) values
 -- Seis años de antigüedad, pero se fue el 31 de marzo.
 ('bbbb0000-0000-0000-0000-0000000000e7','bbbb0000-0000-0000-0000-0000000000a1',
  'Baja','Marzo','vac-e7','2020-01-01','Op','Prod', false, '2026-03-31','renuncia'),
 -- La misma antigüedad, pero se fue el 31 de octubre: ya pasó la mitad de
 -- los hábiles, así que conserva el período completo.
 ('bbbb0000-0000-0000-0000-0000000000e8','bbbb0000-0000-0000-0000-0000000000a1',
  'Baja','Octubre','vac-e8','2020-01-01','Op','Prod', false, '2026-10-31','renuncia'),
 -- Baja en la empresa de días hábiles: esa modalidad NO mira la baja.
 ('bbbb0000-0000-0000-0000-0000000000e9','bbbb0000-0000-0000-0000-0000000000a2',
  'Baja','Habiles','vac-e9','2020-01-01','Op','Prod', false, '2026-03-31','renuncia');

-- Un legajo por tramo en la empresa de días hábiles. Antes la antigüedad
-- se variaba pasando distintas fechas de ingreso por parámetro; ahora sale
-- del legajo, así que hace falta una persona por tramo.
insert into empleados (id, empresa_id, nombre, apellido, dni, fecha_ingreso,
  puesto, sector) values
 ('bbbb0000-0000-0000-0000-000000000fa1','bbbb0000-0000-0000-0000-0000000000a2',
  'Hab','Tramo1','vac-h1','2023-01-01','Op','Prod'),
 ('bbbb0000-0000-0000-0000-000000000fa2','bbbb0000-0000-0000-0000-0000000000a2',
  'Hab','Tramo2','vac-h2','2019-01-01','Op','Prod'),
 ('bbbb0000-0000-0000-0000-000000000fa3','bbbb0000-0000-0000-0000-0000000000a2',
  'Hab','Tramo3','vac-h3','2010-01-01','Op','Prod'),
 ('bbbb0000-0000-0000-0000-000000000fa4','bbbb0000-0000-0000-0000-0000000000a2',
  'Hab','Tramo4','vac-h4','2000-01-01','Op','Prod');

insert into ausencias (empresa_id, empleado_id, tipo, estado, fecha_desde, fecha_hasta, dias) values
 ('bbbb0000-0000-0000-0000-0000000000a1','bbbb0000-0000-0000-0000-0000000000e6',
  'enfermedad','aprobada','2026-01-01','2026-08-31', 243);

-- ============================================================
-- El cálculo legal completo
-- ============================================================
do $$
declare v_n int;
begin
  -- Antigüedad exacta de 5 años: tramo de abajo.
  v_n := vacaciones_legales_corridas(
    'bbbb0000-0000-0000-0000-0000000000e1', 2026);
  assert v_n = 14, 'cinco años exactos dan 14, dio ' || v_n;

  -- Del 1/7 al 31/12 hay 132 hábiles: 132 × 2 = 264 ≥ 261. Alcanza.
  v_n := vacaciones_legales_corridas(
    'bbbb0000-0000-0000-0000-0000000000e2', 2026);
  assert v_n = 14, 'ingreso el 1/7 alcanza el requisito, dio ' || v_n;

  -- Del 1/10 al 31/12 hay 65 hábiles: no alcanza → art. 153, 65/20 = 3.
  v_n := vacaciones_legales_corridas(
    'bbbb0000-0000-0000-0000-0000000000e3', 2026);
  assert v_n = 3, 'ingreso el 1/10 da 3 días proporcionales, dio ' || v_n;
end $$;

-- ============================================================
-- Art. 152 — hoy NINGUNA ausencia se descuenta
--
-- Todos los tipos que modela ISEO RH son licencia legal o convencional, o
-- directamente días trabajados: el art. 152 los computa a todos. La lista
-- de excepciones está vacía a propósito.
-- ============================================================
do $$
declare v_enfermedad int;
begin
  -- Ocho meses de enfermedad inculpable: se computan como trabajados, así
  -- que conserva el período completo del art. 150.
  v_enfermedad := vacaciones_legales_corridas(
    'bbbb0000-0000-0000-0000-0000000000e6', 2026);
  assert v_enfermedad = 21,
    'la enfermedad inculpable se computa: seis años → 21, dio ' || v_enfermedad;

  -- F-17: la firma perdió el `p_anio`, que no usaba. El rango ya lo
  -- acota el caller y un parámetro muerto invita a llamarla mal.
  assert dias_no_computables_art152(
    'bbbb0000-0000-0000-0000-0000000000e6', '2026-01-01', '2026-12-31') = 0,
    'hoy no hay ningún tipo de ausencia que se descuente';

  assert cardinality(tipos_ausencia_no_computables_art152()) = 0,
    'la lista de excepciones del art. 152 está vacía';
end $$;

-- ============================================================
-- D-01 — la baja entra en el cálculo legal, y entra sola
--
-- La corrección no fue pasarle el parámetro que faltaba: fue sacarle a las
-- funciones la posibilidad de recibir campos sueltos del legajo. Ahora
-- `vacaciones_legales_corridas` sólo pide a quién y de qué año, y lee
-- ingreso y baja de la misma fila. Ningún caller puede mandar un
-- subconjunto.
-- ============================================================
do $$
declare v_marzo int; v_octubre int; v_sin_baja int;
begin
  -- Se fue el 31/03: del 1/1 al 31/03 hay 64 hábiles. 64 × 2 = 128 < 261,
  -- así que no alcanza el requisito y va al proporcional: 64 / 20 = 3.
  v_marzo := vacaciones_legales_corridas(
    'bbbb0000-0000-0000-0000-0000000000e7', 2026);
  assert v_marzo = 3,
    'con baja el 31/03 corresponden 3 días proporcionales, dio ' || v_marzo;

  -- Se fue el 31/10: 216 hábiles. 216 × 2 = 432 ≥ 261, alcanza el
  -- requisito y conserva el tramo entero de sus seis años.
  v_octubre := vacaciones_legales_corridas(
    'bbbb0000-0000-0000-0000-0000000000e8', 2026);
  assert v_octubre = 21,
    'con baja el 31/10 conserva el período completo, dio ' || v_octubre;

  -- Y el mismo ingreso sin baja da el tramo completo: la diferencia la
  -- hace la baja, no otra cosa.
  v_sin_baja := vacaciones_legales_corridas(
    'bbbb0000-0000-0000-0000-0000000000e6', 2026);
  assert v_sin_baja = 21, 'sin baja, 21';
  assert v_marzo < v_sin_baja,
    'la baja temprana tiene que bajar el derecho del año';
end $$;

-- Y el despachador la propaga: es el punto exacto donde se perdía.
do $$
declare v_desp int; v_directo int;
begin
  v_desp := dias_vacaciones_corresponden(
    'bbbb0000-0000-0000-0000-0000000000e7', 2026,
    (select config from empresas where id = 'bbbb0000-0000-0000-0000-0000000000a1'));
  v_directo := vacaciones_legales_corridas(
    'bbbb0000-0000-0000-0000-0000000000e7', 2026);
  assert v_desp = v_directo,
    'el despachador tiene que dar lo mismo que el cálculo legal directo: '
    || v_desp || ' vs ' || v_directo;
end $$;

-- La modalidad de días hábiles NO mira la baja, igual que antes.
do $$
declare v_n int;
begin
  v_n := dias_vacaciones_corresponden(
    'bbbb0000-0000-0000-0000-0000000000e9', 2026,
    (select config from empresas where id = 'bbbb0000-0000-0000-0000-0000000000a2'));
  assert v_n = 15,
    'días hábiles con baja: sigue dando el tramo de sus seis años (15), dio ' || v_n;
end $$;

-- Las firmas viejas, las que aceptaban campos sueltos del legajo, no
-- pueden seguir vivas: eran la trampa, no el síntoma.
do $$
declare v_n int;
begin
  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'vacaciones_legales_corridas';
  assert v_n = 1,
    'tiene que quedar una sola firma de vacaciones_legales_corridas, hay ' || v_n;
end $$;

-- ============================================================
-- NO REGRESIÓN: la modalidad de días hábiles no cambió
--
-- Mismo ingreso (1/10/2026) en las dos empresas. El régimen legal da 3
-- por el art. 153 sobre hábiles; la modalidad de días hábiles conserva su
-- regla —91 días de calendario sobre 20— y da 4. Que difieran es
-- correcto: son dos reglas distintas.
-- ============================================================
do $$
declare v_legal int; v_habiles int;
begin
  v_legal := dias_vacaciones_corresponden(
    'bbbb0000-0000-0000-0000-0000000000e3', 2026,
    (select config from empresas where id = 'bbbb0000-0000-0000-0000-0000000000a1'));
  v_habiles := dias_vacaciones_corresponden(
    'bbbb0000-0000-0000-0000-0000000000e4', 2026,
    (select config from empresas where id = 'bbbb0000-0000-0000-0000-0000000000a2'));

  assert v_legal = 3, 'el régimen legal da 3, dio ' || v_legal;
  assert v_habiles = 4,
    'la modalidad de días hábiles conserva su regla (91/20 = 4), dio ' || v_habiles;
end $$;

-- Y los tramos de la modalidad de días hábiles siguen en 10/15/20/25.
do $$
declare v_config jsonb;
begin
  v_config := (select config from empresas where id = 'bbbb0000-0000-0000-0000-0000000000a2');

  assert dias_vacaciones_corresponden(
    'bbbb0000-0000-0000-0000-000000000fa1', 2026, v_config) = 10,
    'hábiles: menos de 5 años son 10';
  assert dias_vacaciones_corresponden(
    'bbbb0000-0000-0000-0000-000000000fa2', 2026, v_config) = 15,
    'hábiles: entre 5 y 10 años son 15';
  assert dias_vacaciones_corresponden(
    'bbbb0000-0000-0000-0000-000000000fa3', 2026, v_config) = 20,
    'hábiles: entre 10 y 20 son 20';
  assert dias_vacaciones_corresponden(
    'bbbb0000-0000-0000-0000-000000000fa4', 2026, v_config) = 25,
    'hábiles: más de 20 son 25';

  -- Y la escala configurable sigue mandando.
  assert dias_vacaciones_corresponden(
    'bbbb0000-0000-0000-0000-000000000fa1', 2026,
    v_config || '{"vacacionesEscala":{"hasta5":20}}'::jsonb) = 20,
    'hábiles: la escala acordada por la empresa se respeta';
end $$;

-- La firma vieja de tres argumentos no puede seguir viva: sería la regla
-- anterior esperando a que alguien la llame.
do $$
declare v_n int;
begin
  select count(*) into v_n
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'dias_vacaciones_corresponden';
  assert v_n = 1,
    'tiene que quedar una sola firma de dias_vacaciones_corresponden, hay ' || v_n;
end $$;

rollback;

\echo ''
\echo '  ✓ Vacaciones legales (LCT 150-153) + días hábiles sin regresión'
\echo ''
