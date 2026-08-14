/**
 * Motor del reconocimiento facial: el bucle por cuadro y la máquina de
 * estados que lo gobierna.
 *
 * Qué cambia respecto del sistema anterior
 * ----------------------------------------
 * Antes el flujo era: la persona apretaba un botón, el sistema la
 * miraba cuatro segundos buscando un parpadeo, y después calculaba el
 * descriptor sobre **el cuadro que hubiera** en ese instante. Podía ser
 * uno movido, uno con la cara girada, o uno tomado mientras bajaba la
 * vista. Se descartaban veinte detecciones buenas y se fichaba con la
 * número veintiuno.
 *
 * Acá no hay botón ni cuadro final: la cámara mira continuamente, cada
 * cuadro se puntúa, y **sólo los mejores** llegan al modelo de
 * identidad. Lo que se manda al servidor es el promedio de esos mejores,
 * no una muestra suelta.
 *
 * Presupuesto de cómputo
 * ----------------------
 * Las cuatro etapas corren a frecuencias distintas a propósito:
 *
 * | Etapa | Frecuencia | Costo |
 * |---|---|---|
 * | Percepción (MediaPipe) | hasta 15/s | 5-15 ms, GPU |
 * | Puerta geométrica | igual | < 0,1 ms, JS puro |
 * | Recorte + fotometría | sólo si pasa la geometría | ~1 ms |
 * | Descriptor (Worker) | máx. 5 por fichada | 20-60 ms, fuera del hilo |
 *
 * El descriptor —que es el 85 % del costo— pasó de correr en cada cuadro
 * a correr un puñado de veces por fichada.
 */

import {
  crearLienzo,
  entraEnCuadro,
  extraerChip,
  type Lienzo,
} from './alineamiento';
import {
  CUADROS_ESTABLES,
  estadisticasDeImagen,
  evaluarCalidad,
  evaluarGeometria,
  MENSAJE_MOTIVO,
  PUNTAJE_ACEPTABLE,
  type MotivoRechazo,
  type Veredicto,
} from './calidad';
import {
  ejecutorCompartido,
  liberarEjecutorCompartido,
  type EstadoEjecutor,
} from './embedding';
import { poseDeReferencias, referenciasDeMalla } from './geometria';
import {
  cumpleDesafio,
  evaluarLiveness,
  MENSAJE_LIVENESS,
  MS_DESAFIO,
  PEDIDO_DESAFIO,
  sortearLado,
  type Exigencia,
  type Lado,
} from './liveness';
import {
  cargarPercepcion,
  estadoPercepcion,
  liberarPercepcion,
  MODELO_PERCEPCION,
  percibir,
  type EstadoPercepcion,
} from './percepcion';
import {
  dispersion,
  mejores,
  promediar,
  type MuestraCalificada,
} from './plantilla';

export type Fase =
  | 'cargando'
  | 'buscando'
  | 'encuadrando'
  | 'capturando'
  | 'desafio'
  | 'listo'
  | 'fallo';

export interface Diagnostico {
  percepcion: EstadoPercepcion;
  embedding: EstadoEjecutor;
  modeloPercepcion: string;
  /** Cuadros por segundo del **bucle** (topeado a 15 a propósito). */
  fps: number | null;
  /**
   * Cuadros por segundo que **entrega la cámara**, medidos.
   *
   * Es distinto del FPS del bucle y hay que mirar los dos: el bucle está
   * topeado a 15 por diseño, pero si la cámara entrega 7 el problema es
   * del sensor o del ISP, no del pipeline. Sin separarlos, una cámara
   * lenta se confunde con un procesamiento lento y se termina
   * optimizando lo que no era.
   */
  fpsCamara: number | null;
  /** Latencia de la percepción (MediaPipe), media móvil en ms. */
  msPercepcion: number | null;
  /** Latencia del recorte alineado + estadísticas de imagen, en ms. */
  msAlineamiento: number | null;
  /**
   * Reconocimiento completo: del primer cuadro del intento a la
   * plantilla entregada. Es el número que siente la persona.
   */
  msReconocimiento: number | null;
  /** Resolución real que entrega la cámara, no la pedida. */
  resolucion: { ancho: number; alto: number; fps: number | null } | null;
  cuadrosVistos: number;
  cuadrosAceptados: number;
  descriptoresCalculados: number;
  ultimaCalidad: Veredicto['metricas'] | null;
  ultimoPuntaje: number | null;
  /** Errores de inicialización y fallbacks, ya legibles. */
  incidencias: string[];
  estabilidad: Estabilidad;
}

