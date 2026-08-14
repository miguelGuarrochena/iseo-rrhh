/**
 * Modo diagnóstico y sonda de dispositivo.
 *
 * Por qué existe
 * -------------
 * Todo el problema del módulo facial se venía diagnosticando a ciegas.
 * "No anda en la Samsung" puede ser: WebGL degradado, cámara que entrega
 * menos resolución de la que dice, backend caído a CPU, contraluz, o un
 * enrolamiento malo. Sin datos, cada hipótesis cuesta un día y ninguna
 * se descarta.
 *
 * Esto junta, en la tablet real y sin ninguna imagen ni descriptor, lo
 * que hace falta para separar esas causas. Es la diferencia entre
 * "probemos bajar la resolución" y saber qué hay que arreglar.
 *
 * Cómo se activa sin ensuciar producción
 * --------------------------------------
 * Con `?diag=1` en la URL, o dejando `iseo_facial_diag` en
 * `localStorage`. No hay ningún botón ni indicio en la interfaz normal:
 * la persona que ficha no tiene por qué ver latencias de inferencia.
 */

const CLAVE = 'iseo_facial_diag';

/**
 * ¿Está activo el modo diagnóstico?
 *
 * El parámetro de URL además **persiste** la elección: en una tablet de
 * planta uno llega con la URL una sola vez y después necesita que siga
 * activo mientras dura la prueba, sin volver a tipear nada.
 */
export const diagnosticoActivo = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    const param = new URLSearchParams(window.location.search).get('diag');
    if (param === '1') {
      window.localStorage.setItem(CLAVE, '1');
      return true;
    }
    if (param === '0') {
      window.localStorage.removeItem(CLAVE);
      return false;
    }
    return window.localStorage.getItem(CLAVE) === '1';
  } catch {
    return false;
  }
};

export interface SondaDispositivo {
  userAgent: string;
  /** Modelo del dispositivo, si el navegador lo declara. */
  modelo: string | null;
  /** Fabricante: Samsung, Lenovo, Xiaomi… Sale de la marca o del modelo. */
  fabricante: string | null;
  plataforma: string | null;
  /** Versión de Android, o null si no es Android. */
  android: string | null;
  /** Motor: Chrome, Samsung Internet, WebView de Android, Firefox… */
  navegador: string | null;
  navegadorVersion: string | null;
  /**
   * `true` si corre dentro de un WebView embebido y no en un navegador.
   *
   * Importa mucho para una terminal de fichaje: un WebView viejo puede
   * no traer WebGL2 ni `requestVideoFrameCallback`, y su versión la fija
   * la app anfitriona, no el usuario. Una tablet "con Chrome 120" que en
   * realidad ejecuta un WebView 90 se comporta como un dispositivo
   * completamente distinto.
   */
  esWebView: boolean;
  /** Arquitectura de CPU declarada (arm64, arm, x86…). */
  arquitectura: string | null;
  /** Núcleos lógicos. Da una idea del techo con backend de CPU. */
  nucleos: number | null;
  /** GB de RAM que declara el navegador (redondeado por privacidad). */
  memoriaGb: number | null;
  webgl: 'webgl2' | 'webgl1' | null;
  /** Cadena del driver de GPU. Es lo que distingue Mali de Adreno. */
  gpu: string | null;
  webgpu: boolean;
  wasm: boolean;
  wasmSimd: boolean;
  /** Cross-origin isolation: sin esto no hay WASM con hilos. */
  aislado: boolean;
  contextoSeguro: boolean;
  memoriaJsMb: number | null;
  /**
   * APIs de las que depende el pipeline. Si alguna falta, el motor
   * funciona igual pero peor, y conviene saberlo antes de homologar.
   */
  soporta: {
    /** Sin esto el bucle cae a `requestAnimationFrame` y trabaja de más. */
    requestVideoFrameCallback: boolean;
    /** Sin esto no hay Worker con WebGL: el descriptor va al hilo principal. */
    offscreenCanvas: boolean;
    worker: boolean;
    getUserMedia: boolean;
  };
}

/** Prueba de SIMD: el módulo WASM más chico que usa una instrucción v128. */
const BINARIO_SIMD = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8,
  0, 65, 0, 253, 15, 253, 98, 11,
]);

