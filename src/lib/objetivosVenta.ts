/**
 * Cálculos del módulo de objetivos de ventas.
 * El progreso se carga a mano: no hay integración con un ERP.
 */
export const porcentajeCumplimiento = (
  objetivo: number,
  alcanzado: number
): number => {
  if (objetivo <= 0) return alcanzado > 0 ? 100 : 0;
  return Math.min(999, Math.round((alcanzado / objetivo) * 1000) / 10);
};

export const objetivoAlcanzado = (
  objetivo: number,
  alcanzado: number
): boolean => objetivo > 0 && alcanzado >= objetivo;

export const bonoDevengado = (
  objetivo: number,
  alcanzado: number,
  bono?: number | null
): number =>
  objetivoAlcanzado(objetivo, alcanzado) && bono && bono > 0 ? bono : 0;
