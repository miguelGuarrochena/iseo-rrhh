'use client';

import { useState } from 'react';
import { Modal } from '@mantine/core';
import { IconLock } from '@tabler/icons-react';
import { Boton } from '@/components/app/ui/Boton';
import { Campo } from '@/components/app/ui/Campo';
import { useAuth } from '@/lib/auth/AuthProvider';
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
  const { empresaVista } = useAuth();
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
    await activarKiosco(pin, empresaVista);
    window.location.reload();
  };

  return (
    <Modal
      opened={abierto}
      onClose={onCerrar}
      title="Dejar esta tablet para fichar"
      radius="lg"
      centered
      styles={{ title: { fontWeight: 800 } }}
    >
      <div className="flex flex-col gap-3.5">
        <p className="text-sm leading-relaxed text-ink-soft">
          Queda una sola pantalla: Fichar. Quien pase no ve sueldos ni legajos.
        </p>
        <ul className="flex flex-col gap-2 rounded-xl bg-paper px-4 py-3 text-sm text-ink-soft">
          <li>
            <strong className="text-ink">1.</strong> Elegí un PIN de 4 a 6
            números y anotalo.
          </li>
          <li>
            <strong className="text-ink">2.</strong> El equipo ficha con la
            cara, sin usuario.
          </li>
          <li>
            <strong className="text-ink">3.</strong> Para desbloquear: ese PIN o
            tu usuario de RRHH.
          </li>
        </ul>
        <Campo
          etiqueta="PIN para desbloquear"
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="••••"
          ayuda="4 a 6 números. No uses fechas obvias."
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
        <p className="text-xs leading-relaxed text-ink-soft">
          Si se olvida el PIN, RRHH entra con el mismo email y contraseña de
          siempre.
        </p>
        <Boton onClick={() => void activar()} disabled={activando}>
          <IconLock size={16} />
          {activando ? 'Dejando lista la tablet…' : 'Activar fichaje en planta'}
        </Boton>
      </div>
    </Modal>
  );
};
