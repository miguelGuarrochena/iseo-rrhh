'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@mantine/core';
import { IconClock, IconLogin2, IconLogout2 } from '@tabler/icons-react';
import { Boton } from '@/components/app/ui/Boton';
import { CapturaFacial } from './CapturaFacial';
import { AvisoBateria } from './AvisoBateria';
import { obtenerUbicacion } from '@/lib/facial/ubicacion';
import { useBateria } from '@/lib/dispositivo/useBateria';
import { ficharConRostro } from '@/lib/services/rrhh';
import { interpretarError } from '@/lib/errores';
import {
  marcaKioscoYaVista,
  PAUSA_ENTRE_MARCAS_KIOSCO_MIN,
} from '@/lib/kiosco';
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
  onFichado?: (fichaje: Fichaje, empleadoId: string) => void;
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
  /**
   * El servidor devolvió una marca que ya estaba: la misma cara, hace
   * menos de la pausa. No es un ingreso ni un egreso nuevo.
   */
  repetida?: boolean;
}

/** Cuánto se muestra quién fichó en la tablet antes de la siguiente cara. */
const CONFIRMACION_KIOSCO_MS = 5000;

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

  // En planta no hay que tocar "Fichar a otro": se muestra quién fichó
  // un momento y la cámara vuelve sola para el que sigue.
  useEffect(() => {
    if (!resultado || modo !== 'identificar') return;
    const id = window.setTimeout(() => {
      setResultado(null);
      setError(null);
      setIntento((n) => n + 1);
    }, CONFIRMACION_KIOSCO_MS);
    return () => window.clearTimeout(id);
  }, [resultado, modo]);

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

      const repetida = modo === 'identificar' && marcaKioscoYaVista(fichaje.id);

      setResultado({
        tipo: fichaje.tipo,
        nombre: resolverNombre?.(fichaje.empleadoId),
        confianza: fichaje.confianza ?? 0,
        fueraDeZona: fichaje.fueraDeZona,
        timestamp: fichaje.timestamp,
        repetida,
      });
      if (!repetida) {
        onFichado?.(fichaje, fichaje.empleadoId);
      }
    } catch (err) {
      // El servidor distingue "no te reconocí" de "se cayó la conexión";
      // mostrar siempre "probá de nuevo" hacía que la persona insistiera
      // contra la cámara cuando el problema era otro.
      const interpretado = interpretarError(err);
      // En el kiosco "elegí una empresa" es un callejón: el dueño de
      // ISEO no tiene empresa en el JWT, y mandarlo a /empresas con la
      // tablet bloqueada no arregla nada. El arreglo de verdad está en
      // el RPC (F-06); este texto es por si igual llega acá.
      const enKioscoSinEmpresa =
        modo === 'identificar' && interpretado.tipo === 'empresa';
      setError(
        enKioscoSinEmpresa
          ? 'Esta tablet no tiene una empresa asignada. Pedile a RRHH que la vuelva a autorizar.'
          : interpretado.detalle || interpretado.titulo
      );
      // "Sin empresa activa" no es reintentable: reiniciar la cámara
      // era el bucle eterno (captura → RPC rechaza → parpadeá de nuevo).
      if (interpretado.reintentable) {
        setIntento((n) => n + 1);
      }
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
      /*
       * En tablet el modal por defecto (420 px) dejaba una cámara
       * chiquita en el medio de una pantalla de 10". El óvalo, que va en
       * porcentajes del cuadro, quedaba chico por arrastre. Con `xl` el
       * cuadro usa el ancho real del dispositivo —Mantine igual lo
       * recorta al viewport— y en el celular no cambia nada.
       */
      size="xl"
      centered
      styles={{ title: { fontWeight: 800 } }}
    >
      {resultado ? (
        <ConfirmacionFichaje
          resultado={resultado}
          modo={modo}
          onListo={cerrar}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm leading-relaxed text-ink-soft">
            {modo === 'identificar'
              ? 'La cámara ya está prendida. Poné la cara en el óvalo, de frente, y parpadeá una vez. No hace falta tocar nada más. Una foto no sirve.'
              : 'Poné la cara en el óvalo, de frente, y parpadeá una vez. No hace falta apretar ningún botón.'}
          </p>

          <AvisoBateria bateria={bateria} />

          {error && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-center text-sm text-red-700">
              {error}
            </p>
          )}

          {/*
            El parpadeo es lo que corta una foto impresa o en otro
            teléfono. El giro de cabeza se dejó: en planta la fila no lo
            bancaba. Un vídeo de frente que parpadea todavía pasa; eso
            está documentado y no se afirma lo contrario.
          */}
          <CapturaFacial
            onPlantilla={(plantilla) => void procesar(plantilla)}
            procesando={procesando}
            exigencia="parpadeo"
            muestras={modo === 'identificar' ? 2 : 3}
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

/**
 * Lo que tiene que leerse a un metro, en un segundo, con gente atrás:
 * si fue entrada o salida, quién, y a qué hora. El resto es ruido.
 */
const ConfirmacionFichaje = ({
  resultado,
  modo,
  onListo,
}: {
  resultado: Resultado;
  modo: Modo;
  onListo: () => void;
}) => {
  const esIngreso = resultado.tipo === 'ingreso';
  const repetida = Boolean(resultado.repetida);
  const hora = new Date(resultado.timestamp).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const titulo = repetida
    ? esIngreso
      ? 'Ya ingresaste'
      : 'Ya egresaste'
    : esIngreso
      ? 'Ingreso'
      : 'Egreso';

  const pista = repetida
    ? esIngreso
      ? `Esperá ${PAUSA_ENTRE_MARCAS_KIOSCO_MIN} minutos para el egreso. El que sigue toca Fichar.`
      : `Esperá ${PAUSA_ENTRE_MARCAS_KIOSCO_MIN} minutos para volver a ingresar. El que sigue toca Fichar.`
    : esIngreso
      ? `El que sigue toca Fichar. Cuando te vayas, esperá ${PAUSA_ENTRE_MARCAS_KIOSCO_MIN} minutos y volvé a tocar Fichar.`
      : 'Listo. El que sigue toca Fichar.';

  return (
    <div
      className={`flex flex-col items-center gap-5 rounded-2xl px-4 py-8 text-center ${
        repetida ? 'bg-amber-50' : esIngreso ? 'bg-emerald-50' : 'bg-sky-50'
      }`}
    >
      <span
        className={`flex h-24 w-24 items-center justify-center rounded-full ${
          repetida
            ? 'bg-amber-500 text-white'
            : esIngreso
              ? 'bg-emerald-600 text-white'
              : 'bg-sky-600 text-white'
        }`}
      >
        {repetida ? (
          <IconClock size={48} stroke={2} />
        ) : esIngreso ? (
          <IconLogin2 size={48} stroke={2} />
        ) : (
          <IconLogout2 size={48} stroke={2} />
        )}
      </span>
      <p
        className={`text-4xl font-extrabold tracking-tight sm:text-5xl ${
          repetida
            ? 'text-amber-900'
            : esIngreso
              ? 'text-emerald-800'
              : 'text-sky-900'
        }`}
      >
        {titulo}
      </p>
      {resultado.nombre && (
        <p className="text-2xl font-bold leading-tight text-ink">
          {resultado.nombre}
        </p>
      )}
      {/*
        Hora que registró el servidor, no el reloj de la tablet.
      */}
      <p className="text-4xl font-extrabold tabular-nums tracking-tight text-ink">
        {hora}
      </p>
      {resultado.fueraDeZona && (
        <p className="rounded-lg bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-800">
          Registrado fuera de la zona de trabajo
        </p>
      )}
      {modo === 'identificar' && (
        <p className="max-w-sm text-sm font-medium leading-relaxed text-ink-soft">
          {pista}
        </p>
      )}
      {modo === 'verificar' && (
        <Boton className="mt-2 w-full max-w-xs" onClick={onListo}>
          Listo
        </Boton>
      )}
    </div>
  );
};
