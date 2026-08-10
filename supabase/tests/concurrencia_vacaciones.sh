#!/usr/bin/env bash
# Concurrencia real de vacaciones (BUG-008).
#
# Arranca dos sesiones autenticadas como el mismo empleado que intentan
# consumir el cupo completo a la vez. Exactamente una debe ganar; el
# saldo final no puede quedar negativo.
#
# Uso (con supabase local arriba y migración 58 aplicada):
#   bash supabase/tests/concurrencia_vacaciones.sh
#
set -euo pipefail

DB=(docker exec -i supabase_db_iseo-rrhh psql -U postgres -d postgres -v ON_ERROR_STOP=1 -At)

EMPRESA='dddddddd-dddd-dddd-dddd-ddddddddddd1'
EMPLEADO='dddddddd-dddd-dddd-dddd-ddddddddddd2'
USER_ID='dddddddd-dddd-dddd-dddd-ddddddddddd4'
GESTOR_EMP='dddddddd-dddd-dddd-dddd-ddddddddddd3'
GESTOR_UID='dddddddd-dddd-dddd-dddd-ddddddddddd5'

echo "== fixtures =="
"${DB[@]}" <<SQL
begin;
delete from ausencias where empresa_id = '${EMPRESA}';
delete from usuarios where id in ('${USER_ID}', '${GESTOR_UID}');
delete from empleados where id in ('${EMPLEADO}', '${GESTOR_EMP}');
select set_config('app.purgar_empresa', '${EMPRESA}', true);
delete from empresas where id = '${EMPRESA}';
delete from auth.users where id in ('${USER_ID}', '${GESTOR_UID}');

insert into empresas (id, nombre, cuit, contacto_nombre, contacto_email, config)
values (
  '${EMPRESA}', 'Race SA', '30-r-1', 'R', 'r@r.com',
  '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,
    "diasAvisoVencimiento":30,"metodosFichaje":["celular"],
    "vacacionesDiasHabiles":false}'::jsonb
);
insert into empleados (id, empresa_id, nombre, apellido, dni, fecha_ingreso, puesto, sector)
values
  ('${EMPLEADO}', '${EMPRESA}', 'Race', 'Emp', '701', '2020-01-01', 'Op', 'Prod'),
  ('${GESTOR_EMP}', '${EMPRESA}', 'Race', 'Ges', '702', '2018-01-01', 'Sup', 'Admin');
insert into auth.users (id, instance_id, email, aud, role) values
  ('${USER_ID}', '00000000-0000-0000-0000-000000000000', 'race@t.test', 'authenticated', 'authenticated'),
  ('${GESTOR_UID}', '00000000-0000-0000-0000-000000000000', 'raceges@t.test', 'authenticated', 'authenticated');
insert into usuarios (id, email, rol, nombre_completo, empresa_id, empleado_id) values
  ('${USER_ID}', 'race@t.test', 'empleado', 'Race Emp', '${EMPRESA}', '${EMPLEADO}'),
  ('${GESTOR_UID}', 'raceges@t.test', 'supervisor', 'Race Ges', '${EMPRESA}', '${GESTOR_EMP}');
grant select, insert, update, delete on table public.ausencias to authenticated;
grant select on table public.empleados to authenticated;
grant select on table public.empresas to authenticated;
grant select on table public.vacaciones_pendientes to authenticated;
grant select on table public.feriados to authenticated;
commit;
SQL

SALDO=$("${DB[@]}" -c "select saldo_vacaciones_disponible('${EMPLEADO}'::uuid, 2026);")
echo "saldo inicial=${SALDO}"
# Pedir el cupo completo en dos rangos disjuntos del mismo año.
# Con saldo 21: A pide 21 días (ene), B pide 21 días (ago).

run_one() {
  local label=$1
  local desde=$2
  local hasta=$3
  local out="/tmp/vac-race-${label}.txt"
  # ON_ERROR_STOP=1: el INSERT fallido corta el script SQL.
  # `|| true` evita que set -e mate el job en background antes de clasificar.
  docker exec -i supabase_db_iseo-rrhh psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<SQL >"$out" 2>&1 || true
set role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '${USER_ID}', 'role', 'authenticated')::text,
  false
);
insert into ausencias (
  empresa_id, empleado_id, tipo, fecha_desde, fecha_hasta, dias, estado
) values (
  '${EMPRESA}', '${EMPLEADO}', 'vacaciones', '${desde}', '${hasta}', 99, 'pendiente'
);
SQL
  if grep -qE 'INSERT 0 1' "$out"; then
    echo "${label}=OK"
  else
    echo "${label}=FAIL"
    grep -E 'ERROR|saldo|vacaciones' "$out" | tail -3 | sed "s/^/  ${label}: /" || true
  fi
}

echo "== concurrent inserts =="
run_one A 2026-01-01 2026-01-21 &
PID_A=$!
run_one B 2026-08-01 2026-08-21 &
PID_B=$!
wait $PID_A $PID_B

COUNT=$("${DB[@]}" -c "select count(*) from ausencias where empresa_id='${EMPRESA}' and tipo='vacaciones' and estado='pendiente';")
DISP=$("${DB[@]}" -c "select saldo_vacaciones_disponible('${EMPLEADO}'::uuid, 2026);")
echo "inserts_pendientes=${COUNT}"
echo "saldo_final=${DISP}"

if [[ "$COUNT" -ne 1 ]]; then
  echo "ERROR: se esperaba exactamente 1 insert exitoso, hubo ${COUNT}"
  exit 1
fi
if [[ "$DISP" -lt 0 ]]; then
  echo "ERROR: saldo final negativo (${DISP})"
  exit 1
fi

echo "PASS: concurrencia — una ganó, saldo final=${DISP} (>=0)"
