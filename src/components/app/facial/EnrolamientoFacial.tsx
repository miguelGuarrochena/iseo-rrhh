'use client';

import { useState } from 'react';
import { Modal } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconFaceId, IconCircleCheck, IconTrash } from '@tabler/icons-react';
import { Boton } from '@/components/app/ui/Boton';
import { CapturaFacial } from './CapturaFacial';
import { avisoError, avisoExito } from '@/lib/avisos';
import { borrarRostro, enrolarRostro } from '@/lib/services/rrhh';
import { Empleado } from '@/types/rrhh';

interface EnrolamientoFacialProps {
  empleado: Empleado;
  onActualizado: (empleado: Empleado) => void;
}

/**
 * Registro del rostro del colaborador para el fichaje facial.
 * Requiere consentimiento explícito (dato biométrico, Ley 25.326).
 */
export const EnrolamientoFacial = ({
  empleado,
  onActualizado,
}: EnrolamientoFacialProps) => {
  const [abierto, { open, close }] = useDisclosure(false);
  const [consiente, setConsiente] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const enrolado = Boolean(empleado.descriptorFacial?.length);
  const nombre = empleado.nombre;

  const abrir = () => {
    setConsiente(false);
    open();
  };

  const capturar = async (descriptor: number[]) => {
    setGuardando(true);
    try {
      const actualizado = await enrolarRostro(empleado.id, descriptor);
      if (actualizado) {
        onActualizado(actualizado);
        avisoExito(
          'Rostro registrado',
          `${nombre} ya puede fichar con la cara.`
        );
        close();
      }
    } catch {
      avisoError('No pudimos registrar el rostro', 'Probá de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  const quitar = async () => {
    setGuardando(true);
    try {
      const actualizado = await borrarRostro(empleado.id);
      if (actualizado) {
        onActualizado(actualizado);
        avisoExito('Rostro eliminado', 'Se borró el dato biométrico.');
      }
    } catch {
      avisoError('No pudimos eliminar el rostro', 'Probá de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
            <IconFaceId size={20} stroke={1.9} />
          </span>
          <div>
            <p className="text-sm font-bold text-ink">Reconocimiento facial</p>
            {enrolado ? (
              <p className="mt-0.5 flex items-center gap-1.5 text-sm text-emerald-700">
                <IconCircleCheck size={15} />
                Rostro registrado
                {empleado.consentimientoBiometrico?.fecha
                  ? ` · ${empleado.consentimientoBiometrico.fecha}`
                  : ''}
              </p>
            ) : (
              <p className="mt-0.5 text-sm text-ink-soft">
                Sin rostro registrado. No puede fichar con la cara todavía.
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          {enrolado && (
            <Boton
              variante="secundario"
              tamano="sm"
              onClick={() => void quitar()}
              disabled={guardando}
            >
              <IconTrash size={15} />
            </Boton>
          )}
          <Boton variante="secundario" tamano="sm" onClick={abrir}>
            {enrolado ? 'Volver a registrar' : 'Registrar rostro'}
          </Boton>
        </div>
      </div>

      <Modal
        opened={abierto}
        onClose={close}
        title={`Registrar rostro de ${nombre}`}
        radius="lg"
        centered
        styles={{ title: { fontWeight: 800 } }}
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm leading-relaxed text-ink-soft">
            Vamos a tomar una foto para que {nombre} pueda fichar con la cara.
            La imagen no se guarda: se convierte en un código que no permite
            reconstruir el rostro.
          </p>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line bg-paper/60 p-3">
            <input
              type="checkbox"
              checked={consiente}
              onChange={(e) => setConsiente(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600"
            />
            <span className="text-sm text-ink">
              {nombre} autoriza el uso de sus datos biométricos (rostro) para
              registrar su asistencia, conforme a la Ley 25.326 de Protección de
              Datos Personales.
            </span>
          </label>

          {consiente ? (
            <CapturaFacial
              onCaptura={(descriptor) => void capturar(descriptor)}
              procesando={guardando}
              textoBoton="Registrar rostro"
            />
          ) : (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-center text-sm text-amber-800">
              Marcá el consentimiento para habilitar la cámara.
            </p>
          )}
        </div>
      </Modal>
    </>
  );
};
