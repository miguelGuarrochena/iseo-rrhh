'use client';

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Empresa, Rol, Usuario } from '@/types/rrhh';
import { loginConEmail } from '@/lib/services/rrhh';

const SESSION_KEY = 'iseo-rh-session';
const EMPRESA_VISTA_KEY = 'iseo-rh-empresa-vista';

interface AuthContextValue {
  usuario: Usuario | null;
  /** true mientras se restaura la sesión guardada */
  cargando: boolean;
  /**
   * Empresa que el superadmin está "visitando". Cuando está seteada,
   * el superadmin opera esa empresa con permisos de admin.
   */
  empresaVista: Empresa | null;
  /** Rol con el que se resuelve la UI (superadmin visitando = admin_rrhh) */
  rolEfectivo: Rol | null;
  login: (email: string) => Promise<Usuario | null>;
  logout: () => void;
  entrarAEmpresa: (empresa: Empresa) => void;
  salirDeEmpresa: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [empresaVista, setEmpresaVista] = useState<Empresa | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    try {
      const guardado = window.localStorage.getItem(SESSION_KEY);
      if (guardado) setUsuario(JSON.parse(guardado) as Usuario);
      const vista = window.localStorage.getItem(EMPRESA_VISTA_KEY);
      if (vista) setEmpresaVista(JSON.parse(vista) as Empresa);
    } catch {
      window.localStorage.removeItem(SESSION_KEY);
      window.localStorage.removeItem(EMPRESA_VISTA_KEY);
    }
    setCargando(false);
  }, []);

  const login = useCallback(async (email: string) => {
    const encontrado = await loginConEmail(email);
    if (encontrado) {
      setUsuario(encontrado);
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(encontrado));
    }
    return encontrado;
  }, []);

  const salirDeEmpresa = useCallback(() => {
    setEmpresaVista(null);
    window.localStorage.removeItem(EMPRESA_VISTA_KEY);
  }, []);

  const logout = useCallback(() => {
    setUsuario(null);
    window.localStorage.removeItem(SESSION_KEY);
    salirDeEmpresa();
  }, [salirDeEmpresa]);

  const entrarAEmpresa = useCallback((empresa: Empresa) => {
    setEmpresaVista(empresa);
    window.localStorage.setItem(EMPRESA_VISTA_KEY, JSON.stringify(empresa));
  }, []);

  const rolEfectivo: Rol | null = useMemo(() => {
    if (!usuario) return null;
    if (usuario.rol === 'superadmin' && empresaVista) return 'admin_rrhh';
    return usuario.rol;
  }, [usuario, empresaVista]);

  const value = useMemo(
    () => ({
      usuario,
      cargando,
      empresaVista,
      rolEfectivo,
      login,
      logout,
      entrarAEmpresa,
      salirDeEmpresa,
    }),
    [
      usuario,
      cargando,
      empresaVista,
      rolEfectivo,
      login,
      logout,
      entrarAEmpresa,
      salirDeEmpresa,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
};
