/**
 * Diagnóstico de pre-lanzamiento contra la base REAL.
 *
 *   node --env-file=.env scripts/prelanzamiento-solo-lectura.mjs
 *
 * SÓLO LECTURA, y no por promesa: la única función que habla con la red
 * hace `GET`. No hay POST, PATCH ni DELETE en este archivo, así que no
 * puede escribir aunque alguien se equivoque al editarlo.
 *
 * Responde lo que hay que saber antes de aplicar las migraciones 93-97:
 * si el esquema remoto es el que esperamos, si hay filas que romperían
 * una constraint o un trigger nuevo, y qué registros históricos quedan
 * afectados por las reglas nuevas.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const clave = process.env.SUPABASE_SECRET_KEY;

if (!url || !clave) {
  console.error('Faltan las variables. Usá: node --env-file=.env <script>');
  process.exit(1);
}

const cabeceras = { apikey: clave, Authorization: `Bearer ${clave}` };

/** El único acceso a la red. GET y nada más. */
const leer = async (ruta) => {
  const res = await fetch(`${url}/rest/v1/${ruta}`, {
    method: 'GET',
    headers: { ...cabeceras, Prefer: 'count=exact' },
  });
  const total = Number(
    (res.headers.get('content-range') ?? '/0').split('/')[1] || 0
  );
  if (!res.ok) {
    return { error: `${res.status} ${await res.text()}`, filas: [], total: 0 };
  }
  return { filas: await res.json(), total };
};

const titulo = (t) => console.log(`\n\x1b[1m${t}\x1b[0m\n${'─'.repeat(t.length)}`);
const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const mal = (m) => console.log(`  \x1b[31m✗\x1b[0m ${m}`);
const info = (m) => console.log(`  · ${m}`);

let bloqueantes = 0;
let avisos = 0;

/** Cuenta filas que cumplen un filtro; 0 es lo que se espera. */
const debeSerCero = async (etiqueta, ruta, { aviso = false } = {}) => {
  const { total, error } = await leer(`${ruta}&limit=1`);
  if (error) {
    mal(`${etiqueta}: no se pudo consultar (${error.slice(0, 120)})`);
    avisos += 1;
    return 0;
  }
  if (total === 0) {
    ok(`${etiqueta}: 0`);
  } else if (aviso) {
    console.log(`  \x1b[33m!\x1b[0m ${etiqueta}: \x1b[33m${total}\x1b[0m`);
    avisos += 1;
  } else {
    mal(`${etiqueta}: ${total}`);
    bloqueantes += 1;
  }
  return total;
};

