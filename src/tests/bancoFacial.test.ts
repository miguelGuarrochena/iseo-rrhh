/**
 * Qué cuida este archivo: que la matemática de la calibración sea
 * correcta.
 *
 * Es la herramienta con la que se va a elegir el umbral de producción.
 * Si `curva` invirtiera FRR y FAR, o `umbralParaFar` devolviera el punto
 * equivocado, se elegiría un umbral con un riesgo distinto del que se
 * cree haber aceptado — y nadie se daría cuenta hasta que alguien fiche
 * por otro. Vale más un test acá que en casi cualquier otro lado del
 * módulo.
 */

import {
  cotaSuperiorFar,
  curva,
  distanciasContra,
  personasNecesarias,
  puntoDeCruce,
  resumir,
  separacion,
  umbralConservador,
  umbralParaFar,
} from '@/lib/facial/banco';

describe('resumir', () => {
  it('calcula percentiles, media y desvío', () => {
    const r = resumir([1, 2, 3, 4, 5]);
    expect(r.n).toBe(5);
    expect(r.minimo).toBe(1);
    expect(r.maximo).toBe(5);
    expect(r.p50).toBe(3);
    expect(r.media).toBe(3);
    expect(r.desvio).toBeCloseTo(Math.sqrt(2), 6);
  });

  it('interpola el percentil entre dos valores', () => {
    expect(resumir([0, 10]).p50).toBe(5);
  });

  it('no rompe sin datos', () => {
    expect(resumir([]).n).toBe(0);
  });
});

describe('curva', () => {
  const genuinas = [0.2, 0.25, 0.3, 0.35, 0.4];
  const impostoras = [0.7, 0.8, 0.9, 1.0, 1.1];

  const en = (u: number) => {
    const p = curva(genuinas, impostoras).find(
      (x) => Math.abs(x.umbral - u) < 1e-6
    );
    if (!p) throw new Error(`No hay punto en el umbral ${u}`);
    return p;
  };

  it('con un umbral muy bajo rechaza a todos los genuinos y a ningún impostor', () => {
    expect(en(0.1).frr).toBe(1);
    expect(en(0.1).far).toBe(0);
  });

  it('con un umbral muy alto acepta a todos, genuinos e impostores', () => {
    expect(en(1.2).frr).toBe(0);
    expect(en(1.2).far).toBe(1);
  });

  it('FRR cuenta genuinos por ENCIMA del umbral', () => {
    // Con 0,3: quedan afuera 0,35 y 0,4 → 2 de 5.
    expect(en(0.3).frr).toBeCloseTo(0.4, 6);
  });

  it('FAR cuenta impostores por DEBAJO o IGUAL al umbral', () => {
    // Con 0,8: entran 0,7 y 0,8 → 2 de 5.
    expect(en(0.8).far).toBeCloseTo(0.4, 6);
  });

  it('FRR no crece y FAR no decrece al subir el umbral', () => {
    const puntos = curva(genuinas, impostoras);
    for (let i = 1; i < puntos.length; i++) {
      expect(puntos[i].frr).toBeLessThanOrEqual(puntos[i - 1].frr);
      expect(puntos[i].far).toBeGreaterThanOrEqual(puntos[i - 1].far);
    }
  });
});

describe('umbralParaFar', () => {
  it('devuelve el umbral MÁS ALTO que respeta el FAR objetivo', () => {
    // Fijado el FAR, subir el umbral sólo puede bajar el FRR: el punto
    // más alto es el que menos rebota gente legítima sin pasarse del
    // riesgo aceptado. Devolver el más bajo "cumpliría" igual y sería
    // gratuitamente peor para las personas.
    const puntos = curva([0.2, 0.3], [0.6, 0.9]);
    const elegido = umbralParaFar(puntos, 0);
    expect(elegido).not.toBeNull();
    expect(elegido!.far).toBe(0);
    expect(elegido!.umbral).toBeCloseTo(0.59, 2);
  });

  it('devuelve null si ningún umbral cumple', () => {
    // Todas las impostoras por debajo de cero no existe, pero un
    // conjunto donde la impostora más chica es 0 fuerza FAR > objetivo
    // desde el primer punto.
    expect(umbralParaFar(curva([0.2], [0]), 0)).toBeNull();
  });
});

describe('separacion', () => {
  it('crece cuando las distribuciones se alejan', () => {
    // Es la métrica que **no depende del umbral**, y por eso la única
    // que sirve para comparar dos implementaciones. Mover el umbral
    // cambia el punto de operación; alinear bien y promediar varios
    // cuadros cambia la separación.
    const cerca = separacion([0.4, 0.45, 0.5], [0.55, 0.6, 0.65]);
    const lejos = separacion([0.2, 0.25, 0.3], [0.8, 0.85, 0.9]);
    expect(lejos).toBeGreaterThan(cerca);
  });

  it('es positiva cuando las genuinas están más cerca que las impostoras', () => {
    expect(separacion([0.2, 0.3], [0.8, 0.9])).toBeGreaterThan(0);
  });
});

describe('puntoDeCruce', () => {
  it('encuentra el umbral donde FRR y FAR se igualan', () => {
    const p = puntoDeCruce(curva([0.2, 0.3, 0.4], [0.6, 0.7, 0.8]));
    expect(p).not.toBeNull();
    expect(Math.abs(p!.far - p!.frr)).toBeLessThan(0.02);
  });
});

