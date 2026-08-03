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

const horaDe = (ts: string): string => ts.slice(11, 16); // "HH:MM" del ISO

/**
 * Controla un turno contra los fichajes del día de ese empleado.
 * `fichajes` puede ser de cualquier día; se filtra por la fecha del turno.
 */
export const controlarTurno = (
  turno: Turno,
  fichajes: Fichaje[],
  ausencias: Ausencia[] = []
): ControlTurno => {
  const delDia = fichajes
    .filter(
      (f) =>
        f.empleadoId === turno.empleadoId && f.timestamp.startsWith(turno.fecha)
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
  const salida = aMinutos(turno.horaSalida);
  const ingreso = horaDe(ingresoF.timestamp);
  const ingresoMin = aMinutos(ingreso);
  const egreso = egresoF ? horaDe(egresoF.timestamp) : undefined;
  const egresoMin = egreso ? aMinutos(egreso) : undefined;

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
