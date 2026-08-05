/**
 * Historial de fichadas: agrupar las marcas sueltas en jornadas y armar
 * el resumen por empleado de un rango de fechas.
 *
 * Es la misma cuenta que necesitan dos lugares distintos —la pantalla de
 * historial y el Excel que se le manda al contador— así que vive acá y
 * no dentro de ninguno de los dos. La forma del resumen está copiada del
 * que el cliente ya usa en su otra aplicación: una fila por persona y,
 * por cada día del rango, ausencia / entrada / salida / total de horas /
 * si contó como día trabajado.
 */
import { Ausencia, Empleado, Feriado, Fichaje } from '@/types/rrhh';

/** Una jornada armada a partir de las marcas de un empleado en un día. */
export interface Jornada {
  empleadoId: string;
  /** YYYY-MM-DD, en hora local. */
  fecha: string;
  /** Primer ingreso del día, ISO. */
  entrada?: string;
  /** Último egreso del día, ISO. */
  salida?: string;
  /** Horas entre entrada y salida, con un decimal. */
  horas: number;
  /** Falta la entrada o la salida: la jornada no cierra. */
  incompleta: boolean;
  /** Cuántas marcas hubo, para poder mostrar las intermedias. */
  marcas: Fichaje[];
}

/** Fecha local YYYY-MM-DD de un timestamp ISO. */
export const diaLocal = (iso: string): string => {
  const d = new Date(iso);
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
};

/** "HH:MM" local de un timestamp ISO. */
export const horaLocal = (iso: string): string => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/**
 * Agrupa las marcas por empleado y día.
 *
 * La entrada es la primera del día y la salida la última, a propósito:
 * en planta la gente ficha al salir a almorzar y al volver, y tomar el
 * primer egreso daría una jornada de cuatro horas. Las marcas
 * intermedias quedan igual en `marcas` para poder mostrarlas.
 */
export const armarJornadas = (fichajes: Fichaje[]): Jornada[] => {
  const porClave = new Map<string, Fichaje[]>();
  fichajes.forEach((f) => {
    const clave = `${f.empleadoId}|${diaLocal(f.timestamp)}`;
    porClave.set(clave, [...(porClave.get(clave) ?? []), f]);
  });

  return [...porClave.entries()]
    .map(([clave, marcasSueltas]) => {
      const [empleadoId, fecha] = clave.split('|');
      const marcas = [...marcasSueltas].sort((a, b) =>
        a.timestamp.localeCompare(b.timestamp)
      );
      const entrada = marcas.find((m) => m.tipo === 'ingreso');
      const salida = [...marcas].reverse().find((m) => m.tipo === 'egreso');
      const horas =
        entrada && salida
          ? Math.max(
              0,
              (new Date(salida.timestamp).getTime() -
                new Date(entrada.timestamp).getTime()) /
                3_600_000
            )
          : 0;
      return {
        empleadoId,
        fecha,
        entrada: entrada?.timestamp,
        salida: salida?.timestamp,
        horas: Math.round(horas * 10) / 10,
        incompleta: !entrada || !salida,
        marcas,
      };
    })
    .sort(
      (a, b) =>
        a.fecha.localeCompare(b.fecha) ||
        (a.entrada ?? '').localeCompare(b.entrada ?? '')
    );
};

/** Todos los días del rango, inclusive, como YYYY-MM-DD. */
export const diasDelRango = (desde: string, hasta: string): string[] => {
  const dias: string[] = [];
  const d = new Date(`${desde}T00:00:00`);
  const fin = new Date(`${hasta}T00:00:00`);
  // Cota de seguridad: un rango mal tipeado (año 2206) no debe colgar la
  // pantalla armando cien mil columnas.
  while (d <= fin && dias.length < 400) {
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    dias.push(`${d.getFullYear()}-${mes}-${dia}`);
    d.setDate(d.getDate() + 1);
  }
  return dias;
};

const NOMBRE_DIA = [
  'DOMINGO',
  'LUNES',
  'MARTES',
  'MIÉRCOLES',
  'JUEVES',
  'VIERNES',
  'SÁBADO',
];
const NOMBRE_MES = [
  'ENE',
  'FEB',
  'MAR',
  'ABR',
  'MAY',
  'JUN',
  'JUL',
  'AGO',
  'SEP',
  'OCT',
  'NOV',
  'DIC',
];

