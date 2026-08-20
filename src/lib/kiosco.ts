/**
 * Modo kiosco de la tablet de fichaje.
 *
 * La tablet compartida queda en una sola cosa: fichar con la cara. No
 * lleva el menú de la app —ahí están sueldos, recibos y legajos— porque
 * cualquiera que pase podría entrar. El PIN se crea una vez en este
 * dispositivo. Con ese PIN (o con un usuario de RRHH) se abre la app
 * otra vez, sin cerrar la sesión ni pedir un PIN nuevo. Cuando RRHH
 * termina, vuelve a Modo planta: la tablet sigue siendo de fichaje.
 *
 * El estado vive en localStorage, así sobrevive recargas. La sesión del
 * mismo usuario en otros dispositivos no se ve afectada.
 *
 * También se guarda la empresa con la que se bloqueó. El dueño de ISEO
 * no tiene `empresaId` propio: sin esto, una recarga dejaba la terminal
 * activa pero sin empresa, y no se podía fichar.
 */

import { Empresa, Usuario } from '@/types/rrhh';

const CLAVE_ACTIVO = 'iseo_kiosco_activo';
const CLAVE_PIN = 'iseo_kiosco_pin';
const CLAVE_PIN_LARGO = 'iseo_kiosco_pin_largo';
const CLAVE_EMPRESA = 'iseo_kiosco_empresa';
const CLAVE_INTENTOS = 'iseo_kiosco_intentos';

/** Después de tantos PIN mal, hay que entrar con usuario de RRHH. */
export const MAX_INTENTOS_PIN = 5;

/** PIN de 4 a 6 dígitos. */
export const pinValido = (pin: string): boolean => /^\d{4,6}$/.test(pin);

/** Hash del PIN (no se guarda en claro). */
const hashPin = async (pin: string): Promise<string> => {
  const texto = `iseo-kiosco:${pin}`;
  try {
    const datos = new TextEncoder().encode(texto);
    const buf = await crypto.subtle.digest('SHA-256', datos);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    // Fallback (contextos sin WebCrypto, ej. http en red local).
    let h = 5381;
    for (let i = 0; i < texto.length; i += 1) {
      h = (h * 33) ^ texto.charCodeAt(i);
    }
    return `djb2-${(h >>> 0).toString(16)}`;
  }
};

const enNavegador = (): boolean => typeof window !== 'undefined';

/** Sale de la pantalla de kiosco. El PIN queda: no hay que crearlo de nuevo. */
const desbloquearPantalla = (): void => {
  if (!enNavegador()) return;
  window.localStorage.removeItem(CLAVE_ACTIVO);
  window.localStorage.removeItem(CLAVE_INTENTOS);
};

export const kioscoActivo = (): boolean =>
  enNavegador() && window.localStorage.getItem(CLAVE_ACTIVO) === '1';

/** Esta tablet ya tiene PIN: Modo planta no tiene que pedirlo otra vez. */
export const pinConfigurado = (): boolean =>
  enNavegador() && Boolean(window.localStorage.getItem(CLAVE_PIN));

/** Empresa con la que se bloqueó esta tablet, si sigue el kiosco activo. */
export const empresaDelKiosco = (): Empresa | null => {
  if (!enNavegador() || !kioscoActivo()) return null;
  try {
    const crudo = window.localStorage.getItem(CLAVE_EMPRESA);
    return crudo ? (JSON.parse(crudo) as Empresa) : null;
  } catch {
    window.localStorage.removeItem(CLAVE_EMPRESA);
    return null;
  }
};

/**
 * Cuántos dígitos tiene el PIN de esta tablet. Se guarda al activar
 * (el hash no dice el largo) para mostrar esa cantidad de puntos, no
 * siempre 6. Si la tablet se bloqueó antes de existir esta clave, no
 * se inventa: el teclado admite 4 a 6 y los puntos crecen desde 4.
 */
export const pinLargoKiosco = (): number | null => {
  if (!enNavegador() || !kioscoActivo()) return null;
  const n = Number(window.localStorage.getItem(CLAVE_PIN_LARGO));
  return Number.isInteger(n) && n >= 4 && n <= 6 ? n : null;
};

const guardarEmpresa = (empresa?: Empresa | null): void => {
  if (!enNavegador()) return;
  if (empresa) {
    window.localStorage.setItem(CLAVE_EMPRESA, JSON.stringify(empresa));
  } else {
    window.localStorage.removeItem(CLAVE_EMPRESA);
  }
};

/** Bloquea este dispositivo en modo kiosco con el PIN dado (alta o cambio). */
export const activarKiosco = async (
  pin: string,
  empresa?: Empresa | null
): Promise<void> => {
  if (!enNavegador()) return;
  window.localStorage.setItem(CLAVE_PIN, await hashPin(pin));
  window.localStorage.setItem(CLAVE_PIN_LARGO, String(pin.length));
  window.localStorage.setItem(CLAVE_ACTIVO, '1');
  window.localStorage.removeItem(CLAVE_INTENTOS);
  guardarEmpresa(empresa);
};

/**
 * Vuelve a la pantalla de fichaje con el PIN que ya está en la tablet.
 * Si no hay PIN, no hace nada: hay que crearlo una vez con `activarKiosco`.
 */
export const reanudarKiosco = (empresa?: Empresa | null): boolean => {
  if (!enNavegador() || !pinConfigurado()) return false;
  window.localStorage.setItem(CLAVE_ACTIVO, '1');
  window.localStorage.removeItem(CLAVE_INTENTOS);
  if (empresa) guardarEmpresa(empresa);
  return true;
};

export const intentosPinKiosco = (): number => {
  if (!enNavegador()) return 0;
  const n = Number(window.localStorage.getItem(CLAVE_INTENTOS) ?? '0');
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export const registrarPinFallido = (): number => {
  const n = intentosPinKiosco() + 1;
  if (enNavegador()) window.localStorage.setItem(CLAVE_INTENTOS, String(n));
  return n;
};

export const pinBloqueado = (): boolean =>
  intentosPinKiosco() >= MAX_INTENTOS_PIN;

/**
 * ¿Esta cuenta puede administrar la tablet? Un colaborador no: vería
 * sueldos y legajos. RRHH o un supervisor, sólo de esa empresa.
 */
export const puedeAdministrarTerminal = (
  usuario: Usuario,
  empresa: Empresa | null
): boolean => {
  if (usuario.rol === 'empleado') return false;
  if (usuario.rol === 'superadmin') return true;
  if (!empresa?.id) {
    return usuario.rol === 'admin_rrhh' || usuario.rol === 'supervisor';
  }
  return usuario.empresaId === empresa.id;
};

/**
 * Abre la app si el PIN coincide. El PIN sigue en la tablet: al volver
 * a Modo planta no hay que crearlo de nuevo. No cierra la sesión.
 */
export const desactivarKiosco = async (pin: string): Promise<boolean> => {
  if (!enNavegador()) return false;
  if (pinBloqueado()) return false;
  const guardado = window.localStorage.getItem(CLAVE_PIN);
  if (!guardado || (await hashPin(pin)) !== guardado) {
    registrarPinFallido();
    return false;
  }
  desbloquearPantalla();
  return true;
};

/**
 * Sale del kiosco sin PIN: sólo después de que RRHH entró con su
 * usuario. El PIN de la tablet no se borra: si se olvidó, se puede
 * cambiar después desde Fichaje.
 */
export const salirKioscoForzado = (): void => {
  desbloquearPantalla();
};