const sondearWebgl = (): {
  version: 'webgl2' | 'webgl1' | null;
  gpu: string | null;
} => {
  if (typeof document === 'undefined') return { version: null, gpu: null };
  const canvas = document.createElement('canvas');
  const gl =
    (canvas.getContext('webgl2') as WebGL2RenderingContext | null) ??
    (canvas.getContext('webgl') as WebGLRenderingContext | null);
  if (!gl) return { version: null, gpu: null };

  let gpu: string | null = null;
  try {
    // `WEBGL_debug_renderer_info` es lo único que distingue un Mali-G52
    // de un Adreno 610, y esa diferencia es la que explica por qué el
    // mismo código va bien en una tablet y mal en otra. Algunos
    // navegadores lo restringen por huella digital; si no está, se
    // informa null en vez de inventar.
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) gpu = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string;
  } catch {
    gpu = null;
  }

  const version =
    typeof WebGL2RenderingContext !== 'undefined' &&
    gl instanceof WebGL2RenderingContext
      ? ('webgl2' as const)
      : ('webgl1' as const);

  // El contexto se suelta enseguida: Chrome tiene un tope de contextos
  // WebGL vivos por pestaña, y sondear no puede gastarse uno de los que
  // después necesita el pipeline.
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return { version, gpu };
};

/**
 * Identifica navegador y versión a partir del user agent.
 *
 * El orden de las pruebas no es negociable: casi todos los navegadores
 * de Android mienten diciendo que son Chrome. Samsung Internet incluye
 * `Chrome/` **y** `SamsungBrowser/`; Edge incluye `Chrome/` y `EdgA/`.
 * Si se preguntara por Chrome primero, toda tablet Samsung se reportaría
 * como Chrome y se perdería justamente la distinción que importa para
 * homologar.
 *
 * El WebView se reconoce por `wv` dentro del token de Android, o por la
 * ausencia del token `Chrome/` junto con la presencia de `Version/`.
 */
export const identificarNavegador = (
  ua: string
): { nombre: string | null; version: string | null; esWebView: boolean } => {
  const capturar = (re: RegExp): string | null => ua.match(re)?.[1] ?? null;

  // `; wv)` es la marca que Android agrega al user agent de un WebView.
  const esWebView = /;\s*wv\)/.test(ua) || /\bwv\b/.test(ua);

  if (/SamsungBrowser\//.test(ua)) {
    return {
      nombre: 'Samsung Internet',
      version: capturar(/SamsungBrowser\/([\d.]+)/),
      esWebView,
    };
  }
  if (/EdgA?\//.test(ua)) {
    return { nombre: 'Edge', version: capturar(/EdgA?\/([\d.]+)/), esWebView };
  }
  if (/OPR\//.test(ua)) {
    return { nombre: 'Opera', version: capturar(/OPR\/([\d.]+)/), esWebView };
  }
  if (/Firefox\//.test(ua)) {
    return {
      nombre: 'Firefox',
      version: capturar(/Firefox\/([\d.]+)/),
      esWebView,
    };
  }
  if (/Chrome\//.test(ua)) {
    return {
      nombre: esWebView ? 'Android WebView' : 'Chrome',
      version: capturar(/Chrome\/([\d.]+)/),
      esWebView,
    };
  }
  if (/Safari\//.test(ua)) {
    return {
      nombre: 'Safari',
      version: capturar(/Version\/([\d.]+)/),
      esWebView,
    };
  }
  return { nombre: null, version: null, esWebView };
};

/**
 * Fabricante a partir del modelo o del user agent.
 *
 * Los códigos de modelo de Samsung empiezan con `SM-`; los de Lenovo con
 * `TB-` o `Lenovo`. No es exhaustivo ni pretende serlo: sirve para
 * agrupar en la tabla de homologación, y cuando no reconoce el prefijo
 * informa null en vez de adivinar.
 */
