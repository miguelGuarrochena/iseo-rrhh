/**
 * Prueba de la lógica de jornadas contra un Postgres real.
 *
 * Los tests de Jest cubren la versión TypeScript (`armarJornadas`),
 * pero la que corre en producción es la SQL. Son dos implementaciones
 * de la misma regla y lo único que garantiza que no diverjan es
 * ejecutar las dos sobre los mismos casos y comparar.
 *
 * Uso:
 *   PG_URL=postgres://usuario:clave@host:5432/base node scripts/probar-jornadas.mjs
 *
 * No corre en CI por defecto porque necesita una base; se corre a mano
 * antes de aplicar una migración que toque el agrupado.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

/**
 * Que las columnas `date` lleguen como texto y no como Date.
 *
 * El driver las convierte a medianoche UTC, y al mostrarlas en hora de
 * Buenos Aires (UTC-3) retroceden un día. Es un artefacto del cliente,
 * no de la base —PostgREST devuelve "2026-07-27" como string—, pero
 * hace que un test correcto parezca fallar.
 */
pg.types.setTypeParser(1082, (valor) => valor);

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const URL_BASE = process.env.PG_URL;

if (!URL_BASE) {
  console.error('Falta PG_URL. Ver el encabezado del archivo.');
  process.exit(2);
}

let ok = 0;
let fallas = 0;

const verificar = (nombre, real, esperado) => {
  const a = JSON.stringify(real);
  const b = JSON.stringify(esperado);
  if (a === b) {
    ok++;
    console.log(`  ok    ${nombre}`);
  } else {
    fallas++;
    console.log(
      `  FALLA ${nombre}\n        esperado: ${b}\n        real:     ${a}`
    );
  }
};

