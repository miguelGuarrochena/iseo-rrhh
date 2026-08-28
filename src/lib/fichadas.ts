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
import {
  diaEmpresa,
  hoyISO,
  horaEmpresa,
  sumarDiasEmpresa,
} from '@/lib/fechas';
import { Ausencia, Empleado, Feriado, Fichaje } from '@/types/rrhh';

/**
 * Hueco a partir del cual dos marcas pertenecen a jornadas distintas.
 *
 * Tiene que ser el mismo valor que `corte_jornada()` en la base: son
 * dos implementaciones de la misma regla y si divergen, la demo y
 * producción agrupan distinto. El test `probar-jornadas.mjs` lo
 * verifica contra un Postgres real.
 *
 * Seis horas está elegido entre dos cotas: el corte más largo DENTRO
 * de una jornada es el almuerzo (una o dos horas), y el descanso más
 * corto ENTRE jornadas son las 12 que exige la LCT (art. 197).
 */
export const CORTE_JORNADA_MS = 6 * 60 * 60 * 1000;

/**
 * Duración máxima plausible de una jornada abierta. Distingue a quien
 * está trabajando ahora de una jornada que quedó mal cargada.
 * Equivale a `max_jornada()` en la base.
 */
export const MAX_JORNADA_MS = 16 * 60 * 60 * 1000;

/**
 * Cuánto se le tolera a un reloj desajustado antes de considerar que una
 * marca viene del futuro. Espejo de `margen_reloj_fichaje()` en la base.
 *
 * Desde A04 la base impide crear marcas futuras, así que en datos nuevos
 * esto no se activa nunca. Está por las que puedan haber quedado de
 * antes: una marca del año que viene se ordena última y congelaba la
 * alternancia ingreso/egreso, además de pintar una "jornada activa" que
 * todavía no empezó.
 */
export const MARGEN_RELOJ_MS = 5 * 60 * 1000;

/** Una marca que todavía no ocurrió no puede describir el presente. */
const esFutura = (f: Fichaje, ahora: number): boolean =>
  new Date(f.timestamp).getTime() > ahora + MARGEN_RELOJ_MS;

/** Marcas vigentes: las anuladas no existen para el cálculo. */
const vigentes = (fichajes: Fichaje[]): Fichaje[] =>
  fichajes
    .filter((f) => !f.anuladoEn)
    .sort(
      (a, b) =>
        a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id)
    );

/**
 * Qué marca toca ahora: la misma regla que `tipo_de_marca_siguiente`
 * en la base. El cliente la usa para pintar el botón; el servidor es
 * quien inserta, y ignora un `p_tipo` que mande el empleado.
 *
 *   última es egreso, o no hay  → ingreso
 *   última es ingreso < 16 h    → egreso
 *   última es ingreso ≥ 16 h    → ingreso (la anterior queda incompleta)
 */
export const tipoDeMarcaSiguiente = (
  fichajes: Fichaje[],
  ahora: number = Date.now()
): 'ingreso' | 'egreso' => {
  // Sólo lo que ya pasó decide qué toca ahora: una marca fechada el año
  // que viene se ordenaba última y dejaba el botón clavado en "egreso"
  // hasta que llegara esa fecha.
  const marcas = vigentes(fichajes).filter((f) => !esFutura(f, ahora));
  const ultima = marcas[marcas.length - 1];
  if (!ultima || ultima.tipo !== 'ingreso') return 'ingreso';
  if (ahora - new Date(ultima.timestamp).getTime() < MAX_JORNADA_MS) {
    return 'egreso';
  }
  return 'ingreso';
};

/**
 * Minutos realmente fichados: suma de pares ingreso→egreso, más el
 * tramo abierto si la persona está adentro ahora. El almuerzo (egreso
 * y vuelta) no cuenta. Distinto de `Jornada.horas`, que es puerta a
 * puerta (7 a 16) porque así liquida la planta.
 */
export const minutosFichados = (
  fichajes: Fichaje[],
  ahora: number = Date.now()
): number => {
  const marcas = vigentes(fichajes);
  let total = 0;
  let abierto: string | null = null;
  marcas.forEach((m) => {
    if (m.tipo === 'ingreso') {
      abierto = m.timestamp;
      return;
    }
    if (m.tipo === 'egreso' && abierto) {
      total += minutosEntre(abierto, m.timestamp);
      abierto = null;
    }
  });
  if (abierto && ahora - new Date(abierto).getTime() < MAX_JORNADA_MS) {
    total += Math.round(
      Math.max(0, ahora - new Date(abierto).getTime()) / 60_000
    );
  }
  return total;
};

