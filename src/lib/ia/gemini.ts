/**
 * Cliente mínimo de la API de Gemini (Google Generative Language).
 *
 * ⚠️ Solo se usa del lado del servidor (API routes): la API key vive en
 * `GEMINI_API_KEY` y NUNCA debe exponerse al navegador.
 *
 * Para dejarlo andando, lo único que falta es la integración en Google:
 *   1. Crear un proyecto en Google Cloud / AI Studio.
 *   2. Habilitar la "Generative Language API" y generar una API key.
 *   3. Poner la key en la variable de entorno GEMINI_API_KEY.
 * El modelo por defecto es el más económico (2.5 Flash-Lite); se puede
 * cambiar con GEMINI_MODEL.
 */

const MODELO = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';

/** Error tipado cuando falta configurar la API key. */
export class IANoConfigurada extends Error {
  constructor() {
    super('IA no configurada: falta GEMINI_API_KEY.');
    this.name = 'IANoConfigurada';
  }
}

export const iaConfigurada = (): boolean => Boolean(process.env.GEMINI_API_KEY);

/**
 * Envía un prompt a Gemini y devuelve el texto de la respuesta.
 * Lanza IANoConfigurada si no hay API key.
 */
export const consultarGemini = async (prompt: string): Promise<string> => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new IANoConfigurada();

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent?key=${key}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 800 },
    }),
  });

  if (!res.ok) {
    throw new Error(`Gemini respondió ${res.status}`);
  }

  const data = await res.json();
  const texto =
    data?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text ?? '')
      .join('') ?? '';
  return texto.trim();
};
