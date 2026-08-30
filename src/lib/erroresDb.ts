/**
 * Traduce los errores crudos de Postgres/PostgREST a mensajes que le
 * sirvan a quien está usando la app. Sin esto, en pantalla aparecen
 * cosas como `duplicate key value violates unique constraint
 * "empleados_empresa_id_dni_key"`, que no le dicen nada a RRHH.
 */

/** Constraints únicas conocidas → qué pasó, en criollo. */
const UNICAS: Record<string, string> = {
  empleados_empresa_id_dni_key:
    'Ya hay un colaborador cargado con ese DNI en esta empresa. Buscalo en la lista y editá su ficha en vez de darlo de alta otra vez.',
  empleados_empresa_id_cuil_key:
    'Ya hay un colaborador cargado con ese CUIL en esta empresa.',
  usuarios_email_key: 'Ese email ya tiene un usuario en la plataforma.',
  remuneraciones_empleado_id_periodo_key:
    'Ese colaborador ya tiene una remuneración cargada para ese período.',
  facturas_monotributo_empleado_id_periodo_key:
    'Ese colaborador ya tiene una factura cargada para ese período.',
  cupos_licencia_empresa_id_tipo_key:
    'Ya hay un cupo cargado para ese tipo de licencia.',
  documento_firma_destinatarios_documento_id_empleado_id_key:
    'Ese colaborador ya estaba en la lista de destinatarios del documento.',
  empresas_cuit_key:
    'Ya hay una empresa cargada con ese CUIT. Buscala en la lista (aparece aunque esté suspendida): si es la misma, editala o reactivala en vez de crearla de nuevo.',
};

/**
 * Constraint → campo del formulario al que corresponde el error.
 *
 * Sirve para marcar el campo en vez de tirar un toast. Un aviso flotante
 * que dice "ese dato ya está cargado" obliga a adivinar cuál de los diez
 * campos es el repetido; el error al lado del CUIT se entiende solo.
 */
const CAMPO_DE_CONSTRAINT: Record<string, string> = {
  empresas_cuit_key: 'cuit',
  empleados_empresa_id_dni_key: 'dni',
  empleados_empresa_id_cuil_key: 'cuil',
  usuarios_email_key: 'email',
};

/**
 * Si el error viene de una constraint que se puede atribuir a un campo
 * concreto, devuelve cuál. Si no, `null` y el error va como aviso.
 */
export const campoDeErrorDb = (mensaje: string): string | null => {
  const m = mensaje ?? '';
  if (!contiene(m, 'duplicate key value', 'violates unique constraint')) {
    return null;
  }
  const nombre = m.match(/"([^"]+)"/)?.[1] ?? '';
  return CAMPO_DE_CONSTRAINT[nombre] ?? null;
};

const contiene = (texto: string, ...claves: string[]): boolean =>
  claves.some((c) => texto.includes(c));

/**
 * Devuelve un mensaje entendible para un error de la base. Si no lo
 * reconoce, devuelve el original (mejor un mensaje feo que ninguno).
 */
export const mensajeDeErrorDb = (mensaje: string): string => {
  const m = mensaje ?? '';

  // Unique violation: buscar el nombre de la constraint entre comillas.
  if (contiene(m, 'duplicate key value', 'violates unique constraint')) {
    const nombre = m.match(/"([^"]+)"/)?.[1] ?? '';
    return (
      UNICAS[nombre] ??
      'Ese dato ya está cargado y no se puede repetir. Revisá si el registro ya existe.'
    );
  }

  /**
   * El período está cerrado (migración 99).
   *
   * Va antes que el resto porque el trigger lo levanta como una
   * excepción común y quedaría traducido a "revisá fechas y montos", que
   * manda a buscar el problema al lugar equivocado: el dato está bien,
   * lo que pasa es que ese mes ya se cerró.
   */
  if (contiene(m, 'PERIODO_CERRADO')) {
    const periodo = m.match(/PERIODO_CERRADO: el período (\d{4}-\d{2})/)?.[1];
    return `El período ${periodo ?? 'de esa fila'} está cerrado, así que no se pueden cargar ni modificar remuneraciones ni adelantos de ese mes. Si hace falta corregirlo, reabrilo desde Cierre del mes explicando el motivo.`;
  }

  // RLS: la operación no está permitida para el rol/empresa actual.
  if (contiene(m, 'row-level security policy')) {
    return 'No tenés permiso para guardar esto en la empresa que estás viendo. Si sos superadmin, revisá que tengas la empresa correcta seleccionada; si no, pedile acceso a quien administra la empresa.';
  }

  // Columna inexistente: casi siempre es una migración sin aplicar.
  const columna = m.match(/Could not find the '([^']+)' column of '([^']+)'/);
  if (columna) {
    return `La base todavía no tiene la columna "${columna[1]}" en "${columna[2]}". Falta aplicar una migración pendiente; avisale a soporte.`;
  }

  if (contiene(m, 'violates foreign key constraint')) {
    return 'El registro que estás enlazando no existe o fue borrado. Recargá la página y probá de nuevo.';
  }

  if (contiene(m, 'invalid input value for enum')) {
    return 'Esa opción todavía no está habilitada en la base. Falta aplicar una migración pendiente; avisale a soporte.';
  }

  if (contiene(m, 'violates check constraint')) {
    return 'Alguno de los valores cargados no es válido. Revisá fechas y montos.';
  }

  if (contiene(m, 'JWT expired', 'Invalid Refresh Token')) {
    return 'Tu sesión venció. Volvé a iniciar sesión.';
  }

  return m;
};
