'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
const DIAS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (anio: number, mes: number, dia: number) =>
  `${anio}-${pad(mes + 1)}-${pad(dia)}`;

/** "2026-07-02" → "2 de julio de 2026" */
const formatearLargo = (valor: string): string => {
  const [a, m, d] = valor.split('-').map(Number);
  return `${d} de ${MESES[m - 1].toLowerCase()} de ${a}`;
};

interface CampoFechaProps {
  etiqueta: string;
  value: string;
  onChange: (valor: string) => void;
  error?: string;
  ayuda?: string;
  /** ISO mínimo/máximo seleccionable (YYYY-MM-DD) */
  min?: string;
  max?: string;
  placeholder?: string;
}

/**
 * Selector de fecha propio (calendario en español), con el estilo de la
 * app. Reemplaza el input date nativo para no depender del idioma del
 * navegador. Value y onChange usan ISO "YYYY-MM-DD".
 */
export const CampoFecha = ({
  etiqueta,
  value,
  onChange,
  error,
  ayuda,
  min,
  max,
  placeholder = 'Elegí una fecha',
}: CampoFechaProps) => {
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);

  const hoy = new Date();
  const base = value ? value.split('-').map(Number) : null;
  const [anio, setAnio] = useState(base ? base[0] : hoy.getFullYear());
  const [mes, setMes] = useState(base ? base[1] - 1 : hoy.getMonth());

  // Al abrir, ubicarse en el mes de la fecha elegida.
  useEffect(() => {
    if (abierto && value) {
      const [a, m] = value.split('-').map(Number);
      setAnio(a);
      setMes(m - 1);
    }
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

  const { diasEnMes, offset } = useMemo(() => {
    const primerDia = new Date(anio, mes, 1);
    return {
      diasEnMes: new Date(anio, mes + 1, 0).getDate(),
      offset: (primerDia.getDay() + 6) % 7, // Lunes = 0
    };
  }, [anio, mes]);

  const mover = (delta: number) => {
    const d = new Date(anio, mes + delta, 1);
    setAnio(d.getFullYear());
    setMes(d.getMonth());
  };

  const fueraDeRango = (fecha: string) =>
    (min && fecha < min) || (max && fecha > max);

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
          <span className="truncate">
            {value ? formatearLargo(value) : placeholder}
          </span>
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
                onClick={() => mover(-1)}
                aria-label="Mes anterior"
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-line bg-surface text-ink-soft transition-colors hover:border-brand-300 hover:text-brand-700"
              >
                <IconChevronLeft size={16} />
              </button>
              <span className="text-sm font-bold text-ink">
                {MESES[mes]} {anio}
              </span>
              <button
                type="button"
                onClick={() => mover(1)}
                aria-label="Mes siguiente"
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-line bg-surface text-ink-soft transition-colors hover:border-brand-300 hover:text-brand-700"
              >
                <IconChevronRight size={16} />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center">
              {DIAS.map((d, i) => (
                <span
                  key={`${d}-${i}`}
                  className="text-[0.65rem] font-bold uppercase text-ink-soft"
                >
                  {d}
                </span>
              ))}
              {Array.from({ length: offset }).map((_, i) => (
                <span key={`v-${i}`} />
              ))}
              {Array.from({ length: diasEnMes }).map((_, i) => {
                const dia = i + 1;
                const fecha = iso(anio, mes, dia);
                const activa = value === fecha;
                const deshabilitada = fueraDeRango(fecha);
                return (
                  <button
                    key={fecha}
                    type="button"
                    disabled={Boolean(deshabilitada)}
                    onClick={() => {
                      onChange(fecha);
                      setAbierto(false);
                    }}
                    className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full border text-sm font-medium transition-colors ${
                      activa
                        ? 'border-brand-300 bg-brand-100 font-bold text-brand-800'
                        : deshabilitada
                          ? 'cursor-default border-transparent text-ink-soft/30'
                          : 'cursor-pointer border-transparent text-ink hover:bg-paper'
                    }`}
                  >
                    {dia}
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
