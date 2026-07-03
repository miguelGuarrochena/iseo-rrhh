'use client';

import Link from 'next/link';

/**
 * Gráficos livianos propios (sin librerías): barras horizontales y dona.
 * Colores en la paleta de la marca.
 */

export interface DatoGrafico {
  etiqueta: string;
  valor: number;
  color?: string;
  /** Si está, la fila del gráfico navega (ej. a la ficha del colaborador) */
  href?: string;
}

const PALETA = ['#4a7af5', '#8facff', '#e59061', '#34d399', '#f59e0b'];

const colorDe = (d: DatoGrafico, i: number) =>
  d.color ?? PALETA[i % PALETA.length];

interface BarrasProps {
  datos: DatoGrafico[];
  /** sufijo del valor, ej " min", " hs" */
  sufijo?: string;
}

/** Barras horizontales con etiqueta y valor. */
export const Barras = ({ datos, sufijo = '' }: BarrasProps) => {
  const max = Math.max(...datos.map((d) => d.valor), 1);
  return (
    <div className="flex flex-col gap-3">
      {datos.map((d, i) => {
        const fila = (
          <div
            className={
              d.href
                ? 'cursor-pointer rounded-lg transition-colors hover:bg-brand-50/50'
                : undefined
            }
          >
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span
                className={`truncate text-sm font-medium ${d.href ? 'text-brand-700' : 'text-ink'}`}
              >
                {d.etiqueta}
              </span>
              <span className="shrink-0 text-sm font-bold text-ink">
                {d.valor}
                {sufijo}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-paper">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.max((d.valor / max) * 100, 2)}%`,
                  backgroundColor: colorDe(d, i),
                }}
              />
            </div>
          </div>
        );
        return d.href ? (
          <Link key={d.etiqueta} href={d.href} className="no-underline">
            {fila}
          </Link>
        ) : (
          <div key={d.etiqueta}>{fila}</div>
        );
      })}
      {datos.length === 0 && (
        <p className="text-sm text-ink-soft">Sin datos para graficar.</p>
      )}
    </div>
  );
};

interface DonaProps {
  datos: DatoGrafico[];
  /** texto central, ej el total */
  centro?: string;
  centroDetalle?: string;
}

/** Dona SVG con leyenda. */
export const Dona = ({ datos, centro, centroDetalle }: DonaProps) => {
  const total = datos.reduce((acc, d) => acc + d.valor, 0);
  const R = 42;
  const CIRC = 2 * Math.PI * R;
  let acumulado = 0;

  return (
    <div className="flex flex-wrap items-center gap-8">
      <div className="relative h-40 w-40 shrink-0">
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
          <circle
            cx="60"
            cy="60"
            r={R}
            fill="none"
            strokeWidth="13"
            className="stroke-paper"
          />
          {total > 0 &&
            datos.map((d, i) => {
              const frac = d.valor / total;
              const dash = frac * CIRC;
              const offset = -acumulado * CIRC;
              acumulado += frac;
              return (
                <circle
                  key={d.etiqueta}
                  cx="60"
                  cy="60"
                  r={R}
                  fill="none"
                  strokeWidth="13"
                  strokeLinecap="butt"
                  stroke={colorDe(d, i)}
                  strokeDasharray={`${dash} ${CIRC - dash}`}
                  strokeDashoffset={offset}
                />
              );
            })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          {centro && (
            <span className="text-2xl font-bold leading-none text-ink">
              {centro}
            </span>
          )}
          {centroDetalle && (
            <span className="mt-1 max-w-[5.5rem] text-[0.65rem] leading-tight text-ink-soft">
              {centroDetalle}
            </span>
          )}
        </div>
      </div>
      <div className="flex min-w-[10rem] flex-1 flex-col gap-2">
        {datos.map((d, i) => {
          const pct = total > 0 ? Math.round((d.valor / total) * 100) : 0;
          return (
            <div key={d.etiqueta} className="flex items-center gap-2.5 text-sm">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: colorDe(d, i) }}
              />
              <span className="truncate text-ink">{d.etiqueta}</span>
              <span className="ml-auto shrink-0 text-xs text-ink-soft">
                {pct}%
              </span>
              <span className="w-6 shrink-0 text-right font-bold text-ink">
                {d.valor}
              </span>
            </div>
          );
        })}
        {datos.length === 0 && (
          <p className="text-sm text-ink-soft">Sin datos para graficar.</p>
        )}
      </div>
    </div>
  );
};
