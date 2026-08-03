'use client';

import { KeyboardEvent, useState } from 'react';
import { IconSend } from '@tabler/icons-react';
import { Boton } from '@/components/app/ui/Boton';

interface RedactorProps {
  onEnviar: (texto: string) => Promise<void>;
  placeholder?: string;
  /** Se muestra en vez del campo cuando la conversación está cerrada. */
  cerrado?: string;
}

/**
 * Campo para responder en un hilo.
 *
 * Enter envía y Shift+Enter hace un salto de línea: es lo que espera
 * cualquiera que use un chat. Antes había que apuntar al botón, que en
 * celular es incómodo y hace que la gente escriba mensajes más cortos de
 * lo que quería.
 */
export const Redactor = ({ onEnviar, placeholder, cerrado }: RedactorProps) => {
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);

  if (cerrado) {
    return (
      <p className="rounded-xl bg-paper px-4 py-3 text-center text-xs text-ink-soft">
        {cerrado}
      </p>
    );
  }

  const enviar = async () => {
    const limpio = texto.trim();
    if (!limpio || enviando) return;
    setEnviando(true);
    try {
      await onEnviar(limpio);
      setTexto('');
    } finally {
      // Se limpia sólo si salió bien: si falló, no se pierde lo escrito.
      setEnviando(false);
    }
  };

  const alTeclear = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void enviar();
    }
  };

  return (
    <div className="flex items-end gap-2">
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={alTeclear}
        rows={1}
        placeholder={placeholder ?? 'Escribí un mensaje…'}
        aria-label={placeholder ?? 'Escribí un mensaje'}
        className="max-h-32 min-h-[2.75rem] flex-1 resize-none rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink outline-none transition-colors placeholder:text-ink-soft/50 focus:border-brand-600"
      />
      <Boton
        onClick={() => void enviar()}
        disabled={!texto.trim() || enviando}
        aria-label="Enviar mensaje"
        className="h-11 px-4"
      >
        <IconSend size={17} />
      </Boton>
    </div>
  );
};
