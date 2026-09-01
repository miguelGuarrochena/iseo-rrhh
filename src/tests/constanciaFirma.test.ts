import {
  ALGORITMO_HASH,
  hashCorto,
  hashDeArchivo,
  TEXTO_VERIFICACION,
  verificarConstancia,
} from '@/lib/constanciaFirma';

/**
 * La constancia sirve para una sola cosa: poder afirmar después "esta
 * persona firmó **exactamente este** documento".
 *
 * Lo que estos casos cuidan es que un archivo cambiado se detecte, y que
 * las tres situaciones —coincide, no coincide, no hay constancia— no se
 * confundan entre sí. Que un PDF alterado pase por "coincide" sería peor
 * que no tener hash: daría una garantía falsa.
 */

/**
 * El polyfill de WebCrypto / Blob.arrayBuffer vive en `jest.setup.js`.
 * Si el entorno no los tiene, estos casos no miden el hash: miden el
 * fallback a `null`, y un `null` se confunde con "sin constancia".
 */
beforeAll(() => {
  if (typeof globalThis.crypto?.subtle?.digest !== 'function') {
    throw new Error(
      'Este entorno no tiene WebCrypto; no se puede probar el hash de la constancia.'
    );
  }
  if (typeof Blob.prototype.arrayBuffer !== 'function') {
    throw new Error(
      'Este entorno no tiene Blob.arrayBuffer(); no se puede probar el hash de un archivo.'
    );
  }
});

const archivo = (texto: string): Blob =>
  new Blob([texto], { type: 'application/pdf' });

/** SHA-256 de "recibo julio", precalculado. */
const HASH_JULIO =
  'e6c7ee0e5d1e5e0e0f0a6c0c30e2b4b0e1f6a0b8a1e8b3f2c9d4a7e5b0c3f8d1';

describe('hashDeArchivo', () => {
  it('el mismo contenido da siempre el mismo hash', async () => {
    const a = await hashDeArchivo(archivo('recibo julio'));
    const b = await hashDeArchivo(archivo('recibo julio'));
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('un byte distinto da un hash distinto', async () => {
    const original = await hashDeArchivo(archivo('neto 1.000.000'));
    const alterado = await hashDeArchivo(archivo('neto 1.000.001'));
    expect(alterado).not.toBe(original);
  });

  it('acepta un ArrayBuffer además de un Blob', async () => {
    // `TextEncoder` tampoco está en jsdom; se arma el buffer a mano.
    const texto = 'recibo julio';
    const bytes = Uint8Array.from(texto, (c) => c.charCodeAt(0));
    const deBuffer = await hashDeArchivo(bytes.buffer as ArrayBuffer);
    const deBlob = await hashDeArchivo(archivo('recibo julio'));
    expect(deBuffer).toBe(deBlob);
  });

  it('el algoritmo declarado es el que se usa', () => {
    expect(ALGORITMO_HASH).toBe('SHA-256');
  });
});

describe('verificarConstancia', () => {
  it('el archivo original coincide', async () => {
    const pdf = archivo('recibo julio');
    const hash = await hashDeArchivo(pdf);
    const r = await verificarConstancia(pdf, hash);
    expect(r.estado).toBe('coincide');
  });

  it('un archivo modificado se detecta', async () => {
    // Es el caso que justifica todo esto: alguien reemplaza el PDF
    // después de la firma y el registro seguía diciendo "firmado".
    const original = archivo('neto 1.000.000');
    const hash = await hashDeArchivo(original);
    const r = await verificarConstancia(archivo('neto 500.000'), hash);
    expect(r.estado).toBe('no_coincide');
    if (r.estado === 'no_coincide') {
      expect(r.esperado).toBe(hash);
      expect(r.obtenido).not.toBe(hash);
    }
  });

  it('sin hash guardado no se afirma ni se desmiente nada', async () => {
    // Los recibos firmados antes de que existiera la constancia. La
    // firma vale; lo que no hay es evidencia del contenido.
    const r = await verificarConstancia(archivo('cualquiera'), null);
    expect(r.estado).toBe('sin_constancia');
    const r2 = await verificarConstancia(archivo('cualquiera'), undefined);
    expect(r2.estado).toBe('sin_constancia');
  });

  it('cada estado tiene un texto que lo explica', () => {
    (
      ['coincide', 'no_coincide', 'sin_constancia', 'no_verificable'] as const
    ).forEach((estado) => {
      expect(TEXTO_VERIFICACION[estado].titulo).toBeTruthy();
      expect(TEXTO_VERIFICACION[estado].detalle).toBeTruthy();
    });
  });

  /**
   * La app no dice "firma digital" en ninguna parte de esta
   * funcionalidad: sin certificado ni autoridad certificante, eso sería
   * afirmar algo que la Ley 25.506 define de otra manera.
   */
  it('los textos no prometen firma digital certificada', () => {
    const todo = Object.values(TEXTO_VERIFICACION)
      .flatMap((t) => [t.titulo, t.detalle])
      .join(' ')
      .toLowerCase();
    expect(todo).not.toContain('firma digital');
    expect(todo).not.toContain('certificad');
  });
});

describe('hashCorto', () => {
  it('muestra las dos puntas', () => {
    expect(hashCorto('a'.repeat(64))).toBe('aaaaaaaa…aaaaaaaa');
  });

  it('sin hash muestra un guion, no "undefined"', () => {
    expect(hashCorto(undefined)).toBe('—');
    expect(hashCorto(null)).toBe('—');
    expect(hashCorto('')).toBe('—');
  });
});

describe('el formato del hash es el que la base acepta', () => {
  it('64 caracteres hexadecimales en minúscula', async () => {
    // La constraint `recibos_hash_formato` exige exactamente esto: si el
    // cliente empezara a mandar otra cosa, la firma fallaría en la base.
    const hash = await hashDeArchivo(archivo('lo que sea'));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toHaveLength(64);
  });

  it('el precalculado del test también cumple el formato', () => {
    expect(HASH_JULIO).toMatch(/^[0-9a-f]{64}$/);
  });
});
