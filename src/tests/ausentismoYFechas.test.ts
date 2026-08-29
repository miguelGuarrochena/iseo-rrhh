import { diasCorridosEnAnio, diasHabilesEnMes } from '@/lib/fechas';
import { calcularVacacionesLegalesCorridas } from '@/lib/vacaciones';
import {
  armarLiquidacionFinal,
  diasVacacionesProporcionales,
} from '@/lib/liquidacionFinal';
import { documentoFirmaSeArchiva } from '@/lib/seguridad/documentosFirma';
import { TIPOS_AUSENCIA_JORNADA } from '@/lib/etiquetas';

/**
 * F-06 — Los días de una licencia que cruza el año nuevo se imputaban
 * enteros al año en que empezaba.
 */
describe('F-06: diasCorridosEnAnio', () => {
  it('parte el rango por año calendario', () => {
    // 28/12 al 06/01: cuatro días de un año, seis del siguiente.
    expect(diasCorridosEnAnio('2026-12-28', '2027-01-06', 2026)).toBe(4);
    expect(diasCorridosEnAnio('2026-12-28', '2027-01-06', 2027)).toBe(6);
  });

  it('los dos tramos suman el rango completo', () => {
    const total =
      diasCorridosEnAnio('2026-12-28', '2027-01-06', 2026) +
      diasCorridosEnAnio('2026-12-28', '2027-01-06', 2027);
    expect(total).toBe(10);
  });

  it('un año que el rango no toca da cero', () => {
    expect(diasCorridosEnAnio('2026-12-28', '2027-01-06', 2025)).toBe(0);
    expect(diasCorridosEnAnio('2026-12-28', '2027-01-06', 2028)).toBe(0);
  });

  it('un rango dentro de un solo año da el rango entero', () => {
    expect(diasCorridosEnAnio('2026-03-01', '2026-03-10', 2026)).toBe(10);
  });

  it('acepta el año como string, igual que el resto de las cuentas', () => {
    expect(diasCorridosEnAnio('2026-12-28', '2027-01-06', '2027')).toBe(6);
  });
});

/**
 * F-04 — El ausentismo del panel de control sumaba los días enteros de
 * toda ausencia que EMPEZARA en el mes, y no contaba nada de las que
 * venían del mes anterior.
 */
describe('F-04: diasHabilesEnMes', () => {
  it('reparte una ausencia entre los dos meses que toca', () => {
    // Vacaciones del 20/07 al 10/08 de 2026: antes julio se llevaba los
    // 22 días corridos y agosto cero.
    expect(diasHabilesEnMes('2026-07-20', '2026-08-10', '2026-07')).toBe(10);
    expect(diasHabilesEnMes('2026-07-20', '2026-08-10', '2026-08')).toBe(6);
  });

  it('un mes que la ausencia no toca da cero', () => {
    expect(diasHabilesEnMes('2026-07-20', '2026-08-10', '2026-09')).toBe(0);
    expect(diasHabilesEnMes('2026-07-20', '2026-08-10', '2026-06')).toBe(0);
  });

  it('no cuenta sábados ni domingos', () => {
    // 20 y 21 de junio de 2026 son sábado y domingo.
    expect(diasHabilesEnMes('2026-06-20', '2026-06-21', '2026-06')).toBe(0);
  });

  it('descuenta los feriados que se le pasen', () => {
    expect(diasHabilesEnMes('2026-06-15', '2026-06-19', '2026-06')).toBe(5);
    expect(
      diasHabilesEnMes(
        '2026-06-15',
        '2026-06-19',
        '2026-06',
        new Set(['2026-06-17'])
      )
    ).toBe(4);
  });

  it('home office y las parciales de jornada no son ausencia', () => {
    // El numerador del ausentismo las excluye: home office es trabajo y
    // de una llegada tarde no sabemos los minutos.
    expect(TIPOS_AUSENCIA_JORNADA).toEqual(
      expect.arrayContaining([
        'home_office',
        'entrada_tarde',
        'salida_anticipada',
        'salida_intermedia',
      ])
    );
  });
});

/**
 * Datos degenerados que existen HOY en la base real.
 *
 * Hay un legajo con `fecha_baja` anterior a `fecha_ingreso` (la constraint
 * de la migración 51 es NOT VALID, así que nunca lo frenó). No se puede
 * corregir desde acá —es un dato del cliente y no sabemos cuál de las dos
 * fechas está mal— pero sí hay que saber qué hace el sistema con él: lo
 * que no puede pasar es que devuelva un número negativo o absurdo y que
 * ese número termine en una liquidación.
 */
describe('legajo con baja anterior al ingreso', () => {
  const INGRESO = '2022-06-21';
  const BAJA = '2020-10-31';

  it('el cupo legal del año da 0, no un negativo', () => {
    expect(
      calcularVacacionesLegalesCorridas({
        fechaIngreso: INGRESO,
        fechaBaja: BAJA,
        anio: 2026,
      })
    ).toBe(0);
  });

  it('la liquidación final da 0, no un importe inventado', () => {
    expect(diasVacacionesProporcionales(INGRESO, BAJA, 0)).toBe(0);
    const borrador = armarLiquidacionFinal({
      fechaIngreso: INGRESO,
      fechaBaja: BAJA,
      brutoMensual: 1_000_000,
      mejorBrutoSemestre: 1_000_000,
      diasVacacionesGozados: 0,
    });
    const vacaciones = borrador.conceptos.find((c) =>
      c.concepto.startsWith('Vacaciones proporcionales')
    );
    expect(vacaciones).toBeUndefined();
    expect(borrador.total).toBeGreaterThanOrEqual(0);
  });

  it('ninguna cuenta de días devuelve un negativo', () => {
    expect(diasCorridosEnAnio(INGRESO, BAJA, 2026)).toBe(0);
    expect(diasHabilesEnMes(INGRESO, BAJA, '2026-06')).toBe(0);
  });
});

/**
 * F-10 — Borrar un documento para firma se llevaba las constancias de
 * quienes ya lo habían firmado.
 */
describe('F-10: baja de un documento para firma', () => {
  it('con al menos una firma se archiva', () => {
    expect(documentoFirmaSeArchiva(1)).toBe(true);
    expect(documentoFirmaSeArchiva(3)).toBe(true);
  });

  it('sin firmas se borra: no hay constancia que conservar', () => {
    expect(documentoFirmaSeArchiva(0)).toBe(false);
  });
});
