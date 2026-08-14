/**
 * Qué cuida este archivo: que la identificación de dispositivo no mienta
 * y que la clasificación de homologación no ascienda a nadie de más.
 *
 * Los dos importan por el mismo motivo. La política de "estos modelos
 * están homologados para terminal de fichaje" se va a escribir con la
 * salida de estas funciones: si Samsung Internet se reporta como Chrome,
 * o si una tablet sin WebGL sale como "compatible", la tabla de
 * homologación queda mal y nadie lo nota hasta que hay una terminal
 * comprada que no sirve.
 */

import {
  clasificarDispositivo,
  ETIQUETA_NIVEL,
  identificarFabricante,
  identificarNavegador,
  TOPES,
  type RequisitosMedidos,
  type SondaDispositivo,
} from '@/lib/facial/diagnostico';

const UA = {
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  samsungInternet:
    'Mozilla/5.0 (Linux; Android 12; SM-T500) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/21.0 Chrome/110.0.0.0 Safari/537.36',
  webview:
    'Mozilla/5.0 (Linux; Android 11; SM-T290 Build/RP1A.200720.012; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/95.0.4638.74 Safari/537.36',
  edgeAndroid:
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 EdgA/120.0.0.0',
  firefoxAndroid:
    'Mozilla/5.0 (Android 13; Tablet; rv:121.0) Gecko/121.0 Firefox/121.0',
  escritorio:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
};

describe('identificarNavegador', () => {
  it('no confunde Samsung Internet con Chrome', () => {
    // Samsung Internet incluye `Chrome/` en su user agent. Preguntar por
    // Chrome primero haría que toda tablet Samsung —justo el hardware
    // objetivo— se reportara mal, y se perdería la distinción que
    // importa para homologar.
    const r = identificarNavegador(UA.samsungInternet);
    expect(r.nombre).toBe('Samsung Internet');
    expect(r.version).toBe('21.0');
  });

  it('no confunde Edge con Chrome', () => {
    expect(identificarNavegador(UA.edgeAndroid).nombre).toBe('Edge');
  });

  it('detecta el WebView embebido y no lo llama Chrome', () => {
    // Un WebView cuya versión la fija la app anfitriona se comporta como
    // otro dispositivo: puede no traer WebGL2 ni rVFC. Reportarlo como
    // "Chrome 95" escondería exactamente eso.
    const r = identificarNavegador(UA.webview);
    expect(r.esWebView).toBe(true);
    expect(r.nombre).toBe('Android WebView');
    expect(r.version).toBe('95.0.4638.74');
  });

  it('reconoce Chrome de Android como navegador, no como WebView', () => {
    const r = identificarNavegador(UA.chromeAndroid);
    expect(r.nombre).toBe('Chrome');
    expect(r.esWebView).toBe(false);
  });

  it('reconoce Firefox', () => {
    expect(identificarNavegador(UA.firefoxAndroid).nombre).toBe('Firefox');
  });

  it('devuelve null en vez de adivinar con un user agent desconocido', () => {
    expect(identificarNavegador('algo/1.0').nombre).toBeNull();
  });
});

describe('identificarFabricante', () => {
  it('reconoce Samsung por el código de modelo SM-', () => {
    expect(identificarFabricante('SM-X200', '')).toBe('Samsung');
  });

  it('reconoce Samsung por el user agent aunque no haya modelo', () => {
    expect(identificarFabricante(null, UA.samsungInternet)).toBe('Samsung');
  });

  it('reconoce Lenovo por el código TB-', () => {
    expect(identificarFabricante('TB-X606F', '')).toBe('Lenovo');
  });

  it('devuelve null si no reconoce, en vez de inventar', () => {
    expect(identificarFabricante('XYZ-999', 'Mozilla/5.0')).toBeNull();
  });
});

