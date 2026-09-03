import {
  MENSAJES_CAMBIO_EMAIL,
  aplicarCambioDeEmail,
  estadoDeCuentaDeEmpleado,
  type PuertoCambioDeEmail,
} from '@/lib/api/cambioDeEmail';

/**
 * El email de una persona vive en cuatro lugares —la ficha, `auth.users`,
 * el perfil de `usuarios` y la invitación— y editar la ficha escribía sólo
 * el primero. Como la invitación y todos los avisos por mail se resuelven
 * contra los otros tres, cambiar el email en la ficha no cambiaba a dónde
 * llegaban las cosas: la invitación seguía saliendo a la dirección de
 * prueba y la app mostraba la real.
 *
 * Estos casos fijan las tres reglas que no se pueden romper:
 *
 *   1. Después del cambio, los cuatro lugares dicen lo mismo.
 *   2. Una invitación pendiente se invalida; nunca quedan dos vivas.
 *   3. Una cuenta que ya se usó conserva su `user_id`. Es la clave foránea
 *      de recibos firmados, documentos, mensajes y auditoría: borrarla y
 *      rehacerla se lleva la historia en cascada.
 */

/** Los cuatro almacenes, más lo histórico que cuelga del `user_id`. */
interface Base {
  ficha: { id: string; email: string };
  auth: Map<string, { id: string; email: string }>;
  perfiles: Map<string, { id: string; email: string }>;
  invitaciones: Map<string, { email: string; authUserId: string }>;
  /** Cada invitación que efectivamente salió por mail. */
  mailsEnviados: string[];
  /** Registros atados al usuario: se rompen si la cuenta se recrea. */
  historia: { recibos: string[]; firmas: string[]; auditoria: string[] };
}

const EMPLEADO = 'ple-1';
const VIEJO = 'test@example.com';
const NUEVO = 'empleado@empresa.com';

const baseVacia = (): Base => ({
  ficha: { id: EMPLEADO, email: VIEJO },
  auth: new Map(),
  perfiles: new Map(),
  invitaciones: new Map(),
  mailsEnviados: [],
  historia: { recibos: [], firmas: [], auditoria: [] },
});

/** Legajo con una cuenta que ya se usó: perfil, Auth e historia colgando. */
const baseConCuentaActiva = (): Base => {
  const base = baseVacia();
  base.auth.set('u-1', { id: 'u-1', email: VIEJO });
  base.perfiles.set('u-1', { id: 'u-1', email: VIEJO });
  base.invitaciones.set(VIEJO, { email: VIEJO, authUserId: 'u-1' });
  base.historia = {
    recibos: ['u-1'],
    firmas: ['u-1'],
    auditoria: ['u-1'],
  };
  return base;
};

/** Legajo invitado que nunca abrió el mail. */
const baseConInvitacionPendiente = (): Base => {
  const base = baseVacia();
  base.auth.set('u-1', { id: 'u-1', email: VIEJO });
  base.perfiles.set('u-1', { id: 'u-1', email: VIEJO });
  base.invitaciones.set(VIEJO, { email: VIEJO, authUserId: 'u-1' });
  base.mailsEnviados.push(VIEJO);
  return base;
};

/** Dónde se puede pedir que falle, para probar el estado a mitad. */
interface Fallas {
  perfil?: string;
  ficha?: string;
  invitar?: string;
  borrarCuenta?: string;
  crearPerfil?: string;
}

let proximoId = 2;