/**
 * Una jornada: una sesión de trabajo, no un día de calendario.
 *
 * La distinción importa: un turno que entra el lunes 22:00 y sale el
 * martes 06:00 es UNA jornada del lunes, no dos medias jornadas rotas.
 * Agrupar por fecha lo partía en dos y las dos mitades quedaban "sin
 * cerrar" y con cero horas.
 *
 * Es la unidad con la que razonan el historial, el Excel y los
 * reportes. La arma la base (`jornadas_de_empresa`) y, para los casos
 * donde ya se tienen las marcas en memoria, también `armarJornadas`.
 */
export interface Jornada {
  empleadoId: string;
  /** YYYY-MM-DD del ingreso, en hora local. */
  fecha: string;
  /** Ingreso que abre la jornada, ISO. */
  entrada?: string;
  /** Último egreso de la jornada, ISO. */
  salida?: string;
  /** Horas entre entrada y salida, con un decimal. */
  horas: number;
  /** Tiene entrada y salida. */
  cerrada: boolean;
  /**
   * Está abierta porque la persona sigue adentro, no porque falte
   * corregirla. Se separa de `incompleta` a propósito: quien entró hace
   * dos horas no es un error que haya que arreglar antes de liquidar.
   */
  enCurso: boolean;
  /** Falta la entrada o la salida, y no es alguien trabajando ahora. */
  incompleta: boolean;
  /** Cuántas marcas hubo (incluidas las intermedias del almuerzo). */
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

/**
 * Día de negocio (YYYY-MM-DD) al que pertenece una marca.
 *
 * Delega en `diaEmpresa`, que lee el instante en la zona de la empresa.
 * Antes esto usaba `getFullYear()/getMonth()/getDate()`, o sea el huso
 * del dispositivo: una marca de las 21:30 de Buenos Aires se agrupaba en
 * el día siguiente desde cualquier máquina en UTC, mientras la base
 * —que sí usa `zona_empresa()`— la seguía contando en el día correcto.
 * Las dos capas daban días distintos para la misma fila.
 */
export const diaLocal = (iso: string): string => diaEmpresa(iso);

/** "HH:MM" de un timestamp ISO, en la zona de la empresa. */
export const horaLocal = (iso: string): string => horaEmpresa(iso);

/**
 * Agrupa marcas sueltas en jornadas, en memoria.
 *
 * Espejo exacto de `jornadas_de_empresa` + `marcas_numeradas` en la
 * base, que es la que corre en producción. Esta versión queda para los
 * casos donde las marcas ya están en memoria —el fichaje del día, la
 * demo— y como referencia contra la que se compara la SQL.
 *
 * La regla: una marca abre jornada nueva si es un ingreso y (es la
 * primera de esa persona o pasó `CORTE_JORNADA_MS` desde la anterior).
 * Todo lo demás continúa la jornada abierta. Eso resuelve solo:
 *
 *   - Salida y vuelta del almuerzo → hueco corto, misma jornada.
 *   - Turno nocturno → una sola jornada, fechada el día que entró.
 *   - Se olvidó de fichar la salida → la jornada anterior queda
 *     abierta y la del día siguiente arranca aparte.
 *   - Egresos sin ingreso previo → jornada sin entrada.
 *
 * `ahora` se inyecta para poder testear `enCurso` sin depender del
 * reloj de la máquina.
 */
export const armarJornadas = (
  fichajes: Fichaje[],
  ahora: number = Date.now()
): Jornada[] =>
  agruparMarcas(fichajes, ahora)
    .map((g) => g.jornada)
    .sort(ordenJornadas);

/**
 * Jornadas de un período a partir de marcas que traen margen a los lados.
 *
 * Es el espejo en memoria de lo que hace `jornadas_de_empresa` en la
 * base: agrupa con el margen puesto y después se queda con las que
 * EMPIEZAN dentro del período, porque una jornada pertenece al período en
 * el que empezó (`where coalesce(entrada, primera) >= lo and < hi`).
 *
 * Vive acá y no en el servicio que la usa porque es la regla de recorte,
 * no un detalle de una consulta. Los cálculos en memoria la salteaban:
 * pedían las marcas ya recortadas al período y recién ahí agrupaban, así
 * que una jornada 31/01 22:00 → 01/02 07:30 quedaba partida en dos
 * mitades huérfanas —una en cada mes, las dos con cero horas y las dos
 * marcadas incompletas— y sus horas extras desaparecían del número que se
 * ofrece sumar al bruto en la liquidación.
 *
 * Quien llama tiene que haber pedido las marcas con al menos un día de
 * margen a cada lado; sin eso no hay nada que recortar.
 */
export const jornadasDelPeriodo = (
  marcas: Fichaje[],
  desde: string,
  hasta: string,
  ahora: number = Date.now()
): Jornada[] =>
  armarJornadas(marcas, ahora).filter(
    (j) => j.fecha >= desde && j.fecha <= hasta
  );

export type EstadoJornadaVista =
  | 'sin_iniciar'
  | 'activa'
  | 'pausada'
  | 'incompleta';

/**
 * Cuánto hacia atrás se traen marcas para pintar el estado de jornada
 * del empleado: cubre turno noche y una jornada incompleta del día
 * anterior. El tipo lo decide el servidor con todo el historial.
 */
export const VENTANA_ESTADO_MS = 3 * 24 * 60 * 60 * 1000;

export const desdeEstadoIso = (ahora: number = Date.now()): string =>
  new Date(ahora - VENTANA_ESTADO_MS).toISOString();

/**
 * Cuántos días hacia atrás se buscan jornadas sin cerrar.
 *
 * Dos semanas: alcanza para que una salida sin fichar aparezca varias
 * veces antes de que se liquide el mes, y no tanto como para arrastrar
 * para siempre incidencias viejas que ya nadie va a corregir.
 *
 * Lo miran la pantalla de Fichaje y el aviso de Inicio, así que el
 * número vive acá: si cada una eligiera el suyo, el tablero diría una
 * cantidad y la lista mostraría otra.
 */
export const DIAS_INCIDENCIAS = 14;

/** Primer día de la ventana de incidencias, en la zona de la empresa. */
export const desdeIncidencias = (ahora: Date = new Date()): string =>
  sumarDiasEmpresa(hoyISO(ahora), -DIAS_INCIDENCIAS);

/**
 * Cómo se le muestra la jornada a la persona. Se deriva de las marcas
 * persistidas, no de un flag en el navegador.
 *
 * Una jornada cerrada hace menos de `CORTE_JORNADA_MS` es una pausa
 * (almuerzo, salida corta). Pasado ese hueco, es otra sesión: "no
 * iniciaste" aunque ayer haya cerrado bien.
 */
export const estadoJornadaVista = (
  fichajes: Fichaje[],
  ahora: number = Date.now()
): {
  estado: EstadoJornadaVista;
  jornada?: Jornada;
  siguiente: 'ingreso' | 'egreso';
} => {
  const jornadas = armarJornadas(fichajes, ahora);
  const jornada = jornadas[jornadas.length - 1];
  const siguiente = tipoDeMarcaSiguiente(fichajes, ahora);
  if (!jornada) return { estado: 'sin_iniciar', siguiente };
  if (jornada.enCurso) return { estado: 'activa', jornada, siguiente };
  if (jornada.incompleta) return { estado: 'incompleta', jornada, siguiente };
  if (jornada.cerrada) {
    const marcas = vigentes(fichajes);
    const ultima = marcas[marcas.length - 1];
    const hueco = ultima
      ? ahora - new Date(ultima.timestamp).getTime()
      : CORTE_JORNADA_MS;
    if (hueco < CORTE_JORNADA_MS) {
      return { estado: 'pausada', jornada, siguiente };
    }
  }
  return { estado: 'sin_iniciar', jornada, siguiente };
};

/** Minutos a "08h 09m", para el total trabajado en pantalla. */
export const minutosAHorasMinutos = (minutos: number): string => {
  const n = Math.max(0, Math.round(minutos));
  const h = Math.floor(n / 60);
  const m = n % 60;
  return `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m`;
};

/**
 * Igual que `armarJornadas`, pero devolviendo también qué marcas
 * componen cada jornada.
 *
 * Hace falta para responder "¿esta marca pertenece a una jornada sin
 * cerrar?", que es lo que necesita el listado de movimientos. En la
 * base eso lo resuelve `fichajes_del_periodo`.
 */
export const agruparMarcas = (
  fichajes: Fichaje[],
  ahora: number = Date.now()
): { jornada: Jornada; marcas: Fichaje[] }[] => {
  const porEmpleado = new Map<string, Fichaje[]>();
  /**
   * El descarte de anuladas va acá y no en cada llamador, por la misma
   * razón por la que en la base va dentro de `marcas_numeradas`: éste es
   * el único lugar donde las marcas se convierten en jornadas, así que
   * filtrar acá cubre de una sola vez a `armarJornadas`,
   * `estadoJornadaVista`, `controlarTurno` y todo lo que venga después.
   *
   * Antes cada consulta se acordaba de poner `anulado_en is null` en el
   * `select` —y una no se acordaba (`getFichajesDeEmpleado`), con lo que
   * la pantalla de Turnos seguía contando llegadas tarde de marcas que
   * RRHH ya había anulado. Con el filtro acá, olvidarse deja de ser
   * posible.
   */
  vigentes(fichajes).forEach((f) => {
    const previas = porEmpleado.get(f.empleadoId);
    if (previas) previas.push(f);
    else porEmpleado.set(f.empleadoId, [f]);
  });

  const grupos: { jornada: Jornada; marcas: Fichaje[] }[] = [];

  porEmpleado.forEach((marcasDelEmpleado, empleadoId) => {
    // El orden tiene que ser total (ts y después id), igual que en la
    // base: con dos marcas en el mismo instante, un orden inestable
    // cambia a qué jornada va cada una.
    const marcas = [...marcasDelEmpleado].sort(
      (a, b) =>
        a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id)
    );

    let grupo: Fichaje[] = [];
    const cerrarGrupo = () => {
      if (grupo.length > 0) {
        grupos.push({
          jornada: aJornada(empleadoId, grupo, ahora),
          marcas: grupo,
        });
      }
      grupo = [];
    };

    marcas.forEach((m, i) => {
      const previa = marcas[i - 1];
      const huecoLargo =
        !previa ||
        new Date(m.timestamp).getTime() -
          new Date(previa.timestamp).getTime() >=
          CORTE_JORNADA_MS;
      if (m.tipo === 'ingreso' && huecoLargo) cerrarGrupo();
      grupo.push(m);
    });
    cerrarGrupo();
  });

