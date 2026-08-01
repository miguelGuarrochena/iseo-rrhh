'use client';

import { supabase, supabaseConfigurado } from '@/lib/supabase/cliente';
import { empresaOperativaId, useAuthStore } from '@/lib/auth/store';

/**
 * Deja constancia del error crudo para que soporte pueda diagnosticarlo
 * después, sin depender de que el cliente saque una captura.
 *
 * Reglas de esta función:
 *  - nunca lanza (un fallo del registro no puede romper la pantalla),
 *  - nunca espera (no agrega latencia a la acción que ya falló),
 *  - nunca guarda datos del negocio, sólo el texto del error.
 */
export const registrarErrorApp = (mensaje: string, contexto?: string): void => {
  if (!mensaje || !supabaseConfigurado()) return;

  // Ruido que no aporta nada y llenaría la tabla.
  if (
    /Sin empresa activa|Sin sesión|Failed to fetch|NetworkError/i.test(mensaje)
  ) {
    return;
  }

  try {
    const usuarioId = useAuthStore.getState().usuario?.id ?? null;
    void supabase()
      .from('errores_app')
      .insert({
        empresa_id: empresaOperativaId() ?? null,
        usuario_id: usuarioId,
        ruta: typeof window !== 'undefined' ? window.location.pathname : null,
        contexto: contexto ?? null,
        mensaje: mensaje.slice(0, 2000),
      })
      .then(
        () => undefined,
        () => undefined // si no se puede registrar, se pierde y ya
      );
  } catch {
    // idem
  }
};
