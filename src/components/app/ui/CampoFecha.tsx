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

/** "2026-07-02" → "02/07/2026" (lo que se ve y se tipea). */
const aCorta = (valor: string): string => {
  if (!valor) return '';
  const [a, m, d] = valor.split('-');
  return `${d}/${m}/${a}`;
};

/**
 * Parsea una fecha tipeada con números: "2/7/2026", "02/07/2026",
 * "02-07-26", "02.07.2026" → ISO "2026-07-02". Devuelve null si no es
 * una fecha real.
 */
export const parsearFechaTipeada = (texto: string): string | null => {
  const m = texto
    .trim()
    .match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})$/);
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  const anio = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  if (mes < 1 || mes > 12 || dia < 1) return null;
  if (dia > new Date(anio, mes, 0).getDate()) return null;
  return iso(anio, mes - 1, dia);
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
 * Campo de fecha propio: se puede tipear con números (dd/mm/aaaa) o
 * elegir del calendario en español. Value y onChange usan ISO
 * "YYYY-MM-DD".
 */
export const CampoFecha = ({
  etiqueta,
  value,
  onChange,
  error,
  ayuda,
  min,
  max,
  placeholder = 'dd/mm/aaaa',
}: CampoFechaProps) => {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState(aCorta(value));
  const contenedor = useRef<HTMLDivElement>(null);

  const hoy = new Date();
  const base = value ? value.split('-').map(Number) : null;
  const [anio, setAnio] = useState(base ? base[0] : hoy.getFullYear());
  const [mes, setMes] = useState(base ? base[1] - 1 : hoy.getMonth());

  // El texto sigue al value (elección en calendario o cambio externo).
  useEffect(() => {
    setTexto(aCorta(value));
  }, [value]);

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

  /** Al tipear: si lo escrito ya es una fecha válida, se toma. */
  const alTipear = (t: string) => {
    setTexto(t);
    if (t.trim() === '') {
      if (value) onChange('');
      return;
    }
    const parseada = parsearFechaTipeada(t);
    if (parseada && !fueraDeRango(parseada)) onChange(parseada);
  };

  /** Al salir del campo: normaliza o revierte si quedó a medias. */
  const alSalir = () => {
    if (texto.trim() === '') {
      if (value) onChange('');
      setTexto('');
      return;
    }
    const parseada = parsearFechaTipeada(texto);
    if (parseada && !fueraDeRango(parseada)) {
      onChange(parseada);
      setTexto(aCorta(parseada));
    } else {
      setTexto(aCorta(value));
    }
  };

  const borde = error ? 'border-red-300' : 'border-line';

  return (
    <div
      className="flex flex-col gap-1.5"
      {...(error ? { 'data-error-campo': '' } : {})}
    >
      <span className="text-sm font-semibold text-ink">{etiqueta}</span>
      <div ref={contenedor} className="relative">
        <div
          className={`flex w-full items-center gap-2 rounded-xl border bg-surface px-4 py-3 transition-colors focus-within:border-brand-600 ${borde} ${
            abierto ? 'border-brand-600' : ''
          }`}
        >
          <input
            type="text"
            inputMode="numeric"
            value={texto}
            onChange={(e) => alTipear(e.target.value)}
            onBlur={alSalir}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                alSalir();
              }
            }}
            placeholder={placeholder}
            aria-label={etiqueta}
            className="w-full min-w-0 bg-transparent text-base text-ink outline-none placeholder:text-ink-soft/60"
          />
          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            aria-label="Abrir calendario"
            className="shrink-0 cursor-pointer text-ink-soft transition-colors hover:text-brand-700"
          >
            <IconCalendar size={18} stroke={1.8} />
          </button>
        </div>

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
