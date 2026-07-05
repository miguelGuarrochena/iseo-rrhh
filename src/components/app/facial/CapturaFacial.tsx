'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { IconCamera, IconFaceId, IconRefresh } from '@tabler/icons-react';
import { Boton } from '@/components/app/ui/Boton';
import { cargarModelos, obtenerDescriptor } from '@/lib/facial/reconocimiento';

interface CapturaFacialProps {
  /** Se llama con el descriptor (128 nros) y una foto JPEG (dataURL). */
  onCaptura: (descriptor: number[], foto: string) => void;
  /** Estado ocupado externo (ej. mientras se guarda / se ficha). */
  procesando?: boolean;
  textoBoton?: string;
}

type Estado = 'iniciando' | 'listo' | 'sin_camara' | 'permiso_denegado';

/**
 * Cámara frontal + extracción de descriptor facial en el dispositivo.
 * La imagen no se sube: se procesa localmente y se entrega el descriptor.
 */
export const CapturaFacial = ({
  onCaptura,
  procesando = false,
  textoBoton = 'Capturar',
}: CapturaFacialProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [estado, setEstado] = useState<Estado>('iniciando');
  const [analizando, setAnalizando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const iniciarCamara = useCallback(async () => {
    setEstado('iniciando');
    setMensaje(null);
    try {
      void cargarModelos();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 640, height: 480 },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setEstado('listo');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setEstado('permiso_denegado');
      } else {
        setEstado('sin_camara');
      }
    }
  }, []);

  useEffect(() => {
    void iniciarCamara();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [iniciarCamara]);

  const capturar = async () => {
    if (!videoRef.current || analizando || procesando) return;
    setAnalizando(true);
    setMensaje(null);
    try {
      const descriptor = await obtenerDescriptor(videoRef.current);
      if (!descriptor) {
        setMensaje(
          'No detectamos una sola cara. Acercate, mirá de frente y con buena luz.'
        );
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0);
      const foto = canvas.toDataURL('image/jpeg', 0.7);
      onCaptura(Array.from(descriptor), foto);
    } catch {
      setMensaje(
        'No pudimos iniciar el reconocimiento facial. Revisá tu conexión e intentá de nuevo.'
      );
    } finally {
      setAnalizando(false);
    }
  };

  if (estado === 'permiso_denegado' || estado === 'sin_camara') {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-paper/60 p-6 text-center">
        <IconFaceId size={32} className="text-ink-soft" />
        <p className="text-sm text-ink-soft">
          {estado === 'permiso_denegado'
            ? 'Necesitamos permiso para usar la cámara. Habilitalo y reintentá.'
            : 'No pudimos acceder a la cámara de este dispositivo.'}
        </p>
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
