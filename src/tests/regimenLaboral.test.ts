import {
  APORTES_TOTAL,
  calcularLiquidacion,
  costoLaboral,
  tieneAportesDeLey,
} from '@/lib/remuneraciones';

describe('tieneAportesDeLey', () => {
  it('relación de dependencia retiene aportes', () => {
    expect(tieneAportesDeLey('relacion_dependencia')).toBe(true);
  });

  it('simplificado no retiene nada', () => {
    expect(tieneAportesDeLey('simplificado')).toBe(false);
  });

  it('sin régimen definido se asume relación de dependencia', () => {
    // Las empresas que ya existían no tienen el campo cargado: tienen
    // que seguir liquidando exactamente igual que antes.
    expect(tieneAportesDeLey(undefined)).toBe(true);
  });
});

describe('calcularLiquidacion', () => {
  it('en relación de dependencia descuenta el 17% de aportes', () => {
    const { aportes, neto } = calcularLiquidacion({
      montoBruto: 1000000,
      regimen: 'relacion_dependencia',
    });
    expect(aportes).toBe(Math.round(1000000 * APORTES_TOTAL));
    expect(neto).toBe(1000000 - aportes);
  });

  it('en simplificado el neto es lo que se paga', () => {
    const { aportes, neto } = calcularLiquidacion({
      montoBruto: 1000000,
      regimen: 'simplificado',
    });
    expect(aportes).toBe(0);
    expect(neto).toBe(1000000);
  });

  it('los descuentos del período se aplican en los dos regímenes', () => {
    const simplificado = calcularLiquidacion({
      montoBruto: 100000,
      otrosDescuentos: 15000,
      regimen: 'simplificado',
    });
    expect(simplificado.neto).toBe(85000);
  });

  it('el no remunerativo no paga aportes', () => {
    const { aportes, neto } = calcularLiquidacion({
      montoBruto: 100000,
      noRemunerativo: 50000,
      regimen: 'relacion_dependencia',
    });
    expect(aportes).toBe(Math.round(100000 * APORTES_TOTAL));
    expect(neto).toBe(150000 - aportes);
  });
});

describe('costoLaboral', () => {
  it('en relación de dependencia suma las cargas patronales', () => {
    const { cargas, total } = costoLaboral({
      montoBruto: 1000000,
      regimen: 'relacion_dependencia',
      cargasPatronalesPct: 0.27,
    });
    expect(cargas).toBe(270000);
    expect(total).toBe(1270000);
  });

  it('en simplificado no hay cargas patronales', () => {
    const { cargas, total } = costoLaboral({
      montoBruto: 100,
      regimen: 'simplificado',
    });
    expect(cargas).toBe(0);
    expect(total).toBe(100);
  });

  it('el monotributo a cargo de la empresa suma al costo', () => {
    // El ejemplo textual del cliente: sueldo 100, monotributo 23.
    const { monotributo, total } = costoLaboral({
      montoBruto: 100,
      regimen: 'simplificado',
      monotributoAcargoEmpresa: 23,
    });
    expect(monotributo).toBe(23);
    expect(total).toBe(123);
  });

  it('sin monotributo cargado no suma nada', () => {
    expect(
      costoLaboral({ montoBruto: 100, regimen: 'simplificado' }).monotributo
    ).toBe(0);
  });
});
