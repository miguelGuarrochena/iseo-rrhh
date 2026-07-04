'use client';

import { ChangeEvent, useRef, useState } from 'react';
import { IconPaperclip, IconX } from '@tabler/icons-react';
import { Boton } from './Boton';

interface CampoArchivoProps {
  etiqueta: string;
  accept?: string;
  onArchivo: (archivo: File | null) => void;
  ayuda?: string;
  error?: string;
  textoBoton?: string;
}

/**
 * Selector de archivo con el estilo de la app (sin el botón nativo del
 * navegador ni sus sombras). Muestra el nombre del archivo elegido y
 * permite quitarlo.
 */
export const CampoArchivo = ({
  etiqueta,
  accept,
  onArchivo,
  ayuda,
  error,
  textoBoton = 'Elegir archivo',
}: CampoArchivoProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [nombre, setNombre] = useState<string | null>(null);

  const elegir = (e: ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0] ?? null;
    setNombre(archivo?.name ?? null);
    onArchivo(archivo);
  };

  const limpiar = () => {
    setNombre(null);
    onArchivo(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold text-ink">{etiqueta}</span>
      <div
        className={`flex items-center gap-3 rounded-xl border bg-surface px-3 py-2.5 ${
          error ? 'border-red-300' : 'border-line'
        }`}
      >
        <Boton
          type="button"
          variante="secundario"
          tamano="sm"
          onClick={() => inputRef.current?.click()}
        >
          <IconPaperclip size={14} />
          {textoBoton}
        </Boton>
        <span className="min-w-0 flex-1 truncate text-sm text-ink-soft">
          {nombre ?? 'Ningún archivo seleccionado'}
        </span>
        {nombre && (
          <button
            type="button"
            onClick={limpiar}
            aria-label="Quitar archivo"
            className="shrink-0 cursor-pointer rounded-lg border-0 bg-transparent p-1 text-ink-soft transition-colors hover:text-ink"
          >
            <IconX size={16} />
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={elegir}
        />
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
