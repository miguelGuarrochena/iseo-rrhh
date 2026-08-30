/**
 * Novedades del mes: todo lo que pasó en un período y que RRHH debería
 * mirar antes de mandarle las novedades al contador.
 *
 * No es una liquidación y no pretende serlo. Acá no se calcula ningún
 * sueldo: se junta lo que ya está cargado en la app —altas, bajas,
 * licencias, extras aprobadas, adelantos, descuentos, cambios de
 * sueldo— y se ordena por categoría para poder revisarlo de una sentada.
 *
 * Es lógica pura: entra lo que trajo el servicio, sale la lista. Sin
 * base y sin React.
 */
import {
  Adelanto,
  Ausencia,
  DescuentoRecurrente,
  Empleado,
  Remuneracion,
  TipoAusencia,
} from '@/types/rrhh';
import { TIPOS_AUSENCIA_JORNADA, tipoAusenciaLabels } from '@/lib/etiquetas';
import {
  diasEntre,
  finDeMesEmpresa,
  formatearFechaCivil,
  sumarMesesEmpresa,
} from '@/lib/fechas';
import { moduloActivo, ModuloOpcional } from '@/components/app/navItems';

export type ClaveNovedad =
  | 'altas'
  | 'bajas'
  | 'ausencias'
  | 'jornada'
  | 'sin_cerrar'
  | 'extras'
  | 'adelantos'
  | 'descuentos'
  | 'sueldos';

export type Unidad = 'pesos' | 'horas' | 'dias';

/**
 * Cómo pega la licencia en lo que la empresa paga ese mes.
 *
 * Sólo se afirma lo que la ley dice sin ambigüedad. Todo lo demás queda
 * como `con_goce`, que es el default de la LCT: las licencias especiales
 * del art. 158 y las vacaciones del art. 150 son pagas.
 *
 * - `sin_goce`: excedencia (art. 183 inc. c). El período no se remunera.
 * - `anses`: maternidad (art. 177). El empleador no paga sueldo; la
 *   trabajadora percibe la asignación por maternidad. No es "sin goce",
 *   pero tampoco sale de la liquidación de la empresa, y confundir las
 *   dos cosas en la planilla del contador es justo lo que se quiere
 *   evitar.
 * - `con_goce`: el resto.
 *
 * Esto no decide nada ni cambia ningún cálculo: es una etiqueta para
 * que quien revisa sepa qué mirar.
 */
export type Goce = 'con_goce' | 'sin_goce' | 'anses';

const GOCE_POR_TIPO: Partial<Record<TipoAusencia, Goce>> = {
  excedencia: 'sin_goce',
  maternidad: 'anses',
};

export const goceDeAusencia = (tipo: TipoAusencia): Goce =>
  GOCE_POR_TIPO[tipo] ?? 'con_goce';

export const GOCE_LABELS: Record<Goce, string> = {
  con_goce: 'Con goce de sueldo',
  sin_goce: 'Sin goce de sueldo',
  anses: 'Paga ANSES (maternidad)',
};

export interface ItemNovedad {
  /** Estable dentro de la categoría: sirve de key y para los tests. */
  id: string;
  empleadoId: string;
  nombre: string;
  /** Qué pasó, en una línea. */
  detalle: string;
  valor?: number;
  unidad?: Unidad;
  /** Etiqueta extra (el goce de una licencia, el tipo de contrato). */
  nota?: string;
  ruta?: string;
}

export interface CategoriaNovedad {
  clave: ClaveNovedad;
  etiqueta: string;
  /** Qué junta esta categoría y por qué le importa al contador. */
  descripcion: string;
  items: ItemNovedad[];
  /** Suma de los valores, cuando sumarlos significa algo. */
  total?: number;
  unidad?: Unidad;
  /**
   * Hay algo que resolver antes de cerrar, no sólo algo que informar.
   * Una jornada sin cerrar es un dato que falta; una alta no.
   */
  requiereAtencion: boolean;
  /** Dónde se gestiona esto. */
  ruta: string;
  /** Sección de la que depende. Si está apagada, la categoría no aparece. */
  modulo?: ModuloOpcional;
}

export interface NovedadesPeriodo {
  periodo: string;
  categorias: CategoriaNovedad[];
  /** Novedades detectadas en total. */
  total: number;
  /** Categorías con algo que resolver antes de cerrar. */
  requierenAtencion: number;
}

/** Lo mínimo que hace falta de cada jornada del período. */
export interface JornadaDelPeriodo {
  empleadoId: string;
  fecha: string;
  /** Extras que el supervisor aprobó en Turnos (las únicas que se pagan). */
  horasExtrasAprobadas: number;
  /** Falta una marca: entró y no salió, o al revés. */
  incompleta: boolean;
}

