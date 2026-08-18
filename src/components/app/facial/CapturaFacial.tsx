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
import { GuiaEncuadre } from './GuiaEncuadre';

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
  /** Texto mientras el padre guarda (enrolar / fichar). */
  mensajeProcesando?: string;
  /** Ayuda corta debajo de la cámara. */
  ayuda?: string;
  /**
   * Pausa visible en "Listo" antes de entregar la plantilla.
   * El enrolamiento la usa para que no se cierre el modal de un saque.
   */
  pausaAlCompletar?: number;
}

const AYUDA_FICHAJE_MANUAL =
  'Enchufá el dispositivo si está con poca batería. Si sigue igual, avisale a RRHH para que te fichen a mano mientras se carga.';

export const CapturaFacial = ({
  onPlantilla,
  procesando = false,
  exigencia = 'ninguna',
  muestras = 3,
  intento = 0,
  sugerirFichajeManual = false,
  mensajeProcesando = 'Registrando el fichaje…',
  ayuda,
  pausaAlCompletar = 0,
}: CapturaFacialProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const motorRef = useRef<MotorFacial | null>(null);
  const onPlantillaRef = useRef(onPlantilla);
  onPlantillaRef.current = onPlantilla;
  const pausaAlCompletarRef = useRef(pausaAlCompletar);
  pausaAlCompletarRef.current = pausaAlCompletar;
  const cierreRef = useRef<number | null>(null);

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
      onPlantilla: (plantilla, detalle) => {
        const pausa = pausaAlCompletarRef.current;
        if (pausa <= 0) {
          onPlantillaRef.current(plantilla, detalle);
          return;
        }
        if (cierreRef.current !== null) window.clearTimeout(cierreRef.current);
        cierreRef.current = window.setTimeout(() => {
          cierreRef.current = null;
          onPlantillaRef.current(plantilla, detalle);
        }, pausa);
      },
    });
    motorRef.current = motor;
    await motor.iniciar();
    setIniciando(false);
  }, [exigencia, muestras]);

  useEffect(() => {
    void arrancar();
    return () => {
      if (cierreRef.current !== null) window.clearTimeout(cierreRef.current);
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
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-6 text-center">
        <IconFaceId size={36} className="text-amber-800" />
        <p className="text-sm font-semibold leading-relaxed text-amber-950">
          {MENSAJE_FALLA[falla]}
        </p>
        {sugerirFichajeManual && esFallaCamara && (
          <p className="text-sm font-medium leading-relaxed text-amber-900">
            {AYUDA_FICHAJE_MANUAL}
          </p>
        )}
        <Boton
          variante="primario"
          tamano="md"
          className="w-full max-w-xs"
          onClick={() => void arrancar()}
        >
          <IconRefresh size={18} /> Reintentar
        </Boton>
      </div>
    );
  }

  const fase = estado?.fase ?? 'cargando';
  const mensaje = procesando
    ? mensajeProcesando
    : (estado?.mensaje ?? 'Preparando el sistema…');
  const fallo = fase === 'fallo' && !procesando;

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

        {!fallo && !iniciando && fase !== 'cargando' && (
          <GuiaEncuadre
            fase={fase}
            mensaje={mensaje}
            progreso={estado?.progreso ?? 0}
            muestras={muestras}
            motivo={estado?.diagnostico.ultimoMotivo ?? null}
            lado={estado?.lado ?? null}
            procesando={procesando}
            exigencia={exigencia}
          />
        )}

        {(iniciando || fase === 'cargando') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface/85 text-sm text-ink-soft">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />
            Preparando el sistema…
          </div>
        )}

        {fallo && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-ink/80 px-5 py-6 text-center">
            <p className="text-base font-bold leading-snug text-white">
              No se completó la captura
            </p>
            <p
              aria-live="assertive"
              className="max-w-sm text-sm font-medium leading-relaxed text-white/90"
            >
              {mensaje}
            </p>
            <Boton
              variante="primario"
              tamano="md"
              className="w-full max-w-xs pointer-events-auto"
              onClick={() => motorRef.current?.reiniciarIntento()}
            >
              <IconRefresh size={18} /> Probar de nuevo
            </Boton>
          </div>
        )}
      </div>

      {ayuda && !fallo && !iniciando && fase !== 'cargando' && (
        <p className="text-center text-sm leading-relaxed text-ink-soft">
          {ayuda}
        </p>
      )}

      {verDiagnostico && estado && (
        <PanelDiagnostico diagnostico={estado.diagnostico} fase={estado.fase} />
      )}
    </div>
  );
};
