/**
 * Cálculo de días de vacaciones según LCT art. 150 (Argentina).
 * La antigüedad se computa al 31/12 del año en cuestión.
 */

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
