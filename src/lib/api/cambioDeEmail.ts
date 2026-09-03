/**
 * Cambio de email de un colaborador, en un solo lugar.
 *
 * El email vivía repartido en cuatro almacenes —`empleados.email`,
 * `auth.users.email`, `usuarios.email` y `invitaciones.email`— y editar la
 * ficha escribía sólo el primero. Como la invitación y todos los avisos por
 * mail se resuelven contra los otros tres, cambiar el email en la ficha no
 * cambiaba a dónde llegaban las cosas: la persona seguía recibiendo sus
 * recibos y su invitación en la dirección vieja, y la app mostraba la nueva.
 *
 * Acá vive la decisión —qué estado tiene esa persona y qué hay que hacer— sin
 * Supabase de por medio, para poder probarla. El acceso a la base entra por
 * `PuertoCambioDeEmail`, que la ruta implementa con el cliente admin.
 *
 * No importa `server-only`: la UI usa los mensajes de `MENSAJES_CAMBIO_EMAIL`
 * para avisar qué va a pasar antes de guardar.
 */

import { normalizarEmail } from '@/lib/api/invitacionConfianza';

/**
 * En qué anda la cuenta de un colaborador. Es lo que decide el camino:
 *
 *  - `sin_cuenta`: no hay nada en Auth. El email es sólo un dato de contacto.
 *  - `invitacion_pendiente`: se mandó el mail y todavía no se usó, o la cuenta
 *    quedó a medias (sin perfil). No hay nada histórico que preservar.
 *  - `cuenta_activa`: entró al menos una vez y tiene perfil. Su `user_id` es
 *    la clave de recibos, firmas, mensajes y auditoría: no se toca.
 */
export type EstadoDeCuentaDeEmpleado =
  | 'sin_cuenta'
  | 'invitacion_pendiente'
  | 'cuenta_activa';

/**
 * Qué le decimos al admin antes de que guarde. Vive acá y no en el
 * componente para que la UI y los tests digan exactamente lo mismo.
 */
export const MENSAJES_CAMBIO_EMAIL: Record<EstadoDeCuentaDeEmpleado, string> = {
  sin_cuenta: 'Se actualizará el email de contacto.',
  invitacion_pendiente:
    'La invitación anterior será invalidada y se enviará una nueva al nuevo email.',
  cuenta_activa:
    'Se actualizará el email de acceso de la cuenta existente. La cuenta y sus datos históricos se conservarán.',
};

/**
 * Estado de la cuenta a partir de lo que hay en la base.
 *
 * Sin perfil no se puede hablar de cuenta activa aunque la persona haya
 * puesto una contraseña: la app no sabe quién es, así que no hay vínculo
 * histórico que conservar y el camino correcto es rehacer la invitación.
 */
export const estadoDeCuentaDeEmpleado = (args: {
  /** Fila de `public.usuarios` apuntando a ese legajo. */
  tienePerfil: boolean;
  /** Id en `auth.users`, o null si no hay cuenta. */
  authUserId: string | null;
  /** `last_sign_in_at`, o null si nunca entró. */
  ultimoAcceso: string | null;
}): EstadoDeCuentaDeEmpleado => {
  if (!args.authUserId) return 'sin_cuenta';
  if (!args.tienePerfil) return 'invitacion_pendiente';
  return args.ultimoAcceso ? 'cuenta_activa' : 'invitacion_pendiente';
};

/** Lo que la ficha necesita saber para avisar qué va a pasar al guardar. */
export interface CuentaConsultadaDeEmpleado {
  estado: EstadoDeCuentaDeEmpleado;
  /** Email con el que entra hoy, si tiene cuenta. */
  emailDeLaCuenta: string | null;
  /** Email que figura hoy en el legajo. */
  emailDeLaFicha: string;
}

const FORMATO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const emailConFormatoValido = (email: string): boolean =>
  FORMATO_EMAIL.test(email.trim());

