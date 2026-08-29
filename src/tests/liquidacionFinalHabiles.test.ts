import { armarLiquidacionFinal } from '@/lib/liquidacionFinal';
import {
  diasVacacionesGozadosEn,
  escalaMinima,
  type EscalaVacaciones,
} from '@/lib/vacaciones';
import type { Ausencia } from '@/types/rrhh';

/**
 * F-01 — La liquidación final mezclaba unidades.
 *
 * `diasVacacionesGozadosEn` se llamaba sin opciones desde la ficha del
 * colaborador, así que los días gozados salían en CORRIDOS, y después se
 * restaban de un cupo expresado en HÁBILES. Restar corridos de hábiles
 * siempre resta de más: la empresa terminaba pagando menos vacaciones de
 * las que su propia configuración determina.
 *
 * Los números de estos casos son los de la auditoría, verificados contra
 * las funciones reales.
 */
describe('F-01: liquidación final en días hábiles', () => {
  const ESCALA: EscalaVacaciones = escalaMinima('habiles'); // 10/15/20/25
  const BRUTO = 1_000_000;

  /** Vacaciones del vie 1 al jue 7 de mayo de 2026: 5 hábiles, 7 corridos. */
  const gozadas: Ausencia[] = [
    {
      id: 'a1',
      empleadoId: 'e1',
      tipo: 'vacaciones',
      estado: 'aprobada',
      fechaDesde: '2026-05-01',
      fechaHasta: '2026-05-07',
      dias: 5,
    } as Ausencia,
  ];

  it('contar lo gozado en hábiles da distinto que en corridos', () => {
    expect(diasVacacionesGozadosEn(gozadas, 2026)).toBe(7); // corridos
    expect(diasVacacionesGozadosEn(gozadas, 2026, { habiles: true })).toBe(5);
  });

  const borrador = (diasGozados: number) =>
    armarLiquidacionFinal({
      fechaIngreso: '2020-01-01',
      fechaBaja: '2026-12-31',
      brutoMensual: BRUTO,
      mejorBrutoSemestre: BRUTO,
      diasVacacionesGozados: diasGozados,
      unidadVacaciones: 'habiles',
      escalaVacaciones: ESCALA,
    });

  const montoDe = (b: ReturnType<typeof borrador>, concepto: string) =>
    b.conceptos.find((c) => c.concepto.startsWith(concepto))?.monto ?? 0;

  it('con los días en la unidad correcta paga lo que corresponde', () => {
    const b = borrador(5);
    expect(montoDe(b, 'Vacaciones proporcionales')).toBe(560_000);
    expect(montoDe(b, 'SAC sobre vacaciones')).toBe(46_667);
    expect(b.total).toBe(1_106_667);
  });

  it('con los días en corridos (el bug) paga de menos', () => {
    // Se deja fijado el número viejo para que quede claro qué se rompía
    // si alguien vuelve a omitir las opciones en el caller.
    const b = borrador(7);
    expect(montoDe(b, 'Vacaciones proporcionales')).toBe(448_000);
    expect(b.total).toBe(985_333);
    expect(b.total).toBeLessThan(borrador(5).total);
  });

  it('la diferencia es del 20% del rubro vacaciones', () => {
    const bien = montoDe(borrador(5), 'Vacaciones proporcionales');
    const mal = montoDe(borrador(7), 'Vacaciones proporcionales');
    expect(Math.round(((bien - mal) / bien) * 100)).toBe(20);
  });

  it('el régimen legal de días corridos no se toca', () => {
    // Mismo escenario en corridos: el cupo es el del art. 150 y lo
    // gozado son días corridos. Nada de esto cambió.
    const legal = armarLiquidacionFinal({
      fechaIngreso: '2020-01-01',
      fechaBaja: '2026-12-31',
      brutoMensual: BRUTO,
      mejorBrutoSemestre: BRUTO,
      diasVacacionesGozados: diasVacacionesGozadosEn(gozadas, 2026),
    });
    // 21 días del tramo − 7 gozados = 14 × (bruto ÷ 25).
    expect(
      legal.conceptos.find((c) =>
        c.concepto.startsWith('Vacaciones proporcionales')
      )?.monto
    ).toBe(560_000);
  });

  it('un feriado adentro del período no se consume', () => {
    // Semana del 15 al 19 de junio de 2026 con el feriado del 17: son 4
    // hábiles, no 5. Sin pasar los feriados se contaba uno de más.
    const conFeriado: Ausencia[] = [
      {
        ...gozadas[0],
        fechaDesde: '2026-06-15',
        fechaHasta: '2026-06-19',
      } as Ausencia,
    ];
    expect(
      diasVacacionesGozadosEn(conFeriado, 2026, {
        habiles: true,
        feriados: new Set(['2026-06-17']),
      })
    ).toBe(4);
  });
});