const puertoDe = (base: Base, fallas: Fallas = {}): PuertoCambioDeEmail => ({
  duenoDelEmail: async (email) => {
    const cuenta = [...base.auth.values()].find((u) => u.email === email);
    return cuenta?.id ?? null;
  },
  moverEmailDeAuth: async (usuarioId, email) => {
    const cuenta = base.auth.get(usuarioId);
    if (!cuenta) return 'La cuenta no existe.';
    cuenta.email = email;
    return null;
  },
  moverEmailDePerfil: async (usuarioId, email) => {
    if (fallas.perfil) return fallas.perfil;
    const perfil = base.perfiles.get(usuarioId);
    if (perfil) perfil.email = email;
    return null;
  },
  moverEmailDeFicha: async (_id, email) => {
    if (fallas.ficha) return fallas.ficha;
    base.ficha.email = email;
    return null;
  },
  borrarCuenta: async (usuarioId) => {
    if (fallas.borrarCuenta) return fallas.borrarCuenta;
    base.auth.delete(usuarioId);
    // `usuarios.id` referencia `auth.users` con on delete cascade.
    base.perfiles.delete(usuarioId);
    return null;
  },
  borrarInvitacion: async (email) => {
    base.invitaciones.delete(email);
  },
  invitar: async (email) => {
    // `!== undefined` y no truthiness: el error de Auth puede venir vacío
    // o como `"{}"`, y esos son justamente los casos que hay que probar.
    if (fallas.invitar !== undefined) return { error: fallas.invitar };
    const id = `u-${proximoId++}`;
    base.auth.set(id, { id, email });
    base.mailsEnviados.push(email);
    return { usuarioId: id };
  },
  crearPerfil: async (usuarioId, email) => {
    if (fallas.crearPerfil) return fallas.crearPerfil;
    base.perfiles.set(usuarioId, { id: usuarioId, email });
    return null;
  },
  registrarInvitacion: async (email, usuarioId) => {
    base.invitaciones.set(email, { email, authUserId: usuarioId });
    return null;
  },
});

/**
 * A dónde le manda un aviso la app. Reproduce lo que hacen las rutas de
 * comunicaciones: se resuelve contra Auth, con el perfil como respaldo.
 */
const emailAlQueLlegaUnAviso = (base: Base): string | null => {
  const perfil = [...base.perfiles.values()][0];
  if (!perfil) return null;
  return base.auth.get(perfil.id)?.email ?? perfil.email;
};

const cambiar = (base: Base, fallas: Fallas = {}, email = NUEVO) => {
  const cuenta = [...base.auth.values()][0] ?? null;
  const perfil = cuenta ? base.perfiles.get(cuenta.id) : undefined;
  return aplicarCambioDeEmail(puertoDe(base, fallas), {
    empleadoId: EMPLEADO,
    emailNuevo: email,
    emailDeLaFicha: base.ficha.email,
    estado: estadoDeCuentaDeEmpleado({
      tienePerfil: Boolean(perfil),
      authUserId: cuenta?.id ?? null,
      ultimoAcceso: base.mailsEnviados.length === 0 && cuenta ? 'ayer' : null,
    }),
    usuarioId: cuenta?.id ?? null,
    emailDeLaCuenta: cuenta?.email ?? null,
  });
};

beforeEach(() => {
  proximoId = 2;
});

// =====================================================================
// Qué estado tiene cada legajo
// =====================================================================

describe('estadoDeCuentaDeEmpleado', () => {
  it('sin cuenta en Auth, el email es sólo un dato de contacto', () => {
    expect(
      estadoDeCuentaDeEmpleado({
        tienePerfil: false,
        authUserId: null,
        ultimoAcceso: null,
      })
    ).toBe('sin_cuenta');
  });

  it('invitada y sin entrar todavía: pendiente', () => {
    expect(
      estadoDeCuentaDeEmpleado({
        tienePerfil: true,
        authUserId: 'u-1',
        ultimoAcceso: null,
      })
    ).toBe('invitacion_pendiente');
  });

  it('entró al menos una vez y tiene perfil: activa', () => {
    expect(
      estadoDeCuentaDeEmpleado({
        tienePerfil: true,
        authUserId: 'u-1',
        ultimoAcceso: '2026-09-01T10:00:00Z',
      })
    ).toBe('cuenta_activa');
  });

  it('sin perfil no es activa aunque ya tenga contraseña', () => {
    // Es la "cuenta a medias": puede entrar pero la app no sabe quién es,
    // así que no hay vínculo histórico que conservar.
    expect(
      estadoDeCuentaDeEmpleado({
        tienePerfil: false,
        authUserId: 'u-1',
        ultimoAcceso: '2026-09-01T10:00:00Z',
      })
    ).toBe('invitacion_pendiente');
  });
});

