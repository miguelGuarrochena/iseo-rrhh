'use client';

import { useEffect, useState } from 'react';
import {
  IconBrandAndroid,
  IconBrandApple,
  IconDeviceMobileDown,
  IconDotsVertical,
  IconPlus,
  IconShare2,
  IconSquareRoundedPlus,
} from '@tabler/icons-react';
import { Modal } from '@mantine/core';
import { Boton } from './ui/Boton';

/** Evento no estandarizado de Chrome para instalar la PWA. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let promptDiferido: BeforeInstallPromptEvent | null = null;

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    promptDiferido = e as BeforeInstallPromptEvent;
  });
}

const Paso = ({
  numero,
  icono,
  children,
}: {
  numero: number;
  icono?: React.ReactNode;
  children: React.ReactNode;
}) => (
  <li className="flex items-center gap-3">
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
      {numero}
    </span>
    <span className="flex items-center gap-1.5 text-sm text-ink">
      {children}
      {icono}
    </span>
  </li>
);

interface InstalarAppModalProps {
  abierto: boolean;
  onCerrar: () => void;
}

/**
 * Instructivo para instalar ISEO RH como app en el celular.
 * En Android/Chrome ofrece instalación directa si el navegador lo permite.
 */
export const InstalarAppModal = ({
  abierto,
  onCerrar,
}: InstalarAppModalProps) => {
  const [instalable, setInstalable] = useState(false);
  const [instalada, setInstalada] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setInstalable(Boolean(promptDiferido));
    setInstalada(window.matchMedia('(display-mode: standalone)').matches);
  }, [abierto]);

  const instalar = async () => {
    if (!promptDiferido) return;
    await promptDiferido.prompt();
    const eleccion = await promptDiferido.userChoice;
    if (eleccion.outcome === 'accepted') {
      promptDiferido = null;
      setInstalable(false);
    }
  };

  return (
    <Modal
      opened={abierto}
      onClose={onCerrar}
      title="Instalar ISEO RH en tu celular"
      radius="lg"
      centered
      styles={{ title: { fontWeight: 800 } }}
    >
      <div className="flex flex-col gap-5">
        <p className="text-sm leading-relaxed text-ink-soft">
          Instalada, la app se abre desde un ícono propio, a pantalla completa y
          sin escribir la dirección: ideal para fichar y firmar recibos.
        </p>

        {instalada && (
          <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
            Ya estás usando la app instalada. Nada más que hacer acá.
          </p>
        )}

        {instalable && !instalada && (
          <Boton variante="negro" onClick={() => void instalar()}>
            <IconDeviceMobileDown size={18} />
            Instalar ahora
          </Boton>
        )}

        <div className="rounded-2xl border border-line bg-paper/60 p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-bold text-ink">
            <IconBrandApple size={18} /> iPhone / iPad (Safari)
          </p>
          <ol className="flex list-none flex-col gap-2.5">
            <Paso numero={1} icono={<IconShare2 size={16} />}>
              Tocá el botón <strong>Compartir</strong>
            </Paso>
            <Paso numero={2} icono={<IconSquareRoundedPlus size={16} />}>
              Elegí <strong>Agregar a pantalla de inicio</strong>
            </Paso>
            <Paso numero={3}>
              Confirmá con <strong>Agregar</strong>
            </Paso>
          </ol>
        </div>

        <div className="rounded-2xl border border-line bg-paper/60 p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-bold text-ink">
            <IconBrandAndroid size={18} /> Android (Chrome)
          </p>
          <ol className="flex list-none flex-col gap-2.5">
            <Paso numero={1} icono={<IconDotsVertical size={16} />}>
              Abrí el menú <strong>⋮</strong> del navegador
            </Paso>
            <Paso numero={2} icono={<IconPlus size={16} />}>
              Tocá <strong>Instalar app</strong> (o &quot;Agregar a pantalla
              principal&quot;)
            </Paso>
            <Paso numero={3}>
              Confirmá con <strong>Instalar</strong>
            </Paso>
          </ol>
        </div>

        <p className="text-xs text-ink-soft">
          El ícono de ISEO RH queda junto a tus otras apps. Se actualiza sola:
          no hace falta descargar nada de la tienda.
        </p>
      </div>
    </Modal>
  );
};
