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

/**
 * Zona horaria en la que la empresa cuenta los días.
 *
 * Es el espejo de `zona_empresa()` en la base (migración 46), que es la
 * que usa `jornadas_de_empresa` para fechar cada jornada. Las dos tienen
 * que decir lo mismo: si divergen, el tablero muestra un día y el
 * historial otro para la misma marca.
 *
 * Existe porque "hoy" no puede salir del reloj del dispositivo. Un
 * gerente mirando el presentismo desde una computadora en otro huso, o
 * una tablet de planta con la hora mal puesta, veían un día distinto del
 * que la base considera el mismo día, y no había forma de darse cuenta:
 * el tablero simplemente mostraba a la gente equivocada.
 */
export const ZONA_EMPRESA = 'America/Argentina/Buenos_Aires';

/** Año, mes, día y hora de un instante, leídos en la zona de la empresa. */
const enZonaEmpresa = (d: Date) => {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: ZONA_EMPRESA,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      // Sin esto, la medianoche sale como "24" en algunos motores y la
      // cuenta del desfasaje se va por un día entero.
      hourCycle: 'h23',
    })
      .formatToParts(d)
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, Number(p.value)])
  ) as Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', number>;
  return partes;
};

/**
 * Cuántos milisegundos adelanta la zona de la empresa sobre UTC en ese
 * instante. Se calcula y no se escribe a mano para que un eventual
 * cambio de huso (o de país) no quede en un número mágico.
 */
const desfasajeEmpresa = (d: Date): number => {
  const p = enZonaEmpresa(d);
  const comoSiFueraUTC = Date.UTC(
    p.year,
    p.month - 1,
    p.day,
    p.hour,
    p.minute,
    p.second
  );
  // El segundo se compara al ras: los milisegundos no importan y
  // arrastrarlos metería ruido en la resta.
  return comoSiFueraUTC - Math.floor(d.getTime() / 1000) * 1000;
};

/** Fecha de hoy en la zona de la empresa (YYYY-MM-DD). */
export const hoyISO = (ahora: Date = new Date()): string => {
  const p = enZonaEmpresa(ahora);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
};

/**
 * Instante en el que empezó el día de hoy para la empresa, en ISO.
 *
 * Es el corte de "fichajes de hoy". Con la medianoche del dispositivo,
 * una consulta hecha desde otro huso traía las marcas de otro día.
 */
export const inicioDelDiaEmpresa = (ahora: Date = new Date()): string => {
  const p = enZonaEmpresa(ahora);
  const medianocheComoUTC = Date.UTC(p.year, p.month - 1, p.day);
  return new Date(medianocheComoUTC - desfasajeEmpresa(ahora)).toISOString();
};

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

/** "2026-07-02T07:55:00" → "07:55" o "09:54 p.m." */
export const formatearHora = (timestamp: string): string =>
  formatearHoraDe(new Date(timestamp));

/**
 * Hora de un `Date` (reloj de la tablet). es-AR escribe "p. m." con
 * espacio; en pantalla se lee "p.m.".
 */
export const formatearHoraDe = (fecha: Date): string =>
  compactarMeridiano(
    fecha.toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
    })
  );

/** "p. m." / "a. m." → "p.m." / "a.m." */
export const compactarMeridiano = (hora: string): string =>
  hora.replace(/([ap])\.\s+m\./gi, '$1.m.');