// =====================================================================
// Caso A · sin cuenta
// =====================================================================

describe('empleado sin cuenta', () => {
  it('actualiza la ficha y no crea cuenta ni invitación', async () => {
    const base = baseVacia();
    const resultado = await cambiar(base);

    expect(resultado.ok).toBe(true);
    if (resultado.ok) expect(resultado.datos.estado).toBe('sin_cuenta');
    expect(base.ficha.email).toBe(NUEVO);
    expect(base.auth.size).toBe(0);
    expect(base.perfiles.size).toBe(0);
    expect(base.invitaciones.size).toBe(0);
    expect(base.mailsEnviados).toEqual([]);
  });
});

// =====================================================================
// Caso B · invitación pendiente
// =====================================================================

describe('empleado con invitación pendiente', () => {
  it('invalida la invitación anterior', async () => {
    const base = baseConInvitacionPendiente();
    await cambiar(base);

    // El link del mail apunta a esa cuenta Auth: sin ella, no sirve más.
    expect([...base.auth.values()].some((u) => u.email === VIEJO)).toBe(false);
    expect(base.invitaciones.has(VIEJO)).toBe(false);
  });

  it('manda una invitación nueva al email nuevo', async () => {
    const base = baseConInvitacionPendiente();
    const resultado = await cambiar(base);

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.datos.reinvitado).toBe(true);
      expect(resultado.datos.email).toBe(NUEVO);
    }
    expect(base.mailsEnviados).toEqual([VIEJO, NUEVO]);
    expect(base.invitaciones.get(NUEVO)?.email).toBe(NUEVO);
  });

  it('no deja una segunda cuenta ni dos invitaciones vivas', async () => {
    const base = baseConInvitacionPendiente();
    await cambiar(base);

    expect(base.auth.size).toBe(1);
    expect(base.perfiles.size).toBe(1);
    expect(base.invitaciones.size).toBe(1);
    expect([...base.auth.values()][0].email).toBe(NUEVO);
  });

  it('deja los cuatro lugares diciendo lo mismo', async () => {
    const base = baseConInvitacionPendiente();
    await cambiar(base);

    expect(base.ficha.email).toBe(NUEVO);
    expect([...base.auth.values()][0].email).toBe(NUEVO);
    expect([...base.perfiles.values()][0].email).toBe(NUEVO);
    expect([...base.invitaciones.values()][0].email).toBe(NUEVO);
  });
});

// =====================================================================
// Caso C · cuenta activa
// =====================================================================

describe('empleado con cuenta activa', () => {
  it('mueve el email sin crear una cuenta nueva', async () => {
    const base = baseConCuentaActiva();
    const resultado = await cambiar(base);

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.datos.estado).toBe('cuenta_activa');
      expect(resultado.datos.reinvitado).toBe(false);
    }
    expect(base.auth.size).toBe(1);
    expect(base.mailsEnviados).toEqual([]);
  });

  it('conserva el mismo user_id', async () => {
    const base = baseConCuentaActiva();
    const resultado = await cambiar(base);

    expect(resultado.ok).toBe(true);
    if (resultado.ok) expect(resultado.datos.usuarioId).toBe('u-1');
    expect(base.auth.has('u-1')).toBe(true);
    expect(base.perfiles.has('u-1')).toBe(true);
  });

  it('no rompe recibos, firmas ni auditoría', async () => {
    const base = baseConCuentaActiva();
    await cambiar(base);

    // Todo lo histórico apunta a `u-1`: si la cuenta se hubiera borrado,
    // el cascade se lo habría llevado.
    for (const id of [
      ...base.historia.recibos,
      ...base.historia.firmas,
      ...base.historia.auditoria,
    ]) {
      expect(base.auth.has(id)).toBe(true);
    }
  });

  it('actualiza auth, perfil, ficha e invitación a la vez', async () => {
    const base = baseConCuentaActiva();
    await cambiar(base);

    expect(base.auth.get('u-1')?.email).toBe(NUEVO);
    expect(base.perfiles.get('u-1')?.email).toBe(NUEVO);
    expect(base.ficha.email).toBe(NUEVO);
    expect(base.invitaciones.has(VIEJO)).toBe(false);
    expect(base.invitaciones.get(NUEVO)?.authUserId).toBe('u-1');
  });
});

