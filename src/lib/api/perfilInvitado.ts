import type { SupabaseClient } from '@supabase/supabase-js';

export interface DatosDeInvitacion {
  email: string;
  nombreCompleto: string;
  rol: string;
  empresaId: string;
  empleadoId: string | null;
}

/**
 * Crea la fila de `public.usuarios` de alguien recién invitado.
 *
 * Parece trabajo del trigger `crear_perfil_al_registrarse`, y lo era, pero
 * desde la migración 33 no lo hace: para que nadie se dé un rol o una
 * empresa a sí mismo con la metadata de un signup abierto, el trigger sale
 * sin hacer nada cuando `invited_at` viene en null. El detalle es que
 * Supabase inserta la fila en `auth.users` primero y recién después la
 * marca como invitada, así que el `after insert` la ve siempre en null: la
 * defensa terminó tapando también a las invitaciones legítimas.
 *
 * El resultado era el reclamo que originó todo esto: la persona recibía el
 * mail, ponía su contraseña, entraba, y se encontraba con que su cuenta no
 * tenía perfil; del otro lado, en Permisos, figuraba como si nunca se
 * hubiera dado de alta.
 *
 * Acá el perfil se puede escribir con confianza: quien invita ya fue
 * verificado contra la base, y el rol y la empresa los decide el servidor,
 * no el body del pedido.
 *
 * Devuelve el mensaje de error listo para mostrar, o null si salió bien.
 */
export const crearPerfilDeInvitado = async (
  admin: SupabaseClient,
  usuarioId: string,
  datos: DatosDeInvitacion
): Promise<string | null> => {
  const { error } = await admin.from('usuarios').upsert(
    {
      id: usuarioId,
      email: datos.email,
      rol: datos.rol,
      empresa_id: datos.empresaId,
      empleado_id: datos.empleadoId,
      nombre_completo: datos.nombreCompleto || datos.email,
    },
    { onConflict: 'id' }
  );
  return error ? error.message : null;
};
