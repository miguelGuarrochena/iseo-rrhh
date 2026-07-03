'use client';

import { InputHTMLAttributes, useState } from 'react';
import { IconEye, IconEyeOff } from '@tabler/icons-react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

/**
 * Input de contraseña con el "ojito" para mostrarla u ocultarla.
 */
export const CampoPassword = ({ className, ...props }: Props) => {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        {...props}
        type={visible ? 'text' : 'password'}
        className={`w-full rounded-xl border border-line bg-surface px-4 py-3 pr-12 text-base text-ink outline-none transition-colors placeholder:text-ink-soft/50 focus:border-brand-600 ${className ?? ''}`}
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
};
