/**
 * Modo kiosco de la tablet de fichaje.
 *
 * Cuando una terminal autorizada activa el Modo planta, el dispositivo
 * queda bloqueado en la pantalla de fichaje: no se puede navegar ni ver
 * datos de la sesión que lo activó. Para salir hace falta el PIN que se
 * definió al bloquear. El estado vive en localStorage, así sobrevive
 * recargas y reinicios de la tablet. La sesión del mismo usuario en
 * otros dispositivos no se ve afectada (cada equipo tiene la suya).
 */

const CLAVE_ACTIVO = 'iseo_kiosco_activo';
const CLAVE_PIN = 'iseo_kiosco_pin';

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

export const kioscoActivo = (): boolean =>
  typeof window !== 'undefined' &&
  window.localStorage.getItem(CLAVE_ACTIVO) === '1';

/** Bloquea este dispositivo en modo kiosco con el PIN dado. */
export const activarKiosco = async (pin: string): Promise<void> => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(CLAVE_PIN, await hashPin(pin));
  window.localStorage.setItem(CLAVE_ACTIVO, '1');
};

/** Desbloquea si el PIN coincide. Devuelve true si salió del kiosco. */
export const desactivarKiosco = async (pin: string): Promise<boolean> => {
  if (typeof window === 'undefined') return false;
  const guardado = window.localStorage.getItem(CLAVE_PIN);
  if (!guardado || (await hashPin(pin)) !== guardado) return false;
  window.localStorage.removeItem(CLAVE_ACTIVO);
  window.localStorage.removeItem(CLAVE_PIN);
  return true;
};
