'use client';

import { useState } from 'react';
import { Modal } from '@mantine/core';
import { IconCircleCheck } from '@tabler/icons-react';
import { Boton } from '@/components/app/ui/Boton';
import { CapturaFacial } from './CapturaFacial';
import { obtenerUbicacion } from '@/lib/facial/ubicacion';
import { ficharConRostro } from '@/lib/services/rrhh';
import { interpretarError } from '@/lib/errores';
import { Fichaje, MetodoFichaje } from '@/types/rrhh';

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
  /** Método con que se registra (celular/remoto en verificar; tablet en identificar). */
  metodoRegistro?: MetodoFichaje;
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
  metodoRegistro,
  pedirUbicacion = true,
  onFichado,
}: FichajeFacialModalProps) => {
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

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

      const fichaje = await ficharConRostro(descriptor, {
        metodo:
          modo === 'identificar'
            ? 'facial_tablet'
            : (metodoRegistro ?? 'celular'),
        empleadoId: modo === 'verificar' ? empleadoId : undefined,
        geo,
      });

      setResultado({
        tipo: fichaje.tipo,
        nombre: resolverNombre?.(fichaje.empleadoId),
        confianza: fichaje.confianza ?? 0,
        fueraDeZona: fichaje.fueraDeZona,
      });
      onFichado(fichaje, fichaje.empleadoId);
    } catch (err) {
      // El servidor distingue "no te reconocí" de "se cayó la conexión";
      // mostrar siempre "probá de nuevo" hacía que la persona insistiera
      // contra la cámara cuando el problema era otro.
      const { detalle, titulo } = interpretarError(err);
      setError(detalle || titulo);
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
            <p className="mt-1 text-sm text-ink-soft">
              {resultado.nombre ? `${resultado.nombre} · ` : ''}
              {new Date().toLocaleTimeString('es-AR', {
                hour: '2-digit',
                minute: '2-digit',
              })}
              {` · ${Math.round(resultado.confianza * 100)}% de confianza`}
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
              ? 'Ubicá tu cara en el óvalo. El sistema te reconoce y registra tu ingreso o egreso.'
              : 'Mirá a la cámara para confirmar tu identidad y registrar el fichaje.'}
          </p>

          {error && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-center text-sm text-red-700">
              {error}
            </p>
          )}

          <CapturaFacial
            onCaptura={(descriptor) => void procesar(descriptor)}
            procesando={procesando}
            textoBoton="Fichar"
            exigirLiveness
          />
        </div>
      )}
    </Modal>
  );
};