// =====================================================================
// Comunicaciones
// =====================================================================

describe('a dónde llegan los avisos después del cambio', () => {
  it('cuenta activa: recibos y consultas van al email nuevo', async () => {
    const base = baseConCuentaActiva();
    expect(emailAlQueLlegaUnAviso(base)).toBe(VIEJO);

    await cambiar(base);

    expect(emailAlQueLlegaUnAviso(base)).toBe(NUEVO);
  });

  it('invitación pendiente: el mail nuevo no vuelve al anterior', async () => {
    const base = baseConInvitacionPendiente();
    await cambiar(base);

    expect(emailAlQueLlegaUnAviso(base)).toBe(NUEVO);
    expect(base.mailsEnviados.slice(1)).not.toContain(VIEJO);
  });

  it('ningún almacén conserva el email anterior', async () => {
    const base = baseConCuentaActiva();
    await cambiar(base);

    const todos = [
      base.ficha.email,
      ...[...base.auth.values()].map((u) => u.email),
      ...[...base.perfiles.values()].map((p) => p.email),
      ...[...base.invitaciones.values()].map((i) => i.email),
    ];
    expect(todos).not.toContain(VIEJO);
    expect(new Set(todos)).toEqual(new Set([NUEVO]));
  });
});

// =====================================================================
// Que no quede a mitad de camino
// =====================================================================

