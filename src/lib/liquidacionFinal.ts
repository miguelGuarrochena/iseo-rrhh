/**
 * Borrador de liquidación final (Argentina, LCT).
 *
 * Cubre sólo los conceptos mecánicos, los que salen de una cuenta con
 * fechas y sueldos: vacaciones proporcionales no gozadas, su SAC, y el
 * aguinaldo proporcional del semestre.
 *
 * NO calcula preaviso ni indemnización por antigüedad a propósito: esos
 * dependen de la causal de la desvinculación (renuncia, despido con o sin
 * causa, mutuo acuerdo) y son materia litigiosa. Un número mal puesto ahí
 * sale caro, así que esa parte queda para el contador o el abogado.
 */
import {
  aDiasCorridos,
  diasVacacionesPorAntiguedad,
  type UnidadVacaciones,
} from '@/lib/vacaciones';

const MS_POR_DIA = 1000 * 60 * 60 * 24;

/**
 * Días de vacaciones que se pagan al irse (art. 156 LCT): los que le
 * corresponden por antigüedad, en proporción al tiempo trabajado en el
 * año, menos los que ya se tomó.
 */
export const diasVacacionesProporcionales = (
  fechaIngresoISO: string,
  fechaBajaISO: string,
  diasYaGozados: number
): number => {
  const baja = new Date(`${fechaBajaISO}T00:00:00`);
  const ingreso = new Date(`${fechaIngresoISO}T00:00:00`);
  if (Number.isNaN(baja.getTime()) || Number.isNaN(ingreso.getTime())) return 0;

  const anio = baja.getFullYear();
  const correspondenPorAnio = diasVacacionesPorAntiguedad(
    fechaIngresoISO,
    anio
  );
  // Si entró este mismo año, el proporcional se cuenta desde su ingreso,
  // no desde el 1 de enero.
  const inicio =
    ingreso.getFullYear() === anio ? ingreso : new Date(anio, 0, 1);
  const diasEnElAnio =
    Math.round((baja.getTime() - inicio.getTime()) / MS_POR_DIA) + 1;
  if (diasEnElAnio <= 0) return 0;

  const proporcionales = (correspondenPorAnio * diasEnElAnio) / 365;
  return Math.max(0, Math.round((proporcionales - diasYaGozados) * 100) / 100);
};

/**
 * Valor del día de vacaciones (art. 155 inc. a): el sueldo mensual se
 * divide por 25, no por 30. Es un error clásico y siempre en contra del
 * trabajador.
 */
export const valorDiaVacaciones = (montoBrutoMensual: number): number =>
  montoBrutoMensual > 0 ? montoBrutoMensual / 25 : 0;

/**
 * Fracción del semestre efectivamente trabajada hasta la baja, para el
 * SAC proporcional (art. 123).
 */
export const fraccionSemestreHastaBaja = (
  fechaIngresoISO: string,
  fechaBajaISO: string
): number => {
  const baja = new Date(`${fechaBajaISO}T00:00:00`);
  const ingreso = new Date(`${fechaIngresoISO}T00:00:00`);
  if (Number.isNaN(baja.getTime()) || Number.isNaN(ingreso.getTime())) return 0;

  const anio = baja.getFullYear();
  const primerSemestre = baja.getMonth() <= 5;
  const inicioSemestre = primerSemestre
    ? new Date(anio, 0, 1)
    : new Date(anio, 6, 1);
  const finSemestre = primerSemestre
    ? new Date(anio, 5, 30)
    : new Date(anio, 11, 31);

  const desde = ingreso > inicioSemestre ? ingreso : inicioSemestre;
  if (baja < desde) return 0;

  const diasSemestre =
    Math.round(
      (finSemestre.getTime() - inicioSemestre.getTime()) / MS_POR_DIA
    ) + 1;
  const diasTrabajados =
    Math.round((baja.getTime() - desde.getTime()) / MS_POR_DIA) + 1;
  return Math.max(0, Math.min(1, diasTrabajados / diasSemestre));
};

export interface ConceptoLiquidacion {
  concepto: string;
  detalle: string;
  monto: number;
}

export interface BorradorLiquidacionFinal {
  conceptos: ConceptoLiquidacion[];
  total: number;
}

/**
 * Arma el borrador. `mejorBrutoSemestre` sale del análisis salarial que
 * ya usa Remuneraciones, para no calcular la base dos veces con dos
 * criterios distintos.
 */
export const armarLiquidacionFinal = (datos: {
  fechaIngreso: string;
  fechaBaja: string;
  /** Último bruto mensual conocido, base de las vacaciones. */
  brutoMensual: number;
  /** Mejor bruto del semestre en curso, base del SAC (art. 121). */
  mejorBrutoSemestre: number;
  /** Días de vacaciones ya tomados en el año de la baja. */
  diasVacacionesGozados: number;
  /**
   * Unidad en que la empresa cuenta las vacaciones. Por defecto
   * `corridos`, que es lo que dice la LCT.
   */
  unidadVacaciones?: UnidadVacaciones;
}): BorradorLiquidacionFinal => {
  const conceptos: ConceptoLiquidacion[] = [];
  const unidad = datos.unidadVacaciones ?? 'corridos';

  const dias = diasVacacionesProporcionales(
    datos.fechaIngreso,
    datos.fechaBaja,
    datos.diasVacacionesGozados
  );
  /**
   * `valorDiaVacaciones` es bruto ÷ 25 por día **corrido** (art. 155).
   * Si la empresa lleva el cupo en días hábiles, `dias` viene en hábiles
   * y hay que pasarlo a corridos antes de multiplicar: si no, se paga
   * alrededor de un 30% menos de lo que corresponde por los mismos días
   * de ausencia.
   */
  const diasParaPagar = aDiasCorridos(dias, unidad);
  const montoVacaciones = Math.round(
    diasParaPagar * valorDiaVacaciones(datos.brutoMensual)
  );
  if (montoVacaciones > 0) {
    conceptos.push({
      concepto: 'Vacaciones proporcionales no gozadas',
      detalle:
        unidad === 'habiles'
          ? `${dias.toFixed(2)} días hábiles (≈ ${diasParaPagar.toFixed(2)} corridos) × (bruto ÷ 25) — art. 156 LCT`
          : `${dias.toFixed(2)} días × (bruto ÷ 25) — art. 156 LCT`,
      monto: montoVacaciones,
    });
    // El SAC sobre vacaciones se olvida seguido y siempre en contra del
    // trabajador: la indemnización del art. 156 también devenga aguinaldo.
    const sacVacaciones = Math.round(montoVacaciones / 12);
    if (sacVacaciones > 0) {
      conceptos.push({
        concepto: 'SAC sobre vacaciones',
        detalle: 'vacaciones ÷ 12',
        monto: sacVacaciones,
      });
    }
  }

  const fraccion = fraccionSemestreHastaBaja(
    datos.fechaIngreso,
    datos.fechaBaja
  );
  const sacProporcional = Math.round((datos.mejorBrutoSemestre / 2) * fraccion);
  if (sacProporcional > 0) {
    conceptos.push({
      concepto: 'SAC proporcional del semestre',
      detalle: `${Math.round(fraccion * 100)}% del semestre — art. 123 LCT`,
      monto: sacProporcional,
    });
  }

  return {
    conceptos,
    total: conceptos.reduce((acc, c) => acc + c.monto, 0),
  };
};
