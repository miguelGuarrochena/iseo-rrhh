'use client';

import { ReactNode, useEffect } from 'react';
import { Empresa, Rol, Usuario } from '@/types/rrhh';
import { rolEfectivoDe, useAuthStore } from './store';

/**
 * El estado vive en Zustand (src/lib/auth/store.ts). Este componente
 * solo dispara la restauración de sesión al montar la app, y useAuth
 * conserva la misma API de siempre para las pantallas.
 */
export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const inicializar = useAuthStore((s) => s.inicializar);

  useEffect(() => inicializar(), [inicializar]);

  return <>{children}</>;
};

interface AuthApi {
  usuario: Usuario | null;
  cargando: boolean;
  empresaVista: Empresa | null;
  rolEfectivo: Rol | null;
  login: (email: string, password?: string) => Promise<Usuario | null>;
  logout: () => void;
  entrarAEmpresa: (empresa: Empresa) => void;
  salirDeEmpresa: () => void;
}

export const useAuth = (): AuthApi => {
  const usuario = useAuthStore((s) => s.usuario);
  const cargando = useAuthStore((s) => s.cargando);
  const empresaVista = useAuthStore((s) => s.empresaVista);
  const login = useAuthStore((s) => s.login);
  const logout = useAuthStore((s) => s.logout);
  const entrarAEmpresa = useAuthStore((s) => s.entrarAEmpresa);
  const salirDeEmpresa = useAuthStore((s) => s.salirDeEmpresa);

  return {
    usuario,
    cargando,
    empresaVista,
    rolEfectivo: rolEfectivoDe(usuario, empresaVista),
    login,
    logout,
    entrarAEmpresa,
    salirDeEmpresa,
  };
};
