/**
 * Punto único donde un error crudo se convierte en algo que se le puede
 * mostrar a una persona.
 *
 * Antes cada pantalla decidía por su cuenta qué texto poner, y la mitad
 * no decidía nada: el error caía en la consola. Tener esto en un solo
 * lugar hace que un error nuevo se traduzca bien en toda la app de una,
 * y que la decisión de "¿tiene sentido reintentar?" sea del sistema y no
 * de quien escribió esa pantalla.
 */
import { mensajeDeErrorDb } from '@/lib/erroresDb';

export type TipoError =
  /** La sesión venció o no hay. Hay que volver a entrar. */
  | 'sesion'
  /** Falta elegir una empresa (superadmin sin cliente activo). */
  | 'empresa'
  /** Se cayó la conexión o el servidor no responde. */
  | 'red'
  /** El servidor respondió pero no deja hacer esto. */
  | 'permisos'
  /** El dato no pasó una validación de la base. */
  | 'datos'
  /** No lo reconocemos. */
  | 'desconocido';

export interface ErrorInterpretado {
  tipo: TipoError;
  titulo: string;
  detalle: string;
  /**
   * Si reintentar puede llegar a funcionar. Un problema de red sí; "no
   * elegiste empresa" no, y ofrecer un botón que no arregla nada es peor
   * que no ofrecer ninguno.
   */
  reintentable: boolean;
  /** Texto original, para el registro de errores. */
  crudo: string;
}

/** Saca el texto de cualquier cosa que se haya lanzado. */
export const textoDeError = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return 'Error desconocido';
};

const incluye = (texto: string, ...claves: string[]): boolean =>
  claves.some((c) => texto.includes(c));

export const interpretarError = (err: unknown): ErrorInterpretado => {
  const crudo = textoDeError(err);
  const m = crudo.toLowerCase();

  if (
    incluye(
      m,
      'sin sesión',
      'sesión vencida',
      'jwt expired',
      'invalid refresh token'
    )
  ) {
    return {
      tipo: 'sesion',
      titulo: 'Se cerró tu sesión',
      detalle: 'Volvé a ingresar para seguir trabajando.',
      reintentable: false,
      crudo,
    };
  }

  if (incluye(m, 'sin empresa activa')) {
    return {
      tipo: 'empresa',
      titulo: 'Elegí una empresa primero',
      detalle:
        'Esta sección trabaja sobre una empresa concreta. Entrá a una desde Empresas y volvé.',
      reintentable: false,
      crudo,
    };
  }

  if (
    incluye(
      m,
      'failed to fetch',
      'networkerror',
      'load failed',
      'no está conectada al servidor',
      'timeout',
      'aborted'
    )
  ) {
    return {
      tipo: 'red',
      titulo: 'No pudimos conectarnos',
      detalle:
        'Puede ser tu conexión. Los datos están a salvo; probá de nuevo en unos segundos.',
      reintentable: true,
      crudo,
    };
  }

  // Recursión de policies: el servidor está mal configurado, no es algo
  // que quien usa la app pueda resolver reintentando.
  if (incluye(m, 'infinite recursion')) {
    return {
      tipo: 'permisos',
      titulo: 'Error de configuración en el servidor',
      detalle:
        'Hay una regla de acceso mal armada. Avisale a ISEO RH con el nombre de esta pantalla.',
      reintentable: false,
      crudo,
    };
  }

  /**
   * Geocerca (A06). Van antes del bloque genérico de permisos porque el
   * RPC las levanta con `insufficient_privilege`, y "no tenés permiso"
   * no le dice a nadie qué hacer parado frente al teléfono.
   *
   * `reintentable: false` es la parte importante: `FichajeFacialModal`
   * reinicia la cámara cuando el error es reintentable, y acá volver a
   * poner la cara no arregla nada — hay que dar el permiso de ubicación
   * o moverse. Con `true` quedaba el bucle eterno de "parpadeá" que ya
   * se había corregido para "Sin empresa activa".
   */
  if (incluye(m, 'no podemos verificar tu ubicación')) {
    return {
      tipo: 'permisos',
      titulo: 'Necesitamos tu ubicación',
      detalle:
        'Activá el permiso de ubicación en el navegador y volvé a intentar. Tu empresa pide verificar que fichás desde tu zona de trabajo.',
      reintentable: false,
      crudo,
    };
  }

  if (incluye(m, 'fuera de tu zona de trabajo')) {
    return {
      tipo: 'permisos',
      titulo: 'Estás fuera de tu zona',
      detalle:
        'Acercate al lugar donde te toca fichar y probá de nuevo. Si creés que la zona está mal cargada, avisale a RRHH.',
      reintentable: false,
      crudo,
    };
  }

  if (incluye(m, 'fichaje con fecha futura')) {
    return {
      tipo: 'datos',
      titulo: 'Esa fecha todavía no llegó',
      detalle:
        'No se puede registrar un fichaje con fecha futura. Revisá el día y la hora.',
      reintentable: false,
      crudo,
    };
  }

  if (incluye(m, 'row-level security policy', 'permission denied')) {
    return {
      tipo: 'permisos',
      titulo: 'No tenés permiso para esto',
      detalle: mensajeDeErrorDb(crudo),
      reintentable: false,
      crudo,
    };
  }

  // Todo lo que sea de Postgres ya tiene su traducción propia.
  const deDb = mensajeDeErrorDb(crudo);
  if (deDb !== crudo) {
    return {
      tipo: 'datos',
      titulo: 'No pudimos guardar',
      detalle: deDb,
      reintentable: false,
      crudo,
    };
  }

  return {
    tipo: 'desconocido',
    titulo: 'Algo no salió bien',
    detalle:
      'Fue un problema puntual y no perdiste nada. Probá de nuevo; si sigue pasando, avisá a ISEO RH.',
    reintentable: true,
    crudo,
  };
};
