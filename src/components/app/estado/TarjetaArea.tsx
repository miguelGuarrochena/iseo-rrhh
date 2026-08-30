'use client';

import { IconAlertTriangle, IconCircleCheck } from '@tabler/icons-react';
import { AreaEstado } from '@/lib/estadoRrhh';

/**
 * Una fila del Estado de RRHH.
 *
 * El color dice qué mirar antes: rojo es "alguien no puede trabajar",
 * ámbar es "hay algo pendiente", verde es "no falta nada". El porcentaje
 * está para comparar áreas entre sí, no para poner una nota: lo que se
 * acciona es el conteo de abajo, y por eso es un botón.
 */
const tono = (area: AreaEstado) => {
  if (area.bloquea) {
    return {
      barra: 'bg-red-500',
      pista: 'bg-red-100',
      texto: 'text-red-700',
      punto: 'bg-red-500',
    };
  }
  if (area.pendientes > 0) {
    return {
      barra: 'bg-amber-500',
      pista: 'bg-amber-100',
      texto: 'text-amber-700',
      punto: 'bg-amber-500',
    };
  }
  return {
    barra: 'bg-emerald-500',
    pista: 'bg-emerald-100',
    texto: 'text-emerald-700',
    punto: 'bg-emerald-500',
  };
};

export const TarjetaArea = ({
  area,
  onVerDetalle,
}: {
  area: AreaEstado;
  onVerDetalle?: () => void;
}) => {
  const c = tono(area);
  const pct = area.cumplimientoPct;

  return (
    <div className="flex h-full min-w-0 flex-col rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-bold text-ink">
            <span
              aria-hidden
              className={`h-2.5 w-2.5 shrink-0 rounded-full ${c.punto}`}
            />
            <span className="min-w-0 break-words">{area.etiqueta}</span>
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            {area.descripcion}
          </p>
        </div>
        {pct !== undefined && (
          <p
            className={`shrink-0 text-xl font-bold tabular-nums leading-none ${c.texto}`}
          >
            {pct}%
          </p>
        )}
      </div>

      {pct !== undefined && (
        <div
          className={`mt-4 h-2 w-full overflow-hidden rounded-full ${c.pista}`}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${area.etiqueta}: ${pct}% de los legajos sin pendientes`}
        >
          <div
            className={`h-full rounded-full ${c.barra}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-3.5">
        {area.pendientes === 0 ? (
          <p className="flex items-center gap-1.5 text-[0.8125rem] font-semibold text-emerald-700">
            <IconCircleCheck size={16} stroke={2.2} />
            Sin pendientes
          </p>
        ) : (
          <>
            <p className="flex items-center gap-1.5 text-[0.8125rem] font-semibold text-ink">
              {area.bloquea && (
                <IconAlertTriangle
                  size={16}
                  stroke={2.2}
                  className="text-red-600"
                />
              )}
              {area.pendientes}{' '}
              {area.pendientes === 1 ? 'pendiente' : 'pendientes'}
              {area.conPendientes > 0 && area.evaluados > 0 && (
                <span className="font-normal text-ink-soft">
                  {' '}
                  · {area.conPendientes} de {area.evaluados}{' '}
                  {area.conPendientes === 1 ? 'persona' : 'personas'}
                </span>
              )}
            </p>
            {onVerDetalle && (
              <button
                type="button"
                onClick={onVerDetalle}
                className="cursor-pointer rounded-lg text-[0.8125rem] font-bold text-brand-700 underline-offset-4 hover:underline"
              >
                Ver detalle
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};