/**
 * Seguimiento de degradación durante una corrida larga.
 *
 * Es lo que contesta la pregunta que ninguna medición puntual contesta:
 * ¿esta tablet aguanta un turno? El enemigo concreto es el throttling
 * térmico — a los veinte o treinta minutos de kiosco el rendimiento cae
 * y no vuelve. Comparar la primera ventana contra la última lo muestra.
 */
export interface Estabilidad {
  /** Desde que arrancó el motor. */
  msCorriendo: number;
  /** Percepción p50 de los primeros 30 s. */
  msPercepcionInicial: number | null;
  /** Percepción p50 de los últimos 30 s. */
  msPercepcionReciente: number | null;
  /** Cuánto se degradó, en porcentaje. Positivo = va más lento. */
  degradacionPct: number | null;
  /** Heap de JS, si el navegador lo expone. Detecta fugas. */
  memoriaJsMb: number | null;
  memoriaJsInicialMb: number | null;
  /** Cuadros que el modelo no pudo procesar. */
  cuadrosPerdidos: number;
}

export interface EstadoMotor {
  fase: Fase;
  /** Texto para la persona. Nunca un genérico "no te reconocimos". */
  mensaje: string;
  /** 0 a 1: cuántas muestras buenas se juntaron. */
  progreso: number;
  /** Lado sorteado cuando la fase es 'desafio'. */
  lado: Lado | null;
  diagnostico: Diagnostico;
}

export interface OpcionesMotor {
  video: HTMLVideoElement;
  exigencia: Exigencia;
  /** Cuántas muestras buenas se quieren antes de decidir. */
  muestras: number;
  onEstado: (estado: EstadoMotor) => void;
  /** Se llama una sola vez, con la plantilla promediada. */
  onPlantilla: (plantilla: number[], detalle: DetallePlantilla) => void;
}

export interface DetallePlantilla {
  /** Los descriptores que se promediaron. El enrolamiento los audita. */
  muestras: number[][];
  /**
   * Distancia máxima entre dos de esas muestras.
   *
   * Es el control de coherencia: si las propias muestras de referencia
   * están tan lejos entre sí como lo que después se va a aceptar como
   * "es la misma persona", la plantilla no describe a nadie. Pasa cuando
   * alguien se cruza frente a la cámara en medio de la captura.
   */
  dispersion: number;
  diagnostico: Diagnostico;
}

/** Tope del bucle de percepción. 15/s alcanza y deja el hilo libre. */
const MS_ENTRE_PERCEPCIONES = 66;

/** Separación mínima entre descriptores: dos cuadros seguidos son casi el mismo. */
const MS_ENTRE_DESCRIPTORES = 220;

/** Después de esto se corta el intento y se explica qué faltó. */
const MS_LIMITE_INTENTO = 25_000;

/** Cuántos cuadros buenos se guardan antes de quedarse con los mejores. */
const CANDIDATOS_MAXIMOS = 12;

const mediaMovil = (
  previo: number | null,
  valor: number,
  alfa = 0.2
): number => (previo === null ? valor : previo * (1 - alfa) + valor * alfa);

export class MotorFacial {
  private lienzo: Lienzo | null = null;
  /**
   * Compartido con el resto de la pestaña: cargar el modelo y compilar
   * los shaders cuesta casi un segundo, y la pantalla de fichaje se abre
   * y se cierra decenas de veces por turno. Ver `ejecutorCompartido`.
   */
  private ejecutor = ejecutorCompartido();
  private corriendo = false;
  private handleVideo: number | null = null;
  private usaRvfc = false;

