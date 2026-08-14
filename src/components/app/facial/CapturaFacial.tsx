'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { IconCamera, IconFaceId, IconRefresh } from '@tabler/icons-react';
import { Boton } from '@/components/app/ui/Boton';
import {
  cargarModelos,
  detectarOjos,
  detectarRostro,
} from '@/lib/facial/reconocimiento';
import {
  aperturaDeCuadro,
  CUADROS_MINIMOS,
  evaluarLiveness,
} from '@/lib/facial/liveness';

interface CapturaFacialProps {
  /**
   * Se llama con el descriptor (128 números) y nada más.
   *
   * Antes también entregaba una foto JPEG del rostro (`toDataURL`) que
   * ninguno de los dos consumidores usaba: se materializaba una imagen
   * biométrica en memoria en cada captura para tirarla enseguida. El
   * dato biométrico que el sistema necesita es el descriptor, del que no
   * se puede reconstruir la cara; la foto no hacía falta para nada.
   */
  onCaptura: (descriptor: number[]) => void;
  /** Estado ocupado externo (ej. mientras se guarda / se ficha). */
  procesando?: boolean;
  textoBoton?: string;
  /**
   * Pide un parpadeo antes de aceptar la captura.
   *
   * Se usa al fichar, no al enrolar: al registrar el rostro hay alguien
   * de RRHH presente mirando, pero en la tablet de planta no, y sin esto
   * una foto impresa fichaba por su dueño.
   */
  exigirLiveness?: boolean;
  /**
   * Si la cámara no abre, sugiere fichada a mano (fichaje, no enrolar).
   */
  sugerirFichajeManual?: boolean;
}

/** Cuánto se mira a la persona esperando el parpadeo. */
const MS_LIVENESS = 4000;
/** Cada cuánto se toma un cuadro durante ese rato. */
const MS_ENTRE_CUADROS = 180;

type Estado =
  | 'iniciando'
  | 'listo'
  | 'sin_camara'
  | 'permiso_denegado'
  | 'sin_https'
  | 'camara_ocupada';

const MENSAJES_ESTADO: Record<string, string> = {
  permiso_denegado:
    'Necesitamos permiso para usar la cámara. Habilitalo en el candado de la barra de direcciones y reintentá.',
  sin_https:
    'El navegador solo habilita la cámara en sitios seguros (https). Entrá por la dirección https:// de la app, no por la IP de la red.',
  camara_ocupada:
    'La cámara está siendo usada por otra aplicación. Cerrá la otra app (Zoom, Meet, la cámara del sistema) y reintentá.',
  sin_camara: 'No pudimos acceder a la cámara de este dispositivo.',
};

const AYUDA_FICHAJE_MANUAL =
  'Enchufá el dispositivo si está con poca batería. Si sigue igual, avisale a RRHH para que te fichen a mano mientras se carga.';

/**
 * Cámara frontal + extracción de descriptor facial en el dispositivo.
 * La imagen no se sube: se procesa localmente y se entrega el descriptor.
 */
