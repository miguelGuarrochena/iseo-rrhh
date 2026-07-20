/**
 * Interruptor del modo demo.
 *
 * En producción el demo queda APAGADO por defecto: no hay usuarios de
 * prueba ni datos falsos cuando la app está en manos de clientes reales.
 * Para habilitarlo en un entorno de staging/demostración, setear la
 * variable de entorno NEXT_PUBLIC_DEMO=on. Para forzar apagado en dev,
 * NEXT_PUBLIC_DEMO=off.
 */
export const demoHabilitado = (): boolean => {
  const flag = process.env.NEXT_PUBLIC_DEMO;
  if (flag === 'on') return true;
  if (flag === 'off') return false;
  return process.env.NODE_ENV !== 'production';
};

/**
 * Interruptor de la IA en la interfaz.
 *
 * Con NEXT_PUBLIC_MOSTRAR_IA=0 se ocultan los asistentes (Ayuda y
 * Convenio); el resto de la app funciona exactamente igual. Sin la
 * variable, la IA se muestra (y si falta la API key de Gemini, avisa
 * "no disponible" sin romper nada).
 */
export const iaVisible = (): boolean =>
  process.env.NEXT_PUBLIC_MOSTRAR_IA !== '0';
