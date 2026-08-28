/**
 * Expande un año de dos dígitos a cuatro. Ventana móvil: hasta 10 años
 * en el futuro se toma como 20xx; de ahí para atrás, 19xx. Así "85" es
 * 1985 (fecha de nacimiento) y "27" es 2027 (fin de contrato).
 */
export const expandirAnio = (yy: number, hoy = new Date()): number => {
  const corte = (hoy.getFullYear() % 100) + 10;
  return yy <= corte ? 2000 + yy : 1900 + yy;
};

/**
 * Un día de calendario (YYYY-MM-DD) como instante UTC.
 *
 * Contar días es aritmética de calendario, no de instantes: mientras las
 * dos puntas se lean con la misma vara, la resta da bien. Se hace en UTC
 * y no con `new Date('YYYY-MM-DDT00:00:00')` porque eso último ancla la
 * cuenta al huso del dispositivo, y en un huso con horario de verano un
 * día del rango dura 23 horas y el `Math.round` se come una jornada.
 */
const comoDiaUTC = (fecha: string): number => {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  return Date.UTC(anio, (mes || 1) - 1, dia || 1);
};

/** Días entre dos fechas ISO, incluyendo ambos extremos (días corridos). */
export const diasEntre = (desde: string, hasta: string): number => {
  const d = comoDiaUTC(desde);
  const h = comoDiaUTC(hasta);
  if (h < d) return 0;
  return Math.round((h - d) / 86400000) + 1;
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
  const fin = comoDiaUTC(hasta);
  if (fin < comoDiaUTC(desde)) return 0;
  let n = 0;
  const cur = new Date(comoDiaUTC(desde));
  while (cur.getTime() <= fin) {
    const dia = cur.getUTCDay();
    const finDeSemana = dia === 0 || dia === 6;
    const iso = `${cur.getUTCFullYear()}-${String(cur.getUTCMonth() + 1).padStart(2, '0')}-${String(cur.getUTCDate()).padStart(2, '0')}`;
    if (!finDeSemana && !feriados?.has(iso)) n += 1;
    cur.setUTCDate(cur.getUTCDate() + 1);
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
export const enZonaEmpresa = (d: Date) => {
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
 * Un reloj de pared de la empresa ("2026-07-27", "22:00") convertido al
 * instante real que le corresponde.
 *
 * Es la inversa de `enZonaEmpresa` y hace falta en los dos bordes del
 * módulo: cuando RRHH escribe una hora en el formulario de carga manual,
 * y cuando una pantalla pide un rango de días. Las dos cosas venían
 * usando `new Date('YYYY-MM-DDTHH:MM:00')`, que interpreta el string en
 * el huso del dispositivo: desde una máquina en otro huso, la marca
 * nacía corrida y el rango empezaba en otro momento.
 *
 * Dos pasadas y no una: el desfasaje depende del instante, así que la
 * primera aproximación se usa sólo para elegir el desfasaje correcto.
 * Argentina no tiene horario de verano y con una alcanzaría, pero la
 * segunda no cuesta nada y sostiene la cuenta si algún día lo tuviera.
 */
export const instanteEnZonaEmpresa = (fecha: string, hora = '00:00'): Date => {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const [hh, mm] = hora.split(':').map(Number);
  const comoSiFueraUTC = Date.UTC(
    anio,
    (mes || 1) - 1,
    dia || 1,
    hh || 0,
    mm || 0
  );
  const aproximado =
    comoSiFueraUTC - desfasajeEmpresa(new Date(comoSiFueraUTC));
  return new Date(comoSiFueraUTC - desfasajeEmpresa(new Date(aproximado)));
};

/**
 * Instante en el que empezó el día de hoy para la empresa, en ISO.
 *
 * Es el corte de "fichajes de hoy". Con la medianoche del dispositivo,
 * una consulta hecha desde otro huso traía las marcas de otro día.
 */
export const inicioDelDiaEmpresa = (ahora: Date = new Date()): string =>
  instanteEnZonaEmpresa(hoyISO(ahora)).toISOString();

/**
 * Día de negocio (YYYY-MM-DD) de un instante ISO.
 *
 * Es LA definición de "a qué día pertenece esta marca" del lado del
 * cliente, y el espejo exacto de `(ts at time zone zona_empresa())::date`
 * en la base. Antes cada archivo tenía la suya usando `getFullYear()` y
 * compañía, o sea el huso del dispositivo: una marca de las 21:30 de
 * Buenos Aires se agrupaba en el día siguiente desde cualquier máquina
 * en UTC, y el historial mostraba un día distinto del que la base había
 * calculado para la misma marca.
 */
export const diaEmpresa = (iso: string): string => {
  const p = enZonaEmpresa(new Date(iso));
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
};

/** "HH:MM" de 24 horas de un instante ISO, en la zona de la empresa. */
export const horaEmpresa = (iso: string): string => {
  const p = enZonaEmpresa(new Date(iso));
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
};

/**
 * Minutos transcurridos desde la medianoche de la empresa. Es lo que
 * comparan los controles de turno contra `horaEntrada` / `horaSalida`,
 * que son horas de pared argentinas.
 */
export const minutosDelDiaEmpresa = (iso: string): number => {
  const p = enZonaEmpresa(new Date(iso));
  return p.hour * 60 + p.minute;
};

/**
 * Mes de negocio (YYYY-MM) de un instante.
 *
 * Existe porque `new Date().toISOString().slice(0, 7)` es UTC: el 31 de
 * agosto a las 21:30 de Buenos Aires ya devolvía "2026-09", y el
 * ausentismo del mes se calculaba sobre un mes que no había empezado.
 */
export const mesEmpresa = (ahora: Date = new Date()): string =>
  hoyISO(ahora).slice(0, 7);

/**
 * Suma (o resta, con delta negativo) días a una fecha de negocio, sin
 * pasar por el huso del dispositivo. `new Date(f); d.setDate(...)` era
 * el patrón repetido y arrastraba el huso local en cada llamada.
 */
export const sumarDiasEmpresa = (fecha: string, delta: number): string => {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const d = new Date(Date.UTC(anio, (mes || 1) - 1, (dia || 1) + delta));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
};

/** Último día del mes de negocio (YYYY-MM) como YYYY-MM-DD. */
export const finDeMesEmpresa = (periodo: string): string => {
  const [anio, mes] = periodo.split('-').map(Number);
  const d = new Date(Date.UTC(anio, mes, 0));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
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
 * Hora de un `Date`, leída en la zona de la empresa. es-AR escribe
 * "p. m." con espacio; en pantalla se lee "p.m.".
 *
 * El `timeZone` es la corrección: sin él esto usaba el reloj del
 * dispositivo, así que la misma marca se leía a una hora en la tablet de
 * planta y a otra en la computadora de RRHH si alguna tenía el huso mal
 * puesto. La hora de un fichaje es un hecho del negocio, no del aparato
 * que lo muestra.
 */
export const formatearHoraDe = (fecha: Date): string =>
  compactarMeridiano(
    fecha.toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: ZONA_EMPRESA,
    })
  );

/** "p. m." / "a. m." → "p.m." / "a.m." */
export const compactarMeridiano = (hora: string): string =>
  hora.replace(/([ap])\.\s+m\./gi, '$1.m.');
