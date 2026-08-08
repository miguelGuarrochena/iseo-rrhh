import {
  armarLiquidacionFinal,
  diasVacacionesProporcionales,
  fraccionSemestreHastaBaja,
  valorDiaVacaciones,
} from '@/lib/liquidacionFinal';

describe('valorDiaVacaciones', () => {
  it('divide por 25, no por 30 (art. 155 inc. a)', () => {
    expect(valorDiaVacaciones(1000000)).toBe(40000);
  });

  it('no explota con bruto en cero', () => {
    expect(valorDiaVacaciones(0)).toBe(0);
  });
});

describe('diasVacacionesProporcionales', () => {
  it('año completo con antigüedad de 2 años: 14 días menos los gozados', () => {
    // Ingresó en 2023, se va el 31/12/2026 sin haberse tomado nada.
    const dias = diasVacacionesProporcionales('2023-03-01', '2026-12-31', 0);
    expect(dias).toBeCloseTo(14, 0);
  });

  it('descuenta los días ya tomados', () => {
    const dias = diasVacacionesProporcionales('2023-03-01', '2026-12-31', 10);
    expect(dias).toBeCloseTo(4, 0);
  });

  it('a mitad de año paga aproximadamente la mitad', () => {
    const dias = diasVacacionesProporcionales('2023-03-01', '2026-06-30', 0);
    expect(dias).toBeGreaterThan(6);
    expect(dias).toBeLessThan(8);
  });

  it('si ingresó ese mismo año cuenta desde el ingreso, no desde enero', () => {
    const completo = diasVacacionesProporcionales(
      '2020-01-01',
      '2026-12-31',
      0
    );
    const tardio = diasVacacionesProporcionales('2026-10-01', '2026-12-31', 0);
    expect(tardio).toBeLessThan(completo);
  });

  it('nunca devuelve negativo aunque se haya tomado de más', () => {
    expect(diasVacacionesProporcionales('2023-03-01', '2026-06-30', 30)).toBe(
      0
    );
  });
});

describe('fraccionSemestreHastaBaja', () => {
  it('baja al cierre del primer semestre: semestre completo', () => {
    expect(fraccionSemestreHastaBaja('2020-01-01', '2026-06-30')).toBeCloseTo(
      1,
      2
    );
  });

  it('baja a mitad del segundo semestre: alrededor de la mitad', () => {
    const f = fraccionSemestreHastaBaja('2020-01-01', '2026-09-30');
    expect(f).toBeGreaterThan(0.4);
    expect(f).toBeLessThan(0.6);
  });

  it('si ingresó dentro del semestre, cuenta desde el ingreso', () => {
    const f = fraccionSemestreHastaBaja('2026-05-01', '2026-06-30');
    expect(f).toBeGreaterThan(0.2);
    expect(f).toBeLessThan(0.45);
  });
});

describe('armarLiquidacionFinal', () => {
  const base = {
    fechaIngreso: '2023-03-01',
    fechaBaja: '2026-06-30',
    brutoMensual: 1000000,
    mejorBrutoSemestre: 1000000,
    diasVacacionesGozados: 0,
  };

  it('incluye vacaciones, su SAC y el SAC proporcional', () => {
    const r = armarLiquidacionFinal(base);
    const nombres = r.conceptos.map((c) => c.concepto);
    expect(nombres).toContain('Vacaciones proporcionales no gozadas');
    expect(nombres).toContain('SAC sobre vacaciones');
    expect(nombres).toContain('SAC proporcional del semestre');
  });

  it('el total es la suma de los conceptos', () => {
    const r = armarLiquidacionFinal(base);
    expect(r.total).toBe(r.conceptos.reduce((a, c) => a + c.monto, 0));
  });

  it('no incluye preaviso ni indemnización por antigüedad', () => {
    const texto = armarLiquidacionFinal(base)
      .conceptos.map((c) => c.concepto.toLowerCase())
      .join(' ');
    expect(texto).not.toContain('preaviso');
    expect(texto).not.toContain('indemnización');
  });

  it('sin sueldo cargado no inventa montos', () => {
    const r = armarLiquidacionFinal({
      ...base,
      brutoMensual: 0,
      mejorBrutoSemestre: 0,
    });
    expect(r.total).toBe(0);
    expect(r.conceptos).toHaveLength(0);
  });
});

describe('armarLiquidacionFinal según la unidad de vacaciones', () => {
  const base = {
    fechaIngreso: '2020-01-01',
    fechaBaja: '2026-12-31',
    brutoMensual: 1000000,
    mejorBrutoSemestre: 1000000,
    diasVacacionesGozados: 0,
  };
  const vacacionesDe = (b: ReturnType<typeof armarLiquidacionFinal>) =>
    b.conceptos.find((c) => c.concepto.startsWith('Vacaciones'))?.monto ?? 0;

  it('por defecto liquida en días corridos (LCT)', () => {
    const sinUnidad = vacacionesDe(armarLiquidacionFinal(base));
    const corridos = vacacionesDe(
      armarLiquidacionFinal({ ...base, unidadVacaciones: 'corridos' })
    );
    expect(sinUnidad).toBe(corridos);
    expect(sinUnidad).toBeGreaterThan(0);
  });

  /**
   * El bug: con la empresa contando hábiles, el cupo viene en hábiles y
   * multiplicarlo por bruto÷25 (que es por día corrido) pagaba de menos
   * por los mismos días de ausencia.
   */
  it('en hábiles paga más que en corridos, por la misma ausencia', () => {
    const corridos = vacacionesDe(
      armarLiquidacionFinal({ ...base, unidadVacaciones: 'corridos' })
    );
    const habiles = vacacionesDe(
      armarLiquidacionFinal({ ...base, unidadVacaciones: 'habiles' })
    );
    expect(habiles).toBeGreaterThan(corridos);
    // 7/5 más, que es la relación entre una semana y sus días hábiles.
    expect(habiles / corridos).toBeCloseTo(1.4, 1);
  });

  it('el detalle aclara la conversión para que el número sea auditable', () => {
    const b = armarLiquidacionFinal({ ...base, unidadVacaciones: 'habiles' });
    const detalle =
      b.conceptos.find((c) => c.concepto.startsWith('Vacaciones'))?.detalle ??
      '';
    expect(detalle).toContain('hábiles');
    expect(detalle).toContain('corridos');
  });
});
