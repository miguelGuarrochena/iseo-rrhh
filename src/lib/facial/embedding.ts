/**
 * Cliente del cálculo de descriptores.
 *
 * Intenta primero un Web Worker y, si por lo que sea no arranca, cae al
 * hilo principal usando **el mismo núcleo** (`embedding.nucleo.ts`). Los
 * dos caminos ejecutan exactamente el mismo código de inferencia; lo
 * único que cambia es dónde corre.
 *
 * Por qué con red de contención y no a secas
 * ------------------------------------------
 * El worker es claramente mejor —evita que una inferencia lenta congele
 * la pantalla— pero depende de varias cosas que en un navegador de
 * tablet pueden no estar: `OffscreenCanvas` para que TF.js levante
 * WebGL fuera del hilo principal, que la CSP permita el worker, y que
 * face-api tolere un entorno sin `window`. Si alguna falla, la opción
 * correcta es funcionar más lento, no dejar de funcionar.
 *
 * La decisión se toma **una vez, con una inferencia de prueba real**, no
 * mirando banderas de capacidades. Un `typeof OffscreenCanvas` que dice
 * que sí y después falla al crear el contexto es exactamente el tipo de
 * cosa que después aparece como "en esa tablet no anda".
 */

import {
  calcularDescriptor as calcularEnPrincipal,
  calentar as calentarEnPrincipal,
  estadoEmbedding,
  MODELO_EMBEDDING,
  type Backend,
  type EstadoEmbedding,
} from './embedding.nucleo';
import type { PedidoWorker, RespuestaWorker } from './embedding.worker';

export { MODELO_EMBEDDING };
export type { Backend };

export type Donde = 'worker' | 'principal';

export interface EstadoEjecutor extends EstadoEmbedding {
  donde: Donde | null;
  /** Por qué no se pudo usar el worker, si aplica. */
  motivoFallback: string | null;
  /** Última latencia de inferencia medida, en ms. */
  msUltimaInferencia: number | null;
  /** Media móvil de la latencia. Es lo que hay que mirar, no un pico. */
  msPromedio: number | null;
  /** Latencia de la inferencia de calentamiento (incluye compilar shaders). */
  msCalentamiento: number | null;
}

/** Cuánto se espera al calentamiento antes de dar el worker por perdido. */
const MS_ESPERA_CALENTAMIENTO = 90_000;

export class Ejecutor {
  private worker: Worker | null = null;
  private siguienteId = 1;
  private pendientes = new Map<
    number,
    { resolver: (r: RespuestaWorker) => void; rechazar: (e: Error) => void }
  >();
  private estado: EstadoEjecutor = {
    listo: false,
    backend: null,
    msCarga: null,
    error: null,
    rastro: [],
    donde: null,
    motivoFallback: null,
    msUltimaInferencia: null,
    msPromedio: null,
    msCalentamiento: null,
  };
  verEstado(): Readonly<EstadoEjecutor> {
    return { ...this.estado, rastro: [...this.estado.rastro] };
  }

  private registrarLatencia(ms: number): void {
    this.estado.msUltimaInferencia = ms;
    // Media móvil exponencial: un pico aislado (una recolección de
    // basura, el sistema haciendo otra cosa) no tiene que borrar lo que
    // se sabe del comportamiento típico, ni quedarse a vivir en el
    // promedio.
    const alfa = 0.25;
    this.estado.msPromedio =
      this.estado.msPromedio === null
        ? ms
        : Math.round(this.estado.msPromedio * (1 - alfa) + ms * alfa);
  }

  private crearWorker(): Worker | null {
    if (
      typeof Worker === 'undefined' ||
      typeof OffscreenCanvas === 'undefined'
    ) {
      this.estado.motivoFallback =
        'El navegador no tiene Worker con OffscreenCanvas.';
      return null;
    }
    try {
      const w = new Worker(new URL('./embedding.worker.ts', import.meta.url));
      w.onmessage = (e: MessageEvent<RespuestaWorker>) => {
        const p = this.pendientes.get(e.data.id);
        if (!p) return;
        this.pendientes.delete(e.data.id);
        p.resolver(e.data);
      };
      w.onerror = (e) => {
        const mensaje = e.message || 'El worker falló.';
        this.pendientes.forEach((p) => p.rechazar(new Error(mensaje)));
        this.pendientes.clear();
      };
      return w;
    } catch (e) {
      this.estado.motivoFallback = e instanceof Error ? e.message : String(e);
      return null;
    }
  }

  private pedir(
    pedido: PedidoWorker,
    msLimite: number
  ): Promise<RespuestaWorker> {
    const w = this.worker;
    if (!w) return Promise.reject(new Error('Sin worker.'));

    return new Promise<RespuestaWorker>((resolver, rechazar) => {
      const reloj = setTimeout(() => {
        this.pendientes.delete(pedido.id);
        rechazar(new Error(`El worker no respondió en ${msLimite} ms.`));
      }, msLimite);

      this.pendientes.set(pedido.id, {
        resolver: (r) => {
          clearTimeout(reloj);
          resolver(r);
        },
        rechazar: (e) => {
          clearTimeout(reloj);
          rechazar(e);
        },
      });
      w.postMessage(pedido);
    });
  }