  private fase: Fase = 'cargando';
  private mensaje = 'Preparando el sistema…';
  private lado: Lado | null = null;

  private ultimaPercepcion = 0;
  private ultimoDescriptor = 0;
  private inicioIntento = 0;
  private inicioDesafio = 0;
  private ultimoTs = 0;
  private ultimoCuadro = 0;
  private estables = 0;
  private centroAnterior: { x: number; y: number } | null = null;
  private calculando = false;
  private entregado = false;

  private candidatos: MuestraCalificada<number[]>[] = [];
  private cierres: number[] = [];
  private yaws: number[] = [];
  private movimientos: number[] = [];
  private motivos = new Map<MotivoRechazo, number>();

  /** Marca de tiempo del cuadro anterior entregado por la cámara. */
  private ultimoCuadroCamara = 0;
  private inicioMotor = 0;
  /** Percepciones de los primeros 30 s, para comparar contra las últimas. */
  private percepcionesInicial: number[] = [];
  private percepcionesReciente: number[] = [];

  private diagnostico: Diagnostico = {
    percepcion: estadoPercepcion(),
    embedding: this.ejecutor.verEstado(),
    modeloPercepcion: MODELO_PERCEPCION,
    fps: null,
    fpsCamara: null,
    msPercepcion: null,
    msAlineamiento: null,
    msReconocimiento: null,
    resolucion: null,
    cuadrosVistos: 0,
    cuadrosAceptados: 0,
    descriptoresCalculados: 0,
    ultimaCalidad: null,
    ultimoPuntaje: null,
    incidencias: [],
    estabilidad: {
      msCorriendo: 0,
      msPercepcionInicial: null,
      msPercepcionReciente: null,
      degradacionPct: null,
      memoriaJsMb: null,
      memoriaJsInicialMb: null,
      cuadrosPerdidos: 0,
    },
  };

  constructor(private opciones: OpcionesMotor) {}

  /** Heap de JS en MB, o null si el navegador no lo expone (casi todos). */
  private heapMb(): number | null {
    const m = (
      performance as unknown as { memory?: { usedJSHeapSize: number } }
    ).memory;
    return m ? Math.round(m.usedJSHeapSize / 1024 / 1024) : null;
  }

  private mediana(valores: number[]): number | null {
    if (valores.length === 0) return null;
    const o = [...valores].sort((a, b) => a - b);
    return Math.round(o[Math.floor(o.length / 2)]);
  }

  /**
   * Compara la primera ventana de medición contra la última.
   *
   * Los primeros 30 s son la línea de base, y los últimos 30 s el estado
   * actual. La diferencia entre las dos es lo que delata el throttling
   * térmico: en una tablet que se calienta, la percepción se va de 12 ms
   * a 25 ms sin que nada más cambie, y una medición puntual al inicio
   * jamás lo mostraría.
   */
  private actualizarEstabilidad(ms: number, ahora: number): void {
    const transcurrido = ahora - this.inicioMotor;
    if (transcurrido < 30_000) {
      this.percepcionesInicial.push(ms);
    } else {
      this.percepcionesReciente.push(ms);
      // Ventana deslizante: sólo interesan los últimos ~30 s a 15/s.
      if (this.percepcionesReciente.length > 450) {
        this.percepcionesReciente.shift();
      }
    }

    const e = this.diagnostico.estabilidad;
    e.msCorriendo = Math.round(transcurrido);
    e.msPercepcionInicial = this.mediana(this.percepcionesInicial);
    e.msPercepcionReciente = this.mediana(this.percepcionesReciente);
    e.memoriaJsMb = this.heapMb();
    e.degradacionPct =
      e.msPercepcionInicial && e.msPercepcionReciente
        ? Math.round(
            ((e.msPercepcionReciente - e.msPercepcionInicial) /
              e.msPercepcionInicial) *
              100
          )
        : null;
  }

  /** Deja registrada una incidencia una sola vez, sin repetirla. */
  private anotar(texto: string): void {
    if (!this.diagnostico.incidencias.includes(texto)) {
      this.diagnostico.incidencias.push(texto);
    }
  }