/** Lo que el cambio necesita de la base. La ruta lo implementa con admin. */
export interface PuertoCambioDeEmail {
  /** Id del usuario Auth que ya ocupa ese email, o null si está libre. */
  duenoDelEmail(email: string): Promise<string | null>;
  /** Cambia `auth.users.email`. Devuelve el mensaje de error, o null. */
  moverEmailDeAuth(usuarioId: string, email: string): Promise<string | null>;
  /** Cambia `usuarios.email`. Devuelve el mensaje de error, o null. */
  moverEmailDePerfil(usuarioId: string, email: string): Promise<string | null>;
  /** Cambia `empleados.email`. Devuelve el mensaje de error, o null. */
  moverEmailDeFicha(empleadoId: string, email: string): Promise<string | null>;
  /** Borra la cuenta Auth (y en cascada su perfil). */
  borrarCuenta(usuarioId: string): Promise<string | null>;
  /** Borra la fila de `invitaciones` de ese email en esta empresa. */
  borrarInvitacion(email: string): Promise<void>;
  /** Manda la invitación nueva. Devuelve el id Auth creado. */
  invitar(email: string): Promise<{ usuarioId: string } | { error: string }>;
  /** Escribe el perfil del recién invitado. */
  crearPerfil(usuarioId: string, email: string): Promise<string | null>;
  /** Persiste la invitación confiable del email nuevo. */
  registrarInvitacion(email: string, usuarioId: string): Promise<string | null>;
}

export interface DatosDelCambio {
  empleadoId: string;
  /** Email nuevo, tal cual lo escribió el admin. */
  emailNuevo: string;
  /** Email que tiene hoy la ficha. */
  emailDeLaFicha: string;
  estado: EstadoDeCuentaDeEmpleado;
  /** Id Auth de la cuenta, si hay. */
  usuarioId: string | null;
  /** Email con el que esa cuenta entra hoy, si hay. */
  emailDeLaCuenta: string | null;
}

export interface CambioAplicado {
  estado: EstadoDeCuentaDeEmpleado;
  /** Email normalizado que quedó vigente. */
  email: string;
  /** Id Auth resultante. En `cuenta_activa` es el mismo de antes. */
  usuarioId: string | null;
  /** Si hubo que mandar un mail nuevo. */
  reinvitado: boolean;
  /** Si no había nada que cambiar. */
  sinCambios: boolean;
}

export type ResultadoCambioDeEmail =
  | { ok: true; datos: CambioAplicado }
  | { ok: false; status: 400 | 409 | 500; error: string };

/**
 * Aplica el cambio según el estado, y deja el sistema consistente si algo
 * falla en el camino.
 *
 * Las dos ramas que tocan más de una tabla se protegen distinto porque el
 * daño de quedar a mitad es distinto:
 *
 *  - **Cuenta activa**: primero se mueve `auth.users`, que es lo que más se
 *    cae (el email puede estar tomado). Si después falla el perfil, se
 *    devuelve Auth al email anterior antes de reportar: la persona sigue
 *    entrando con el que ya usaba.
 *  - **Invitación pendiente**: la cuenta vieja se borra para que su link deje
 *    de servir. Si el mail nuevo no sale, la ficha se actualiza igual y queda
 *    en `sin_cuenta`, que es un estado entero y del que se sale invitando de
 *    nuevo. Lo que no puede pasar es que sobrevivan las dos invitaciones.
 */
