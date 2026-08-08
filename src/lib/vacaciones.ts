/**
 * Cálculo de días de vacaciones según LCT art. 150 (Argentina).
 * La antigüedad se computa al 31/12 del año en cuestión.
 */

import type { Ausencia, Empresa } from '@/types/rrhh';

/**
 * En qué unidad cuenta las vacaciones una empresa.
 *
 * `corridos` es el default y es lo que dice la LCT (art. 150): los días
 * de vacaciones son corridos, fines de semana incluidos. Algunas
 * empresas otorgan **hábiles**, que es más generoso —14 hábiles son unos
 * 20 corridos de ausencia real— y por eso es legal: la ley fija un piso,
 * no un techo.
 *
 * La unidad afecta dos cosas distintas y conviene no confundirlas:
 *
 *  - **El cupo y el consumo.** Los dos van en la misma unidad, así que
 *    la resta cierra sola: quien tiene 14 hábiles y se toma dos semanas
 *    consume 10 y le quedan 4.
 *  - **La plata.** El art. 155 calcula la retribución como
 *    `sueldo ÷ 25 × días`, y esos días son **corridos**. Multiplicar
 *    días hábiles por ese valor paga de menos, porque la persona está
 *    ausente más días de los que se le descontaron del cupo.
 */
export type UnidadVacaciones = 'corridos' | 'habiles';

/** La unidad que usa una empresa. Sin configurar, corridos (LCT). */
export const unidadVacacionesDe = (
  config?: Pick<Empresa['config'], 'vacacionesDiasHabiles'> | null
): UnidadVacaciones => (config?.vacacionesDiasHabiles ? 'habiles' : 'corridos');

export const UNIDAD_VACACIONES_LABELS: Record<UnidadVacaciones, string> = {
  corridos: 'días corridos',
  habiles: 'días hábiles',
};

/**
 * Pasa una cantidad de días a **corridos**, que es la unidad en la que
 * el art. 155 calcula la plata.
 *
 * Cinco días hábiles cubren una semana corrida, de ahí el 7/5. Es una
 * aproximación —no mira qué día de la semana arranca ni los feriados—
 * pero es la que corresponde para estimar un monto sobre días que
 * todavía no se tomaron y por lo tanto no tienen fechas.
 */
export const aDiasCorridos = (
  dias: number,
  unidad: UnidadVacaciones
): number => (unidad === 'habiles' ? (dias * 7) / 5 : dias);

/**
 * Tramos de antigüedad del art. 150. Los nombres son los cortes de la
 * ley: menos de 5 años, de 5 a 10, de 10 a 20, más de 20.
 */
export interface EscalaVacaciones {
  hasta5: number;
  hasta10: number;
  hasta20: number;
  masDe20: number;
}

/** El mínimo legal, en días corridos (LCT art. 150). */
export const ESCALA_LCT: EscalaVacaciones = {
  hasta5: 14,
  hasta10: 21,
  hasta20: 28,
  masDe20: 35,
};

export const TRAMOS_VACACIONES: {
  clave: keyof EscalaVacaciones;
  etiqueta: string;
}[] = [
  { clave: 'hasta5', etiqueta: 'Menos de 5 años' },
  { clave: 'hasta10', etiqueta: 'De 5 a 10 años' },
  { clave: 'hasta20', etiqueta: 'De 10 a 20 años' },
  { clave: 'masDe20', etiqueta: 'Más de 20 años' },
];

/**
 * El piso legal expresado en la unidad que usa la empresa.
 *
 * En hábiles el mínimo baja a 10/15/20/25, que **no** es dar menos: 10
 * hábiles cubren los mismos 14 días corridos de ausencia. Por eso se
 * redondea hacia arriba — quedarse corto sí sería dar menos que la ley.
 */
export const escalaMinima = (unidad: UnidadVacaciones): EscalaVacaciones => {
  if (unidad === 'corridos') return ESCALA_LCT;
  const aHabiles = (corridos: number) => Math.ceil((corridos * 5) / 7);
  return {
    hasta5: aHabiles(ESCALA_LCT.hasta5),
    hasta10: aHabiles(ESCALA_LCT.hasta10),
    hasta20: aHabiles(ESCALA_LCT.hasta20),
    masDe20: aHabiles(ESCALA_LCT.masDe20),
  };
};