  /**
   * Recoge los problemas que reportan las capas de abajo.
   *
   * Sin esto, un delegado que cayó a CPU o un Worker que no arrancó
   * quedan enterrados en el estado de cada módulo y nadie los ve al
   * homologar una tablet. Son exactamente los dos datos que explican por
   * qué un dispositivo va lento.
   */
  private recogerIncidencias(): void {
    const p = this.diagnostico.percepcion;
    const e = this.diagnostico.embedding;
    if (p.error) this.anotar(`Percepción: ${p.error}`);
    if (p.delegado === 'CPU') {
      this.anotar('Percepción cayó al delegado de CPU (sin GPU).');
    }
    if (p.simd === false)
      this.anotar('Sin WASM SIMD: MediaPipe usa el binario lento.');
    if (e.error) this.anotar(`Embedding: ${e.error}`);
    if (e.motivoFallback)
      this.anotar(`Worker no disponible: ${e.motivoFallback}`);
    if (e.donde === 'principal') {
      this.anotar(
        'Descriptor corriendo en el hilo principal, no en el Worker.'
      );
    }
    if (e.backend && e.backend !== 'webgl') {
      this.anotar(`Backend de TensorFlow.js degradado a "${e.backend}".`);
    }
    if (!this.usaRvfc && this.corriendo) {
      this.anotar(
        'Sin requestVideoFrameCallback: el bucle usa requestAnimationFrame.'
      );
    }
  }

  private emitir(): void {
    this.diagnostico.percepcion = estadoPercepcion();
    this.diagnostico.embedding = this.ejecutor.verEstado();
    this.recogerIncidencias();
    this.opciones.onEstado({
      fase: this.fase,
      mensaje: this.mensaje,
      progreso: Math.min(1, this.candidatos.length / this.opciones.muestras),
      lado: this.lado,
      diagnostico: { ...this.diagnostico },
    });
  }

  private pasarA(fase: Fase, mensaje: string): void {
    if (this.fase === fase && this.mensaje === mensaje) return;
    this.fase = fase;
    this.mensaje = mensaje;
    this.emitir();
  }

  /**
   * Carga los dos modelos **en paralelo**.
   *
   * Son 3,6 MB de MediaPipe y 6,4 MB de dlib, de orígenes distintos y
   * sin dependencia entre sí. En serie, una tablet con conexión mediocre
   * suma las dos esperas y la persona mira una pantalla que no explica
   * nada durante el doble de tiempo.
   */
  async iniciar(): Promise<boolean> {
    this.corriendo = true;
    this.lienzo = crearLienzo();
    this.pasarA('cargando', 'Preparando el sistema…');

    const [percepcionOk, embeddingOk] = await Promise.all([
      cargarPercepcion().then((l) => l !== null),
      this.ejecutor.preparar(),
    ]);

    if (!this.corriendo) return false;

    if (!percepcionOk || !embeddingOk || !this.lienzo) {
      this.pasarA(
        'fallo',
        'No pudimos cargar el reconocimiento facial. Recargá la página; si sigue igual, avisale a soporte.'
      );
      return false;
    }

    this.leerResolucion();
    this.inicioMotor = performance.now();
    this.diagnostico.estabilidad.memoriaJsInicialMb = this.heapMb();
    this.reiniciarIntento();
    this.bucle();
    return true;
  }

  private leerResolucion(): void {
    const pista = (
      this.opciones.video.srcObject as MediaStream | null
    )?.getVideoTracks?.()[0];
    const s = pista?.getSettings?.();
    // La resolución **real**, no la pedida. `getUserMedia` acepta
    // `width: 1280` como un deseo y entrega lo que el driver quiera; sin
    // leer esto, todas las métricas que se normalizan por el ancho del
    // cuadro estarían calculadas sobre un número inventado.
    this.diagnostico.resolucion = s
      ? {
          ancho: s.width ?? this.opciones.video.videoWidth,
          alto: s.height ?? this.opciones.video.videoHeight,
          fps: s.frameRate ?? null,
        }
      : {
          ancho: this.opciones.video.videoWidth,
          alto: this.opciones.video.videoHeight,
          fps: null,
        };
  }

