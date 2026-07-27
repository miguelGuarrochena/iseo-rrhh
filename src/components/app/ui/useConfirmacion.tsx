'use client';

import { ReactNode, useCallback, useState } from 'react';
import { Modal } from '@mantine/core';
import { Boton } from './Boton';

/**
 * Confirmación con el diseño de la app, en reemplazo de `window.confirm`.
 *
 * Los diálogos nativos del navegador rompen la estética, no se pueden
 * traducir ni estilar, y en algunos navegadores traen un "impedir que
 * este sitio genere más diálogos" que deja la app muda sin avisar.
 *
 * Se usa como hook porque `window.confirm` es bloqueante y el código que
 * lo llamaba está escrito de forma secuencial: acá se devuelve una
 * promesa que resuelve true/false, así el `await` queda igual de simple.
 *
 *   const { confirmar, dialogo } = useConfirmacion();
 *   ...
 *   if (!(await confirmar({ titulo: '¿Eliminar?' }))) return;
 *   ...
 *   return (<> ... {dialogo} </>);
 */
export interface OpcionesConfirmacion {
  titulo: string;
  detalle?: ReactNode;
  /** Texto del botón que confirma. */
  confirmar?: string;
  cancelar?: string;
  /** Pinta el botón de confirmar como acción destructiva. */
  peligrosa?: boolean;
}

interface Pendiente extends OpcionesConfirmacion {
  resolver: (ok: boolean) => void;
}

export const useConfirmacion = () => {
  const [pendiente, setPendiente] = useState<Pendiente | null>(null);

  const confirmar = useCallback(
    (opciones: OpcionesConfirmacion): Promise<boolean> =>
      new Promise<boolean>((resolver) => {
        setPendiente({ ...opciones, resolver });
      }),
    []
  );

  const responder = (ok: boolean) => {
    pendiente?.resolver(ok);
    setPendiente(null);
  };

  const dialogo = (
    <Modal
      opened={pendiente !== null}
      onClose={() => responder(false)}
      title={pendiente?.titulo ?? ''}
      radius="lg"
      centered
      styles={{ title: { fontWeight: 800 } }}
    >
      <div className="flex flex-col gap-4">
        {pendiente?.detalle && (
          <div className="text-sm leading-relaxed text-ink-soft">
            {pendiente.detalle}
          </div>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Boton variante="secundario" onClick={() => responder(false)}>
            {pendiente?.cancelar ?? 'Cancelar'}
          </Boton>
          <Boton
            variante={pendiente?.peligrosa ? 'rechazar' : 'negro'}
            onClick={() => responder(true)}
          >
            {pendiente?.confirmar ?? 'Confirmar'}
          </Boton>
        </div>
      </div>
    </Modal>
  );

  return { confirmar, dialogo };
};
