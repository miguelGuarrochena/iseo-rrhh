/**
 * Copia el worker de pdf.js a public/.
 *
 * pdf.js necesita correr su parser en un Web Worker y hay que decirle de
 * dónde bajarlo. Servirlo desde public/ evita dos problemas: depender de
 * un CDN externo (la carga masiva de recibos tiene que funcionar aunque
 * la planta tenga internet malo) y que la versión del worker se
 * desincronice de la de la librería, que hace fallar la lectura con un
 * error críptico.
 *
 * Corre dos veces, con exigencias distintas:
 *
 * - En `postinstall`, tolerante: si pdfjs-dist todavía no está instalado
 *   (por el orden en que npm resuelve las cosas) no tiene sentido cortar
 *   la instalación.
 * - En `build` con `--estricto`, se corta. Sin el archivo, la carga
 *   masiva de recibos falla recién cuando alguien la usa, con un error
 *   de worker que no se entiende. Mejor que reviente el deploy.
 */
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const estricto = process.argv.includes('--estricto');
const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const origen = join(raiz, 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs');
const destino = join(raiz, 'public/pdf.worker.min.mjs');

const fallar = (mensaje) => {
  if (estricto) {
    console.error(`[iseo-rh] ${mensaje}`);
    console.error(
      '[iseo-rh] Sin el worker, la carga masiva de recibos no puede leer los PDF.'
    );
    process.exit(1);
  }
  console.warn(`[iseo-rh] ${mensaje} (se saltea; no es fatal en install)`);
  process.exit(0);
};

if (!existsSync(origen)) {
  fallar('No encontré el worker de pdfjs-dist en node_modules.');
}

try {
  mkdirSync(dirname(destino), { recursive: true });
  copyFileSync(origen, destino);
} catch (e) {
  fallar(`No pude copiar el worker de pdf.js: ${e.message}`);
}

// Verificación final: que el archivo haya quedado y no esté vacío.
if (!existsSync(destino) || statSync(destino).size === 0) {
  fallar('El worker quedó vacío o no se escribió.');
}

if (estricto) {
  const kb = Math.round(statSync(destino).size / 1024);
  console.log(`[iseo-rh] Worker de pdf.js listo en public/ (${kb} KB).`);
}
