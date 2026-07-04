/**
 * Control de turnos: compara el turno asignado con la fichada real y
 * calcula llegadas tarde, salidas antes, horas extras y ausencias.
 */
import { Fichaje, Turno } from '@/types/rrhh';

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
}

const horaDe = (ts: string): string => ts.slice(11, 16); // "HH:MM" del ISO

/**
 * Controla un turno contra los fichajes del día de ese empleado.
 * `fichajes` puede ser de cualquier día; se filtra por la fecha del turno.
 */
export const controlarTurno = (
  turno: Turno,
  fichajes: Fichaje[]
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
    return {
      turno,
      tardeMin: 0,
      antesMin: 0,
      extrasMin: 0,
      ausente: true,
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
  fichajes: Fichaje[]
): ResumenControl => {
  const controles = turnos.map((t) => controlarTurno(t, fichajes));
  return {
    ausencias: controles.filter((c) => c.ausente).length,
    llegadasTarde: controles.filter((c) => c.tardeMin > 0).length,
    minutosTarde: controles.reduce((a, c) => a + c.tardeMin, 0),
    salidasAntes: controles.filter((c) => c.antesMin > 0).length,
    minutosExtras: controles.reduce((a, c) => a + c.extrasMin, 0),
  };
};