  /** Vuelve a empezar sin recargar modelos. Es lo que hace "probá de nuevo". */
  reiniciarIntento(): void {
    this.candidatos = [];
    this.cierres = [];
    this.yaws = [];
    this.movimientos = [];
    this.motivos.clear();
    this.estables = 0;
    this.centroAnterior = null;
    this.entregado = false;
    this.lado = null;
    this.inicioIntento = performance.now();
    this.pasarA('buscando', MENSAJE_MOTIVO.sin_rostro);
  }

  private bucle(): void {
    if (!this.corriendo) return;
    const v = this.opciones.video;

    const paso = () => {
      if (!this.corriendo) return;
      // El FPS de la cámara se mide **acá**, antes del throttling: este
      // callback se dispara una vez por cuadro entregado, mientras que
      // `procesarCuadro` descarta los que llegan antes de los 66 ms. Sin
      // separarlos, una cámara que entrega 7 cuadros por segundo se vería
      // igual que el bucle funcionando a su tope de 15.
      const t = performance.now();
      if (this.ultimoCuadroCamara > 0) {
        const dt = t - this.ultimoCuadroCamara;
        if (dt > 0) {
          this.diagnostico.fpsCamara = Math.round(
            mediaMovil(this.diagnostico.fpsCamara, 1000 / dt, 0.1)
          );
        }
      }
      this.ultimoCuadroCamara = t;

      void this.procesarCuadro();
      this.agendar(paso);
    };

    this.usaRvfc = typeof v.requestVideoFrameCallback === 'function';
    this.agendar(paso);
  }

  /**
   * `requestVideoFrameCallback` cuando existe, `requestAnimationFrame`
   * si no.
   *
   * La diferencia importa: rVFC dispara **cuando llega un cuadro nuevo**
   * de la cámara. rAF dispara con el repintado de la pantalla, que va a
   * 60 Hz aunque la cámara entregue 30, así que la mitad de las
   * ejecuciones procesarían un cuadro que ya se procesó. Es el doble de
   * trabajo por el mismo resultado, y en una tablet eso es batería y
   * temperatura.
   */
  private agendar(fn: () => void): void {
    const v = this.opciones.video;
    if (this.usaRvfc) {
      this.handleVideo = v.requestVideoFrameCallback(() => fn());
    } else {
      this.handleVideo = requestAnimationFrame(() => fn());
    }
  }

