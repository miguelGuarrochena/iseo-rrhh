'use client';

import { useState } from 'react';
import { Modal } from '@mantine/core';
import { Boton } from '@/components/app/ui/Boton';
import { CampoTextarea } from '@/components/app/ui/Campo';
import { anularFichaje } from '@/lib/services/rrhh';
import { avisoError, avisoExito } from '@/lib/avisos';
import { formatearHora } from '@/lib/fechas';
import { Fichaje } from '@/types/rrhh';

interface AnularFichajeModalProps {
  abierto: boolean;
  fichaje: Fichaje | null;
  nombreEmpleado: string;
  onCerrar: () => void;
  onAnulado: (fichaje: Fichaje) => void;
}

/**
 * Anula una marca. No la edita ni la borra: deja quién, cuándo y por
 * qué. Si hace falta la hora correcta, RRHH carga otra a mano después.
 */
export const AnularFichajeModal = ({
  abierto,
  fichaje,
  nombreEmpleado,
  onCerrar,
  onAnulado,
}: AnularFichajeModalProps) => {
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cerrar = () => {
    setMotivo('');
    setError(null);
    onCerrar();
  };

  const guardar = async () => {
    if (!fichaje) return;
    if (!motivo.trim()) {
      setError('Hay que decir por qué se anula.');
      return;
    }
    setError(null);
    setGuardando(true);
    try {
      const anulada = await anularFichaje(fichaje.id, motivo.trim());
      avisoExito(
        'Fichaje anulado',
        `${fichaje.tipo === 'ingreso' ? 'Entrada' : 'Salida'} de ${formatearHora(fichaje.timestamp)}.`
      );
      onAnulado(anulada);
      cerrar();
    } catch (err) {
      const mensaje =
        err instanceof Error ? err.message : 'No pudimos anular el fichaje.';
      avisoError('No se pudo anular', mensaje);
      setError(mensaje);
    }
    setGuardando(false);
  };

  return (
    <Modal
      opened={abierto}
      onClose={cerrar}
      title="Anular fichaje"
      radius="lg"
      centered
      styles={{ title: { fontWeight: 800 } }}
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink-soft">
          {nombreEmpleado}
          {fichaje
            ? ` · ${fichaje.tipo === 'ingreso' ? 'Entrada' : 'Salida'} a las ${formatearHora(fichaje.timestamp)}`
            : ''}
          . La marca no se borra: queda en la auditoría con tu nombre y el
          motivo.
        </p>
        <CampoTextarea
          etiqueta="Motivo"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          rows={3}
          placeholder="Duplicado, hora incorrecta, persona equivocada…"
        />
        {error && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <Boton variante="secundario" className="flex-1" onClick={cerrar}>
            Cancelar
          </Boton>
          <Boton
            variante="rechazar"
            className="flex-1"
            onClick={() => void guardar()}
            disabled={guardando || !fichaje}
          >
            {guardando ? 'Anulando…' : 'Anular fichaje'}
          </Boton>
        </div>
      </div>
    </Modal>
  );
};
