import {
  aniosFeriadosAsegurar,
  fechaTrasladable,
  feriadosSugeridos,
} from '@/lib/feriados';

describe('fechaTrasladable (Ley 27.399)', () => {
  it('martes/miércoles → lunes anterior', () => {
    // 17 jun 2026 = miércoles → 15 jun
    expect(fechaTrasladable(2026, '06-17')).toBe('2026-06-15');
  });

  it('jueves/viernes → lunes siguiente', () => {
    // 20 nov 2026 = viernes → 23 nov
    expect(fechaTrasladable(2026, '11-20')).toBe('2026-11-23');
  });

  it('lunes queda en su fecha', () => {
    expect(fechaTrasladable(2026, '08-17')).toBe('2026-08-17');
    expect(fechaTrasladable(2026, '10-12')).toBe('2026-10-12');
  });
});

describe('feriadosSugeridos', () => {
  it('incluye San Martín, Diversidad Cultural y Soberanía en 2026', () => {
    const fechas = feriadosSugeridos(2026).map((f) => f.fecha);
    expect(fechas).toContain('2026-08-17');
    expect(fechas).toContain('2026-10-12');
    expect(fechas).toContain('2026-11-23');
  });
});

describe('aniosFeriadosAsegurar', () => {
  it('con año explícito, sólo ese', () => {
    expect(aniosFeriadosAsegurar(2027)).toEqual([2027]);
  });

  it('sin año, actual y siguiente', () => {
    const actual = new Date().getFullYear();
    expect(aniosFeriadosAsegurar()).toEqual([actual, actual + 1]);
  });
});
