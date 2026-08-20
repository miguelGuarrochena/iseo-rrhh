'use client';

import { IconBackspace } from '@tabler/icons-react';

/**
 * Teclado numérico grande para el PIN de la tablet: se toca con el
 * pulgar, sin teclado del sistema tapando la pantalla.
 */
export const PinPad = ({
  value,
  onChange,
  onConfirmar,
  disabled,
  max = 6,
}: {
  value: string;
  onChange: (valor: string) => void;
  onConfirmar: () => void;
  disabled?: boolean;
  max?: number;
}) => {
  const tecla = (t: string) => {
    if (disabled) return;
    if (t === 'borrar') {
      onChange(value.slice(0, -1));
      return;
    }
    if (t === 'ok') {
      onConfirmar();
      return;
    }
    if (value.length >= max) return;
    onChange(value + t);
  };

  const botonBase =
    'flex aspect-square w-full cursor-pointer items-center justify-center rounded-2xl border text-2xl font-bold disabled:cursor-default disabled:opacity-40';
  const boton = `${botonBase} border-line bg-surface text-ink`;

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <div className="flex gap-2.5" aria-hidden>
        {Array.from({ length: max }).map((_, i) => (
          <span
            key={i}
            className={`h-3 w-3 rounded-full ${
              i < value.length ? 'bg-brand-600' : 'bg-line'
            }`}
          />
        ))}
      </div>
      {/*
        El ancho tiene que estar en la grilla, no en cada tecla. Con
        `grid-cols-3` Tailwind usa `minmax(0, 1fr)`: si el contenedor
        se achica al contenido (un flex centrado), las columnas caen a
        cero y las teclas quedan como pastillas altas pegadas. Un ancho
        concreto las deja cuadradas, con aire, para el pulgar.
      */}
      <div className="grid w-full max-w-[18rem] grid-cols-3 gap-3">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => (
          <button
            key={n}
            type="button"
            disabled={disabled}
            onClick={() => tecla(n)}
            className={boton}
          >
            {n}
          </button>
        ))}
        <button
          type="button"
          disabled={disabled}
          onClick={() => tecla('borrar')}
          aria-label="Borrar"
          className={boton}
        >
          <IconBackspace size={22} />
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => tecla('0')}
          className={boton}
        >
          0
        </button>
        <button
          type="button"
          disabled={disabled || value.length < 4}
          onClick={() => tecla('ok')}
          className={`${botonBase} border-brand-600 bg-brand-600 text-white`}
        >
          OK
        </button>
      </div>
    </div>
  );
};
