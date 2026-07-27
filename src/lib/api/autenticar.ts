import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { Rol } from '@/types/rrhh';

export interface UsuarioApi {
  id: string;
  email?: string;
  rol?: Rol;
}

/**
 * Verifica el token Bearer de un request contra Supabase Auth.
 * Devuelve el usuario autenticado (con rol de public.usuarios) o null.
 * Usar en toda API route que no deba quedar abierta al público.
 */
export const usuarioDesdeToken = async (
  req: Request
): Promise<UsuarioApi | null> => {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return null;
  try {
    const admin = supabaseAdmin();
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user) return null;
    const { data: perfil } = await admin
      .from('usuarios')
      .select('rol')
      .eq('id', data.user.id)
      .maybeSingle();
    return {
      id: data.user.id,
      email: data.user.email ?? undefined,
      rol: (perfil?.rol as Rol | undefined) ?? undefined,
    };
  } catch {
    return null;
  }
};
