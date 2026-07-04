'use client';

import { ReactNode, useEffect, useState } from 'react';
import {
  IconBrandAndroid,
  IconBrandApple,
  IconDeviceDesktop,
  IconDotsVertical,
  IconDownload,
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

type Dispositivo = 'ios' | 'android' | 'escritorio';

const detectarDispositivo = (): Dispositivo => {
  if (typeof navigator === 'undefined') return 'escritorio';
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'escritorio';
};

const Paso = ({
  numero,
  children,
}: {
  numero: number;
  children: ReactNode;
}) => (
  <li className="flex items-start gap-3">
    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
      {numero}
    </span>
    <span className="text-sm leading-relaxed text-ink">{children}</span>
  </li>
);

/** Ícono en línea con el texto de un paso. */
const IconoEnLinea = ({ children }: { children: ReactNode }) => (
  <span className="mx-0.5 inline-flex -translate-y-px items-center align-middle text-ink-soft">
    {children}
  </span>
);

const Tarjeta = ({
  titulo,
  icono,
  children,
}: {
  titulo: string;
  icono: ReactNode;
  children: ReactNode;
}) => (
  <div className="rounded-2xl border border-line bg-paper/60 p-4">
    <p className="mb-3 flex items-center gap-2 text-sm font-bold text-ink">
      {icono} {titulo}
    </p>
    <ol className="flex list-none flex-col gap-2.5">{children}</ol>
  </div>
);

const InstruccionesIOS = () => (
  <Tarjeta titulo="iPhone / iPad (Safari)" icono={<IconBrandApple size={18} />}>
    <Paso numero={1}>
      Tocá el botón <strong>Compartir</strong>
      <IconoEnLinea>
        <IconShare2 size={15} />
      </IconoEnLinea>
    </Paso>
    <Paso numero={2}>
      Elegí <strong>Agregar a pantalla de inicio</strong>
      <IconoEnLinea>
        <IconSquareRoundedPlus size={15} />
      </IconoEnLinea>
    </Paso>
    <Paso numero={3}>
      Confirmá con <strong>Agregar</strong>
    </Paso>
  </Tarjeta>
);

const InstruccionesAndroid = () => (
  <Tarjeta titulo="Android (Chrome)" icono={<IconBrandAndroid size={18} />}>
    <Paso numero={1}>
      Abrí el menú
      <IconoEnLinea>
        <IconDotsVertical size={15} />
      </IconoEnLinea>
      del navegador
    </Paso>
    <Paso numero={2}>
      Tocá <strong>Instalar app</strong>{' '}
      <span className="text-ink-soft">(o “Agregar a pantalla principal”)</span>
    </Paso>
    <Paso numero={3}>
      Confirmá con <strong>Instalar</strong>
    </Paso>
  </Tarjeta>
);

const InstruccionesEscritorio = () => (
  <Tarjeta
    titulo="Escritorio (Chrome / Edge)"
    icono={<IconDeviceDesktop size={18} />}
  >
    <Paso numero={1}>
      En la barra de direcciones, hacé clic en el ícono
      <IconoEnLinea>
        <IconDownload size={15} />
      </IconoEnLinea>
      de instalar
    </Paso>
    <Paso numero={2}>
      O abrí el menú
      <IconoEnLinea>
        <IconDotsVertical size={15} />
      </IconoEnLinea>
      y elegí <strong>Instalar ISEO RH</strong>
    </Paso>
    <Paso numero={3}>
      Confirmá con <strong>Instalar</strong>
    </Paso>
  </Tarjeta>
);

interface InstalarAppModalProps {
  abierto: boolean;
  onCerrar: () => void;
}

/**
 * Instructivo para instalar ISEO RH como app. Detecta el dispositivo y
 * muestra solo lo que corresponde (escritorio, iPhone o Android). En los
 * navegadores que lo permiten, ofrece instalación directa con un botón.
 */
export const InstalarAppModal = ({
  abierto,
  onCerrar,
}: InstalarAppModalProps) => {
  const [instalable, setInstalable] = useState(false);
  const [instalada, setInstalada] = useState(false);
  const [dispositivo, setDispositivo] = useState<Dispositivo>('escritorio');

  useEffect(() => {
    if (!abierto) return;
    setInstalable(Boolean(promptDiferido));
    setInstalada(window.matchMedia('(display-mode: standalone)').matches);
    setDispositivo(detectarDispositivo());
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

  const esEscritorio = dispositivo === 'escritorio';
  const donde = esEscritorio ? 'tu escritorio' : 'tu celular';

  return (
    <Modal
      opened={abierto}
      onClose={onCerrar}
      title={`Instalar ISEO RH en ${donde}`}
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
            <IconDownload size={18} />
            Instalar ahora
          </Boton>
        )}

        {!instalada && (
          <>
            {dispositivo === 'ios' && <InstruccionesIOS />}
            {dispositivo === 'android' && <InstruccionesAndroid />}
            {esEscritorio && <InstruccionesEscritorio />}
          </>
        )}

        <p className="text-xs text-ink-soft">
          El ícono de ISEO RH queda junto a tus otras apps. Se actualiza sola:
          no hace falta descargar nada de la tienda.
        </p>
      </div>
    </Modal>
  );
};
