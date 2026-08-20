'use client';

import { IconBackspace } from '@tabler/icons-react';

/**
 * Teclado numérico para el PIN de la tablet: se toca con el pulgar,
 * sin teclado del sistema tapando la pantalla. Las teclas son de un
 * tamaño fijo, como las de un teléfono: ni pastillas ni cartones.
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
    'flex h-16 w-16 shrink-0 cursor-pointer items-center justify-center rounded-2xl border text-xl font-bold disabled:cursor-default disabled:opacity-40';
  const boton = `${botonBase} border-line bg-surface text-ink`;
  // Si no sabemos el largo (tablet vieja), se muestran 4 y crecen hasta 6.
  const huecos = Math.min(max, Math.max(4, value.length || 4));

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex gap-2.5" aria-hidden>
        {Array.from({ length: huecos }).map((_, i) => (
          <span
            key={i}
            className={`h-3 w-3 rounded-full ${
              i < value.length ? 'bg-brand-600' : 'bg-line'
            }`}
          />
        ))}
      </div>
      {/*
        Teclas de tamaño fijo, como un PIN de teléfono. `grid-cols-3`
        con `1fr` o `w-full` + `aspect-square` o se achica a pastillas
        o se come la pantalla. Las columnas van en `4rem` para que no
        dependan del contenedor.
      */}
      <div className="grid w-max grid-cols-[4rem_4rem_4rem] gap-3">
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
