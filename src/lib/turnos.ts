/**
 * Control de turnos: compara el turno asignado con la fichada real y
 * calcula llegadas tarde, salidas antes, horas extras y ausencias.
 *
 * Qué se unificó acá
 * ------------------
 * Este archivo tenía su propia idea de "los fichajes de este día":
 * filtraba por fecha de calendario. El resto del sistema —
 * `marcas_numeradas` en la base y `agruparMarcas` en el cliente— razona
 * por SESIÓN, y con razón: un turno 22:00–06:00 es una jornada del
 * lunes, no media del lunes y media del martes.
 *
 * Con el filtro por día el egreso de las 06:00 caía en el día siguiente,
 * así que para el turno del lunes no existía (extras en cero) y el turno
 * del martes no encontraba su ingreso (se reportaba "ausente" a alguien
 * que había trabajado toda la noche).
 *
 * Ahora la jornada la arma `armarJornadas`, que es la misma regla que
 * corre en Postgres, y este archivo sólo hace lo suyo: comparar esa
 * jornada contra el horario que le tocaba.
 */
import { armarJornadas, Jornada } from '@/lib/fichadas';
import { horaEmpresa, minutosDelDiaEmpresa } from '@/lib/fechas';
import { Ausencia, Fichaje, Turno } from '@/types/rrhh';