export const identificarFabricante = (
  modelo: string | null,
  ua: string
): string | null => {
  const texto = `${modelo ?? ''} ${ua}`;
  const marcas: Array<[RegExp, string]> = [
    [/\bSM-[A-Z]|\bSamsung\b|SamsungBrowser/i, 'Samsung'],
    [/\bTB-[A-Z0-9]|\bLenovo\b/i, 'Lenovo'],
    [/\bRedmi\b|\bXiaomi\b|\bPOCO\b|\bMI PAD\b/i, 'Xiaomi'],
    [/\bHuawei\b|\bHonor\b/i, 'Huawei'],
    [/\bMotorola\b|\bmoto\b/i, 'Motorola'],
    [/\bPixel\b/i, 'Google'],
    [/\bNokia\b/i, 'Nokia'],
    [/\bTCL\b|\bAlcatel\b/i, 'TCL'],
    [/\biPad\b|\biPhone\b|Macintosh/i, 'Apple'],
  ];
  return marcas.find(([re]) => re.test(texto))?.[1] ?? null;
};

export const sondearDispositivo = async (): Promise<SondaDispositivo> => {
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  const { version, gpu } = sondearWebgl();

  let wasmSimd = false;
  try {
    wasmSimd = WebAssembly.validate(BINARIO_SIMD);
  } catch {
    wasmSimd = false;
  }

  let webgpu = false;
  try {
    const gpuApi = (
      nav as unknown as { gpu?: { requestAdapter: () => Promise<unknown> } }
    )?.gpu;
    // No alcanza con que exista `navigator.gpu`: en varias tablets
    // Android el objeto está y `requestAdapter()` devuelve null porque
    // el driver está en la lista de bloqueo. Preguntar por el adaptador
    // es la única forma de saberlo de verdad.
    webgpu = gpuApi ? (await gpuApi.requestAdapter()) !== null : false;
  } catch {
    webgpu = false;
  }

  const ua = nav?.userAgent ?? '';
  const conMarca = nav as unknown as {
    userAgentData?: {
      platform?: string;
      getHighEntropyValues?: (h: string[]) => Promise<{
        model?: string;
        platformVersion?: string;
        architecture?: string;
        bitness?: string;
      }>;
    };
    deviceMemory?: number;
    hardwareConcurrency?: number;
  } | null;

  let modelo: string | null = null;
  let plataformaVersion: string | null = null;
  let arquitectura: string | null = null;
  try {
    const alta = await conMarca?.userAgentData?.getHighEntropyValues?.([
      'model',
      'platformVersion',
      'architecture',
      'bitness',
    ]);
    modelo = alta?.model || null;
    plataformaVersion = alta?.platformVersion || null;
    arquitectura = alta?.architecture
      ? `${alta.architecture}${alta.bitness ? `-${alta.bitness}` : ''}`
      : null;
  } catch {
    modelo = null;
  }
  // Respaldo: en Android el modelo viene dentro del user agent, entre el
  // nivel de API y el "Build/". Es feo pero es el único dato que hay en
  // los navegadores que no exponen `userAgentData`.
  if (!modelo) {
    const m = ua.match(/;\s*([^;)]+)\s+Build\//);
    modelo = m ? m[1].trim() : null;
  }

  // La versión de Android: primero la que declara `userAgentData` (que en
  // Chrome moderno es la buena), y si no está, la del user agent.
  const android =
    (/Android/i.test(ua) || conMarca?.userAgentData?.platform === 'Android'
      ? (plataformaVersion ?? ua.match(/Android\s+([\d.]+)/)?.[1] ?? null)
      : null) || null;

  // La arquitectura no la expone ningún navegador de Android por
  // `userAgentData` (sólo escritorio). El user agent sí distingue el
  // 32 bits, que es el dato que importa: un WebView de 32 bits tiene un
  // techo de memoria mucho más bajo y es donde primero se cae el modelo.
  if (!arquitectura && /Android/i.test(ua)) {
    arquitectura = /aarch64|arm64/i.test(ua)
      ? 'arm64'
      : /armv7|armv8l|\barm\b/i.test(ua)
        ? 'arm-32'
        : /x86_64/i.test(ua)
          ? 'x86-64'
          : /x86|i686/i.test(ua)
            ? 'x86-32'
            : null;
  }

  const navegador = identificarNavegador(ua);

  const memoria = (
    performance as unknown as { memory?: { usedJSHeapSize: number } }
  ).memory;

  return {
    userAgent: ua,
    modelo,
    fabricante: identificarFabricante(modelo, ua),
    plataforma: conMarca?.userAgentData?.platform ?? nav?.platform ?? null,
    android,
    navegador: navegador.nombre,
    navegadorVersion: navegador.version,
    esWebView: navegador.esWebView,
    arquitectura,
    nucleos: conMarca?.hardwareConcurrency ?? null,
    memoriaGb: conMarca?.deviceMemory ?? null,
    webgl: version,
    gpu,
    webgpu,
    wasm: typeof WebAssembly !== 'undefined',
    wasmSimd,
    aislado:
      typeof globalThis.crossOriginIsolated === 'boolean'
        ? globalThis.crossOriginIsolated
        : false,
    contextoSeguro:
      typeof window !== 'undefined' ? window.isSecureContext !== false : false,
    memoriaJsMb: memoria
      ? Math.round(memoria.usedJSHeapSize / 1024 / 1024)
      : null,
    soporta: {
      requestVideoFrameCallback:
        typeof HTMLVideoElement !== 'undefined' &&
        'requestVideoFrameCallback' in HTMLVideoElement.prototype,
      offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
      worker: typeof Worker !== 'undefined',
      getUserMedia: Boolean(nav?.mediaDevices?.getUserMedia),
    },
  };
};

