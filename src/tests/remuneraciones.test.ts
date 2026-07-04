import {
  analizarSalario,
  resumirMasa,
  CARGAS_PATRONALES,
} from '@/lib/remuneraciones';
import { Remuneracion } from '@/types/rrhh';

const rem = (
  empleadoId: string,
  periodo: string,
  montoBruto: number
): Remuneracion => ({
  id: `${empleadoId}-${periodo}`,
  empleadoId,
  periodo,
  montoBruto,
  montoNeto: Math.round(montoBruto * 0.83),
});

describe('analizarSalario', () => {
  const rems = [
    rem('e1', '2026-04', 950000),
    rem('e1', '2026-05', 1010000),
    rem('e1', '2026-06', 1075000),
  ];
  const analisis = analizarSalario(rems, new Date('2026-06-15T00:00:00'));

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
      new Date('2026-06-15T00:00:00')
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