describe('errores: nada de estados parcialmente actualizados', () => {
  it('cuenta activa: si falla el perfil, Auth vuelve al email anterior', async () => {
    const base = baseConCuentaActiva();
    const resultado = await cambiar(base, { perfil: 'timeout' });

    expect(resultado.ok).toBe(false);
    // Lo peor posible sería entrar con uno y que la app crea otro: ahí
    // deja de andar hasta el cambio de contraseña.
    expect(base.auth.get('u-1')?.email).toBe(VIEJO);
    expect(base.perfiles.get('u-1')?.email).toBe(VIEJO);
    expect(base.ficha.email).toBe(VIEJO);
  });

  it('cuenta activa: si falla la ficha, se deshace todo lo demás', async () => {
    const base = baseConCuentaActiva();
    const resultado = await cambiar(base, { ficha: 'not null violation' });

    expect(resultado.ok).toBe(false);
    expect(base.auth.get('u-1')?.email).toBe(VIEJO);
    expect(base.perfiles.get('u-1')?.email).toBe(VIEJO);
    expect(base.ficha.email).toBe(VIEJO);
  });

  it('pendiente: si el mail no sale, no quedan dos invitaciones', async () => {
    const base = baseConInvitacionPendiente();
    const resultado = await cambiar(base, { invitar: 'rate limit' });

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error).toContain(NUEVO);
    // La anterior quedó invalidada y no hay ninguna nueva: el legajo
    // queda "sin cuenta", que es un estado entero y recuperable.
    expect(base.auth.size).toBe(0);
    expect(base.invitaciones.size).toBe(0);
    expect(base.mailsEnviados).toEqual([VIEJO]);
    // Y la ficha queda con el email correcto para poder reinvitar.
    expect(base.ficha.email).toBe(NUEVO);
  });

  it('el detalle técnico vacío no ensucia el mensaje', async () => {
    // Cuando GoTrue no puede mandar el mail contesta con el cuerpo vacío
    // y el cliente lo deja en `"{}"`. Interpolarlo daba "el mail no salió
    // ({})", que suma ruido y hace dudar de si el mensaje está roto.
    for (const inservible of ['{}', '', '   ', 'null', '[object Object]']) {
      const base = baseConInvitacionPendiente();
      const resultado = await cambiar(base, { invitar: inservible });

      expect(resultado.ok).toBe(false);
      if (!resultado.ok) {
        expect(resultado.error).not.toMatch(
          /\(\s*\)|\{\}|\[object Object\]|\(null\)/
        );
        // Y lo accionable sigue estando.
        expect(resultado.error).toContain(NUEVO);
        expect(resultado.error).toMatch(/Invitá a/);
      }
    }
  });

  it('cuando el detalle sí dice algo, se muestra', async () => {
    const base = baseConInvitacionPendiente();
    const resultado = await cambiar(base, { invitar: 'rate limit exceeded' });

    expect(resultado.ok).toBe(false);
    if (!resultado.ok)
      expect(resultado.error).toContain('(rate limit exceeded)');
  });

  it('pendiente: si no se puede borrar la cuenta vieja, no se toca nada', async () => {
    const base = baseConInvitacionPendiente();
    const resultado = await cambiar(base, { borrarCuenta: 'auth caído' });

    expect(resultado.ok).toBe(false);
    expect(base.ficha.email).toBe(VIEJO);
    expect(base.auth.get('u-1')?.email).toBe(VIEJO);
    expect(base.invitaciones.has(VIEJO)).toBe(true);
    expect(base.mailsEnviados).toEqual([VIEJO]);
  });

  it('pendiente: si el perfil nuevo falla, la cuenta a medias se deshace', async () => {
    const base = baseConInvitacionPendiente();
    const resultado = await cambiar(base, { crearPerfil: 'constraint' });

    expect(resultado.ok).toBe(false);
    // Nunca se deja una cuenta que puede entrar y que la app no reconoce.
    expect(base.auth.size).toBe(0);
    expect(base.perfiles.size).toBe(0);
    expect(base.invitaciones.size).toBe(0);
  });

  it('rechaza un email que ya tiene cuenta, sin tocar nada', async () => {
    const base = baseConCuentaActiva();
    base.auth.set('u-9', { id: 'u-9', email: NUEVO });

    const resultado = await cambiar(base);

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.status).toBe(409);
    expect(base.auth.get('u-1')?.email).toBe(VIEJO);
    expect(base.ficha.email).toBe(VIEJO);
  });

  it('rechaza un email con formato inválido', async () => {
    const base = baseConCuentaActiva();
    const resultado = await cambiar(base, {}, 'no es un email');

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.status).toBe(400);
    expect(base.ficha.email).toBe(VIEJO);
  });

  it('guardar el mismo email no manda ningún mail', async () => {
    const base = baseConCuentaActiva();
    const resultado = await cambiar(base, {}, VIEJO.toUpperCase());

    expect(resultado.ok).toBe(true);
    if (resultado.ok) expect(resultado.datos.sinCambios).toBe(true);
    expect(base.mailsEnviados).toEqual([]);
  });
});

// =====================================================================
// Lo que ve el admin antes de guardar
// =====================================================================

describe('mensajes de la UI', () => {
  it('dice exactamente qué va a pasar en cada estado', () => {
    expect(MENSAJES_CAMBIO_EMAIL.sin_cuenta).toBe(
      'Se actualizará el email de contacto.'
    );
    expect(MENSAJES_CAMBIO_EMAIL.invitacion_pendiente).toBe(
      'La invitación anterior será invalidada y se enviará una nueva al nuevo email.'
    );
    expect(MENSAJES_CAMBIO_EMAIL.cuenta_activa).toBe(
      'Se actualizará el email de acceso de la cuenta existente. La cuenta y sus datos históricos se conservarán.'
    );
  });

  it('con cuenta activa no dice ni sugiere que se cree una cuenta', () => {
    expect(MENSAJES_CAMBIO_EMAIL.cuenta_activa).toMatch(/cuenta existente/);
    expect(MENSAJES_CAMBIO_EMAIL.cuenta_activa).not.toMatch(/nueva cuenta/i);
  });
});
