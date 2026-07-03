/** Días entre dos fechas ISO, incluyendo ambos extremos. */
export const diasEntre = (desde: string, hasta: string): number => {
  const d = new Date(`${desde}T00:00:00`);
  const h = new Date(`${hasta}T00:00:00`);
  if (h < d) return 0;
  return Math.round((h.getTime() - d.getTime()) / 86400000) + 1;
};

export const formatearFecha = (iso: string): string =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'short',
  });

export const hoyISO = (): string => new Date().toISOString().slice(0, 10);

const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

/** "2026-06" → "Junio 2026" */
export const formatearPeriodo = (periodo: string): string => {
  const [anio, mes] = periodo.split('-');
  return `${MESES[Number(mes) - 1] ?? mes} ${anio}`;
};

/** "2026-07-02T07:55:00" → "07:55" */
export const formatearHora = (timestamp: string): string =>
  new Date(timestamp).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
  });
