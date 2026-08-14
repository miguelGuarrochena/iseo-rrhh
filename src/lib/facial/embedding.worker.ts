/**
 * Worker que calcula descriptores faciales.
 *
 * Por qué hay un worker
 * ---------------------
 * De todo el pipeline, el descriptor es la única operación cara: entre
 * 20 y 60 ms con WebGL, y **entre uno y tres segundos si el dispositivo
 * cayó al backend de CPU**. En el hilo principal eso último congela la
 * pantalla: no repinta, no responde al toque, y el mensaje que le
 * explica a la persona qué está pasando no llega a anunciarse. Justo
 * cuando más falta hace.
 *
 * La percepción (MediaPipe) **no** se manda acá a propósito: necesita el
 * elemento `<video>`, y traerlo a un worker obligaría a copiar cada
 * cuadro. Con delegado GPU son 5-15 ms por cuadro, que a 15 fps es menos
 * de un cuarto del hilo principal; eso no se nota.
 *
 * El protocolo es un pedido con `id` y una respuesta con el mismo `id`:
 * los pedidos pueden completarse fuera de orden y hay que poder
 * emparejarlos.
 */

import {
  calcularDescriptor,
  calentar,
  estadoEmbedding,
  type EstadoEmbedding,
} from './embedding.nucleo';

export type PedidoWorker =
  | { tipo: 'calentar'; id: number }
  | { tipo: 'descriptor'; id: number; chip: ImageData };

export type RespuestaWorker =
  | {
      tipo: 'calentado';
      id: number;
      ms: number | null;
      estado: EstadoEmbedding;
    }
  | {
      tipo: 'descriptor';
      id: number;
      descriptor: number[] | null;
      ms: number;
      estado: EstadoEmbedding;
    }
  | { tipo: 'error'; id: number; mensaje: string };

const responder = (r: RespuestaWorker) => self.postMessage(r);

self.onmessage = async (evento: MessageEvent<PedidoWorker>) => {
  const pedido = evento.data;
  try {
    if (pedido.tipo === 'calentar') {
      const ms = await calentar();
      responder({
        tipo: 'calentado',
        id: pedido.id,
        ms,
        estado: estadoEmbedding(),
      });
      return;
    }

    const t0 = performance.now();
    const descriptor = await calcularDescriptor(pedido.chip);
    responder({
      tipo: 'descriptor',
      id: pedido.id,
      // Se manda como arreglo común: un `Float32Array` cruza el
      // structured clone igual, pero del otro lado se termina
      // convirtiendo a JSON para el RPC de todas formas.
      descriptor: descriptor ? Array.from(descriptor) : null,
      ms: Math.round(performance.now() - t0),
      estado: estadoEmbedding(),
    });
  } catch (e) {
    responder({
      tipo: 'error',
      id: pedido.id,
      mensaje: e instanceof Error ? e.message : String(e),
    });
  }
};