  /**
   * Carga el modelo, elige backend y deja los shaders compilados.
   *
   * Devuelve `false` sólo si **ninguno** de los dos caminos funcionó:
   * ahí sí el reconocimiento facial no está disponible y hay que
   * decírselo a la persona en vez de dejarla mirando la cámara.
   */
  async preparar(): Promise<boolean> {
    if (this.estado.listo) return true;

    this.worker = this.crearWorker();
    if (this.worker) {
      try {
        const r = await this.pedir(
          { tipo: 'calentar', id: this.siguienteId++ },
          MS_ESPERA_CALENTAMIENTO
        );
        if (r.tipo === 'calentado' && r.estado.listo) {
          this.estado = {
            ...this.estado,
            ...r.estado,
            donde: 'worker',
            msCalentamiento: r.ms,
          };
          return true;
        }
        // Se conserva el rastro **del worker**, no el que después va a
        // dejar el hilo principal al reintentar: el que interesa para
        // diagnosticar por qué esta tablet no pudo usar el worker es el
        // primero, y sin guardarlo acá lo pisa el segundo.
        const rastroWorker =
          r.tipo === 'calentado' ? r.estado.rastro.join(' → ') : '';
        const causa =
          r.tipo === 'error'
            ? r.mensaje
            : (r.tipo === 'calentado' && r.estado.error) ||
              'El worker no pudo inicializar el modelo.';
        this.estado.motivoFallback = rastroWorker
          ? `${causa} [worker: ${rastroWorker}]`
          : causa;
      } catch (e) {
        this.estado.motivoFallback = e instanceof Error ? e.message : String(e);
      }
      this.worker.terminate();
      this.worker = null;
    }

    const ms = await calentarEnPrincipal();
    const est = estadoEmbedding();
    this.estado = {
      ...this.estado,
      ...est,
      donde: est.listo ? 'principal' : null,
      msCalentamiento: ms,
    };
    return est.listo;
  }

  /** Descriptor de un recorte alineado. `null` si no se pudo. */
  async descriptor(chip: ImageData): Promise<number[] | null> {
    if (this.worker) {
      try {
        const r = await this.pedir(
          { tipo: 'descriptor', id: this.siguienteId++, chip },
          15_000
        );
        if (r.tipo === 'descriptor') {
          this.registrarLatencia(r.ms);
          this.estado = { ...this.estado, ...r.estado, donde: 'worker' };
          return r.descriptor;
        }
        return null;
      } catch {
        // El worker se cayó a mitad de la sesión (memoria, contexto
        // WebGL perdido). Se sigue en el hilo principal antes que
        // dejar a la persona sin fichar.
        this.estado.motivoFallback = 'El worker se cayó durante la sesión.';
        this.worker.terminate();
        this.worker = null;
      }
    }

    const t0 = performance.now();
    const d = await calcularEnPrincipal(chip);
    this.registrarLatencia(Math.round(performance.now() - t0));
    this.estado = { ...this.estado, ...estadoEmbedding(), donde: 'principal' };
    return d ? Array.from(d) : null;
  }

  /**
   * Cierra el worker y suelta el modelo.
   *
   * Sólo se llama al desmontar la aplicación, **no** al cerrar la
   * pantalla de fichaje: ver `ejecutorCompartido`.
   */
  liberar(): void {
    this.pendientes.forEach((p) => p.rechazar(new Error('Ejecutor liberado.')));
    this.pendientes.clear();
    this.worker?.terminate();
    this.worker = null;
    this.estado.listo = false;
    this.estado.donde = null;
  }
}

let compartido: Ejecutor | null = null;

/**
 * Ejecutor único de la pestaña.
 *
 * En el kiosco la pantalla de fichaje se abre y se cierra decenas de
 * veces por turno. Crear un ejecutor por apertura significaría, cada
 * vez: levantar un Worker, bajar 6,4 MB de pesos (de cache, pero igual
 * hay que decodificarlos y subirlos a la GPU) y recompilar los shaders
 * de WebGL — casi un segundo de "preparando el sistema" con alguien
 * esperando adelante. Y peor: cada Worker vivo es un contexto WebGL
 * más, y Chrome tiene un tope por pestaña; al cruzarlo empieza a matar
 * los más viejos y el fichaje "deja de andar" sin que nada lo explique.
 *
 * Compartirlo también elimina una carrera fea: si una pantalla se cierra
 * mientras otra se está abriendo, la primera destruiría el modelo que la
 * segunda acaba de pedir.
 *
 * El costo es un Worker y un modelo residentes mientras la pestaña vive.
 * Para una terminal de planta eso es exactamente lo que se quiere.
 */
export const ejecutorCompartido = (): Ejecutor => {
  compartido ??= new Ejecutor();
  return compartido;
};

/** Desmontaje real (cambio de sesión, salida del kiosco). */
export const liberarEjecutorCompartido = (): void => {
  compartido?.liberar();
  compartido = null;
};
