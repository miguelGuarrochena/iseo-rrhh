import {
  bonoDevengado,
  objetivoAlcanzado,
  porcentajeCumplimiento,
} from '@/lib/objetivosVenta';

describe('objetivos de ventas', () => {
  it('el porcentaje es 0 si no hay objetivo', () => {
    expect(porcentajeCumplimiento(0, 0)).toBe(0);
    expect(porcentajeCumplimiento(0, 10)).toBe(100);
  });

  it('redondea a un decimal y no mezcla meses', () => {
    expect(porcentajeCumplimiento(1000, 250)).toBe(25);
    expect(porcentajeCumplimiento(1000, 333)).toBe(33.3);
  });

  it('se alcanza al llegar o superar el objetivo', () => {
    expect(objetivoAlcanzado(100, 99.9)).toBe(false);
    expect(objetivoAlcanzado(100, 100)).toBe(true);
    expect(objetivoAlcanzado(100, 150)).toBe(true);
    expect(objetivoAlcanzado(0, 10)).toBe(false);
  });

  it('el bono sólo se devenga si se alcanzó el objetivo', () => {
    expect(bonoDevengado(100, 80, 50000)).toBe(0);
    expect(bonoDevengado(100, 100, 50000)).toBe(50000);
    expect(bonoDevengado(100, 100, 0)).toBe(0);
    expect(bonoDevengado(100, 100, undefined)).toBe(0);
  });
});
