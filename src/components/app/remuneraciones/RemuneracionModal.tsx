'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@mantine/core';
import { Boton } from '@/components/app/ui/Boton';
import { Campo } from '@/components/app/ui/Campo';
import { CampoMes } from '@/components/app/ui/CampoMes';
import { cargarRemuneracion } from '@/lib/services/rrhh';
import { avisoError, avisoExito } from '@/lib/avisos';
import { calcularLiquidacion, APORTES_TOTAL } from '@/lib/remuneraciones';
import { formatearPesos } from '@/lib/formato';
import { hoyISO } from '@/lib/fechas';
import { Remuneracion } from '@/types/rrhh';

interface RemuneracionModalProps {
  abierto: boolean;
  empleadoId: string;
  /** Para precargar al editar un período existente. */
  inicial?: Remuneracion | null;
  convenioSugerido?: string;
  onCerrar: () => void;
  onGuardado: () => void;
}

const num = (v: string) => Number(v) || 0;

export const RemuneracionModal = ({
  abierto,
  empleadoId,
  inicial,
  convenioSugerido,
  onCerrar,
  onGuardado,
}: RemuneracionModalProps) => {
  const [periodo, setPeriodo] = useState(hoyISO().slice(0, 7));
  const [bruto, setBruto] = useState('');
  const [noRem, setNoRem] = useState('');
  const [otros, setOtros] = useState('');
  const [convenio, setConvenio] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (abierto) {
      setPeriodo(inicial?.periodo ?? hoyISO().slice(0, 7));
      setBruto(inicial ? String(inicial.montoBruto) : '');
      setNoRem(inicial?.noRemunerativo ? String(inicial.noRemunerativo) : '');
      setOtros(inicial?.otrosDescuentos ? String(inicial.otrosDescuentos) : '');
      setConvenio(inicial?.convenio ?? convenioSugerido ?? '');
      setError(null);
    }
  }, [abierto, inicial, convenioSugerido]);

  const { aportes, neto } = calcularLiquidacion({
    montoBruto: num(bruto),
    noRemunerativo: num(noRem),
    otrosDescuentos: num(otros),
  });

  const guardar = async () => {
    if (!periodo) {
      setError('El período es obligatorio.');
      return;
    }
    if (num(bruto) <= 0) {
      setError('El sueldo bruto debe ser mayor a cero.');
      return;
    }
    if (num(noRem) < 0 || num(otros) < 0) {
      setError('Los importes no pueden ser negativos.');
      return;
    }
    setError(null);
    setGuardando(true);
    try {
      await cargarRemuneracion({
        empleadoId,
        periodo,
        montoBruto: num(bruto),
        noRemunerativo: num(noRem) || undefined,
        otrosDescuentos: num(otros) || undefined,
        convenio: convenio.trim() || undefined,
      });
      avisoExito('Remuneración guardada');
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

  const fila = (k: string, v: string, fuerte?: boolean) => (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-ink-soft">{k}</span>
      <span
        className={fuerte ? 'font-bold text-ink' : 'font-semibold text-ink'}
      >
        {v}
      </span>
    </div>
  );

  return (
    <Modal
      opened={abierto}
      onClose={onCerrar}
      title="Cargar remuneración"
      radius="lg"
      centered
      size="lg"
      styles={{ title: { fontWeight: 800 } }}
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-3.5 sm:grid-cols-2">
          <CampoMes etiqueta="Período" value={periodo} onChange={setPeriodo} />
          <Campo
            etiqueta="Convenio (opcional)"
            value={convenio}
            onChange={(e) => setConvenio(e.target.value)}
            placeholder="CCT 130/75 — Comercio"
            ayuda="Queda como referencia del período; no calcula escalas automáticamente."
          />
          <Campo
            etiqueta="Sueldo bruto (remunerativo)"
            type="number"
            value={bruto}
            onChange={(e) => setBruto(e.target.value)}
            placeholder="0"
            ayuda="Base para aportes personales y estimación de cargas."
            error={error?.includes('bruto') ? error : undefined}
          />
          <Campo
            etiqueta="No remunerativo (opcional)"
            type="number"
            value={noRem}
            onChange={(e) => setNoRem(e.target.value)}
            placeholder="0"
            ayuda="Adicionales que no integran la base de aportes."
          />
          <Campo
            etiqueta="Otros descuentos (opcional)"
            type="number"
            value={otros}
            onChange={(e) => setOtros(e.target.value)}
            placeholder="Sindicato, adelantos…"
            ayuda="Descuentos extra además de jubilación, PAMI y obra social."
          />
        </div>

        <div className="rounded-xl bg-paper px-4 py-3">
          {fila('Remunerativo', formatearPesos(num(bruto)))}
          {num(noRem) > 0 &&
            fila('No remunerativo', formatearPesos(num(noRem)))}
          {fila(
            `Aportes del empleado (${Math.round(APORTES_TOTAL * 100)}%)`,
            `− ${formatearPesos(aportes)}`
          )}
          {num(otros) > 0 &&
            fila('Otros descuentos', `− ${formatearPesos(num(otros))}`)}
          <div className="mt-1 border-t border-line pt-2">
            {fila('Neto a cobrar', formatearPesos(neto), true)}
          </div>
        </div>

        <p className="text-xs text-ink-soft">
          Los aportes (jubilación 11% + PAMI 3% + obra social 3%) se calculan
          sobre el remunerativo. Es una estimación; para la liquidación oficial
          confirmá con tu contador.
        </p>

        {error && !error.includes('bruto') && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <Boton variante="secundario" className="flex-1" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton
            className="flex-1"
            onClick={() => void guardar()}
            disabled={guardando || num(bruto) <= 0}
          >
            {guardando ? 'Guardando…' : 'Guardar'}
          </Boton>
        </div>
      </div>
    </Modal>
  );
};
