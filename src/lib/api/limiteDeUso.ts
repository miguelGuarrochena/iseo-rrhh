import 'server-only';

/**
 * Rate limit simple en memoria, pensado para endpoints caros (IA, envío de
 * emails) que ya exigen sesión. Es "best effort": en Vercel cada instancia
 * serverless tiene su propio proceso, así que el límite real terminá siendo
 * (maxPorMinuto × instancias activas), no un límite global exacto. Aun así
 * frena loops/abuso básico de un mismo usuario sin depender de infra extra
 * (Redis/Upstash). Si el tráfico crece, migrar a un rate limit centralizado.
 */
const registros = new Map<string, number[]>();
const VENTANA_MS = 60_000;

/** true si "clave" todavía tiene cupo dentro del último minuto. */
export const dentroDelLimite = (clave: string, maxPorMinuto = 15): boolean => {
  const ahora = Date.now();
  const marcas = (registros.get(clave) ?? []).filter(
    (t) => ahora - t < VENTANA_MS
  );
  if (marcas.length >= maxPorMinuto) {
    registros.set(clave, marcas);
    return false;
  }
  marcas.push(ahora);
  registros.set(clave, marcas);
  return true;
};
