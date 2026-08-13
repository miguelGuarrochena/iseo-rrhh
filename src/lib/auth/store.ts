'use client';

import { create } from 'zustand';
import { Empresa, Rol, Usuario } from '@/types/rrhh';
import { usuariosMock } from '@/lib/mocks/usuarios';
import { supabase, supabaseConfigurado } from '@/lib/supabase/cliente';
import { demoHabilitado } from '@/lib/entorno';
import { empresaDelKiosco } from '@/lib/kiosco';

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
 * Empresa que el superadmin estaba mirando, guardada en localStorage.
 *
 * Sin esto, cualquier recarga (F5, una URL pegada, abrir un link en otra
 * pestaña) lo devolvía al contexto global. Las pantallas de la empresa
 * seguían abiertas pero sin empresa activa, así que las consultas
 * tiraban "Sin empresa activa" y la pantalla mostraba datos vacíos como
 * si el equipo no tuviera nada cargado.
 */
const empresaVistaGuardada = (perfil: Usuario): Empresa | null => {
  if (perfil.rol !== 'superadmin') return null;
  try {
    const vista = window.localStorage.getItem(EMPRESA_VISTA_KEY);
    return vista ? (JSON.parse(vista) as Empresa) : null;
  } catch {
    window.localStorage.removeItem(EMPRESA_VISTA_KEY);
    return null;
  }
};

/**
 * Empresa con la que opera el superadmin: la que tenía abierta, o la
 * de la tablet en modo planta. Sin el kiosco, un login o una recarga
 * dejaba la terminal bloqueada pero sin empresa, y no había forma de
 * fichar ni de salir.
 *
 * Si la vista sale del kiosco, se reescribe en la clave de siempre
 * para que al desbloquear la tablet siga adentro de esa empresa.
 */
const vistaPara = (perfil: Usuario): Empresa | null => {
  const vista =
    empresaVistaGuardada(perfil) ??
    (perfil.rol === 'superadmin' ? empresaDelKiosco() : null);
  if (vista) {
    window.localStorage.setItem(EMPRESA_VISTA_KEY, JSON.stringify(vista));
  }
  return vista;
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
  /** Reemplaza el usuario en memoria tras editar el propio perfil. */
  refrescarUsuario: (usuario: Usuario) => void;
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
            set({
              usuario: perfil,
              sesionReal: true,
              // Se recupera la empresa que estaba mirando: si no, al
              // recargar quedaba adentro de las pantallas de la empresa
              // pero sin empresa activa.
              empresaVista: vistaPara(perfil),
              cargando: false,
            });
            return;
          }
          if (perfil) await supabase().auth.signOut();
        }
      }
      // Sesión demo en localStorage: solo si el demo está habilitado.
      // En producción no se restauran accesos de prueba.
      if (!demoHabilitado()) {
        window.localStorage.removeItem(SESSION_KEY);
        window.localStorage.removeItem(EMPRESA_VISTA_KEY);
        set({ cargando: false });
        return;
      }
      try {
        const guardado = window.localStorage.getItem(SESSION_KEY);
        const usuario = guardado ? (JSON.parse(guardado) as Usuario) : null;
        set({
          usuario,
          empresaVista: usuario ? vistaPara(usuario) : null,
          cargando: false,
        });
      } catch {
        window.localStorage.removeItem(SESSION_KEY);
        window.localStorage.removeItem(EMPRESA_VISTA_KEY);
        set({ cargando: false });
      }
    };
    void restaurar();

    /**
     * Sincroniza lo que pasa en otras pestañas.
     *
     * `localStorage` sólo avisa a las **otras** pestañas, nunca a la que
     * escribió. Sin esto: cerrar sesión en una dejaba a las demás
     * operando con el usuario en memoria, y —más grave en un producto
     * multiempresa— un superadmin que entraba a otra empresa en una
     * pestaña dejaba a la otra creyendo que seguía en la anterior.
     * Como `empresaOperativaId()` se resuelve fuera de React, una acción
     * podía terminar escribiendo sobre la empresa equivocada.
     */
    const alCambiarOtraPestania = (e: StorageEvent) => {
      if (e.key === SESSION_KEY && e.newValue === null) {
        set({ usuario: null, sesionReal: false, empresaVista: null });
        return;
      }
      if (e.key === EMPRESA_VISTA_KEY) {
        try {
          set({
            empresaVista: e.newValue
              ? (JSON.parse(e.newValue) as Empresa)
              : null,
          });
        } catch {
          set({ empresaVista: null });
        }
      }
    };
    window.addEventListener('storage', alCambiarOtraPestania);
    const quitarStorage = () =>
      window.removeEventListener('storage', alCambiarOtraPestania);

    if (!supabaseConfigurado()) return quitarStorage;
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
    return () => {
      quitarStorage();
      sub.subscription.unsubscribe();
    };
  },

  login: async (email, password) => {
    // Con contraseña se espera auth real. Si el proyecto no tiene las
    // claves de Supabase, avisamos claro en vez de caer a datos falsos.
    if (password && !supabaseConfigurado()) {
      throw new Error(
        'La aplicación no está conectada al servidor. Avisá a ISEO RH (falta configuración).'
      );
    }
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
      set({
        usuario: perfil,
        sesionReal: true,
        empresaVista: vistaPara(perfil),
      });
      return perfil;
    }
    // Modo demo: mocks + localStorage. Solo si el demo está habilitado
    // (apagado en producción por defecto).
    if (!demoHabilitado()) return null;
    const encontrado = await loginDemo(email);
    if (encontrado) {
      set({
        usuario: encontrado,
        sesionReal: false,
        empresaVista: vistaPara(encontrado),
      });
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

  /**
   * También reescribe la sesión guardada: si no, al recargar volvería el
   * nombre viejo y parecería que el cambio no se guardó.
   */
  refrescarUsuario: (usuario) => {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(usuario));
    set({ usuario });
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
