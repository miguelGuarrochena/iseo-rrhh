'use client';

import { ReactNode, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader } from '@mantine/core';
import { useAuth } from '@/lib/auth/AuthProvider';

/**
 * Protege las rutas de la app: si no hay sesión, redirige a /login.
 */
export const RequireAuth = ({ children }: { children: ReactNode }) => {
  const { usuario, cargando } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!cargando && !usuario) router.replace('/login');
  }, [cargando, usuario, router]);

  if (cargando || !usuario) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <Loader color="brand" />
      </div>
    );
  }

  return <>{children}</>;
};
