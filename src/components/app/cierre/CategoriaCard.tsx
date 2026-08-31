'use client';

import Link from 'next/link';
import {
  IconAlertTriangle,
  IconArrowNarrowRight,
  IconCheck,
  IconChevronDown,
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
 * La línea que resume la categoría sin obligar a abrirla: cuántas
 * novedades y, cuando sumarlas significa algo, cuánto suman.
 *
 * Reemplaza a la descripción larga, que ocupaba dos renglones en cada
 * una de las nueve filas y hacía que la lista se leyera como un texto
 * en vez de como una lista de trabajo. La descripción sigue estando,
 * adentro, para cuando hace falta.
 */
const resumenDe = (c: CategoriaNovedad): string => {
  if (c.items.length === 0) return 'Sin novedades';
  const cuantas = `${c.items.length} ${c.items.length === 1 ? 'novedad' : 'novedades'}`;
  const total = totalDe(c);
  return total ? `${cuantas} · ${total}` : cuantas;
};

/**
 * Una categoría del cierre.
 *
 * El tilde de "revisada" es del trabajo de RRHH, no un permiso: no
 * habilita ni bloquea nada. Sirve para saber por dónde se iba cuando el
 * mes tiene nueve categorías y la revisión se hace en dos ratos. Por eso
 * es lo primero de la fila y tiene forma de casilla: es la acción que se
 * repite nueve veces.
 */
export const CategoriaCard = ({
  categoria,
  revisada,
  bloqueada,
  abierta,
  onAbrir,
  onRevisar,
  verTodo,
  onVerTodo,
}: {
  categoria: CategoriaNovedad;
  revisada: boolean;
  /** Período cerrado: se puede mirar, no tildar. */
  bloqueada: boolean;
  abierta: boolean;
  onAbrir: (abierta: boolean) => void;
  onRevisar: (revisada: boolean) => void;
  verTodo: boolean;
  onVerTodo: (verTodo: boolean) => void;
}) => {
  const vacia = categoria.items.length === 0;
  const items = verTodo ? categoria.items : categoria.items.slice(0, VISIBLES);
  const atencion = categoria.requiereAtencion;

  /*
   * Tres tratamientos y nada más: lo que tiene datos que faltan, lo que
   * ya se revisó y el resto. Cuando cada fila se pintaba igual, la
   * categoría con un problema real quedaba escondida entre ocho vacías.
   */
  const marco = atencion
    ? 'border-amber-300 bg-amber-50/50'
    : revisada
      ? 'border-line bg-paper/50'
      : 'border-line bg-surface';

  return (
    <div className={`rounded-2xl border transition-colors ${marco}`}>
      <div
        className={`flex items-center gap-3 px-3.5 sm:px-4 ${
          vacia ? 'py-2.5' : 'py-3'
        }`}
      >
        <button
          type="button"
          role="checkbox"
          aria-checked={revisada}
          aria-label={
            revisada
              ? `${categoria.etiqueta}: revisada`
              : `Marcar ${categoria.etiqueta} como revisada`
          }
          title={revisada ? 'Revisada' : 'Marcar como revisada'}
          onClick={() => onRevisar(!revisada)}
          disabled={bloqueada}
          className={`presionable flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-colors disabled:cursor-default disabled:opacity-55 ${
            revisada
              ? 'border-emerald-500 bg-emerald-500 text-white'
              : 'cursor-pointer border-line-strong bg-surface text-transparent hover:border-brand-500 hover:text-brand-200'
          }`}
        >
          <IconCheck size={15} stroke={3} />
        </button>

        <button
          type="button"
          onClick={() => onAbrir(!abierta)}
          disabled={vacia}
          aria-expanded={vacia ? undefined : abierta}
          className={`flex min-w-0 flex-1 items-center gap-3 text-left ${
            vacia ? '' : 'cursor-pointer'
          }`}
        >
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span
                className={`text-[0.9375rem] font-bold ${
                  revisada && !atencion ? 'text-ink-soft' : 'text-ink'
                }`}
              >
                {categoria.etiqueta}
              </span>
              {atencion && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-amber-900">
                  <IconAlertTriangle size={12} />
                  Faltan datos
                </span>
              )}
            </span>
            <span
              className={`mt-0.5 block text-[0.8125rem] ${
                vacia ? 'text-ink-soft/70' : 'font-semibold text-ink-soft'
              }`}
            >
              {resumenDe(categoria)}
            </span>
          </span>

          {!vacia && (
            <IconChevronDown
              size={18}
              className={`shrink-0 text-ink-soft transition-transform ${
                abierta ? 'rotate-180' : ''
              }`}
            />
          )}
        </button>
      </div>

      {abierta && !vacia && (
        <div className="border-t border-line px-3.5 pb-3.5 pt-3 sm:px-4">
          <p className="mb-2.5 text-xs leading-relaxed text-ink-soft">
            {categoria.descripcion}
          </p>
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
              onClick={() => onVerTodo(!verTodo)}
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