/** "27-JUL LUNES", como en el Excel que el cliente ya usa. */
export const encabezadoDia = (fechaISO: string): string => {
  const d = new Date(`${fechaISO}T00:00:00`);
  return `${d.getDate()}-${NOMBRE_MES[d.getMonth()]} ${NOMBRE_DIA[d.getDay()]}`;
};

/** Lo que pasó con una persona un día puntual. */
export interface CeldaDia {
  fecha: string;
  /** Tipo de ausencia aprobada que cubre ese día, si hay. */
  ausencia?: string;
  entrada?: string;
  salida?: string;
  horas: number;
  /** 1 si tiene entrada y salida; 0 si no. */
  diaTrabajado: 0 | 1;
  incompleta: boolean;
}

/** Una fila del resumen: la persona y sus días. */
export interface FilaResumen {
  empleado: Empleado;
  dias: CeldaDia[];
  /** Feriados del rango en los que esta persona fichó. */
  feriadosTrabajados: number;
  horasTotales: number;
  diasTrabajados: number;
}

export interface Resumen {
  desde: string;
  hasta: string;
  dias: string[];
  filas: FilaResumen[];
}

const ETIQUETA_AUSENCIA: Record<string, string> = {
  vacaciones: 'Vacaciones',
  enfermedad: 'Enfermedad',
  accidente: 'Accidente',
  maternidad: 'Maternidad',
  paternidad: 'Paternidad',
  estudio: 'Estudio',
  duelo: 'Duelo',
  casamiento: 'Casamiento',
  donacion_sangre: 'Donación de sangre',
  examenes: 'Exámenes',
  home_office: 'Home office',
  entrada_tarde: 'Entrada tarde',
  salida_anticipada: 'Salida anticipada',
  salida_intermedia: 'Salida intermedia',
  sin_goce: 'Sin goce de sueldo',
  otro: 'Otro',
};

/**
 * Arma el resumen del rango.
 *
 * Solo cuenta las ausencias aprobadas: una solicitud pendiente todavía
 * no justifica nada y ponerla en la planilla que va a liquidación daría
 * por resuelto algo que nadie resolvió.
 */
export const armarResumen = (
  desde: string,
  hasta: string,
  empleados: Empleado[],
  fichajes: Fichaje[],
  ausencias: Ausencia[] = [],
  feriados: Feriado[] = []
): Resumen => {
  const dias = diasDelRango(desde, hasta);
  const jornadas = armarJornadas(fichajes);
  const porEmpleadoDia = new Map<string, Jornada>();
  jornadas.forEach((j) => porEmpleadoDia.set(`${j.empleadoId}|${j.fecha}`, j));

  const fechasFeriado = new Set(feriados.map((f) => f.fecha));
  const aprobadas = ausencias.filter((a) => a.estado === 'aprobada');

  const filas = empleados
    .map((empleado): FilaResumen => {
      const celdas = dias.map((fecha): CeldaDia => {
        const j = porEmpleadoDia.get(`${empleado.id}|${fecha}`);
        const ausencia = aprobadas.find(
          (a) =>
            a.empleadoId === empleado.id &&
            a.fechaDesde <= fecha &&
            fecha <= a.fechaHasta
        );
        return {
          fecha,
          ausencia: ausencia
            ? (ETIQUETA_AUSENCIA[ausencia.tipo] ?? ausencia.tipo)
            : undefined,
          entrada: j?.entrada,
          salida: j?.salida,
          horas: j?.horas ?? 0,
          diaTrabajado: j && !j.incompleta ? 1 : 0,
          incompleta: Boolean(j?.incompleta),
        };
      });

      return {
        empleado,
        dias: celdas,
        feriadosTrabajados: celdas.filter(
          (c) => fechasFeriado.has(c.fecha) && c.entrada
        ).length,
        horasTotales:
          Math.round(celdas.reduce((acc, c) => acc + c.horas, 0) * 10) / 10,
        diasTrabajados: celdas.reduce((acc, c) => acc + c.diaTrabajado, 0),
      };
    })
    .sort((a, b) =>
      `${a.empleado.apellido} ${a.empleado.nombre}`.localeCompare(
        `${b.empleado.apellido} ${b.empleado.nombre}`,
        'es'
      )
    );

  return { desde, hasta, dias, filas };
};

/** Horas decimales a "H:MM", que es como se leen en una planilla. */
export const horasAHhMm = (horas: number): string => {
  const total = Math.round(horas * 60);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};
