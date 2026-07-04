/** Formatea un número como pesos argentinos, sin decimales. */
export const formatearPesos = (monto: number): string =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(monto);

/** Formatea un porcentaje con signo, un decimal. Ej: +6.4% */
export const formatearPorcentaje = (pct: number): string =>
  `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
