import { diasVacacionesPorAntiguedad } from '@/lib/vacaciones';

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
