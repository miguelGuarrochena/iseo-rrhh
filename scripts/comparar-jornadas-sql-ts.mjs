/**
 * Compara el agrupado de jornadas de la BASE contra el de TypeScript.
 *
 * Hay dos implementaciones de la misma regla —`jornadas_de_empresa` en
 * SQL y `armarJornadas` en `src/lib/fichadas.ts`— porque una corre en
 * producción y la otra en la demo y en los tests. Que digan lo mismo no
 * está garantizado por nada: hay que ejecutarlas sobre los mismos
 * casos y comparar. Eso hace este script.
 *
 * Uso:
 *   PG_URL=postgres://… TS_FICHADAS=/ruta/a/fichadas.js \
 *     node scripts/comparar-jornadas-sql-ts.mjs
 *
 * `TS_FICHADAS` apunta al `fichadas.ts` compilado a CommonJS (por
 * ejemplo con `npx tsc src/lib/fichadas.ts --outDir /tmp/x …`).
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

pg.types.setTypeParser(1082, (valor) => valor);

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const URL_BASE = process.env.PG_URL;
const RUTA_TS = process.env.TS_FICHADAS;
if (!URL_BASE || !RUTA_TS) {
  console.error('Faltan PG_URL y/o TS_FICHADAS. Ver el encabezado.');
  process.exit(2);
}
const { armarJornadas } = require(RUTA_TS);

let ok = 0;
let fallas = 0;

const ESQUEMA = `
do $$ begin create type tipo_fichaje as enum ('ingreso','egreso');
exception when duplicate_object then null; end $$;
create table if not exists empresas (
  id uuid primary key default gen_random_uuid(), nombre text);
create table if not exists empleados (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references empresas(id));
create table if not exists fichajes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  empleado_id uuid not null references empleados(id) on delete cascade,
  tipo tipo_fichaje not null,
  ts timestamptz not null default now(),
  metodo text not null default 'celular',
  fuera_de_zona boolean);
create index if not exists fichajes_empresa_ts_idx on fichajes (empresa_id, ts desc);
create or replace function zona_empresa() returns text language sql immutable
as $fn$ select 'America/Argentina/Buenos_Aires'::text $fn$;
do $$ begin create role authenticated;
exception when duplicate_object then null; end $$;
`;

/**
 * Los casos. Cada uno son las marcas de UNA persona, en hora local.
 * Se corren contra las dos implementaciones y se comparan las jornadas
 * resultantes (fecha, horas, cerrada).
 */
const CASOS = [
  {
    nombre: 'jornada normal',
    marcas: [
      ['2026-07-27 07:00', 'ingreso'],
      ['2026-07-27 16:00', 'egreso'],
    ],
  },
  {
    nombre: 'con corte de almuerzo',
    marcas: [
      ['2026-07-27 07:04', 'ingreso'],
      ['2026-07-27 12:00', 'egreso'],
      ['2026-07-27 12:45', 'ingreso'],
      ['2026-07-27 16:02', 'egreso'],
    ],
  },
  {
    nombre: 'turno nocturno que cruza medianoche',
    marcas: [
      ['2026-07-27 22:00', 'ingreso'],
      ['2026-07-28 06:00', 'egreso'],
    ],
  },
  {
    nombre: 'se olvidó de fichar la salida',
    marcas: [
      ['2026-07-27 07:00', 'ingreso'],
      ['2026-07-28 07:00', 'ingreso'],
      ['2026-07-28 16:00', 'egreso'],
    ],
  },
  {
    // El caso que destapó un bug: tiene un ingreso y un egreso, pero
    // la última marca es el regreso del almuerzo. La jornada NO cerró.
    nombre: 'volvió del almuerzo y no fichó la salida',
    marcas: [
      ['2026-07-27 07:00', 'ingreso'],
      ['2026-07-27 12:00', 'egreso'],
      ['2026-07-27 12:30', 'ingreso'],
    ],
  },
  {
    nombre: 'egreso huérfano, sin ingreso',
    marcas: [['2026-07-27 16:00', 'egreso']],
  },
  {
    nombre: 'doble toque en la terminal',
    marcas: [
      ['2026-07-27 07:00', 'ingreso'],
      ['2026-07-27 07:00', 'ingreso'],
      ['2026-07-27 16:00', 'egreso'],
    ],
  },
  {
    nombre: 'dos jornadas el mismo día con 7 horas de hueco',
    marcas: [
      ['2026-07-27 06:00', 'ingreso'],
      ['2026-07-27 10:00', 'egreso'],
      ['2026-07-27 17:00', 'ingreso'],
      ['2026-07-27 21:00', 'egreso'],
    ],
  },
  {
    nombre: 'tres días seguidos',
    marcas: [
      ['2026-07-27 08:00', 'ingreso'],
      ['2026-07-27 17:00', 'egreso'],
      ['2026-07-28 08:00', 'ingreso'],
      ['2026-07-28 17:00', 'egreso'],
      ['2026-07-29 08:00', 'ingreso'],
      ['2026-07-29 17:00', 'egreso'],
    ],
  },
];