  return grupos;
};

/** Colapsa las marcas de una jornada en la fila que consume la app. */
const aJornada = (
  empleadoId: string,
  marcas: Fichaje[],
  ahora: number
): Jornada => {
  const entrada = marcas.find((m) => m.tipo === 'ingreso');
  const salida = [...marcas].reverse().find((m) => m.tipo === 'egreso');
  /**
   * Cierra si la ÚLTIMA marca es un egreso, no si hay alguno suelto en
   * el medio. La diferencia importa en un caso muy común: entró a las
   * 7, salió a almorzar a las 12, volvió 12:30 y no fichó la salida.
   * Tiene ingreso y egreso, pero la jornada quedó abierta.
   */
  const cerrada =
    Boolean(entrada) && marcas[marcas.length - 1].tipo === 'egreso';
  // Abierta pero reciente: la persona está adentro ahora mismo.
  //
  // La cota inferior además de la superior: sin ella, una jornada que
  // empieza en el futuro daba una diferencia negativa —menor que el
  // máximo— y se mostraba como "Jornada activa" antes de empezar.
  const desdeEntrada = entrada
    ? ahora - new Date(entrada.timestamp).getTime()
    : Number.NaN;
  const enCurso =
    Boolean(entrada) &&
    !cerrada &&
    desdeEntrada >= -MARGEN_RELOJ_MS &&
    desdeEntrada < MAX_JORNADA_MS;
  return {
    empleadoId,
    // La jornada se fecha por su ingreso; si no hay (egreso huérfano),
    // por la primera marca que tenga.
    fecha: diaLocal((entrada ?? marcas[0]).timestamp),
    entrada: entrada?.timestamp,
    salida: salida?.timestamp,
    horas: horasEntre(entrada?.timestamp, salida?.timestamp),
    cerrada,
    enCurso,
    incompleta: !cerrada && !enCurso,
    marcas: marcas.length,
    fueraDeZona: marcas.some((m) => m.fueraDeZona),
  };
};

