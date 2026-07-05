'use client';

import { formatearPesos } from '@/lib/formato';

interface Punto {
  label: string;
  valor: number;
}

/** Gráfico de barras mensual, liviano (sin librerías). */
export const BarrasMensuales = ({ datos }: { datos: Punto[] }) => {
  const max = Math.max(1, ...datos.map((d) => d.valor));
  const hayDatos = datos.some((d) => d.valor > 0);

  if (!hayDatos) {
    return (
      <p className="py-8 text-center text-sm text-ink-soft">
        Todavía no hay cobros registrados para graficar.
      </p>
    );
  }

  return (
    <div
      className="flex items-end justify-between gap-2 pt-2"
      style={{ height: 160 }}
    >
      {datos.map((d) => (
        <div
          key={d.label}
          className="flex flex-1 flex-col items-center justify-end gap-2"
          title={`${d.label}: ${formatearPesos(d.valor)}`}
        >
          <span className="text-[0.6rem] font-semibold text-ink-soft">
            {d.valor > 0 ? formatearPesos(d.valor) : ''}
          </span>
          <div
            className="w-full max-w-[40px] rounded-t-md bg-brand-500 transition-all"
            style={{
              height: `${(d.valor / max) * 100}%`,
              minHeight: d.valor > 0 ? 4 : 0,
            }}
          />
          <span className="text-[0.65rem] font-medium text-ink-soft">
            {d.label}
          </span>
        </div>
      ))}
    </div>
  );
};
