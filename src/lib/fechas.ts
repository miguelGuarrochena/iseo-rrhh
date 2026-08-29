/**
 * Expande un año de dos dígitos a cuatro. Ventana móvil: hasta 10 años
 * en el futuro se toma como 20xx; de ahí para atrás, 19xx. Así "85" es
 * 1985 (fecha de nacimiento) y "27" es 2027 (fin de contrato).
 */
export const expandirAnio = (yy: number, hoy = new Date()): number => {
  // El corte sale del año de NEGOCIO: el 31 de diciembre a las 21:00 de
  // Buenos Aires el reloj del dispositivo ya dice el año siguiente y la
  // ventana se corría un año. Es un caso chico —cambia qué dos dígitos
  // caen en 19xx— pero es el mismo defecto que el resto.
  const corte = (anioEmpresa(hoy) % 100) + 10;
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

/**
 * Días corridos de un rango que caen dentro de un año calendario.
 *
 * Es la misma pregunta que resuelve `diasVacacionesDeRangoEnAnio` pero sin
 * la rama de días hábiles: las licencias del art. 158 se cuentan siempre
 * en corridos. Existe porque el cupo anual de una licencia que cruza el
 * 31/12 se imputaba entero al año en que empezaba — el mismo BUG-012 que
 * ya se había arreglado en vacaciones y que seguía vivo acá.
 */
export const diasCorridosEnAnio = (
  desde: string,
  hasta: string,
  anio: number | string
): number => {
  const y = Number(anio);
  const ini = desde > `${y}-01-01` ? desde : `${y}-01-01`;
  const fin = hasta < `${y}-12-31` ? hasta : `${y}-12-31`;
  if (fin < ini) return 0;
  return diasEntre(ini, fin);
};

/**
 * Días hábiles (lun–vie) de un rango que caen dentro de un mes de negocio
 * ("YYYY-MM"). Es lo que necesita el ausentismo para no imputarle a un mes
 * los días de una ausencia que pertenecen al siguiente.
 */
export const diasHabilesEnMes = (
  desde: string,
  hasta: string,
  mes: string,
  feriados?: Set<string>
): number => {
  const inicioMes = `${mes}-01`;
  const finMes = finDeMesEmpresa(mes);
  const ini = desde > inicioMes ? desde : inicioMes;
  const fin = hasta < finMes ? hasta : finMes;
  if (fin < ini) return 0;
  return diasHabilesEntre(ini, fin, feriados);
};

/**
 * Una fecha CIVIL para mostrar. "1982-05-14" siempre se lee 14 de mayo.
 *
 * El `T00:00:00` sin zona la ancla a la medianoche LOCAL, y se formatea
 * también en local: el día entra y sale igual en cualquier huso. Es a
 * propósito y es la diferencia con `formatearInstante`, que sí tiene que
 * convertir porque recibe un momento real.
 *
 * Está acá y no repetida en cada pantalla porque las dos formas se
 * parecen demasiado: una copia a la que alguien le pase un `timestamptz`
 * en vez de un día muestra la fecha corrida y nadie lo nota.
 */
export const formatearFechaCivil = (
  iso: string,
  opciones: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
): string => new Date(`${iso}T00:00:00`).toLocaleDateString('es-AR', opciones);

export const formatearFecha = (iso: string): string => formatearFechaCivil(iso);

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

/**
 * Año de negocio. El 31 de diciembre a las 21:00 de Buenos Aires el reloj
 * del dispositivo ya dice el año siguiente.
 */
export const anioEmpresa = (ahora: Date = new Date()): number =>
  Number(hoyISO(ahora).slice(0, 4));

/**
 * Partes de una fecha civil, sin pasar por `Date`.
 *
 * Una fecha civil —nacimiento, ingreso, vencimiento— no es un instante:
 * es un día del calendario. Construir un `Date` para leerle el día es
 * darle una hora y una zona que el dato no tiene, y de ahí salen los
 * "13/05/1982" donde dice 14.
 */
export const partesDeFecha = (
  fecha: string
): { anio: number; mes: number; dia: number } => {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  return { anio, mes: mes || 1, dia: dia || 1 };
};

/**
 * Día de la semana de una fecha civil: 0 domingo … 6 sábado.
 *
 * En UTC a propósito: es aritmética de calendario y el resultado no puede
 * depender de dónde esté la computadora.
 */
export const diaSemanaEmpresa = (fecha: string): number => {
  const { anio, mes, dia } = partesDeFecha(fecha);
  return new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay();
};

/** Lunes de la semana que contiene a esa fecha civil. */
export const lunesDeSemanaEmpresa = (fecha: string): string =>
  sumarDiasEmpresa(fecha, -((diaSemanaEmpresa(fecha) + 6) % 7));

/** Domingo de la semana que contiene a esa fecha civil. */
export const domingoDeSemanaEmpresa = (fecha: string): string =>
  sumarDiasEmpresa(lunesDeSemanaEmpresa(fecha), 6);

/**
 * Suma (o resta) meses a un período "YYYY-MM".
 *
 * Sobre el período y no sobre un día, porque no tiene respuesta correcta
 * qué es "31 de enero + 1 mes". Quien necesite un día usa
 * `finDeMesEmpresa` después.
 */
export const sumarMesesEmpresa = (periodo: string, delta: number): string => {
  const [anio, mes] = periodo.split('-').map(Number);
  const total = anio * 12 + (mes - 1) + delta;
  const a = Math.floor(total / 12);
  const m = total - a * 12 + 1;
  return `${a}-${String(m).padStart(2, '0')}`;
};

/**
 * Cuántos días hay entre dos fechas civiles (hasta − desde). Puede ser
 * negativo. `diasEntre` cuenta los dos extremos; ésta mide la distancia.
 */
export const diferenciaEnDias = (desde: string, hasta: string): number =>
  Math.round((comoDiaUTC(hasta) - comoDiaUTC(desde)) / 86400000);

/**
 * El próximo cumpleaños (o aniversario) de una fecha civil, a partir de
 * un día dado, inclusive.
 *
 * El día mismo cuenta: quien cumple hoy cumple hoy, no el año que viene.
 * El 29 de febrero cae en el 1 de marzo los años no bisiestos — es el
 * criterio del Código Civil argentino (art. 25) para los plazos de mes a
 * mes, y es el que la gente espera ver en la agenda.
 */
export const proximoAniversario = (
  fechaCivil: string,
  desde: string
): string => {
  const anioBase = Number(desde.slice(0, 4));
  const propio = Number(fechaCivil.slice(0, 4));
  const esteAnio = aniversarioDe(fechaCivil, anioBase - propio);
  return esteAnio >= desde
    ? esteAnio
    : aniversarioDe(fechaCivil, anioBase + 1 - propio);
};

/**
 * La fecha en la que se cumplen `anios` años desde una fecha civil.
 *
 * Es la operación que necesitan la antigüedad y el cumpleaños, y por eso
 * vive acá y no repetida en los dos: "¿cuándo cumple cinco años quien
 * entró el 29 de febrero?" tiene que tener una sola respuesta.
 *
 * El 29 de febrero cae en el 1 de marzo los años no bisiestos, que es el
 * criterio del art. 25 del Código Civil argentino para los plazos de mes
 * a mes. La alternativa —el 28— adelantaría el aniversario un día, y en
 * un cálculo de antigüedad eso puede correr a alguien de tramo.
 */
export const aniversarioDe = (fechaCivil: string, anios: number): string => {
  const { anio, mes, dia } = partesDeFecha(fechaCivil);
  const destino = anio + anios;
  const mm = String(mes).padStart(2, '0');
  const ultimo = Number(finDeMesEmpresa(`${destino}-${mm}`).slice(8));
  const propuesta = `${destino}-${mm}-${String(Math.min(dia, ultimo)).padStart(2, '0')}`;
  return dia > ultimo ? sumarDiasEmpresa(propuesta, 1) : propuesta;
};

/**
 * Años cumplidos entre dos fechas civiles: edad, antigüedad.
 *
 * Se cuenta por calendario y no dividiendo milisegundos por 365,25: quien
 * nació un 29 de febrero cumple años, y una división aproximada hace que
 * el aniversario caiga un día antes o después según el año.
 */
export const aniosCumplidos = (desde: string, hasta: string): number => {
  const d = partesDeFecha(desde);
  const h = partesDeFecha(hasta);
  let anios = h.anio - d.anio;
  if (h.mes < d.mes || (h.mes === d.mes && h.dia < d.dia)) anios -= 1;
  return Math.max(0, anios);
};

/**
 * Un instante (timestamptz) mostrado como fecha y hora de la empresa.
 *
 * Es lo que hay que usar para `creado_en`, `firmado_en`, `ultimo_acceso`
 * y compañía: son instantes, y sin `timeZone` cada dispositivo los leía
 * con su propio reloj. Distinto de `formatearFecha`, que recibe un día
 * civil y no tiene ninguna hora que convertir.
 */
export const formatearInstante = (
  iso: string,
  opciones: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }
): string =>
  compactarMeridiano(
    new Date(iso).toLocaleString('es-AR', {
      ...opciones,
      timeZone: ZONA_EMPRESA,
    })
  );

/** Un instante mostrado sólo como el día de la empresa en que ocurrió. */
export const formatearFechaDeInstante = (iso: string): string =>
  formatearFecha(diaEmpresa(iso));

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