/** Orden estable: por día y, dentro del día, por hora de entrada. */
export const ordenJornadas = (a: Jornada, b: Jornada): number =>
  a.fecha.localeCompare(b.fecha) ||
  (a.entrada ?? '').localeCompare(b.entrada ?? '');

/**
 * Todos los días del rango, inclusive, como YYYY-MM-DD.
 *
 * La cuenta va en UTC: son días de calendario, y anclarlos al huso del
 * dispositivo hacía que en una zona con horario de verano el día del
 * salto se duplicara o se salteara en la planilla.
 */
export const diasDelRango = (desde: string, hasta: string): string[] => {
  const dias: string[] = [];
  const aUTC = (f: string) => {
    const [anio, mes, dia] = f.split('-').map(Number);
    return Date.UTC(anio, (mes || 1) - 1, dia || 1);
  };
  const d = new Date(aUTC(desde));
  const fin = aUTC(hasta);
  // Cota de seguridad: un rango mal tipeado (año 2206) no debe colgar la
  // pantalla armando cien mil columnas.
  while (d.getTime() <= fin && dias.length < 400) {
    const mes = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dia = String(d.getUTCDate()).padStart(2, '0');
    dias.push(`${d.getUTCFullYear()}-${mes}-${dia}`);
    d.setUTCDate(d.getUTCDate() + 1);
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
  const [anio, mes, dia] = fechaISO.split('-').map(Number);
  // UTC por lo mismo que `diasDelRango`: el nombre del día de una fecha
  // de calendario no puede cambiar según dónde esté la computadora.
  const d = new Date(Date.UTC(anio, (mes || 1) - 1, dia || 1));
  return `${d.getUTCDate()}-${NOMBRE_MES[d.getUTCMonth()]} ${NOMBRE_DIA[d.getUTCDay()]}`;
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
  /** Le falta entrada o salida y hay que corregirla. */
  incompleta: boolean;
  /** Abierta porque la persona sigue trabajando: no es un error. */
  enCurso: boolean;
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
/**
 * Orden en el que se listan las personas en el resumen: apellido y
 * nombre, con el criterio del castellano (la ñ después de la n).
 *
 * Se exporta porque la pantalla pagina la lista ANTES de armar el
 * resumen —para pedirle a la base sólo las jornadas de la página— y las
 * dos cosas tienen que ordenar igual. Si no, la página 2 no es "los
 * siguientes quince alfabéticamente" sino quince cualesquiera.
 */
export const ordenPorApellido = (a: Empleado, b: Empleado): number =>
  `${a.apellido} ${a.nombre}`.localeCompare(`${b.apellido} ${b.nombre}`, 'es');

export const armarResumen = (
  desde: string,
  hasta: string,
  empleados: Empleado[],
  /**
   * Ya agrupadas por sesión (puede haber varias el mismo día). Antes
   * se asumía una sola por empleado/día y un `Map.set` descartaba las
   * sesiones anteriores: un turno partido de 8 h aparecía como 4.
   */
  jornadas: Jornada[],
  ausencias: Ausencia[] = [],
  feriados: Feriado[] = []
): Resumen => {
  const dias = diasDelRango(desde, hasta);
  const porEmpleadoDia = new Map<string, Jornada[]>();
  jornadas.forEach((j) => {
    const clave = `${j.empleadoId}|${j.fecha}`;
    const previas = porEmpleadoDia.get(clave);
    if (previas) previas.push(j);
    else porEmpleadoDia.set(clave, [j]);
  });

  const fechasFeriado = new Set(feriados.map((f) => f.fecha));
  const aprobadas = ausencias.filter((a) => a.estado === 'aprobada');

  const filas = empleados
    .map((empleado): FilaResumen => {
      const celdas = dias.map((fecha): CeldaDia => {
        const sesiones = porEmpleadoDia.get(`${empleado.id}|${fecha}`) ?? [];
        // Primera entrada / última salida del día; minutos = suma de
        // cada sesión cerrada (no el intervalo bruto entre extremos,
        // que contaría el hueco del medio como trabajado).
        const entradas = sesiones
          .map((j) => j.entrada)
          .filter((t): t is string => Boolean(t))
          .sort();
        const salidas = sesiones
          .map((j) => j.salida)
          .filter((t): t is string => Boolean(t))
          .sort();
        const minutos = sesiones.reduce(
          (acc, j) => acc + minutosEntre(j.entrada, j.salida),
          0
        );
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
          entrada: entradas[0],
          salida: salidas[salidas.length - 1],
          horas: Math.round((minutos / 60) * 10) / 10,
          minutos,
          // Contó como trabajado si alguna sesión del día cerró.
          diaTrabajado: sesiones.some((j) => j.cerrada) ? 1 : 0,
          incompleta: sesiones.some((j) => j.incompleta),
          enCurso: sesiones.some((j) => j.enCurso),
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
    .sort((a, b) => ordenPorApellido(a.empleado, b.empleado));

  return { desde, hasta, dias, filas };
};

/** Minutos a "H:MM", que es como se leen en una planilla. */
export const minutosAHhMm = (minutos: number): string =>
  `${Math.floor(minutos / 60)}:${String(minutos % 60).padStart(2, '0')}`;