  private async procesarCuadro(): Promise<void> {
    const ahora = performance.now();
    if (ahora - this.ultimaPercepcion < MS_ENTRE_PERCEPCIONES) return;

    const v = this.opciones.video;
    if (v.readyState < 2 || v.videoWidth === 0) return;

    if (this.ultimoCuadro > 0) {
      this.diagnostico.fps = Math.round(
        mediaMovil(this.diagnostico.fps, 1000 / (ahora - this.ultimoCuadro))
      );
    }
    this.ultimoCuadro = ahora;
    this.ultimaPercepcion = ahora;

    // MediaPipe exige marcas de tiempo estrictamente crecientes; si dos
    // cuadros caen en el mismo milisegundo, tira el segundo con una
    // excepción.
    const ts = Math.max(this.ultimoTs + 1, Math.round(ahora));
    this.ultimoTs = ts;

    const cuadro = percibir(v, ts);
    if (!cuadro) {
      // Un cuadro que el runtime no pudo procesar. Aislado es normal;
      // sostenido es la firma de un contexto WebGL perdido, que es
      // justamente lo que hay que ver al homologar una tablet.
      this.diagnostico.estabilidad.cuadrosPerdidos++;
      return;
    }

    this.diagnostico.cuadrosVistos++;
    this.diagnostico.msPercepcion = Math.round(
      mediaMovil(this.diagnostico.msPercepcion, cuadro.ms)
    );
    this.actualizarEstabilidad(cuadro.ms, ahora);

    if (this.vencio(ahora)) return;

    if (cuadro.caras === 0) {
      this.estables = 0;
      this.centroAnterior = null;
      if (this.fase !== 'desafio')
        this.pasarA('buscando', MENSAJE_MOTIVO.sin_rostro);
      return;
    }
    if (cuadro.caras > 1) {
      this.estables = 0;
      this.pasarA('buscando', MENSAJE_MOTIVO.varios_rostros);
      return;
    }

    const { ancho, alto } = this.dimensiones();
    const referencias = referenciasDeMalla(cuadro.malla, ancho, alto);
    if (!referencias) return;

    const pose = poseDeReferencias(referencias);
    this.cierres.push(
      Math.max(cuadro.parpadeoDerecho, cuadro.parpadeoIzquierdo)
    );
    this.yaws.push(pose.yaw);

    const centro = {
      x:
        (referencias.ojoDerecho.x +
          referencias.ojoIzquierdo.x +
          referencias.boca.x) /
        3,
      y:
        (referencias.ojoDerecho.y +
          referencias.ojoIzquierdo.y +
          referencias.boca.y) /
        3,
    };
    this.movimientos.push(
      this.centroAnterior
        ? Math.hypot(
            centro.x - this.centroAnterior.x,
            centro.y - this.centroAnterior.y
          ) / ancho
        : 1
    );

    if (this.fase === 'desafio') {
      this.atenderDesafio(ahora);
      this.centroAnterior = centro;
      return;
    }

    const entradaGeo = {
      referencias,
      pose,
      anchoCuadro: ancho,
      altoCuadro: alto,
      parpadeoDerecho: cuadro.parpadeoDerecho,
      parpadeoIzquierdo: cuadro.parpadeoIzquierdo,
      centroAnterior: this.centroAnterior,
    };
    this.centroAnterior = centro;

    if (!entraEnCuadro(referencias, ancho, alto)) {
      this.estables = 0;
      this.contarMotivo('descentrado');
      this.pasarA('encuadrando', MENSAJE_MOTIVO.descentrado);
      return;
    }

    const geo = evaluarGeometria(entradaGeo);
    if (!geo.ok) {
      this.estables = 0;
      this.contarMotivo(geo.motivo as MotivoRechazo);
      this.pasarA('encuadrando', MENSAJE_MOTIVO[geo.motivo as MotivoRechazo]);
      return;
    }

    // Recién acá se paga el recorte: la geometría ya dijo que vale la pena.
    const tAlineamiento = performance.now();
    const chip = this.lienzo && extraerChip(v, referencias, this.lienzo);
    if (!chip) return;

    const veredicto = evaluarCalidad({
      ...entradaGeo,
      estadisticas: estadisticasDeImagen(chip.data, chip.width, chip.height),
    });
    // Se mide el recorte junto con las estadísticas de imagen porque son
    // una sola unidad de costo: las dos recorren los mismos 150×150
    // píxeles y separarlas no cambiaría ninguna decisión.
    this.diagnostico.msAlineamiento =
      Math.round(
        mediaMovil(
          this.diagnostico.msAlineamiento,
          performance.now() - tAlineamiento
        ) * 100
      ) / 100;
    this.diagnostico.ultimaCalidad = veredicto.metricas;
    this.diagnostico.ultimoPuntaje = veredicto.puntaje;

    if (!veredicto.ok || veredicto.puntaje < PUNTAJE_ACEPTABLE) {
      this.estables = 0;
      const motivo = veredicto.motivo ?? 'borroso';
      this.contarMotivo(motivo);
      this.pasarA('encuadrando', MENSAJE_MOTIVO[motivo]);
      return;
    }

    this.estables++;
    this.diagnostico.cuadrosAceptados++;
    if (this.estables < CUADROS_ESTABLES) {
      this.pasarA('encuadrando', 'Quedate así…');
      return;
    }

    this.pasarA('capturando', 'Verificando…');
    await this.tomarMuestra(chip, veredicto.puntaje, ahora);

    // Se reintenta cerrar en cada cuadro bueno, no sólo al tomar una
    // muestra nueva.
    //
    // Es lo que destraba el caso "ya tengo suficientes descriptores pero
    // todavía no vi un parpadeo": `cerrar()` deja la fase en
    // "parpadeá" y vuelve, y sin este reintento sólo se lo volvería a
    // llamar al sumar otra muestra — hasta llegar al tope de candidatos,
    // donde `tomarMuestra` corta y la persona se quedaba mirando la
    // cámara hasta que vencía el intento aunque ya hubiera parpadeado.
    if (!this.entregado && this.candidatos.length >= this.opciones.muestras) {
      this.cerrar();
    }
  }

