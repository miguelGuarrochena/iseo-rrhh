/**
 * Auditoría de integridad de datos de RRHH: fechas y períodos laborales.
 *
 * SOLO LEE. No escribe, no corrige, no propone migraciones. Su único
 * producto es un inventario de casos para que RRHH los valide.
 *
 * Criterio de clasificación
 * -------------------------
 *   ROJO      imposible según las reglas del sistema o contradictorio en
 *             sí mismo (una baja anterior al ingreso, una ausencia de
 *             alguien que todavía no había entrado)
 *   NARANJA   sospechoso: no lo prohíbe nada, pero pide confirmación
 *   AMARILLO  puede ser válido; hace falta una regla de negocio para
 *             decidir
 *
 * La auditoría es deliberadamente conservadora: cuando un dato puede ser
 * legítimo bajo alguna regla que el código no fija, se marca amarillo y se
 * explica, en vez de afirmar que está mal. Nunca se asume cuál de los dos
 * datos en conflicto es el correcto.
 *
 * Uso:
 *   node scripts/auditar-integridad-rrhh.mjs
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/**
 * El cálculo de cupo se importa del código real, no se reimplementa: la
 * sección de saldos tiene que medir lo que el sistema efectivamente hace.
 * Si falta el módulo compilado, esa sección se saltea y el resto corre.
 */
let calcVac = null;
let diasEnAnio = null;
if (process.env.TS_VACACIONES) {
  const mod = require(process.env.TS_VACACIONES);
  calcVac = mod.diasVacacionesCorresponden;
  diasEnAnio = mod.diasVacacionesDeRangoEnAnio;
}

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

const HOY = new Date().toISOString().slice(0, 10);

// ---------- Acumulador de hallazgos ----------

const hallazgos = [];
const anotar = (grupo, nivel, caso) =>
  hallazgos.push({ grupo, nivel, ...caso });

const NIVELES = { rojo: '🔴', naranja: '🟠', amarillo: '🟡' };

