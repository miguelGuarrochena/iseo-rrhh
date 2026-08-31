/**
 * Importar la liquidación del estudio contable.
 *
 * RRHH ya tiene el mes liquidado en una planilla; volver a tipearlo en la
 * app es trabajo duplicado y es donde aparecen los errores de tipeo que
 * después nadie encuentra. Esto lee esa planilla.
 *
 * Todo lo de acá es puro: recibe filas y devuelve filas con sus errores.
 * No escribe nada. Guardar es de `importarRemuneraciones` en la capa de
 * servicios, y las reglas que no se pueden saltear —empleado de la
 * empresa, período cerrado, tope de aportes— están en la base.
 *
 * ## Cómo caen los conceptos en el modelo
 *
 * `remuneraciones` tiene tres importes: bruto, no remunerativo y
 * descuentos. La planilla trae el desglose. La regla es:
 *
 *  - Si la planilla trae una columna de **bruto/total remunerativo**, ése
 *    es el bruto. El desglose se guarda igual, pero no se suma: el número
 *    que liquidó el estudio manda sobre cualquier cuenta nuestra.
 *  - Si no la trae, el bruto es la **suma de los conceptos
 *    remunerativos** (básico, antigüedad, presentismo, extras,
 *    adicionales).
 *  - Si trae las dos cosas y no coinciden, **se avisa y no se bloquea**.
 *    Un centavo de diferencia por redondeo del estudio no puede frenar
 *    una importación de 120 personas, y decidir cuál de los dos números
 *    está bien no nos corresponde.
 */

import { RegimenLaboral } from '@/types/rrhh';
import { CampoImportable, IGNORAR } from '@/lib/mapeoDeColumnas';

/** Qué hace cada campo dentro de la cuenta. */
export type RolDeCampo =
  | 'identificador'
  | 'periodo'
  | 'remunerativo'
  | 'bruto_declarado'
  | 'no_remunerativo'
  | 'descuento';

export interface CampoLiquidacion extends CampoImportable {
  rol: RolDeCampo;
}

/**
 * Los campos que se pueden importar.
 *
 * Ninguno es obligatorio salvo identificar a la persona y saber el
 * período: el cliente no confirmó qué columnas manda su estudio, y
 * exigir "Presentismo" a quien no lo paga sería inventar un requisito.
 */
export const CAMPOS_LIQUIDACION: CampoLiquidacion[] = [
  {
    clave: 'legajo',
    etiqueta: 'Legajo',
    rol: 'identificador',
    alias: ['legajo', 'nro legajo', 'numero de legajo', 'n legajo', 'leg'],
  },
  {
    clave: 'dni',
    etiqueta: 'DNI',
    rol: 'identificador',
    alias: ['dni', 'documento', 'nro documento', 'numero de documento', 'doc'],
  },
  {
    clave: 'cuil',
    etiqueta: 'CUIL',
    rol: 'identificador',
    alias: ['cuil', 'cuit', 'cuil cuit'],
  },
  {
    clave: 'periodo',
    etiqueta: 'Período',
    rol: 'periodo',
    alias: ['periodo', 'mes', 'mes liquidado', 'periodo liquidado'],
  },
  {
    clave: 'sueldo',
    etiqueta: 'Sueldo básico',
    rol: 'remunerativo',
    alias: ['sueldo', 'sueldo basico', 'basico', 'haber basico', 'salario'],
  },
  {
    clave: 'antiguedad',
    etiqueta: 'Antigüedad',
    rol: 'remunerativo',
    alias: ['antiguedad', 'adicional antiguedad', 'ant'],
  },
  {
    clave: 'presentismo',
    etiqueta: 'Presentismo',
    rol: 'remunerativo',
    alias: ['presentismo', 'asistencia', 'premio asistencia'],
  },
  {
    clave: 'horasExtras',
    etiqueta: 'Horas extras',
    rol: 'remunerativo',
    alias: ['horas extras', 'extras', 'he', 'horas extra'],
  },
  {
    clave: 'adicionales',
    etiqueta: 'Adicionales',
    rol: 'remunerativo',
    alias: ['adicionales', 'adicional', 'otros remunerativos', 'plus'],
  },
  {
    clave: 'montoBruto',
    etiqueta: 'Total remunerativo (bruto)',
    rol: 'bruto_declarado',
    alias: [
      'bruto',
      'total remunerativo',
      'remunerativo',
      'total bruto',
      'sueldo bruto',
      'importe',
    ],
  },
  {
    clave: 'noRemunerativo',
    etiqueta: 'No remunerativo',
    rol: 'no_remunerativo',
    alias: [
      'no remunerativo',
      'no remunerativos',
      'total no remunerativo',
      'no rem',
    ],
  },
  {
    clave: 'otrosDescuentos',
    etiqueta: 'Descuentos',
    rol: 'descuento',
    alias: [
      'descuentos',
      'otros descuentos',
      'total descuentos',
      'retenciones',
    ],
  },
];