/** Esquema mínimo: sólo lo que tocan las funciones de jornadas. */
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
-- Rol que crea Supabase y que la migración usa en los GRANT.
do $$ begin create role authenticated;
exception when duplicate_object then null; end $$;
`;

/** Sólo la parte de la migración que define funciones e índices. */
const migracion = () =>
  readFileSync(
    join(raiz, 'supabase/migrations/20260805000047_jornadas_por_sesion.sql'),
    'utf8'
  ).replace(/notify pgrst[^;]*;/g, '');

const cliente = new pg.Client({ connectionString: URL_BASE });

/** Marca con hora local de Buenos Aires. */
const marca = (empleado, hora, tipo) => ({ empleado, hora, tipo });

const correr = async () => {
  await cliente.connect();
  await cliente.query(ESQUEMA);
  await cliente.query(migracion());

  const { rows: emp } = await cliente.query(
    `insert into empresas (nombre) values ('Test') returning id`
  );
  const empresaId = emp[0].id;
  const empleados = {};
  for (const nombre of [
    'diurno',
    'nocturno',
    'olvidadizo',
    'huerfano',
    'almuerzo',
    'hoy',
  ]) {
    const { rows } = await cliente.query(
      `insert into empleados (empresa_id) values ($1) returning id`,
      [empresaId]
    );
    empleados[nombre] = rows[0].id;
  }

  const insertar = async (nombre, marcas) => {
    for (const m of marcas) {
      await cliente.query(
        `insert into fichajes (empresa_id, empleado_id, tipo, ts)
         values ($1, $2, $3, ($4::timestamp at time zone zona_empresa()))`,
        [empresaId, empleados[nombre], m.tipo, m.hora]
      );
    }
  };

  // --- Diurno: jornada normal con corte de almuerzo ---
  await insertar('diurno', [
    marca('diurno', '2026-07-27 07:04', 'ingreso'),
    marca('diurno', '2026-07-27 12:00', 'egreso'),
    marca('diurno', '2026-07-27 12:45', 'ingreso'),
    marca('diurno', '2026-07-27 16:02', 'egreso'),
    marca('diurno', '2026-07-28 07:05', 'ingreso'),
    marca('diurno', '2026-07-28 16:02', 'egreso'),
  ]);

  // --- Nocturno: entra el lunes 22:00 y sale el martes 06:00 ---
  await insertar('nocturno', [
    marca('nocturno', '2026-07-27 22:00', 'ingreso'),
    marca('nocturno', '2026-07-28 06:00', 'egreso'),
  ]);

  // --- Olvidadizo: no fichó la salida del lunes ---
  await insertar('olvidadizo', [
    marca('olvidadizo', '2026-07-27 07:00', 'ingreso'),
    marca('olvidadizo', '2026-07-28 07:00', 'ingreso'),
    marca('olvidadizo', '2026-07-28 16:00', 'egreso'),
  ]);

  // --- Almorzó y no fichó la salida: la jornada NO cerró aunque
  //     tenga un ingreso y un egreso. ---
  await insertar('almuerzo', [
    marca('almuerzo', '2026-07-27 07:00', 'ingreso'),
    marca('almuerzo', '2026-07-27 12:00', 'egreso'),
    marca('almuerzo', '2026-07-27 12:30', 'ingreso'),
  ]);

  // --- Huérfano: una salida sin entrada ---
  await insertar('huerfano', [marca('huerfano', '2026-07-27 16:00', 'egreso')]);

  const jornadas = async (desde, hasta, empleadoIds = null) => {
    const { rows } = await cliente.query(
      `select * from jornadas_de_empresa($1, $2, $3, $4)`,
      [empresaId, desde, hasta, empleadoIds]
    );
    return rows;
  };

  const nombreDe = (id) =>
    Object.entries(empleados).find(([, v]) => v === id)?.[0];

  const horas = (r) =>
    r.entrada && r.salida
      ? Math.round(((r.salida - r.entrada) / 3600000) * 10) / 10
      : 0;

  /** La columna `fecha` ya llega como "YYYY-MM-DD". */
  const iso = (d) => (d ? String(d).slice(0, 10) : null);

  console.log('\n== agrupado por sesión ==');

  const todas = await jornadas('2026-07-27', '2026-07-28');

  const delDiurno = todas.filter((r) => nombreDe(r.empleado_id) === 'diurno');
  verificar(
    'el almuerzo no parte la jornada',
    delDiurno.map((r) => [iso(r.fecha), horas(r), r.cerrada]),
    [
      ['2026-07-27', 9, true],
      ['2026-07-28', 9, true],
    ]
  );

  const delNocturno = todas.filter(
    (r) => nombreDe(r.empleado_id) === 'nocturno'
  );
  verificar(
    'el turno nocturno es UNA jornada, fechada el día que entró',
    delNocturno.map((r) => [iso(r.fecha), horas(r), r.cerrada]),
    [['2026-07-27', 8, true]]
  );

  const delOlvidadizo = todas.filter(
    (r) => nombreDe(r.empleado_id) === 'olvidadizo'
  );
  verificar(
    'la salida que falta deja UNA jornada abierta, no dos',
    delOlvidadizo.map((r) => [iso(r.fecha), r.cerrada, r.en_curso]),
    [
      ['2026-07-27', false, false],
      ['2026-07-28', true, false],
    ]
  );

  const delHuerfano = todas.filter(
    (r) => nombreDe(r.empleado_id) === 'huerfano'
  );
  verificar(
    'la salida sin entrada queda como jornada abierta',
    delHuerfano.map((r) => [iso(r.fecha), r.cerrada, r.entrada === null]),
    [['2026-07-27', false, true]]
  );

  const delAlmuerzo = todas.filter(
    (r) => nombreDe(r.empleado_id) === 'almuerzo'
  );
  verificar(
    'volver del almuerzo sin fichar la salida deja la jornada abierta',
    delAlmuerzo.map((r) => [iso(r.fecha), r.cerrada, r.marcas]),
    [['2026-07-27', false, 3]]
  );

  console.log('\n== estado en curso ==');

  // Alguien que entró hace dos horas y sigue adentro.
  await cliente.query(
    `insert into fichajes (empresa_id, empleado_id, tipo, ts)
     values ($1, $2, 'ingreso', now() - interval '2 hours')`,
    [empresaId, empleados.hoy]
  );
  const hoyISO = new Date().toLocaleDateString('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
  });
  const deHoy = (await jornadas(hoyISO, hoyISO)).filter(
    (r) => nombreDe(r.empleado_id) === 'hoy'
  );
  verificar(
    'quien está trabajando ahora es en_curso, no "sin cerrar"',
    deHoy.map((r) => [r.cerrada, r.en_curso]),
    [[false, true]]
  );

  console.log('\n== filtro en SQL + paginación ==');

  const abiertas = todas.filter((r) => !r.cerrada && !r.en_curso);
  verificar(
    'hay exactamente 3 jornadas sin cerrar en el período',
    abiertas.length,
    3
  );

  // Esto es lo que hace PostgREST cuando el cliente filtra sobre el
  // resultado de la función: WHERE antes de LIMIT/OFFSET.
  const pagina = async (offset, limite) => {
    const { rows } = await cliente.query(
      `select * from jornadas_de_empresa($1,$2,$3,null)
       where cerrada = false and en_curso = false
       order by fecha, empleado_id
       limit $4 offset $5`,
      [empresaId, '2026-07-27', '2026-07-28', limite, offset]
    );
    return rows;
  };
  const p1 = await pagina(0, 1);
  const p2 = await pagina(1, 1);
  const p3 = await pagina(2, 1);
  verificar(
    'el filtro se aplica antes de paginar: 1 abierta por página',
    [
      p1.length,
      p2.length,
      p3.length,
      new Set([p1[0], p2[0], p3[0]].map((r) => r.empleado_id)).size,
    ],
    [1, 1, 1, 3]
  );

  const { rows: cuenta } = await cliente.query(
    `select count(*)::int as n from jornadas_de_empresa($1,$2,$3,null)
     where cerrada = false and en_curso = false`,
    [empresaId, '2026-07-27', '2026-07-28']
  );
  verificar('el total para el paginador también sale de SQL', cuenta[0].n, 3);

  console.log('\n== marcas sueltas con el mismo criterio ==');

  const marcasAbiertas = await cliente.query(
    `select f.id from fichajes_del_periodo($1,$2,$3,null,true) f`,
    [empresaId, '2026-07-27', '2026-07-28']
  );
  // olvidadizo: 1 marca (el ingreso del 27) + huerfano: 1 marca.
  // olvidadizo (1) + huerfano (1) + almuerzo (3).
  verificar(
    'sólo devuelve las marcas de jornadas sin cerrar',
    marcasAbiertas.rows.length,
    5
  );

  const marcasTodas = await cliente.query(
    `select f.id from fichajes_del_periodo($1,$2,$3,null,false) f`,
    [empresaId, '2026-07-27', '2026-07-28']
  );
  // 6 del diurno + 2 del nocturno + 3 del olvidadizo + 1 del huérfano
  // + 3 del que volvió del almuerzo.
  verificar(
    'sin el filtro devuelve todas las del rango',
    marcasTodas.rows.length,
    15
  );

  const soloDiurno = await cliente.query(
    `select f.id from fichajes_del_periodo($1,$2,$3,$4,false) f`,
    [empresaId, '2026-07-27', '2026-07-28', [empleados.diurno]]
  );
  verificar('el filtro por empleado también es SQL', soloDiurno.rows.length, 6);

  console.log('\n== bordes del rango ==');

  // Pidiendo sólo el 28: la jornada nocturna arrancó el 27, así que no
  // corresponde a este período aunque tenga marcas el 28.
  const solo28 = (await jornadas('2026-07-28', '2026-07-28')).filter(
    (r) => nombreDe(r.empleado_id) === 'nocturno'
  );
  verificar(
    'la jornada se cuenta en el período en que empezó',
    solo28.length,
    0
  );

  // Pidiendo sólo el 27: la jornada nocturna se ve completa, con su
  // salida del 28, porque se leen 24 h de más para no cortarla.
  const solo27 = (await jornadas('2026-07-27', '2026-07-27')).filter(
    (r) => nombreDe(r.empleado_id) === 'nocturno'
  );
  verificar(
    'y se ve completa aunque la salida caiga fuera del rango',
    solo27.map((r) => [horas(r), r.cerrada]),
    [[8, true]]
  );

  console.log(`\n${ok} ok, ${fallas} fallas`);
  await cliente.end();
  process.exit(fallas ? 1 : 0);
};

correr().catch((e) => {
  console.error('ERROR', e.message);
  process.exit(1);
});
