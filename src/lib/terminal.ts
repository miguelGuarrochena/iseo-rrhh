/**
 * Identidad local del dispositivo como "terminal de fichaje".
 * Si este equipo fue autorizado como terminal (tablet de planta), guardamos
 * el id acá; el Modo planta solo funciona si el id coincide con una terminal
 * registrada de la empresa.
 */
const CLAVE = 'iseo_terminal_id';

export const getTerminalLocal = (): string | null => {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(CLAVE);
};

export const setTerminalLocal = (id: string): void => {
  if (typeof window !== 'undefined') window.localStorage.setItem(CLAVE, id);
};

export const borrarTerminalLocal = (): void => {
  if (typeof window !== 'undefined') window.localStorage.removeItem(CLAVE);
};
