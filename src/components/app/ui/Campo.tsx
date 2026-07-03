'use client';

import { InputHTMLAttributes } from 'react';
import { Opcion, Selector } from './Selector';

const claseBase =
  'w-full rounded-xl border bg-surface px-4 py-3 text-base text-ink outline-none transition-colors placeholder:text-ink-soft/50';

const claseDe = (error?: string) =>
  `${claseBase} ${error ? 'border-red-300 focus:border-red-500' : 'border-line focus:border-brand-600'}`;

interface BaseProps {
  etiqueta: string;
  error?: string;
  ayuda?: string;
}

interface CampoProps
  extends BaseProps,
    Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {}

/** Input con etiqueta, error y texto de ayuda. */
export const Campo = ({ etiqueta, error, ayuda, ...props }: CampoProps) => (
  <label className="flex flex-col gap-1.5">
    <span className="text-sm font-semibold text-ink">{etiqueta}</span>
    <input {...props} className={claseDe(error)} />
    {error && <span className="text-xs font-medium text-red-600">{error}</span>}
    {!error && ayuda && <span className="text-xs text-ink-soft">{ayuda}</span>}
  </label>
);

interface CampoSelectProps extends BaseProps {
  value: string;
  onChange: (valor: string) => void;
  opciones: Opcion[];
}

/** Selector con etiqueta, usando el dropdown propio (no nativo). */
export const CampoSelect = ({
  etiqueta,
  error,
  ayuda,
  value,
  onChange,
  opciones,
}: CampoSelectProps) => (
  <div className="flex flex-col gap-1.5">
    <span className="text-sm font-semibold text-ink">{etiqueta}</span>
    <Selector
      valor={value}
      onCambiar={onChange}
      opciones={opciones}
      error={Boolean(error)}
      className="w-full"
    />
    {error && <span className="text-xs font-medium text-red-600">{error}</span>}
    {!error && ayuda && <span className="text-xs text-ink-soft">{ayuda}</span>}
  </div>
);
