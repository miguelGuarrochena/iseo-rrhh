/**
 * Qué cuida este archivo: que del enrolamiento facial **no quede ninguna
 * imagen**, ni en la base ni en el bucket ni en memoria más allá del
 * cuadro que se está procesando.
 *
 * Por qué hace falta un test y no alcanza con la revisión
 * -------------------------------------------------------
 * Es una invariante fácil de romper sin querer y muy difícil de notar.
 * Alcanza con que alguien agregue un `canvas.toDataURL()` "para
 * depurar", o con reponer un campo de foto en las opciones de fichaje,
 * para que la app empiece a guardar rostros. No falla nada, no hay
 * error, nadie se entera: sólo queda una empresa almacenando biometría
 * que dijo que no almacenaba.
 *
 * De hecho ya pasó una vez: la versión anterior de `CapturaFacial`
 * generaba un JPEG del rostro en cada captura (`toDataURL`) que ninguno
 * de sus dos consumidores usaba. Se materializaba una imagen biométrica
 * para tirarla enseguida.
 *
 * Lo que el sistema necesita guardar es la plantilla —128 números de los
 * que no se puede reconstruir la cara— y nada más.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = process.cwd();

const leerModulo = (relativo: string): string =>
  readFileSync(join(RAIZ, relativo), 'utf8');

const archivosDe = (dir: string): string[] =>
  readdirSync(join(RAIZ, dir))
    .filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'))
    .map((f) => join(dir, f));

const MODULOS_FACIALES = [
  ...archivosDe('src/lib/facial'),
  ...archivosDe('src/components/app/facial'),
];

/** Quita comentarios: lo que se busca son llamadas, no menciones. */
const sinComentarios = (fuente: string): string =>
  fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('el pipeline facial no materializa ninguna imagen', () => {
  it.each([
    ['toDataURL', /\.toDataURL\s*\(/],
    ['toBlob', /\.toBlob\s*\(/],
    ['convertToBlob', /\.convertToBlob\s*\(/],
    ['ImageCapture / takePhoto', /takePhoto\s*\(/],
  ])('ningún módulo facial usa %s', (_, patron) => {
    const culpables = MODULOS_FACIALES.filter((ruta) =>
      patron.test(sinComentarios(leerModulo(ruta)))
    );
    expect(culpables).toEqual([]);
  });

  it('ningún módulo facial sube nada a Storage', () => {
    // `getImageData` sí se usa —hace falta para medir nitidez y para
    // armar el tensor— pero esos píxeles viven en el cuadro y mueren con
    // él. Lo que no puede pasar es que salgan de la pestaña.
    const culpables = MODULOS_FACIALES.filter((ruta) => {
      const fuente = sinComentarios(leerModulo(ruta));
      return (
        /storage\s*\.\s*from\s*\(/.test(fuente) ||
        /\.upload\s*\(/.test(fuente) ||
        /subirFoto/.test(fuente)
      );
    });
    expect(culpables).toEqual([]);
  });

  it('ningún módulo facial escribe imágenes en almacenamiento local', () => {
    // localStorage / IndexedDB con una cara adentro es exactamente el
    // mismo problema que el bucket, sólo que en la tablet compartida.
    const culpables = MODULOS_FACIALES.filter((ruta) => {
      const fuente = sinComentarios(leerModulo(ruta));
      return /indexedDB|createObjectURL/.test(fuente);
    });
    expect(culpables).toEqual([]);
  });
});

describe('el enrolamiento guarda plantilla y nada más', () => {
  const enrolamiento = sinComentarios(
    leerModulo('src/lib/services/supabase/real.ts')
  );

  /** Extrae el cuerpo del `update` que hace `enrolarRostro`. */
  const cuerpoDeEnrolar = (): string => {
    const desde = enrolamiento.indexOf('export const enrolarRostro');
    expect(desde).toBeGreaterThan(-1);
    const hasta = enrolamiento.indexOf('export const borrarRostro');
    return enrolamiento.slice(desde, hasta);
  };

  it('escribe exactamente descriptor, versión y consentimiento', () => {
    const cuerpo = cuerpoDeEnrolar();
    expect(cuerpo).toMatch(/descriptor_facial:/);
    expect(cuerpo).toMatch(/descriptor_version:/);
    expect(cuerpo).toMatch(/consentimiento_biometrico:/);
  });

  it('NO escribe ninguna foto', () => {
    // Si alguien agrega `foto_url` acá, el enrolamiento pasa a guardar
    // una imagen del rostro junto a la plantilla, que es justo lo que el
    // producto promete no hacer.
    expect(cuerpoDeEnrolar()).not.toMatch(/foto_url|fotoUrl|imagen|avatar/i);
  });

  it('borrarRostro limpia descriptor, versión y consentimiento', () => {
    const desde = enrolamiento.indexOf('export const borrarRostro');
    const cuerpo = enrolamiento.slice(desde, desde + 600);
    expect(cuerpo).toMatch(/descriptor_facial:\s*null/);
    expect(cuerpo).toMatch(/descriptor_version:\s*null/);
    expect(cuerpo).toMatch(/consentimiento_biometrico:\s*null/);
  });
});

describe('el fichaje no guarda ninguna fotografía', () => {
  const real = sinComentarios(leerModulo('src/lib/services/supabase/real.ts'));

  /** Cuerpo de `ficharAhora`, que es quien inserta en `fichajes`. */
  const cuerpoDeFichar = (): string => {
    const desde = real.indexOf('export const ficharAhora');
    expect(desde).toBeGreaterThan(-1);
    const hasta = real.indexOf('export const', desde + 30);
    return real.slice(desde, hasta);
  };

  it('ficharAhora no escribe foto_url', () => {
    // La columna existe en el esquema desde julio de 2026 y nunca la usó
    // nadie, pero el cableado para escribirla estaba vivo: bastaba con
    // que un caller pasara una foto para que una imagen del rostro
    // terminara guardada junto a cada marca de asistencia.
    expect(cuerpoDeFichar()).not.toMatch(/foto_url\s*:/);
  });

  it('las opciones de fichaje no aceptan ninguna foto', async () => {
    // Chequeo de tipos: si alguien repone `fotoUrl` en `OpcionesFichaje`,
    // esto deja de compilar y el cambio se discute en vez de colarse.
    const tipos = sinComentarios(leerModulo('src/types/rrhh.ts'));
    const desde = tipos.indexOf('export interface OpcionesFichaje');
    const cuerpo = tipos.slice(desde, tipos.indexOf('}', desde));
    expect(cuerpo).not.toMatch(/fotoUrl/);
  });

  it('el modo demo tampoco guarda foto', () => {
    // El demo recorre el mismo camino que la app conectada. Si guardara
    // una foto, la pantalla de demostración mostraría un comportamiento
    // que el producto real no tiene.
    const demo = sinComentarios(leerModulo('src/lib/services/rrhh.demo.ts'));
    const desde = demo.indexOf('export const ficharAhora');
    const cuerpo = demo.slice(desde, demo.indexOf('export const', desde + 30));
    expect(cuerpo).not.toMatch(/fotoUrl\s*:/);
  });
});

describe('la plantilla no sale del servidor', () => {
  it('getDescriptoresFaciales falla ruidosamente contra el backend real', async () => {
    // FIC-011 / F-02. Con esos 128 números se ficha por REST sin cámara
    // ni prueba de vida: entregárselos a alguien equivale a darle su
    // contraseña. La función existe sólo porque `elegir()` necesita las
    // dos mitades, y lanza para que si alguien vuelve a cablearla se
    // entere acá y no cuando los templates ya estén viajando.
    const real = await import('@/lib/services/supabase/real');
    await expect(real.getDescriptoresFaciales()).rejects.toThrow(
      /no salen del servidor/i
    );
  });
});
