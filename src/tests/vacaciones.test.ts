import {
  diasVacacionesGozadosEn,
  diasVacacionesPorAntiguedad,
} from '@/lib/vacaciones';
import type { Ausencia } from '@/types/rrhh';

describe('diasVacacionesPorAntiguedad (LCT art. 150)', () => {
  it('da 14 días con menos de 5 años de antigüedad', () => {
    expect(diasVacacionesPorAntiguedad('2023-02-15', 2026)).toBe(14);
  });

  it('da 21 días entre 5 y 10 años', () => {
    expect(diasVacacionesPorAntiguedad('2019-06-01', 2026)).toBe(21);
  });

  it('da 28 días entre 10 y 20 años', () => {
    expect(diasVacacionesPorAntiguedad('2012-04-02', 2026)).toBe(28);
  });

  it('da 35 días con más de 20 años', () => {
    expect(diasVacacionesPorAntiguedad('2004-09-13', 2026)).toBe(35);
  });

  it('con menos de 6 meses da 1 día cada 20 trabajados', () => {
    // Ingreso 01/09/2026 → ~121 días al 31/12 → 6 días
    expect(diasVacacionesPorAntiguedad('2026-09-01', 2026)).toBe(6);
  });

  it('da 0 si el ingreso es posterior al año consultado', () => {
    expect(diasVacacionesPorAntiguedad('2027-01-10', 2026)).toBe(0);
  });
});

describe('diasVacacionesGozadosEn', () => {
  const ausencia = (parcial: Partial<Ausencia>): Ausencia => ({
    id: 'a1',
    empleadoId: 'e1',
    tipo: 'vacaciones',
    fechaDesde: '2026-01-10',
    fechaHasta: '2026-01-20',
    dias: 10,
    estado: 'aprobada',
    adjuntos: [],
    creadaEn: '2026-01-01T00:00:00Z',
    ...parcial,
  });

  it('suma los días aprobados del año pedido', () => {
    const ausencias = [
      ausencia({ id: 'a1', fechaDesde: '2026-01-10', dias: 10 }),
      ausencia({ id: 'a2', fechaDesde: '2026-07-05', dias: 4 }),
    ];
    expect(diasVacacionesGozadosEn(ausencias, 2026)).toBe(14);
  });

  it('ignora las de otros años', () => {
    const ausencias = [
      ausencia({ id: 'a1', fechaDesde: '2026-01-10', dias: 10 }),
      ausencia({ id: 'a2', fechaDesde: '2027-01-10', dias: 7 }),
    ];
    expect(diasVacacionesGozadosEn(ausencias, 2026)).toBe(10);
    expect(diasVacacionesGozadosEn(ausencias, 2027)).toBe(7);
  });

  it('ignora las pendientes y rechazadas: sólo cuentan las aprobadas', () => {
    const ausencias = [
      ausencia({ id: 'a1', dias: 10, estado: 'aprobada' }),
      ausencia({ id: 'a2', dias: 5, estado: 'pendiente' }),
      ausencia({ id: 'a3', dias: 3, estado: 'rechazada' }),
    ];
    expect(diasVacacionesGozadosEn(ausencias, 2026)).toBe(10);
  });

  it('ignora otros tipos de ausencia', () => {
    const ausencias = [
      ausencia({ id: 'a1', tipo: 'vacaciones', dias: 10 }),
      ausencia({ id: 'a2', tipo: 'enfermedad', dias: 6 }),
    ];
    expect(diasVacacionesGozadosEn(ausencias, 2026)).toBe(10);
  });

  it('acepta el año como string, que es como llega desde la fecha de baja', () => {
    const ausencias = [ausencia({ dias: 10 })];
    expect(diasVacacionesGozadosEn(ausencias, '2026')).toBe(10);
  });

  it('sin ausencias da 0', () => {
    expect(diasVacacionesGozadosEn([], 2026)).toBe(0);
  });

  /**
   * El bug que motivó extraer esta función: una baja con fecha del año
   * anterior tomaba los días gozados del año en curso (donde todavía no
   * había ninguno) y la liquidación pagaba de nuevo vacaciones ya
   * tomadas. El año tiene que salir de la fecha de baja.
   */
  it('baja retroactiva: cuenta los días del año de la baja, no los del año en curso', () => {
    const ausencias = [
      ausencia({ id: 'a1', fechaDesde: '2026-03-01', dias: 12 }),
    ];
    const anioDeLaBaja = '2026-12-15'.slice(0, 4);
    const anioEnCurso = '2027';

    expect(diasVacacionesGozadosEn(ausencias, anioDeLaBaja)).toBe(12);
    expect(diasVacacionesGozadosEn(ausencias, anioEnCurso)).toBe(0);
  });
});
