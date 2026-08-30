'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  IconAlertTriangle,
  IconArrowNarrowRight,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
} from '@tabler/icons-react';
import { CategoriaNovedad, ItemNovedad } from '@/lib/novedades';
import { formatearPesos } from '@/lib/formato';

/** Cuántas novedades se ven antes de tener que desplegar el resto. */
const VISIBLES = 5;

const valorDe = (i: ItemNovedad): string | null => {
  if (i.valor === undefined) return null;
  if (i.unidad === 'pesos') return formatearPesos(i.valor);
  if (i.unidad === 'horas') return `${i.valor} hs`;
  if (i.unidad === 'dias')
    return `${i.valor} ${i.valor === 1 ? 'día' : 'días'}`;
  return String(i.valor);
};

const totalDe = (c: CategoriaNovedad): string | null => {
  if (c.total === undefined || c.total === 0) return null;
  if (c.unidad === 'pesos') return formatearPesos(c.total);
  if (c.unidad === 'horas') return `${c.total} hs`;
  if (c.unidad === 'dias') return `${c.total} días`;
  return String(c.total);
};

/**
 * Una categoría del cierre.
 *
 * El tilde de "revisada" es del trabajo de RRHH, no un permiso: no
 * habilita ni bloquea nada. Sirve para saber por dónde se iba cuando el
 * mes tiene nueve categorías y la revisión se hace en dos ratos.
 */
export const CategoriaCard = ({
  categoria,
  revisada,
  bloqueada,
  onRevisar,
}: {
  categoria: CategoriaNovedad;
  revisada: boolean;
  /** Período cerrado: se puede mirar, no tildar. */
  bloqueada: boolean;
  onRevisar: (revisada: boolean) => void;
}) => {
  const [abierta, setAbierta] = useState(false);
  const [verTodo, setVerTodo] = useState(false);
  const vacia = categoria.items.length === 0;
  const items = verTodo ? categoria.items : categoria.items.slice(0, VISIBLES);
  const total = totalDe(categoria);

  return (
    <div
      className={`rounded-2xl border bg-surface ${
        categoria.requiereAtencion ? 'border-amber-300' : 'border-line'
      }`}
    >
      <div className="flex flex-wrap items-start gap-3 p-4 sm:p-5">
        <button
          type="button"
          onClick={() => setAbierta((v) => !v)}
          disabled={vacia}
          aria-expanded={abierta}
          className={`flex min-w-0 flex-1 items-start gap-2.5 text-left ${
            vacia ? '' : 'cursor-pointer'
          }`}
        >
          <span className="mt-0.5 shrink-0 text-ink-soft">
            {vacia ? (
              <span className="inline-block h-[18px] w-[18px]" />
            ) : abierta ? (
              <IconChevronDown size={18} />
            ) : (
              <IconChevronRight size={18} />
            )}
          </span>
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-[0.9375rem] font-bold text-ink">
                {categoria.etiqueta}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                  vacia
                    ? 'bg-paper text-ink-soft'
                    : categoria.requiereAtencion
                      ? 'bg-amber-100 text-amber-900'
                      : 'bg-brand-100 text-brand-800'
                }`}
              >
                {categoria.items.length}
              </span>
              {total && (
                <span className="text-[0.8125rem] font-semibold text-ink-soft tabular-nums">
                  {total}
                </span>
              )}
              {categoria.requiereAtencion && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-amber-900">
                  <IconAlertTriangle size={12} />
                  Revisar antes de cerrar
                </span>
              )}
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-ink-soft">
              {categoria.descripcion}
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => onRevisar(!revisada)}
          disabled={bloqueada}
          className={`presionable inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-[0.8125rem] font-bold transition-colors disabled:cursor-default disabled:opacity-55 ${
            revisada
              ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
              : 'cursor-pointer border-line bg-surface text-ink-soft hover:border-brand-300 hover:text-brand-700'
          }`}
        >
          <IconCheck size={15} stroke={2.4} />
          {revisada ? 'Revisada' : 'Marcar revisada'}
        </button>
      </div>

      {abierta && !vacia && (
        <div className="border-t border-line px-4 pb-4 pt-3 sm:px-5">
          <ul className="flex list-none flex-col gap-1.5">
            {items.map((i) => (
              <li
                key={i.id}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-xl bg-paper px-3.5 py-2.5"
              >
                <span className="min-w-0">
                  <span className="text-sm font-semibold text-ink">
                    {i.nombre}
                  </span>
                  <span className="ml-2 text-[0.8125rem] text-ink-soft">
                    {i.detalle}
                  </span>
                  {i.nota && (
                    <span className="ml-2 rounded-full bg-surface px-2 py-0.5 text-[0.6875rem] font-semibold text-ink-soft">
                      {i.nota}
                    </span>
                  )}
                </span>
                {valorDe(i) && (
                  <span className="shrink-0 text-sm font-bold text-ink tabular-nums">
                    {valorDe(i)}
                  </span>
                )}
              </li>
            ))}
          </ul>

          {categoria.items.length > VISIBLES && (
            <button
              type="button"
              onClick={() => setVerTodo((v) => !v)}
              className="presionable mt-2 min-h-10 w-full cursor-pointer rounded-xl border border-line bg-surface/60 px-4 text-sm font-bold text-ink-soft hover:bg-surface hover:text-ink"
            >
              {verTodo
                ? 'Ver menos'
                : `Ver las otras ${categoria.items.length - VISIBLES}`}
            </button>
          )}

          <Link
            href={categoria.ruta}
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-brand-700 no-underline underline-offset-4 hover:underline"
          >
            <IconArrowNarrowRight size={17} className="shrink-0" />
            Ir a {categoria.etiqueta.toLowerCase()}
          </Link>
        </div>
      )}
    </div>
  );
};
