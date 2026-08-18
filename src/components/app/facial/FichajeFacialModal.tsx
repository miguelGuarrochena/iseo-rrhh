'use client';

import { useState } from 'react';
import { Modal } from '@mantine/core';
import { IconCircleCheck } from '@tabler/icons-react';
import { Boton } from '@/components/app/ui/Boton';
import { CapturaFacial } from './CapturaFacial';
import { AvisoBateria } from './AvisoBateria';
import { obtenerUbicacion } from '@/lib/facial/ubicacion';
import { useBateria } from '@/lib/dispositivo/useBateria';
import { ficharConRostro } from '@/lib/services/rrhh';
import { interpretarError } from '@/lib/errores';
import { Fichaje } from '@/types/rrhh';

type Modo = 'verificar' | 'identificar';

interface FichajeFacialModalProps {
  abierto: boolean;
  onCerrar: () => void;
  /** 'verificar' = 1:1 (celular propio); 'identificar' = 1:N (tablet). */
  modo: Modo;
  /** Requerido en modo 'verificar': a quién se está confirmando. */
  empleadoId?: string;
  /** Nombre a mostrar dado un id (para el modo tablet). */
  resolverNombre?: (empleadoId: string) => string;
  /** Si captura ubicación GPS (celular y tablet sí; remoto no). */
  pedirUbicacion?: boolean;
  onFichado: (fichaje: Fichaje, empleadoId: string) => void;
  // Ya no recibe `descriptorEmpleado` ni `geocerca`: el rostro enrolado y
  // la zona de trabajo viven en el servidor y no bajan al cliente. Es lo
  // que impide falsear la confianza o el "dentro de zona" desde acá.
}

interface Resultado {
  tipo: Fichaje['tipo'];
  nombre?: string;
  confianza: number;
  fueraDeZona?: boolean;
  /** Hora que registró el **servidor**, no la del dispositivo. */
  timestamp: string;
}

/**
 * Fichaje por reconocimiento facial. En 'verificar' confirma que sos vos;
 * en 'identificar' busca quién sos entre los rostros enrolados.
 */