const CAMPOS_POR_CLAVE = new Map(CAMPOS_LIQUIDACION.map((c) => [c.clave, c]));

const clavesConRol = (rol: RolDeCampo): string[] =>
  CAMPOS_LIQUIDACION.filter((c) => c.rol === rol).map((c) => c.clave);

/**
 * Un importe de una celda.
 *
 * Los Excel argentinos traen "1.234,56", los CSV exportados en inglés
 * traen "1234.56", y cualquiera de los dos puede venir con "$" o entre
 * paréntesis. Devuelve `undefined` cuando la celda está vacía —que no es
 * lo mismo que cero— y `NaN` cuando hay algo que no es un importe, para
 * que el llamador pueda distinguir "no lo informaron" de "está mal".
 */
export const parsearImporte = (valor: unknown): number | undefined => {
  if (valor === null || valor === undefined) return undefined;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : NaN;

  let s = String(valor).trim();
  if (s === '') return undefined;

  // (1.234,56) es un negativo en las planillas contables.
  const entreParentesis = /^\(.*\)$/.test(s);
  if (entreParentesis) s = s.slice(1, -1);

  s = s.replace(/[$\s]/g, '');
  if (s === '') return undefined;

  const tieneComa = s.includes(',');
  const tienePunto = s.includes('.');

  /*
   * Punto y coma quieren decir cosas distintas según quién exportó el
   * archivo: en el Excel argentino el punto separa miles, en un CSV
   * exportado en inglés separa decimales. Con los dos presentes no hay
   * ambigüedad —el último es el decimal—; con uno solo hay que decidir.
   *
   * El criterio: un separador seguido de exactamente tres dígitos al
   * final es de miles. Es lo que hace que "1.500" sea mil quinientos
   * pesos y no un peso con cincuenta, que en una planilla de sueldos es
   * la lectura correcta las dos veces.
   */
  const separaMiles = (sep: string): boolean =>
    (s.match(new RegExp(`\\${sep}`, 'g')) ?? []).length > 1 ||
    new RegExp(`\\${sep}\\d{3}$`).test(s);

  if (tieneComa && tienePunto) {
    s =
      s.lastIndexOf(',') > s.lastIndexOf('.')
        ? s.replace(/\./g, '').replace(',', '.')
        : s.replace(/,/g, '');
  } else if (tieneComa) {
    s = separaMiles(',') ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (tienePunto && separaMiles('.')) {
    s = s.replace(/\./g, '');
  }

  if (!/^-?\d*\.?\d*$/.test(s) || s === '.' || s === '-') return NaN;
  const n = Number(s);
  if (!Number.isFinite(n)) return NaN;
  return entreParentesis ? -Math.abs(n) : n;
};

/**
 * El período de la fila, como YYYY-MM.
 *
 * Acepta lo que sale de Excel: la fecha real, "2026-07", "07/2026" y
 * "2026-07-31". No adivina nombres de mes: "julio" en una columna es tan
 * probable que sea un encabezado mal leído como un dato.
 */
export const parsearPeriodo = (valor: unknown): string | undefined => {
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    const mes = String(valor.getMonth() + 1).padStart(2, '0');
    return `${valor.getFullYear()}-${mes}`;
  }
  const s = String(valor ?? '').trim();
  if (s === '') return undefined;

  let m = s.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}`;

  m = s.match(/^(\d{1,2})[/\-.](\d{4})$/);
  if (m) return `${m[2]}-${m[1].padStart(2, '0')}`;

  m = s.match(/^\d{1,2}[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (m) return `${m[2]}-${m[1].padStart(2, '0')}`;

  return undefined;
};

export const periodoValido = (periodo: string): boolean =>
  /^\d{4}-(0[1-9]|1[0-2])$/.test(periodo);

/** Sólo dígitos, para comparar documentos escritos de mil maneras. */
const soloDigitos = (s: string): string => s.replace(/\D/g, '');

/** Un empleado, reducido a lo que hace falta para reconocerlo. */
export interface EmpleadoParaImportar {
  id: string;
  nombre: string;
  apellido: string;
  dni?: string;
  cuil?: string;
  numeroLegajo?: string;
  activo?: boolean;
}

export interface FilaLiquidacion {
  /** Número de fila en la planilla, contando el encabezado. */
  fila: number;
  empleadoId?: string;
  empleadoNombre?: string;
  /** Lo que decía la planilla para identificar a la persona. */
  identificador: string;
  periodo?: string;
  montoBruto: number;
  noRemunerativo: number;
  otrosDescuentos: number;
  /** El desglose informado, para guardar al lado sin usarlo en la cuenta. */
  detalle: Record<string, number>;
  /** Impiden importar. */
  errores: string[];
  /** No impiden importar, pero hay que verlas. */
  advertencias: string[];
  /** Ya hay una remuneración cargada para esa persona y ese período. */
  pisa: boolean;
}

export interface DatosDeImportacion {
  filas: Record<string, unknown>[];
  /** columna del archivo → clave de campo (o IGNORAR). */
  mapeo: Record<string, string>;
  empleados: EmpleadoParaImportar[];
  /** Se usa en las filas cuyo archivo no trae período. */
  periodoPorDefecto: string;
  /** Claves `empleadoId|periodo` que ya existen en la base. */
  yaCargadas?: Set<string>;
  regimen?: RegimenLaboral;
}

const claveDePisada = (empleadoId: string, periodo: string): string =>
  `${empleadoId}|${periodo}`;

/**
 * Convierte la planilla al modelo y valida fila por fila.
 *
 * Valida todo antes de guardar nada: la persona tiene que poder ver los
 * 120 registros y sus 2 errores en la misma pantalla, decidir, y recién
 * ahí confirmar.
 */
export const armarFilasDeLiquidacion = (
  d: DatosDeImportacion
): FilaLiquidacion[] => {
  const columnasDe = (clave: string): string[] =>
    Object.entries(d.mapeo)
      .filter(([, c]) => c === clave)
      .map(([col]) => col);

  const porLegajo = new Map<string, EmpleadoParaImportar>();
  const porDni = new Map<string, EmpleadoParaImportar>();
  const porCuil = new Map<string, EmpleadoParaImportar>();
  d.empleados.forEach((e) => {
    if (e.numeroLegajo) porLegajo.set(e.numeroLegajo.trim().toLowerCase(), e);
    if (e.dni) porDni.set(soloDigitos(e.dni), e);
    if (e.cuil) porCuil.set(soloDigitos(e.cuil), e);
  });

  const clavesRemunerativas = clavesConRol('remunerativo');
  const vistos = new Map<string, number>();

  return d.filas.map((fila, i) => {
    const numeroDeFila = i + 2; // +1 por el encabezado, +1 porque se cuenta desde 1
    const errores: string[] = [];
    const advertencias: string[] = [];

    const celda = (clave: string): unknown => {
      const cols = columnasDe(clave);
      for (const col of cols) {
        const v = fila[col];
        if (v !== null && v !== undefined && String(v).trim() !== '') return v;
      }
      return undefined;
    };

    // ---------- Quién es ----------
    const legajo = String(celda('legajo') ?? '').trim();
    const dni = soloDigitos(String(celda('dni') ?? ''));
    const cuil = soloDigitos(String(celda('cuil') ?? ''));
    const identificador = legajo || dni || cuil;

    const empleado =
      (legajo ? porLegajo.get(legajo.toLowerCase()) : undefined) ??
      (dni ? porDni.get(dni) : undefined) ??
      (cuil ? porCuil.get(cuil) : undefined);

    if (!identificador) {
      errores.push('no dice de quién es (falta legajo, DNI o CUIL)');
    } else if (!empleado) {
      // El listado que llega es el de la empresa activa, así que "no
      // está" cubre tanto al inexistente como al de otra empresa. No se
      // distinguen a propósito: decir "existe pero es de otra empresa"
      // confirmaría un dato de un tercero.
      errores.push(`no hay ningún colaborador con ${identificador}`);
    } else if (empleado.activo === false) {
      advertencias.push('está dado de baja');
    }

    if (empleado) {
      const previa = vistos.get(empleado.id);
      if (previa !== undefined) {
        errores.push(`repetido: ya aparece en la fila ${previa}`);
      } else {
        vistos.set(empleado.id, numeroDeFila);
      }
    }

    // ---------- Qué mes ----------
    const brutoPeriodo = celda('periodo');
    let periodo: string | undefined;
    if (brutoPeriodo === undefined) {
      periodo = d.periodoPorDefecto;
    } else {
      periodo = parsearPeriodo(brutoPeriodo);
      if (!periodo) {
        errores.push(`no se entiende el período "${String(brutoPeriodo)}"`);
      }
    }
    if (periodo && !periodoValido(periodo)) {
      errores.push(`el período ${periodo} no existe`);
      periodo = undefined;
    }

    // ---------- Cuánto ----------
    const detalle: Record<string, number> = {};
    const leerImporte = (clave: string): number | undefined => {
      const bruto = celda(clave);
      if (bruto === undefined) return undefined;
      const n = parsearImporte(bruto);
      if (n === undefined) return undefined;
      if (Number.isNaN(n)) {
        const etiqueta = CAMPOS_POR_CLAVE.get(clave)?.etiqueta ?? clave;
        errores.push(`${etiqueta}: "${String(bruto)}" no es un importe`);
        return undefined;
      }
      if (n < 0) {
        const etiqueta = CAMPOS_POR_CLAVE.get(clave)?.etiqueta ?? clave;
        errores.push(`${etiqueta}: no puede ser negativo`);
        return undefined;
      }
      detalle[clave] = n;
      return n;
    };

    let sumaRemunerativos = 0;
    let hayAlgunRemunerativo = false;
    clavesRemunerativas.forEach((clave) => {
      const n = leerImporte(clave);
      if (n !== undefined) {
        sumaRemunerativos += n;
        hayAlgunRemunerativo = true;
      }
    });

    const brutoDeclarado = leerImporte('montoBruto');
    const noRemunerativo = leerImporte('noRemunerativo') ?? 0;
    const otrosDescuentos = leerImporte('otrosDescuentos') ?? 0;

    let montoBruto: number;
    if (brutoDeclarado !== undefined) {
      montoBruto = brutoDeclarado;
      // Las dos cosas y no coinciden: se avisa, no se corrige. El número
      // del estudio es el que se liquidó.
      if (
        hayAlgunRemunerativo &&
        Math.abs(sumaRemunerativos - montoBruto) > 1
      ) {
        advertencias.push(
          `el desglose suma ${Math.round(sumaRemunerativos)} y el bruto dice ${Math.round(montoBruto)}`
        );
      }
    } else {
      montoBruto = sumaRemunerativos;
    }

    if (!hayAlgunRemunerativo && brutoDeclarado === undefined) {
      errores.push('no trae ningún importe remunerativo');
    } else if (montoBruto <= 0 && noRemunerativo <= 0) {
      errores.push('el total del período da cero');
    }

    const pisa = Boolean(
      empleado &&
        periodo &&
        d.yaCargadas?.has(claveDePisada(empleado.id, periodo))
    );

    return {
      fila: numeroDeFila,
      empleadoId: empleado?.id,
      empleadoNombre: empleado
        ? `${empleado.apellido}, ${empleado.nombre}`
        : undefined,
      identificador,
      periodo,
      montoBruto: Math.round(montoBruto),
      noRemunerativo: Math.round(noRemunerativo),
      otrosDescuentos: Math.round(otrosDescuentos),
      detalle,
      errores,
      advertencias,
      pisa,
    };
  });
};

export interface ResumenImportacion {
  total: number;
  validas: number;
  conErrores: number;
  conAdvertencias: number;
  aSobrescribir: number;
  periodos: string[];
}

export const resumirImportacion = (
  filas: FilaLiquidacion[]
): ResumenImportacion => ({
  total: filas.length,
  validas: filas.filter((f) => f.errores.length === 0).length,
  conErrores: filas.filter((f) => f.errores.length > 0).length,
  conAdvertencias: filas.filter(
    (f) => f.errores.length === 0 && f.advertencias.length > 0
  ).length,
  aSobrescribir: filas.filter((f) => f.errores.length === 0 && f.pisa).length,
  periodos: [
    ...new Set(filas.filter((f) => f.periodo).map((f) => f.periodo as string)),
  ].sort(),
});

/** Las que se pueden guardar. */
export const filasImportables = (filas: FilaLiquidacion[]): FilaLiquidacion[] =>
  filas.filter((f) => f.errores.length === 0);

/**
 * Qué impide importar del todo.
 *
 * Distinto de los errores por fila: acá van los problemas del archivo
 * entero, los que no se arreglan sacando una fila.
 */
export const errorDeArchivo = (d: {
  filas: FilaLiquidacion[];
  mapeo: Record<string, string>;
}): string | null => {
  if (d.filas.length === 0) return 'El archivo no tiene filas con datos.';

  const asignados = new Set(
    Object.values(d.mapeo).filter((c) => c !== IGNORAR)
  );
  const hayIdentificador = clavesConRol('identificador').some((c) =>
    asignados.has(c)
  );
  if (!hayIdentificador) {
    return 'Falta indicar qué columna identifica a cada colaborador: legajo, DNI o CUIL.';
  }

  const hayImporte =
    clavesConRol('remunerativo').some((c) => asignados.has(c)) ||
    asignados.has('montoBruto');
  if (!hayImporte) {
    return 'Falta indicar al menos una columna de importe remunerativo (sueldo básico, o el total bruto).';
  }

  return null;
};
