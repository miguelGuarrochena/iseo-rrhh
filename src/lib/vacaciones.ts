/**
 * Cálculo de días de vacaciones según LCT art. 150 (Argentina).
 * La antigüedad se computa al 31/12 del año en cuestión.
 */

import type { Ausencia } from '@/types/rrhh';

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
