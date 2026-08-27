'use client';

import { supabase, supabaseConfigurado } from '@/lib/supabase/cliente';

/**
 * Las dos pantallas de contraseña por email (invitación y recuperación)
 * pasan por acá y no hablan con Supabase: la capa de datos vive detrás
 * de esta capa, igual que el resto de la app (`lib/services`, `lib/auth`).
 */

/** true si el proyecto tiene el servidor de auth configurado. */
export const authDisponible = (): boolean => supabaseConfigurado();

/** A dónde vuelve la persona desde el mail para definir su contraseña. */
const RUTA_CREAR_CONTRASENA = '/crear-contrasena';

const INTENTOS = 7;
const ESPERA_MS = 500;

/**
 * Espera a que aparezca la sesión que trae el link del email.
 *
 * El token viene en el hash de la URL y supabase-js lo canjea solo, así
 * que hay que preguntar cada tanto en vez de una sola vez: si se mira
 * apenas monta la pantalla, la sesión todavía no está y un link válido
 * se muestra como vencido.
 *
 * Devuelve `false` cuando se agotan los intentos, y `cancelar` para
 * cortar la espera al desmontar (ahí la promesa ya no resuelve).
 */
export const esperarSesionDelLink = (): {
  sesion: Promise<boolean>;
  cancelar: () => void;
} => {
  let cancelado = false;
  let intentos = 0;
  let reloj = 0;

  const sesion = new Promise<boolean>((resolver) => {
    const listo = (valida: boolean) => {
      window.clearInterval(reloj);
      resolver(valida);
    };
    reloj = window.setInterval(() => {
      void supabase()
        .auth.getSession()
        .then(({ data }) => {
          if (cancelado) return;
          intentos += 1;
          if (data.session) listo(true);
          else if (intentos >= INTENTOS) listo(false);
        });
    }, ESPERA_MS);
  });

  return {
    sesion,
    cancelar: () => {
      cancelado = true;
      window.clearInterval(reloj);
    },
  };
};

/**
 * Define la contraseña de la sesión abierta por el link.
 * Devuelve el mensaje de error listo para mostrar, o null si salió bien.
 */
export const definirContrasena = async (
  password: string
): Promise<string | null> => {
  const { error } = await supabase().auth.updateUser({ password });
  return error ? error.message : null;
};

/**
 * Manda el mail con el link para crear una contraseña nueva.
 *
 * No informa si el email existe ni si el envío falló: quien pregunta
 * desde afuera no tiene que poder averiguar qué cuentas hay.
 */
export const enviarLinkDeRecuperacion = async (
  email: string
): Promise<void> => {
  await supabase().auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${window.location.origin}${RUTA_CREAR_CONTRASENA}`,
  });
};
