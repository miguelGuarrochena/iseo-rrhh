/**
 * Contrato de autoridad de estados (BUG-003 / BUG-004).
 *
 * Estos helpers ESPEJAN las predicates de
 * `20260810000056_estados_solicitud_empleado.sql` para regresión en Jest.
 * NO sustituyen un test RLS real: eso vive en
 * `supabase/tests/rls_estados_solicitud.test.sql`.
 */

export type RolAuth = 'superadmin' | 'admin_rrhh' | 'supervisor' | 'empleado';

const esGestor = (rol: RolAuth): boolean =>
  rol === 'superadmin' || rol === 'admin_rrhh' || rol === 'supervisor';

/** ¿Puede este actor INSERT esta fila de ausencia según la policy? */
export const puedeInsertarAusencia = (args: {
  rol: RolAuth;
  authEmpleadoId: string | null;
  authEmpresaId: string | null;
  fila: {
    empresaId: string;
    empleadoId: string;
    estado: 'pendiente' | 'aprobada' | 'rechazada';
    resueltaPor: string | null;
    resueltaEn: string | null;
    comentarioResolucion: string | null;
  };
}): boolean => {
  if (args.rol === 'superadmin') return true;
  if (args.authEmpresaId !== args.fila.empresaId) return false;
  if (esGestor(args.rol)) return true;
  return (
    args.fila.empleadoId === args.authEmpleadoId &&
    args.fila.estado === 'pendiente' &&
    args.fila.resueltaPor === null &&
    args.fila.resueltaEn === null &&
    args.fila.comentarioResolucion === null
  );
};

/** ¿Puede este actor INSERT esta fila de adelanto según adelantos_pedir? */
export const puedeInsertarAdelantoPedir = (args: {
  rol: RolAuth;
  authEmpleadoId: string | null;
  authEmpresaId: string | null;
  fila: {
    empresaId: string;
    empleadoId: string;
    estado: 'pendiente' | 'aprobado' | 'rechazado';
    resueltoEn: string | null;
    periodo: string | null;
  };
}): boolean => {
  if (args.rol === 'superadmin') return true;
  if (args.authEmpresaId !== args.fila.empresaId) return false;
  const dueñoOGestor =
    args.fila.empleadoId === args.authEmpleadoId || esGestor(args.rol);
  return (
    dueñoOGestor &&
    args.fila.estado === 'pendiente' &&
    args.fila.resueltoEn === null &&
    args.fila.periodo === null
  );
};

/** Empleado no tiene policy UPDATE de ausencias/adelantos. */
export const empleadoPuedeActualizarSolicitud = (): boolean => false;

/** Resolver ausencias: gestores. Resolver adelantos: admin_rrhh. */
export const puedeResolverAusencia = (rol: RolAuth): boolean => esGestor(rol);
export const puedeResolverAdelanto = (rol: RolAuth): boolean =>
  rol === 'superadmin' || rol === 'admin_rrhh';
