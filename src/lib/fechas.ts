/**
 * Expande un año de dos dígitos a cuatro. Ventana móvil: hasta 10 años
 * en el futuro se toma como 20xx; de ahí para atrás, 19xx. Así "85" es
 * 1985 (fecha de nacimiento) y "27" es 2027 (fin de contrato).
 */
export const expandirAnio = (yy: number, hoy = new Date()): number => {
  const corte = (hoy.getFullYear() % 100) + 10;
  return yy <= corte ? 2000 + yy : 1900 + yy;
};

/** Días entre dos fechas ISO, incluyendo ambos extremos (días corridos). */
export const diasEntre = (desde: string, hasta: string): number => {
  const d = new Date(`${desde}T00:00:00`);
  const h = new Date(`${hasta}T00:00:00`);
  if (h < d) return 0;
  return Math.round((h.getTime() - d.getTime()) / 86400000) + 1;
};

/**
 * Días hábiles (lun–vie) entre dos fechas ISO, inclusive. Si se pasan
 * los feriados de la empresa (`YYYY-MM-DD`), también se descuentan.
 */
export const diasHabilesEntre = (
  desde: string,
  hasta: string,
  feriados?: Set<string>
): number => {
  const d = new Date(`${desde}T00:00:00`);
  const h = new Date(`${hasta}T00:00:00`);
  if (h < d) return 0;
  let n = 0;
  const cur = new Date(d);
  while (cur <= h) {
    const dia = cur.getDay();
    const finDeSemana = dia === 0 || dia === 6;
    if (!finDeSemana && !feriados?.has(aISOLocal(cur))) n += 1;
    cur.setDate(cur.getDate() + 1);
  }
  return n;
};

/**
 * Cuenta días de una ausencia según la config de la empresa.
 * Vacaciones pueden ser hábiles; el resto siempre corridos.
 *
 * Fuente de verdad compartida: UI (`NuevaAusenciaModal`), demo/real
 * `crearAusencia` y (espejo SQL) `dias_*_entre` en migración 58.
 */
export const diasAusencia = (
  desde: string,
  hasta: string,
  tipo: string,
  vacacionesDiasHabiles?: boolean,
  feriados?: Set<string>
): number => {
  if (tipo === 'vacaciones' && vacacionesDiasHabiles) {
    return diasHabilesEntre(desde, hasta, feriados);
  }
  return diasEntre(desde, hasta);
};

export const formatearFecha = (iso: string): string =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'short',
  });

/**
 * Date → "YYYY-MM-DD" en horario local. Ojo con `toISOString()`: da UTC,
 * así que en Argentina (UTC-3) después de las 21:00 devuelve el día
 * siguiente y las cosas de hoy quedan fuera de los listados.
 */
export const aISOLocal = (d: Date): string => {
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
};

/** Fecha de hoy en horario local (YYYY-MM-DD). */
export const hoyISO = (): string => aISOLocal(new Date());

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
