'use client';

import { InputHTMLAttributes, useState } from 'react';
import { IconEye, IconEyeOff } from '@tabler/icons-react';

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Sin etiqueta el campo va pelado, como en el login. */
  etiqueta?: string;
  error?: string;
  ayuda?: string;
}

/**
 * Input de contraseña con el "ojito" para mostrarla u ocultarla.
 *
 * Acepta etiqueta, error y ayuda como el resto de los campos: era el
 * único que no los tenía, y en un formulario con tres contraseñas
 * seguidas (cambiar la propia) sin marca por campo no se sabe cuál falló.
 */
export const CampoPassword = ({
  etiqueta,
  error,
  ayuda,
  className,
  ...props
}: Props) => {
  const [visible, setVisible] = useState(false);

  const campo = (
    <div className="relative">
      <input
        {...props}
        type={visible ? 'text' : 'password'}
        aria-invalid={Boolean(error)}
        className={`w-full rounded-xl border bg-surface px-4 py-3 pr-12 text-base text-ink outline-none transition-colors placeholder:text-ink-soft/50 ${
          error
            ? 'border-red-300 focus:border-red-500 focus:shadow-[0_0_0_3px_rgba(239,68,68,0.18)]'
            : 'border-line-strong focus:border-brand-500 focus:shadow-[0_0_0_3px_rgba(74,122,245,0.18)]'
        } ${className ?? ''}`}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        onClick={() => setVisible((v) => !v)}
        className="absolute right-2.5 top-1/2 flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-ink-soft transition-colors hover:text-ink"
      >
        {visible ? (
          <IconEyeOff size={18} stroke={1.8} />
        ) : (
          <IconEye size={18} stroke={1.8} />
        )}
      </button>
    </div>
  );

  // Sin etiqueta ni mensajes se devuelve el input solo, para no cambiar
  // el layout de las pantallas que ya lo usaban así.
  if (!etiqueta && !error && !ayuda) return campo;

  return (
    <label
      className="flex flex-col gap-1.5"
      {...(error ? { 'data-error-campo': '' } : {})}
    >
      {etiqueta && (
        <span className="text-sm font-semibold text-ink">{etiqueta}</span>
      )}
      {campo}
      {error && (
        <span className="text-xs font-medium text-red-600">{error}</span>
      )}
      {!error && ayuda && (
        <span className="text-xs text-ink-soft">{ayuda}</span>
      )}
    </label>
  );
};
