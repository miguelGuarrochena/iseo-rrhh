'use client';

import { formatearPesos } from '@/lib/formato';

interface Punto {
  label: string;
  ingreso: number;
  gasto: number;
}

/** Barras comparadas ingreso vs gasto por mes, liviano (sin librerías). */
export const BarrasIngresoGasto = ({ datos }: { datos: Punto[] }) => {
  const max = Math.max(1, ...datos.flatMap((d) => [d.ingreso, d.gasto]));
  const hay = datos.some((d) => d.ingreso > 0 || d.gasto > 0);

  if (!hay) {
    return (
      <p className="py-8 text-center text-sm text-ink-soft">
        Todavía no hay movimientos para graficar.
      </p>
    );
  }

  const barra = (valor: number, color: string) => (
    <div
      className={`w-1/2 max-w-[22px] rounded-t-md ${color} transition-all`}
      style={{
        height: `${(valor / max) * 100}%`,
        minHeight: valor > 0 ? 3 : 0,
      }}
      title={formatearPesos(valor)}
    />
  );

  return (
    <div>
      <div
        className="flex items-end justify-between gap-2 pt-2"
        style={{ height: 160 }}
      >
        {datos.map((d) => (
          <div
            key={d.label}
            className="flex flex-1 flex-col items-center justify-end gap-1.5"
          >
            <div className="flex h-full w-full items-end justify-center gap-1">
              {barra(d.ingreso, 'bg-emerald-500')}
              {barra(d.gasto, 'bg-slate-400')}
            </div>
            <span className="text-[0.65rem] font-medium text-ink-soft">
              {d.label}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-center gap-4 text-xs text-ink-soft">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Ingresos
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-slate-400" /> Gastos
        </span>
      </div>
    </div>
  );
};
