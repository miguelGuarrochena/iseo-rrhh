'use client';

import { useState } from 'react';
import { Modal } from '@mantine/core';
import { IconCircleCheck } from '@tabler/icons-react';
import { Boton } from '@/components/app/ui/Boton';
import { CapturaFacial } from './CapturaFacial';
import {
  UMBRAL_COINCIDENCIA,
  distancia,
  mejorCoincidencia,
} from '@/lib/facial/reconocimiento';
import { distanciaMetros, obtenerUbicacion } from '@/lib/facial/ubicacion';
import { ficharAhora, getDescriptoresFaciales } from '@/lib/services/rrhh';
import { Fichaje, Geocerca, MetodoFichaje } from '@/types/rrhh';

type Modo = 'verificar' | 'identificar';

interface FichajeFacialModalProps {
  abierto: boolean;
  onCerrar: () => void;
  /** 'verificar' = 1:1 (celular propio); 'identificar' = 1:N (tablet). */
  modo: Modo;
  /** Requeridos en modo 'verificar'. */
  empleadoId?: string;
  descriptorEmpleado?: number[];
  /** Nombre a mostrar dado un id (para el modo tablet). */
  resolverNombre?: (empleadoId: string) => string;
  /** Método con que se registra (celular/remoto en verificar; tablet en identificar). */
  metodoRegistro?: MetodoFichaje;
  /** Si captura ubicación GPS (celular y tablet sí; remoto no). */
  pedirUbicacion?: boolean;
  /** Zona de trabajo a validar (modo celular). */
  geocerca?: Geocerca;
  onFichado: (fichaje: Fichaje, empleadoId: string) => void;
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
  descriptorEmpleado,
  resolverNombre,
  metodoRegistro,
  pedirUbicacion = true,
  geocerca,
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

  const fichar = async (empId: string, confianza: number, foto: string) => {
    const metodo: MetodoFichaje =
      modo === 'identificar' ? 'facial_tablet' : (metodoRegistro ?? 'celular');

    let geo: { lat: number; lng: number } | undefined;
    let fueraDeZona: boolean | undefined;
    if (pedirUbicacion) {
      geo = await obtenerUbicacion();
      if (geo && geocerca) {
        fueraDeZona = distanciaMetros(geo, geocerca) > geocerca.radioM;
      }
    }

    const fichaje = await ficharAhora(empId, {
      metodo,
      confianza,
      geo,
      fotoUrl: foto,
      fueraDeZona,
    });
    setResultado({
      tipo: fichaje.tipo,
      nombre: resolverNombre?.(empId),
      confianza,
      fueraDeZona,
    });
    onFichado(fichaje, empId);
  };

  const procesar = async (descriptor: number[], foto: string) => {
    setError(null);
    setProcesando(true);
    try {
      if (modo === 'verificar') {
        if (!empleadoId || !descriptorEmpleado?.length) {
          setError('Todavía no registraste tu rostro. Pedíselo a RRHH.');
          return;
        }
        const d = distancia(descriptor, descriptorEmpleado);
        if (d > UMBRAL_COINCIDENCIA) {
          setError('No te reconocimos. Acercate, mirá de frente y con luz.');
          return;
        }
        await fichar(
          empleadoId,
          Math.max(0, 1 - d / UMBRAL_COINCIDENCIA),
          foto
        );
      } else {
        const candidatos = await getDescriptoresFaciales();
        if (candidatos.length === 0) {
          setError(
            'Todavía no hay rostros registrados. Registrá la cara de los colaboradores desde su ficha para poder fichar en planta.'
          );
          return;
        }
        const match = mejorCoincidencia(descriptor, candidatos);
        if (!match) {
          setError(
            'No reconocimos a nadie. Acercate, mirá de frente y con buena luz.'
          );
          return;
        }
        await fichar(match.empleadoId, match.confianza, foto);
      }
    } catch {
      setError('No pudimos registrar el fichaje. Probá de nuevo.');
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
            onCaptura={(descriptor, foto) => void procesar(descriptor, foto)}
            procesando={procesando}
            textoBoton="Fichar"
          />
        </div>
      )}
    </Modal>
  );
};
