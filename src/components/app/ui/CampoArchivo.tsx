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
  /** Tamaño máximo en MB (default 20). Rechaza el archivo antes de subirlo. */
  maxSizeMB?: number;
}

/**
 * Selector de archivo con el estilo de la app (sin el botón nativo del
 * navegador ni sus sombras). Muestra el nombre del archivo elegido y
 * permite quitarlo. También acepta arrastrar y soltar: es lo natural
 * cuando el certificado o el comprobante ya está abierto en una carpeta.
 */
export const CampoArchivo = ({
  etiqueta,
  accept,
  onArchivo,
  ayuda,
  error,
  textoBoton = 'Elegir archivo',
  maxSizeMB = 20,
}: CampoArchivoProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [nombre, setNombre] = useState<string | null>(null);
  const [errorTamano, setErrorTamano] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);

  /** ¿El archivo entra en lo que pide `accept`? */
  const tipoPermitido = (archivo: File): boolean => {
    if (!accept) return true;
    return accept.split(',').some((patron) => {
      const p = patron.trim().toLowerCase();
      if (!p) return false;
      if (p.startsWith('.')) return archivo.name.toLowerCase().endsWith(p);
      if (p.endsWith('/*')) return archivo.type.startsWith(p.slice(0, -1));
      return archivo.type.toLowerCase() === p;
    });
  };

  const tomar = (archivo: File | null) => {
    if (archivo && !tipoPermitido(archivo)) {
      setErrorTamano('Ese tipo de archivo no se puede adjuntar acá.');
      setNombre(null);
      onArchivo(null);
      return;
    }
    if (archivo && archivo.size > maxSizeMB * 1024 * 1024) {
      setErrorTamano(`El archivo pesa demasiado (máximo ${maxSizeMB}MB).`);
      setNombre(null);
      onArchivo(null);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    setErrorTamano(null);
    setNombre(archivo?.name ?? null);
    onArchivo(archivo);
  };

  const elegir = (e: ChangeEvent<HTMLInputElement>) =>
    tomar(e.target.files?.[0] ?? null);

  const limpiar = () => {
    setNombre(null);
    setErrorTamano(null);
    onArchivo(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const errorAMostrar = errorTamano ?? error;

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold text-ink">{etiqueta}</span>
      <div
        onDragOver={(e) => {
          // Sin cancelar dragover el navegador abre el archivo soltado.
          e.preventDefault();
          if (!arrastrando) setArrastrando(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setArrastrando(false);
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          tomar(e.dataTransfer.files?.[0] ?? null);
        }}
        className={`flex items-center gap-3 rounded-xl border bg-surface px-3 py-2.5 transition-colors ${
          arrastrando
            ? 'border-dashed border-brand-400 bg-brand-50'
            : errorAMostrar
              ? 'border-red-300'
              : 'border-line-strong'
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
        <span
          className={`min-w-0 flex-1 truncate text-sm ${
            arrastrando ? 'font-semibold text-brand-800' : 'text-ink-soft'
          }`}
        >
          {arrastrando ? 'Soltalo acá' : (nombre ?? 'o arrastralo acá')}
        </span>
        {nombre && (
          <button
            type="button"
            onClick={limpiar}
            aria-label="Quitar archivo"
            className="shrink-0 cursor-pointer rounded-lg border-0 bg-transparent inline-flex h-11 w-11 items-center justify-center sm:h-9 sm:w-9 text-ink-soft transition-colors hover:text-ink"
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
      {errorAMostrar && (
        <span className="text-xs font-medium text-red-600">
          {errorAMostrar}
        </span>
      )}
      {!errorAMostrar && ayuda && (
        <span className="text-xs text-ink-soft">{ayuda}</span>
      )}
    </div>
  );
};
