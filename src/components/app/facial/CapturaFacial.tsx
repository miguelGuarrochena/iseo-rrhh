'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { IconFaceId, IconRefresh } from '@tabler/icons-react';
import { Boton } from '@/components/app/ui/Boton';
import {
  abrirCamara,
  cerrarCamara,
  MENSAJE_FALLA,
  type FallaCamara,
} from '@/lib/facial/camara';
import { diagnosticoActivo } from '@/lib/facial/diagnostico';
import {
  MotorFacial,
  type DetallePlantilla,
  type EstadoMotor,
} from '@/lib/facial/motor';
import type { Exigencia } from '@/lib/facial/liveness';
import { PanelDiagnostico } from './PanelDiagnostico';

interface CapturaFacialProps {
  /**
   * Se llama con la **plantilla**: el promedio de los mejores
   * descriptores del intento, 128 números.
   *
   * No una foto y no un descriptor suelto. La foto nunca se materializa
   * —el dato biométrico que el sistema necesita es la plantilla, de la
   * que no se puede reconstruir la cara— y un descriptor suelto sale de
   * un cuadro cualquiera, con el ruido de ese cuadro adentro.
   */
  onPlantilla: (plantilla: number[], detalle: DetallePlantilla) => void;
  /** Ocupado externo: mientras el servidor decide. */
  procesando?: boolean;
  exigencia?: Exigencia;
  /** Cuántas muestras buenas juntar antes de decidir. */
  muestras?: number;
  /** Cambiar este número reinicia el intento sin recargar los modelos. */
  intento?: number;
  /** Si la cámara no abre, sugiere fichada a mano. */
  sugerirFichajeManual?: boolean;
}

const AYUDA_FICHAJE_MANUAL =
  'Enchufá el dispositivo si está con poca batería. Si sigue igual, avisale a RRHH para que te fichen a mano mientras se carga.';

/** Color del óvalo según qué tan cerca está el cuadro de servir. */
const colorAro = (estado: EstadoMotor | null): string => {
  if (!estado) return 'border-white/60';
  switch (estado.fase) {
    case 'listo':
      return 'border-emerald-400';
    case 'capturando':
      return 'border-emerald-300';
    case 'desafio':
      return 'border-sky-300';
    case 'encuadrando':
      return 'border-amber-300';
    case 'fallo':
      return 'border-red-400';
    default:
      return 'border-white/60';
  }
};

/**
 * Cámara frontal con reconocimiento continuo.
 *
 * Qué cambió respecto de la versión anterior
 * ------------------------------------------
 * No hay botón de capturar. Antes el flujo era: apretar, esperar cuatro
 * segundos de prueba de vida, y calcular el descriptor sobre el cuadro
 * que hubiera en ese momento. Ahora la cámara mira continuamente, cada
 * cuadro se puntúa, y el sistema se queda con los mejores. La persona no
 * tiene que hacer nada más que ponerse enfrente — y en todo momento la
 * pantalla dice qué falta, en vez de dejarla mirando fijo sin entender
 * qué pasa.
 */
