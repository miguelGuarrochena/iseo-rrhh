import {
  MARGEN_MINIMO,
  UMBRAL_IDENTIFICACION,
  UMBRAL_VERIFICACION,
  coincide,
  distancia,
  mejorCoincidencia,
} from '@/lib/facial/reconocimiento';

/** Descriptor de juguete: un vector cortito alcanza para la matemática. */
const d = (...n: number[]): number[] => n;

describe('distancia', () => {
  it('es 0 contra sí mismo', () => {
    expect(distancia(d(1, 2, 3), d(1, 2, 3))).toBe(0);
  });

  it('es la euclidiana', () => {
    expect(distancia(d(0, 0), d(3, 4))).toBe(5);
  });
});

describe('umbrales', () => {
  it('verificar es más tolerante que identificar', () => {
    // 1:1 ya sabe quién sos y solo confirma; 1:N elige entre muchos y
    // cada candidato es una chance más de equivocarse.
    expect(UMBRAL_VERIFICACION).toBeGreaterThan(UMBRAL_IDENTIFICACION);
  });

  it('coincide usa el umbral de verificación', () => {
    const casi = (UMBRAL_VERIFICACION + UMBRAL_IDENTIFICACION) / 2;
    expect(coincide(d(0), d(casi))).toBe(true);
    expect(coincide(d(0), d(UMBRAL_VERIFICACION + 0.01))).toBe(false);
  });
});

describe('mejorCoincidencia', () => {
  const candidato = (empleadoId: string, valor: number) => ({
    empleadoId,
    descriptor: d(valor),
  });

  it('elige al más parecido cuando se destaca', () => {
    const r = mejorCoincidencia(d(0), [
      candidato('lejos', 0.45),
      candidato('cerca', 0.1),
    ]);
    expect(r?.empleadoId).toBe('cerca');
    expect(r?.distancia).toBeCloseTo(0.1);
  });

  it('devuelve null si nadie entra en el umbral', () => {
    expect(mejorCoincidencia(d(0), [candidato('a', 0.9)])).toBeNull();
  });

  // Preferimos pedir otro intento antes que fichar al que no era.
  it('devuelve null si dos candidatos están demasiado parejos', () => {
    const r = mejorCoincidencia(d(0), [
      candidato('a', 0.2),
      candidato('b', 0.2 + MARGEN_MINIMO / 2),
    ]);
    expect(r).toBeNull();
  });

  it('acepta cuando la diferencia supera el margen', () => {
    const r = mejorCoincidencia(d(0), [
      candidato('a', 0.2),
      candidato('b', 0.2 + MARGEN_MINIMO * 2),
    ]);
    expect(r?.empleadoId).toBe('a');
  });

  it('ignora descriptores vacíos sin romperse', () => {
    const r = mejorCoincidencia(d(0), [
      { empleadoId: 'sin_enrolar', descriptor: [] },
      candidato('ok', 0.1),
    ]);
    expect(r?.empleadoId).toBe('ok');
  });

  it('sin candidatos devuelve null', () => {
    expect(mejorCoincidencia(d(0), [])).toBeNull();
  });

  it('la confianza baja a medida que crece la distancia', () => {
    const cerca = mejorCoincidencia(d(0), [candidato('a', 0.05)]);
    const lejos = mejorCoincidencia(d(0), [candidato('a', 0.4)]);
    expect(cerca!.confianza).toBeGreaterThan(lejos!.confianza);
  });
});
