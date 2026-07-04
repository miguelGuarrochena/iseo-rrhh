'use client';

import { useEffect, useRef, useState } from 'react';
import {
  IconCalendar,
  IconChevronLeft,
  IconChevronRight,
} from '@tabler/icons-react';

const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];
const MESES_CORTO = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
];

const pad = (n: number) => String(n).padStart(2, '0');

interface CampoMesProps {
  etiqueta: string;
  /** ISO "YYYY-MM" */
  value: string;
  onChange: (valor: string) => void;
  error?: string;
  ayuda?: string;
  placeholder?: string;
}

/**
 * Selector de período (mes + año) propio, en español y con el estilo de la
 * app. Reemplaza el input month nativo. Value y onChange usan "YYYY-MM".
 */
export const CampoMes = ({
  etiqueta,
  value,
  onChange,
  error,
  ayuda,
  placeholder = 'Elegí un período',
}: CampoMesProps) => {
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);

  const hoy = new Date();
  const base = value ? value.split('-').map(Number) : null;
  const [anio, setAnio] = useState(base ? base[0] : hoy.getFullYear());
  const mesSel = base ? base[1] - 1 : null;
  const anioSel = base ? base[0] : null;

  useEffect(() => {
    if (abierto && value) setAnio(Number(value.split('-')[0]));
  }, [abierto, value]);

  useEffect(() => {
    const cerrar = (e: MouseEvent) => {
      if (!contenedor.current?.contains(e.target as Node)) setAbierto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false);
    document.addEventListener('mousedown', cerrar);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', cerrar);
      document.removeEventListener('keydown', esc);
    };
  }, []);

  const texto = value
    ? `${MESES[Number(value.split('-')[1]) - 1]} ${value.split('-')[0]}`
    : placeholder;

  const borde = error ? 'border-red-300' : 'border-line';

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold text-ink">{etiqueta}</span>
      <div ref={contenedor} className="relative">
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          className={`flex w-full items-center justify-between gap-2 rounded-xl border bg-surface px-4 py-3 text-left text-base outline-none transition-colors ${borde} ${
            abierto ? 'border-brand-600' : ''
          } ${value ? 'text-ink' : 'text-ink-soft/60'}`}
        >
          <span className="truncate">{texto}</span>
          <IconCalendar
            size={18}
            className="shrink-0 text-ink-soft"
            stroke={1.8}
          />
        </button>

        {abierto && (
          <div className="absolute z-50 mt-2 w-[19rem] rounded-2xl border border-line bg-surface p-3 shadow-lift">
            <div className="mb-3 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setAnio((a) => a - 1)}
                aria-label="Año anterior"
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-line bg-surface text-ink-soft transition-colors hover:border-brand-300 hover:text-brand-700"
              >
                <IconChevronLeft size={16} />
              </button>
              <span className="text-sm font-bold text-ink">{anio}</span>
              <button
                type="button"
                onClick={() => setAnio((a) => a + 1)}
                aria-label="Año siguiente"
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-line bg-surface text-ink-soft transition-colors hover:border-brand-300 hover:text-brand-700"
              >
                <IconChevronRight size={16} />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {MESES_CORTO.map((m, i) => {
                const activa = mesSel === i && anioSel === anio;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      onChange(`${anio}-${pad(i + 1)}`);
                      setAbierto(false);
                    }}
                    className={`rounded-xl border py-2.5 text-sm font-semibold transition-colors ${
                      activa
                        ? 'border-brand-300 bg-brand-100 text-brand-800'
                        : 'cursor-pointer border-line bg-surface text-ink hover:border-brand-300 hover:text-brand-700'
                    }`}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
      {error && (
        <span className="text-xs font-medium text-red-600">{error}</span>
      )}
      {!error && ayuda && (
        <span className="text-xs text-ink-soft">{ayuda}</span>
      )}
    </div>
  );
};
