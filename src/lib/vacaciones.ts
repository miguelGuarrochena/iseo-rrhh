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

export const diasVacacionesPorAntiguedad = (
  fechaIngreso: string,
  anio: number
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
  if (antiguedadAnios < 5) return 14;
  if (antiguedadAnios < 10) return 21;
  if (antiguedadAnios < 20) return 28;
  return 35;
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
