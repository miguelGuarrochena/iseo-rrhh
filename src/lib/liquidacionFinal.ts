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
  calcularVacacionesDiasHabiles,
  tramoLegalArt150,
  ESCALA_LCT,
  type EscalaVacaciones,
  type UnidadVacaciones,
} from '@/lib/vacaciones';
import { diasEntre, partesDeFecha } from '@/lib/fechas';

/**
 * Todo lo de acá son fechas CIVILES: ingreso, baja, bordes de semestre.
 * Ninguna es un instante, así que la cuenta se hace sobre "YYYY-MM-DD" y
 * no construyendo `Date`. Con `Date` el resultado quedaba atado al huso
 * del dispositivo —correcto en Argentina, que no tiene horario de verano,
 * pero por casualidad y no por diseño.
 */

/**
 * Días de vacaciones que se pagan al irse (art. 156 LCT): los que le
 * corresponden por antigüedad, en proporción al tiempo trabajado en el
 * año, menos los que ya se tomó.
 */
export const diasVacacionesProporcionales = (
  fechaIngresoISO: string,
  fechaBajaISO: string,
  diasYaGozados: number,
  escala: EscalaVacaciones = ESCALA_LCT,
  /**
   * Régimen de la empresa. Decide con qué regla se calcula el derecho
   * del año: la legal en días corridos, o la modalidad propia de días
   * hábiles. Por defecto el legal, que es el de toda empresa que no
   * configuró otra cosa.
   */
  unidad: UnidadVacaciones = 'corridos'
): number => {
  if (!fechaBajaISO || !fechaIngresoISO) return 0;
  /**
   * Un período imposible no paga nada.
   *
   * Con la baja anterior al ingreso, la cuenta de abajo igual daba un
   * número: el año se toma de la baja, el proporcional arranca el 1 de
   * enero de ESE año —que es anterior al ingreso— y el tramo del art. 150
   * se resuelve contra un cierre que el ingreso ni alcanza. Un legajo con
   * ingreso 21/06/2022 y baja 31/10/2020 devolvía 11,7 días a pagar por
   * un tiempo que nunca se trabajó.
   *
   * No es hipotético: la constraint `empleados_baja_posterior_al_ingreso`
   * de la migración 51 es NOT VALID, así que nunca frenó las filas
   * viejas, y hay una en la base real.
   */
  if (fechaBajaISO < fechaIngresoISO) return 0;

  const anio = partesDeFecha(fechaBajaISO).anio;
  /**
   * En el régimen legal la base es el TRAMO del art. 150, no el
   * resultado de los arts. 151/153.
   *
   * Son dos reglas distintas y no se encadenan. El art. 151 decide si
   * alguien que trabajó todo el año tiene derecho al período completo; el
   * art. 156 —que es el que aplica al extinguirse el contrato— manda
   * pagar "el período de descanso proporcional a la fracción del año
   * trabajada", y esa fracción ya la aplica el `× diasEnElAnio / 365` de
   * más abajo. Pasar antes por el art. 151 prorratearía dos veces: quien
   * se va el 30 de junio con tres años de antigüedad cobraría 2,98 días
   * en vez de los ~7 que le corresponden.
   *
   * En días hábiles se conserva exactamente la función de esa modalidad.
   */
  const correspondenPorAnio =
    unidad === 'habiles'
      ? calcularVacacionesDiasHabiles(fechaIngresoISO, anio, escala)
      : tramoLegalArt150(fechaIngresoISO, `${anio}-12-31`);
  // Si entró este mismo año, el proporcional se cuenta desde su ingreso,
  // no desde el 1 de enero.
  const inicio =
    partesDeFecha(fechaIngresoISO).anio === anio
      ? fechaIngresoISO
      : `${anio}-01-01`;
  const diasEnElAnio = diasEntre(inicio, fechaBajaISO);
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
  if (!fechaBajaISO || !fechaIngresoISO) return 0;

  const { anio, mes } = partesDeFecha(fechaBajaISO);
  const primerSemestre = mes <= 6;
  const inicioSemestre = primerSemestre ? `${anio}-01-01` : `${anio}-07-01`;
  const finSemestre = primerSemestre ? `${anio}-06-30` : `${anio}-12-31`;

  const desde =
    fechaIngresoISO > inicioSemestre ? fechaIngresoISO : inicioSemestre;
  if (fechaBajaISO < desde) return 0;

  const diasSemestre = diasEntre(inicioSemestre, finSemestre);
  const diasTrabajados = diasEntre(desde, fechaBajaISO);
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
  /** Días por tramo de la empresa. Por defecto, la escala de la LCT. */
  escalaVacaciones?: EscalaVacaciones;
}): BorradorLiquidacionFinal => {
  const conceptos: ConceptoLiquidacion[] = [];
  const unidad = datos.unidadVacaciones ?? 'corridos';

  const dias = diasVacacionesProporcionales(
    datos.fechaIngreso,
    datos.fechaBaja,
    datos.diasVacacionesGozados,
    datos.escalaVacaciones ?? ESCALA_LCT,
    unidad
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
