/**
 * Prepara en `public/facial` todo lo que el módulo de reconocimiento
 * facial necesita para funcionar **sin salir a internet en tiempo de
 * ejecución**.
 *
 * Por qué está todo servido desde el mismo origen
 * ----------------------------------------------
 * La CSP de `next.config.js` tiene `connect-src 'self'` + Supabase. Todo
 * lo que se baje de un CDN queda bloqueado por el navegador, los modelos
 * no cargan y la pantalla muestra un "revisá tu conexión" que manda a
 * buscar el problema al lugar equivocado. Además el caso real de uso es
 * la tablet de planta, que puede tener internet malo o filtrado.
 *
 * Qué se copia y por qué
 * ----------------------
 * 1. **dlib ResNet-34** (`face_recognition_model`, 6,4 MB) — el modelo
 *    que convierte una cara alineada de 150×150 en 128 números. Es el
 *    único modelo de reconocimiento facial de calidad que está en
 *    **dominio público**: su autor (Davis King) lo liberó sin
 *    condiciones. Todas las alternativas modernas —ArcFace, AdaFace,
 *    FaceNet, EdgeFace— tienen pesos restringidos a investigación no
 *    comercial, que es un bloqueante duro para un producto que se vende.
 *
 *    Ya **no** se copian `tiny_face_detector_model` ni
 *    `face_landmark_68_model`: los reemplaza MediaPipe. Además de ser
 *    peores y más lentos, sus pesos vienen de WIDER FACE
 *    (CC BY-NC-ND, "non-commercial") y de un origen no auditable.
 *
 * 2. **MediaPipe Tasks Vision** — runtime WASM + delegado GPU de Google,
 *    Apache 2.0, el mismo que usa Android nativo. Hace detección,
 *    landmarks, blendshapes y pose 3-D en una sola pasada.
 *
 * 3. **`face_landmarker.task`** (3,6 MB) — el modelo de MediaPipe. No
 *    viaja en el paquete de npm, así que se baja acá una sola vez y
 *    queda cacheado en `public/facial`. Se verifica el tamaño exacto:
 *    un modelo truncado por una red mala no falla al copiarse, falla
 *    después, en la tablet, con la fila formada adelante.
 *
 * 4. **Binarios WASM de TF.js** — el fallback cuando WebGL no está
 *    disponible o se degrada. Estaban ausentes: `@vladmandic/face-api`
 *    trae el *código* del backend `wasm` pero no sus `.wasm`, que
 *    intentaba bajar de un CDN. O sea que el escalón intermedio de la
 *    cadena de fallback no existía y un dispositivo sin WebGL caía
 *    directo a CPU pura, donde cada inferencia pasa de decenas de
 *    milisegundos a segundos.
 *
 * Corre dos veces, con exigencias distintas:
 *
 * - En `postinstall`, tolerante: si las dependencias todavía no están
 *   (por el orden en que npm resuelve las cosas) no tiene sentido
 *   cortar la instalación.
 * - En `build` con `--estricto`, se corta. Sin estos archivos el
 *   fichaje facial falla recién cuando alguien lo usa, y es la función
 *   principal de la terminal de planta.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const estricto = process.argv.includes('--estricto');
const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const publico = join(raiz, 'public', 'facial');

const fallar = (mensaje) => {
  if (estricto) {
    console.error(`[iseo-rh] ${mensaje}`);
    console.error(
      '[iseo-rh] Sin estos archivos, el fichaje por reconocimiento facial no funciona.'
    );
    process.exit(1);
  }
  console.warn(`[iseo-rh] ${mensaje} (se saltea; no es fatal en install)`);
  process.exit(0);
};

/** Copia un archivo creando el directorio destino. */
const copiar = (origen, destino) => {
  mkdirSync(dirname(destino), { recursive: true });
  copyFileSync(origen, destino);
};

// ---------------------------------------------------------------------
// 1. dlib ResNet-34 (embedding) — desde @vladmandic/face-api
// ---------------------------------------------------------------------
const DLIB = [
  'face_recognition_model-weights_manifest.json',
  'face_recognition_model.bin',
];
const origenDlib = join(raiz, 'node_modules/@vladmandic/face-api/model');

if (!existsSync(origenDlib)) {
  fallar('No encontré los modelos de @vladmandic/face-api en node_modules.');
}

try {
  DLIB.forEach((archivo) =>
    copiar(join(origenDlib, archivo), join(publico, 'dlib', archivo))
  );
} catch (e) {
  fallar(`No pude copiar el modelo de embedding: ${e.message}`);
}

// ---------------------------------------------------------------------
// 2. Runtime de MediaPipe (wasm + glue js)
// ---------------------------------------------------------------------
const origenMediapipe = join(raiz, 'node_modules/@mediapipe/tasks-vision/wasm');

if (!existsSync(origenMediapipe)) {
  fallar('No encontré el runtime de @mediapipe/tasks-vision en node_modules.');
}

/**
 * `FilesetResolver.forVisionTasks(ruta, usarModulo)` arma el nombre del
 * archivo como `vision_wasm[_module][_nosimd]_internal`. Como no
 * pasamos `usarModulo`, la variante `_module_` nunca se pide: son 11,7 MB
 * que sólo engordarían el deploy. Se copian las otras dos —la de SIMD y
 * la de respaldo sin SIMD—, que son las que el navegador elige según lo
 * que soporte.
 */
