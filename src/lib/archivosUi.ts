'use client';

import { avisoError } from './avisos';

/**
 * Abrir y descargar archivos privados desde la UI.
 *
 * Los archivos viven en buckets privados: para verlos hay que pedir una
 * URL firmada, y eso es una llamada a la red. Dos cosas se rompían por
 * hacerlo a mano en cada pantalla:
 *
 * 1. Nadie envolvía la llamada en try/catch. Si la firma fallaba —sesión
 *    vencida, archivo borrado del bucket, política que no deja— la
 *    promesa quedaba rechazada sin dueño y el usuario veía que el botón
 *    no hacía nada. Un error mudo en un botón "Ver PDF" es lo peor que
 *    puede pasar en una devolución.
 *
 * 2. `window.open` después de un `await` ya no cuenta como respuesta al
 *    click, así que Safari (y Firefox con la configuración estricta) lo
 *    bloquea como popup. Acá la pestaña se abre primero, en el mismo
 *    tick del click, y recién después se le pone la URL.
 */

/** Abre la pestaña ya mismo, todavía dentro del gesto del usuario. */
const pestanaEnBlanco = (): Window | null => {
  const w = window.open('', '_blank');
  // `noopener` como feature no se puede usar acá (devolvería null y nos
  // quedaríamos sin la referencia para navegarla), así que se corta el
  // vínculo a mano.
  if (w) w.opener = null;
  return w;
};

const mensajeDe = (err: unknown): string | undefined =>
  err instanceof Error ? err.message : undefined;

/**
 * Pide la URL firmada y abre el archivo en otra pestaña.
 * Si algo falla, cierra la pestaña y avisa. Nunca queda mudo.
 */
export const abrirArchivo = async (
  obtenerUrl: () => Promise<string | null>,
  opciones?: { titulo?: string; vacio?: string }
): Promise<void> => {
  const titulo = opciones?.titulo ?? 'No pudimos abrir el archivo';
  const pestana = pestanaEnBlanco();
  try {
    const url = await obtenerUrl();
    if (!url) {
      pestana?.close();
      avisoError(titulo, opciones?.vacio ?? 'El archivo ya no está guardado.');
      return;
    }
    if (pestana) pestana.location.href = url;
    else window.open(url, '_blank', 'noopener,noreferrer');
  } catch (err) {
    pestana?.close();
    avisoError(titulo, mensajeDe(err));
  }
};

/**
 * Descarga el archivo con un nombre que se entienda sin abrirlo.
 * No necesita el truco de la pestaña: el ancla se crea después y el
 * navegador no la trata como popup.
 */
export const descargarArchivo = async (
  obtenerUrl: () => Promise<string | null>,
  nombre: string,
  opciones?: { titulo?: string; vacio?: string }
): Promise<void> => {
  const titulo = opciones?.titulo ?? 'No pudimos descargar el archivo';
  try {
    const url = await obtenerUrl();
    if (!url) {
      avisoError(titulo, opciones?.vacio ?? 'El archivo ya no está guardado.');
      return;
    }
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (err) {
    avisoError(titulo, mensajeDe(err));
  }
};
