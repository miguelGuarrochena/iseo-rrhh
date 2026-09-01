/**
 * Estado de RRHH: lo que `requisitos.ts` ya sabe, ordenado para que se
 * pueda mirar de arriba.
 *
 * `requisitos.ts` sigue siendo la única fuente de verdad de QUÉ falta,
 * con qué severidad y cómo se arregla. Acá no hay ni una regla nueva:
 * este módulo sólo agrupa las faltas por área, cuenta y saca porcentajes
 * para que la pantalla pueda responder "¿está todo bien?" sin que quien
 * mira tenga que abrir cuarenta fichas.
 *
 * Es lógica pura: entra gente y configuración, sale un resumen. Sin
 * base y sin React, así que se testea sola.
 */
import { Empleado, Empresa } from '@/types/rrhh';
import {
  Ambito,
  ContextoEmpleado,
  Falta,
  ambitosDeFalta,
  faltasDeEmpleado,
  faltasDeEmpresa,
} from '@/lib/requisitos';
import { moduloActivo, ModuloOpcional } from '@/components/app/navItems';

export type ClaveArea =
  | 'accesos'
  | 'liquidacion'
  | 'contratos'
  | 'fichaje'
  | 'organigrama'
  | 'empresa';

/**
 * Cómo se agrupan los ámbitos de `requisitos.ts` en áreas de producto.
 *
 * El orden importa: una falta cae en la PRIMERA área que la toca, así no
 * se cuenta dos veces. "Sin cuenta" pega en cuenta, recibos, firma y
 * comunicaciones a la vez; el problema de fondo es el acceso, y ahí es
 * donde se resuelve. Contarla también en Liquidación diría que hay dos
 * pendientes donde hay uno.
 *
 * `modulos` es "para qué empresa tiene sentido esta área". Si la empresa
 * apagó todas las secciones de las que depende, el área no se muestra:
 * un 0% de fichaje en una empresa que no ficha no es un dato malo, es un
 * dato que no existe (mismo criterio que ya usan Inicio y Reportes).
 */
export interface AreaInfo {
  clave: ClaveArea;
  etiqueta: string;
  /** Qué mide el área, en una línea. */
  descripcion: string;
  /** Ámbitos de `requisitos.ts` que caen acá. */
  ambitos: Ambito[];
  /** Secciones que la justifican. Vacío = siempre se muestra. */
  modulos: ModuloOpcional[];
}

export const AREAS: AreaInfo[] = [
  {
    clave: 'accesos',
    etiqueta: 'Accesos',
    descripcion:
      'Quién puede entrar a la app, ver lo suyo, firmar y recibir avisos.',
    ambitos: ['cuenta', 'firma', 'comunicaciones'],
    modulos: [],
  },
  {
    clave: 'liquidacion',
    etiqueta: 'Liquidación y pagos',
    descripcion:
      'Los datos que hacen falta para liquidar, depositar y repartir los recibos.',
    ambitos: ['pagos', 'recibos'],
    modulos: ['remuneraciones', 'recibos'],
  },
  {
    clave: 'contratos',
    etiqueta: 'Contratos',
    descripcion: 'Modalidades y vencimientos que tienen que estar cargados.',
    ambitos: ['contrato'],
    modulos: [],
  },
  {
    clave: 'fichaje',
    etiqueta: 'Fichaje',
    descripcion: 'Quién puede marcar entrada y salida, y desde dónde.',
    ambitos: ['fichaje'],
    modulos: ['fichaje'],
  },
  {
    clave: 'organigrama',
    etiqueta: 'Organigrama',
    descripcion:
      'De quién depende cada persona y a quién le llegan sus pedidos.',
    ambitos: ['organigrama'],
    modulos: ['organigrama'],
  },
  {
    clave: 'empresa',
    etiqueta: 'Datos de la empresa',
    descripcion: 'La configuración de la que depende el resto.',
    ambitos: [],
    modulos: [],
  },
];

/** Un legajo con lo que le falta en un área. */
export interface ItemArea {
  empleadoId: string;
  nombre: string;
  faltas: Falta[];
}

