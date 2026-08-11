import {
  cupoAnualDe,
  diasLicenciaAprobadosEnAnio,
  puedeAprobarLicenciaContraCupo,
  saldoLicenciaDisponibleDe,
} from '@/lib/seguridad/cuposLicencia';
import {
  crearAusencia,
  getEmpresa,
  getSaldosLicencia,
  guardarCupoLicencia,
  resolverAusencia,
} from '@/lib/services/rrhh';
import type { Ausencia, CupoLicencia } from '@/types/rrhh';

const aus = (
  partial: Partial<Ausencia> &
    Pick<Ausencia, 'tipo' | 'estado' | 'fechaDesde' | 'dias'>
): Pick<Ausencia, 'tipo' | 'estado' | 'fechaDesde' | 'dias'> => partial;

describe('cuposLicencia (espejo getSaldosLicencia)', () => {
  const cupos: CupoLicencia[] = [
    { id: '1', empresaId: 'e', tipo: 'mudanza', diasAnuales: 5 },
    { id: '2', empresaId: 'e', tipo: 'casamiento', diasAnuales: 0 },
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
        dias: 2,
      }),
      aus({
        tipo: 'mudanza',
        estado: 'pendiente',
        fechaDesde: '2026-02-10',
        dias: 4,
      }),
      aus({
        tipo: 'mudanza',
        estado: 'rechazada',
        fechaDesde: '2026-03-10',
        dias: 3,
      }),
      aus({
        tipo: 'mudanza',
        estado: 'aprobada',
        fechaDesde: '2025-12-01',
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
        dias: 4,
      }),
    ];
    expect(
      puedeAprobarLicenciaContraCupo(cupos, usadas, 'mudanza', 2026, 1)
    ).toBe(true);
    expect(
      puedeAprobarLicenciaContraCupo(cupos, usadas, 'mudanza', 2026, 2)
    ).toBe(false);
    expect(
      puedeAprobarLicenciaContraCupo(cupos, [], 'casamiento', 2026, 1)
    ).toBe(false); // cupo 0
  });

  it('múltiples empleados son independientes', () => {
    // El helper es por lista de ausencias de UN empleado; cada legajo
    // trae su propia lista → cupos iguales, consumos separados.
    const empA = [
      aus({
        tipo: 'mudanza',
        estado: 'aprobada',
        fechaDesde: '2026-01-01',
        dias: 5,
      }),
    ];
    const empB: typeof empA = [];
    expect(saldoLicenciaDisponibleDe(cupos, empA, 'mudanza', 2026)).toBe(0);
    expect(saldoLicenciaDisponibleDe(cupos, empB, 'mudanza', 2026)).toBe(5);
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
    await guardarCupoLicencia('fallecimiento', 3);
    await crearAusencia({
      empleadoId: 'ple-3',
      tipo: 'fallecimiento',
      fechaDesde: '2026-07-01',
      fechaHasta: '2026-07-02',
      aprobarAutomaticamente: true,
    });
    await crearAusencia({
      empleadoId: 'ple-3',
      tipo: 'fallecimiento',
      fechaDesde: '2026-07-10',
      fechaHasta: '2026-07-12',
    });
    const saldos = await getSaldosLicencia('ple-3', 2026);
    const f = saldos.find((s) => s.tipo === 'fallecimiento');
    expect(f?.diasUtilizados).toBe(2);
    expect(f?.diasDisponibles).toBe(1);
  });

  it('cambio de configuración reduce el disponible', async () => {
    await guardarCupoLicencia('casamiento', 10);
    const empresa = await getEmpresa();
    // sanity: config empresa intacta (no confundir con vacaciones)
    expect(empresa.config).toBeTruthy();
    await guardarCupoLicencia('casamiento', 1);
    const saldos = await getSaldosLicencia('ple-4', 2026);
    const c = saldos.find((s) => s.tipo === 'casamiento');
    expect(c?.diasAnuales).toBe(1);
  });
});
