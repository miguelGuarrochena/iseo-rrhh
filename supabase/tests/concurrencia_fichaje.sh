#!/usr/bin/env bash
# Concurrencia real de fichaje (FIC-004).
#
# Dos sesiones autenticadas como el mismo empleado llaman a
# fichar_con_rostro a la vez. El advisory lock debe serializarlas:
# exactamente un ingreso y un egreso (alternancia), nunca dos iguales.
#
# También verifica que dos empleados distintos no se bloquean entre sí.
#
# Uso (supabase local arriba, migración 73 aplicada):
#   bash supabase/tests/concurrencia_fichaje.sh
#
set -euo pipefail

DB_CONTAINER="$(docker ps -qf name=supabase_db | head -1)"
if [[ -z "$DB_CONTAINER" ]]; then
  echo "ERROR: no hay contenedor supabase_db corriendo"
  exit 1
fi

DB=(docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -At)

EMPRESA='eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1'
EMP_A='eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee2'
EMP_B='eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee3'
USER_A='eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee4'
USER_B='eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee5'
# Descriptor cercano al enrolado [0,0,0] pero distinto en cada corrida.
DESC_1='[0.01,0.01,0.01]'
DESC_2='[0.01,0.01,0.011]'
DESC_B1='[0.01,0.012,0.01]'
DESC_B2='[0.012,0.01,0.01]'

echo "== fixtures =="
"${DB[@]}" <<SQL
begin;
delete from fichajes_descriptor_usado where empleado_id in ('${EMP_A}', '${EMP_B}');
delete from fichajes where empresa_id = '${EMPRESA}';
delete from usuarios where id in ('${USER_A}', '${USER_B}');
delete from empleados where id in ('${EMP_A}', '${EMP_B}');
select set_config('app.purgar_empresa', '${EMPRESA}', true);
delete from empresas where id = '${EMPRESA}';
delete from auth.users where id in ('${USER_A}', '${USER_B}');

insert into empresas (id, nombre, cuit, contacto_nombre, contacto_email, config)
values (
  '${EMPRESA}', 'Race Fichaje SA', '30-rf-1', 'R', 'rf@r.com',
  '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,
    "diasAvisoVencimiento":30,"metodosFichaje":["celular"],
    "geocerca":{"lat":-34.6,"lng":-58.4,"radioM":100}}'::jsonb
);
insert into empleados (
  id, empresa_id, nombre, apellido, dni, fecha_ingreso, puesto, sector,
  descriptor_facial, consentimiento_biometrico
) values
  ('${EMP_A}', '${EMPRESA}', 'Race', 'A', '801', '2020-01-01', 'Op', 'Prod',
   '[0,0,0]'::jsonb,
   '{"aceptado":true,"fecha":"2026-08-07","otorgadoPor":"u1"}'::jsonb),
  ('${EMP_B}', '${EMPRESA}', 'Race', 'B', '802', '2020-01-01', 'Op', 'Prod',
   '[0.05,0.05,0.05]'::jsonb,
   '{"aceptado":true,"fecha":"2026-08-07","otorgadoPor":"u1"}'::jsonb);
insert into auth.users (id, instance_id, email, aud, role) values
  ('${USER_A}', '00000000-0000-0000-0000-000000000000', 'racea@t.test', 'authenticated', 'authenticated'),
  ('${USER_B}', '00000000-0000-0000-0000-000000000000', 'raceb@t.test', 'authenticated', 'authenticated');
insert into usuarios (id, email, rol, nombre_completo, empresa_id, empleado_id) values
  ('${USER_A}', 'racea@t.test', 'empleado', 'Race A', '${EMPRESA}', '${EMP_A}'),
  ('${USER_B}', 'raceb@t.test', 'empleado', 'Race B', '${EMPRESA}', '${EMP_B}');
commit;
SQL

run_fichar() {
  local label=$1
  local user_id=$2
  local emp_id=$3
  local desc=$4
  local out="/tmp/fichaje-race-${label}.txt"
  # -At: una sola columna, sin bordes (el grep de abajo es trivial).
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -At <<SQL >"$out" 2>&1 || true
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '${user_id}', 'role', 'authenticated')::text,
  false
);
select tipo::text from fichar_con_rostro(
  '${desc}'::jsonb, 'celular', '${emp_id}'::uuid, -34.6, -58.4, null
);
SQL
  local tipo
  tipo="$(grep -E '^(ingreso|egreso)$' "$out" | head -1 || true)"
  if [[ -n "$tipo" ]]; then
    echo "${label}=OK:${tipo}"
  else
    echo "${label}=FAIL"
    grep -E 'ERROR|exception|fichar' "$out" | tail -5 | sed "s/^/  ${label}: /" || true
  fi
}

echo "== concurrent same employee =="
run_fichar A1 "${USER_A}" "${EMP_A}" "${DESC_1}" &
PID_A=$!
run_fichar A2 "${USER_A}" "${EMP_A}" "${DESC_2}" &
PID_B=$!
wait $PID_A $PID_B

TIPOS=$("${DB[@]}" -c "select string_agg(tipo::text, ',' order by ts, id) from fichajes where empleado_id='${EMP_A}';")
COUNT=$("${DB[@]}" -c "select count(*) from fichajes where empleado_id='${EMP_A}';")
echo "empleado_A tipos=${TIPOS} count=${COUNT}"

if [[ "$COUNT" -ne 2 ]]; then
  echo "ERROR: se esperaban exactamente 2 fichajes del empleado A, hubo ${COUNT}"
  exit 1
fi
if [[ "$TIPOS" != "ingreso,egreso" ]]; then
  echo "ERROR: se esperaba ingreso,egreso y hubo ${TIPOS}"
  exit 1
fi

echo "== concurrent different employees =="
run_fichar B1 "${USER_B}" "${EMP_B}" "${DESC_B1}" &
PID_B1=$!
run_fichar A3 "${USER_A}" "${EMP_A}" '[0.013,0.01,0.01]' &
PID_A3=$!
wait $PID_B1 $PID_A3

COUNT_B=$("${DB[@]}" -c "select count(*) from fichajes where empleado_id='${EMP_B}';")
COUNT_A=$("${DB[@]}" -c "select count(*) from fichajes where empleado_id='${EMP_A}';")
echo "empleado_B count=${COUNT_B} empleado_A count=${COUNT_A}"

if [[ "$COUNT_B" -lt 1 ]]; then
  echo "ERROR: el empleado B no pudo fichar en paralelo"
  exit 1
fi
if [[ "$COUNT_A" -lt 3 ]]; then
  echo "ERROR: el empleado A no pudo fichar su tercera marca en paralelo con B"
  exit 1
fi

# Alternancia de A tras la tercera: ingreso,egreso,ingreso
TIPOS_A=$("${DB[@]}" -c "select string_agg(tipo::text, ',' order by ts, id) from fichajes where empleado_id='${EMP_A}';")
if [[ "$TIPOS_A" != "ingreso,egreso,ingreso" ]]; then
  echo "ERROR: alternancia rota en A: ${TIPOS_A}"
  exit 1
fi

echo "PASS: concurrencia fichaje — alternancia OK, empleados distintos no se bloquean"
