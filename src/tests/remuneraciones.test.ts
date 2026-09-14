import {
  analizarSalario,
  periodosDelSemestre,
  resumirMasa,
  resumirMasaDelPeriodo,
  CARGAS_PATRONALES,
  yaTieneSacDelSemestre,
} from '@/lib/remuneraciones';
import { Remuneracion } from '@/types/rrhh';

const rem = (
  empleadoId: string,
  periodo: string,
  montoBruto: number,
  tipo: Remuneracion['tipo'] = 'mensual'
): Remuneracion => ({
  id: `${empleadoId}-${periodo}-${tipo}`,
  empleadoId,
  periodo,
  tipo,
  montoBruto,
  montoNeto: Math.round(montoBruto * 0.83),
});

describe('analizarSalario', () => {
  const rems = [
    rem('e1', '2026-04', 950000),
    rem('e1', '2026-05', 1010000),
    rem('e1', '2026-06', 1075000),
  ];
  const analisis = analizarSalario(rems, '2026-06-15');

  it('ordena y toma la última', () => {
    expect(analisis.ultima?.periodo).toBe('2026-06');
  });

  it('calcula variación % contra el mes anterior', () => {
    // (1075000 - 1010000) / 1010000 * 100 ≈ 6.44
    expect(analisis.variacionPct).toBeCloseTo(6.44, 1);
  });

  it('aguinaldo = mejor bruto del semestre / 2', () => {
    expect(analisis.mejorSemestreBruto).toBe(1075000);
    expect(analisis.aguinaldoEstimado).toBe(537500);
  });

  it('detecta los aumentos (más recientes primero)', () => {
    expect(analisis.aumentos).toHaveLength(2);
    expect(analisis.aumentos[0].periodo).toBe('2026-06');
  });

  it('no separa semestres distintos en el aguinaldo', () => {
    const conOtroSemestre = analizarSalario(
      [...rems, rem('e1', '2026-08', 2000000)],
      '2026-06-15'
    );
    // Agosto es 2º semestre: no debe contar para el aguinaldo de junio.
    expect(conOtroSemestre.mejorSemestreBruto).toBe(1075000);
  });
});

describe('resumirMasa', () => {
  const rems = [
    rem('e1', '2026-05', 1000000),
    rem('e1', '2026-06', 1100000), // última de e1
    rem('e2', '2026-06', 900000),
  ];
  const resumen = resumirMasa(rems);

  it('toma la última remuneración de cada empleado', () => {
    expect(resumen.cantidad).toBe(2);
    expect(resumen.masaSalarialBruta).toBe(2000000); // 1.1M + 0.9M
  });

  it('estima cargas y costo total', () => {
    expect(resumen.cargasSociales).toBeCloseTo(2000000 * CARGAS_PATRONALES, 0);
    expect(resumen.costoTotal).toBeCloseTo(
      2000000 * (1 + CARGAS_PATRONALES),
      0
    );
  });

  it('ordena por bruto descendente', () => {
    expect(resumen.porEmpleado[0].empleadoId).toBe('e1');
  });
});

describe('resumirMasaDelPeriodo', () => {
  const rems = [
    rem('e1', '2026-05', 1000000),
    rem('e1', '2026-06', 1100000),
    rem('e2', '2026-06', 900000),
    rem('e3', '2026-05', 800000),
    rem('e2', '2026-06', 200000, 'sac'),
  ];

  it('sólo suma el mes pedido y no mezcla períodos', () => {
    const junio = resumirMasaDelPeriodo(rems, '2026-06');
    expect(junio.cantidad).toBe(2);
    expect(junio.masaSalarialBruta).toBe(2000000);
    expect(junio.porEmpleado.map((f) => f.periodo)).toEqual([
      '2026-06',
      '2026-06',
    ]);
  });

  it('un mes sin datos queda en cero', () => {
    const vacio = resumirMasaDelPeriodo(rems, '2026-07');
    expect(vacio.cantidad).toBe(0);
    expect(vacio.masaSalarialBruta).toBe(0);
    expect(vacio.costoTotal).toBe(0);
    expect(vacio.porEmpleado).toEqual([]);
  });

  it('el SAC del mismo mes no entra en la masa mensual', () => {
    expect(resumirMasaDelPeriodo(rems, '2026-06').masaSalarialBruta).toBe(
      2000000
    );
  });
});

describe('periodosDelSemestre y SAC', () => {
  const semestre = [
    rem('e1', '2026-07', 800000),
    rem('e1', '2026-08', 1200000),
    rem('e1', '2026-09', 900000),
    rem('e1', '2026-12', 600000, 'sac'),
  ];

  it('el primer semestre son los seis meses ene–jun', () => {
    expect(periodosDelSemestre(2026, 1)).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
    ]);
  });

  it('el segundo semestre son los seis meses jul–dic, incluido el del SAC', () => {
    expect(periodosDelSemestre(2026, 2)).toEqual([
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
      '2026-12',
    ]);
  });

  it('la masa del mes elegido no se contamina con el resto del semestre', () => {
    const septiembre = resumirMasaDelPeriodo(semestre, '2026-09');
    expect(septiembre.cantidad).toBe(1);
    expect(septiembre.masaSalarialBruta).toBe(900000);
    expect(septiembre.porEmpleado.map((f) => f.periodo)).toEqual(['2026-09']);
  });

  it('el monto sugerido del SAC usa el mejor bruto del semestre, no el mes de la vista', () => {
    const soloElMesDeLaVista = analizarSalario(
      semestre.filter((r) => r.periodo === '2026-09'),
      '2026-12-31'
    );
    const semestreCompleto = analizarSalario(semestre, '2026-12-31');
    expect(soloElMesDeLaVista.aguinaldoEstimado).toBe(450000);
    expect(semestreCompleto.mejorSemestreBruto).toBe(1200000);
    expect(semestreCompleto.aguinaldoEstimado).toBe(600000);
  });

  it('yaTieneSacDelSemestre detecta un SAC ya cargado en el período del semestre', () => {
    expect(yaTieneSacDelSemestre(semestre, 'e1', 2026, 2)).toBe(true);
    expect(yaTieneSacDelSemestre(semestre, 'e1', 2026, 1)).toBe(false);
    expect(
      yaTieneSacDelSemestre(
        semestre.filter((r) => r.tipo !== 'sac'),
        'e1',
        2026,
        2
      )
    ).toBe(false);
  });
});
