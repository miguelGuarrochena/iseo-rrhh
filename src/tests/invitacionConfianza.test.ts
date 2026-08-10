import {
  cuentaSinPerfilEsDeLaEmpresa,
  datosParaCompletarAlta,
  datosParaReenviarInvitacion,
  type InvitacionConfiable,
} from '@/lib/api/invitacionConfianza';

/**
 * Reproduce BUG-001 y BUG-002 sin Supabase: la autoridad de completar
 * una cuenta a medias es la invitación registrada, nunca user_metadata.
 */

const invitacionBase = (
  overrides: Partial<InvitacionConfiable> = {}
): InvitacionConfiable => ({
  email: 'nuevo@empresa.com',
  empresaId: 'emp-victima',
  rol: 'empleado',
  nombreCompleto: 'Nuevo Ingreso',
  empleadoId: null,
  authUserId: 'auth-1',
  ...overrides,
});

describe('datosParaCompletarAlta (BUG-001 / BUG-002)', () => {
  it('BUG-001: sin invitación confiable no se completa aunque la metadata diga admin', () => {
    // Antes: rol/empresa venían de user_metadata. Un signup con
    // { rol: admin_rrhh, empresa_id: víctima } alcanzaba para que el
    // admin pulsara "Completar" y materializara la escalada.
    const resultado = datosParaCompletarAlta({
      email: 'atacante@evil.com',
      empresaId: 'emp-victima',
      invitacion: null,
      empleado: null,
      emailOcupandoLegajo: null,
    });

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.status).toBe(404);
      expect(resultado.error).toMatch(/invitación registrada/i);
    }
  });

  it('BUG-001: el rol sale de la invitación, no de un valor inventado', () => {
    const resultado = datosParaCompletarAlta({
      email: 'nuevo@empresa.com',
      empresaId: 'emp-victima',
      invitacion: invitacionBase({ rol: 'empleado' }),
      empleado: null,
      emailOcupandoLegajo: null,
    });

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.datos.rol).toBe('empleado');
      expect(resultado.datos.empresaId).toBe('emp-victima');
    }
  });

  it('rechaza un rol no invitable guardado en la fila', () => {
    const resultado = datosParaCompletarAlta({
      email: 'nuevo@empresa.com',
      empresaId: 'emp-victima',
      invitacion: invitacionBase({ rol: 'superadmin' }),
      empleado: null,
      emailOcupandoLegajo: null,
    });

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.status).toBe(400);
  });

  it('BUG-002: rechaza legajo de otra empresa', () => {
    const resultado = datosParaCompletarAlta({
      email: 'nuevo@empresa.com',
      empresaId: 'emp-victima',
      invitacion: invitacionBase({ empleadoId: 'ple-ajeno' }),
      empleado: { id: 'ple-ajeno', empresaId: 'emp-otra' },
      emailOcupandoLegajo: null,
    });

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.status).toBe(400);
      expect(resultado.error).toMatch(/no pertenece a esta empresa/i);
    }
  });

  it('BUG-002: rechaza vincular un legajo ya ocupado', () => {
    const resultado = datosParaCompletarAlta({
      email: 'nuevo@empresa.com',
      empresaId: 'emp-victima',
      invitacion: invitacionBase({ empleadoId: 'ple-1' }),
      empleado: { id: 'ple-1', empresaId: 'emp-victima' },
      emailOcupandoLegajo: 'otro@empresa.com',
    });

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.status).toBe(400);
      expect(resultado.error).toMatch(/ya tiene cuenta/i);
    }
  });

  it('completa con legajo válido de la misma empresa', () => {
    const resultado = datosParaCompletarAlta({
      email: 'nuevo@empresa.com',
      empresaId: 'emp-victima',
      invitacion: invitacionBase({
        rol: 'supervisor',
        empleadoId: 'ple-1',
      }),
      empleado: { id: 'ple-1', empresaId: 'emp-victima' },
      emailOcupandoLegajo: null,
    });

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.datos).toEqual({
        email: 'nuevo@empresa.com',
        nombreCompleto: 'Nuevo Ingreso',
        rol: 'supervisor',
        empresaId: 'emp-victima',
        empleadoId: 'ple-1',
      });
    }
  });

  it('invitación de otra empresa no autoriza completar', () => {
    const resultado = datosParaCompletarAlta({
      email: 'nuevo@empresa.com',
      empresaId: 'emp-victima',
      invitacion: invitacionBase({ empresaId: 'emp-otra' }),
      empleado: null,
      emailOcupandoLegajo: null,
    });

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.status).toBe(404);
  });
});

describe('cuentaSinPerfilEsDeLaEmpresa', () => {
  it('no lista huérfanas sólo por metadata (hace falta invitación)', () => {
    expect(
      cuentaSinPerfilEsDeLaEmpresa({
        tienePerfil: false,
        invitacionDeLaEmpresa: false,
      })
    ).toBe(false);
  });

  it('lista huérfana legítima con invitación y sin perfil', () => {
    expect(
      cuentaSinPerfilEsDeLaEmpresa({
        tienePerfil: false,
        invitacionDeLaEmpresa: true,
      })
    ).toBe(true);
  });

  it('no lista si ya tiene perfil', () => {
    expect(
      cuentaSinPerfilEsDeLaEmpresa({
        tienePerfil: true,
        invitacionDeLaEmpresa: true,
      })
    ).toBe(false);
  });
});

describe('datosParaReenviarInvitacion', () => {
  it('usa el perfil cuando existe (no metadata)', () => {
    const r = datosParaReenviarInvitacion({
      perfil: {
        rol: 'supervisor',
        empleado_id: 'ple-1',
        nombre_completo: 'Ana',
      },
      invitacion: null,
      emailFallback: 'ana@empresa.com',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.datos.rol).toBe('supervisor');
      expect(r.datos.empleadoId).toBe('ple-1');
    }
  });

  it('sin perfil ni invitación no reenvía (bloquea metadata envenenada)', () => {
    const r = datosParaReenviarInvitacion({
      perfil: null,
      invitacion: null,
      emailFallback: 'atacante@evil.com',
    });
    expect(r.ok).toBe(false);
  });
});