export interface AreaEstado extends AreaInfo {
  /** Legajos activos evaluados en el área. */
  evaluados: number;
  /** De esos, cuántos tienen al menos un pendiente. */
  conPendientes: number;
  /** Total de pendientes del área (una persona puede tener varios). */
  pendientes: number;
  /** Alguno frena una acción (severidad `bloquea`). */
  bloquea: boolean;
  /**
   * Legajos sin pendientes sobre los evaluados.
   *
   * `undefined` cuando el área no se mide por persona (los datos de la
   * empresa son una sola configuración, no una proporción) o cuando no
   * hay a quién evaluar: un 100% sobre cero legajos es una afirmación
   * que no se puede sostener.
   */
  cumplimientoPct?: number;
  /** Personas con pendientes, para el detalle. */
  items: ItemArea[];
  /** Faltas de configuración (sólo el área `empresa`). */
  faltasEmpresa: Falta[];
}

/**
 * Qué tan bien está la empresa, de un vistazo.
 *
 * - `urgente`: hay algo que frena una acción y alguien no puede trabajar.
 * - `atencion`: hay pendientes, pero nada roto.
 * - `bien`: no falta nada de lo que el sistema sabe controlar.
 */
export type NivelEstado = 'bien' | 'atencion' | 'urgente';

export interface EstadoRrhh {
  nivel: NivelEstado;
  /** Legajos activos evaluados. */
  evaluados: number;
  /** Personas con al menos un pendiente, en cualquier área. */
  personasConPendientes: number;
  /** Pendientes totales, incluidos los de configuración de la empresa. */
  pendientes: number;
  /** De esos, cuántos frenan una acción. */
  bloqueantes: number;
  /** Legajos sin ningún pendiente sobre los evaluados. */
  cumplimientoPct?: number;
  /** Sólo las áreas que aplican a esta empresa. */
  areas: AreaEstado[];
}

export interface EntradaEstadoRrhh {
  /** La dotación. Las bajas se descartan acá adentro. */
  empleados: Empleado[];
  empresa?: Empresa;
  /**
   * Ids con cuenta de usuario. `undefined` = todavía no se consultó, y
   * entonces la regla no dispara — mismo criterio que `ContextoEmpleado`:
   * un pendiente inventado es peor que ninguno.
   */
  empleadosConCuenta?: Set<string>;
  /** Ids con al menos una remuneración cargada. `undefined` = no se sabe. */
  empleadosConSueldo?: Set<string>;
  /** Módulos encendidos de la empresa, para no medir lo que no se usa. */
  modulos?: Record<string, boolean>;
}

/** El área a la que pertenece una falta: la primera que toca alguno de sus ámbitos. */
export const areaDeFalta = (clave: string): ClaveArea | undefined => {
  const ambitos = ambitosDeFalta(clave);
  if (ambitos.length === 0) return undefined;
  return AREAS.find((a) => a.ambitos.some((am) => ambitos.includes(am)))?.clave;
};

/** ¿La empresa usa alguna de las secciones que justifican el área? */
const areaAplica = (
  area: AreaInfo,
  modulos?: Record<string, boolean>
): boolean =>
  area.modulos.length === 0 ||
  area.modulos.some((m) => moduloActivo(m, modulos));

const porcentaje = (parte: number, total: number): number =>
  Math.round((parte / total) * 100);

const nombreDe = (e: Empleado): string => `${e.nombre} ${e.apellido}`;

