/**
 * Autoservicio del legajo: el empleado propone, RRHH decide.
 *
 * Este módulo es sólo la parte que se puede pensar sin base de datos:
 * qué campos existen, cómo se llaman en castellano, cómo se muestra un
 * valor y cuándo una propuesta no tiene sentido. La autorización de
 * verdad está en la migración 106 —lista blanca, RLS y funciones—; acá
 * no hay ninguna decisión de seguridad, sólo la forma del formulario.
 *
 * La lista de campos está duplicada a propósito con
 * `campo_de_legajo_autogestionable()`. No es que una valide y la otra
 * no: la base rechaza igual lo que no le corresponde. Ésta existe para
 * poder dibujar el formulario, y el test se encarga de que no se
 * separen.
 */

import { EstadoCivil, Empleado, NivelEstudios } from '@/types/rrhh';

export type CampoAutogestionable =
  | 'domicilio'
  | 'telefono'
  | 'email'
  | 'estado_civil'
  | 'nivel_estudios'
  | 'contacto_emergencia'
  | 'grupo_familiar'
  | 'banco'
  | 'cbu';

export type TipoDeCampo = 'texto' | 'email' | 'telefono' | 'opcion' | 'objeto';

export interface DefinicionDeCampo {
  campo: CampoAutogestionable;
  etiqueta: string;
  /** Dónde aparece en `/app/mi-legajo`, para agrupar el formulario. */
  seccion: 'Contacto' | 'Datos personales' | 'Cobro';
  tipo: TipoDeCampo;
  opciones?: { valor: string; etiqueta: string }[];
  /**
   * Aviso al revisor. Sólo se completa cuando aprobar mal el dato tiene
   * una consecuencia concreta, no para adornar.
   */
  advertencia?: string;
}

const OPCIONES_ESTADO_CIVIL: { valor: EstadoCivil; etiqueta: string }[] = [
  { valor: 'soltero', etiqueta: 'Soltero/a' },
  { valor: 'casado', etiqueta: 'Casado/a' },
  { valor: 'divorciado', etiqueta: 'Divorciado/a' },
  { valor: 'viudo', etiqueta: 'Viudo/a' },
  { valor: 'union_convivencial', etiqueta: 'Unión convivencial' },
];

const OPCIONES_NIVEL_ESTUDIOS: { valor: NivelEstudios; etiqueta: string }[] = [
  { valor: 'primario', etiqueta: 'Primario' },
  { valor: 'secundario', etiqueta: 'Secundario' },
  { valor: 'terciario', etiqueta: 'Terciario' },
  { valor: 'universitario', etiqueta: 'Universitario' },
  { valor: 'posgrado', etiqueta: 'Posgrado' },
];

/**
 * Los campos que el empleado puede proponer, en el orden en que se
 * muestran.
 *
 * `contacto_emergencia` y `grupo_familiar` quedan fuera del formulario
 * por ahora (`enFormulario: false` no existe: simplemente no están en
 * `CAMPOS_DEL_FORMULARIO`): la base los acepta, pero editarlos pide una
 * pantalla de listas que no es esta entrega. Se dejan habilitados del
 * lado del servidor para no tener que tocar la migración después.
 */
export const CAMPOS: Record<CampoAutogestionable, DefinicionDeCampo> = {
  domicilio: {
    campo: 'domicilio',
    etiqueta: 'Domicilio',
    seccion: 'Contacto',
    tipo: 'texto',
  },
  telefono: {
    campo: 'telefono',
    etiqueta: 'Teléfono',
    seccion: 'Contacto',
    tipo: 'telefono',
  },
  email: {
    campo: 'email',
    etiqueta: 'Email',
    seccion: 'Contacto',
    tipo: 'email',
  },
  estado_civil: {
    campo: 'estado_civil',
    etiqueta: 'Estado civil',
    seccion: 'Datos personales',
    tipo: 'opcion',
    opciones: OPCIONES_ESTADO_CIVIL,
  },
  nivel_estudios: {
    campo: 'nivel_estudios',
    etiqueta: 'Nivel de estudios',
    seccion: 'Datos personales',
    tipo: 'opcion',
    opciones: OPCIONES_NIVEL_ESTUDIOS,
  },
  contacto_emergencia: {
    campo: 'contacto_emergencia',
    etiqueta: 'Contacto de emergencia',
    seccion: 'Datos personales',
    tipo: 'objeto',
  },
  grupo_familiar: {
    campo: 'grupo_familiar',
    etiqueta: 'Grupo familiar',
    seccion: 'Datos personales',
    tipo: 'objeto',
  },
  banco: {
    campo: 'banco',
    etiqueta: 'Banco',
    seccion: 'Cobro',
    tipo: 'texto',
  },
  cbu: {
    campo: 'cbu',
    etiqueta: 'CBU',
    seccion: 'Cobro',
    tipo: 'texto',
    // El único campo donde aprobar por inercia tiene costo: el sueldo se
    // deposita donde diga esto.
    advertencia:
      'Cambia dónde se deposita el sueldo. Verificá el pedido con la persona antes de aprobar.',
  },
};