export interface DatosNovedades {
  /** YYYY-MM */
  periodo: string;
  /** Toda la dotación, incluidas las bajas: el mes puede tener las dos. */
  empleados: Empleado[];
  /** Las que tocan el período (aprobadas y pendientes). */
  ausencias: Ausencia[];
  /** Las del período y las del anterior, para detectar cambios de sueldo. */
  remuneraciones: Remuneracion[];
  adelantos: Adelanto[];
  descuentos: DescuentoRecurrente[];
  jornadas: JornadaDelPeriodo[];
  modulos?: Record<string, boolean>;
}

const redondear1 = (n: number): number => Math.round(n * 10) / 10;

const fechaCorta = (iso: string): string =>
  formatearFechaCivil(iso, { day: 'numeric', month: 'short' });

/** Días de la ausencia que caen dentro del período. */
export const diasEnPeriodo = (
  a: Pick<Ausencia, 'fechaDesde' | 'fechaHasta'>,
  periodo: string
): number => {
  const inicio = `${periodo}-01`;
  const fin = finDeMesEmpresa(periodo);
  const desde = a.fechaDesde > inicio ? a.fechaDesde : inicio;
  const hasta = a.fechaHasta < fin ? a.fechaHasta : fin;
  if (hasta < desde) return 0;
  return diasEntre(desde, hasta);
};

const enPeriodo = (fecha: string | undefined, periodo: string): boolean =>
  Boolean(fecha) && (fecha as string).slice(0, 7) === periodo;

/**
 * Arma las categorías del período.
 *
 * Cada categoría sale de datos que ya existen en la app. Nada se
 * estima: si un dato no está cargado, la categoría queda vacía y lo
 * dice, en vez de rellenar con un supuesto.
 */
