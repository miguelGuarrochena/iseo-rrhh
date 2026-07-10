import { parsearFechaTipeada } from '@/components/app/ui/CampoFecha';

describe('parsearFechaTipeada', () => {
  it('acepta dd/mm/aaaa y normaliza a ISO', () => {
    expect(parsearFechaTipeada('02/07/2026')).toBe('2026-07-02');
    expect(parsearFechaTipeada('2/7/2026')).toBe('2026-07-02');
  });

  it('acepta guiones, puntos y año corto', () => {
    expect(parsearFechaTipeada('02-07-2026')).toBe('2026-07-02');
    expect(parsearFechaTipeada('02.07.26')).toBe('2026-07-02');
  });

  it('rechaza fechas inexistentes o incompletas', () => {
    expect(parsearFechaTipeada('31/02/2026')).toBeNull();
    expect(parsearFechaTipeada('12/13/2026')).toBeNull();
    expect(parsearFechaTipeada('12/07')).toBeNull();
    expect(parsearFechaTipeada('hola')).toBeNull();
  });

  it('respeta los años bisiestos', () => {
    expect(parsearFechaTipeada('29/02/2028')).toBe('2028-02-29');
    expect(parsearFechaTipeada('29/02/2026')).toBeNull();
  });
});
