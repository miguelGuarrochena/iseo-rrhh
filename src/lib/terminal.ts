/**
 * Credencial local de este dispositivo como terminal de fichaje.
 *
 * Qué cambió y por qué
 * --------------------
 * Antes acá vivía sólo el id de la terminal (`iseo_terminal_id`), y ese
 * id era toda la "autorización" del Modo planta: la pantalla comparaba
 * el valor guardado contra la lista de terminales y, si coincidía,
 * mostraba el botón. El backend no miraba nada. Cualquiera podía
 * escribir esa clave desde la consola del navegador —o directamente
 * saltear la pantalla y llamar a PostgREST— y fichar por cualquier
 * persona de la empresa (F-01).
 *
 * Ahora el dispositivo guarda además un secreto de 256 bits que genera
 * el servidor al autorizar la tablet, y que el RPC exige en cada fichada
 * 1:N. Lo que se guarda acá dejó de ser una afirmación ("soy una
 * terminal") para pasar a ser una credencial que la base verifica.
 *
 * Sobre localStorage: la decisión de autorización NO vive acá, vive en
 * Postgres. Esto es sólo dónde el dispositivo lleva su credencial, que
 * en un kiosco de navegador tiene que estar en algún lado. Quien tenga
 * acceso físico a la tablet puede leerla — igual que puede leer la
 * sesión de Supabase que ya estaba ahí. Lo que esto corta es que
 * *cualquier otro* dispositivo pueda hacerse pasar por la terminal.
 */

/** Clave vieja: sólo el id, sin secreto. Ya no autoriza nada. */
const CLAVE_LEGADO = 'iseo_terminal_id';
const CLAVE = 'iseo_terminal';

export interface TerminalVinculada {
  id: string;
  secreto: string;
}

const enNavegador = (): boolean => typeof window !== 'undefined';

/**
 * Credencial de esta terminal, o null si el dispositivo no está
 * vinculado.
 *
 * Si encuentra la clave vieja la borra: un id suelto ya no sirve para
 * fichar, y dejarlo haría que la pantalla siguiera mostrando "Modo
 * planta" en un dispositivo que la base va a rechazar. Es preferible
 * que RRHH vea "autorizá esta tablet" a que el operario descubra el
 * problema con la fila formada adelante.
 */
export const getTerminalLocal = (): TerminalVinculada | null => {
  if (!enNavegador()) return null;
  const crudo = window.localStorage.getItem(CLAVE);
  if (!crudo) {
    if (window.localStorage.getItem(CLAVE_LEGADO)) {
      window.localStorage.removeItem(CLAVE_LEGADO);
    }
    return null;
  }
  try {
    const v = JSON.parse(crudo) as Partial<TerminalVinculada>;
    return v?.id && v?.secreto ? { id: v.id, secreto: v.secreto } : null;
  } catch {
    window.localStorage.removeItem(CLAVE);
    return null;
  }
};

export const setTerminalLocal = (terminal: TerminalVinculada): void => {
  if (!enNavegador()) return;
  window.localStorage.setItem(CLAVE, JSON.stringify(terminal));
  window.localStorage.removeItem(CLAVE_LEGADO);
};

export const borrarTerminalLocal = (): void => {
  if (!enNavegador()) return;
  window.localStorage.removeItem(CLAVE);
  window.localStorage.removeItem(CLAVE_LEGADO);
};