/** "HH:MM" → minutos desde medianoche. */
export const aMinutos = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** minutos → "Xh Ym" (o "Ym"). */
export const formatearMinutos = (min: number): string => {
  if (min <= 0) return '0m';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ''}` : `${m}m`;
};

export interface ControlTurno {
  turno: Turno;
  ingreso?: string;
  egreso?: string;
  tardeMin: number;
  antesMin: number;
  extrasMin: number;
  ausente: boolean;
  /** Si no fichó pero tenía una ausencia aprobada ese día, no es un faltazo real. */
  deLicencia?: Ausencia;
}

/** true si `fecha` cae dentro de una ausencia aprobada de ese empleado. */
const ausenciaAprobadaEn = (
  ausencias: Ausencia[],
  empleadoId: string,
  fecha: string
): Ausencia | undefined =>
  ausencias.find(
    (a) =>
      a.empleadoId === empleadoId &&
      a.estado === 'aprobada' &&
      a.fechaDesde <= fecha &&
      fecha <= a.fechaHasta
  );

/**
 * La jornada de esa persona que le corresponde a ese turno.
 *
 * "Le corresponde" es por SESIÓN, no por día de calendario: la jornada
 * se fecha por su ingreso, así que el turno 22:00–06:00 del lunes
 * encuentra la sesión que empezó el lunes a las 22:00 y termina el
 * martes a la mañana. Es la definición de `armarJornadas`, que a su vez
 * es el espejo de `marcas_numeradas` en la base.
 *
 * Con turno partido puede haber varias sesiones el mismo día. Se elige
 * la de entrada más cercana a la hora esperada: así cada turno se
 * compara contra la sesión que de verdad le toca, en vez de contra la
 * primera del día. Con una sola sesión —el caso normal— es esa.
 */
const jornadaDelTurno = (
  turno: Turno,
  fichajes: Fichaje[],
  ahora: number
): Jornada | undefined => {
  const delEmpleado = fichajes.filter((f) => f.empleadoId === turno.empleadoId);
  // `armarJornadas` ya descarta las marcas anuladas: una marca anulada
  // no ocurrió, tampoco para el control de turnos (F-12).
  const candidatas = armarJornadas(delEmpleado, ahora).filter(
    (j) => j.fecha === turno.fecha
  );
  if (candidatas.length <= 1) return candidatas[0];
  const esperada = aMinutos(turno.horaEntrada);
  return [...candidatas].sort(
    (a, b) => distanciaAEsperada(a, esperada) - distanciaAEsperada(b, esperada)
  )[0];
};

/** Cuán lejos arranca una jornada de la hora de entrada del turno. */
const distanciaAEsperada = (j: Jornada, esperadaMin: number): number =>
  j.entrada
    ? Math.abs(minutosDelDiaEmpresa(j.entrada) - esperadaMin)
    : Number.MAX_SAFE_INTEGER;

/**
 * ¿Ese empleado trabajó ese día?
 *
 * Sirve para saber si hay algo que controlar cuando el día no tiene
 * turno asignado: sin jornada no se puede decir nada (y compararlo
 * contra el horario general marcaría "ausente" cada sábado).
 *
 * Pregunta por JORNADA y no por "alguna marca con esa fecha", que es lo
 * que hacía antes. La diferencia aparece en el turno noche: el egreso de
 * las 06:00 del martes pertenece a la jornada del lunes, así que no
 * convierte al martes en un día trabajado — y ya no se sintetiza un
 * turno de control que terminaba reportando "ausente".
 */
export const ficho = (
  fichajes: Fichaje[],
  empleadoId: string,
  fecha: string,
  ahora: number = Date.now()
): boolean =>
  armarJornadas(
    fichajes.filter((f) => f.empleadoId === empleadoId),
    ahora
  ).some((j) => j.fecha === fecha);

/**
 * Controla un turno contra la jornada real de ese empleado.
 *
 * La llegada tarde y las extras las calcula `controlarJornada`, que es
 * la misma función que usan Reportes, "Mi mes" y las extras que se
 * sugieren al liquidar. Antes esta pantalla tenía su propia cuenta y
 * contaba además la entrada anticipada como extra, así que el mismo día
 * podía mostrar un número acá y otro en la liquidación. La regla que
 * vale es la documentada en `controlarJornada`: extra es quedarse
 * después, no llegar antes.
 *
 * `antesMin` (salida anticipada) se queda acá porque es propio del
 * control de turnos: no se paga, se mira.
 */
export const controlarTurno = (
  turno: Turno,
  fichajes: Fichaje[],
  ausencias: Ausencia[] = [],
  ahora: number = Date.now()
): ControlTurno => {
  const jornada = jornadaDelTurno(turno, fichajes, ahora);

  if (!jornada?.entrada) {
    const deLicencia = ausenciaAprobadaEn(
      ausencias,
      turno.empleadoId,
      turno.fecha
    );
    return {
      turno,
      tardeMin: 0,
      antesMin: 0,
      extrasMin: 0,
      // Si tenía una ausencia aprobada ese día, no faltó: estaba de licencia.
      ausente: !deLicencia,
      deLicencia,
    };
  }

  const { llegadaTardeMin, extrasMin } = controlarJornada(jornada, turno);

  return {
    turno,
    ingreso: horaEmpresa(jornada.entrada),
    egreso: jornada.salida ? horaEmpresa(jornada.salida) : undefined,
    tardeMin: llegadaTardeMin,
    antesMin: salidaAnticipadaMin(jornada, turno),
    extrasMin,
    ausente: false,
  };
};

/**
 * Minutos que le faltaron al final de la jornada respecto del turno.
 *
 * Cero si todavía no fichó la salida: una jornada abierta no es una
 * salida anticipada, es una jornada abierta. Antes daba el turno entero
 * como "salió antes" en cuanto faltaba el egreso.
 */
const salidaAnticipadaMin = (
  jornada: Jornada,
  horario: HorarioEsperado
): number => {
  if (!jornada.entrada || !jornada.salida) return 0;
  const entradaEsperada = aMinutos(horario.horaEntrada);
  let salidaEsperada = aMinutos(horario.horaSalida);
  if (salidaEsperada <= entradaEsperada) salidaEsperada += 24 * 60;

  const ingresoMin = minutosDelDiaEmpresa(jornada.entrada);
  let egresoMin = minutosDelDiaEmpresa(jornada.salida);
  if (egresoMin < ingresoMin) egresoMin += 24 * 60;

  return Math.max(0, salidaEsperada - egresoMin);
};

/** Horario que se espera de una jornada. */
export interface HorarioEsperado {
  horaEntrada: string;
  horaSalida: string;
}

export interface ControlDeJornada {
  /** Minutos de llegada tarde, 0 si entró dentro de la tolerancia. */
  llegadaTardeMin: number;
  /** Minutos trabajados después de la hora de salida esperada. */
  extrasMin: number;
}

/**
 * "2026-08-07T22:15:00Z" → minutos desde medianoche, en la zona de la
 * empresa.
 *
 * Tiene que ser la zona del negocio y no la del dispositivo: se compara
 * contra `horaEntrada` / `horaSalida`, que son horas de pared argentinas
 * escritas por RRHH. Leído en UTC, un ingreso puntual de las 08:00 ART
 * daba "llegó tres horas tarde"; leído en el huso del navegador, daba
 * cualquier cosa según dónde estuviera la máquina.
 */
const minutosDelISO = (iso: string): number => minutosDelDiaEmpresa(iso);

/**
 * Compara una jornada real contra el horario que le correspondía.
 *
 * El horario puede venir del turno asignado a esa persona ese día o, si
 * no tiene turno, del horario general de la empresa. Quien llama decide
 * cuál corresponde; acá sólo se hace la cuenta.
 *
 * **Sólo cuenta como extra la salida tardía**, no la entrada anticipada:
 * llegar veinte minutos antes suele ser el colectivo, no trabajo pedido.
 *
 * Los turnos que cruzan medianoche (22:00–06:00) se detectan porque la
 * salida es menor o igual que la entrada, y se corrigen sumando un día.
 * Sin eso, un turno noche daba cientos de minutos de llegada tarde todos
 * los días y las extras salían cualquier cosa.
 */
export const controlarJornada = (
  jornada: { entrada?: string | null; salida?: string | null },
  horario: HorarioEsperado,
  toleranciaMin = 0
): ControlDeJornada => {
  const entradaEsperada = aMinutos(horario.horaEntrada);
  let salidaEsperada = aMinutos(horario.horaSalida);
  // Salida menor o igual que la entrada sólo tiene sentido si el turno
  // termina al día siguiente.
  if (salidaEsperada <= entradaEsperada) salidaEsperada += 24 * 60;

  const ingresoMin = jornada.entrada ? minutosDelISO(jornada.entrada) : null;
  let egresoMin = jornada.salida ? minutosDelISO(jornada.salida) : null;
  // Si salió "antes" de haber entrado, es que cruzó la medianoche.
  if (ingresoMin !== null && egresoMin !== null && egresoMin < ingresoMin) {
    egresoMin += 24 * 60;
  }

  return {
    llegadaTardeMin:
      ingresoMin !== null && ingresoMin > entradaEsperada + toleranciaMin
        ? ingresoMin - entradaEsperada
        : 0,
    extrasMin:
      egresoMin !== null && egresoMin > salidaEsperada
        ? egresoMin - salidaEsperada
        : 0,
  };
};

/** Clave para encontrar el turno de una persona en un día. */
export const claveTurno = (empleadoId: string, fecha: string): string =>
  `${empleadoId}|${fecha}`;

/** Índice de turnos por empleado y fecha, para no recorrer la lista por jornada. */
export const indexarTurnos = (turnos: Turno[]): Map<string, Turno> =>
  new Map(turnos.map((t) => [claveTurno(t.empleadoId, t.fecha), t]));

export interface ResumenControl {
  ausencias: number;
  llegadasTarde: number;
  minutosTarde: number;
  salidasAntes: number;
  minutosExtras: number;
}

/** Resume el control de una lista de turnos contra los fichajes. */
export const resumirControlTurnos = (
  turnos: Turno[],
  fichajes: Fichaje[],
  ausencias: Ausencia[] = [],
  ahora: number = Date.now()
): ResumenControl => {
  const controles = turnos.map((t) =>
    controlarTurno(t, fichajes, ausencias, ahora)
  );
  return {
    ausencias: controles.filter((c) => c.ausente).length,
    llegadasTarde: controles.filter((c) => c.tardeMin > 0).length,
    minutosTarde: controles.reduce((a, c) => a + c.tardeMin, 0),
    salidasAntes: controles.filter((c) => c.antesMin > 0).length,
    minutosExtras: controles.reduce((a, c) => a + c.extrasMin, 0),
  };
};