export const aplicarCambioDeEmail = async (
  puerto: PuertoCambioDeEmail,
  datos: DatosDelCambio
): Promise<ResultadoCambioDeEmail> => {
  const email = normalizarEmail(datos.emailNuevo);

  if (!email) {
    return { ok: false, status: 400, error: 'Falta el email nuevo.' };
  }
  if (!emailConFormatoValido(email)) {
    return {
      ok: false,
      status: 400,
      error:
        'El email no tiene un formato válido. Revisá que no tenga espacios ni errores de tipeo.',
    };
  }

  const enLaFicha = normalizarEmail(datos.emailDeLaFicha ?? '');
  const enLaCuenta = normalizarEmail(datos.emailDeLaCuenta ?? '');

  // Nada que hacer: la ficha ya lo tiene y la cuenta —si hay— también.
  if (enLaFicha === email && (!datos.usuarioId || enLaCuenta === email)) {
    return {
      ok: true,
      datos: {
        estado: datos.estado,
        email,
        usuarioId: datos.usuarioId,
        reinvitado: false,
        sinCambios: true,
      },
    };
  }

  // Un email vale para una sola cuenta en toda la plataforma. Se avisa acá,
  // con un mensaje que se entiende, en vez de dejar que reviente Auth a
  // mitad del cambio.
  if (email !== enLaCuenta) {
    const ocupado = await puerto.duenoDelEmail(email);
    if (ocupado && ocupado !== datos.usuarioId) {
      return {
        ok: false,
        status: 409,
        error:
          'Ese email ya tiene una cuenta en la plataforma (cada email puede usarse una sola vez, aunque sea en otra empresa). Quitale el acceso a esa cuenta desde Permisos para liberarlo, o usá otra dirección.',
      };
    }
  }

  if (datos.estado === 'sin_cuenta' || !datos.usuarioId) {
    const error = await puerto.moverEmailDeFicha(datos.empleadoId, email);
    if (error) {
      return { ok: false, status: 500, error: errorDeFicha(error) };
    }
    return {
      ok: true,
      datos: {
        estado: 'sin_cuenta',
        email,
        usuarioId: null,
        reinvitado: false,
        sinCambios: false,
      },
    };
  }

  return datos.estado === 'cuenta_activa'
    ? moverCuentaActiva(puerto, datos, email, enLaCuenta)
    : rehacerInvitacion(puerto, datos, email);
};

/**
 * El detalle técnico, sólo si dice algo.
 *
 * Los errores de Auth no siempre traen texto: cuando GoTrue no puede
 * mandar el mail contesta con el cuerpo vacío y el cliente lo deja en
 * `"{}"`. Interpolarlo tal cual daba "el mail no salió ({})", que suma
 * ruido y le hace dudar a quien lo lee de si el mensaje está roto.
 *
 * Devuelve el detalle entre paréntesis, o cadena vacía si no aporta.
 */
const detalle = (error: string | undefined): string => {
  const limpio = (error ?? '').trim();
  const vacios = ['', '{}', '[]', 'null', 'undefined', '[object Object]'];
  return vacios.includes(limpio) ? '' : ` (${limpio})`;
};

const errorDeFicha = (error: string): string =>
  `No pudimos guardar el email en la ficha${detalle(error)}.`;

/**
 * Cuenta activa: se mueve la identidad, no se recrea. El `user_id` es la
 * clave foránea de recibos firmados, documentos, mensajes y auditoría; un
 * borrado y alta nueva se los llevaría en cascada.
 */
