'use client';

import { useCallback, useEffect, useState } from 'react';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { Boton } from '@/components/app/ui/Boton';
import { Campo } from '@/components/app/ui/Campo';
import { CampoArchivo } from '@/components/app/ui/CampoArchivo';
import { CampoMes } from '@/components/app/ui/CampoMes';
import { avisoError, avisoExito } from '@/lib/avisos';
import { formatearPesos } from '@/lib/formato';
import { formatearPeriodo, hoyISO } from '@/lib/fechas';
import {
  cargarFacturaMonotributo,
  eliminarFacturaMonotributo,
  getFacturasMonotributo,
} from '@/lib/services/rrhh';
import { FacturaMonotributo } from '@/types/rrhh';

interface Props {
  empleadoId: string;
  puedeEditar: boolean;
}

/**
 * Facturas / cuota de monotributo del colaborador: se registran como
 * costo laboral del período.
 */
export const MonotributoPanel = ({ empleadoId, puedeEditar }: Props) => {
  const [lista, setLista] = useState<FacturaMonotributo[]>([]);
  const [periodo, setPeriodo] = useState(hoyISO().slice(0, 7));
  const [monto, setMonto] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [agregando, setAgregando] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(() => {
    void getFacturasMonotributo(empleadoId).then(setLista);
  }, [empleadoId]);

  useEffect(cargar, [cargar]);

  const guardar = async () => {
    const m = Number(monto);
    if (!periodo || !m || m <= 0) {
      avisoError('Completá período y monto');
      return;
    }
    setGuardando(true);
    try {
      await cargarFacturaMonotributo(
        empleadoId,
        periodo,
        m,
        archivo ?? undefined
      );
      avisoExito('Factura de monotributo cargada');
      setMonto('');
      setArchivo(null);
      setAgregando(false);
      cargar();
    } catch (err) {
      avisoError(
        'No pudimos cargarla',
        err instanceof Error ? err.message : undefined
      );
    }
    setGuardando(false);
  };

  const quitar = async (f: FacturaMonotributo) => {
    if (!window.confirm(`¿Eliminar la factura de ${formatearPeriodo(f.periodo)}?`))
      return;
    try {
      await eliminarFacturaMonotributo(f.id);
      avisoExito('Eliminada');
      cargar();
    } catch (err) {
      avisoError(
        'No pudimos eliminarla',
        err instanceof Error ? err.message : undefined
      );
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-line bg-paper/60 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-ink">Monotributo</p>
          <p className="text-xs text-ink-soft">
            Cuota / factura del período como costo laboral del colaborador.
          </p>
        </div>
        {puedeEditar && !agregando && (
          <Boton
            variante="sutil"
            tamano="sm"
            type="button"
            onClick={() => setAgregando(true)}
          >
            <IconPlus size={14} />
            Cargar
          </Boton>
        )}
      </div>

      {lista.length > 0 && (
        <ul className="mt-3 space-y-2">
          {lista.map((f) => (
            <li
              key={f.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm"
            >
              <span>
                {formatearPeriodo(f.periodo)} ·{' '}
                <strong>{formatearPesos(f.monto)}</strong>
              </span>
              {puedeEditar && (
                <button
                  type="button"
                  onClick={() => void quitar(f)}
                  className="cursor-pointer text-ink-soft hover:text-red-600"
                >
                  <IconTrash size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {agregando && (
        <div className="mt-3 flex flex-col gap-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <CampoMes etiqueta="Período" value={periodo} onChange={setPeriodo} />
            <Campo
              etiqueta="Monto"
              type="number"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder="0"
            />
          </div>
          <CampoArchivo
            etiqueta="Factura PDF (opcional)"
            accept=".pdf,image/*"
            onArchivo={setArchivo}
          />
          <div className="flex gap-2">
            <Boton tamano="sm" onClick={() => void guardar()} disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </Boton>
            <Boton
              variante="secundario"
              tamano="sm"
              onClick={() => setAgregando(false)}
            >
              Cancelar
            </Boton>
          </div>
        </div>
      )}

      {lista.length === 0 && !agregando && (
        <p className="mt-3 text-xs text-ink-soft">Sin facturas cargadas.</p>
      )}
    </div>
  );
};