const main = async () => {
  const [empresas, empleados, ausencias, arrastres] = await Promise.all([
    traer('empresas?select=id,nombre,config'),
    traer(
      'empleados?select=id,empresa_id,nombre,apellido,dni,fecha_nacimiento,' +
        'fecha_ingreso,fecha_baja,activo,motivo_baja,fecha_fin_contrato,' +
        'modalidad_contratacion,supervisor_id,creado_en'
    ),
    traer(
      'ausencias?select=id,empresa_id,empleado_id,tipo,estado,fecha_desde,' +
        'fecha_hasta,dias,creada_en'
    ),
    traer('vacaciones_pendientes?select=empleado_id,anio,dias'),
  ]);

  const empresaDe = new Map(empresas.map((e) => [e.id, e]));
  const empleadoDe = new Map(empleados.map((e) => [e.id, e]));
  const esHabiles = (empresaId) =>
    Boolean(empresaDe.get(empresaId)?.config?.vacacionesDiasHabiles);

  const nombre = (e) => `${e.apellido ?? ''} ${e.nombre ?? ''}`.trim() || '(sin nombre)';
  const modalidad = (e) =>
    esHabiles(e.empresa_id) ? 'días hábiles' : 'días corridos (legal)';

  const porEmpleado = new Map();
  ausencias.forEach((a) => {
    const p = porEmpleado.get(a.empleado_id);
    if (p) p.push(a);
    else porEmpleado.set(a.empleado_id, [a]);
  });

  // ============================================================
  // 1 · Fechas del legajo
  // ============================================================
  for (const e of empleados) {
    const base = {
      empleado: nombre(e),
      id: e.id,
      empresa: empresaDe.get(e.empresa_id)?.nombre ?? '—',
    };

    if (e.fecha_baja && e.fecha_baja < e.fecha_ingreso) {
      anotar('1. Legajo', 'rojo', {
        ...base,
        tipo: 'Baja anterior al ingreso',
        actual: `fecha_baja = ${e.fecha_baja}`,
        relacionado: `fecha_ingreso = ${e.fecha_ingreso}`,
        porque:
          'Nadie puede dejar de trabajar antes de haber entrado. El esquema ' +
          'tiene un CHECK que lo prohíbe, pero está declarado NOT VALID: ' +
          'valida las filas nuevas y nunca revisó las que ya estaban.',
        confirmar:
          'Cuál de las dos fechas es la real. No se puede deducir desde acá: ' +
          'puede estar mal el ingreso, la baja, o las dos.',
        impacto:
          'La antigüedad y el cupo de vacaciones se calculan sobre estas ' +
          'fechas. Con la baja anterior al ingreso el derecho del año da 0.',
      });
    }

    if (e.fecha_baja && e.fecha_baja === e.fecha_ingreso) {
      anotar('1. Legajo', 'amarillo', {
        ...base,
        tipo: 'Baja el mismo día del ingreso',
        actual: `fecha_baja = fecha_ingreso = ${e.fecha_ingreso}`,
        relacionado: `motivo_baja = ${e.motivo_baja ?? '—'}`,
        porque:
          'El sistema lo permite y puede ser real: un alta que se dio de baja ' +
          'el mismo día (arrepentimiento, error de alta, contrato que no se ' +
          'concretó). No es imposible, pero conviene mirarlo.',
        confirmar: 'Si la relación laboral existió aunque sea un día.',
        impacto:
          'Cupo de vacaciones 0 y liquidación final en cero. Si el alta fue un ' +
          'error, el legajo debería anularse en vez de quedar con baja.',
      });
    }

    // Coherencia entre el estado y la baja.
    if (e.activo === false && !e.fecha_baja) {
      anotar('1. Legajo', 'naranja', {
        ...base,
        tipo: 'Inactivo sin fecha de baja',
        actual: 'activo = false',
        relacionado: 'fecha_baja = null',
        porque:
          'Un legajo inactivo sin baja no tiene fin de relación laboral. Los ' +
          'cálculos que miran la baja lo tratan como si siguiera trabajando.',
        confirmar: 'Cuándo terminó la relación laboral.',
        impacto:
          'El cupo de vacaciones se sigue calculando hasta el 31/12 en vez de ' +
          'cortar en la baja.',
      });
    }
    if (e.activo !== false && e.fecha_baja) {
      anotar('1. Legajo', 'rojo', {
        ...base,
        tipo: 'Activo con fecha de baja cargada',
        actual: `activo = true, fecha_baja = ${e.fecha_baja}`,
        relacionado: `motivo_baja = ${e.motivo_baja ?? '—'}`,
        porque:
          'Las dos cosas se contradicen: o sigue trabajando o se fue. El ' +
          'sistema usa `activo` para listar y `fecha_baja` para calcular, así ' +
          'que las pantallas y los cálculos van a discrepar.',
        confirmar: 'Si la persona sigue en la empresa.',
        impacto:
          'Aparece en listados de personal activo pero su cupo de vacaciones ' +
          'se corta en la baja.',
      });
    }

    if (e.fecha_ingreso > HOY) {
      anotar('1. Legajo', 'amarillo', {
        ...base,
        tipo: 'Ingreso en el futuro',
        actual: `fecha_ingreso = ${e.fecha_ingreso}`,
        relacionado: `hoy = ${HOY}`,
        porque:
          'Puede ser un alta programada, que es legítima. Pero hasta esa fecha ' +
          'no corresponde cupo de vacaciones ni control de asistencia.',
        confirmar: 'Si es un ingreso futuro real o un error de tipeo.',
        impacto: 'Cupo 0 y ausencias imposibles de cargar hasta esa fecha.',
      });
    }

    if (e.fecha_nacimiento) {
      if (e.fecha_nacimiento >= e.fecha_ingreso) {
        anotar('1. Legajo', 'rojo', {
          ...base,
          tipo: 'Nacimiento posterior o igual al ingreso',
          actual: `fecha_nacimiento = ${e.fecha_nacimiento}`,
          relacionado: `fecha_ingreso = ${e.fecha_ingreso}`,
          porque: 'Nadie empieza a trabajar antes o el mismo día de nacer.',
          confirmar: 'Cuál de las dos fechas está mal cargada.',
          impacto:
            'La edad se muestra mal en el legajo y el cumpleaños de la agenda ' +
            'cae en una fecha sin sentido.',
        });
      } else {
        // Edad al ingresar. En Argentina el piso es 16 (Ley 26.390).
        const [an, mn, dn] = e.fecha_nacimiento.split('-').map(Number);
        const [ai, mi, di] = e.fecha_ingreso.split('-').map(Number);
        let edad = ai - an;
        if (mi < mn || (mi === mn && di < dn)) edad -= 1;
        if (edad < 16) {
          anotar('1. Legajo', 'naranja', {
            ...base,
            tipo: `Menor de 16 al ingresar (${edad} años)`,
            actual: `fecha_nacimiento = ${e.fecha_nacimiento}`,
            relacionado: `fecha_ingreso = ${e.fecha_ingreso}`,
            porque:
              'La Ley 26.390 prohíbe el trabajo por debajo de los 16 años. Es ' +
              'casi seguro un error de carga, pero el dato correcto no se ' +
              'puede deducir.',
            confirmar: 'La fecha de nacimiento contra el documento.',
            impacto: 'Edad y antigüedad mal calculadas; riesgo de inspección.',
          });
        }
        if (edad > 90) {
          anotar('1. Legajo', 'naranja', {
            ...base,
            tipo: `Edad implausible al ingresar (${edad} años)`,
            actual: `fecha_nacimiento = ${e.fecha_nacimiento}`,
            relacionado: `fecha_ingreso = ${e.fecha_ingreso}`,
            porque:
              'Más de 90 años al momento del ingreso es casi seguro un año mal ' +
              'tipeado.',
            confirmar: 'La fecha de nacimiento contra el documento.',
            impacto: 'Edad mal calculada en legajo y agenda.',
          });
        }
      }
    }

    if (e.fecha_fin_contrato && e.fecha_fin_contrato < e.fecha_ingreso) {
      anotar('1. Legajo', 'rojo', {
        ...base,
        tipo: 'Fin de contrato anterior al ingreso',
        actual: `fecha_fin_contrato = ${e.fecha_fin_contrato}`,
        relacionado: `fecha_ingreso = ${e.fecha_ingreso}`,
        porque: 'Un contrato no puede terminar antes de empezar.',
        confirmar: 'Cuál de las dos fechas es la del contrato real.',
        impacto:
          'El aviso de vencimiento de contrato no se dispara nunca, o se ' +
          'dispara siempre.',
      });
    }

    if (
      e.modalidad_contratacion === 'plazo_fijo' &&
      !e.fecha_fin_contrato
    ) {
      anotar('1. Legajo', 'amarillo', {
        ...base,
        tipo: 'Contrato a plazo fijo sin fecha de fin',
        actual: 'modalidad_contratacion = plazo_fijo',
        relacionado: 'fecha_fin_contrato = null',
        porque:
          'Un plazo fijo sin plazo no es un plazo fijo. Puede ser que falte ' +
          'cargarla, o que la modalidad esté mal elegida.',
        confirmar: 'La fecha de fin del contrato, o la modalidad correcta.',
        impacto:
          'No se genera el aviso de vencimiento y el contrato puede convertirse ' +
          'en indeterminado sin que nadie lo note.',
      });
    }

    if (e.supervisor_id === e.id) {
      anotar('6. Integridad general', 'rojo', {
        ...base,
        tipo: 'Es su propio supervisor',
        actual: `supervisor_id = ${e.id}`,
        relacionado: '—',
        porque: 'Una jerarquía no puede tener un ciclo de longitud 1.',
        confirmar: 'Quién es el supervisor real.',
        impacto: 'El organigrama no puede dibujar esa rama.',
      });
    }
    if (e.supervisor_id) {
      const sup = empleadoDe.get(e.supervisor_id);
      if (sup && sup.empresa_id !== e.empresa_id) {
        anotar('6. Integridad general', 'rojo', {
          ...base,
          tipo: 'Supervisor de otra empresa',
          actual: `supervisor = ${nombre(sup)} (${empresaDe.get(sup.empresa_id)?.nombre})`,
          relacionado: `empleado en ${base.empresa}`,
          porque:
            'Cruza el aislamiento entre empresas: el supervisor no debería ' +
            'poder ver a alguien de otro cliente.',
          confirmar: 'Quién supervisa realmente a esta persona.',
          impacto: 'Fuga de visibilidad entre empresas en el organigrama.',
        });
      }
    }
  }

  // ============================================================
  // 2 y 3 · Ausencias (las vacaciones son un tipo de ausencia)
  // ============================================================
  const solapan = (a, b) =>
    a.fecha_desde <= b.fecha_hasta && b.fecha_desde <= a.fecha_hasta;

  /** Días de calendario entre dos fechas civiles, inclusive. */
  const diasCorridos = (d, h) => {
    const u = (f) => {
      const [a, m, x] = f.split('-').map(Number);
      return Date.UTC(a, m - 1, x);
    };
    return Math.round((u(h) - u(d)) / 86400000) + 1;
  };

  let rangoInvertido = 0;

  for (const a of ausencias) {
    const e = empleadoDe.get(a.empleado_id);
    if (!e) {
      anotar('6. Integridad general', 'rojo', {
        empleado: '(inexistente)',
        id: a.empleado_id,
        empresa: '—',
        tipo: 'Ausencia de un empleado que no existe',
        actual: `ausencia ${a.id}`,
        relacionado: `empleado_id = ${a.empleado_id}`,
        porque: 'Hay una clave foránea que debería impedirlo.',
        confirmar: 'De quién es esa ausencia.',
        impacto: 'La ausencia no se puede atribuir a nadie.',
      });
      continue;
    }

    const esVac = a.tipo === 'vacaciones';
    const grupo = esVac ? '2. Vacaciones' : '3. Ausencias y licencias';
    const base = {
      empleado: nombre(e),
      id: e.id,
      empresa: empresaDe.get(e.empresa_id)?.nombre ?? '—',
      extra: esVac ? `modalidad: ${modalidad(e)}` : `tipo: ${a.tipo}`,
    };

    if (a.fecha_hasta < a.fecha_desde) {
      rangoInvertido += 1;
      anotar(grupo, 'rojo', {
        ...base,
        tipo: 'Fecha de fin anterior a la de inicio',
        actual: `${a.fecha_desde} → ${a.fecha_hasta}`,
        relacionado: `ausencia ${a.id}`,
        porque:
          'La tabla tiene un CHECK (`rango_valido`) que lo prohíbe. Si existe, ' +
          'entró por un camino que saltea la restricción.',
        confirmar: 'Las fechas reales del período.',
        impacto: 'Los días se cuentan en negativo o en cero.',
      });
    }

    if (a.empresa_id !== e.empresa_id) {
      anotar('6. Integridad general', 'rojo', {
        ...base,
        tipo: 'Ausencia cargada en otra empresa',
        actual: `ausencia.empresa_id = ${empresaDe.get(a.empresa_id)?.nombre ?? a.empresa_id}`,
        relacionado: `empleado.empresa_id = ${base.empresa}`,
        porque:
          'Un trigger (`assert_empleado_de_empresa`) lo impide desde la ' +
          'migración 63. Una fila así es anterior a esa regla.',
        confirmar: 'A qué empresa pertenece el período.',
        impacto: 'La ausencia se cuenta en el saldo de la empresa equivocada.',
      });
    }

    if (a.fecha_hasta < e.fecha_ingreso) {
      anotar(grupo, 'rojo', {
        ...base,
        tipo: esVac
          ? 'Vacaciones enteramente anteriores al ingreso'
          : 'Ausencia enteramente anterior al ingreso',
        actual: `${a.fecha_desde} → ${a.fecha_hasta} (${a.estado})`,
        relacionado: `fecha_ingreso = ${e.fecha_ingreso}`,
        porque:
          'El período completo cae antes de que la persona entrara. O la fecha ' +
          'de ingreso está mal, o la ausencia pertenece a otro legajo o a otro ' +
          'año. No se puede saber cuál desde el dato.',
        confirmar:
          'La fecha de ingreso real y a qué período corresponde la ausencia.',
        impacto: esVac
          ? 'Consume cupo de un año en el que la persona no trabajaba, y puede ' +
            'dejar el saldo en negativo.'
          : 'Figura una licencia de alguien que todavía no era empleado.',
      });
    } else if (a.fecha_desde < e.fecha_ingreso) {
      anotar(grupo, 'naranja', {
        ...base,
        tipo: esVac
          ? 'Vacaciones que empiezan antes del ingreso'
          : 'Ausencia que empieza antes del ingreso',
        actual: `${a.fecha_desde} → ${a.fecha_hasta} (${a.estado})`,
        relacionado: `fecha_ingreso = ${e.fecha_ingreso}`,
        porque:
          'El período arranca antes del ingreso y termina después. Puede ser ' +
          'un error de tipeo en el inicio, o una fecha de ingreso mal cargada.',
        confirmar: 'El primer día real del período.',
        impacto: 'Se cuentan días que caen fuera de la relación laboral.',
      });
    }

    if (e.fecha_baja) {
      if (a.fecha_desde > e.fecha_baja) {
        anotar(grupo, 'rojo', {
          ...base,
          tipo: esVac
            ? 'Vacaciones enteramente posteriores a la baja'
            : 'Ausencia enteramente posterior a la baja',
          actual: `${a.fecha_desde} → ${a.fecha_hasta} (${a.estado})`,
          relacionado: `fecha_baja = ${e.fecha_baja}`,
          porque:
            'El período empieza después de que la persona dejó la empresa.',
          confirmar: 'La fecha de baja real y si el período existió.',
          impacto:
            'Días imputados a alguien que ya no trabajaba; afecta el saldo y ' +
            'la liquidación final.',
        });
      } else if (a.fecha_hasta > e.fecha_baja) {
        anotar(grupo, 'naranja', {
          ...base,
          tipo: esVac
            ? 'Vacaciones que terminan después de la baja'
            : 'Ausencia que termina después de la baja',
          actual: `${a.fecha_desde} → ${a.fecha_hasta} (${a.estado})`,
          relacionado: `fecha_baja = ${e.fecha_baja}`,
          porque:
            'Empezó estando en la empresa y termina después de la baja. Puede ' +
            'ser real —vacaciones interrumpidas por la desvinculación— o una ' +
            'baja cargada con fecha anterior a la efectiva.',
          confirmar: 'Si el período se interrumpió al desvincularse.',
          impacto: 'Días de más en el consumo del cupo y en la liquidación.',
        });
      }
    }

    // Coherencia del campo `dias` con el rango, sólo para días corridos.
    // En la modalidad de días hábiles `dias` cuenta otra cosa y no se toca.
    if (!esHabiles(e.empresa_id) && a.fecha_hasta >= a.fecha_desde) {
      const esperado = diasCorridos(a.fecha_desde, a.fecha_hasta);
      if (Number(a.dias) !== esperado) {
        anotar(grupo, 'naranja', {
          ...base,
          tipo: 'El campo `dias` no coincide con el rango',
          actual: `dias = ${a.dias}`,
          relacionado: `${a.fecha_desde} → ${a.fecha_hasta} = ${esperado} días corridos`,
          porque:
            'En días corridos el total tiene que ser la cantidad de días del ' +
            'rango. Una diferencia sugiere que las fechas se editaron sin ' +
            'recalcular, o que la empresa cambió de modalidad después.',
          confirmar: 'Cuál de los dos valores es el correcto.',
          impacto: 'El saldo descuenta una cantidad distinta de la real.',
        });
      }
    }
  }

  // Solapamientos, por empleado.
  for (const [empleadoId, suyas] of porEmpleado) {
    const e = empleadoDe.get(empleadoId);
    if (!e) continue;
    const vigentes = suyas.filter((a) => a.estado !== 'rechazada');
    for (let i = 0; i < vigentes.length; i += 1) {
      for (let j = i + 1; j < vigentes.length; j += 1) {
        const a = vigentes[i];
        const b = vigentes[j];
        if (!solapan(a, b)) continue;
        // Las parciales de un mismo día conviven sin problema.
        const PARCIALES = new Set([
          'entrada_tarde',
          'salida_anticipada',
          'salida_intermedia',
          'home_office',
        ]);
        const ambasParciales =
          PARCIALES.has(a.tipo) && PARCIALES.has(b.tipo);
        const mismoTipo = a.tipo === b.tipo;
        const grupo =
          a.tipo === 'vacaciones' || b.tipo === 'vacaciones'
            ? '2. Vacaciones'
            : '3. Ausencias y licencias';
        anotar(grupo, ambasParciales ? 'amarillo' : mismoTipo ? 'rojo' : 'naranja', {
          empleado: nombre(e),
          id: e.id,
          empresa: empresaDe.get(e.empresa_id)?.nombre ?? '—',
          extra: `${a.tipo} ∩ ${b.tipo}`,
          tipo: mismoTipo
            ? `Dos períodos de ${a.tipo} superpuestos`
            : 'Períodos superpuestos de distinto tipo',
          actual: `${a.fecha_desde} → ${a.fecha_hasta} (${a.estado})`,
          relacionado: `${b.fecha_desde} → ${b.fecha_hasta} (${b.estado})`,
          porque: ambasParciales
            ? 'Son ausencias parciales de un mismo día (llegada tarde, salida ' +
              'anticipada, home office). Pueden convivir legítimamente.'
            : mismoTipo
              ? 'La misma persona no puede estar dos veces en el mismo estado ' +
                'los mismos días. Los días se cuentan dos veces.'
              : 'La persona figura en dos situaciones a la vez. Puede ser real ' +
                '—enfermarse durante las vacaciones interrumpe el período— ' +
                'pero el sistema descuenta los dos.',
          confirmar:
            'Qué pasó realmente esos días y cuál de los dos registros vale.',
          impacto:
            'El saldo descuenta los días duplicados y la planilla cuenta a la ' +
            'persona ausente por partida doble.',
        });
      }
    }
  }

  // ============================================================
  // 4 · Saldos de vacaciones
  //
  // Se calcula con la MISMA función que usa el producto, para que el
  // inventario diga lo que el sistema dice, no lo que debería decir.
  // ============================================================
  const saldos = [];
  if (!calcVac) {
    console.error(
      '\n  (Sección 4 salteada: falta TS_VACACIONES. Usá auditar-integridad-rrhh.sh)\n'
    );
  }
  if (calcVac && diasEnAnio) {
    const anioActual = Number(HOY.slice(0, 4));
    for (const e of empleados) {
      if (!e.fecha_ingreso) continue;
      const suyas = porEmpleado.get(e.id) ?? [];
      for (const anio of [anioActual - 1, anioActual]) {
        const cupo = calcVac({
          config: empresaDe.get(e.empresa_id)?.config,
          fechaIngreso: e.fecha_ingreso,
          fechaBaja: e.fecha_baja ?? undefined,
          anio,
          ausencias: suyas.map((a) => ({
            tipo: a.tipo,
            estado: a.estado,
            fechaDesde: a.fecha_desde,
            fechaHasta: a.fecha_hasta,
          })),
        });
        const habiles = esHabiles(e.empresa_id);
        const consumo = (estado) =>
          suyas
            .filter((a) => a.tipo === 'vacaciones' && a.estado === estado)
            .reduce(
              (acc, a) =>
                acc +
                diasEnAnio(a.fecha_desde, a.fecha_hasta, anio, { habiles }),
              0
            );
        const aprobados = consumo('aprobada');
        const pendientes = consumo('pendiente');
        const arrastre =
          arrastres.find((x) => x.empleado_id === e.id && x.anio === anio)
            ?.dias ?? 0;
        const saldo = cupo + Number(arrastre) - aprobados - pendientes;
        if (saldo >= 0) continue;

        // ¿Hay una inconsistencia de fechas que lo explique?
        const previas = suyas.filter(
          (a) => a.tipo === 'vacaciones' && a.fecha_hasta < e.fecha_ingreso
        );
        const explicacion =
          previas.length > 0
            ? `tiene ${previas.length} período(s) de vacaciones ANTERIORES a su ` +
              `fecha de ingreso (${e.fecha_ingreso}), por ${previas.reduce((s2, a) => s2 + Number(a.dias || 0), 0)} días`
            : null;

        saldos.push({ e, anio, cupo, aprobados, pendientes, saldo, explicacion });
        anotar('4. Saldos', explicacion ? 'naranja' : 'rojo', {
          empleado: nombre(e),
          id: e.id,
          empresa: empresaDe.get(e.empresa_id)?.nombre ?? '—',
          extra: `${modalidad(e)} · año ${anio}`,
          tipo: explicacion
            ? 'Saldo negativo atribuible a una fecha de ingreso dudosa'
            : 'Saldo negativo sin explicación en las fechas',
          actual: `saldo ${saldo} (cupo ${cupo}, aprobados ${aprobados}, pendientes ${pendientes}, arrastre ${arrastre})`,
          relacionado: explicacion ?? `fecha_ingreso = ${e.fecha_ingreso}`,
          porque: explicacion
            ? 'El saldo es negativo, pero la causa probable no es que se hayan ' +
              'otorgado días de más: es que la fecha de ingreso es posterior a ' +
              'vacaciones que la persona ya se tomó. Con la fecha corregida, el ' +
              'cupo sube y el saldo puede dejar de ser negativo. No se puede ' +
              'saber desde acá cuál es la fecha real.'
            : 'El saldo es negativo y las fechas del legajo son coherentes, así ' +
              'que se aprobaron más días de los que corresponden. El trigger de ' +
              'saldo lo permite cuando quien aprueba es gestor o superadmin: es ' +
              'un bypass deliberado, no una falla.',
          confirmar: explicacion
            ? 'La fecha de ingreso real. Recién con eso se sabe si el saldo es ' +
              'realmente negativo.'
            : 'Si el otorgamiento por encima del cupo fue una decisión ' +
              'deliberada (adelanto, acuerdo particular) o un error.',
          impacto:
            'Un saldo negativo bloquea la próxima solicitud de vacaciones de ' +
            'esa persona hasta que RRHH lo ajuste.',
        });
      }
    }
  }

  // ============================================================
  // 5 · Patrones de carga masiva
  // ============================================================
  const agrupar = (campo) => {
    const m = new Map();
    empleados.forEach((e) => {
      const v = e[campo];
      if (!v) return;
      const p = m.get(v);
      if (p) p.push(e);
      else m.set(v, [e]);
    });
    return m;
  };

  const conProblemas = new Set(
    hallazgos.filter((h) => h.nivel !== 'amarillo').map((h) => h.id)
  );

  const repetidas = [];
  for (const campo of ['fecha_ingreso', 'fecha_baja']) {
    for (const [fecha, grupo] of agrupar(campo)) {
      if (grupo.length < 3) continue;
      const afectados = grupo.filter((e) => conProblemas.has(e.id));
      repetidas.push({ campo, fecha, total: grupo.length, afectados: afectados.length });
      if (afectados.length > 0) {
        anotar('5. Carga masiva', 'naranja', {
          empleado: `${grupo.length} legajos`,
          id: '—',
          empresa: [...new Set(grupo.map((e) => empresaDe.get(e.empresa_id)?.nombre))].join(', '),
          extra: `${afectados.length} de ellos con otras inconsistencias`,
          tipo: `${campo} repetida: ${fecha}`,
          actual: `${grupo.length} empleados con ${campo} = ${fecha}`,
          relacionado: afectados
            .slice(0, 12)
            .map((e) => nombre(e))
            .join(', '),
          porque:
            'Una fecha repetida no es sospechosa por sí sola: puede ser una ' +
            'incorporación real de un grupo. Lo que la vuelve sospechosa es ' +
            'que varios de esos legajos tengan además ausencias fuera de su ' +
            'período laboral, que es lo que pasaría si la fecha cargada fuera ' +
            'la del día del import y no la del alta real.',
          confirmar:
            'Si ese día hubo un ingreso grupal real, o si es la fecha en la ' +
            'que se cargaron los legajos al sistema.',
          impacto:
            'Antigüedad, cupo de vacaciones, liquidación final e indemnización ' +
            'se calculan sobre esa fecha.',
        });
      }
    }
  }

  // Legajos creados en el mismo minuto: señal independiente de import.
  const porMinuto = new Map();
  empleados.forEach((e) => {
    if (!e.creado_en) return;
    const min = String(e.creado_en).slice(0, 16);
    const p = porMinuto.get(min);
    if (p) p.push(e);
    else porMinuto.set(min, [e]);
  });
  const rafagas = [...porMinuto.entries()]
    .filter(([, g]) => g.length >= 5)
    .sort((a, b) => b[1].length - a[1].length);

  // ============================================================
  // 6 · Arrastres
  // ============================================================
  for (const arr of arrastres) {
    const e = empleadoDe.get(arr.empleado_id);
    if (!e) {
      anotar('6. Integridad general', 'rojo', {
        empleado: '(inexistente)',
        id: arr.empleado_id,
        empresa: '—',
        tipo: 'Arrastre de vacaciones de un empleado que no existe',
        actual: `${arr.dias} días, año ${arr.anio}`,
        relacionado: `empleado_id = ${arr.empleado_id}`,
        porque: 'Hay una clave foránea que debería impedirlo.',
        confirmar: 'De quién es ese arrastre.',
        impacto: 'Días acumulados que no se pueden atribuir.',
      });
      continue;
    }
    if (Number(arr.dias) < 0) {
      anotar('4. Saldos', 'naranja', {
        empleado: nombre(e),
        id: e.id,
        empresa: empresaDe.get(e.empresa_id)?.nombre ?? '—',
        tipo: 'Arrastre negativo',
        actual: `${arr.dias} días en ${arr.anio}`,
        relacionado: `fecha_ingreso = ${e.fecha_ingreso}`,
        porque:
          'Un arrastre negativo descuenta cupo del año siguiente. Puede ser un ' +
          'ajuste deliberado de RRHH, pero conviene que sea explícito.',
        confirmar: 'Si el descuento fue una decisión o un error de signo.',
        impacto: 'Reduce el cupo disponible del año.',
      });
    }
  }

  // ============================================================
  // Salida
  // ============================================================
  const linea = '═'.repeat(80);
  console.log(`\n${linea}`);
  console.log('AUDITORÍA DE INTEGRIDAD DE DATOS — RRHH, fechas y períodos');
  console.log(`Base: ${new URL(URL_BASE).host}   ·   SOLO LECTURA, ningún dato modificado`);
  console.log(linea);

  const vacaciones = ausencias.filter((a) => a.tipo === 'vacaciones');
  const otras = ausencias.filter((a) => a.tipo !== 'vacaciones');
  const vacCorridos = vacaciones.filter(
    (a) => !esHabiles(empleadoDe.get(a.empleado_id)?.empresa_id)
  );

  console.log('\nUNIVERSO ANALIZADO');
  console.log(`  Empresas:                                   ${empresas.length}`);
  console.log(`    · en régimen legal (días corridos):       ${empresas.filter((e) => !esHabiles(e.id)).length}`);
  console.log(`    · en modalidad de días hábiles:           ${empresas.filter((e) => esHabiles(e.id)).length}`);
  console.log(`  Empleados analizados:                       ${empleados.length}`);
  console.log(`  Ausencias analizadas (total):               ${ausencias.length}`);
  console.log(`    · vacaciones:                             ${vacaciones.length}`);
  console.log(`        – en días corridos (legal):           ${vacCorridos.length}`);
  console.log(`        – en días hábiles:                    ${vacaciones.length - vacCorridos.length}`);
  console.log(`    · otras licencias:                        ${otras.length}`);
  console.log(`  Arrastres de vacaciones:                    ${arrastres.length}`);

  const cuenta = (pred) => hallazgos.filter(pred).length;
  const idsUnicos = (pred) =>
    new Set(hallazgos.filter(pred).map((h) => h.id)).size;

  console.log('\nRESUMEN');
  console.log(`  Empleados con ingreso inconsistente:        ${idsUnicos((h) => /ingreso|Nacimiento|Edad|futuro/i.test(h.tipo) && h.grupo === '1. Legajo')}`);
  console.log(`  Empleados con baja inconsistente:           ${idsUnicos((h) => /baja/i.test(h.tipo) && h.grupo === '1. Legajo')}`);
  console.log(`  Vacaciones anteriores al ingreso:           ${cuenta((h) => h.grupo === '2. Vacaciones' && /anterior|antes del ingreso/i.test(h.tipo))}`);
  console.log(`  Ausencias anteriores al ingreso:            ${cuenta((h) => h.grupo === '3. Ausencias y licencias' && /anterior|antes del ingreso/i.test(h.tipo))}`);
  console.log(`  Períodos inválidos (fin < inicio):          ${rangoInvertido}`);
  console.log(`  Solapamientos:                              ${cuenta((h) => /superpuest/i.test(h.tipo))}`);
  console.log(`  Vacaciones posteriores a la baja:           ${cuenta((h) => h.grupo === '2. Vacaciones' && /posterior|después de la baja/i.test(h.tipo))}`);
  console.log(`  Ausencias posteriores a la baja:            ${cuenta((h) => h.grupo === '3. Ausencias y licencias' && /posterior|después de la baja/i.test(h.tipo))}`);
  console.log(`  Saldos negativos:                           ${saldos.length}`);
  console.log(`    · explicables por fechas dudosas:          ${saldos.filter((s2) => s2.explicacion).length}`);
  console.log(`    · sin explicación en las fechas:           ${saldos.filter((s2) => !s2.explicacion).length}`);
  console.log(`  Fechas de ingreso/baja muy repetidas:       ${repetidas.length}`);
  console.log(`  Otros hallazgos (integridad general):       ${cuenta((h) => h.grupo === '6. Integridad general')}`);

  console.log('\n  Por gravedad:');
  for (const n of ['rojo', 'naranja', 'amarillo']) {
    console.log(`    ${NIVELES[n]}  ${String(cuenta((h) => h.nivel === n)).padStart(3)}`);
  }

  if (rafagas.length > 0) {
    console.log('\n  Legajos creados en el mismo minuto (señal de import):');
    rafagas.slice(0, 8).forEach(([min, g]) =>
      console.log(`    ${min}  →  ${g.length} legajos`)
    );
  }

  // Detalle
  const grupos = [...new Set(hallazgos.map((h) => h.grupo))].sort();
  for (const g of grupos) {
    const delGrupo = hallazgos.filter((h) => h.grupo === g);
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`${g}  (${delGrupo.length})`);
    console.log('─'.repeat(80));
    for (const n of ['rojo', 'naranja', 'amarillo']) {
      const delNivel = delGrupo.filter((h) => h.nivel === n);
      if (delNivel.length === 0) continue;
      // Se agrupan por tipo para no repetir la explicación en cada caso.
      const porTipo = new Map();
      delNivel.forEach((h) => {
        const p = porTipo.get(h.tipo);
        if (p) p.push(h);
        else porTipo.set(h.tipo, [h]);
      });
      for (const [tipo, casos] of porTipo) {
        const m = casos[0];
        console.log(`\n${NIVELES[n]} ${tipo}  —  ${casos.length} caso(s)`);
        console.log(`   Por qué es sospechoso: ${m.porque}`);
        console.log(`   Qué debería confirmar RRHH: ${m.confirmar}`);
        console.log(`   Impacto potencial: ${m.impacto}`);
        casos.slice(0, 25).forEach((c) => {
          console.log(`     · ${c.empleado.padEnd(28)} ${c.empresa.slice(0, 18).padEnd(19)}`);
          console.log(`       id ${c.id}`);
          console.log(`       dato: ${c.actual}`);
          console.log(`       relacionado: ${c.relacionado}`);
          if (c.extra) console.log(`       ${c.extra}`);
        });
        if (casos.length > 25) console.log(`     … y ${casos.length - 25} más`);
      }
    }
  }

  console.log(`\n${linea}`);
  console.log('Ningún dato fue modificado. Este informe es un inventario para RRHH.');
  console.log(`${linea}\n`);
};

main().catch((e) => {
  console.error('La auditoría falló:', e.message);
  process.exit(1);
});
