import {
  APORTES_TOTAL,
  baseImponibleAportes,
  calcularLiquidacion,
  errorDeConfiguracionDeTope,
  errorDeTopeImponible,
} from '@/lib/remuneraciones';

/**
 * El cliente decidió: el tope imponible de aportes lo carga cada empresa
 * y es **obligatorio**.
 *
 * Lo que estos casos protegen es que un dato faltante no tenga un
 * resultado por defecto que parezca un cálculo. Antes, sin tope, los
 * aportes salían sobre el bruto completo: el neto quedaba grabado más
 * bajo que el que la persona iba a cobrar, y el error crecía justo en
 * los sueldos altos, que son los únicos donde el tope importa.
 */

describe('errorDeConfiguracionDeTope', () => {
  it('un importe positivo está bien', () => {
    expect(errorDeConfiguracionDeTope(1_200_000)).toBeNull();
    expect(errorDeConfiguracionDeTope(0.5)).toBeNull();
  });

  it('vacío no es un tope', () => {
    expect(errorDeConfiguracionDeTope(undefined)).toMatch(/cargá/i);
    expect(errorDeConfiguracionDeTope(null)).toMatch(/cargá/i);
  });

  it('cero y negativo no son topes', () => {
    expect(errorDeConfiguracionDeTope(0)).toMatch(/mayor a cero/i);
    expect(errorDeConfiguracionDeTope(-1)).toMatch(/mayor a cero/i);
  });

  it('lo que no es número se rechaza', () => {
    expect(errorDeConfiguracionDeTope(NaN)).toBeTruthy();
    expect(errorDeConfiguracionDeTope(Infinity)).toMatch(/número/i);
  });

  /**
   * A propósito no hay rango "razonable": el tope de ANSES sube con la
   * inflación y cualquier techo que pongamos hoy traba una carga
   * correcta el año que viene.
   */
  it('no inventa un rango legal', () => {
    expect(errorDeConfiguracionDeTope(1)).toBeNull();
    expect(errorDeConfiguracionDeTope(999_999_999)).toBeNull();
  });
});

describe('errorDeTopeImponible — cuándo frena una liquidación', () => {
  it('en relación de dependencia, sin tope no se liquida', () => {
    expect(errorDeTopeImponible(undefined, 'relacion_dependencia')).toMatch(
      /tope imponible/i
    );
    expect(errorDeTopeImponible(0, 'relacion_dependencia')).toBeTruthy();
  });

  it('el mensaje dice dónde se arregla', () => {
    expect(errorDeTopeImponible(undefined, 'relacion_dependencia')).toMatch(
      /configuración/i
    );
  });

  it('con tope cargado, adelante', () => {
    expect(errorDeTopeImponible(1_200_000, 'relacion_dependencia')).toBeNull();
  });

  it('sin régimen explícito se asume relación de dependencia', () => {
    // Es el default del modelo; asumir lo contrario dejaría pasar
    // liquidaciones sin tope en cualquier empresa que no lo tenga seteado.
    expect(errorDeTopeImponible(undefined)).toBeTruthy();
    expect(errorDeTopeImponible(1_200_000)).toBeNull();
  });

  /**
   * En régimen simplificado no hay jubilación, PAMI ni obra social que
   * retener: el tope no entra en ninguna cuenta. Frenar ahí sería
   * bloquear por un dato que no se usa.
   */
  it('en régimen simplificado no se pide', () => {
    expect(errorDeTopeImponible(undefined, 'simplificado')).toBeNull();
    expect(errorDeTopeImponible(0, 'simplificado')).toBeNull();
  });
});

describe('el tope aplicado al cálculo', () => {
  const TOPE = 1_200_000;

  it('por encima del tope, los aportes salen sobre el tope', () => {
    const bruto = 2_000_000;
    const { aportes } = calcularLiquidacion({
      montoBruto: bruto,
      topeImponible: TOPE,
    });
    expect(aportes).toBe(Math.round(TOPE * APORTES_TOTAL));
    expect(baseImponibleAportes(bruto, TOPE)).toBe(TOPE);
  });

  it('por debajo del tope, el tope no cambia nada', () => {
    const chico = 500_000;
    expect(
      calcularLiquidacion({ montoBruto: chico, topeImponible: TOPE })
    ).toEqual(
      calcularLiquidacion({ montoBruto: chico, topeImponible: 9_000_000 })
    );
  });

  it('en régimen simplificado no hay aportes, con tope o sin él', () => {
    const r = calcularLiquidacion({
      montoBruto: 2_000_000,
      regimen: 'simplificado',
      topeImponible: TOPE,
    });
    expect(r.aportes).toBe(0);
  });
});

describe('cambiar el tope no toca lo ya liquidado', () => {
  /**
   * `remuneraciones` guarda `aportes` y `monto_neto` calculados al
   * grabar; nada los recalcula después. Por eso el tope puede vivir en la
   * configuración sin necesitar historia: el resultado de cada período ya
   * quedó congelado en su fila.
   *
   * Lo que se fija acá es esa propiedad —que el cálculo dependa sólo de
   * lo que se le pasa— porque es de lo que depende que la afirmación
   * anterior sea cierta.
   */
  it('el mismo período con el mismo tope da siempre lo mismo', () => {
    const entrada = {
      montoBruto: 2_000_000,
      noRemunerativo: 50_000,
      otrosDescuentos: 10_000,
      topeImponible: 1_200_000,
    };
    const julioCuandoSeLiquido = calcularLiquidacion(entrada);
    // La empresa sube el tope en septiembre; julio se vuelve a calcular
    // con el valor con el que se guardó.
    const julioMirandoloDespues = calcularLiquidacion(entrada);
    expect(julioMirandoloDespues).toEqual(julioCuandoSeLiquido);
  });

  it('un tope nuevo sólo cambia el período que se calcula con él', () => {
    const base = { montoBruto: 2_000_000 };
    const julio = calcularLiquidacion({ ...base, topeImponible: 1_200_000 });
    const octubre = calcularLiquidacion({ ...base, topeImponible: 1_500_000 });
    expect(octubre.aportes).toBeGreaterThan(julio.aportes);
    // Y julio sigue siendo julio.
    expect(calcularLiquidacion({ ...base, topeImponible: 1_200_000 })).toEqual(
      julio
    );
  });
});