/** Sonda de una tablet sana, para partir de ahí en cada caso. */
const sonda = (s: Partial<SondaDispositivo> = {}): SondaDispositivo => ({
  userAgent: UA.chromeAndroid,
  modelo: 'SM-X200',
  fabricante: 'Samsung',
  plataforma: 'Android',
  android: '13',
  navegador: 'Chrome',
  navegadorVersion: '120.0.0.0',
  esWebView: false,
  arquitectura: 'arm64',
  nucleos: 8,
  memoriaGb: 4,
  webgl: 'webgl2',
  gpu: 'Mali-G52',
  webgpu: false,
  wasm: true,
  wasmSimd: true,
  aislado: false,
  contextoSeguro: true,
  memoriaJsMb: 120,
  soporta: {
    requestVideoFrameCallback: true,
    offscreenCanvas: true,
    worker: true,
    getUserMedia: true,
  },
  ...s,
});

const medido = (m: Partial<RequisitosMedidos> = {}): RequisitosMedidos => ({
  msPercepcion: 14,
  msDescriptor: 70,
  fps: 14,
  anchoCamara: 1280,
  ...m,
});

describe('clasificarDispositivo', () => {
  it('con todo en orden llega a "rendimiento"', () => {
    const v = clasificarDispositivo(sonda(), medido());
    expect(v.nivel).toBe('rendimiento');
    expect(v.bloqueos).toEqual([]);
  });

  it('NUNCA otorga "homologado" por sí sola', () => {
    // Homologar exige la calibración con personas reales y una jornada
    // de kiosco. Un script no puede certificar ninguna de las dos, y si
    // pudiera devolver ese nivel alguien lo tomaría como suficiente.
    const v = clasificarDispositivo(sonda(), medido());
    expect(v.nivel).not.toBe('homologado');
  });

  it.each([
    ['sin contexto seguro', { contextoSeguro: false }],
    ['sin cámara', { soporta: { ...sonda().soporta, getUserMedia: false } }],
    ['sin WebAssembly', { wasm: false }],
    ['sin WebGL', { webgl: null }],
  ])('marca incompatible: %s', (_, cambio) => {
    const v = clasificarDispositivo(
      sonda(cambio as Partial<SondaDispositivo>),
      medido()
    );
    expect(v.nivel).toBe('incompatible');
    expect(v.bloqueos.length).toBeGreaterThan(0);
  });

  it('un dispositivo incompatible no reporta faltantes de rendimiento', () => {
    // Si no hay WebGL, decir además "el descriptor tarda demasiado" es
    // ruido: hay una sola cosa que arreglar y es la primera.
    const v = clasificarDispositivo(
      sonda({ webgl: null }),
      medido({ msDescriptor: 4000 })
    );
    expect(v.bloqueos).toHaveLength(1);
  });

  it.each([
    ['percepción lenta', { msPercepcion: TOPES.msPercepcion + 10 }],
    ['descriptor lento', { msDescriptor: TOPES.msDescriptor + 50 }],
    ['pocos FPS', { fps: TOPES.fps - 3 }],
    ['cámara de baja resolución', { anchoCamara: TOPES.anchoCamara - 160 }],
  ])('baja a "funcional" por %s', (_, cambio) => {
    const v = clasificarDispositivo(sonda(), medido(cambio));
    expect(v.nivel).toBe('funcional');
    expect(v.bloqueos.length).toBeGreaterThan(0);
  });

  it('sin medir no asciende: lo trata como faltante', () => {
    // Un dispositivo del que no se midió nada no puede pasar por bueno.
    const v = clasificarDispositivo(
      sonda(),
      medido({
        msPercepcion: null,
        msDescriptor: null,
        fps: null,
        anchoCamara: null,
      })
    );
    expect(v.nivel).toBe('funcional');
    expect(v.bloqueos).toHaveLength(4);
  });

  it('degrada a advertencia, no a bloqueo, lo que sólo hace más lento', () => {
    const v = clasificarDispositivo(
      sonda({
        webgl: 'webgl1',
        wasmSimd: false,
        esWebView: true,
        arquitectura: 'arm-32',
        memoriaGb: 2,
        soporta: {
          requestVideoFrameCallback: false,
          offscreenCanvas: false,
          worker: true,
          getUserMedia: true,
        },
      }),
      medido()
    );
    expect(v.nivel).toBe('rendimiento');
    expect(v.advertencias.length).toBeGreaterThanOrEqual(5);
  });

  it('tiene etiqueta para cada nivel', () => {
    expect(Object.values(ETIQUETA_NIVEL).every((t) => t.length > 0)).toBe(true);
  });
});
