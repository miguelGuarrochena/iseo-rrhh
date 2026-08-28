/**
 * Auditoría de impacto: qué le pasa a los datos que ya existen cuando
 * entra la corrección del cálculo legal de vacaciones (LCT 150-153).
 *
 * SOLO LEE. No escribe, no corrige, no toca nada. Su único trabajo es
 * decir si hay empleados que quedarían con saldo negativo o con
 * solicitudes por encima del cupo nuevo.
 *
 * Por qué se calcula acá y no con una consulta SQL: el cupo nuevo lo
 * decide `calcularVacacionesLegalesCorridas`, y la gracia de esta
 * auditoría es correr LA función que va a producción, no una traducción
 * de la regla a SQL que podría diferir justo en el borde que se está
 * midiendo.
 *
 * Uso:
 *   bash scripts/auditar-impacto-vacaciones.sh
 *
 * O directamente, con `vacaciones.ts` ya compilado a CommonJS:
 *   TS_VACACIONES=/ruta/vacaciones.js node scripts/auditar-impacto-vacaciones.mjs
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const RUTA_TS = process.env.TS_VACACIONES;
if (!RUTA_TS) {
  console.error('Falta TS_VACACIONES. Usá scripts/auditar-impacto-vacaciones.sh');
  process.exit(2);
}
const { calcularVacacionesLegalesCorridas, diasVacacionesDeRangoEnAnio } =
  require(RUTA_TS);
const { aniosCumplidos, diferenciaEnDias, hoyISO } = require(
  RUTA_TS.replace(/vacaciones\.js$/, 'fechas.js')
);

/**
 * La regla ANTERIOR, tal cual estaba antes de la corrección.
 *
 * Se copia acá a propósito y no se importa: el punto de la auditoría es
 * comparar dos reglas, y si esta saliera del código actual estaría
 * comparando la nueva contra sí misma.
 */
const cupoAnterior = (fechaIngreso, anio) => {
  const cierre = `${anio}-12-31`;
  if (!fechaIngreso || fechaIngreso > cierre) return 0;
  const dias = diferenciaEnDias(fechaIngreso, cierre);
  const anios = aniosCumplidos(fechaIngreso, cierre);
  if (dias / 365.25 < 0.5) return Math.floor(dias / 20);
  if (anios < 5) return 14;
  if (anios < 10) return 21;
  if (anios < 20) return 28;
  return 35;
};

// ---------- Lectura de producción, sólo GET ----------

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => [
      l.slice(0, l.indexOf('=')).trim(),
      l.slice(l.indexOf('=') + 1).trim(),
    ])
);
const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const CLAVE = env.SUPABASE_SECRET_KEY;
if (!URL_BASE || !CLAVE) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY.');
  process.exit(2);
}

/** GET paginado. Nunca manda otra cosa que GET. */
const traer = async (recurso) => {
  const filas = [];
  const tamano = 1000;
  for (let desde = 0; ; desde += tamano) {
    const r = await fetch(`${URL_BASE}/rest/v1/${recurso}`, {
      method: 'GET',
      headers: {
        apikey: CLAVE,
        Authorization: `Bearer ${CLAVE}`,
        Range: `${desde}-${desde + tamano - 1}`,
      },
    });
    if (!r.ok) throw new Error(`${recurso}: HTTP ${r.status} ${await r.text()}`);
    const lote = await r.json();
    filas.push(...lote);
    if (lote.length < tamano) break;
  }
  return filas;
};

// ---------- Auditoría ----------

const ANIO_ACTUAL = Number(hoyISO().slice(0, 4));
/**
 * Años que importan: el corriente y el anterior. El cupo es por año, y
 * un saldo del año pasado todavía puede estar consumiéndose o arrastrarse.
 */
const ANIOS = [ANIO_ACTUAL - 1, ANIO_ACTUAL];

