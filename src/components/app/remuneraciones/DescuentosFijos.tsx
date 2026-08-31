'use client';

import { useState } from 'react';
import { IconGavel, IconPlus, IconX } from '@tabler/icons-react';
import { Boton } from '@/components/app/ui/Boton';
import { Campo, CampoSelect } from '@/components/app/ui/Campo';
import {
  crearDescuentoRecurrente,
  eliminarDescuentoRecurrente,
  getDescuentosRecurrentes,
} from '@/lib/services/rrhh';
import { avisoError, avisoExito } from '@/lib/avisos';
import { formatearPesos } from '@/lib/formato';
import { DescuentoRecurrente } from '@/types/rrhh';
import { BloqueError } from '@/components/app/EstadoCarga';
import { useCarga } from '@/lib/useCarga';

interface Props {
  empleadoId: string;
  puedeEditar: boolean;
  /** Se llama cuando se agrega o quita un descuento (para recalcular afuera). */
  onCambio?: () => void;
}

/**
 * Descuentos fijos del empleado (sindicato, comedor, etc.): quedan
 * cargados una vez y se arrastran como sugerencia en cada período.
 * Pueden ser monto fijo o porcentaje del bruto.
 */
export const DescuentosFijos = ({
  empleadoId,
  puedeEditar,
  onCambio,
}: Props) => {
  const [agregando, setAgregando] = useState(false);
  const [concepto, setConcepto] = useState('');
  const [monto, setMonto] = useState('');
  const [modo, setModo] = useState<'monto' | 'porcentaje'>('monto');
  const [esEmbargo, setEsEmbargo] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const carga = useCarga(
    () => getDescuentosRecurrentes(empleadoId),
    [empleadoId],
    { contexto: 'ficha/descuentos', inicial: [] as DescuentoRecurrente[] }
  );
  const descuentos = carga.datos;
  const cargar = carga.recargar;

  const textoValor = (d: DescuentoRecurrente) =>
    d.modo === 'porcentaje' ? `${d.porcentaje ?? 0}%` : formatearPesos(d.monto);

  const agregar = async () => {
    const m = Number(monto);
    if (!concepto.trim() || !m || m <= 0) {
      avisoError(
        'Completá concepto y valor',
        modo === 'porcentaje'
          ? 'El porcentaje debe ser mayor a 0.'
          : 'El monto debe ser mayor a 0.'
      );
      return;
    }
    if (modo === 'porcentaje' && m > 100) {
      avisoError('Porcentaje inválido', 'No puede superar el 100%.');
      return;
    }
    setGuardando(true);
    try {
      await crearDescuentoRecurrente(
        empleadoId,
        concepto.trim(),
        modo === 'monto' ? m : 0,
        modo,
        modo === 'porcentaje' ? m : undefined,
        esEmbargo
      );
      avisoExito('Descuento fijo agregado');
      setConcepto('');
      setMonto('');
      setModo('monto');
      setEsEmbargo(false);
      setAgregando(false);
      cargar();
      onCambio?.();
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
      onCambio?.();
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
            Sindicato, comedor, etc. Monto fijo o % del bruto; entran solos en
            cada liquidación.
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
              title={
                d.esEmbargo
                  ? 'Embargo judicial: puede superar el tope del 20% del art. 133 LCT.'
                  : undefined
              }
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                d.esEmbargo
                  ? 'border-amber-300 bg-amber-50 text-amber-900'
                  : 'border-line bg-surface text-ink'
              }`}
            >
              {d.esEmbargo && <IconGavel size={13} />}
              {d.concepto} · {textoValor(d)}
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
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="w-full sm:min-w-40 sm:flex-1">
            <Campo
              etiqueta="Concepto"
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
              placeholder="Sindicato"
            />
          </div>
          <div className="w-full sm:w-36">
            <CampoSelect
              etiqueta="Tipo"
              value={modo}
              onChange={(v) => setModo(v as 'monto' | 'porcentaje')}
              opciones={[
                { valor: 'monto', etiqueta: 'Monto ($)' },
                { valor: 'porcentaje', etiqueta: 'Porcentaje (%)' },
              ]}
            />
          </div>
          <div className="w-full sm:w-28">
            <Campo
              etiqueta={modo === 'porcentaje' ? 'Porcentaje' : 'Monto'}
              type="number"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder="0"
            />
          </div>
          {/* El embargo no cambia ningún cálculo: cambia que el tope del
              20% del art. 133 avise en vez de bloquear, porque el embargo
              judicial tiene su propia escala (decreto 484/87). */}
          <label className="flex w-full cursor-pointer items-start gap-2 sm:w-full">
            <input
              type="checkbox"
              checked={esEmbargo}
              onChange={(e) => setEsEmbargo(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-brand-600"
            />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-ink">
                Es un embargo judicial
              </span>
              <span className="block text-xs leading-relaxed text-ink-soft">
                Los descuentos de esta persona van a poder superar el 20% del
                art. 133 avisando, en vez de frenar la liquidación.
              </span>
            </span>
          </label>
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

      {carga.fase === 'error' && carga.error && (
        <BloqueError error={carga.error} onReintentar={carga.recargar} />
      )}

      {carga.fase === 'ok' && descuentos.length === 0 && !agregando && (
        <p className="mt-3 text-xs text-ink-soft">
          Sin descuentos fijos cargados.
        </p>
      )}
    </div>
  );
};
