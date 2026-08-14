/**
 * Qué cuida este archivo: que la plantilla se arme como corresponde.
 *
 * Una plantilla es el promedio de varios descriptores de la misma
 * persona. El ruido de cada cuadro —la luz, un gesto, un
 * micro-movimiento— es aproximadamente independiente entre cuadros, así
 * que promediar lo cancela parcialmente y conserva lo estable, que es la
 * identidad. Eso acerca los descriptores de la misma persona **más** de
 * lo que acerca los de personas distintas: separa mejor las dos
 * distribuciones, que es lo único que de verdad mejora un sistema
 * biométrico.
 *
 * El sistema anterior mandaba un descriptor de un cuadro suelto, elegido
 * por el azar de cuándo terminaba la prueba de vida.
 */

import {
  dispersion,
  distancia,
  DISPERSION_MAXIMA_ENROLADO,
  mejores,
  promediar,
  UMBRAL_IDENTIFICACION,
  UMBRAL_VERIFICACION,
} from '@/lib/facial/plantilla';

describe('distancia', () => {
  it('da cero entre un vector y sí mismo', () => {
    expect(distancia([1, 2, 3], [1, 2, 3])).toBe(0);
  });

  it('es la euclidiana', () => {
    expect(distancia([0, 0], [3, 4])).toBe(5);
  });
});

describe('promediar', () => {
  it('promedia componente a componente', () => {
    expect(
      promediar([
        [0, 10],
        [2, 20],
      ])
    ).toEqual([1, 15]);
  });

  it('no normaliza la escala', () => {
    // Normalizar parecería más prolijo pero cambiaría la escala de todas
    // las distancias, y dejaría sin sentido tanto los umbrales guardados
    // en la base como los descriptores ya enrolados.
    const p = promediar([[3, 4]]);
    expect(Math.hypot(p[0], p[1])).toBeCloseTo(5, 10);
  });

  it('lanza si los descriptores tienen largos distintos', () => {
    // Promediar un descriptor de otra dimensión produciría una plantilla
    // que se compara "bien" contra cualquier cosa. Es preferible el
    // error ruidoso al dato silenciosamente corrupto.
    expect(() =>
      promediar([
        [1, 2],
        [1, 2, 3],
      ])
    ).toThrow(/distinto largo/);
  });

  it('devuelve vacío sin muestras', () => {
    expect(promediar([])).toEqual([]);
  });

  it('acerca la plantilla al centro de las muestras ruidosas', () => {
    // El punto de todo el mecanismo: el promedio de muestras ruidosas
    // está más cerca del valor real que la muestra ruidosa típica.
    const real = [1, 1, 1, 1];
    const ruidosas = [
      [1.3, 0.7, 1.2, 0.8],
      [0.7, 1.3, 0.8, 1.2],
      [1.2, 1.2, 0.8, 0.8],
      [0.8, 0.8, 1.2, 1.2],
    ];
    const plantilla = promediar(ruidosas);
    const errorPlantilla = distancia(plantilla, real);
    const errorTipico =
      ruidosas.reduce((a, m) => a + distancia(m, real), 0) / ruidosas.length;
    expect(errorPlantilla).toBeLessThan(errorTipico);
  });
});

describe('dispersion', () => {
  it('es cero con una sola muestra', () => {
    expect(dispersion([[1, 2, 3]])).toBe(0);
  });

  it('devuelve la distancia máxima entre pares, no la media', () => {
    // Lo que hay que atajar es que **alguna** muestra sea de otra
    // persona. Un promedio la disimularía entre las buenas.
    expect(
      dispersion([
        [0, 0],
        [1, 0],
        [10, 0],
      ])
    ).toBe(10);
  });

  it('el tope de enrolamiento es más exigente que el umbral de reconocimiento', () => {
    // Si las muestras de referencia pudieran estar tan dispersas como lo
    // que después se acepta como "es la misma persona", la plantilla no
    // aportaría nada.
    expect(DISPERSION_MAXIMA_ENROLADO).toBeLessThan(UMBRAL_VERIFICACION);
  });
});

describe('mejores', () => {
  it('se queda con las de mayor puntaje', () => {
    const elegidas = mejores(
      [
        { valor: 'malo', puntaje: 0.1 },
        { valor: 'excelente', puntaje: 0.9 },
        { valor: 'bueno', puntaje: 0.6 },
      ],
      2
    );
    expect(elegidas).toEqual(['excelente', 'bueno']);
  });

  it('no rompe si se piden más de las que hay', () => {
    expect(mejores([{ valor: 'a', puntaje: 1 }], 5)).toEqual(['a']);
  });

  it('no muta el arreglo original', () => {
    const muestras = [
      { valor: 'a', puntaje: 0.1 },
      { valor: 'b', puntaje: 0.9 },
    ];
    mejores(muestras, 1);
    expect(muestras[0].valor).toBe('a');
  });
});

describe('umbrales', () => {
  it('identificar (1:N) es más exigente que verificar (1:1)', () => {
    // En 1:N hay que elegir entre N candidatos y cada uno es una chance
    // más de equivocarse; en 1:1 la sesión ya dice quién es y la cara
    // sólo confirma.
    expect(UMBRAL_IDENTIFICACION).toBeLessThan(UMBRAL_VERIFICACION);
  });
});