export const armarNovedades = (datos: DatosNovedades): NovedadesPeriodo => {
  const { periodo, modulos } = datos;
  const nombrePorId = new Map(
    datos.empleados.map((e) => [e.id, `${e.nombre} ${e.apellido}`])
  );
  const nombreDe = (id: string): string => nombrePorId.get(id) ?? '—';
  const fichaDe = (id: string) => `/colaboradores/${id}`;

  // ---------- Altas y bajas ----------
  const altas = datos.empleados
    .filter((e) => enPeriodo(e.fechaIngreso, periodo))
    .sort((a, b) => a.fechaIngreso.localeCompare(b.fechaIngreso))
    .map(
      (e): ItemNovedad => ({
        id: `alta-${e.id}`,
        empleadoId: e.id,
        nombre: `${e.nombre} ${e.apellido}`,
        detalle: `Ingresó el ${fechaCorta(e.fechaIngreso)} como ${e.puesto}`,
        nota: e.modalidadContratacion.replace(/_/g, ' '),
        ruta: fichaDe(e.id),
      })
    );

  const bajas = datos.empleados
    .filter((e) => enPeriodo(e.fechaBaja, periodo))
    .sort((a, b) => (a.fechaBaja ?? '').localeCompare(b.fechaBaja ?? ''))
    .map(
      (e): ItemNovedad => ({
        id: `baja-${e.id}`,
        empleadoId: e.id,
        nombre: `${e.nombre} ${e.apellido}`,
        detalle: `Baja el ${fechaCorta(e.fechaBaja as string)}`,
        nota: e.motivoBaja || undefined,
        ruta: fichaDe(e.id),
      })
    );

  // ---------- Licencias ----------
  //
  // Las parciales de jornada (entrada tarde, home office) no son
  // licencias: van a su propia categoría. Es el mismo corte que ya hace
  // el ausentismo de Reportes, con la misma constante.
  const esDeJornada = (tipo: TipoAusencia): boolean =>
    (TIPOS_AUSENCIA_JORNADA as TipoAusencia[]).includes(tipo);

  const aprobadasDelPeriodo = datos.ausencias.filter(
    (a) => a.estado === 'aprobada' && diasEnPeriodo(a, periodo) > 0
  );

  const ausencias = aprobadasDelPeriodo
    .filter((a) => !esDeJornada(a.tipo))
    .sort((a, b) => a.fechaDesde.localeCompare(b.fechaDesde))
    .map((a): ItemNovedad => {
      const dias = diasEnPeriodo(a, periodo);
      return {
        id: `aus-${a.id}`,
        empleadoId: a.empleadoId,
        nombre: nombreDe(a.empleadoId),
        detalle: `${tipoAusenciaLabels[a.tipo]} · ${fechaCorta(a.fechaDesde)} al ${fechaCorta(a.fechaHasta)}`,
        valor: dias,
        unidad: 'dias',
        nota: GOCE_LABELS[goceDeAusencia(a.tipo)],
        ruta: '/ausencias',
      };
    });

  const jornada = aprobadasDelPeriodo
    .filter((a) => esDeJornada(a.tipo))
    .sort((a, b) => a.fechaDesde.localeCompare(b.fechaDesde))
    .map(
      (a): ItemNovedad => ({
        id: `jor-${a.id}`,
        empleadoId: a.empleadoId,
        nombre: nombreDe(a.empleadoId),
        detalle: `${tipoAusenciaLabels[a.tipo]} · ${fechaCorta(a.fechaDesde)}${
          a.fechaHasta !== a.fechaDesde ? ` al ${fechaCorta(a.fechaHasta)}` : ''
        }`,
        ruta: '/ausencias',
      })
    );

  // ---------- Fichaje ----------
  const sinCerrar = datos.jornadas
    .filter((j) => j.incompleta)
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map(
      (j): ItemNovedad => ({
        id: `sc-${j.empleadoId}-${j.fecha}`,
        empleadoId: j.empleadoId,
        nombre: nombreDe(j.empleadoId),
        detalle: `${fechaCorta(j.fecha)}: falta una marca`,
        ruta: '/fichaje',
      })
    );

  const extrasPorEmpleado = new Map<string, number>();
  for (const j of datos.jornadas) {
    if (j.horasExtrasAprobadas <= 0) continue;
    extrasPorEmpleado.set(
      j.empleadoId,
      (extrasPorEmpleado.get(j.empleadoId) ?? 0) + j.horasExtrasAprobadas
    );
  }
  const extras = [...extrasPorEmpleado.entries()]
    .map(([empleadoId, horas]): ItemNovedad => {
      const total = redondear1(horas);
      return {
        id: `ext-${empleadoId}`,
        empleadoId,
        nombre: nombreDe(empleadoId),
        detalle: `${total} ${total === 1 ? 'hora extra aprobada' : 'horas extras aprobadas'}`,
        valor: total,
        unidad: 'horas',
        ruta: '/turnos',
      };
    })
    .sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0));

  // ---------- Adelantos y descuentos ----------
  const adelantos = datos.adelantos
    .filter((a) => a.estado === 'aprobado' && a.periodo === periodo)
    .map(
      (a): ItemNovedad => ({
        id: `ade-${a.id}`,
        empleadoId: a.empleadoId,
        nombre: nombreDe(a.empleadoId),
        detalle: a.motivo?.trim()
          ? `Adelanto aprobado · ${a.motivo.trim()}`
          : 'Adelanto aprobado',
        valor: a.monto,
        unidad: 'pesos',
        ruta: '/remuneraciones',
      })
    )
    .sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0));

  /**
   * Los descuentos recurrentes se arrastran todos los meses; la NOVEDAD
   * es el que se dio de alta este mes, que es lo que el contador todavía
   * no tiene. Los que ya venían no se listan: repetirlos cada mes
   * entrena a saltear la categoría.
   */
  const descuentos = datos.descuentos
    .filter((d) => enPeriodo(d.creadoEn, periodo))
    .map(
      (d): ItemNovedad => ({
        id: `des-${d.id}`,
        empleadoId: d.empleadoId,
        nombre: nombreDe(d.empleadoId),
        detalle:
          d.modo === 'porcentaje'
            ? `${d.concepto} · ${d.porcentaje ?? 0}% del bruto`
            : `${d.concepto}`,
        valor: d.modo === 'porcentaje' ? undefined : d.monto,
        unidad: d.modo === 'porcentaje' ? undefined : 'pesos',
        ruta: '/remuneraciones',
      })
    );

  // ---------- Cambios de sueldo ----------
  //
  // Contra el período anterior y sólo sobre el sueldo mensual: el SAC y
  // la liquidación final son conceptos aparte y compararlos con un
  // sueldo daría "aumentos" que no existieron.
  const anterior = sumarMesesEmpresa(periodo, -1);
  const brutoDe = (p: string): Map<string, number> => {
    const mapa = new Map<string, number>();
    for (const r of datos.remuneraciones) {
      if (r.periodo !== p) continue;
      if ((r.tipo ?? 'mensual') !== 'mensual') continue;
      mapa.set(r.empleadoId, r.montoBruto);
    }
    return mapa;
  };
  const brutosAhora = brutoDe(periodo);
  const brutosAntes = brutoDe(anterior);

  const sueldos: ItemNovedad[] = [];
  for (const [empleadoId, ahora] of brutosAhora) {
    const antes = brutosAntes.get(empleadoId);
    if (antes === undefined || antes === ahora) continue;
    const pct = antes > 0 ? ((ahora - antes) / antes) * 100 : 0;
    sueldos.push({
      id: `sue-${empleadoId}`,
      empleadoId,
      nombre: nombreDe(empleadoId),
      detalle: `Bruto ${ahora > antes ? 'de' : 'baja de'} ${Math.round(antes).toLocaleString('es-AR')} a ${Math.round(ahora).toLocaleString('es-AR')}`,
      valor: Math.round(ahora - antes),
      unidad: 'pesos',
      nota:
        antes > 0
          ? `${pct > 0 ? '+' : ''}${Math.round(pct * 10) / 10}%`
          : undefined,
      ruta: '/remuneraciones',
    });
  }
  sueldos.sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0));

  const sumar = (items: ItemNovedad[]): number =>
    redondear1(items.reduce((acc, i) => acc + (i.valor ?? 0), 0));

  const todas: CategoriaNovedad[] = [
    {
      clave: 'altas',
      etiqueta: 'Altas',
      descripcion: 'Quién ingresó este mes.',
      items: altas,
      requiereAtencion: false,
      ruta: '/colaboradores',
    },
    {
      clave: 'bajas',
      etiqueta: 'Bajas',
      descripcion:
        'Quién dejó la empresa. Cada baja lleva su liquidación final.',
      items: bajas,
      requiereAtencion: false,
      ruta: '/colaboradores',
    },
    {
      clave: 'ausencias',
      etiqueta: 'Licencias y ausencias',
      descripcion:
        'Aprobadas que tocan el período, con los días que caen dentro del mes y si se pagan o no.',
      items: ausencias,
      total: sumar(ausencias),
      unidad: 'dias',
      requiereAtencion: false,
      ruta: '/ausencias',
      modulo: 'ausencias',
    },
    {
      clave: 'jornada',
      etiqueta: 'Cambios de jornada',
      descripcion:
        'Entradas tarde, salidas anticipadas y home office cargados como novedad del día.',
      items: jornada,
      requiereAtencion: false,
      ruta: '/ausencias',
      modulo: 'ausencias',
    },
    {
      clave: 'sin_cerrar',
      etiqueta: 'Jornadas sin cerrar',
      descripcion:
        'Días con una sola marca. Hasta que se completen, las horas de ese día no cuentan para nada.',
      items: sinCerrar,
      requiereAtencion: sinCerrar.length > 0,
      ruta: '/fichaje',
      modulo: 'fichaje',
    },
    {
      clave: 'extras',
      etiqueta: 'Horas extras aprobadas',
      descripcion:
        'Sólo las que el supervisor aprobó en Turnos: son las únicas que se pagan.',
      items: extras,
      total: sumar(extras),
      unidad: 'horas',
      requiereAtencion: false,
      ruta: '/turnos',
      modulo: 'fichaje',
    },
    {
      clave: 'adelantos',
      etiqueta: 'Adelantos',
      descripcion: 'Aprobados para descontar en este período.',
      items: adelantos,
      total: sumar(adelantos),
      unidad: 'pesos',
      requiereAtencion: false,
      ruta: '/remuneraciones',
      modulo: 'remuneraciones',
    },
    {
      clave: 'descuentos',
      etiqueta: 'Descuentos nuevos',
      descripcion:
        'Descuentos recurrentes dados de alta este mes. Los que ya venían no se repiten acá.',
      items: descuentos,
      total: sumar(descuentos),
      unidad: 'pesos',
      requiereAtencion: false,
      ruta: '/remuneraciones',
      modulo: 'remuneraciones',
    },
    {
      clave: 'sueldos',
      etiqueta: 'Cambios de sueldo',
      descripcion: `Brutos que cambiaron contra ${anterior}.`,
      items: sueldos,
      total: sumar(sueldos),
      unidad: 'pesos',
      requiereAtencion: false,
      ruta: '/remuneraciones',
      modulo: 'remuneraciones',
    },
  ];

  const categorias = todas.filter((c) => moduloActivo(c.modulo, modulos));

  return {
    periodo,
    categorias,
    total: categorias.reduce((acc, c) => acc + c.items.length, 0),
    requierenAtencion: categorias.filter((c) => c.requiereAtencion).length,
  };
};

/**
 * El resumen del cierre para mandarle al contador, como filas de CSV.
 *
 * Una fila por novedad, con la categoría adelante: es el formato que un
 * estudio contable puede pegar en su planilla sin reordenar nada.
 */
export const filasDeExportacion = (
  novedades: NovedadesPeriodo,
  empresa: string
): string[][] => {
  const filas: string[][] = [
    ['Empresa', empresa],
    ['Período', novedades.periodo],
    [],
    ['Categoría', 'Colaborador', 'Novedad', 'Valor', 'Unidad', 'Nota'],
  ];
  for (const c of novedades.categorias) {
    for (const i of c.items) {
      filas.push([
        c.etiqueta,
        i.nombre,
        i.detalle,
        i.valor !== undefined ? String(i.valor) : '',
        i.valor !== undefined ? (i.unidad ?? '') : '',
        i.nota ?? '',
      ]);
    }
  }
  return filas;
};
