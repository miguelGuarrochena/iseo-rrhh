'use client';

import { create } from 'zustand';
import { Empresa, Rol, Usuario } from '@/types/rrhh';
import { usuariosMock } from '@/lib/mocks/usuarios';
import { supabase, supabaseConfigurado } from '@/lib/supabase/cliente';

/** Login demo: contra los usuarios mock, con latencia simulada. */
const loginDemo = (email: string): Promise<Usuario | null> =>
  new Promise((resolve) =>
    setTimeout(
      () =>
        resolve(
          usuariosMock.find(
            (u) => u.email.toLowerCase() === email.trim().toLowerCase()
          ) ?? null
        ),
      150
    )
  );

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

const cargarPerfil = async (usuarioId: string): Promise<Usuario | null> => {
  const { data } = await supabase()
    .from('usuarios')
    .select('*')
    .eq('id', usuarioId)
    .single();
  return data ? aUsuario(data as FilaUsuario) : null;
};

/**
 * El acceso de la empresa lo maneja el superadmin (alta/suspensión,
 * ej. por falta de pago). Si está suspendida, nadie de esa empresa entra.
 */
const empresaHabilitada = async (perfil: Usuario): Promise<boolean> => {
  if (perfil.rol === 'superadmin' || !perfil.empresaId) return true;
  const { data } = await supabase()
    .from('empresas')
    .select('estado')
    .eq('id', perfil.empresaId)
    .single();
  return data?.estado === 'activa';
};

interface AuthState {
  usuario: Usuario | null;
  /** true mientras se restaura la sesión guardada */
  cargando: boolean;
  /** true si la sesión es real (Supabase); false en modo demo */
  sesionReal: boolean;
  /** Empresa que el superadmin está "visitando" (opera como admin) */
  empresaVista: Empresa | null;
  inicializar: () => () => void;
  login: (email: string, password?: string) => Promise<Usuario | null>;
  logout: () => void;
  entrarAEmpresa: (empresa: Empresa) => void;
  salirDeEmpresa: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  usuario: null,
  cargando: true,
  sesionReal: false,
  empresaVista: null,

  /** Restaura la sesión al montar la app. Devuelve el cleanup. */
  inicializar: () => {
    const restaurar = async () => {
      if (supabaseConfigurado()) {
        const { data } = await supabase().auth.getSession();
        if (data.session) {
          const perfil = await cargarPerfil(data.session.user.id);
          if (perfil && (await empresaHabilitada(perfil))) {
            set({ usuario: perfil, sesionReal: true, cargando: false });
            return;
          }
          if (perfil) await supabase().auth.signOut();
        }
      }
      try {
        const guardado = window.localStorage.getItem(SESSION_KEY);
        const vista = window.localStorage.getItem(EMPRESA_VISTA_KEY);
        set({
          usuario: guardado ? (JSON.parse(guardado) as Usuario) : null,
          empresaVista: vista ? (JSON.parse(vista) as Empresa) : null,
          cargando: false,
        });
      } catch {
        window.localStorage.removeItem(SESSION_KEY);
        window.localStorage.removeItem(EMPRESA_VISTA_KEY);
        set({ cargando: false });
      }
    };
    void restaurar();

    if (!supabaseConfigurado()) return () => undefined;
    const { data: sub } = supabase().auth.onAuthStateChange(
      (evento, sesion) => {
        if (evento === 'SIGNED_IN' && sesion) {
          void cargarPerfil(sesion.user.id).then((p) => {
            if (p && !get().usuario) set({ usuario: p, sesionReal: true });
          });
        }
        if (evento === 'SIGNED_OUT') set({ usuario: null, sesionReal: false });
      }
    );
    return () => sub.subscription.unsubscribe();
  },

  login: async (email, password) => {
    // Con contraseña: auth real contra Supabase.
    if (password && supabaseConfigurado()) {
      const { data, error } = await supabase().auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error || !data.user) return null;
      const perfil = await cargarPerfil(data.user.id);
      if (!perfil) {
        await supabase().auth.signOut();
        throw new Error(
          'Tu cuenta existe pero todavía no tiene un perfil asignado. Contactá a quien te dio el alta.'
        );
      }
      if (!(await empresaHabilitada(perfil))) {
        await supabase().auth.signOut();
        throw new Error(
          'El acceso de tu empresa está suspendido. Comunicate con ISEO RH para reactivarlo.'
        );
      }
      set({ usuario: perfil, sesionReal: true });
      return perfil;
    }
    // Modo demo: mocks + localStorage.
    const encontrado = await loginDemo(email);
    if (encontrado) {
      set({ usuario: encontrado, sesionReal: false });
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(encontrado));
    }
    return encontrado;
  },

  logout: () => {
    if (supabaseConfigurado()) void supabase().auth.signOut();
    window.localStorage.removeItem(SESSION_KEY);
    window.localStorage.removeItem(EMPRESA_VISTA_KEY);
    set({ usuario: null, sesionReal: false, empresaVista: null });
  },

  entrarAEmpresa: (empresa) => {
    window.localStorage.setItem(EMPRESA_VISTA_KEY, JSON.stringify(empresa));
    set({ empresaVista: empresa });
  },

  salirDeEmpresa: () => {
    window.localStorage.removeItem(EMPRESA_VISTA_KEY);
    set({ empresaVista: null });
  },
}));

/** Rol con el que se resuelve la UI (superadmin visitando = admin_rrhh). */
export const rolEfectivoDe = (
  usuario: Usuario | null,
  empresaVista: Empresa | null
): Rol | null => {
  if (!usuario) return null;
  if (usuario.rol === 'superadmin' && empresaVista) return 'admin_rrhh';
  return usuario.rol;
};

/**
 * Empresa sobre la que operan los servicios: la del usuario, o la
 * visitada si es superadmin. Pensada para usarse fuera de React.
 */
export const empresaOperativaId = (): string | null => {
  const { usuario, empresaVista } = useAuthStore.getState();
  return empresaVista?.id ?? usuario?.empresaId ?? null;
};

/** true si hay sesión real de Supabase (no demo). */
export const haySesionReal = (): boolean => useAuthStore.getState().sesionReal;
