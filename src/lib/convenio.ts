/**
 * Utilidades del convenio colectivo: partir en párrafos y buscar los más
 * relevantes para una consulta (recuperación simple por palabras clave).
 * Esos párrafos se usan como contexto para el asistente con IA (RAG liviano).
 */

const normalizar = (t: string): string =>
  t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Palabras muy comunes que no aportan al match. */
const VACIAS = new Set([
  'el',
  'la',
  'los',
  'las',
  'un',
  'una',
  'de',
  'del',
  'en',
  'que',
  'por',
  'para',
  'con',
  'los',
  'las',
  'su',
  'al',
  'como',
  'cuantos',
  'cuantas',
  'cual',
  'cuando',
]);

export const partirEnParrafos = (texto: string): string[] =>
  texto
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

const tokens = (t: string): string[] =>
  normalizar(t)
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length > 2 && !VACIAS.has(p));

/**
 * Devuelve los párrafos del convenio más relevantes para la consulta,
 * ordenados por cantidad de palabras clave coincidentes.
 */
export const buscarParrafos = (
  texto: string,
  consulta: string,
  limite = 5
): string[] => {
  const claves = tokens(consulta);
  if (claves.length === 0) return [];
  const parrafos = partirEnParrafos(texto);

  return parrafos
    .map((p) => {
      const cuerpo = normalizar(p);
      const puntaje = claves.reduce(
        (acc, k) => acc + (cuerpo.includes(k) ? 1 : 0),
        0
      );
      return { p, puntaje };
    })
    .filter((x) => x.puntaje > 0)
    .sort((a, b) => b.puntaje - a.puntaje)
    .slice(0, limite)
    .map((x) => x.p);
};
