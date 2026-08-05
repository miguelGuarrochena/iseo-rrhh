/**
 * Copia los modelos de reconocimiento facial a public/models.
 *
 * Antes se bajaban de un CDN (jsdelivr) en tiempo de ejecución. No
 * funcionaba nunca en producción: la CSP de `next.config.js` tiene
 * `connect-src 'self'` + Supabase, así que el navegador bloqueaba el
 * fetch de los pesos, los modelos no cargaban y la pantalla mostraba un
 * "revisá tu conexión" que mandaba a buscar el problema al lugar
 * equivocado.
 *
 * Servirlos desde el mismo origen resuelve además el caso real de uso:
 * la tablet de planta, que puede tener internet malo o bloqueado.
 *
 * Se copian en el install en vez de commitear 6,8 MB al repo, igual que
 * el worker de pdf.js. Los tres modelos son los que usa
 * `src/lib/facial/reconocimiento.ts`; el resto del paquete (edad,
 * género, expresiones) no se usa y no se copia.
 *
 * Corre dos veces, con exigencias distintas:
 *
 * - En `postinstall`, tolerante: si face-api todavía no está instalado
 *   (por el orden en que npm resuelve las cosas) no tiene sentido cortar
 *   la instalación.
 * - En `build` con `--estricto`, se corta. Sin los modelos, el fichaje
 *   facial falla recién cuando alguien lo usa, y es la función principal
 *   de la terminal de planta.
 */
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const estricto = process.argv.includes('--estricto');
const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const origen = join(raiz, 'node_modules/@vladmandic/face-api/model');
const destino = join(raiz, 'public/models');

/** Detector de caras + landmarks + descriptor. Nada más. */
const ARCHIVOS = [
  'tiny_face_detector_model-weights_manifest.json',
  'tiny_face_detector_model.bin',
  'face_landmark_68_model-weights_manifest.json',
  'face_landmark_68_model.bin',
  'face_recognition_model-weights_manifest.json',
  'face_recognition_model.bin',
];

const fallar = (mensaje) => {
  if (estricto) {
    console.error(`[iseo-rh] ${mensaje}`);
    console.error(
      '[iseo-rh] Sin los modelos, el fichaje por reconocimiento facial no funciona.'
    );
    process.exit(1);
  }
  console.warn(`[iseo-rh] ${mensaje} (se saltea; no es fatal en install)`);
  process.exit(0);
};

if (!existsSync(origen)) {
  fallar('No encontré los modelos de @vladmandic/face-api en node_modules.');
}

try {
  mkdirSync(destino, { recursive: true });
  ARCHIVOS.forEach((archivo) =>
    copyFileSync(join(origen, archivo), join(destino, archivo))
  );
} catch (e) {
  fallar(`No pude copiar los modelos faciales: ${e.message}`);
}

// Verificación final: que estén todos y ninguno haya quedado vacío.
const faltante = ARCHIVOS.find((archivo) => {
  const ruta = join(destino, archivo);
  return !existsSync(ruta) || statSync(ruta).size === 0;
});
if (faltante) {
  fallar(`El modelo "${faltante}" quedó vacío o no se escribió.`);
}

if (estricto) {
  const mb = (
    ARCHIVOS.reduce((acc, a) => acc + statSync(join(destino, a)).size, 0) /
    1024 /
    1024
  ).toFixed(1);
  console.log(`[iseo-rh] Modelos faciales listos en public/models (${mb} MB).`);
}
