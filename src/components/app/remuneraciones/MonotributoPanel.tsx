'use client';

import { useState } from 'react';
import { IconPaperclip, IconPlus, IconTrash } from '@tabler/icons-react';
import { Boton } from '@/components/app/ui/Boton';
import { Campo } from '@/components/app/ui/Campo';
import { CampoArchivo } from '@/components/app/ui/CampoArchivo';
import { CampoMes } from '@/components/app/ui/CampoMes';
import { useConfirmacion } from '@/components/app/ui/useConfirmacion';
import { avisoError, avisoExito } from '@/lib/avisos';
import { formatearPesos } from '@/lib/formato';
import { formatearPeriodo, hoyISO } from '@/lib/fechas';
import {
  abrirFacturaMonotributo,
  cargarFacturaMonotributo,
  eliminarFacturaMonotributo,
  getFacturasMonotributo,
} from '@/lib/services/rrhh';
import { abrirArchivo } from '@/lib/archivosUi';
import { FacturaMonotributo } from '@/types/rrhh';
import { BloqueError } from '@/components/app/EstadoCarga';
import { useCarga } from '@/lib/useCarga';

interface Props {
  empleadoId: string;
  puedeEditar: boolean;
}

/**
 * Facturas / cuota de monotributo del colaborador: se registran como
 * costo laboral del período.
 */
export const MonotributoPanel = ({ empleadoId, puedeEditar }: Props) => {
  const [periodo, setPeriodo] = useState(hoyISO().slice(0, 7));
  const [monto, setMonto] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [aCargoEmpresa, setACargoEmpresa] = useState(false);
  const [agregando, setAgregando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const { confirmar, dialogo: dialogoConfirmar } = useConfirmacion();

  const carga = useCarga(
    () => getFacturasMonotributo(empleadoId),
    [empleadoId],
    {
      contexto: 'ficha/monotributo',
      inicial: [] as FacturaMonotributo[],
    }
  );
  const lista = carga.datos;
  const cargar = carga.recargar;

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
        archivo ?? undefined,
        aCargoEmpresa
      );
      avisoExito('Factura de monotributo cargada');
      setMonto('');
      setArchivo(null);
      setACargoEmpresa(false);
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
    const ok = await confirmar({
      titulo: 'Eliminar factura',
      detalle: `Vas a eliminar la factura de ${formatearPeriodo(f.periodo)}.`,
      confirmar: 'Eliminar',
      peligrosa: true,
    });
    if (!ok) return;
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
              <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
                <span>
                  {formatearPeriodo(f.periodo)} ·{' '}
                  <strong>{formatearPesos(f.monto)}</strong>
                </span>
                {f.aCargoEmpresa && (
                  <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-brand-700">
                    La paga la empresa
                  </span>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {/* La factura se podía adjuntar pero no había forma de
                    volver a verla: quedaba guardada y sin salida. */}
                {f.archivoUrl && (
                  <button
                    type="button"
                    onClick={() =>
                      void abrirArchivo(() => abrirFacturaMonotributo(f), {
                        titulo: 'No pudimos abrir la factura',
                      })
                    }
                    aria-label={`Ver la factura de ${formatearPeriodo(f.periodo)}`}
                    className="cursor-pointer border-0 bg-transparent p-0 text-ink-soft transition-colors hover:text-brand-700"
                  >
                    <IconPaperclip size={14} />
                  </button>
                )}
                {puedeEditar && (
                  <button
                    type="button"
                    onClick={() => void quitar(f)}
                    aria-label={`Eliminar la factura de ${formatearPeriodo(f.periodo)}`}
                    className="cursor-pointer border-0 bg-transparent p-0 text-ink-soft transition-colors hover:text-red-600"
                  >
                    <IconTrash size={14} />
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {agregando && (
        <div className="mt-3 flex flex-col gap-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <CampoMes
              etiqueta="Período"
              value={periodo}
              onChange={setPeriodo}
            />
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
          {/* El ejemplo del pedido: "Pablo sueldo $100, la empresa paga
              monotributo $23". Si la paga la empresa, es costo laboral
              del mes; si la paga el colaborador, es solo un registro. */}
          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg bg-surface px-3 py-2.5">
            <input
              type="checkbox"
              checked={aCargoEmpresa}
              onChange={(e) => setACargoEmpresa(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-brand-600"
            />
            <span>
              <span className="text-xs font-semibold text-ink">
                La paga la empresa
              </span>
              <span className="mt-0.5 block text-[0.7rem] leading-relaxed text-ink-soft">
                Suma al costo laboral del período, además del sueldo.
              </span>
            </span>
          </label>
          <div className="flex gap-2">
            <Boton
              tamano="sm"
              onClick={() => void guardar()}
              disabled={guardando}
            >
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

      {carga.fase === 'error' && carga.error && (
        <BloqueError error={carga.error} onReintentar={carga.recargar} />
      )}

      {carga.fase === 'ok' && lista.length === 0 && !agregando && (
        <p className="mt-3 text-xs text-ink-soft">Sin facturas cargadas.</p>
      )}

      {dialogoConfirmar}
    </div>
  );
};
