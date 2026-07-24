'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
 * En mobile abre como overlay (sin scroll dentro del modal).
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
  const [montado, setMontado] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);

  const hoy = new Date();
  const base = value ? value.split('-').map(Number) : null;
  const [anio, setAnio] = useState(base ? base[0] : hoy.getFullYear());
  const mesSel = base ? base[1] - 1 : null;
  const anioSel = base ? base[0] : null;

  useEffect(() => {
    setMontado(true);
  }, []);

  useEffect(() => {
    if (abierto && value) setAnio(Number(value.split('-')[0]));
  }, [abierto, value]);

  useEffect(() => {
    if (!abierto) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false);
    document.addEventListener('keydown', esc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', esc);
      document.body.style.overflow = prev;
    };
  }, [abierto]);

  const texto = value
    ? `${MESES[Number(value.split('-')[1]) - 1]} ${value.split('-')[0]}`
    : placeholder;

  const borde = error ? 'border-red-300' : 'border-line';

  const panel = (
    <div
      role="dialog"
      aria-label="Elegir período"
      className="w-full max-w-sm rounded-t-2xl border border-line bg-surface p-4 shadow-lift sm:rounded-2xl"
    >
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setAnio((a) => a - 1)}
          aria-label="Año anterior"
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-line bg-surface text-ink-soft transition-colors hover:border-brand-300 hover:text-brand-700"
        >
          <IconChevronLeft size={16} />
        </button>
        <span className="text-sm font-bold text-ink">{anio}</span>
        <button
          type="button"
          onClick={() => setAnio((a) => a + 1)}
          aria-label="Año siguiente"
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-line bg-surface text-ink-soft transition-colors hover:border-brand-300 hover:text-brand-700"
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
  );

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold text-ink">{etiqueta}</span>
      <div ref={contenedor} className="relative">
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
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
      </div>

      {montado &&
        abierto &&
        createPortal(
          <div className="fixed inset-0 z-[1000] flex items-end justify-center sm:items-center sm:p-4">
            <button
              type="button"
              aria-label="Cerrar selector de período"
              className="absolute inset-0 cursor-pointer bg-ink/40"
              onClick={() => setAbierto(false)}
            />
            <div className="relative z-10 w-full sm:w-auto">{panel}</div>
          </div>,
          document.body
        )}

      {error && (
        <span className="text-xs font-medium text-red-600">{error}</span>
      )}
      {!error && ayuda && (
        <span className="text-xs text-ink-soft">{ayuda}</span>
      )}
    </div>
  );
};
