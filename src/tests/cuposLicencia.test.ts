import {
  cupoAnualDe,
  diasLicenciaAprobadosEnAnio,
  esLicenciaPorEvento,
  puedeAprobarLicenciaContraCupo,
  saldoLicenciaDisponibleDe,
} from '@/lib/seguridad/cuposLicencia';
import {
  crearAusencia,
  getCuposLicencia,
  getEmpresa,
  getSaldosLicencia,
  guardarCupoLicencia,
  resolverAusencia,
} from '@/lib/services/rrhh';
import {
  TIPOS_LICENCIA_CON_CUPO,
  TIPOS_LICENCIA_POR_EVENTO,
} from '@/types/rrhh';
import type { Ausencia, CupoLicencia } from '@/types/rrhh';

type AusenciaDeCupo = Pick<
  Ausencia,
  'tipo' | 'estado' | 'fechaDesde' | 'fechaHasta' | 'dias'
>;

const aus = (partial: Partial<Ausencia> & AusenciaDeCupo): AusenciaDeCupo =>
  partial;

describe('cuposLicencia (espejo getSaldosLicencia)', () => {
  const cupos: CupoLicencia[] = [
    { id: '1', empresaId: 'e', tipo: 'mudanza', diasAnuales: 5 },
    { id: '2', empresaId: 'e', tipo: 'especial', diasAnuales: 0 },
  ];

  it('sin fila de cupo → sin límite', () => {
    expect(cupoAnualDe(cupos, 'enfermedad')).toBeNull();
    expect(cupoAnualDe([], 'mudanza')).toBeNull();
    expect(puedeAprobarLicenciaContraCupo([], [], 'enfermedad', 2026, 30)).toBe(
      true
    );
  });

  it('vacaciones no usa cupo de licencia', () => {
    expect(cupoAnualDe(cupos, 'vacaciones')).toBeNull();
  });

  it('solo aprobadas consumen; pendientes y rechazadas no', () => {
    const lista = [
      aus({
        tipo: 'mudanza',
        estado: 'aprobada',
        fechaDesde: '2026-01-10',
        fechaHasta: '2026-01-11',
        dias: 2,
      }),
      aus({
        tipo: 'mudanza',
        estado: 'pendiente',
        fechaDesde: '2026-02-10',
        fechaHasta: '2026-02-13',
        dias: 4,
      }),
      aus({
        tipo: 'mudanza',
        estado: 'rechazada',
        fechaDesde: '2026-03-10',
        fechaHasta: '2026-03-12',
        dias: 3,
      }),
      aus({
        tipo: 'mudanza',
        estado: 'aprobada',
        fechaDesde: '2025-12-01',
        fechaHasta: '2025-12-10',
        dias: 10,
      }),
    ];
    expect(diasLicenciaAprobadosEnAnio(lista, 'mudanza', 2026)).toBe(2);
    expect(saldoLicenciaDisponibleDe(cupos, lista, 'mudanza', 2026)).toBe(3);
  });

  it('cupo completo / parcial / exceso', () => {
    const usadas = [
      aus({
        tipo: 'mudanza',
        estado: 'aprobada',
        fechaDesde: '2026-01-01',
        fechaHasta: '2026-01-04',
        dias: 4,
      }),
    ];
    expect(
      puedeAprobarLicenciaContraCupo(cupos, usadas, 'mudanza', 2026, 1)
    ).toBe(true);
    expect(
      puedeAprobarLicenciaContraCupo(cupos, usadas, 'mudanza', 2026, 2)
    ).toBe(false);
    expect(puedeAprobarLicenciaContraCupo(cupos, [], 'especial', 2026, 1)).toBe(
      false
    ); // cupo 0
  });

  it('múltiples empleados son independientes', () => {
    // El helper es por lista de ausencias de UN empleado; cada legajo
    // trae su propia lista → cupos iguales, consumos separados.
    const empA = [
      aus({
        tipo: 'mudanza',
        estado: 'aprobada',
        fechaDesde: '2026-01-01',
        fechaHasta: '2026-01-05',
        dias: 5,
      }),
    ];
    const empB: typeof empA = [];
    expect(saldoLicenciaDisponibleDe(cupos, empA, 'mudanza', 2026)).toBe(0);
    expect(saldoLicenciaDisponibleDe(cupos, empB, 'mudanza', 2026)).toBe(5);
  });
});

