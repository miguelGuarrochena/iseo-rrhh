'use client';

import { useEffect, useState } from 'react';
import { IconClock } from '@tabler/icons-react';

/**
 * Campo de hora propio, en reemplazo de `<input type="time">`.
 *
 * El nativo se ve distinto en cada sistema operativo, en mobile abre la
 * rueda del teléfono y no se puede estilar. Acá se tipea con números
 * (`8`, `830`, `8:30`) o se elige de la lista, que va de media hora en
 * media hora porque es la granularidad real de un horario de trabajo.
 *
 * Value y onChange usan "HH:MM" de 24 horas, igual que el nativo, así el
 * reemplazo no toca nada de lo que ya estaba guardado.
 */
const pad = (n: number) => String(n).padStart(2, '0');

/** "8", "830", "8:30", "8.30" → "08:30". Null si no es una hora real. */
export const parsearHora = (texto: string): string | null => {
  const limpio = texto.trim();
  if (!limpio) return null;

  const conSeparador = limpio.match(/^(\d{1,2})[:.\s](\d{1,2})$/);
  const pegado = limpio.match(/^(\d{1,2})(\d{2})$/);
  const soloHora = limpio.match(/^(\d{1,2})$/);

  let h: number;
  let m: number;
  if (conSeparador) {
    h = Number(conSeparador[1]);
    m = Number(conSeparador[2]);
  } else if (pegado) {
    h = Number(pegado[1]);
    m = Number(pegado[2]);
  } else if (soloHora) {
    h = Number(soloHora[1]);
    m = 0;
  } else {
    return null;
  }

  if (h > 23 || m > 59) return null;
  return `${pad(h)}:${pad(m)}`;
};

/** Cada media hora del día: 00:00, 00:30, 01:00… */
const HORAS = Array.from(
  { length: 48 },
  (_, i) => `${pad(Math.floor(i / 2))}:${i % 2 === 0 ? '00' : '30'}`
);

interface CampoHoraProps {
  /** Sin etiqueta se renderiza compacto, para usarlo en línea. */
  etiqueta?: string;
  value: string;
  onChange: (valor: string) => void;
  error?: string;
  ayuda?: string;
}

export const CampoHora = ({
  etiqueta,
  value,
  onChange,
  error,
  ayuda,
}: CampoHoraProps) => {
  const compacto = !etiqueta;
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState(value);

  // El texto sigue al valor cuando cambia desde afuera (o desde la lista).
  useEffect(() => setTexto(value), [value]);

  const alSalir = () => {
    const parseada = parsearHora(texto);
    if (parseada) {
      onChange(parseada);
      setTexto(parseada);
    } else {
      // Lo que quedó a medias se descarta: mejor volver al último valor
      // bueno que guardar una hora inventada.
      setTexto(value);
    }
    // Se cierra con un respiro para no comerse el click en una opción.
    setTimeout(() => setAbierto(false), 120);
  };

  const borde = error ? 'border-red-300' : 'border-line';

  return (
    <div
      className={`flex flex-col gap-1.5 ${compacto ? 'w-28' : ''}`}
      {...(error ? { 'data-error-campo': '' } : {})}
    >
      {etiqueta && (
        <span className="text-sm font-semibold text-ink">{etiqueta}</span>
      )}
      <div className="relative">
        <div
          className={`flex w-full items-center rounded-xl border bg-surface transition-colors focus-within:border-brand-600 ${
            compacto ? 'gap-1 px-2.5 py-1.5' : 'gap-2 px-4 py-3'
          } ${borde} ${abierto ? 'border-brand-600' : ''}`}
        >
          <input
            type="text"
            inputMode="numeric"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onFocus={() => setAbierto(true)}
            onBlur={alSalir}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                (e.target as HTMLInputElement).blur();
              }
              if (e.key === 'Escape') setAbierto(false);
            }}
            placeholder="hh:mm"
            aria-label={etiqueta}
            className={`w-full min-w-0 bg-transparent text-ink outline-none placeholder:text-ink-soft/60 ${
              compacto ? 'text-sm' : 'text-base'
            }`}
          />
          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            aria-label="Elegir hora"
            aria-expanded={abierto}
            className="shrink-0 cursor-pointer text-ink-soft transition-colors hover:text-brand-700"
          >
            <IconClock size={compacto ? 15 : 18} stroke={1.8} />
          </button>
        </div>

        {abierto && (
          <div className="absolute inset-x-0 top-full z-50 mt-1.5 max-h-56 overflow-y-auto rounded-xl border border-line bg-surface py-1.5">
            {HORAS.map((h) => (
              <button
                key={h}
                type="button"
                // onMouseDown: el blur del input dispara antes que el
                // click y cerraría la lista sin registrar la elección.
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(h);
                  setTexto(h);
                  setAbierto(false);
                }}
                className={`block w-full cursor-pointer border-0 px-4 py-2 text-left text-sm transition-colors ${
                  h === value
                    ? 'bg-brand-100 font-bold text-brand-800'
                    : 'bg-transparent text-ink hover:bg-paper'
                }`}
              >
                {h}
              </button>
            ))}
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