const cliente = new pg.Client({ connectionString: URL_BASE });

const correr = async () => {
  await cliente.connect();
  await cliente.query(ESQUEMA);
  await cliente.query(
    readFileSync(
      join(raiz, 'supabase/migrations/20260805000047_jornadas_por_sesion.sql'),
      'utf8'
    ).replace(/notify pgrst[^;]*;/g, '')
  );

  const { rows: emp } = await cliente.query(
    // `cuit`, `contacto_nombre` y `contacto_email` son NOT NULL: con sólo
    // el nombre este insert fallaba y el script no llegaba a comparar nada.
    `insert into empresas (nombre, cuit, contacto_nombre, contacto_email)
     values ('Comparación', '30-cmp-' || floor(random() * 100000)::text,
             'Comparación', 'cmp@t.test')
     returning id`
  );
  const empresaId = emp[0].id;

  console.log('\ncaso                                        SQL == TS');
  console.log('─'.repeat(62));

  for (const caso of CASOS) {
    const { rows: e } = await cliente.query(
      // Igual que con `empresas`: nombre, apellido, dni, fecha_ingreso,
      // puesto y sector son NOT NULL. El insert pelado no entraba.
      `insert into empleados
         (empresa_id, nombre, apellido, dni, fecha_ingreso, puesto, sector)
       values ($1, 'Caso', 'Comparación',
               'cmp-' || floor(random() * 1000000)::text,
               '2020-01-01', 'Op', 'Prod')
       returning id`,
      [empresaId]
    );
    const empleadoId = e[0].id;

    // Las mismas marcas en las dos implementaciones. En TS se usa un
    // reloj fijo y lejano para que nada quede "en curso" y la
    // comparación no dependa de cuándo se corre el script.
    const paraTs = [];
    for (const [hora, tipo] of caso.marcas) {
      const { rows } = await cliente.query(
        `insert into fichajes (empresa_id, empleado_id, tipo, ts)
         values ($1,$2,$3,($4::timestamp at time zone zona_empresa()))
         returning id, ts`,
        [empresaId, empleadoId, tipo, hora]
      );
      paraTs.push({
        id: rows[0].id,
        empleadoId,
        tipo,
        timestamp: new Date(rows[0].ts).toISOString(),
        metodo: 'facial_tablet',
      });
    }

    const { rows: deSql } = await cliente.query(
      `select fecha::text as fecha, entrada, salida, cerrada, marcas
       from jornadas_de_empresa($1,'2026-07-20','2026-08-05',array[$2]::uuid[])
       order by fecha`,
      [empresaId, empleadoId]
    );

    const normalizarSql = deSql.map((r) => ({
      fecha: r.fecha,
      horas:
        r.entrada && r.salida
          ? Math.round(
              ((new Date(r.salida) - new Date(r.entrada)) / 3600000) * 10
            ) / 10
          : 0,
      cerrada: r.cerrada,
      marcas: r.marcas,
    }));

    const AHORA = new Date('2026-09-01T12:00:00').getTime();
    const normalizarTs = armarJornadas(paraTs, AHORA).map((j) => ({
      fecha: j.fecha,
      horas: j.horas,
      cerrada: j.cerrada,
      marcas: j.marcas,
    }));

    const a = JSON.stringify(normalizarSql);
    const b = JSON.stringify(normalizarTs);
    const igual = a === b;
    if (igual) ok++;
    else fallas++;
    console.log(`${caso.nombre.padEnd(44)}${igual ? 'ok' : 'DISTINTO'}`);
    if (!igual) {
      console.log(`    SQL: ${a}`);
      console.log(`    TS : ${b}`);
    }
  }

  console.log('─'.repeat(62));
  console.log(`${ok} coinciden, ${fallas} difieren`);
  await cliente.end();
  process.exit(fallas ? 1 : 0);
};

correr().catch((e) => {
  console.error('ERROR', e.message);
  process.exit(1);
});