  private dimensiones(): { ancho: number; alto: number } {
    const v = this.opciones.video;
    return { ancho: v.videoWidth, alto: v.videoHeight };
  }

  private contarMotivo(m: MotivoRechazo): void {
    this.motivos.set(m, (this.motivos.get(m) ?? 0) + 1);
  }

  /**
   * Calcula el descriptor de un cuadro bueno y lo guarda como candidato.
   *
   * `calculando` evita encolar inferencias: si el dispositivo tarda más
   * de lo que dura un cuadro, encolar produce una fila que crece sola y
   * que al final entrega descriptores de cuadros viejos. Mejor saltearse
   * el cuadro: el siguiente bueno llega en 70 ms.
   */
  private async tomarMuestra(
    chip: ImageData,
    puntaje: number,
    ahora: number
  ): Promise<void> {
    if (this.calculando) return;
    if (ahora - this.ultimoDescriptor < MS_ENTRE_DESCRIPTORES) return;
    if (this.candidatos.length >= CANDIDATOS_MAXIMOS) return;

    this.calculando = true;
    this.ultimoDescriptor = ahora;
    try {
      const descriptor = await this.ejecutor.descriptor(chip);
      if (!descriptor || !this.corriendo) return;
      this.diagnostico.descriptoresCalculados++;
      this.candidatos.push({ valor: descriptor, puntaje });
      this.emitir();

      // El desafío se lanza con la primera muestra ya tomada y se
      // completa antes de las últimas: así la identidad que se mide es
      // la de quien respondió el desafío, y no la de una cara que
      // apareció antes o después.
      if (
        this.opciones.exigencia === 'parpadeo_y_desafio' &&
        !this.lado &&
        this.candidatos.length >= 1
      ) {
        this.lanzarDesafio();
        return;
      }

      if (this.candidatos.length >= this.opciones.muestras) this.cerrar();
    } finally {
      this.calculando = false;
    }
  }

  private lanzarDesafio(): void {
    this.lado = sortearLado();
    this.yaws = [];
    this.inicioDesafio = performance.now();
    this.pasarA('desafio', PEDIDO_DESAFIO[this.lado]);
  }

  /**
   * Mira si el gesto pedido ya se completó.
   *
   * Se pregunta **sólo por el desafío**, no por la prueba de vida
   * entera. Preguntar por la entera tenía un defecto: `evaluarLiveness`
   * chequea el parpadeo antes que el giro, así que mientras la persona
   * no hubiera parpadeado nunca daba por cumplido el desafío — y a los
   * cuatro segundos se sorteaba otro lado, y otro, con la persona
   * girando la cabeza sin que nada avanzara. El parpadeo se verifica
   * igual, pero al cerrar, que es donde corresponde.
   */
  private atenderDesafio(ahora: number): void {
    if (!this.lado) return;

    if (cumpleDesafio(this.lado, this.yaws)) {
      this.estables = 0;
      this.pasarA('capturando', 'Volvé a mirar de frente');
      return;
    }

    if (ahora - this.inicioDesafio > MS_DESAFIO) {
      // Se sortea otro lado en vez de repetir el mismo: repetirlo le
      // daría a un atacante un segundo intento con el lado ya conocido.
      this.lanzarDesafio();
    }
  }

