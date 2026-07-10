'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@mantine/core';
import { Boton } from '@/components/app/ui/Boton';
import { Campo } from '@/components/app/ui/Campo';
import { actualizarAbonoEmpresa } from '@/lib/services/rrhh';
import { avisoError, avisoExito } from '@/lib/avisos';
import { FacturacionEmpresa } from '@/types/rrhh';

interface AbonoModalProps {
  empresa: FacturacionEmpresa | null;
  onCerrar: () => void;
  onGuardado: () => void;
}

/** Editar el abono mensual que una empresa le paga a ISEO. */
export const AbonoModal = ({
  empresa,
  onCerrar,
  onGuardado,
}: AbonoModalProps) => {
  const [monto, setMonto] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (empresa) {
      setMonto(String(empresa.abonoMensual || ''));
      setError(null);
    }
  }, [empresa]);

  const guardar = async () => {
    if (!empresa) return;
    const valor = Number(monto);
    if (!Number.isFinite(valor) || valor < 0) {
      setError('El abono no puede ser negativo.');
      return;
    }
    setError(null);
    setGuardando(true);
    try {
      await actualizarAbonoEmpresa(empresa.empresaId, valor || 0);
      avisoExito('Abono actualizado');
      onGuardado();
      onCerrar();
    } catch (err) {
      avisoError(
        'No pudimos guardar',
        err instanceof Error ? err.message : undefined
      );
    }
    setGuardando(false);
  };

  return (
    <Modal
      opened={Boolean(empresa)}
      onClose={onCerrar}
      title="Abono mensual"
      radius="lg"
      centered
      styles={{ title: { fontWeight: 800 } }}
    >
      {empresa && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ink-soft">
            Cuánto paga <strong className="text-ink">{empresa.nombre}</strong>{' '}
            por mes.
          </p>
          <Campo
            etiqueta="Monto mensual"
            type="number"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            placeholder="0"
            error={error ?? undefined}
          />
          <div className="flex gap-2">
            <Boton variante="secundario" className="flex-1" onClick={onCerrar}>
              Cancelar
            </Boton>
            <Boton
              className="flex-1"
              onClick={() => void guardar()}
              disabled={guardando}
            >
              {guardando ? 'Guardando…' : 'Guardar'}
            </Boton>
          </div>
        </div>
      )}
    </Modal>
  );
};
