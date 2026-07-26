import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';

/**
 * Verifica el token Bearer de un request contra Supabase Auth.
 * Devuelve el usuario autenticado o null si no hay sesión válida.
 * Usar en toda API route que no deba quedar abierta al público.
 */
export const usuarioDesdeToken = async (
  req: Request
): Promise<{ id: string; email?: string } | null> => {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return null;
  try {
    const { data, error } = await supabaseAdmin().auth.getUser(token);
    if (error || !data.user) return null;
    return { id: data.user.id, email: data.user.email ?? undefined };
  } catch {
    return null;
  }
};