  private vencio(ahora: number): boolean {
    if (this.entregado) return true;
    if (ahora - this.inicioIntento < MS_LIMITE_INTENTO) return false;

    // Se informa el motivo **más frecuente**, no el último: el último es
    // el de un cuadro cualquiera y suele ser ruido. El más frecuente es
    // lo que de verdad estuvo estorbando durante el intento.
    const [peor] = [...this.motivos.entries()].sort(
      (a, b) => b[1] - a[1]
    )[0] ?? [null];

    this.entregado = true;
    this.pasarA(
      'fallo',
      peor
        ? `${MENSAJE_MOTIVO[peor]}. Probá de nuevo.`
        : 'No llegamos a verte bien. Probá de nuevo.'
    );
    return true;
  }

  /**
   * Cierra el intento: valida la prueba de vida y entrega la plantilla.
   *
   * La plantilla es el promedio de las mejores muestras. Promediar
   * cancela parcialmente el ruido de cada cuadro —la luz, un gesto, un
   * micro-movimiento— y deja lo que es estable, que es la identidad.
   * Acerca los descriptores de la misma persona **más** de lo que acerca
   * los de personas distintas: separa mejor las dos distribuciones, que
   * es lo único que de verdad mejora un sistema biométrico.
   */
  private cerrar(): void {
    if (this.entregado) return;

    const r = evaluarLiveness({
      exigencia: this.opciones.exigencia,
      cierres: this.cierres,
      yaws: this.yaws,
      movimientos: this.movimientos,
      lado: this.lado,
    });

    if (!r.vivo) {
      if (r.motivo === 'sin_parpadeo' || r.motivo === 'pocos_cuadros') {
        // Todavía hay tiempo: se le pide el parpadeo y se sigue mirando.
        this.pasarA('capturando', MENSAJE_LIVENESS[r.motivo]);
        return;
      }
      this.entregado = true;
      this.pasarA('fallo', MENSAJE_LIVENESS[r.motivo]);
      return;
    }

    this.entregado = true;
    const elegidas = mejores(this.candidatos, this.opciones.muestras);
    // Lo que la persona **siente**: del primer cuadro del intento a tener
    // la plantilla. Ninguna latencia por etapa lo reemplaza, porque acá
    // entran también los cuadros que se descartaron mientras se acomodaba
    // y la espera del desafío de pose.
    this.diagnostico.msReconocimiento = Math.round(
      performance.now() - this.inicioIntento
    );
    this.pasarA('listo', 'Listo');
    this.opciones.onPlantilla(promediar(elegidas), {
      muestras: elegidas,
      dispersion: dispersion(elegidas),
      diagnostico: { ...this.diagnostico },
    });
  }

  /**
   * Corta el bucle. **No destruye los modelos.**
   *
   * Ésa es la diferencia entre cerrar la pantalla y desmontar la app.
   * Los modelos son caros de levantar —6,4 MB de pesos más la
   * compilación de shaders— y en el kiosco esta pantalla se abre y se
   * cierra decenas de veces por turno: destruirlos en cada cierre haría
   * que cada persona de la fila pagara de nuevo el arranque.
   *
   * Destruir en `detener()` además abría una carrera: si una pantalla se
   * cerraba mientras otra se estaba abriendo, la primera se llevaba
   * puesto el modelo que la segunda acababa de pedir, y el resultado era
   * un `FaceLandmarker` cerrado devolviendo null para siempre.
   *
   * El desmontaje real se hace con `liberarModelosFaciales()`.
   */
  detener(): void {
    this.corriendo = false;
    if (this.handleVideo !== null) {
      if (this.usaRvfc) {
        this.opciones.video.cancelVideoFrameCallback?.(this.handleVideo);
      } else {
        cancelAnimationFrame(this.handleVideo);
      }
      this.handleVideo = null;
    }
  }
}

/**
 * Suelta de verdad los modelos y el Worker.
 *
 * Es el desmontaje real: salir del kiosco, cerrar la sesión, dejar la
 * app. **No** se llama al cerrar la pantalla de fichaje — ver el
 * comentario de `MotorFacial.detener`.
 */
export const liberarModelosFaciales = (): void => {
  liberarEjecutorCompartido();
  liberarPercepcion();
};