const VARIANTES_MEDIAPIPE = /^vision_wasm(_nosimd)?_internal\.(js|wasm)$/;

try {
  readdirSync(origenMediapipe)
    .filter((archivo) => VARIANTES_MEDIAPIPE.test(archivo))
    .forEach((archivo) =>
      copiar(
        join(origenMediapipe, archivo),
        join(publico, 'mediapipe', 'wasm', archivo)
      )
    );
} catch (e) {
  fallar(`No pude copiar el runtime de MediaPipe: ${e.message}`);
}

// ---------------------------------------------------------------------
// 3. Binarios WASM de TF.js (fallback de backend)
// ---------------------------------------------------------------------
const origenTfjsWasm = join(
  raiz,
  'node_modules/@tensorflow/tfjs-backend-wasm/dist'
);

if (!existsSync(origenTfjsWasm)) {
  fallar('No encontré @tensorflow/tfjs-backend-wasm en node_modules.');
}

try {
  readdirSync(origenTfjsWasm)
    .filter((a) => a.endsWith('.wasm'))
    .forEach((archivo) =>
      copiar(join(origenTfjsWasm, archivo), join(publico, 'tfjs-wasm', archivo))
    );
} catch (e) {
  fallar(`No pude copiar los binarios WASM de TF.js: ${e.message}`);
}

// ---------------------------------------------------------------------
// 4. Modelo de MediaPipe (no viaja en npm: se baja una sola vez)
// ---------------------------------------------------------------------
/**
 * Se fija la versión en la URL (`/1/`) y se verifica el tamaño exacto.
 *
 * Google publica estos modelos versionados e inmutables, así que el
 * tamaño alcanza como control de integridad y evita depender de un hash
 * que habría que actualizar a mano en cada bump. Lo que se está
 * atajando no es un atacante —el transporte es TLS— sino el caso real:
 * una descarga cortada por una red mala que deja un archivo truncado
 * que "existe" y falla recién en la tablet.
 */
const LANDMARKER = {
  archivo: 'face_landmarker.task',
  url: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  bytes: 3_758_596,
};

const destinoLandmarker = join(publico, 'mediapipe', LANDMARKER.archivo);

const bajarLandmarker = async () => {
  if (
    existsSync(destinoLandmarker) &&
    statSync(destinoLandmarker).size === LANDMARKER.bytes
  ) {
    return;
  }

  // Un archivo del tamaño equivocado es peor que ninguno: se borra antes
  // de reintentar para no dejar una versión truncada si el reintento
  // también falla.
  if (existsSync(destinoLandmarker)) rmSync(destinoLandmarker);

  let ultimoError = null;
  for (let intento = 1; intento <= 3; intento++) {
    try {
      const r = await fetch(LANDMARKER.url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const datos = Buffer.from(await r.arrayBuffer());
      if (datos.length !== LANDMARKER.bytes) {
        throw new Error(
          `tamaño inesperado: ${datos.length} B, esperaba ${LANDMARKER.bytes} B`
        );
      }
      mkdirSync(dirname(destinoLandmarker), { recursive: true });
      writeFileSync(destinoLandmarker, datos);
      return;
    } catch (e) {
      ultimoError = e;
    }
  }
  fallar(
    `No pude bajar ${LANDMARKER.archivo}: ${ultimoError?.message ?? 'error desconocido'}`
  );
};

await bajarLandmarker();

// ---------------------------------------------------------------------
// 5. Limpieza del layout viejo
// ---------------------------------------------------------------------
// `public/models` era la ubicación anterior (detector + landmarks +
// embedding de face-api). Si queda, un deploy sigue sirviendo 6,8 MB
// muertos y, peor, los dos modelos con licencia dudosa que este rediseño
// justamente saca de circulación.
const viejo = join(raiz, 'public', 'models');
if (existsSync(viejo)) rmSync(viejo, { recursive: true, force: true });

// ---------------------------------------------------------------------
// Verificación final
// ---------------------------------------------------------------------
const IMPRESCINDIBLES = [
  join(publico, 'dlib', 'face_recognition_model.bin'),
  join(publico, 'dlib', 'face_recognition_model-weights_manifest.json'),
  join(publico, 'mediapipe', 'face_landmarker.task'),
  join(publico, 'mediapipe', 'wasm', 'vision_wasm_internal.wasm'),
  join(publico, 'mediapipe', 'wasm', 'vision_wasm_internal.js'),
  join(publico, 'tfjs-wasm', 'tfjs-backend-wasm-simd.wasm'),
  join(publico, 'tfjs-wasm', 'tfjs-backend-wasm.wasm'),
];

const faltante = IMPRESCINDIBLES.find(
  (ruta) => !existsSync(ruta) || statSync(ruta).size === 0
);
if (faltante) {
  fallar(`El archivo "${faltante}" quedó vacío o no se escribió.`);
}

if (estricto) {
  const total = IMPRESCINDIBLES.reduce(
    (acc, ruta) => acc + statSync(ruta).size,
    0
  );
  console.log(
    `[iseo-rh] Modelos faciales listos en public/facial (${(total / 1024 / 1024).toFixed(1)} MB de imprescindibles).`
  );
}
