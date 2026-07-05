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