export const CapturaFacial = ({
  onCaptura,
  procesando = false,
  textoBoton = 'Capturar',
  exigirLiveness = false,
  sugerirFichajeManual = false,
}: CapturaFacialProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [estado, setEstado] = useState<Estado>('iniciando');
  const [analizando, setAnalizando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  /** Se muestra durante la prueba de vida para que sepa qué hacer. */
  const [pidiendoParpadeo, setPidiendoParpadeo] = useState(false);

  const iniciarCamara = useCallback(async () => {
    setEstado('iniciando');
    setMensaje(null);
    // En contexto inseguro (http:// o una IP de la red local) el
    // navegador ni siquiera expone mediaDevices. Es la causa más común
    // de "no me toma la cámara" en las tablets de planta, y sin este
    // chequeo se reportaba como un genérico "sin cámara".
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setEstado(window.isSecureContext === false ? 'sin_https' : 'sin_camara');
      return;
    }

    try {
      void cargarModelos();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 640, height: 480 },
        audio: false,
      });
      streamRef.current = stream;
      // Con batería crítica el sistema a veces mata el track después de
      // haberlo entregado: sin esto la pantalla sigue como si hubiera
      // cámara y el fichaje "no anda".
      stream.getVideoTracks().forEach((track) => {
        track.addEventListener('ended', () => {
          if (streamRef.current) setEstado('sin_camara');
        });
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setEstado('listo');
    } catch (err) {
      const nombre = err instanceof DOMException ? err.name : '';
      if (nombre === 'NotAllowedError' || nombre === 'SecurityError') {
        setEstado(
          window.isSecureContext === false ? 'sin_https' : 'permiso_denegado'
        );
      } else if (nombre === 'NotReadableError' || nombre === 'AbortError') {
        setEstado('camara_ocupada');
      } else {
        setEstado('sin_camara');
      }
    }
  }, []);

  useEffect(() => {
    void iniciarCamara();
    return () => {
      const stream = streamRef.current;
      streamRef.current = null;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [iniciarCamara]);

  /**
   * Mira a la persona unos segundos esperando un parpadeo.
   *
   * Una foto impresa o una pantalla mostrando una cara tienen los ojos
   * siempre igual; una persona parpadea. No frena a alguien decidido con
   * un video, pero sí el caso común, que es la foto en el celular.
   */
  const comprobarLiveness = async (
    video: HTMLVideoElement
  ): Promise<{ vivo: boolean; mensaje?: string }> => {
    setPidiendoParpadeo(true);
    const aperturas: number[] = [];
    const hasta = Date.now() + MS_LIVENESS;
    // La pasada que resolvió el cuadro anterior se prueba primero en el
    // siguiente: en 180 ms no cambian ni la luz ni la distancia.
    let pasada = 0;
    try {
      while (Date.now() < hasta) {
        // `detectarOjos` y no `detectarRostro`: para el EAR alcanzan los
        // landmarks. Calcular además el descriptor multiplicaba por ~6 el
        // costo de cada cuadro y hacía que las tablets no llegaran nunca
        // a juntar los CUADROS_MINIMOS dentro de la ventana.
        const cuadro = await detectarOjos(video, pasada);
        if (cuadro) {
          pasada = cuadro.pasada;
          aperturas.push(
            aperturaDeCuadro(cuadro.ojos.izquierdo, cuadro.ojos.derecho)
          );
          // Con el parpadeo ya visto no tiene sentido seguir esperando.
          if (evaluarLiveness(aperturas).vivo) return { vivo: true };
        }
        await new Promise((r) => setTimeout(r, MS_ENTRE_CUADROS));
      }

      const veredicto = evaluarLiveness(aperturas);
      if (veredicto.vivo) return { vivo: true };
      return {
        vivo: false,
        mensaje:
          veredicto.motivo === 'pocos_cuadros' ||
          aperturas.length < CUADROS_MINIMOS
            ? 'No llegamos a verte bien. Quedate quieto frente a la cámara y probá de nuevo.'
            : 'Necesitamos confirmar que sos vos en persona: mirá a la cámara y parpadeá.',
      };
    } finally {
      setPidiendoParpadeo(false);
    }
  };

  const capturar = async () => {
    if (!videoRef.current || analizando || procesando) return;
    setAnalizando(true);
    setMensaje(null);
    try {
      if (exigirLiveness) {
        const prueba = await comprobarLiveness(videoRef.current);
        if (!prueba.vivo) {
          setMensaje(prueba.mensaje ?? 'No pudimos confirmar que sos vos.');
          return;
        }
      }
      const deteccion = await detectarRostro(videoRef.current);
      if (!deteccion.ok) {
        setMensaje(
          deteccion.motivo === 'varias_caras'
            ? `Detectamos ${deteccion.caras} caras. Que quede una sola persona frente a la cámara.`
            : deteccion.motivo === 'sin_modelos'
              ? 'No pudimos cargar el modelo de reconocimiento facial. Recargá la página; si sigue igual, avisale a soporte.'
              : 'No detectamos ninguna cara. Acercate, mirá de frente, sacate los lentes de sol y buscá mejor luz (que no venga de atrás tuyo).'
        );
        return;
      }
      onCaptura(Array.from(deteccion.descriptor));
    } catch {
      setMensaje(
        'No pudimos procesar la imagen. Intentá de nuevo; si se repite, recargá la página.'
      );
    } finally {
      setAnalizando(false);
    }
  };

  if (estado !== 'iniciando' && estado !== 'listo') {
    const esFallaCamara =
      estado === 'sin_camara' || estado === 'camara_ocupada';
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-paper/60 p-6 text-center">
        <IconFaceId size={32} className="text-ink-soft" />
        <p className="text-sm text-ink-soft">
          {MENSAJES_ESTADO[estado] ?? MENSAJES_ESTADO.sin_camara}
        </p>
        {sugerirFichajeManual && esFallaCamara && (
          <p className="rounded-xl bg-amber-50 px-4 py-2.5 text-sm font-medium leading-relaxed text-amber-900">
            {AYUDA_FICHAJE_MANUAL}
          </p>
        )}
        <Boton
          variante="secundario"
          tamano="sm"
          onClick={() => void iniciarCamara()}
        >
          <IconRefresh size={16} /> Reintentar
        </Boton>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-line bg-ink/5">
        <video
          ref={videoRef}
          playsInline
          muted
          className="h-full w-full -scale-x-100 object-cover"
        />
        {/* Guía de encuadre */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 h-3/4 w-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-2 border-white/70"
        />
        {estado === 'iniciando' && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface/80 text-sm text-ink-soft">
            Encendiendo la cámara…
          </div>
        )}
        {/*
          Sin esta indicación la persona se queda mirando fijo esperando
          que pase algo, que es justo lo contrario de lo que necesitamos.
        */}
        {pidiendoParpadeo && (
          <div
            aria-live="polite"
            className="absolute inset-x-0 bottom-0 bg-ink/75 px-4 py-2.5 text-center text-sm font-semibold text-white"
          >
            Parpadeá una vez, mirando a la cámara
          </div>
        )}
      </div>

      {mensaje && (
        <p className="w-full rounded-xl bg-amber-50 px-4 py-2.5 text-center text-sm text-amber-800">
          {mensaje}
        </p>
      )}

      <Boton
        variante="negro"
        onClick={() => void capturar()}
        disabled={estado !== 'listo' || analizando || procesando}
        className="w-full"
      >
        <IconCamera size={18} />
        {analizando ? 'Analizando…' : procesando ? 'Procesando…' : textoBoton}
      </Boton>
    </div>
  );
};
