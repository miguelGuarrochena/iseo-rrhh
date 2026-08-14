-- Production security verification (single transaction, ROLLBACK).
-- Last statement returns result rows for the Management API client.
BEGIN;

CREATE TEMP TABLE probe_results (ord serial, msg text);
GRANT ALL ON TABLE probe_results TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE probe_results_ord_seq TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.note(hit boolean, label text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO probe_results (msg)
  VALUES (CASE WHEN hit THEN 'HIT ' ELSE 'BLOCKED ' END || label);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.allow(label text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO probe_results (msg) VALUES ('ALLOW ' || label);
END;
$$;

GRANT EXECUTE ON FUNCTION pg_temp.note(boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.allow(text) TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.as_role(uid uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', uid::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';
END;
$$;

GRANT EXECUTE ON FUNCTION pg_temp.as_role(uuid) TO authenticated;

INSERT INTO empresas (id, nombre, cuit, contacto_nombre, contacto_email, config) VALUES
 ('f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1a1','PV-A','30-pva','A','pva@probe.test',
  '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,"diasAvisoVencimiento":30,"metodosFichaje":["celular"],"vacacionesDiasHabiles":false}'::jsonb),
 ('f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1b1','PV-B','30-pvb','B','pvb@probe.test',
  '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,"diasAvisoVencimiento":30,"metodosFichaje":["celular"]}'::jsonb);

INSERT INTO empleados (id, empresa_id, nombre, apellido, dni, fecha_ingreso, puesto, sector, cbu) VALUES
 ('f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1a2','f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1a1','Emp','A','pv1','2020-01-01','Op','Prod','PEER-CBU'),
 ('f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1a3','f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1a1','Sup','A','pv2','2019-01-01','Sup','Admin','SUP-CBU'),
 ('f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1a4','f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1a1','Adm','A','pv3','2018-01-01','RRHH','Admin','ADM-CBU'),
 ('f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1a5','f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1a1','Ad2','A','pv4','2017-01-01','RRHH','Admin','AD2-CBU'),
 ('f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1b2','f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1b1','Emp','B','pv9','2020-01-01','Op','Prod','B-CBU');

UPDATE empleados SET
  consentimiento_biometrico = '{"aceptado":true,"fecha":"2026-01-01"}'::jsonb,
  descriptor_facial = '[0.1]'::jsonb, descriptor_version = 1
WHERE id = 'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1a2';

INSERT INTO auth.users (id, instance_id, email, aud, role) VALUES
 ('f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f101','00000000-0000-0000-0000-000000000000','pv-emp@probe.test','authenticated','authenticated'),
 ('f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f102','00000000-0000-0000-0000-000000000000','pv-sup@probe.test','authenticated','authenticated'),
 ('f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f103','00000000-0000-0000-0000-000000000000','pv-adm@probe.test','authenticated','authenticated'),
 ('f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f104','00000000-0000-0000-0000-000000000000','pv-ad2@probe.test','authenticated','authenticated'),
 ('f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f105','00000000-0000-0000-0000-000000000000','pv-emb@probe.test','authenticated','authenticated');

INSERT INTO usuarios (id, email, rol, nombre_completo, empresa_id, empleado_id) VALUES
 ('f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f101','pv-emp@probe.test','empleado','Emp A','f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1a1','f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1a2'),
 ('f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f102','pv-sup@probe.test','supervisor','Sup A','f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1a1','f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1a3'),
 ('f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f103','pv-adm@probe.test','admin_rrhh','Adm A','f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1a1','f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1a4'),
 ('f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f104','pv-ad2@probe.test','admin_rrhh','Ad2 A','f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1a1','f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1a5'),
 ('f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f105','pv-emb@probe.test','empleado','Emp B','f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1b1','f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1b2');

INSERT INTO documentos_firma (id, empresa_id, titulo, archivo_url) VALUES
 ('f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1d1','f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1a1','DocA','f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1a1/a.pdf'),
 ('f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1d2','f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1b1','DocB','f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1b1/b.pdf');

INSERT INTO documento_firma_destinatarios (documento_id, empleado_id) VALUES
 ('f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1d1','f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1a2');

-- Employee
SELECT pg_temp.as_role('f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f101'::uuid);

DO $$ BEGIN
  BEGIN
    INSERT INTO remuneraciones (empresa_id, empleado_id, periodo, monto_bruto, monto_neto)
    VALUES ('f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1a1','f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1a2','2026-08',1,1);
    PERFORM pg_temp.note(true, 'FRT-1 employee INSERT remuneraciones');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.note(false, 'FRT-1 employee INSERT remuneraciones'); END;
END $$;

DO $$ BEGIN
  BEGIN
    INSERT INTO recibos (empresa_id, empleado_id, periodo, archivo_url)
    VALUES ('f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1a1','f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1a2','2026-08','x.pdf');
    PERFORM pg_temp.note(true, 'A1 employee INSERT recibos');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.note(false, 'A1 employee INSERT recibos'); END;
END $$;

DO $$ BEGIN
  BEGIN
    INSERT INTO cupos_licencia (empresa_id, tipo, dias_anuales)
    VALUES ('f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1a1','mudanza',9);
    PERFORM pg_temp.note(true, 'A3 employee INSERT cupos');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.note(false, 'A3 employee INSERT cupos'); END;
END $$;

DO $$ BEGIN
  BEGIN
    INSERT INTO documentos_legajo (empresa_id, empleado_id, categoria, nombre, archivo_url)
    VALUES ('f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1a1','f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1a2','dni','x','f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1b1/secret.pdf');
    PERFORM pg_temp.note(true, 'A5/FRT-6 employee poison docs');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.note(false, 'A5/FRT-6 employee poison docs'); END;
END $$;

DO $$ BEGIN
  BEGIN
    INSERT INTO empleados (empresa_id, nombre, apellido, dni, fecha_ingreso, puesto, sector)
    VALUES ('f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1a1','Ghost','X','pv-ghost','2026-01-01','Op','Prod');
    PERFORM pg_temp.note(true, 'A7/FRT-4 employee INSERT empleados');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.note(false, 'A7/FRT-4 employee INSERT empleados'); END;
END $$;

DO $$ BEGIN
  BEGIN
    INSERT INTO ausencias (empresa_id, empleado_id, tipo, fecha_desde, fecha_hasta, dias, estado, resuelta_en)
    VALUES ('f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1a1','f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1a2','especial','2026-09-01','2026-09-01',1,'aprobada', now());
    PERFORM pg_temp.note(true, 'FRT-12 employee INSERT ausencia aprobada');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.note(false, 'FRT-12 employee INSERT ausencia aprobada'); END;
END $$;

DO $$ BEGIN
  BEGIN
    PERFORM saldo_vacaciones_disponible('f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1b2'::uuid, 2026);
    PERFORM pg_temp.note(true, 'J1/FRT-5 saldo_vacaciones cross-tenant');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.note(false, 'J1/FRT-5 saldo_vacaciones cross-tenant'); END;
END $$;

DO $$ BEGIN
  BEGIN
    PERFORM saldo_licencia_disponible('f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1b2'::uuid, 'mudanza', 2026);
    PERFORM pg_temp.note(true, 'J2 saldo_licencia cross-tenant');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.note(false, 'J2 saldo_licencia cross-tenant'); END;
END $$;

DO $$
DECLARE e uuid;
BEGIN
  e := empresa_de_documento_firma('f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1d2'::uuid);
  PERFORM pg_temp.note(e IS NOT NULL, 'IND-04 employee docfirma cross-tenant');
EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.note(false, 'IND-04 employee docfirma blocked');
END $$;

DO $$
DECLARE e uuid;
BEGIN
  e := empresa_de_documento_firma('f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1d1'::uuid);
  IF e = 'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1a1'::uuid THEN
    PERFORM pg_temp.allow('IND-04b employee own-tenant docfirma');
  ELSE
    PERFORM pg_temp.note(true, 'IND-04b own-tenant docfirma broken');
  END IF;
END $$;

DO $$ BEGIN
  BEGIN
    UPDATE usuarios SET rol = 'admin_rrhh' WHERE id = 'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f101';
    PERFORM pg_temp.note(
      EXISTS (SELECT 1 FROM usuarios WHERE id='f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f101' AND rol='admin_rrhh'),
      'FRT-7 self-promote'
    );
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.note(false, 'FRT-7 self-promote'); END;
END $$;

DO $$
DECLARE t timestamptz;
BEGIN
  BEGIN
    INSERT INTO fichajes (empresa_id, empleado_id, tipo, ts, metodo)
    VALUES (
      'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1a1',
      'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1a2',
      'ingreso', '2019-01-01 08:00:00+00', 'celular'
    ) RETURNING ts INTO t;
    PERFORM pg_temp.note(t < now() - interval '1 day', 'O3 historical fichaje ts stuck');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.note(false, 'O3 fichaje insert failed'); END;
END $$;

DO $$ BEGIN
  BEGIN
    INSERT INTO auditoria_acciones (empresa_id, actor_id, actor_nombre, accion, entidad, detalle)
    VALUES (
      'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1a1',
      'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f101',
      'System Root', 'wipe', 'empresas', '{}'::jsonb
    );
    PERFORM pg_temp.note(true, 'FRT-9a forge auditoria');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.note(false, 'FRT-9a forge auditoria'); END;
END $$;

DO $$ BEGIN
  BEGIN
    INSERT INTO errores_app (empresa_id, usuario_id, mensaje)
    VALUES ('f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1b1','f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f101','x');
    PERFORM pg_temp.note(true, 'FRT-9b errores_app foreign');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.note(false, 'FRT-9b errores_app foreign'); END;
END $$;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM documento_firma_destinatarios
  WHERE documento_id='f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1d1'
    AND empleado_id='f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1a2';
  IF n = 1 THEN PERFORM pg_temp.allow('destinatario SELECT own row');
  ELSE PERFORM pg_temp.note(true, 'destinatario SELECT broken'); END IF;
END $$;

-- Supervisor
SELECT pg_temp.as_role('f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f102'::uuid);

DO $$ BEGIN
  BEGIN
    INSERT INTO recibos (empresa_id, empleado_id, periodo, archivo_url)
    VALUES ('f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1a1','f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1a2','2026-09','x.pdf');
    PERFORM pg_temp.note(true, 'FRT-2 supervisor INSERT recibo');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.note(false, 'FRT-2 supervisor INSERT recibo'); END;
END $$;

DO $$ BEGIN
  BEGIN
    INSERT INTO cupos_licencia (empresa_id, tipo, dias_anuales)
    VALUES ('f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1a1','examen',3);
    PERFORM pg_temp.note(true, 'FRT-14b supervisor INSERT cupo');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.note(false, 'FRT-14b supervisor INSERT cupo'); END;
END $$;

DO $$ BEGIN
  BEGIN
    INSERT INTO turnos (empresa_id, empleado_id, fecha, hora_entrada, hora_salida)
    VALUES ('f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1a1','f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1a2','2026-12-20','08:00','17:00');
    PERFORM pg_temp.allow('FRT-14a supervisor INSERT turno');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.note(true, 'FRT-14a supervisor turno denied'); END;
END $$;

DO $$
DECLARE cbu text; bio jsonb; leaked boolean := false;
BEGIN
  BEGIN
    SELECT e.cbu, e.descriptor_facial INTO cbu, bio FROM empleados_lectura e
    WHERE e.id='f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1a2';
    leaked := (cbu IS NOT NULL OR bio IS NOT NULL);
  EXCEPTION WHEN OTHERS THEN leaked := false; END;
  PERFORM pg_temp.note(leaked, 'FRT-3 supervisor peer PII via view');
END $$;

DO $$
DECLARE e uuid;
BEGIN
  e := empresa_de_documento_firma('f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1d2'::uuid);
  PERFORM pg_temp.note(e IS NOT NULL, 'IND-04 supervisor docfirma cross-tenant');
EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.note(false, 'IND-04 supervisor docfirma blocked');
END $$;

-- Admin
SELECT pg_temp.as_role('f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f103'::uuid);

DO $$ BEGIN
  BEGIN
    INSERT INTO ausencias (empresa_id, empleado_id, tipo, fecha_desde, fecha_hasta, dias, estado, resuelta_en)
    VALUES (
      'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1a1',
      'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1b2',
      'especial','2026-10-01','2026-10-01',1,'aprobada', now()
    );
    PERFORM pg_temp.note(true, 'O2/FRT-11a admin cross-link ausencia');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.note(false, 'O2/FRT-11a admin cross-link ausencia'); END;
END $$;

DO $$ BEGIN
  BEGIN
    INSERT INTO remuneraciones (empresa_id, empleado_id, periodo, monto_bruto, monto_neto)
    VALUES (
      'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1a1',
      'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1b2',
      '2026-10',1,1
    );
    PERFORM pg_temp.note(true, 'admin remu cross-link');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.note(false, 'admin remu cross-link'); END;
END $$;

INSERT INTO adelantos (empresa_id, empleado_id, monto, estado)
VALUES (
  'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1a1',
  'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1a2',
  1000, 'pendiente'
);

DO $$
DECLARE aid uuid;
BEGIN
  SELECT id INTO aid FROM adelantos
  WHERE empleado_id='f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1a2' AND monto=1000
  ORDER BY id DESC LIMIT 1;
  UPDATE adelantos SET estado='rechazado', resuelto_en=now()
  WHERE id=aid;
  BEGIN
    UPDATE adelantos SET estado='aprobado' WHERE id=aid;
    PERFORM pg_temp.note(true, 'O1/FRT-11b adelanto reopen');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.note(false, 'O1/FRT-11b adelanto reopen'); END;
END $$;

UPDATE usuarios SET rol='empleado' WHERE id='f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f104';
DO $$ BEGIN
  BEGIN
    UPDATE usuarios SET rol='empleado' WHERE id='f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f103';
    PERFORM pg_temp.note(
      EXISTS (SELECT 1 FROM usuarios WHERE id='f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f103' AND rol='empleado'),
      'FRT-10 last admin demote'
    );
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.note(false, 'FRT-10 last admin demote'); END;
END $$;

DO $$
DECLARE e uuid;
BEGIN
  e := empresa_de_documento_firma('f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1d2'::uuid);
  PERFORM pg_temp.note(e IS NOT NULL, 'IND-04 admin docfirma cross-tenant');
EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.note(false, 'IND-04 admin docfirma blocked');
END $$;

DO $$
DECLARE cbu text;
BEGIN
  SELECT e.cbu INTO cbu FROM empleados_lectura e
  WHERE e.id='f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1a2';
  IF cbu IS NOT NULL THEN PERFORM pg_temp.allow('admin peer CBU via view');
  ELSE PERFORM pg_temp.note(true, 'admin peer CBU unexpectedly redacted'); END IF;
END $$;

-- Anon
RESET ROLE;
DO $$
DECLARE e uuid;
BEGIN
  BEGIN
    EXECUTE 'SET LOCAL ROLE anon';
    e := empresa_de_documento_firma('f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1d2'::uuid);
    PERFORM pg_temp.note(e IS NOT NULL, 'IND-06b anon docfirma');
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM pg_temp.note(false, 'IND-06b anon EXECUTE denied');
  WHEN OTHERS THEN
    PERFORM pg_temp.note(false, 'IND-06b anon blocked');
  END;
END $$;

RESET ROLE;

-- Emit results (API returns this result set). Then roll back all fixture writes.
SELECT msg AS result FROM probe_results ORDER BY ord;

ROLLBACK;