/**
 * La escala que usa una empresa.
 *
 * En **días corridos** siempre es la de la ley y no se puede tocar: es el
 * régimen por defecto y la LCT ya define exactamente cuántos días
 * corresponden por antigüedad. No hay nada que acordar.
 *
 * En **días hábiles** la empresa está saliendo del esquema legal para dar
 * algo mejor, y ahí sí elige la cantidad: arranca en el equivalente al
 * mínimo (10/15/20/25) y puede subirla a lo que haya arreglado.
 */
export const escalaDe = (
  config?: Pick<
    Empresa['config'],
    'vacacionesDiasHabiles' | 'vacacionesEscala'
  > | null
): EscalaVacaciones => {
  const unidad = unidadVacacionesDe(config);
  if (unidad === 'corridos') return ESCALA_LCT;
  return { ...escalaMinima('habiles'), ...(config?.vacacionesEscala ?? {}) };
};

/**
 * Valida una escala contra el piso legal.
 *
 * Devuelve un mensaje por tramo que esté por debajo. En régimen
 * simplificado no valida nada: un monotributista no está en relación de
 * dependencia y la LCT no le fija vacaciones, así que lo que se cargue
 * es lo que se haya acordado.
 */
export const erroresDeEscala = (
  escala: EscalaVacaciones,
  unidad: UnidadVacaciones,
  regimen?: string
): Partial<Record<keyof EscalaVacaciones, string>> => {
  if (regimen === 'simplificado') return {};
  const minima = escalaMinima(unidad);
  const errores: Partial<Record<keyof EscalaVacaciones, string>> = {};
  for (const { clave, etiqueta } of TRAMOS_VACACIONES) {
    const valor = escala[clave];
    if (!Number.isFinite(valor) || valor < minima[clave]) {
      errores[clave] =
        `${etiqueta}: la ley exige al menos ${minima[clave]} ${UNIDAD_VACACIONES_LABELS[unidad]} (art. 150 LCT).`;
    }
  }
  return errores;
};

/**
 * Días que le corresponden a una persona en un año.
 *
 * Sin `escala` usa el mínimo legal en días corridos, que es el
 * comportamiento por defecto de toda empresa que no configuró nada.
 */
export const diasVacacionesPorAntiguedad = (
  fechaIngreso: string,
  anio: number,
  escala: EscalaVacaciones = ESCALA_LCT
): number => {
  const ingreso = new Date(`${fechaIngreso}T00:00:00`);
  const cierre = new Date(`${anio}-12-31T00:00:00`);
  if (ingreso > cierre) return 0;

  const antiguedadMs = cierre.getTime() - ingreso.getTime();
  const antiguedadAnios = antiguedadMs / (365.25 * 24 * 60 * 60 * 1000);

  // Menos de 6 meses: 1 día cada 20 trabajados (aprox. proporcional)
  if (antiguedadAnios < 0.5) {
    const diasTrabajados = Math.floor(antiguedadMs / (24 * 60 * 60 * 1000));
    return Math.floor(diasTrabajados / 20);
  }
  if (antiguedadAnios < 5) return escala.hasta5;
  if (antiguedadAnios < 10) return escala.hasta10;
  if (antiguedadAnios < 20) return escala.hasta20;
  return escala.masDe20;
};

/**
 * Días de vacaciones ya gozados en un año concreto.
 *
 * El año importa y no siempre es el corriente: la liquidación final
 * calcula lo que corresponde sobre el año de la **fecha de baja**, así
 * que los días ya tomados tienen que ser de ese mismo año. Tomarlos de
 * un año distinto —una baja retroactiva, o cargada después de fin de
 * año— hace que no se descuente nada y se paguen de nuevo vacaciones
 * que la persona ya se tomó.
 *
 * Mismo criterio que usa `getSaldoVacaciones` para `diasUtilizados`:
 * sólo las aprobadas, y se imputan al año en que **empiezan**.
 */
export const diasVacacionesGozadosEn = (
  ausencias: Ausencia[],
  anio: number | string
): number =>
  ausencias
    .filter(
      (a) =>
        a.tipo === 'vacaciones' &&
        a.estado === 'aprobada' &&
        a.fechaDesde.startsWith(String(anio))
    )
    .reduce((acc, a) => acc + a.dias, 0);