/**
 * L-02 — las licencias que la ley da por hecho generador no llevan cupo.
 *
 * Art. 158: diez días corridos por matrimonio, tres por fallecimiento de
 * cónyuge/hijos/padres, uno por hermano, dos por nacimiento — cada vez
 * que el hecho ocurre. El único inciso con tope anual es el e), exámenes.
 */
describe('L-02: licencias por evento', () => {
  it('fallecimiento, casamiento y nacimiento son por evento', () => {
    expect(esLicenciaPorEvento('fallecimiento')).toBe(true);
    expect(esLicenciaPorEvento('casamiento')).toBe(true);
    expect(esLicenciaPorEvento('nacimiento')).toBe(true);
  });

  it('maternidad y excedencia también: tienen su duración legal propia', () => {
    expect(esLicenciaPorEvento('maternidad')).toBe(true);
    expect(esLicenciaPorEvento('excedencia')).toBe(true);
  });

  it('exámenes conserva su tope anual (art. 158 inc. e)', () => {
    expect(esLicenciaPorEvento('examenes')).toBe(false);
    expect(TIPOS_LICENCIA_CON_CUPO).toContain('examenes');
  });

  it('ningún tipo por evento aparece en la lista configurable', () => {
    TIPOS_LICENCIA_POR_EVENTO.forEach((t) => {
      expect(TIPOS_LICENCIA_CON_CUPO).not.toContain(t);
    });
  });

  it('una fila vieja de cupo sobre un tipo por evento no limita nada', () => {
    // No se borran datos: se dejan de consultar.
    const viejos: CupoLicencia[] = [
      { id: '9', empresaId: 'e', tipo: 'fallecimiento', diasAnuales: 3 },
    ];
    expect(cupoAnualDe(viejos, 'fallecimiento')).toBeNull();
    expect(
      puedeAprobarLicenciaContraCupo(viejos, [], 'fallecimiento', 2026, 3)
    ).toBe(true);
  });

  it('dos fallecimientos en el mismo año: el segundo también corresponde', () => {
    const viejos: CupoLicencia[] = [
      { id: '9', empresaId: 'e', tipo: 'fallecimiento', diasAnuales: 3 },
    ];
    const primero = [
      aus({
        tipo: 'fallecimiento',
        estado: 'aprobada',
        fechaDesde: '2026-03-02',
        fechaHasta: '2026-03-04',
        dias: 3,
      }),
    ];
    // Con el cupo anual esto daba false y no había override de gestor.
    expect(
      puedeAprobarLicenciaContraCupo(viejos, primero, 'fallecimiento', 2026, 3)
    ).toBe(true);
  });
});

/**
 * F-06 — los días se imputan al año al que pertenecen.
 *
 * Es el mismo BUG-012 que la migración 68 arregló en vacaciones y que
 * seguía vivo en licencias: una licencia del 28/12 al 06/01 consumía diez
 * días del año que terminaba y ninguno del que empezaba.
 */
describe('F-06: licencia que cruza el 31/12', () => {
  const cupos: CupoLicencia[] = [
    { id: '1', empresaId: 'e', tipo: 'estudio', diasAnuales: 10 },
  ];
  const aCaballo = [
    aus({
      tipo: 'estudio',
      estado: 'aprobada',
      fechaDesde: '2026-12-28',
      fechaHasta: '2027-01-06',
      dias: 10,
    }),
  ];

  it('cada año recibe los días que le tocan', () => {
    expect(diasLicenciaAprobadosEnAnio(aCaballo, 'estudio', 2026)).toBe(4);
    expect(diasLicenciaAprobadosEnAnio(aCaballo, 'estudio', 2027)).toBe(6);
  });

  it('el saldo de cada año se calcula sobre sus propios días', () => {
    expect(saldoLicenciaDisponibleDe(cupos, aCaballo, 'estudio', 2026)).toBe(6);
    expect(saldoLicenciaDisponibleDe(cupos, aCaballo, 'estudio', 2027)).toBe(4);
  });
});

