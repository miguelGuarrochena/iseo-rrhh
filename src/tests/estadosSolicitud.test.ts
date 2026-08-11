import {
  empleadoPuedeActualizarSolicitud,
  puedeInsertarAdelantoPedir,
  puedeInsertarAusencia,
  puedeResolverAdelanto,
  puedeResolverAusencia,
} from '@/lib/seguridad/estadosSolicitud';
import {
  crearAusencia,
  resolverAdelanto,
  resolverAusencia,
  solicitarAdelanto,
} from '@/lib/services/rrhh';

/**
 * BUG-003 / BUG-004
 *
 * - Unit: espejo de las predicates RLS + flujos demo legítimos.
 * - RLS real: `supabase/tests/rls_estados_solicitud.test.sql`
 *   (no se ejecuta en `npm run test:ci`).
 */

const empresa = 'emp-1';
const legajo = 'ple-4';

describe('policy espejo — ausencias (BUG-003)', () => {
  it('empleado INSERT aprobada → denegado', () => {
    expect(
      puedeInsertarAusencia({
        rol: 'empleado',
        authEmpleadoId: legajo,
        authEmpresaId: empresa,
        fila: {
          empresaId: empresa,
          empleadoId: legajo,
          estado: 'aprobada',
          resueltaPor: null,
          resueltaEn: null,
          comentarioResolucion: null,
        },
      })
    ).toBe(false);
  });

  it('empleado INSERT rechazada → denegado', () => {
    expect(
      puedeInsertarAusencia({
        rol: 'empleado',
        authEmpleadoId: legajo,
        authEmpresaId: empresa,
        fila: {
          empresaId: empresa,
          empleadoId: legajo,
          estado: 'rechazada',
          resueltaPor: null,
          resueltaEn: null,
          comentarioResolucion: null,
        },
      })
    ).toBe(false);
  });

  it('empleado INSERT pendiente → permitido', () => {
    expect(
      puedeInsertarAusencia({
        rol: 'empleado',
        authEmpleadoId: legajo,
        authEmpresaId: empresa,
        fila: {
          empresaId: empresa,
          empleadoId: legajo,
          estado: 'pendiente',
          resueltaPor: null,
          resueltaEn: null,
          comentarioResolucion: null,
        },
      })
    ).toBe(true);
  });

  it('empleado INSERT pendiente con resolución forjada → denegado', () => {
    expect(
      puedeInsertarAusencia({
        rol: 'empleado',
        authEmpleadoId: legajo,
        authEmpresaId: empresa,
        fila: {
          empresaId: empresa,
          empleadoId: legajo,
          estado: 'pendiente',
          resueltaPor: 'usr-x',
          resueltaEn: '2026-08-10T12:00:00Z',
          comentarioResolucion: null,
        },
      })
    ).toBe(false);
  });

  it('empleado no puede UPDATE pendiente→aprobada', () => {
    expect(empleadoPuedeActualizarSolicitud()).toBe(false);
  });

  it('admin_rrhh INSERT aprobada (carga manual) → permitido', () => {
    expect(
      puedeInsertarAusencia({
        rol: 'admin_rrhh',
        authEmpleadoId: 'ple-1',
        authEmpresaId: empresa,
        fila: {
          empresaId: empresa,
          empleadoId: legajo,
          estado: 'aprobada',
          resueltaPor: 'usr-admin',
          resueltaEn: '2026-08-10T12:00:00Z',
          comentarioResolucion: 'Carga manual',
        },
      })
    ).toBe(true);
  });

  it('gestor puede resolver; empleado no', () => {
    expect(puedeResolverAusencia('admin_rrhh')).toBe(true);
    expect(puedeResolverAusencia('supervisor')).toBe(true);
    expect(puedeResolverAusencia('empleado')).toBe(false);
  });
});

describe('policy espejo — adelantos (BUG-004)', () => {
  it('empleado INSERT aprobado → denegado', () => {
    expect(
      puedeInsertarAdelantoPedir({
        rol: 'empleado',
        authEmpleadoId: legajo,
        authEmpresaId: empresa,
        fila: {
          empresaId: empresa,
          empleadoId: legajo,
          estado: 'aprobado',
          resueltoEn: null,
          periodo: null,
        },
      })
    ).toBe(false);
  });

  it('empleado INSERT rechazado → denegado', () => {
    expect(
      puedeInsertarAdelantoPedir({
        rol: 'empleado',
        authEmpleadoId: legajo,
        authEmpresaId: empresa,
        fila: {
          empresaId: empresa,
          empleadoId: legajo,
          estado: 'rechazado',
          resueltoEn: null,
          periodo: null,
        },
      })
    ).toBe(false);
  });

  it('empleado INSERT pendiente → permitido', () => {
    expect(
      puedeInsertarAdelantoPedir({
        rol: 'empleado',
        authEmpleadoId: legajo,
        authEmpresaId: empresa,
        fila: {
          empresaId: empresa,
          empleadoId: legajo,
          estado: 'pendiente',
          resueltoEn: null,
          periodo: null,
        },
      })
    ).toBe(true);
  });

  it('empleado INSERT pendiente con periodo → denegado', () => {
    expect(
      puedeInsertarAdelantoPedir({
        rol: 'empleado',
        authEmpleadoId: legajo,
        authEmpresaId: empresa,
        fila: {
          empresaId: empresa,
          empleadoId: legajo,
          estado: 'pendiente',
          resueltoEn: null,
          periodo: '2026-09',
        },
      })
    ).toBe(false);
  });

  it('sólo admin_rrhh resuelve adelantos', () => {
    expect(puedeResolverAdelanto('admin_rrhh')).toBe(true);
    expect(puedeResolverAdelanto('supervisor')).toBe(false);
    expect(puedeResolverAdelanto('empleado')).toBe(false);
  });
});

describe('flujos demo legítimos (no son RLS)', () => {
  it('solicitud pendiente y aprobación por gestor', async () => {
    const creada = await crearAusencia({
      empleadoId: 'ple-4',
      tipo: 'especial',
      fechaDesde: '2026-11-01',
      fechaHasta: '2026-11-01',
    });
    expect(creada.estado).toBe('pendiente');
    const aprobada = await resolverAusencia(creada.id, 'aprobada', 'ple-1');
    expect(aprobada?.estado).toBe('aprobada');
  });

  it('carga manual de RRHH ya aprobada', async () => {
    const creada = await crearAusencia({
      empleadoId: 'ple-4',
      tipo: 'vacaciones',
      fechaDesde: '2026-11-10',
      fechaHasta: '2026-11-12',
      aprobarAutomaticamente: true,
    });
    expect(creada.estado).toBe('aprobada');
  });

  it('adelanto pendiente y resolución admin', async () => {
    const pedido = await solicitarAdelanto('ple-3', 15000, 'Trámite');
    expect(pedido.estado).toBe('pendiente');
    const ok = await resolverAdelanto(pedido.id, true, '2026-11');
    expect(ok.estado).toBe('aprobado');
    expect(ok.periodo).toBe('2026-11');
  });

  it('rechazo de adelanto pendiente', async () => {
    const pedido = await solicitarAdelanto('ple-3', 8000);
    const no = await resolverAdelanto(pedido.id, false);
    expect(no.estado).toBe('rechazado');
  });
});
