/**
 * Compara el cálculo legal de vacaciones de la BASE contra el de
 * TypeScript, sobre los mismos casos.
 *
 * Hay dos implementaciones de la misma regla: `vacaciones_legales_corridas`
 * en SQL —que es la que usa el trigger de saldo— y
 * `calcularVacacionesLegalesCorridas` en el cliente, que es la que pinta la
 * pantalla. Que digan lo mismo no está garantizado por nada: hay que
 * ejecutarlas sobre los mismos casos y comparar.
 *
 * D-01 fue exactamente esta divergencia, y no la encontró ningún test: la
 * encontró una auditoría de datos de producción. Esto la habría atrapado.
 *
 * Uso:
 *   bash scripts/comparar-vacaciones.sh
 */
import { createRequire } from 'node:module';
import pg from 'pg';

const require = createRequire(import.meta.url);

const URL_BASE = process.env.PG_URL;
const RUTA_TS = process.env.TS_VACACIONES;
if (!URL_BASE || !RUTA_TS) {
  console.error('Faltan PG_URL y/o TS_VACACIONES. Ver scripts/comparar-vacaciones.sh');
  process.exit(2);
}
const { calcularVacacionesLegalesCorridas, diasVacacionesCorresponden } =
  require(RUTA_TS);

/**
 * Se comparan los DOS puntos de entrada, no sólo el cálculo.
 *
 * D-01 no estaba en `vacaciones_legales_corridas` —esa siempre supo qué
 * hacer con la baja— sino en el despachador, que no se la pasaba. Una
 * comparación que sólo mirara el cálculo habría dado 19/19 y el bug
 * seguiría ahí. El despachador es además el que usa el trigger de saldo.
 */
const CONFIG_LEGAL = {};

const ANIO = 2026;

/**
 * Los casos son las tres reglas y sus bordes, más la baja, que es lo que
 * D-01 dejaba divergir.
 */
const CASOS = [
  { nombre: 'antigüedad exacta de 5 años', ingreso: '2021-12-31', baja: null },
  { nombre: '5 años y 1 día', ingreso: '2021-12-30', baja: null },
  { nombre: '10 años exactos', ingreso: '2016-12-31', baja: null },
  { nombre: '20 años exactos', ingreso: '2006-12-31', baja: null },
  { nombre: '20 años y 1 día', ingreso: '2006-12-30', baja: null },
  { nombre: 'menos de 5 años', ingreso: '2023-02-15', baja: null },
  { nombre: 'ingreso 1 de julio (alcanza el art. 151)', ingreso: '2026-07-01', baja: null },
  { nombre: 'ingreso 15 de julio (no alcanza)', ingreso: '2026-07-15', baja: null },
  { nombre: 'ingreso 1 de octubre', ingreso: '2026-10-01', baja: null },
  { nombre: 'ingreso el 31 de diciembre', ingreso: '2026-12-31', baja: null },
  { nombre: 'ingreso posterior al año', ingreso: '2027-01-05', baja: null },
  { nombre: 'nacido/ingresado un 29 de febrero', ingreso: '2016-02-29', baja: null },
  // --- Los que D-01 dejaba divergir ---
  { nombre: 'baja el 31 de marzo', ingreso: '2020-01-01', baja: '2026-03-31' },
  { nombre: 'baja el 30 de junio', ingreso: '2020-01-01', baja: '2026-06-30' },
  { nombre: 'baja el 31 de octubre', ingreso: '2020-01-01', baja: '2026-10-31' },
  { nombre: 'baja el 1 de enero', ingreso: '2020-01-01', baja: '2026-01-01' },
  { nombre: 'baja el 31 de diciembre', ingreso: '2020-01-01', baja: '2026-12-31' },
  { nombre: 'baja anterior al año', ingreso: '2020-01-01', baja: '2025-06-30' },
  { nombre: 'ingreso y baja el mismo año', ingreso: '2026-02-01', baja: '2026-11-30' },
];

const cliente = new pg.Client({ connectionString: URL_BASE });

const main = async () => {
  await cliente.connect();
  await cliente.query('begin');

  const { rows: emp } = await cliente.query(
    `insert into empresas (nombre, cuit, contacto_nombre, contacto_email, config)
     values ('Paridad vacaciones', '30-par-' || floor(random() * 100000)::text,
             'P', 'par@t.test',
             '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,
               "diasAvisoVencimiento":30,"metodosFichaje":["celular"]}'::jsonb)
     returning id`
  );
  const empresaId = emp[0].id;

  console.log(
    '\ncaso                                       cálculo      despachador'
  );
  console.log(
    ''.padEnd(43) + 'SQL  TS      SQL  TS'
  );
  console.log('─'.repeat(72));

  let iguales = 0;
  let difieren = 0;

  for (const caso of CASOS) {
    const { rows: e } = await cliente.query(
      `insert into empleados
         (empresa_id, nombre, apellido, dni, fecha_ingreso, puesto, sector,
          activo, fecha_baja)
       values ($1, 'Caso', 'Paridad',
               'par-' || floor(random() * 1000000)::text,
               $2::date, 'Op', 'Prod', $3::date is null, $3::date)
       returning id`,
      [empresaId, caso.ingreso, caso.baja]
    );
    const empleadoId = e[0].id;

    const datos = {
      fechaIngreso: caso.ingreso,
      fechaBaja: caso.baja ?? undefined,
      anio: ANIO,
    };

    // 1) El cálculo legal, directo.
    const { rows: r1 } = await cliente.query(
      'select vacaciones_legales_corridas($1, $2) as dias',
      [empleadoId, ANIO]
    );
    const calcSql = Number(r1[0].dias);
    const calcTs = calcularVacacionesLegalesCorridas(datos);

    // 2) El despachador, que es el camino que usa el trigger de saldo y
    //    donde vivía D-01.
    const { rows: r2 } = await cliente.query(
      'select dias_vacaciones_corresponden($1, $2, $3::jsonb) as dias',
      [empleadoId, ANIO, JSON.stringify(CONFIG_LEGAL)]
    );
    const despSql = Number(r2[0].dias);
    const despTs = diasVacacionesCorresponden({ ...datos, config: CONFIG_LEGAL });

    const ok = calcSql === calcTs && despSql === despTs;
    if (ok) iguales += 1;
    else difieren += 1;
    console.log(
      caso.nombre.padEnd(43) +
        String(calcSql).padStart(3) +
        String(calcTs).padStart(4) +
        '   ' +
        String(despSql).padStart(6) +
        String(despTs).padStart(4) +
        '   ' +
        (ok ? 'ok' : '✗ DIFIEREN')
    );
  }

  await cliente.query('rollback');
  await cliente.end();

  console.log('─'.repeat(72));
  console.log(`${iguales} coinciden, ${difieren} difieren\n`);
  if (difieren > 0) process.exit(1);
};

main().catch(async (e) => {
  console.error('La comparación falló:', e.message);
  try {
    await cliente.query('rollback');
    await cliente.end();
  } catch {
    // La conexión ya estaba cerrada.
  }
  process.exit(1);
});
