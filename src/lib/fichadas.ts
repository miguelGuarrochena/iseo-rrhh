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

/**
 * Una jornada: lo que hizo una persona un día.
 *
 * Es la unidad con la que razonan el historial, el Excel y los
 * reportes. La arma la base (`jornadas_de_empresa`) y, para los pocos
 * casos donde ya se tienen las marcas en memoria, también
 * `armarJornadas`. Las dos tienen que dar lo mismo: hay un test que lo
 * verifica.
 */
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
  /** Cuántas marcas hubo ese día (incluidas las intermedias). */
  marcas: number;
  /** Alguna de las marcas cayó fuera de la zona de trabajo. */
  fueraDeZona?: boolean;
}

/**
 * Horas entre dos marcas, redondeadas a un decimal. Se comparte entre
 * el armado en memoria y el que viene de la base, para que no haya dos
 * redondeos distintos dando números que no cierran entre pantallas.
 */
export const horasEntre = (entrada?: string, salida?: string): number =>
  Math.round((minutosEntre(entrada, salida) / 60) * 10) / 10;

/**
 * Minutos exactos entre dos marcas, sin redondear a horas.
 *
 * Los totales se suman con esto y recién después se pasan a horas: si
 * se suman las horas ya redondeadas de cada día, el error se acumula.
 */
export const minutosEntre = (entrada?: string, salida?: string): number => {
  if (!entrada || !salida) return 0;
  const ms = new Date(salida).getTime() - new Date(entrada).getTime();
  return Math.round(Math.max(0, ms) / 60_000);
};

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
 * Agrupa marcas sueltas en jornadas, en memoria.
 *
 * Para el historial y los reportes esto lo hace la base
 * (`jornadas_de_empresa`), que evita traerse todas las marcas del
 * período. Esta versión queda para los casos chicos donde las marcas ya
 * están en memoria —el fichaje del día, la demo— y como referencia
 * contra la que se testea que la SQL dé lo mismo.
 *
 * La entrada es la primera del día y la salida la última, a propósito:
 * en planta la gente ficha al salir a almorzar y al volver, y tomar el
 * primer egreso daría una jornada de cuatro horas.
 */
export const armarJornadas = (fichajes: Fichaje[]): Jornada[] => {
  const porClave = new Map<string, Fichaje[]>();
  fichajes.forEach((f) => {
    const clave = `${f.empleadoId}|${diaLocal(f.timestamp)}`;
    porClave.set(clave, [...(porClave.get(clave) ?? []), f]);
  });

  return [...porClave.entries()]
    .map(([clave, marcasSueltas]): Jornada => {
      const [empleadoId, fecha] = clave.split('|');
      const marcas = [...marcasSueltas].sort((a, b) =>
        a.timestamp.localeCompare(b.timestamp)
      );
      const entrada = marcas.find((m) => m.tipo === 'ingreso');
      const salida = [...marcas].reverse().find((m) => m.tipo === 'egreso');
      return {
        empleadoId,
        fecha,
        entrada: entrada?.timestamp,
        salida: salida?.timestamp,
        horas: horasEntre(entrada?.timestamp, salida?.timestamp),
        incompleta: !entrada || !salida,
        marcas: marcas.length,
        fueraDeZona: marcas.some((m) => m.fueraDeZona),
      };
    })
    .sort(ordenJornadas);
};

/** Orden estable: por día y, dentro del día, por hora de entrada. */
export const ordenJornadas = (a: Jornada, b: Jornada): number =>
  a.fecha.localeCompare(b.fecha) ||
  (a.entrada ?? '').localeCompare(b.entrada ?? '');

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
  /** Redondeadas a un decimal, para mostrar. */
  horas: number;
  /** Exactos, para sumar sin arrastrar el redondeo de cada día. */
  minutos: number;
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
  /** Redondeadas a un decimal, para mostrar en pantalla. */
  horasTotales: number;
  /** Exactos. Es lo que hay que usar para formatear "H:MM". */
  minutosTotales: number;
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
  /**
   * Ya agrupadas (una por empleado y día). Antes recibía las marcas
   * sueltas y las agrupaba acá, lo que obligaba a bajarse el período
   * entero al navegador; ahora ese trabajo lo hace la base.
   */
  jornadas: Jornada[],
  ausencias: Ausencia[] = [],
  feriados: Feriado[] = []
): Resumen => {
  const dias = diasDelRango(desde, hasta);
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
          // Minutos exactos, sin redondear, sólo para el total. Ver abajo.
          minutos: minutosEntre(j?.entrada, j?.salida),
          diaTrabajado: j && !j.incompleta ? 1 : 0,
          incompleta: Boolean(j?.incompleta),
        };
      });

      /**
       * Se suman los minutos exactos y se redondea una sola vez al
       * final. Sumar las horas ya redondeadas de cada día parece lo
       * mismo pero no lo es: una jornada de 8h58 se muestra como 9,0 y,
       * sobre veinte días, el total se iba casi media hora para arriba.
       * En una planilla que se usa para pagar, ese error se nota.
       */
      const minutosTotales = celdas.reduce((acc, c) => acc + c.minutos, 0);

      return {
        empleado,
        dias: celdas,
        feriadosTrabajados: celdas.filter(
          (c) => fechasFeriado.has(c.fecha) && c.entrada
        ).length,
        horasTotales: Math.round((minutosTotales / 60) * 10) / 10,
        minutosTotales,
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

/** Minutos a "H:MM", que es como se leen en una planilla. */
export const minutosAHhMm = (minutos: number): string =>
  `${Math.floor(minutos / 60)}:${String(minutos % 60).padStart(2, '0')}`;
