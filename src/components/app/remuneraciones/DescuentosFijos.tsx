'use client';

import { useCallback, useEffect, useState } from 'react';
import { IconPlus, IconX } from '@tabler/icons-react';
import { Boton } from '@/components/app/ui/Boton';
import { Campo } from '@/components/app/ui/Campo';
import {
  crearDescuentoRecurrente,
  eliminarDescuentoRecurrente,
  getDescuentosRecurrentes,
} from '@/lib/services/rrhh';
import { avisoError, avisoExito } from '@/lib/avisos';
import { formatearPesos } from '@/lib/formato';
import { DescuentoRecurrente } from '@/types/rrhh';

interface Props {
  empleadoId: string;
  puedeEditar: boolean;
}

/**
 * Descuentos fijos del empleado (sindicato, comedor, etc.): quedan
 * cargados una vez y se arrastran como sugerencia en cada período.
 */
export const DescuentosFijos = ({ empleadoId, puedeEditar }: Props) => {
  const [descuentos, setDescuentos] = useState<DescuentoRecurrente[]>([]);
  const [agregando, setAgregando] = useState(false);
  const [concepto, setConcepto] = useState('');
  const [monto, setMonto] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(() => {
    void getDescuentosRecurrentes(empleadoId).then(setDescuentos);
  }, [empleadoId]);

  useEffect(cargar, [cargar]);

  const agregar = async () => {
    const m = Number(monto);
    if (!concepto.trim() || !m || m <= 0) {
      avisoError('Completá concepto y monto', 'El monto debe ser mayor a 0.');
      return;
    }
    setGuardando(true);
    try {
      await crearDescuentoRecurrente(empleadoId, concepto.trim(), m);
      avisoExito('Descuento fijo agregado');
      setConcepto('');
      setMonto('');
      setAgregando(false);
      cargar();
    } catch (err) {
      avisoError(
        'No pudimos agregarlo',
        err instanceof Error ? err.message : undefined
      );
    }
    setGuardando(false);
  };

  const quitar = async (d: DescuentoRecurrente) => {
    try {
      await eliminarDescuentoRecurrente(d.id);
      avisoExito('Descuento fijo eliminado', `${d.concepto} ya no se aplica.`);
      cargar();
    } catch (err) {
      avisoError(
        'No pudimos eliminarlo',
        err instanceof Error ? err.message : undefined
      );
    }
  };

  if (!puedeEditar && descuentos.length === 0) return null;

  return (
    <div
      data-testid="descuentos-fijos"
      className="mt-4 rounded-xl border border-line bg-paper/60 px-4 py-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-ink">Descuentos fijos</p>
          <p className="text-xs text-ink-soft">
            Sindicato, comedor, etc. Quedan guardados y entran solos como
            descuento en cada liquidación.
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
            Agregar
          </Boton>
        )}
      </div>

      {descuentos.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {descuentos.map((d) => (
            <span
              key={d.id}
              className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink"
            >
              {d.concepto} · {formatearPesos(d.monto)}
              {puedeEditar && (
                <button
                  type="button"
                  onClick={() => void quitar(d)}
                  aria-label={`Eliminar ${d.concepto}`}
                  className="cursor-pointer text-ink-soft transition-colors hover:text-red-600"
                >
                  <IconX size={13} />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {agregando && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="min-w-40 flex-1">
            <Campo
              etiqueta="Concepto"
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
              placeholder="Sindicato"
            />
          </div>
          <div className="w-36">
            <Campo
              etiqueta="Monto"
              type="number"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder="0"
            />
          </div>
          <Boton
            tamano="sm"
            type="button"
            onClick={() => void agregar()}
            disabled={guardando}
          >
            {guardando ? 'Guardando…' : 'Guardar'}
          </Boton>
          <Boton
            variante="secundario"
            tamano="sm"
            type="button"
            onClick={() => setAgregando(false)}
          >
            Cancelar
          </Boton>
        </div>
      )}

      {descuentos.length === 0 && !agregando && (
        <p className="mt-3 text-xs text-ink-soft">
          Sin descuentos fijos cargados.
        </p>
      )}
    </div>
  );
};
