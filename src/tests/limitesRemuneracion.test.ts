import {
  APORTES_TOTAL,
  baseImponibleAportes,
  calcularAportes,
  calcularLiquidacion,
  errorDeLimiteAdelanto,
  errorDeLimitesLiquidacion,
  LIMITE_ADELANTO_PCT,
  LIMITE_DESCUENTOS_PCT,
} from '@/lib/remuneraciones';

/**
 * L-06 — Los aportes se calculaban al 17% sobre el bruto completo, sin el
 * tope del art. 9 de la Ley 24.241. En un sueldo alto eso retiene de más
 * y el neto que la app le muestra al empleado queda por debajo del real.
 */
describe('L-06: tope de la base imponible', () => {
  it('sin tope configurado, se aporta sobre el bruto entero', () => {
    // Es el comportamiento que la app ya tenía: ninguna empresa cambia de
    // número por existir el campo, sólo por cargarlo.
    expect(baseImponibleAportes(6_000_000)).toBe(6_000_000);
    expect(calcularAportes(6_000_000)).toBe(Math.round(6_000_000 * 0.17));
  });

  it('con tope, la base se corta ahí', () => {
    expect(baseImponibleAportes(6_000_000, 3_000_000)).toBe(3_000_000);
    expect(calcularAportes(6_000_000, 3_000_000)).toBe(
      Math.round(3_000_000 * APORTES_TOTAL)
    );
  });

  it('un sueldo por debajo del tope no se toca', () => {
    expect(baseImponibleAportes(1_000_000, 3_000_000)).toBe(1_000_000);
    expect(calcularAportes(1_000_000, 3_000_000)).toBe(
      calcularAportes(1_000_000)
    );
  });

  it('el sueldo justo en el tope aporta sobre el tope', () => {
    expect(baseImponibleAportes(3_000_000, 3_000_000)).toBe(3_000_000);
  });

  it('un tope en cero o negativo se ignora, no anula el aporte', () => {
    expect(baseImponibleAportes(1_000_000, 0)).toBe(1_000_000);
    expect(baseImponibleAportes(1_000_000, -5)).toBe(1_000_000);
  });

  it('el neto sube cuando el tope entra en la cuenta', () => {
    const sinTope = calcularLiquidacion({ montoBruto: 6_000_000 });
    const conTope = calcularLiquidacion({
      montoBruto: 6_000_000,
      topeImponible: 3_000_000,
    });
    expect(conTope.aportes).toBeLessThan(sinTope.aportes);
    expect(conTope.neto).toBeGreaterThan(sinTope.neto);
    // Medio millón de diferencia sobre el ejemplo de la auditoría.
    expect(conTope.aportes).toBe(510_000);
    expect(sinTope.aportes).toBe(1_020_000);
  });

  it('en régimen simplificado no hay aportes ni tope que aplicar', () => {
    const { aportes, neto } = calcularLiquidacion({
      montoBruto: 6_000_000,
      regimen: 'simplificado',
      topeImponible: 3_000_000,
    });
    expect(aportes).toBe(0);
    expect(neto).toBe(6_000_000);
  });
});

/**
 * L-04 — No había ningún tope de descuentos ni de adelantos. El único
 * freno era la constraint de Postgres sobre el neto negativo, que
 * aparecía como "violates check constraint" y no decía nada.
 */
describe('L-04: límites de descuentos (art. 133 LCT)', () => {
  it('el tope es el 20% de la remuneración en dinero', () => {
    expect(LIMITE_DESCUENTOS_PCT).toBe(0.2);
  });

  it('sin descuentos no hay nada que avisar', () => {
    expect(
      errorDeLimitesLiquidacion({ montoBruto: 1_000_000, otrosDescuentos: 0 })
    ).toBeNull();
  });

  it('justo en el 20% pasa', () => {
    expect(
      errorDeLimitesLiquidacion({
        montoBruto: 1_000_000,
        otrosDescuentos: 200_000,
        aportes: 170_000,
      })
    ).toBeNull();
  });

  it('un peso por encima del 20% avisa y dice el porcentaje', () => {
    const error = errorDeLimitesLiquidacion({
      montoBruto: 1_000_000,
      otrosDescuentos: 250_000,
      aportes: 170_000,
    });
    expect(error).toMatch(/25%/);
    expect(error).toMatch(/art\. 133/);
  });

  it('el no remunerativo entra en la base del 20%', () => {
    // Con $1.000.000 + $500.000 la base es 1,5M y el tope 300.000.
    expect(
      errorDeLimitesLiquidacion({
        montoBruto: 1_000_000,
        noRemunerativo: 500_000,
        otrosDescuentos: 300_000,
        aportes: 170_000,
      })
    ).toBeNull();
  });

  it('el neto negativo se avisa antes que el porcentaje', () => {
    // El caso de la auditoría: adelanto de $900.000 + comedor $200.000.
    const error = errorDeLimitesLiquidacion({
      montoBruto: 1_000_000,
      otrosDescuentos: 1_100_000,
      aportes: 170_000,
    });
    expect(error).toMatch(/neto quedaría negativo/);
  });
});

describe('L-04: límite de adelantos (art. 130 LCT)', () => {
  it('el tope es el 50% de un período de pago', () => {
    expect(LIMITE_ADELANTO_PCT).toBe(0.5);
  });

  it('la mitad exacta pasa', () => {
    expect(errorDeLimiteAdelanto(500_000, 1_000_000)).toBeNull();
  });

  it('por encima de la mitad avisa con el porcentaje y el artículo', () => {
    const error = errorDeLimiteAdelanto(900_000, 1_000_000);
    expect(error).toMatch(/90%/);
    expect(error).toMatch(/art\. 130/);
  });

  it('un monto no positivo se rechaza', () => {
    expect(errorDeLimiteAdelanto(0, 1_000_000)).toMatch(/mayor a cero/);
    expect(errorDeLimiteAdelanto(-1, 1_000_000)).toMatch(/mayor a cero/);
  });

  it('sin sueldo conocido no se afirma nada', () => {
    // Inventar un tope sobre un sueldo que no tenemos sería peor que no
    // controlarlo: quien no tiene ninguna remuneración cargada pasa.
    expect(errorDeLimiteAdelanto(900_000)).toBeNull();
    expect(errorDeLimiteAdelanto(900_000, 0)).toBeNull();
  });
});
