import {
  aperturaDeCuadro,
  EAR_ABIERTO,
  EAR_CERRADO,
  evaluarLiveness,
  hayParpadeo,
  relacionAspectoOjo,
  type Punto,
} from '@/lib/facial/liveness';

/**
 * Ojo sintético: `alto` controla la apertura, `ancho` la separación
 * horizontal. Con alto=0 el ojo está cerrado.
 */
const ojo = (alto: number, ancho = 10): Punto[] => [
  { x: 0, y: 0 }, // p1 esquina interna
  { x: 3, y: -alto }, // p2 párpado superior
  { x: 7, y: -alto }, // p3 párpado superior
  { x: ancho, y: 0 }, // p4 esquina externa
  { x: 7, y: alto }, // p5 párpado inferior
  { x: 3, y: alto }, // p6 párpado inferior
];

describe('relacionAspectoOjo', () => {
  it('da ~0 con el ojo cerrado', () => {
    expect(relacionAspectoOjo(ojo(0))).toBe(0);
  });

  it('crece cuanto más abierto está el ojo', () => {
    expect(relacionAspectoOjo(ojo(3))).toBeGreaterThan(
      relacionAspectoOjo(ojo(1))
    );
  });

  it('no depende del tamaño: mismo ojo más cerca da lo mismo', () => {
    const cerca = relacionAspectoOjo(ojo(3, 10));
    const lejos = relacionAspectoOjo(ojo(6, 20));
    expect(cerca).toBeCloseTo(lejos, 5);
  });

  it('no explota con menos puntos de los esperados', () => {
    expect(relacionAspectoOjo([{ x: 0, y: 0 }])).toBe(0);
  });

  it('no divide por cero si el ojo no tiene ancho', () => {
    expect(relacionAspectoOjo(ojo(3, 0))).toBe(0);
  });
});

describe('aperturaDeCuadro', () => {
  it('promedia los dos ojos', () => {
    const izq = relacionAspectoOjo(ojo(3));
    const der = relacionAspectoOjo(ojo(1));
    expect(aperturaDeCuadro(ojo(3), ojo(1))).toBeCloseTo((izq + der) / 2, 6);
  });
});

describe('hayParpadeo', () => {
  const abierto = EAR_ABIERTO + 0.05;
  const cerrado = EAR_CERRADO - 0.05;

  it('reconoce el ciclo abierto → cerrado → abierto', () => {
    expect(hayParpadeo([abierto, abierto, cerrado, abierto])).toBe(true);
  });

  /** Una foto impresa: los ojos no cambian nunca. */
  it('una apertura constante NO es un parpadeo', () => {
    expect(hayParpadeo([abierto, abierto, abierto, abierto])).toBe(false);
  });

  /** Una foto de alguien con los ojos cerrados tampoco alcanza. */
  it('los ojos siempre cerrados NO son un parpadeo', () => {
    expect(hayParpadeo([cerrado, cerrado, cerrado])).toBe(false);
  });

  it('cerrar y no volver a abrir no cuenta: falta el ciclo completo', () => {
    expect(hayParpadeo([abierto, abierto, cerrado])).toBe(false);
  });

  it('valores oscilando en la banda intermedia no cuentan como parpadeo', () => {
    const medio = (EAR_CERRADO + EAR_ABIERTO) / 2;
    expect(hayParpadeo([abierto, medio, abierto, medio, abierto])).toBe(false);
  });
});

describe('evaluarLiveness', () => {
  const abierto = EAR_ABIERTO + 0.05;
  const cerrado = EAR_CERRADO - 0.05;

  it('con pocos cuadros no da por viva a la persona', () => {
    const r = evaluarLiveness([abierto, cerrado, abierto]);
    expect(r.vivo).toBe(false);
    if (!r.vivo) expect(r.motivo).toBe('pocos_cuadros');
  });

  it('con cuadros suficientes y parpadeo, da vivo', () => {
    const r = evaluarLiveness([
      abierto,
      abierto,
      abierto,
      cerrado,
      abierto,
      abierto,
    ]);
    expect(r.vivo).toBe(true);
  });

  it('con cuadros suficientes y sin parpadeo, distingue el motivo', () => {
    const r = evaluarLiveness(Array(10).fill(abierto));
    expect(r.vivo).toBe(false);
    if (!r.vivo) expect(r.motivo).toBe('sin_parpadeo');
  });
});
