'use client';

import { useState } from 'react';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { hoyISO } from '@/lib/fechas';

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

interface MiniCalendarioProps {
  /** fechas (YYYY-MM-DD) que tienen eventos */
  fechasConEventos: Set<string>;
  seleccionada: string | null;
  onSeleccionar: (fecha: string | null) => void;
}

const iso = (anio: number, mes: number, dia: number) =>
  `${anio}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;

/**
 * Calendario mensual compacto: muestra un punto en los días con
 * eventos y permite filtrar la lista al tocar un día.
 */
export const MiniCalendario = ({
  fechasConEventos,
  seleccionada,
  onSeleccionar,
}: MiniCalendarioProps) => {
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth());

  const primerDia = new Date(anio, mes, 1);
  const diasEnMes = new Date(anio, mes + 1, 0).getDate();
  // Lunes = 0
  const offset = (primerDia.getDay() + 6) % 7;

  const mover = (delta: number) => {
    const d = new Date(anio, mes + delta, 1);
    setAnio(d.getFullYear());
    setMes(d.getMonth());
  };

  const hoyStr = hoyISO();

  return (
    <div className="w-full max-w-xs">
      <div className="mb-3 flex items-center justify-between">
        <button
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
          const conEvento = fechasConEventos.has(fecha);
          const esHoy = fecha === hoyStr;
          const activa = seleccionada === fecha;
          return (
            <button
              key={fecha}
              onClick={() => onSeleccionar(activa ? null : fecha)}
              className={`relative mx-auto flex h-9 w-9 cursor-pointer flex-col items-center justify-center rounded-full border text-sm font-medium transition-colors ${
                activa
                  ? 'border-brand-300 bg-brand-100 font-bold text-brand-800'
                  : esHoy
                    ? 'border-line bg-paper font-bold text-ink'
                    : 'border-transparent text-ink hover:bg-paper'
              }`}
            >
              {dia}
              {conEvento && (
                <span className="absolute bottom-1 h-1.5 w-1.5 rounded-full bg-brand-500" />
              )}
            </button>
          );
        })}
      </div>

      {seleccionada && (
        <button
          onClick={() => onSeleccionar(null)}
          className="mt-3 w-full cursor-pointer rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink-soft transition-colors hover:border-brand-300 hover:text-brand-700"
        >
          Ver todos los eventos
        </button>
      )}
    </div>
  );
};