const main = async () => {
  const [empresas, empleados, ausencias, arrastres] = await Promise.all([
    traer('empresas?select=id,nombre,config'),
    traer(
      'empleados?select=id,empresa_id,nombre,apellido,fecha_ingreso,activo,fecha_baja'
    ),
    traer(
      'ausencias?select=empleado_id,tipo,estado,fecha_desde,fecha_hasta&tipo=eq.vacaciones'
    ),
    traer('vacaciones_pendientes?select=empleado_id,anio,dias'),
  ]);

  const empresaDe = new Map(empresas.map((e) => [e.id, e]));
  const esHabiles = (empresaId) =>
    Boolean(empresaDe.get(empresaId)?.config?.vacacionesDiasHabiles);

  const porEmpleado = new Map();
  ausencias.forEach((a) => {
    const previas = porEmpleado.get(a.empleado_id);
    if (previas) previas.push(a);
    else porEmpleado.set(a.empleado_id, [a]);
  });
  const arrastreDe = new Map(
    arrastres.map((a) => [`${a.empleado_id}|${a.anio}`, Number(a.dias) || 0])
  );

  const filas = [];
  const conteo = {
    empresasCorridos: 0,
    empresasHabiles: 0,
    empleadosCorridos: 0,
    empleadosHabiles: 0,
    sinFechaIngreso: 0,
  };

  empresas.forEach((e) =>
    esHabiles(e.id) ? conteo.empresasHabiles++ : conteo.empresasCorridos++
  );

  for (const emp of empleados) {
    if (esHabiles(emp.empresa_id)) {
      conteo.empleadosHabiles += 1;
      continue; // Modalidad de días hábiles: la corrección no la toca.
    }
    conteo.empleadosCorridos += 1;
    if (!emp.fecha_ingreso) {
      conteo.sinFechaIngreso += 1;
      continue;
    }

    const suyas = porEmpleado.get(emp.id) ?? [];

    for (const anio of ANIOS) {
      const viejo = cupoAnterior(emp.fecha_ingreso, anio);
      const nuevo = calcularVacacionesLegalesCorridas({
        fechaIngreso: emp.fecha_ingreso,
        anio,
        fechaBaja: emp.fecha_baja ?? undefined,
        ausencias: suyas.map((a) => ({
          tipo: a.tipo,
          estado: a.estado,
          fechaDesde: a.fecha_desde,
          fechaHasta: a.fecha_hasta,
        })),
      });

      const enAnio = (estado) =>
        suyas
          .filter((a) => a.estado === estado)
          .reduce(
            (acc, a) =>
              acc +
              diasVacacionesDeRangoEnAnio(a.fecha_desde, a.fecha_hasta, anio),
            0
          );
      const aprobados = enAnio('aprobada');
      const pendientes = enAnio('pendiente');
      const arrastre = arrastreDe.get(`${emp.id}|${anio}`) ?? 0;

      const saldoViejo = viejo + arrastre - aprobados - pendientes;
      const saldoNuevo = nuevo + arrastre - aprobados - pendientes;

      const cambia = viejo !== nuevo;
      const conMovimiento = aprobados > 0 || pendientes > 0;
      if (!cambia && !conMovimiento) continue;

      filas.push({
        empresa: empresaDe.get(emp.empresa_id)?.nombre ?? '—',
        empleado: `${emp.apellido ?? ''} ${emp.nombre ?? ''}`.trim(),
        activo: emp.activo !== false,
        ingreso: emp.fecha_ingreso,
        anio,
        viejo,
        nuevo,
        arrastre,
        aprobados,
        pendientes,
        saldoViejo,
        saldoNuevo,
        cambia,
        baja: emp.fecha_baja ?? null,
        negativo: saldoNuevo < 0,
        // La distinción que decide si hay que hacer algo antes del deploy:
        // un saldo que YA estaba negativo con la regla anterior es un dato
        // preexistente, no una consecuencia de este cambio.
        yaEraNegativo: saldoViejo < 0,
        negativoNuevo: saldoNuevo < 0 && saldoViejo >= 0,
        // Lo que ya está aprobado no se puede "desaprobar": el problema
        // real es que una solicitud PENDIENTE quede por encima de lo que
        // queda después de descontar lo aprobado.
        pendientesSobreCupo:
          pendientes > 0 && pendientes > nuevo + arrastre - aprobados,
      });
    }
  }

  // ---------- Salida ----------
  const afectados = filas.filter((f) => f.cambia);
  const negativos = filas.filter((f) => f.negativo);
  const negativosNuevos = filas.filter((f) => f.negativoNuevo);
  const yaNegativos = filas.filter((f) => f.negativo && f.yaEraNegativo);
  const excedidos = filas.filter((f) => f.pendientesSobreCupo);
  const conBaja = filas.filter((f) => f.cambia && f.baja);

  const linea = '─'.repeat(78);
  console.log(`\n${linea}`);
  console.log('AUDITORÍA DE IMPACTO — vacaciones legales (LCT 150-153)');
  console.log(`Base: ${new URL(URL_BASE).host}   ·   solo lectura`);
  console.log(`Años auditados: ${ANIOS.join(', ')}`);
  console.log(linea);

  console.log('\nALCANCE');
  console.log(`  Empresas en régimen legal (días corridos): ${conteo.empresasCorridos}`);
  console.log(`  Empresas en días hábiles (fuera de alcance): ${conteo.empresasHabiles}`);
  console.log(`  Empleados evaluados (régimen legal): ${conteo.empleadosCorridos}`);
  console.log(`  Empleados en días hábiles (no evaluados): ${conteo.empleadosHabiles}`);
  if (conteo.sinFechaIngreso > 0) {
    console.log(`  Sin fecha de ingreso (no calculables): ${conteo.sinFechaIngreso}`);
  }

  console.log('\nRESULTADO');
  console.log(`  Empleado-año con cambio de cupo:            ${afectados.length}`);
  console.log(`  Con saldo NEGATIVO bajo la regla nueva:     ${negativos.length}`);
  console.log(`    · de ésos, YA estaban negativos antes:    ${yaNegativos.length}`);
  console.log(`    · negativos CAUSADOS por este cambio:     ${negativosNuevos.length}`);
  console.log(`  Con pendientes por encima del cupo nuevo:   ${excedidos.length}`);
  console.log(`  Cambios que corresponden a bajas:           ${conBaja.length}`);

  // Por qué cambió cada cupo. Son tres causas distintas y conviene no
  // mezclarlas: una es el corte de tramo del art. 150, otra el
  // proporcional del art. 153, y la tercera que la regla nueva cuenta
  // sólo hasta la baja mientras la anterior ignoraba la baja del todo.
  const porCausa = { tramo: [], proporcional: [], baja: [] };
  afectados.forEach((f) => {
    if (f.baja) porCausa.baja.push(f);
    else if (f.viejo >= 14 && f.nuevo >= 14) porCausa.tramo.push(f);
    else porCausa.proporcional.push(f);
  });
  console.log('\nPOR QUÉ CAMBIÓ EL CUPO');
  console.log(`  Corte de tramo del art. 150 (ingreso el 31/12):  ${porCausa.tramo.length}`);
  console.log(`  Proporcional del art. 153 sobre días hábiles:    ${porCausa.proporcional.length}`);
  console.log(`  La regla nueva cuenta sólo hasta la baja:        ${porCausa.baja.length}`);

  const detalle = filas.filter((f) => f.cambia || f.negativo || f.pendientesSobreCupo);
  if (detalle.length === 0) {
    console.log('\n  Ningún caso requiere intervención manual.');
  } else {
    console.log(`\nDETALLE (${detalle.length})`);
    console.log(
      '  ' +
        'Empleado'.padEnd(26) +
        'Ingreso'.padEnd(12) +
        'Año'.padEnd(6) +
        'Ant'.padEnd(5) +
        'Nue'.padEnd(5) +
        'Apr'.padEnd(5) +
        'Pen'.padEnd(5) +
        'S.ant'.padEnd(7) +
        'S.nue'.padEnd(7) +
        'Estado'
    );
    detalle
      .sort((a, b) => a.saldoNuevo - b.saldoNuevo)
      .forEach((f) => {
        const estado = f.negativoNuevo
          ? 'NEGATIVO (nuevo)'
          : f.negativo
            ? 'negativo YA ANTES'
            : f.pendientesSobreCupo
              ? 'PENDIENTE EXCEDE'
              : f.baja
                ? 'cupo cambia · con baja'
                : 'cupo cambia, saldo ok';
        console.log(
          '  ' +
            f.empleado.slice(0, 25).padEnd(26) +
            f.ingreso.padEnd(12) +
            String(f.anio).padEnd(6) +
            String(f.viejo).padEnd(5) +
            String(f.nuevo).padEnd(5) +
            String(f.aprobados).padEnd(5) +
            String(f.pendientes).padEnd(5) +
            String(f.saldoViejo).padEnd(7) +
            String(f.saldoNuevo).padEnd(7) +
            estado
        );
      });
  }

  console.log(`\n${linea}`);
  // Lo que obliga a revisar antes del deploy es lo que ESTE cambio causa.
  // Un saldo que ya estaba negativo es un problema de datos anterior, que
  // conviene mirar igual pero no lo produce esta corrección.
  const requiereRevision = negativosNuevos.length > 0 || excedidos.length > 0;
  console.log(
    requiereRevision
      ? 'B. MANUAL REVIEW REQUIRED'
      : 'A. READY TO DEPLOY — no hay datos que requieran intervención manual.'
  );
  console.log(`${linea}\n`);
};

main().catch((e) => {
  console.error('La auditoría falló:', e.message);
  process.exit(1);
});
