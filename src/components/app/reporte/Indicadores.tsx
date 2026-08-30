'use client';

import { ReactNode } from 'react';
import { IconTrendingDown, IconTrendingUp } from '@tabler/icons-react';
import { Indicador } from '@/lib/reporteMensual';

/**
 * Un indicador del mes con su comparación.
 *
 * Cuando el valor no se pudo calcular no se dibuja un cero: se dice por
 * qué falta. Un cero es una afirmación —"nadie hizo horas extras"— y en
 * estas pantallas la verdad suele ser otra: nadie cargó el dato.
 *
 * La flecha no tiene color de "bueno" o "malo" a propósito: que el
 * ausentismo baje es bueno y que la dotación baje no necesariamente. El
 * verde y el rojo los pone quien lee, con el contexto que tiene.
 */
export const TarjetaIndicador = ({
  etiqueta,
  indicador,
  formato = (n) => String(n),
  detalle,
  faltaPorque,
  /** Lo que sube es peor (ausentismo, extras). Sólo cambia el matiz. */
  subirEsMalo = false,
  comparable = false,
}: {
  etiqueta: string;
  indicador?: Indicador;
  formato?: (n: number) => string;
  detalle?: ReactNode;
  faltaPorque?: string;
  subirEsMalo?: boolean;
  /**
   * Si este indicador se compara contra el mes anterior.
   *
   * Sin esto salía "Altas: 0 — sin mes anterior con qué comparar",
   * pidiendo disculpas por algo que nunca se compara: las altas del mes
   * son un conteo de ese mes, no una serie.
   */
  comparable?: boolean;
}) => {
  const valor = indicador?.valor;
  const variacion = indicador?.variacion;

  return (
    <div className="flex h-full min-w-0 flex-col rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <p className="text-[0.65rem] font-bold uppercase leading-tight tracking-wide text-ink-soft sm:text-xs">
        {etiqueta}
      </p>

      {valor === undefined ? (
        <>
          <p className="mt-3 text-[1.35rem] font-bold leading-none text-ink-soft/50">
            —
          </p>
          <p className="mt-2 text-[0.8125rem] leading-snug text-ink-soft">
            {faltaPorque ?? 'No hay datos suficientes para calcularlo.'}
          </p>
        </>
      ) : (
        <>
          <p className="mt-3 break-words text-[1.35rem] font-bold leading-none tracking-tight text-ink tabular-nums sm:text-2xl xl:text-[1.75rem]">
            {formato(valor)}
          </p>
          <div className="mt-2 flex flex-col gap-1">
            {variacion !== undefined && variacion !== 0 && (
              <p
                className={`flex items-center gap-1 text-[0.8125rem] font-semibold tabular-nums ${
                  variacion > 0 === subirEsMalo
                    ? 'text-amber-700'
                    : 'text-emerald-700'
                }`}
              >
                {variacion > 0 ? (
                  <IconTrendingUp size={15} stroke={2.2} />
                ) : (
                  <IconTrendingDown size={15} stroke={2.2} />
                )}
                {variacion > 0 ? '+' : ''}
                {formato(variacion)}
                {indicador?.variacionPct !== undefined && (
                  <span className="font-normal text-ink-soft">
                    ({indicador.variacionPct > 0 ? '+' : ''}
                    {indicador.variacionPct}%)
                  </span>
                )}
              </p>
            )}
            {variacion === 0 && (
              <p className="text-[0.8125rem] text-ink-soft">
                Igual que el mes anterior
              </p>
            )}
            {comparable &&
              variacion === undefined &&
              indicador?.anterior === undefined && (
                <p className="text-[0.8125rem] text-ink-soft">
                  Sin mes anterior con qué comparar
                </p>
              )}
            {detalle && (
              <p className="text-[0.8125rem] leading-snug text-ink-soft">
                {detalle}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
};
