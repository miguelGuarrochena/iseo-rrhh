/**
 * Datos mínimos para poder entrar a la app contra la base LOCAL.
 *
 *   npm run sembrar:local
 *
 * Después de un `supabase db reset` la base queda sin un solo usuario, y
 * sin usuario no hay forma de loguearse: las cuentas viven en `auth`
 * (gotrue) y no se pueden crear con un INSERT —a gotrue le faltan
 * columnas que él mismo maneja y el login falla con "Email o contraseña
 * incorrectos" sin decir por qué—. Hay que pasar por su API de admin,
 * que es lo que hace este script.
 *
 * Siembra dos empresas a propósito, con estudios contables distintos:
 * es la única forma de ver el mapeo de importación por empresa —y el
 * caso del superadmin, que ve las dos— sin inventar datos a mano cada
 * vez.
 *
 * No se toca `supabase/seed.sql`: ese archivo es de grants, corre en cada
 * reset y lo miran los tests. Meterle usuarios haría que los tests
 * dependieran de datos de ejemplo.
 */

import { execSync } from 'node:child_process';

const LOCAL = 'http://127.0.0.1:54321';

/** Claves del Supabase local, preguntadas al CLI. */
const claves = () => {
  let salida;
  try {
    salida = execSync('npx supabase status -o json', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    throw new Error(
      'No pude hablar con el Supabase local. ¿Está levantado? Probá: npx supabase start'
    );
  }
  const json = JSON.parse(salida.slice(salida.indexOf('{')));
  if (!json.API_URL?.includes('127.0.0.1') && !json.API_URL?.includes('localhost')) {
    // Cinturón: este script crea usuarios con contraseña conocida.
    throw new Error(`Esto sólo corre contra local. API_URL = ${json.API_URL}`);
  }
  return { anon: json.ANON_KEY, servicio: json.SERVICE_ROLE_KEY };
};

const sql = (texto) =>
  execSync(
    `docker exec -i supabase_db_iseo-rrhh psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q`,
    { input: texto, encoding: 'utf8' }
  );

const CONTRASENA = 'Local12345!';

const EMPRESAS = [
  {
    id: 'aaaa1111-1111-1111-1111-111111111111',
    nombre: 'Panadería del Sur',
    cuit: '30-11111111-1',
    // Obligatorio desde la migración 107: sin esto no se puede liquidar.
    tope: 1_200_000,
    empleados: [
      ['aaaa1111-1111-1111-1111-000000000001', 'Ana', 'Ruiz', '30111222', '101'],
      ['aaaa1111-1111-1111-1111-000000000002', 'Beto', 'Paz', '28999111', '102'],
      ['aaaa1111-1111-1111-1111-000000000003', 'Caro', 'Diaz', '35222333', '103'],
    ],
  },
  {
    id: 'bbbb2222-2222-2222-2222-222222222222',
    nombre: 'Metalúrgica Norte',
    cuit: '30-22222222-2',
    tope: 1_200_000,
    empleados: [
      ['bbbb2222-2222-2222-2222-000000000001', 'Dani', 'Sosa', '31444555', '201'],
      ['bbbb2222-2222-2222-2222-000000000002', 'Eli', 'Mora', '32555666', '202'],
    ],
  },
];

const CUENTAS = [
  { email: 'super@local.test', rol: 'superadmin', nombre: 'ISEO', empresa: null },
  {
    email: 'rrhh.a@local.test',
    rol: 'admin_rrhh',
    nombre: 'Rita (Panadería)',
    empresa: EMPRESAS[0].id,
  },
  {
    email: 'rrhh.b@local.test',
    rol: 'admin_rrhh',
    nombre: 'Nico (Metalúrgica)',
    empresa: EMPRESAS[1].id,
  },
];

const CONFIG = (tope) =>
  JSON.stringify({
    horaEntrada: '08:00',
    horaSalida: '17:00',
    toleranciaLlegadaTardeMin: 10,
    diasAvisoVencimiento: 30,
    metodosFichaje: ['celular'],
    topeImponibleAportes: tope,
  });

const crearCuenta = async (servicio, email) => {
  const r = await fetch(`${LOCAL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: servicio,
      Authorization: `Bearer ${servicio}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password: CONTRASENA,
      email_confirm: true,
    }),
  });
  const cuerpo = await r.json();
  if (!cuerpo.id) {
    throw new Error(`No se pudo crear ${email}: ${JSON.stringify(cuerpo)}`);
  }
  return cuerpo.id;
};

const main = async () => {
  const { servicio } = claves();

  const yaHay = sql('select count(*) from usuarios;').match(/\d+/)?.[0];
  if (yaHay && Number(yaHay) > 0) {
    console.log(
      `La base local ya tiene ${yaHay} usuario(s). Si querés empezar de cero:\n` +
        '  npx supabase db reset && npm run sembrar:local\n'
    );
    return;
  }

  for (const e of EMPRESAS) {
    sql(`
      insert into empresas (id, nombre, cuit, contacto_nombre, contacto_email, regimen, config)
      values ('${e.id}', '${e.nombre}', '${e.cuit}', 'Contacto',
              'contacto@local.test', 'relacion_dependencia', '${CONFIG(e.tope)}'::jsonb);
      insert into empleados (id, empresa_id, nombre, apellido, dni, numero_legajo,
                             fecha_ingreso, puesto, sector, activo)
      values ${e.empleados
        .map(
          ([id, nombre, apellido, dni, legajo]) =>
            `('${id}','${e.id}','${nombre}','${apellido}','${dni}','${legajo}',` +
            `'2020-01-01','Operario','Producción',true)`
        )
        .join(',')};
    `);
  }

  for (const c of CUENTAS) {
    const id = await crearCuenta(servicio, c.email);
    sql(`
      insert into usuarios (id, email, rol, nombre_completo, empresa_id)
      values ('${id}', '${c.email}', '${c.rol}', '${c.nombre}',
              ${c.empresa ? `'${c.empresa}'` : 'null'});
    `);
  }

  console.log(`
Listo. Entrá en http://localhost:3000/login

  super@local.test    superadmin (elegí la empresa al entrar)
  rrhh.a@local.test   admin de Panadería del Sur
  rrhh.b@local.test   admin de Metalúrgica Norte

  contraseña para todas: ${CONTRASENA}

Necesitás un .env.local apuntando a la base local; si no, la app le pega
a producción. Ver README o el comentario de este archivo.
`);
};

main().catch((e) => {
  console.error('\n' + e.message + '\n');
  process.exit(1);
});
