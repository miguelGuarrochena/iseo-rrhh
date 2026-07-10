'use client';

import { useState } from 'react';
import { Modal } from '@mantine/core';
import { IconLock } from '@tabler/icons-react';
import { Boton } from '@/components/app/ui/Boton';
import { Campo } from '@/components/app/ui/Campo';
import { activarKiosco, pinValido } from '@/lib/kiosco';

interface Props {
  abierto: boolean;
  onCerrar: () => void;
}

/**
 * Activa el Modo planta: bloquea esta tablet como terminal de fichaje.
 * Se define un PIN para poder salir; mientras esté bloqueada no se
 * puede navegar ni ver nada de la sesión que la activó.
 */
export const ActivarKioscoModal = ({ abierto, onCerrar }: Props) => {
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [activando, setActivando] = useState(false);

  const activar = async () => {
    if (!pinValido(pin)) {
      setError('El PIN debe tener entre 4 y 6 números.');
      return;
    }
    if (pin !== pin2) {
      setError('Los PIN no coinciden.');
      return;
    }
    setError(null);
    setActivando(true);
    await activarKiosco(pin);
    // Recarga completa: el layout detecta el kiosco y bloquea todo.
    window.location.reload();
  };

  return (
    <Modal
      opened={abierto}
      onClose={onCerrar}
      title="Bloquear tablet en Modo planta"
      radius="lg"
      centered
      styles={{ title: { fontWeight: 800 } }}
    >
      <div className="flex flex-col gap-3.5">
        <p className="text-sm leading-relaxed text-ink-soft">
          La tablet queda <strong className="text-ink">bloqueada</strong> en la
          pantalla de fichaje facial: no se puede navegar ni ver datos de tu
          usuario, aunque quede sin supervisión. Tu sesión en otros dispositivos
          sigue funcionando normal.
        </p>
        <Campo
          etiqueta="PIN para desbloquear (4 a 6 números)"
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="••••"
        />
        <Campo
          etiqueta="Repetí el PIN"
          type="password"
          inputMode="numeric"
          value={pin2}
          onChange={(e) => setPin2(e.target.value)}
          error={error ?? undefined}
          placeholder="••••"
        />
        <p className="rounded-xl bg-paper px-4 py-3 text-xs text-ink-soft">
          Guardá el PIN: es la única forma de salir del modo terminal en esta
          tablet. Si se pierde, hay que borrar los datos del navegador de la
          tablet y volver a autorizarla.
        </p>
        <Boton onClick={() => void activar()} disabled={activando}>
          <IconLock size={16} />
          {activando ? 'Bloqueando…' : 'Bloquear y activar'}
        </Boton>
      </div>
    </Modal>
  );
};