// ---------------------------------------------------------------------
// Homologación
// ---------------------------------------------------------------------

/**
 * Los tres niveles que pidió el negocio, y que **no** son lo mismo.
 *
 * - `funcional`: el pipeline arranca y produce descriptores. Que ande no
 *   quiere decir que sirva.
 * - `rendimiento`: además cumple los tiempos para que una fila avance.
 * - `homologado`: además se midió con personas reales y quedó estable en
 *   una jornada. **Este nivel no lo puede otorgar un script**: exige la
 *   corrida de calibración y las horas de kiosco. Por eso la función de
 *   abajo nunca lo devuelve sola.
 */
export type NivelHomologacion =
  | 'incompatible'
  | 'funcional'
  | 'rendimiento'
  | 'homologado';

export interface RequisitosMedidos {
  /** Latencia p50 de MediaPipe, en ms. */
  msPercepcion: number | null;
  /** Latencia p50 del descriptor, en ms. */
  msDescriptor: number | null;
  /** Cuadros por segundo sostenidos del bucle. */
  fps: number | null;
  /** Ancho real que entrega la cámara. */
  anchoCamara: number | null;
}

export interface VeredictoHomologacion {
  nivel: NivelHomologacion;
  /** Motivos por los que no alcanza el nivel siguiente. */
  bloqueos: string[];
  advertencias: string[];
}

/**
 * Topes de rendimiento.
 *
 * **Estos números no son requisitos mínimos de hardware.** Son los
 * tiempos que el pipeline necesita para que una persona no espere; qué
 * dispositivos los cumplen es justamente lo que hay que medir con esta
 * herramienta, no algo que se pueda declarar de antemano. Por eso acá no
 * hay ninguna afirmación del tipo "Android 10 y 4 GB": esa tabla se
 * escribe **después** de correr el diagnóstico en cada modelo.
 *
 * De dónde sale cada uno:
 * - `msPercepcion`: a 15 cuadros por segundo el presupuesto por cuadro es
 *   66 ms; 25 ms deja margen para la puerta de calidad y el repintado.
 * - `msDescriptor`: con 3 muestras y 220 ms de separación, 120 ms por
 *   descriptor mantiene el reconocimiento por debajo del segundo.
 * - `fps`: por debajo de 8 la confirmación temporal de 3 cuadros tarda
 *   más de lo que la gente tolera parada frente a la cámara.
 * - `anchoCamara`: con menos de 640 px, una cara a un metro no llega al
 *   mínimo de distancia interocular que el modelo puede usar.
 */
export const TOPES = {
  msPercepcion: 25,
  msDescriptor: 120,
  fps: 8,
  anchoCamara: 640,
} as const;