export const FichajeFacialModal = ({
  abierto,
  onCerrar,
  modo,
  empleadoId,
  resolverNombre,
  pedirUbicacion = true,
  onFichado,
}: FichajeFacialModalProps) => {
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  /**
   * Se incrementa en cada rechazo para que la cámara reinicie el intento
   * **sin** volver a cargar los modelos. Antes cada reintento pagaba de
   * nuevo los 10 MB de pesos, así que el segundo intento se sentía tan
   * lento como el primero justo cuando la persona ya estaba impaciente.
   */
  const [intento, setIntento] = useState(0);
  const bateria = useBateria();

  const cerrar = () => {
    setError(null);
    setResultado(null);
    onCerrar();
  };

  /**
   * Manda el descriptor y las coordenadas crudas; el resto lo decide el
   * servidor.
   *
   * Antes esta pantalla comparaba el rostro contra los descriptores de
   * toda la empresa, calculaba la confianza y la geocerca, y mandaba las
   * tres cosas ya resueltas para que se guardaran tal cual. Es decir: la
   * fichada valía lo que valía la palabra del navegador. Ahora el match
   * y la geocerca los hace el RPC `fichar_con_rostro`, que además nunca
   * baja los rostros enrolados a la tablet.
   */
  const procesar = async (descriptor: number[]) => {
    setError(null);
    setProcesando(true);
    try {
      if (modo === 'verificar' && !empleadoId) {
        setError('Todavía no registraste tu rostro. Pedíselo a RRHH.');
        return;
      }

      // Sólo las coordenadas: si está dentro de la zona lo resuelve el
      // servidor contra la geocerca guardada, no el cliente.
      const geo = pedirUbicacion ? await obtenerUbicacion() : undefined;

      // No se manda el método: lo deriva la base del camino real (F-07).
      // Un string del request no puede convertir una fichada facial en
      // manual, ni una del celular en una de la terminal.
      const fichaje = await ficharConRostro(descriptor, {
        empleadoId: modo === 'verificar' ? empleadoId : undefined,
        geo,
      });

      setResultado({
        tipo: fichaje.tipo,
        nombre: resolverNombre?.(fichaje.empleadoId),
        confianza: fichaje.confianza ?? 0,
        fueraDeZona: fichaje.fueraDeZona,
        timestamp: fichaje.timestamp,
      });
      onFichado(fichaje, fichaje.empleadoId);
    } catch (err) {
      // El servidor distingue "no te reconocí" de "se cayó la conexión";
      // mostrar siempre "probá de nuevo" hacía que la persona insistiera
      // contra la cámara cuando el problema era otro.
      const { detalle, titulo } = interpretarError(err);
      setError(detalle || titulo);
      setIntento((n) => n + 1);
    } finally {
      setProcesando(false);
    }
  };

  const titulo =
    modo === 'identificar' ? 'Fichar en planta' : 'Fichar con tu cara';

  return (
    <Modal
      opened={abierto}
      onClose={cerrar}
      title={titulo}
      radius="lg"
      centered
      styles={{ title: { fontWeight: 800 } }}
    >
      {resultado ? (
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <IconCircleCheck size={36} />
          </span>
          <div>
            <p className="text-lg font-bold text-ink">
              {resultado.tipo === 'ingreso'
                ? 'Ingreso registrado'
                : 'Egreso registrado'}
            </p>
            {/*
              La hora que se muestra es la que **registró el servidor**,
              no `new Date()` del dispositivo. Una tablet con el reloj
              corrido mostraba una hora distinta de la que quedó
              guardada, y esa es justo la pantalla donde la persona
              confirma que fichó bien.
            */}
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-soft">
              {resultado.nombre ? `${resultado.nombre} · ` : ''}
              {new Date(resultado.timestamp).toLocaleTimeString('es-AR', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
            {resultado.fueraDeZona && (
              <p className="mt-2 rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800">
                Registrado fuera de la zona de trabajo
              </p>
            )}
          </div>
          <div className="flex w-full gap-2">
            {modo === 'identificar' && (
              <Boton
                variante="secundario"
                className="flex-1"
                onClick={() => setResultado(null)}
              >
                Fichar a otro
              </Boton>
            )}
            <Boton className="flex-1" onClick={cerrar}>
              Listo
            </Boton>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm leading-relaxed text-ink-soft">
            {modo === 'identificar'
              ? 'Poné la cara en el óvalo. La cámara te va a pedir parpadear y girar la cabeza: seguí lo que aparece en pantalla.'
              : 'Poné la cara en el óvalo. Cuando te lo pida, parpadeá una vez. No hace falta apretar ningún botón.'}
          </p>

          <AvisoBateria bateria={bateria} />

          {error && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-center text-sm text-red-700">
              {error}
            </p>
          )}

          {/*
            La exigencia de prueba de vida no es la misma en los dos
            modos, porque el riesgo no es el mismo:
            - **identificar** (tablet de planta, sin nadie mirando): es
              donde vive el ataque realista, el compañero que ficha por
              el que llegó tarde. Un parpadeo no lo corta —un vídeo de
              cinco segundos parpadea— así que además se pide un giro de
              cabeza hacia un lado sorteado en el momento.
            - **verificar** (celular propio): la sesión ya dice quién es
              y la cara sólo confirma. Alcanza con el parpadeo; sumar un
              desafío ahí es fricción sin riesgo que la justifique.
          */}
          <CapturaFacial
            onPlantilla={(plantilla) => void procesar(plantilla)}
            procesando={procesando}
            exigencia={
              modo === 'identificar' ? 'parpadeo_y_desafio' : 'parpadeo'
            }
            muestras={3}
            intento={intento}
            sugerirFichajeManual
            ayuda={
              modo === 'identificar'
                ? 'Si no te reconoce, pedile a RRHH que vuelva a registrar tu rostro.'
                : 'La cámara te va diciendo qué hacer. Quedate en el óvalo.'
            }
          />
        </div>
      )}
    </Modal>
  );
};