/**
 * L-01 / F-11 — "sin configurar" no es lo mismo que un cupo de cero.
 */
describe('L-01: sin límite vs cupo cero', () => {
  it('guardar null quita la fila y devuelve a "sin límite"', async () => {
    await guardarCupoLicencia('mudanza', 0);
    const conCero = await getCuposLicencia();
    expect(conCero.find((c) => c.tipo === 'mudanza')?.diasAnuales).toBe(0);
    // Cupo 0 es un tope real y bloquea.
    expect(cupoAnualDe(conCero, 'mudanza')).toBe(0);

    expect(await guardarCupoLicencia('mudanza', null)).toBeNull();
    const sinFila = await getCuposLicencia();
    expect(sinFila.find((c) => c.tipo === 'mudanza')).toBeUndefined();
    // Sin fila vuelve a ser libre.
    expect(cupoAnualDe(sinFila, 'mudanza')).toBeNull();
    expect(
      puedeAprobarLicenciaContraCupo(sinFila, [], 'mudanza', 2026, 30)
    ).toBe(true);
  });
});

describe('BUG-010 demo: crear/aprobar respeta cupo', () => {
  it('pendiente puede pedirse aunque exceda (no consume)', async () => {
    await guardarCupoLicencia('estudio', 1);
    const creada = await crearAusencia({
      empleadoId: 'ple-4',
      tipo: 'estudio',
      fechaDesde: '2026-11-01',
      fechaHasta: '2026-11-05',
    });
    expect(creada.estado).toBe('pendiente');
    expect(creada.dias).toBe(5);
  });

  it('aprobar sobre cupo → DENIED; rechazar → OK', async () => {
    await guardarCupoLicencia('donacion_sangre', 1);
    const pendiente = await crearAusencia({
      empleadoId: 'ple-4',
      tipo: 'donacion_sangre',
      fechaDesde: '2026-10-01',
      fechaHasta: '2026-10-02',
    });
    await expect(
      resolverAusencia(pendiente.id, 'aprobada', 'ple-1')
    ).rejects.toThrow(/licencia suficientes/);

    const ok = await resolverAusencia(pendiente.id, 'rechazada', 'ple-1');
    expect(ok?.estado).toBe('rechazada');
  });

  it('carga admin aprobada dentro de cupo → OK; exceso → DENIED', async () => {
    await guardarCupoLicencia('examenes', 2);
    const ok = await crearAusencia({
      empleadoId: 'ple-5',
      tipo: 'examenes',
      fechaDesde: '2026-09-01',
      fechaHasta: '2026-09-02',
      aprobarAutomaticamente: true,
    });
    expect(ok.estado).toBe('aprobada');
    expect(ok.dias).toBe(2);

    await expect(
      crearAusencia({
        empleadoId: 'ple-5',
        tipo: 'examenes',
        fechaDesde: '2026-09-10',
        fechaHasta: '2026-09-10',
        aprobarAutomaticamente: true,
      })
    ).rejects.toThrow(/licencia suficientes/);
  });

  it('sin cupo configurado (enfermedad) no limita', async () => {
    const creada = await crearAusencia({
      empleadoId: 'ple-4',
      tipo: 'enfermedad',
      fechaDesde: '2026-08-01',
      fechaHasta: '2026-08-15',
      aprobarAutomaticamente: true,
    });
    expect(creada.estado).toBe('aprobada');
    expect(creada.dias).toBe(15);
  });

  it('getSaldosLicencia refleja solo aprobadas', async () => {
    await guardarCupoLicencia('mudanza', 3);
    await crearAusencia({
      empleadoId: 'ple-3',
      tipo: 'mudanza',
      fechaDesde: '2026-07-01',
      fechaHasta: '2026-07-02',
      aprobarAutomaticamente: true,
    });
    await crearAusencia({
      empleadoId: 'ple-3',
      tipo: 'mudanza',
      fechaDesde: '2026-07-10',
      fechaHasta: '2026-07-12',
    });
    const saldos = await getSaldosLicencia('ple-3', 2026);
    const f = saldos.find((s) => s.tipo === 'mudanza');
    expect(f?.diasUtilizados).toBe(2);
    expect(f?.diasDisponibles).toBe(1);
  });

  it('una licencia por evento nunca aparece con saldo', async () => {
    // L-02: aunque quede la fila vieja, no se consulta más.
    await guardarCupoLicencia('estudio', 5);
    const saldos = await getSaldosLicencia('ple-3', 2026);
    TIPOS_LICENCIA_POR_EVENTO.forEach((t) => {
      expect(saldos.find((s) => s.tipo === t)).toBeUndefined();
    });
  });

  /**
   * L-03 — Maternidad, nacimiento y excedencia no existían como tipo y se
   * cargaban como `especial`, que sí tiene cupo anual: una licencia de
   * noventa días chocaba contra un cupo de cinco.
   */
  it('una maternidad de 90 días entra aunque "especial" tenga cupo 5', async () => {
    await guardarCupoLicencia('especial', 5);
    const maternidad = await crearAusencia({
      empleadoId: 'ple-4',
      tipo: 'maternidad',
      fechaDesde: '2026-09-01',
      fechaHasta: '2026-11-29',
      aprobarAutomaticamente: true,
    });
    expect(maternidad.estado).toBe('aprobada');
    expect(maternidad.dias).toBe(90);
  });

  it('el mismo período cargado como "especial" sí choca con su cupo', async () => {
    // Deja fijado por qué hacía falta el tipo propio.
    await guardarCupoLicencia('especial', 5);
    await expect(
      crearAusencia({
        empleadoId: 'ple-5',
        tipo: 'especial',
        fechaDesde: '2026-09-01',
        fechaHasta: '2026-11-29',
        aprobarAutomaticamente: true,
      })
    ).rejects.toThrow(/licencia suficientes/);
  });

  it('los dos días por nacimiento de hijo no consumen cupo', async () => {
    const nacimiento = await crearAusencia({
      empleadoId: 'ple-4',
      tipo: 'nacimiento',
      fechaDesde: '2026-04-06',
      fechaHasta: '2026-04-07',
      aprobarAutomaticamente: true,
    });
    expect(nacimiento.estado).toBe('aprobada');
    expect(nacimiento.dias).toBe(2);
  });

  it('dos fallecimientos en el mismo año se aprueban los dos', async () => {
    const marzo = await crearAusencia({
      empleadoId: 'ple-5',
      tipo: 'fallecimiento',
      fechaDesde: '2026-03-02',
      fechaHasta: '2026-03-04',
      aprobarAutomaticamente: true,
    });
    expect(marzo.estado).toBe('aprobada');
    const noviembre = await crearAusencia({
      empleadoId: 'ple-5',
      tipo: 'fallecimiento',
      fechaDesde: '2026-11-02',
      fechaHasta: '2026-11-04',
      aprobarAutomaticamente: true,
    });
    expect(noviembre.estado).toBe('aprobada');
    expect(noviembre.dias).toBe(3);
  });

  it('cambio de configuración reduce el disponible', async () => {
    await guardarCupoLicencia('especial', 10);
    const empresa = await getEmpresa();
    // sanity: config empresa intacta (no confundir con vacaciones)
    expect(empresa.config).toBeTruthy();
    await guardarCupoLicencia('especial', 1);
    const saldos = await getSaldosLicencia('ple-4', 2026);
    const c = saldos.find((s) => s.tipo === 'especial');
    expect(c?.diasAnuales).toBe(1);
  });
});
