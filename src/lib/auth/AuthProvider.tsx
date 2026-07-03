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
import { supabase, supabaseConfigurado } from '@/lib/supabase/cliente';

const SESSION_KEY = 'iseo-rh-session';
const EMPRESA_VISTA_KEY = 'iseo-rh-empresa-vista';

/** Fila de public.usuarios → tipo de dominio */
interface FilaUsuario {
  id: string;
  email: string;
  rol: Rol;
  empresa_id: string | null;
  empleado_id: string | null;
  nombre_completo: string;
  avatar_url: string | null;
}

const aUsuario = (f: FilaUsuario): Usuario => ({
  id: f.id,
  email: f.email,
  rol: f.rol,
  empresaId: f.empresa_id,
  empleadoId: f.empleado_id,
  nombreCompleto: f.nombre_completo,
  avatarUrl: f.avatar_url ?? undefined,
});

/** Busca el perfil del usuario autenticado en public.usuarios. */
const cargarPerfil = async (usuarioId: string): Promise<Usuario | null> => {
  const { data } = await supabase()
    .from('usuarios')
    .select('*')
    .eq('id', usuarioId)
    .single();
  return data ? aUsuario(data as FilaUsuario) : null;
};

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
  /**
   * Con contraseña → Supabase Auth. Sin contraseña → modo demo (mocks).
   */
  login: (email: string, password?: string) => Promise<Usuario | null>;
  logout: () => void;
  entrarAEmpresa: (empresa: Empresa) => void;
  salirDeEmpresa: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [empresaVista, setEmpresaVista] = useState<Empresa | null>(null);
  const [cargando, setCargando] = useState(true);

  // Restaurar sesión: primero la real (Supabase), si no la demo (localStorage).
  useEffect(() => {
    const restaurar = async () => {
      if (supabaseConfigurado()) {
        const { data } = await supabase().auth.getSession();
        if (data.session) {
          const perfil = await cargarPerfil(data.session.user.id);
          if (perfil) {
            setUsuario(perfil);
            setCargando(false);
            return;
          }
        }
      }
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
    };
    void restaurar();

    // Mantener sincronizada la sesión real (ej. al crear la contraseña).
    if (!supabaseConfigurado()) return;
    const { data: sub } = supabase().auth.onAuthStateChange(
      (evento, sesion) => {
        if (evento === 'SIGNED_IN' && sesion) {
          void cargarPerfil(sesion.user.id).then(
            (p) => p && setUsuario((actual) => actual ?? p)
          );
        }
        if (evento === 'SIGNED_OUT') setUsuario(null);
      }
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  const login = useCallback(async (email: string, password?: string) => {
    // Con contraseña: auth real contra Supabase.
    if (password && supabaseConfigurado()) {
      const { data, error } = await supabase().auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error || !data.user) return null;
      const perfil = await cargarPerfil(data.user.id);
      if (perfil) setUsuario(perfil);
      return perfil;
    }
    // Modo demo: mocks + localStorage.
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
    if (supabaseConfigurado()) void supabase().auth.signOut();
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
