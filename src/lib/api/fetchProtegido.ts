'use client';

import { supabase } from '@/lib/supabase/cliente';

/**
 * fetch con el Bearer de la sesión actual, para llamar API routes que
 * exigen sesión real (ej. /api/ayuda, /api/convenio, /api/invitaciones).
 */
export const fetchProtegido = async (
  input: string,
  init: RequestInit = {}
): Promise<Response> => {
  const { data } = await supabase().auth.getSession();
  const token = data.session?.access_token;
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type'))
    headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers });
};