const moverCuentaActiva = async (
  puerto: PuertoCambioDeEmail,
  datos: DatosDelCambio,
  email: string,
  emailAnterior: string
): Promise<ResultadoCambioDeEmail> => {
  const usuarioId = datos.usuarioId as string;

  if (emailAnterior !== email) {
    const errorAuth = await puerto.moverEmailDeAuth(usuarioId, email);
    if (errorAuth) {
      return {
        ok: false,
        status: 400,
        error: `No pudimos cambiar el email de acceso${detalle(errorAuth)}.`,
      };
    }
  }

  const errorPerfil = await puerto.moverEmailDePerfil(usuarioId, email);
  if (errorPerfil) {
    // Auth ya se movió: si el perfil no lo sigue, la app resuelve "quién soy"
    // con un email y el login con otro, y cambiar la contraseña deja de
    // funcionar. Se vuelve atrás antes de reportar.
    if (emailAnterior !== email) {
      await puerto.moverEmailDeAuth(usuarioId, emailAnterior);
    }
    return {
      ok: false,
      status: 500,
      error: `No pudimos actualizar el perfil, así que dejamos el email como estaba${detalle(errorPerfil)}.`,
    };
  }

  const errorFicha = await puerto.moverEmailDeFicha(datos.empleadoId, email);
  if (errorFicha) {
    await puerto.moverEmailDePerfil(usuarioId, emailAnterior);
    if (emailAnterior !== email) {
      await puerto.moverEmailDeAuth(usuarioId, emailAnterior);
    }
    return { ok: false, status: 500, error: errorDeFicha(errorFicha) };
  }

  // La invitación es el rastro de cómo entró: se mueve para que "reenviar"
  // y "completar el alta" no vuelvan al email viejo. Que falle no rompe
  // nada de lo anterior, así que no dispara rollback.
  if (emailAnterior && emailAnterior !== email) {
    await puerto.borrarInvitacion(emailAnterior);
  }
  await puerto.registrarInvitacion(email, usuarioId);

  return {
    ok: true,
    datos: {
      estado: 'cuenta_activa',
      email,
      usuarioId,
      reinvitado: false,
      sinCambios: false,
    },
  };
};

/**
 * Invitación pendiente: la anterior se invalida borrando su cuenta Auth —el
 * link del mail apunta a ella— y se manda una nueva al email nuevo. Nunca
 * quedan las dos vivas.
 */
const rehacerInvitacion = async (
  puerto: PuertoCambioDeEmail,
  datos: DatosDelCambio,
  email: string
): Promise<ResultadoCambioDeEmail> => {
  const usuarioId = datos.usuarioId as string;
  const emailAnterior = normalizarEmail(datos.emailDeLaCuenta ?? '');

  const errorBorrado = await puerto.borrarCuenta(usuarioId);
  if (errorBorrado) {
    return {
      ok: false,
      status: 500,
      error: `No pudimos invalidar la invitación anterior, así que no cambiamos nada${detalle(errorBorrado)}.`,
    };
  }
  if (emailAnterior) await puerto.borrarInvitacion(emailAnterior);

  const invitado = await puerto.invitar(email);
  if ('error' in invitado) {
    // La invitación vieja ya no sirve y la nueva no salió. Se deja la ficha
    // con el email correcto: el legajo queda "sin cuenta", que es un estado
    // entero, y se sale desde Permisos → Invitar usuario.
    await puerto.moverEmailDeFicha(datos.empleadoId, email);
    return {
      ok: false,
      status: 500,
      error: `Invalidamos la invitación anterior y guardamos el email nuevo, pero el mail no salió${detalle(invitado.error)}. Invitá a ${email} de nuevo desde Permisos.`,
    };
  }

  const errorPerfil = await puerto.crearPerfil(invitado.usuarioId, email);
  if (errorPerfil) {
    // Sin perfil la cuenta no sirve: se deshace y el email queda libre.
    await puerto.borrarCuenta(invitado.usuarioId);
    await puerto.borrarInvitacion(email);
    return {
      ok: false,
      status: 500,
      error: `Invalidamos la invitación anterior pero no pudimos crear la nueva, así que la deshicimos${detalle(errorPerfil)}. Invitá a ${email} de nuevo desde Permisos.`,
    };
  }

  await puerto.registrarInvitacion(email, invitado.usuarioId);

  const errorFicha = await puerto.moverEmailDeFicha(datos.empleadoId, email);
  if (errorFicha) {
    return { ok: false, status: 500, error: errorDeFicha(errorFicha) };
  }

  return {
    ok: true,
    datos: {
      estado: 'invitacion_pendiente',
      email,
      usuarioId: invitado.usuarioId,
      reinvitado: true,
      sinCambios: false,
    },
  };
};