export const CapturaFacial = ({
  onPlantilla,
  procesando = false,
  exigencia = 'ninguna',
  muestras = 3,
  intento = 0,
  sugerirFichajeManual = false,
}: CapturaFacialProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const motorRef = useRef<MotorFacial | null>(null);
  const onPlantillaRef = useRef(onPlantilla);
  onPlantillaRef.current = onPlantilla;

  const [falla, setFalla] = useState<FallaCamara | null>(null);
  const [iniciando, setIniciando] = useState(true);
  const [estado, setEstado] = useState<EstadoMotor | null>(null);
  const [verDiagnostico, setVerDiagnostico] = useState(false);

  useEffect(() => setVerDiagnostico(diagnosticoActivo()), []);

  const arrancar = useCallback(async () => {
    setIniciando(true);
    setFalla(null);

    const r = await abrirCamara();
    if (!r.ok) {
      setFalla(r.falla);
      setIniciando(false);
      return;
    }

    streamRef.current = r.camara.stream;
    // Con batería crítica —o presión térmica— Android mata el track
    // después de haberlo entregado. Sin esto la pantalla sigue como si
    // hubiera cámara y el fichaje "no anda" sin explicación.
    r.camara.stream.getVideoTracks().forEach((t) =>
      t.addEventListener('ended', () => {
        if (streamRef.current) setFalla('sin_camara');
      })
    );

    const video = videoRef.current;
    if (!video) return;
    video.srcObject = r.camara.stream;
    try {
      await video.play();
    } catch {
      // Algunos navegadores rechazan `play()` si el elemento todavía no
      // está en pantalla; el `autoPlay` del elemento lo resuelve solo.
    }

    const motor = new MotorFacial({
      video,
      exigencia,
      muestras,
      onEstado: setEstado,
      onPlantilla: (plantilla, detalle) =>
        onPlantillaRef.current(plantilla, detalle),
    });
    motorRef.current = motor;
    await motor.iniciar();
    setIniciando(false);
  }, [exigencia, muestras]);

  useEffect(() => {
    void arrancar();
    return () => {
      motorRef.current?.detener();
      motorRef.current = null;
      const stream = streamRef.current;
      streamRef.current = null;
      cerrarCamara(stream);
    };
  }, [arrancar]);

  // El padre incrementa `intento` cuando el servidor rechaza: se vuelve
  // a empezar sin recargar los 10 MB de modelos, que es lo que hacía que
  // el segundo intento se sintiera tan lento como el primero.
  useEffect(() => {
    if (intento > 0) motorRef.current?.reiniciarIntento();
  }, [intento]);

  if (falla) {
    const esFallaCamara = falla === 'sin_camara' || falla === 'camara_ocupada';
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-paper/60 p-6 text-center">
        <IconFaceId size={32} className="text-ink-soft" />
        <p className="text-sm text-ink-soft">{MENSAJE_FALLA[falla]}</p>
        {sugerirFichajeManual && esFallaCamara && (
          <p className="rounded-xl bg-amber-50 px-4 py-2.5 text-sm font-medium leading-relaxed text-amber-900">
            {AYUDA_FICHAJE_MANUAL}
          </p>
        )}
        <Boton
          variante="secundario"
          tamano="sm"
          onClick={() => void arrancar()}
        >
          <IconRefresh size={16} /> Reintentar
        </Boton>
      </div>
    );
  }

  const fase = estado?.fase ?? 'cargando';
  const mensaje = procesando
    ? 'Registrando el fichaje…'
    : (estado?.mensaje ?? 'Preparando el sistema…');

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-line bg-ink/5">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="h-full w-full -scale-x-100 object-cover"
        />

        {/* Guía de encuadre. El color es información, no decoración: dice
            si el cuadro sirve sin obligar a leer el texto. */}
        <div
          aria-hidden
          className={`pointer-events-none absolute left-1/2 top-1/2 h-3/4 w-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-[3px] transition-colors duration-200 ${colorAro(estado)}`}
        />

        {(iniciando || fase === 'cargando') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface/85 text-sm text-ink-soft">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />
            Preparando el sistema…
          </div>
        )}

        {/*
          `aria-live="polite"` en el mensaje y no sólo en el aviso de
          parpadeo: quien usa lector de pantalla necesita las mismas
          indicaciones de encuadre que todos los demás.
        */}
        <div
          aria-live="polite"
          className="absolute inset-x-0 bottom-0 bg-ink/75 px-4 py-2.5 text-center text-sm font-semibold text-white"
        >
          {mensaje}
        </div>

        {/* Progreso de muestras: la persona ve que algo avanza. */}
        {(fase === 'capturando' || fase === 'desafio') && (
          <div className="absolute inset-x-0 bottom-11 h-1 bg-white/25">
            <div
              className="h-full bg-emerald-400 transition-[width] duration-200"
              style={{ width: `${Math.round((estado?.progreso ?? 0) * 100)}%` }}
            />
          </div>
        )}
      </div>

      {fase === 'fallo' && !procesando && (
        <Boton
          variante="secundario"
          tamano="sm"
          onClick={() => motorRef.current?.reiniciarIntento()}
        >
          <IconRefresh size={16} /> Probar de nuevo
        </Boton>
      )}

      {verDiagnostico && estado && (
        <PanelDiagnostico diagnostico={estado.diagnostico} fase={estado.fase} />
      )}
    </div>
  );
};