describe('cotaSuperiorFar', () => {
  it('aplica la regla de tres', () => {
    expect(cotaSuperiorFar(1125)).toBeCloseTo(3 / 1125, 10);
  });

  it('sin comparaciones no afirma nada: cota 1', () => {
    // Cero pares impostores no significa "FAR cero", significa que no se
    // midió. Devolver 0 acá sería el error más caro de todo el módulo.
    expect(cotaSuperiorFar(0)).toBe(1);
  });

  it('el protocolo de 10 personas NO alcanza para demostrar FAR ≤ 0,01 %', () => {
    // 10 personas × 5 condiciones = 1125 pares impostores → cota 0,27 %.
    // Es un orden de magnitud por encima del objetivo. Que ningún
    // impostor entre no demuestra el objetivo: la muestra no da para
    // verlo, y este test existe para que eso no se afirme por descuido.
    expect(cotaSuperiorFar(1125)).toBeGreaterThan(0.0001);
  });
});

describe('personasNecesarias', () => {
  it('calcula cuántas personas hacen falta para demostrar un FAR', () => {
    const p = personasNecesarias(0.0001, 5);
    expect(p).toBeGreaterThan(10);
    expect(p).toBeLessThan(200);
  });

  it('pide menos personas para un objetivo más laxo', () => {
    expect(personasNecesarias(0.01, 5)).toBeLessThan(
      personasNecesarias(0.0001, 5)
    );
  });

  it('un FAR de cero es indemostrable', () => {
    expect(personasNecesarias(0, 5)).toBe(Infinity);
  });
});

describe('umbralConservador', () => {
  const genuinas = [0.2, 0.25, 0.3, 0.35, 0.4];
  const impostoras = [0.7, 0.8, 0.9, 1.0];

  it('deja el umbral por debajo de la impostora más cercana, con margen', () => {
    // No se pega al mínimo observado: ese valor es una muestra, no el
    // mínimo verdadero. La próxima persona que se enrole puede parecerse
    // más a alguien que cualquiera de las medidas.
    const r = umbralConservador(genuinas, impostoras)!;
    expect(r.impostoraMinima).toBe(0.7);
    expect(r.umbral).toBeCloseTo(0.65, 6);
    expect(r.umbral).toBeLessThan(r.impostoraMinima);
  });

  it('no acepta ningún impostor de los medidos', () => {
    const r = umbralConservador(genuinas, impostoras)!;
    expect(impostoras.every((d) => d > r.umbral)).toBe(true);
  });

  it('cuando las distribuciones se solapan, queda por debajo del EER', () => {
    // El EER es el punto donde falso positivo y falso negativo cuestan lo
    // mismo. Acá no cuestan lo mismo: aceptar a otra persona es mucho
    // peor que pedir un segundo intento. Con solape, el EER admitiría
    // impostores y el conservador no.
    const g = [0.3, 0.4, 0.5, 0.55, 0.6];
    const i = [0.5, 0.6, 0.7, 0.9];
    const conservador = umbralConservador(g, i)!;
    const eer = puntoDeCruce(curva(g, i))!;
    expect(conservador.umbral).toBeLessThan(eer.umbral);
    // Y el EER sí dejaría entrar a alguno de los impostores medidos.
    expect(i.some((d) => d <= eer.umbral)).toBe(true);
    expect(i.some((d) => d <= conservador.umbral)).toBe(false);
  });

  it('con distribuciones bien separadas aprovecha todo el espacio libre', () => {
    // Sin solape hay un rango entero de umbrales con cero errores. Elegir
    // el más alto de ese rango es lo correcto: mismo FAR, menor FRR y más
    // tolerancia a que alguien se enrole con otra luz. Bajarlo "por las
    // dudas" sólo rebotaría gente legítima sin ganar seguridad.
    const r = umbralConservador(genuinas, impostoras)!;
    expect(r.umbral).toBeGreaterThan(Math.max(...genuinas));
    expect(r.frr).toBe(0);
  });

  it('informa el FRR que resulta, sin escondelo', () => {
    const r = umbralConservador([0.2, 0.9], [0.7, 0.8])!;
    // Con umbral 0,65 la genuina de 0,9 queda afuera: 1 de 2.
    expect(r.frr).toBeCloseTo(0.5, 6);
  });

  it('avisa cuando las distribuciones se solapan', () => {
    const r = umbralConservador([0.2, 0.75], [0.7, 0.8])!;
    expect(r.advertencias.some((a) => /solapan/.test(a))).toBe(true);
  });

  it('avisa cuando no hay suficientes pares para afirmar un FAR bajo', () => {
    const r = umbralConservador(genuinas, impostoras)!;
    expect(r.advertencias.some((a) => /pares impostores/.test(a))).toBe(true);
  });

  it('avisa cuando no queda umbral seguro', () => {
    const r = umbralConservador([0.1], [0.03])!;
    expect(r.umbral).toBe(0);
    expect(r.advertencias.some((a) => /no hay umbral seguro/.test(a))).toBe(
      true
    );
  });

  it('devuelve null sin datos', () => {
    expect(umbralConservador([], [])).toBeNull();
    expect(umbralConservador([0.2], [])).toBeNull();
  });
});

describe('distanciasContra', () => {
  it('mide la referencia contra cada muestra', () => {
    expect(
      distanciasContra(
        [0, 0],
        [
          [3, 4],
          [0, 0],
        ]
      )
    ).toEqual([5, 0]);
  });
});