/** Los que efectivamente tienen formulario hoy. */
export const CAMPOS_DEL_FORMULARIO: CampoAutogestionable[] = [
  'domicilio',
  'telefono',
  'email',
  'estado_civil',
  'nivel_estudios',
  'banco',
  'cbu',
];

export const esCampoAutogestionable = (
  campo: string
): campo is CampoAutogestionable => campo in CAMPOS;

/** Cómo se llama el campo, sin explotar si la base manda uno desconocido. */
export const etiquetaDeCampo = (campo: string): string =>
  esCampoAutogestionable(campo) ? CAMPOS[campo].etiqueta : campo;

/** El valor de hoy, tal como lo tiene el legajo. */
export const valorActualDe = (
  empleado: Empleado,
  campo: CampoAutogestionable
): string | undefined => {
  switch (campo) {
    case 'domicilio':
      return empleado.domicilio;
    case 'telefono':
      return empleado.telefono;
    case 'email':
      return empleado.email;
    case 'estado_civil':
      return empleado.estadoCivil;
    case 'nivel_estudios':
      return empleado.nivelEstudios;
    case 'banco':
      return empleado.banco;
    case 'cbu':
      return empleado.cbu;
    // Los objetos no se muestran como una línea de texto.
    case 'contacto_emergencia':
    case 'grupo_familiar':
      return undefined;
  }
};

/**
 * Cómo se muestra un valor guardado.
 *
 * Los enums llegan como `union_convivencial` y así no se leen. Los
 * objetos se muestran como JSON: no es lindo, pero es fiel, y es
 * preferible a inventar un resumen que oculte parte de lo que se está
 * por aprobar.
 */
export const mostrarValor = (campo: string, valor: unknown): string => {
  if (valor === null || valor === undefined || valor === '') return '—';
  if (typeof valor === 'object') return JSON.stringify(valor);
  const texto = String(valor);
  if (esCampoAutogestionable(campo)) {
    const opcion = CAMPOS[campo].opciones?.find((o) => o.valor === texto);
    if (opcion) return opcion.etiqueta;
  }
  return texto;
};

export type EstadoSolicitud =
  | 'pendiente'
  | 'aprobada'
  | 'rechazada'
  | 'anulada';

export const ETIQUETA_ESTADO: Record<EstadoSolicitud, string> = {
  pendiente: 'Esperando a RRHH',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
  anulada: 'Anulada',
};

/**
 * Qué le impide a esta propuesta salir del formulario.
 *
 * Devuelve `null` cuando está bien. Es la validación de comodidad —para
 * no hacer viajar un pedido que la base va a rechazar—, no la que
 * decide: las mismas tres reglas están en `solicitar_cambio_de_legajo`.
 */
export const errorDePropuesta = (d: {
  campo: string;
  valor: string;
  valorActual?: string;
}): string | null => {
  if (!esCampoAutogestionable(d.campo)) {
    return 'Ese dato lo actualiza RRHH.';
  }
  const valor = d.valor.trim();
  if (!valor) return 'Escribí el valor nuevo.';
  if (valor === (d.valorActual ?? '').trim()) {
    return 'Ese es el valor que ya figura en tu legajo.';
  }

  const definicion = CAMPOS[d.campo];
  if (
    definicion.tipo === 'email' &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor)
  ) {
    return 'Revisá el email: falta el @ o el dominio.';
  }
  if (definicion.tipo === 'opcion') {
    const valida = definicion.opciones?.some((o) => o.valor === valor);
    if (!valida) return 'Elegí una de las opciones.';
  }
  /*
   * El CBU argentino tiene 22 dígitos. No se valida el dígito
   * verificador: si el banco cambia el esquema, un legajo correcto
   * quedaría trabado por una regla nuestra.
   */
  if (d.campo === 'cbu' && !/^\d{22}$/.test(valor)) {
    return 'El CBU tiene 22 números, sin espacios ni guiones.';
  }

  return null;
};

/**
 * Cuántas propuestas esperan respuesta, para el contador de RRHH.
 * Si no hay ninguna, no se muestra nada: un "0" no es una novedad.
 */
export const pendientes = <T extends { estado: string }>(
  solicitudes: T[]
): T[] => solicitudes.filter((s) => s.estado === 'pendiente');

/** Una propuesta, tal como vive en `solicitudes_datos_legajo`. */
export interface SolicitudDatoLegajo {
  id: string;
  empresaId: string;
  empleadoId: string;
  /** Nombre de la columna. Se deja como `string`: si la base sumara un
   *  campo antes que el front, la pantalla lo muestra en crudo en vez de
   *  romperse. */
  campo: string;
  valorActual?: unknown;
  valorPropuesto: unknown;
  comentario?: string;
  estado: EstadoSolicitud;
  motivoResolucion?: string;
  creadaEn: string;
  resueltaEn?: string;
  resueltaPor?: string;
  /** Sólo lo trae la vista de RRHH, que consulta varios legajos. */
  empleadoNombre?: string;
}

export interface NuevaSolicitudDatoLegajo {
  campo: CampoAutogestionable;
  valor: string;
  comentario?: string;
}