export const calcularEstadoRrhh = (entrada: EntradaEstadoRrhh): EstadoRrhh => {
  const { empresa, empleadosConCuenta, empleadosConSueldo, modulos } = entrada;
  const activos = entrada.empleados.filter((e) => e.activo);

  const contextoDe = (e: Empleado): ContextoEmpleado => ({
    tieneCuenta: empleadosConCuenta ? empleadosConCuenta.has(e.id) : undefined,
    tieneSueldo: empleadosConSueldo ? empleadosConSueldo.has(e.id) : undefined,
  });

  // Una sola pasada por el catálogo por persona. Después se reparte.
  const faltasPorEmpleado = new Map<string, Falta[]>(
    activos.map((e) => [e.id, faltasDeEmpleado(e, contextoDe(e))])
  );

  const faltasEmpresa = empresa ? faltasDeEmpresa(empresa) : [];

  const aplicables = AREAS.filter((a) => areaAplica(a, modulos));
  const clavesAplicables = new Set(aplicables.map((a) => a.clave));

  const areas: AreaEstado[] = aplicables.map((info) => {
    if (info.clave === 'empresa') {
      return {
        ...info,
        evaluados: 0,
        conPendientes: faltasEmpresa.length > 0 ? 1 : 0,
        pendientes: faltasEmpresa.length,
        bloquea: faltasEmpresa.some((f) => f.severidad === 'bloquea'),
        cumplimientoPct: undefined,
        items: [],
        faltasEmpresa,
      };
    }

    const items: ItemArea[] = [];
    let pendientes = 0;
    let bloquea = false;
    for (const e of activos) {
      const propias = (faltasPorEmpleado.get(e.id) ?? []).filter(
        (f) => areaDeFalta(f.clave) === info.clave
      );
      if (propias.length === 0) continue;
      items.push({ empleadoId: e.id, nombre: nombreDe(e), faltas: propias });
      pendientes += propias.length;
      bloquea = bloquea || propias.some((f) => f.severidad === 'bloquea');
    }

    return {
      ...info,
      evaluados: activos.length,
      conPendientes: items.length,
      pendientes,
      bloquea,
      cumplimientoPct:
        activos.length > 0
          ? porcentaje(activos.length - items.length, activos.length)
          : undefined,
      items,
      faltasEmpresa: [],
    };
  });

  /**
   * El total no es la suma de las áreas: una persona a la que le falta
   * el CBU y el supervisor aparece en dos áreas y es una sola persona
   * con pendientes. Y las faltas de áreas que la empresa no usa —el
   * rostro sin enrolar de una empresa que apagó Fichaje— no se cuentan
   * en ningún lado, para que el número de arriba coincida con lo que se
   * ve abajo.
   */
  const enAreasAplicables = (faltas: Falta[]): Falta[] =>
    faltas.filter((f) => {
      const area = areaDeFalta(f.clave);
      return area !== undefined && clavesAplicables.has(area);
    });

  const personasConPendientes = activos.filter(
    (e) => enAreasAplicables(faltasPorEmpleado.get(e.id) ?? []).length > 0
  ).length;

  const faltasContadas = activos.flatMap((e) =>
    enAreasAplicables(faltasPorEmpleado.get(e.id) ?? [])
  );
  const todas = [...faltasContadas, ...faltasEmpresa];
  const bloqueantes = todas.filter((f) => f.severidad === 'bloquea').length;

  const nivel: NivelEstado =
    bloqueantes > 0 ? 'urgente' : todas.length > 0 ? 'atencion' : 'bien';

  return {
    nivel,
    evaluados: activos.length,
    personasConPendientes,
    pendientes: todas.length,
    bloqueantes,
    cumplimientoPct:
      activos.length > 0
        ? porcentaje(activos.length - personasConPendientes, activos.length)
        : undefined,
    areas,
  };
};

/**
 * Lo que hay que resolver primero, ya agrupado por falta y ordenado.
 *
 * Primero lo que frena, después lo que más gente afecta. Es la lista de
 * "qué puedo solucionar ahora": cada fila lleva a la pantalla donde se
 * arregla.
 */
export interface SituacionAgrupada {
  falta: Falta;
  /** Nombres afectados, para poder decir a quiénes. */
  nombres: string[];
  area?: ClaveArea;
}

export const situacionesPrioritarias = (
  estado: EstadoRrhh,
  limite = 5
): SituacionAgrupada[] => {
  const porClave = new Map<string, SituacionAgrupada>();
  for (const area of estado.areas) {
    for (const item of area.items) {
      for (const f of item.faltas) {
        const previa = porClave.get(f.clave);
        if (previa) previa.nombres.push(item.nombre);
        else
          porClave.set(f.clave, {
            falta: f,
            nombres: [item.nombre],
            area: area.clave,
          });
      }
    }
    for (const f of area.faltasEmpresa) {
      if (!porClave.has(f.clave)) {
        porClave.set(f.clave, { falta: f, nombres: [], area: area.clave });
      }
    }
  }
  return [...porClave.values()]
    .sort((a, b) => {
      const frena =
        Number(b.falta.severidad === 'bloquea') -
        Number(a.falta.severidad === 'bloquea');
      if (frena !== 0) return frena;
      return b.nombres.length - a.nombres.length;
    })
    .slice(0, limite);
};