/**
 * Clasifica un dispositivo con lo medido.
 *
 * Devuelve como mucho `rendimiento`: `homologado` se otorga a mano, tras
 * la calibración y la corrida de jornada, y queda asentado en el
 * documento de homologación. Un script no puede certificar que una
 * tablet aguantó ocho horas.
 */
export const clasificarDispositivo = (
  sonda: SondaDispositivo,
  medido: RequisitosMedidos
): VeredictoHomologacion => {
  const bloqueos: string[] = [];
  const advertencias: string[] = [];

  if (!sonda.contextoSeguro) {
    bloqueos.push(
      'Sin contexto seguro (https). El navegador no habilita la cámara.'
    );
  }
  if (!sonda.soporta.getUserMedia) bloqueos.push('Sin acceso a la cámara.');
  if (!sonda.wasm) bloqueos.push('Sin WebAssembly: MediaPipe no puede correr.');
  if (!sonda.webgl) {
    bloqueos.push(
      'Sin WebGL: el descriptor caería a CPU pura, del orden de segundos por inferencia.'
    );
  }

  if (bloqueos.length > 0)
    return { nivel: 'incompatible', bloqueos, advertencias };

  // Advertencias: no impiden funcionar, pero degradan.
  if (sonda.webgl === 'webgl1') {
    advertencias.push(
      'Sólo WebGL 1. MediaPipe puede caer al delegado de CPU y multiplicar la latencia.'
    );
  }
  if (!sonda.wasmSimd) {
    advertencias.push(
      'Sin WASM SIMD: se baja el binario sin SIMD, bastante más lento.'
    );
  }
  if (!sonda.soporta.offscreenCanvas || !sonda.soporta.worker) {
    advertencias.push(
      'Sin OffscreenCanvas o sin Worker: el descriptor corre en el hilo principal y la pantalla se congela durante la inferencia.'
    );
  }
  if (!sonda.soporta.requestVideoFrameCallback) {
    advertencias.push(
      'Sin requestVideoFrameCallback: el bucle usa requestAnimationFrame y procesa cuadros repetidos (más batería y temperatura).'
    );
  }
  if (sonda.esWebView) {
    advertencias.push(
      'Corre en un WebView embebido: la versión del motor la fija la app anfitriona, no el usuario.'
    );
  }
  if (sonda.arquitectura === 'arm-32' || sonda.arquitectura === 'x86-32') {
    advertencias.push(
      'Motor de 32 bits: techo de memoria bajo para 10 MB de modelos más las texturas.'
    );
  }
  if (sonda.memoriaGb !== null && sonda.memoriaGb < 3) {
    advertencias.push(
      `Sólo ${sonda.memoriaGb} GB de RAM declarados: riesgo de que el sistema descarte la pestaña.`
    );
  }

  const faltantes: string[] = [];
  const exigir = (
    valor: number | null,
    tope: number,
    comparar: 'menor' | 'mayor',
    etiqueta: string,
    unidad: string
  ) => {
    if (valor === null) {
      faltantes.push(`${etiqueta}: sin medir`);
      return;
    }
    const cumple = comparar === 'menor' ? valor <= tope : valor >= tope;
    if (!cumple) {
      faltantes.push(
        `${etiqueta}: ${valor}${unidad} (se necesita ${comparar === 'menor' ? '≤' : '≥'} ${tope}${unidad})`
      );
    }
  };

  exigir(medido.msPercepcion, TOPES.msPercepcion, 'menor', 'Percepción', ' ms');
  exigir(medido.msDescriptor, TOPES.msDescriptor, 'menor', 'Descriptor', ' ms');
  exigir(medido.fps, TOPES.fps, 'mayor', 'FPS del bucle', '');
  exigir(
    medido.anchoCamara,
    TOPES.anchoCamara,
    'mayor',
    'Ancho de cámara',
    ' px'
  );

  return {
    nivel: faltantes.length === 0 ? 'rendimiento' : 'funcional',
    bloqueos: faltantes,
    advertencias,
  };
};

export const ETIQUETA_NIVEL: Record<NivelHomologacion, string> = {
  incompatible: 'No compatible',
  funcional: 'Compatible, rendimiento insuficiente',
  rendimiento: 'Rendimiento aceptable (falta calibrar y probar jornada)',
  homologado: 'Homologado',
};
