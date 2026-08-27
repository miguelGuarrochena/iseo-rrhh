/**
 * Control de turnos: compara el turno asignado con la fichada real y
 * calcula llegadas tarde, salidas antes, horas extras y ausencias.
 */
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
 * "HH:MM" en hora local del dispositivo.
 *
 * No se puede leer con `ts.slice(11, 16)`: PostgREST entrega
 * `timestamptz` en UTC (`…T11:00:00+00:00`) y eso convertía un ingreso
 * puntual a las 08:00 ART en "llegó 3 horas tarde". Mismo criterio que
 * `minutosDelISO` más abajo.
 */
const horaLocalDe = (ts: string): string => {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(
    d.getMinutes()
  ).padStart(2, '0')}`;
};

/** Fecha local YYYY-MM-DD de un timestamp ISO (con o sin zona). */
const fechaLocalDe = (ts: string): string => {
  const d = new Date(ts);
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
};

/**
 * ¿Ese empleado tiene alguna marca ese día?
 *
 * Sirve para saber si hay algo que controlar cuando el día no tiene
 * turno asignado: sin fichaje no se puede decir nada (y compararlo
 * contra el horario general marcaría "ausente" cada sábado).
 *
 * Usa la misma fecha local que `controlarTurno`, y no una comparación
 * propia, justamente para que las dos respuestas no puedan diferir en
 * el borde de la medianoche.
 */
export const ficho = (
  fichajes: Fichaje[],
  empleadoId: string,
  fecha: string
): boolean =>
  fichajes.some(
    (f) => f.empleadoId === empleadoId && fechaLocalDe(f.timestamp) === fecha
  );

/**
 * Controla un turno contra los fichajes del día de ese empleado.
 * `fichajes` puede ser de cualquier día; se filtra por la fecha del turno
 * en hora local (no por el prefijo UTC del string ISO).
 */
export const controlarTurno = (
  turno: Turno,
  fichajes: Fichaje[],
  ausencias: Ausencia[] = []
): ControlTurno => {
  const delDia = fichajes
    .filter(
      (f) =>
        f.empleadoId === turno.empleadoId &&
        fechaLocalDe(f.timestamp) === turno.fecha
    )
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const ingresoF = delDia.find((f) => f.tipo === 'ingreso');
  const egresoF = [...delDia].reverse().find((f) => f.tipo === 'egreso');

  if (!ingresoF) {
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

  const entrada = aMinutos(turno.horaEntrada);
  let salida = aMinutos(turno.horaSalida);
  // Turno que cruza medianoche (22:00–06:00): la salida "antes" de la
  // entrada es al día siguiente.
  if (salida <= entrada) salida += 24 * 60;

  const ingreso = horaLocalDe(ingresoF.timestamp);
  const ingresoMin = aMinutos(ingreso);
  const egreso = egresoF ? horaLocalDe(egresoF.timestamp) : undefined;
  let egresoMin = egreso ? aMinutos(egreso) : undefined;
  if (egresoMin !== undefined && egresoMin < ingresoMin) {
    egresoMin += 24 * 60;
  }

  const tardeMin = Math.max(0, ingresoMin - entrada);
  const antesMin =
    egresoMin !== undefined ? Math.max(0, salida - egresoMin) : 0;
  // Extras: entró antes del turno o se quedó después.
  const extraAntes = Math.max(0, entrada - ingresoMin);
  const extraDespues =
    egresoMin !== undefined ? Math.max(0, egresoMin - salida) : 0;

  return {
    turno,
    ingreso,
    egreso,
    tardeMin,
    antesMin,
    extrasMin: extraAntes + extraDespues,
    ausente: false,
  };
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

/** "2026-08-07T22:15:00Z" → minutos desde medianoche, en hora local. */
const minutosDelISO = (iso: string): number => {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
};

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
  ausencias: Ausencia[] = []
): ResumenControl => {
  const controles = turnos.map((t) => controlarTurno(t, fichajes, ausencias));
  return {
    ausencias: controles.filter((c) => c.ausente).length,
    llegadasTarde: controles.filter((c) => c.tardeMin > 0).length,
    minutosTarde: controles.reduce((a, c) => a + c.tardeMin, 0),
    salidasAntes: controles.filter((c) => c.antesMin > 0).length,
    minutosExtras: controles.reduce((a, c) => a + c.extrasMin, 0),
  };
};
