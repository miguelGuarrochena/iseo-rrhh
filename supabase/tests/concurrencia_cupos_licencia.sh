#!/usr/bin/env bash
# Concurrencia real de cupos de licencia (BUG-010).
#
# Cupo mudanza = 1. Dos INSERT aprobados concurrentes de 1 día cada uno
# por el mismo gestor sobre el mismo legajo: exactamente uno debe ganar.
#
# Uso (migración 59 aplicada):
#   bash supabase/tests/concurrencia_cupos_licencia.sh
#
set -euo pipefail

DB=(docker exec -i supabase_db_iseo-rrhh psql -U postgres -d postgres -v ON_ERROR_STOP=1 -At)

EMPRESA='ffffffff-ffff-ffff-ffff-fffffffffff1'
EMPLEADO='ffffffff-ffff-ffff-ffff-fffffffffff2'
GESTOR_EMP='ffffffff-ffff-ffff-ffff-fffffffffff3'
USER_ID='ffffffff-ffff-ffff-ffff-fffffffffff4'
GESTOR_UID='ffffffff-ffff-ffff-ffff-fffffffffff5'

echo "== fixtures =="
"${DB[@]}" <<SQL
begin;
delete from ausencias where empresa_id = '${EMPRESA}';
delete from cupos_licencia where empresa_id = '${EMPRESA}';
delete from usuarios where id in ('${USER_ID}', '${GESTOR_UID}');
delete from empleados where id in ('${EMPLEADO}', '${GESTOR_EMP}');
select set_config('app.purgar_empresa', '${EMPRESA}', true);
delete from empresas where id = '${EMPRESA}';
delete from auth.users where id in ('${USER_ID}', '${GESTOR_UID}');

insert into empresas (id, nombre, cuit, contacto_nombre, contacto_email, config)
values (
  '${EMPRESA}', 'Race Cupo SA', '30-rc-1', 'R', 'rc@r.com',
  '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,
    "diasAvisoVencimiento":30,"metodosFichaje":["celular"]}'::jsonb
);
insert into empleados (id, empresa_id, nombre, apellido, dni, fecha_ingreso, puesto, sector)
values
  ('${EMPLEADO}', '${EMPRESA}', 'Race', 'Emp', '901', '2020-01-01', 'Op', 'Prod'),
  ('${GESTOR_EMP}', '${EMPRESA}', 'Race', 'Ges', '902', '2018-01-01', 'Sup', 'Admin');
insert into auth.users (id, instance_id, email, aud, role) values
  ('${USER_ID}', '00000000-0000-0000-0000-000000000000', 'race-cupo@t.test', 'authenticated', 'authenticated'),
  ('${GESTOR_UID}', '00000000-0000-0000-0000-000000000000', 'race-cupoges@t.test', 'authenticated', 'authenticated');
insert into usuarios (id, email, rol, nombre_completo, empresa_id, empleado_id) values
  ('${USER_ID}', 'race-cupo@t.test', 'empleado', 'Race Emp', '${EMPRESA}', '${EMPLEADO}'),
  ('${GESTOR_UID}', 'race-cupoges@t.test', 'supervisor', 'Race Ges', '${EMPRESA}', '${GESTOR_EMP}');
insert into cupos_licencia (empresa_id, tipo, dias_anuales)
values ('${EMPRESA}', 'mudanza', 1);
grant select, insert, update, delete on table public.ausencias to authenticated;
revoke select on table public.empleados from authenticated;
grant select (
  id, empresa_id, nombre, apellido, dni, cuil, fecha_nacimiento, estado_civil,
  nivel_estudios, domicilio, telefono, email, contacto_emergencia, grupo_familiar,
  foto_url, fecha_ingreso, puesto, sector, supervisor_id, modalidad_contratacion,
  fecha_fin_contrato, modalidad_pago, banco, obra_social, art, activo, fecha_baja,
  motivo_baja, checklist_alta, creado_en, modo_fichaje, geocerca, convenio,
  numero_legajo, sin_usuario
) on table public.empleados to authenticated;
grant insert, update, delete on table public.empleados to authenticated;
grant select on public.empleados_lectura to authenticated;
grant select on table public.empresas to authenticated;
grant select on table public.cupos_licencia to authenticated;
commit;
SQL

SALDO=$("${DB[@]}" -c "select saldo_licencia_disponible('${EMPLEADO}'::uuid, 'mudanza'::tipo_ausencia, 2026);")
echo "saldo inicial mudanza=${SALDO}"

run_one() {
  local label=$1
  local dia=$2
  local out="/tmp/cupo-race-${label}.txt"
  docker exec -i supabase_db_iseo-rrhh psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<SQL >"$out" 2>&1 || true
set role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '${GESTOR_UID}', 'role', 'authenticated')::text,
  false
);
insert into ausencias (
  empresa_id, empleado_id, tipo, fecha_desde, fecha_hasta, dias, estado,
  resuelta_por, resuelta_en, comentario_resolucion
) values (
  '${EMPRESA}', '${EMPLEADO}', 'mudanza', '${dia}', '${dia}', 99, 'aprobada',
  '${GESTOR_UID}', now(), 'race'
);
SQL
  if grep -qE 'INSERT 0 1' "$out"; then
    echo "${label}=OK"
  else
    echo "${label}=FAIL"
    grep -E 'ERROR|licencia' "$out" | tail -3 | sed "s/^/  ${label}: /" || true
  fi
}

echo "== concurrent approved inserts =="
run_one A 2026-03-10 &
PID_A=$!
run_one B 2026-08-10 &
PID_B=$!
wait $PID_A $PID_B

COUNT=$("${DB[@]}" -c "select count(*) from ausencias where empresa_id='${EMPRESA}' and tipo='mudanza' and estado='aprobada';")
DISP=$("${DB[@]}" -c "select saldo_licencia_disponible('${EMPLEADO}'::uuid, 'mudanza'::tipo_ausencia, 2026);")
echo "inserts_aprobados=${COUNT}"
echo "saldo_final=${DISP}"

if [[ "$COUNT" -ne 1 ]]; then
  echo "ERROR: se esperaba exactamente 1 aprobada, hubo ${COUNT}"
  exit 1
fi
if [[ "$DISP" -lt 0 ]]; then
  echo "ERROR: saldo final negativo (${DISP})"
  exit 1
fi

echo "PASS: concurrencia cupos — una ganó, saldo final=${DISP} (>=0)"