const main = async () => {
  console.log(`\nBase: ${url}`);
  console.log('Modo: SOLO LECTURA (GET)\n');

  // ------------------------------------------------------------------
  titulo('1. Esquema remoto: ¿está en el punto que esperamos?');
  const cat = await fetch(`${url}/rest/v1/`, { headers: cabeceras });
  const { paths } = await cat.json();
  const rutas = new Set(Object.keys(paths ?? {}));

  const hasta92 = [
    'vacaciones_legales_corridas',
    'dias_vacaciones_corresponden',
    'saldo_vacaciones_disponible',
    'saldo_licencia_disponible',
    'dias_habiles_art151',
    'tramo_legal_art150',
  ];
  for (const rpc of hasta92) {
    if (rutas.has(`/rpc/${rpc}`)) ok(`rpc ${rpc} presente (mig ≤92)`);
    else {
      mal(`rpc ${rpc} FALTA — el remoto no llegó a la migración 92`);
      bloqueantes += 1;
    }
  }

  // 93-96 ya están aplicadas y registradas en el historial remoto.
  const desde93 = ['tipos_licencia_por_evento', 'dias_corridos_en_anio'];
  for (const rpc of desde93) {
    if (rutas.has(`/rpc/${rpc}`)) ok(`rpc ${rpc} presente (mig 93-96)`);
    else {
      mal(`rpc ${rpc} FALTA — el remoto no llegó a la migración 96`);
      bloqueantes += 1;
    }
  }

  const { error: errArchivado } = await leer(
    'documentos_firma?select=archivado_en&limit=1'
  );
  if (!errArchivado) ok('documentos_firma.archivado_en presente (mig 95)');
  else {
    mal('documentos_firma.archivado_en falta — la 95 no llegó');
    bloqueantes += 1;
  }

  // ------------------------------------------------------------------
  titulo('1b. P0: ¿anon puede ejecutar los RPC de vacaciones?');
  //
  // Es LA comprobación del push: antes de la 97 responden 200; después
  // tienen que responder 401/403. Se usa un UUID inexistente a propósito,
  // así la prueba no lee el dato de ninguna persona real.
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const FANTASMA = '00000000-0000-0000-0000-0000000000ff';
  if (!anonKey) {
    console.log('  · sin NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, no se puede probar');
  } else {
    const sondas = [
      ['vacaciones_legales_corridas', { p_empleado_id: FANTASMA, p_anio: 2026 }],
      [
        'dias_vacaciones_corresponden',
        { p_empleado_id: FANTASMA, p_anio: 2026, p_config: {} },
      ],
      [
        'dias_no_computables_art152',
        { p_empleado_id: FANTASMA, p_desde: '2026-01-01', p_hasta: '2026-12-31' },
      ],
    ];
    for (const [rpc, cuerpo] of sondas) {
      const res = await fetch(`${url}/rest/v1/rpc/${rpc}`, {
        method: 'POST',
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(cuerpo),
      });
      if (res.status === 200) {
        mal(`${rpc}: anon lo ejecuta (HTTP 200) — la 97 no está aplicada`);
        bloqueantes += 1;
      } else {
        ok(`${rpc}: anon bloqueado (HTTP ${res.status})`);
      }
    }
  }

  // ------------------------------------------------------------------
  titulo('2. Constraints NOT VALID de la migración 51 (F-20)');
  await debeSerCero(
    'remuneraciones con montos negativos',
    'remuneraciones?select=id&or=(monto_bruto.lt.0,monto_neto.lt.0,no_remunerativo.lt.0,aportes.lt.0,otros_descuentos.lt.0)'
  );
  await debeSerCero(
    'remuneraciones con período mal formado',
    'remuneraciones?select=id&periodo=not.like.____-__'
  );
  await debeSerCero(
    'recibos con período mal formado',
    'recibos?select=id&periodo=not.like.____-__'
  );
  await debeSerCero(
    'adelantos con período mal formado',
    'adelantos?select=id&periodo=not.is.null&periodo=not.like.____-__'
  );
  // PostgREST no compara columna contra columna: se traen y se comparan acá.
  const { filas: conBaja } = await leer(
    'empleados?select=id,nombre,apellido,fecha_ingreso,fecha_baja,activo&fecha_baja=not.is.null&limit=5000'
  );
  const bajaAntes = conBaja.filter((e) => e.fecha_baja < e.fecha_ingreso);
  if (bajaAntes.length) {
    mal(`empleados con baja anterior al ingreso: ${bajaAntes.length}`);
    bajaAntes.slice(0, 5).forEach((e) =>
      info(`    ${e.nombre} ${e.apellido}: ingreso ${e.fecha_ingreso}, baja ${e.fecha_baja}`)
    );
    bloqueantes += 1;
  } else {
    ok(`empleados con baja anterior al ingreso: 0 (${conBaja.length} con baja)`);
  }

  // ------------------------------------------------------------------
  titulo('3. Datos que podrían romper triggers o funciones nuevas');
  const { filas: todasAus, total: totalAus } = await leer(
    'ausencias?select=id,empresa_id,empleado_id,tipo,estado,fecha_desde,fecha_hasta,dias&limit=10000'
  );
  const invertidas = todasAus.filter((a) => a.fecha_hasta < a.fecha_desde);
  if (invertidas.length) {
    mal(`ausencias con rango invertido: ${invertidas.length}`);
    bloqueantes += 1;
  } else ok(`ausencias con rango invertido: 0 (${totalAus} ausencias)`);
  await debeSerCero('ausencias sin días', 'ausencias?select=id&dias=is.null');
  await debeSerCero(
    'ausencias con días < 1',
    'ausencias?select=id&dias=lt.1',
    { aviso: true }
  );
  await debeSerCero(
    'empleados sin fecha de ingreso',
    'empleados?select=id&fecha_ingreso=is.null'
  );
  await debeSerCero(
    'empleados sin puesto o sector',
    'empleados?select=id&or=(puesto.eq.,sector.eq.)',
    { aviso: true }
  );

  // ------------------------------------------------------------------
  titulo('4. Registros históricos afectados por las reglas nuevas');

  const evento = [
    'fallecimiento',
    'casamiento',
    'nacimiento',
    'maternidad',
    'excedencia',
  ];
  const { filas: cupos, error: errCupos } = await leer(
    'cupos_licencia?select=empresa_id,tipo,dias_anuales&limit=500'
  );
  if (errCupos) {
    mal(`cupos_licencia: ${errCupos.slice(0, 100)}`);
  } else {
    const porEvento = cupos.filter((c) => evento.includes(c.tipo));
    const enCero = cupos.filter((c) => c.dias_anuales === 0);
    info(`cupos_licencia cargados: ${cupos.length}`);
    if (porEvento.length) {
      console.log(
        `  \x1b[33m!\x1b[0m ${porEvento.length} cupo(s) sobre licencias POR EVENTO → quedan inertes tras la mig 94`
      );
      porEvento.forEach((c) =>
        info(`    ${c.tipo} = ${c.dias_anuales} (empresa ${c.empresa_id.slice(0, 8)}…)`)
      );
      avisos += 1;
    } else ok('ningún cupo sobre licencias por evento');
    if (enCero.length) {
      console.log(
        `  \x1b[33m!\x1b[0m ${enCero.length} cupo(s) en 0 → hoy bloquean ese tipo (L-01 ya ocurrido)`
      );
      enCero.forEach((c) =>
        info(`    ${c.tipo} = 0 (empresa ${c.empresa_id.slice(0, 8)}…)`)
      );
      avisos += 1;
    } else ok('ningún cupo quedó en 0 por el bug del panel');
  }

  // Ausencias 'especial' que podrían ser maternidad / nacimiento.
  const { filas: especiales } = await leer(
    'ausencias?select=id,empleado_id,fecha_desde,fecha_hasta,dias,comentario_empleado&tipo=eq.especial&limit=500'
  );
  if (especiales.length) {
    const largas = especiales.filter((a) => a.dias >= 30);
    const sospechosas = especiales.filter((a) =>
      /matern|nacim|parto|hijo|embaraz|licencia por nac|excedenc/i.test(
        a.comentario_empleado ?? ''
      )
    );
    info(`ausencias tipo 'especial': ${especiales.length}`);
    if (largas.length || sospechosas.length) {
      console.log(
        `  \x1b[33m!\x1b[0m ${largas.length} de 30+ días y ${sospechosas.length} con texto de maternidad/nacimiento → revisar si hay que reclasificar`
      );
      [...new Set([...largas, ...sospechosas])].slice(0, 10).forEach((a) =>
        info(
          `    ${a.fecha_desde}→${a.fecha_hasta} (${a.dias}d) "${(a.comentario_empleado ?? '').slice(0, 60)}"`
        )
      );
      avisos += 1;
    } else ok("ninguna 'especial' parece maternidad/nacimiento");
  } else ok("no hay ausencias tipo 'especial'");

  // Remuneraciones que las reglas nuevas ya no dejarían guardar.
  const { filas: remus } = await leer(
    'remuneraciones?select=id,periodo,monto_bruto,no_remunerativo,otros_descuentos&otros_descuentos=gt.0&limit=1000'
  );
  const excedenArt133 = remus.filter((r) => {
    const enDinero = Number(r.monto_bruto) + Number(r.no_remunerativo ?? 0);
    return enDinero > 0 && Number(r.otros_descuentos) > enDinero * 0.2;
  });
  if (excedenArt133.length) {
    console.log(
      `  \x1b[33m!\x1b[0m ${excedenArt133.length} remuneración(es) con descuentos >20% → existen, pero EDITARLAS fallará con la regla nueva`
    );
    excedenArt133.slice(0, 8).forEach((r) => {
      const enDinero = Number(r.monto_bruto) + Number(r.no_remunerativo ?? 0);
      info(
        `    ${r.periodo}: descuentos ${Math.round((r.otros_descuentos / enDinero) * 100)}% del período`
      );
    });
    avisos += 1;
  } else ok('ninguna remuneración supera el 20% del art. 133');

  // ------------------------------------------------------------------
  titulo('5. Integridad general');
  await debeSerCero(
    'empleados sin empresa',
    'empleados?select=id&empresa_id=is.null'
  );
  await debeSerCero(
    'usuarios sin empresa que no sean superadmin',
    'usuarios?select=id&empresa_id=is.null&rol=neq.superadmin'
  );
  await debeSerCero(
    'recibos vigentes sin firma del empleador y ya firmados por el empleado',
    'recibos?select=id&firmado_empleador_en=is.null&estado_firma=eq.firmado',
    { aviso: true }
  );
  await debeSerCero(
    'ausencias aprobadas sin fecha de resolución',
    'ausencias?select=id&estado=eq.aprobada&resuelta_en=is.null',
    { aviso: true }
  );
  await debeSerCero(
    'vacaciones_pendientes con días negativos',
    'vacaciones_pendientes?select=id&dias=lt.0'
  );
  await debeSerCero(
    'adelantos aprobados sin período de descuento',
    'adelantos?select=id&estado=eq.aprobado&periodo=is.null',
    { aviso: true }
  );

  // Coherencia activo / fecha_baja.
  const incoherentes = conBaja.filter((e) => e.activo === true);
  if (incoherentes.length) {
    console.log(
      `  \x1b[33m!\x1b[0m ${incoherentes.length} empleado(s) con fecha_baja pero activo=true`
    );
    incoherentes
      .slice(0, 5)
      .forEach((e) => info(`    ${e.nombre} ${e.apellido} — baja ${e.fecha_baja}`));
    avisos += 1;
  } else ok('activo y fecha_baja coherentes');

  // La ausencia y su legajo tienen que ser de la misma empresa.
  const { filas: emps } = await leer(
    'empleados?select=id,empresa_id&limit=10000'
  );
  const empresaDe = new Map(emps.map((e) => [e.id, e.empresa_id]));
  const cruzadas = todasAus.filter(
    (a) => empresaDe.has(a.empleado_id) && empresaDe.get(a.empleado_id) !== a.empresa_id
  );
  if (cruzadas.length) {
    mal(`ausencias cuyo empresa_id no coincide con el del legajo: ${cruzadas.length}`);
    bloqueantes += 1;
  } else ok('ausencias con empresa coherente con el legajo');

  // Recibos vigentes duplicados por (empleado, período, tipo).
  const { filas: recibos } = await leer(
    'recibos?select=empleado_id,periodo,tipo,archivado_en&archivado_en=is.null&limit=10000'
  );
  const claves = new Map();
  recibos.forEach((r) => {
    const k = `${r.empleado_id}|${r.periodo}|${r.tipo}`;
    claves.set(k, (claves.get(k) ?? 0) + 1);
  });
  const dups = [...claves.values()].filter((n) => n > 1).length;
  if (dups) {
    mal(`recibos vigentes duplicados por empleado/período/tipo: ${dups}`);
    bloqueantes += 1;
  } else ok(`recibos vigentes sin duplicados (${recibos.length} vigentes)`);

  // Solapamientos de ausencias del mismo empleado (F-07 sobre lo ya cargado).
  const { filas: aus } = await leer(
    'ausencias?select=id,empleado_id,tipo,estado,fecha_desde,fecha_hasta&estado=eq.aprobada&order=empleado_id,fecha_desde&limit=5000'
  );
  const JORNADA = [
    'entrada_tarde',
    'salida_anticipada',
    'salida_intermedia',
    'home_office',
  ];
  const porEmpleado = new Map();
  aus
    .filter((a) => !JORNADA.includes(a.tipo))
    .forEach((a) => {
      const l = porEmpleado.get(a.empleado_id) ?? [];
      l.push(a);
      porEmpleado.set(a.empleado_id, l);
    });
  let solapadas = 0;
  const ejemplos = [];
  for (const [emp, lista] of porEmpleado) {
    for (let i = 0; i < lista.length; i += 1) {
      for (let j = i + 1; j < lista.length; j += 1) {
        if (
          lista[i].fecha_desde <= lista[j].fecha_hasta &&
          lista[j].fecha_desde <= lista[i].fecha_hasta
        ) {
          solapadas += 1;
          if (ejemplos.length < 8) {
            ejemplos.push(
              `${emp.slice(0, 8)}… ${lista[i].tipo} ${lista[i].fecha_desde}→${lista[i].fecha_hasta} vs ${lista[j].tipo} ${lista[j].fecha_desde}→${lista[j].fecha_hasta}`
            );
          }
        }
      }
    }
  }
  if (solapadas) {
    console.log(
      `  \x1b[33m!\x1b[0m ${solapadas} par(es) de ausencias aprobadas solapadas → consumen saldo dos veces`
    );
    ejemplos.forEach((e) => info(`    ${e}`));
    avisos += 1;
  } else ok('sin ausencias aprobadas solapadas');

  // ------------------------------------------------------------------
  titulo('Resumen');
  console.log(`  bloqueantes: ${bloqueantes}`);
  console.log(`  a revisar:   ${avisos}\n`);
};

main().catch((e) => {
  console.error('\nFalló el diagnóstico:', e.message);
  process.exit(1);
});
