'use client';

import { useEffect, useRef } from 'react';
import { Comunicacion, ComunicacionMensaje } from '@/types/rrhh';

interface HiloMensajesProps {
  comunicacion: Comunicacion;
  mensajes: ComunicacionMensaje[];
  /** Id del usuario logueado, para alinear sus mensajes a la derecha. */
  usuarioId?: string;
  /**
   * Quién escribió cada mensaje, resuelto por quien mira.
   *
   * Antes era un solo nombre, "el otro lado", que se le ponía a todo lo
   * que no fuera propio. En una empresa con más de un gestor eso
   * mentía: la respuesta de un compañero de RRHH aparecía firmada con
   * el nombre del colaborador del tema.
   */
  nombreDeAutor: (autorId: string) => string;
  /** Chat del colaborador: crece y hace scroll al último mensaje. */
  autoScroll?: boolean;
}

/**
 * Las burbujas de una conversación.
 *
 * El primer mensaje es el cuerpo de la comunicación (lo que se escribió
 * al abrirla), que no está en la tabla de mensajes: se antepone acá para
 * que el hilo se lea completo y no arranque por la mitad.
 */
export const HiloMensajes = ({
  comunicacion,
  mensajes,
  usuarioId,
  nombreDeAutor,
  autoScroll,
}: HiloMensajesProps) => {
  const fin = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!autoScroll) return;
    // `block: 'nearest'` para no arrastrar la página entera al final.
    fin.current?.scrollIntoView({ block: 'nearest' });
  }, [mensajes.length, autoScroll]);

  const todos = [
    {
      id: comunicacion.id,
      autorId: comunicacion.autorId,
      cuerpo: comunicacion.cuerpo,
      creadoEn: comunicacion.creadoEn,
    },
    ...mensajes,
  ];

  return (
    <div className="flex flex-col gap-3">
      {todos.map((m) => {
        const mio = m.autorId === usuarioId;
        return (
          <div
            key={m.id}
            className={`flex flex-col gap-0.5 ${mio ? 'items-end' : 'items-start'}`}
          >
            <span className="px-1 text-[0.65rem] font-bold text-ink-soft">
              {mio ? 'Vos' : nombreDeAutor(m.autorId)}
            </span>
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                mio
                  ? 'rounded-br-md bg-brand-600 text-white'
                  : 'rounded-bl-md border border-line bg-paper text-ink'
              }`}
            >
              {m.cuerpo}
            </div>
            <p className="px-1 text-[0.6rem] text-ink-soft">
              {new Date(m.creadoEn).toLocaleString('es-AR', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>
        );
      })}
      <div ref={fin} />
    </div>
  );
};
