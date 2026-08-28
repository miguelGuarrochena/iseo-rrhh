/**
 * Capa de servicios. Hoy lee mocks con una latencia simulada;
 * en la fase de back se reemplaza la implementación por Supabase
 * sin tocar las pantallas.
 */
import {
  AccionAuditoria,
  Alerta,
  Ausencia,
  Comunicacion,
  ComunicacionMensaje,
  ConfigPlataforma,
  Convenio,
  CuentaDeAcceso,
  CupoLicencia,
  DatosEmpresaCliente,
  DescriptorFacial,
  DocumentoFirma,
  DocumentoFirmaDestinatario,
  DocumentoLegajo,
  Empleado,
  Empresa,
  EmpresaResumen,
  ErrorApp,
  EventoAgenda,
  Feriado,
  FacturaMonotributo,
  Fichaje,
  FacturacionEmpresa,
  MetricasGlobales,
  MovimientoFinanciero,
  NuevoFeriado,
  NuevoMovimiento,
  ResumenFinanzas,
  NotaInterna,
  Adelanto,
  DescuentoRecurrente,
  NuevaRemuneracion,
  NuevoConvenio,
  NuevoTurno,
  MetodoFichaje,
  OpcionesFichaje,
  TipoFichaje,
  Notificacion,
  NuevaEmpresa,
  PendientesResumen,
  SaldoLicencia,
  Terminal,
  TipoAusencia,
  TipoComunicacion,
  Turno,
  ReciboSueldo,
  TipoRecibo,
  Remuneracion,
  ResumenControl,
  SaldoVacaciones,
  VacacionesPendientes,
  Usuario,
  VacacionSector,
} from '@/types/rrhh';
import {
  diasVacacionesDeRangoEnAnio,
  diasVacacionesCorresponden,
} from '@/lib/vacaciones';
import { calcularLiquidacion } from '@/lib/remuneraciones';
import {
  diaEmpresa,
  diasAusencia,
  hoyISO,
  mesEmpresa,
  sumarDiasEmpresa,
} from '@/lib/fechas';
import { distanciaMetros } from '@/lib/facial/ubicacion';

/**
 * Margen de reloj que tolera la base antes de considerar futura una
 * marca. Espejo de `margen_reloj_fichaje()` (migracion 89).
 */
const MARGEN_RELOJ_MS = 5 * 60 * 1000;
import { VERSION_PLANTILLA } from '@/lib/facial/plantilla';
import { aniosFeriadosAsegurar, feriadosSugeridos } from '@/lib/feriados';
import {
  puedeAprobarLicenciaContraCupo,
  saldoLicenciaDisponibleDe,
} from '@/lib/seguridad/cuposLicencia';
import {
  agruparMarcas,
  armarJornadas,
  diaLocal,
  desdeEstadoIso,
  Jornada,
  tipoDeMarcaSiguiente,
} from '@/lib/fichadas';
import { supabase, supabaseConfigurado } from '@/lib/supabase/cliente';
import { empresaOperativaId, useAuthStore } from '@/lib/auth/store';
import { dotacionMock, empresaMock, empresasMock } from '@/lib/mocks/empresa';
import { usuariosMock } from '@/lib/mocks/usuarios';
import { empleadosMock } from '@/lib/mocks/empleados';
import { jornadasMock } from '@/lib/mocks/jornadas';
import { movimientosMock } from '@/lib/mocks/finanzas';
import {
  adelantosMock,
  alertasMock,
  ausenciasMock,
  descuentosRecurrentesMock,
  documentosMock,
  eventosMock,
  fichajesMock,
  notasInternasMock,
  notificacionesMock,
  recibosMock,
  remuneracionesMock,
  turnosMock,
} from '@/lib/mocks/operaciones';

const LATENCIA_MS = 150;

const simular = <T>(data: T): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(data), LATENCIA_MS));

// ---------- Auth ----------

export const loginConEmail = async (email: string): Promise<Usuario | null> => {
  const usuario = usuariosMock.find(
    (u) => u.email.toLowerCase() === email.trim().toLowerCase()
  );
  return simular(usuario ?? null);
};

export const getUsuariosDemo = (): Usuario[] => usuariosMock;

// ---------- Empresa ----------

export const getEmpresa = async (
  empresaIdOverride?: string
): Promise<Empresa> =>
  simular(
    empresasMock.find((e) => e.id === empresaDemo(empresaIdOverride)) ??
      empresaMock
  );

// ---------- Empresas (superadmin) ----------

const empleadosActivosDe = (empresaId: string): number =>
  empresaId === 'emp-1'
    ? empleadosMock.filter((e) => e.activo).length
    : (dotacionMock[empresaId] ?? 0);

export const getEmpresas = async (): Promise<EmpresaResumen[]> =>
  simular(
    empresasMock.map((empresa) => ({
      empresa,
      empleadosActivos: empleadosActivosDe(empresa.id),
    }))
  );

export const crearEmpresa = async (datos: NuevaEmpresa): Promise<Empresa> => {
  const nueva: Empresa = {
    id: `emp-${Date.now()}`,
    nombre: datos.nombre,
    cuit: datos.cuit,
    razonSocial: datos.razonSocial,
    domicilio: datos.domicilio,
    estado: 'activa',
    contactoNombre: datos.contactoNombre,
    contactoEmail: datos.contactoEmail,
    contactoTelefono: datos.contactoTelefono,
    plan: datos.plan,
    abonoMensual: datos.abonoMensual ?? 0,
    config: {
      metodosFichaje: ['celular'],
      toleranciaLlegadaTardeMin: 10,
      horaEntrada: '08:00',
      horaSalida: '17:00',
      diasAvisoVencimiento: 30,
    },
    // Día de negocio: `toISOString().slice(0, 10)` es la fecha de UTC.
    creadaEn: hoyISO(),
  };
  empresasMock.push(nueva);
  return simular(nueva);
};

export const actualizarDatosEmpresa = async (
  empresaId: string,
  datos: DatosEmpresaCliente
): Promise<Empresa> => {
  const empresa = empresasMock.find((e) => e.id === empresaId);
  if (!empresa) throw new Error('Empresa no encontrada.');
  Object.assign(empresa, datos);
  return simular(empresa);
};

export const getEmpresaPorId = async (
  empresaId: string
): Promise<Empresa | null> =>
  simular(empresasMock.find((e) => e.id === empresaId) ?? null);

export const actualizarModulosEmpresa = async (
  empresaId: string,
  modulos: Record<string, boolean>,
  extras: Partial<Empresa['config']> = {}
): Promise<Empresa> => {
  const empresa = empresasMock.find((e) => e.id === empresaId);
  if (!empresa) throw new Error('Empresa no encontrada.');
  empresa.config = { ...empresa.config, ...extras, modulos };
  return simular(empresa);
};

export const getEmpleadosDeEmpresaCount = async (
  empresaId: string
): Promise<number> => simular(empleadosActivosDe(empresaId));

export const getMovimientosDeEmpresa = async (
  empresaId: string
): Promise<MovimientoFinanciero[]> =>
  simular(
    movimientosMock
      .filter((m) => m.empresaId === empresaId)
      .sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
  );

export const cambiarEstadoEmpresa = async (
  empresaId: string,
  estado: Empresa['estado']
): Promise<Empresa | null> => {
  const empresa = empresasMock.find((e) => e.id === empresaId);
  if (empresa) empresa.estado = estado;
  return simular(empresa ?? null);
};

export const getMetricasGlobales = async (): Promise<MetricasGlobales> => {
  const activas = empresasMock.filter((e) => e.estado === 'activa');
  return simular({
    empresasActivas: activas.length,
    empresasSuspendidas: empresasMock.length - activas.length,
    empleadosGestionados: empresasMock.reduce(
      (acc, e) => acc + empleadosActivosDe(e.id),
      0
    ),
    solicitudesPendientes: ausenciasMock.filter((a) => a.estado === 'pendiente')
      .length,
  });
};

// ---------- Empleados ----------

/** Empresa activa en la demo: la operada por el superadmin o la propia. */
const empresaDemo = (override?: string): string =>
  override ?? empresaOperativaId() ?? 'emp-1';

/** Usuario logueado en la demo (para registrar quién escribe cada cosa). */
const usuarioActualId = (): string =>
  useAuthStore.getState().usuario?.id ?? 'u-demo';

/** true si el empleado pertenece a la empresa (activa, o la que se pase). */
const esDeEmpresaDemo = (
  empleadoId: string,
  empresaOverride?: string
): boolean =>
  empleadosMock.some(
    (e) => e.id === empleadoId && e.empresaId === empresaDemo(empresaOverride)
  );

const sinBiometria = (empleado: Empleado): Empleado => {
  const { descriptorFacial, consentimientoBiometrico, ...resto } = empleado;
  void descriptorFacial;
  void consentimientoBiometrico;
  return { ...resto };
};

export const getEmpleados = async (
  empresaIdOverride?: string
): Promise<Empleado[]> =>
  simular(
    empleadosMock
      .filter((e) => e.activo && e.empresaId === empresaDemo(empresaIdOverride))
      .map(sinBiometria)
  );

export const getEmpleadosConCuenta = async (): Promise<string[]> =>
  simular(
    usuariosMock
      .filter((u) => u.empresaId === empresaDemo() && u.empleadoId)
      .map((u) => u.empleadoId as string)
  );

/** Incluye también los dados de baja (para el listado con filtro de estado) */
export const getEmpleadosTodos = async (): Promise<Empleado[]> =>
  simular(
    empleadosMock.filter((e) => e.empresaId === empresaDemo()).map(sinBiometria)
  );

export const getEmpleado = async (id: string): Promise<Empleado | null> =>
  simular(empleadosMock.find((e) => e.id === id) ?? null);

export const getEquipo = async (supervisorId: string): Promise<Empleado[]> =>
  simular(
    empleadosMock
      .filter((e) => e.supervisorId === supervisorId)
      .map(sinBiometria)
  );

export interface NuevoEmpleado {
  nombre: string;
  apellido: string;
  dni: string;
  puesto: string;
  sector: string;
  fechaIngreso: string;
  modalidadContratacion: Empleado['modalidadContratacion'];
  fechaFinContrato?: string;
  supervisorId?: string;
  // Datos personales opcionales (completables después)
  cuil?: string;
  numeroLegajo?: string;
  fechaNacimiento?: string;
  estadoCivil?: Empleado['estadoCivil'];
  nivelEstudios?: Empleado['nivelEstudios'];
  domicilio?: string;
  telefono?: string;
  email?: string;
  contactoEmergencia?: Empleado['contactoEmergencia'];
  grupoFamiliar?: Empleado['grupoFamiliar'];
  // Datos de pago opcionales
  modalidadPago?: Empleado['modalidadPago'];
  banco?: string;
  cbu?: string;
  obraSocial?: string;
  art?: string;
  convenio?: string;
  /** No va a tener cuenta en la app (régimen simplificado). */
  sinUsuario?: boolean;
  // Fichaje: dónde y cómo ficha
  modoFichaje?: Empleado['modoFichaje'];
  geocerca?: Empleado['geocerca'];
}

export const crearEmpleado = async (
  datos: NuevoEmpleado
): Promise<Empleado> => {
  const nuevo: Empleado = {
    id: `ple-${Date.now()}`,
    empresaId: empresaDemo(),
    nombre: datos.nombre,
    apellido: datos.apellido,
    dni: datos.dni,
    cuil: datos.cuil ?? '',
    fechaNacimiento: datos.fechaNacimiento ?? '',
    estadoCivil: datos.estadoCivil ?? 'soltero',
    nivelEstudios: datos.nivelEstudios ?? 'secundario',
    domicilio: datos.domicilio ?? '',
    telefono: datos.telefono ?? '',
    email: datos.email ?? '',
    contactoEmergencia: datos.contactoEmergencia ?? {
      nombreCompleto: '',
      vinculo: '',
      telefono: '',
    },
    grupoFamiliar: datos.grupoFamiliar ?? [],
    fechaIngreso: datos.fechaIngreso,
    puesto: datos.puesto,
    sector: datos.sector,
    supervisorId: datos.supervisorId ?? null,
    modalidadContratacion: datos.modalidadContratacion,
    fechaFinContrato: datos.fechaFinContrato,
    modalidadPago: datos.modalidadPago ?? 'mensual',
    banco: datos.banco ?? '',
    cbu: datos.cbu ?? '',
    obraSocial: datos.obraSocial ?? '',
    art: datos.art ?? '',
    convenio: datos.convenio,
    modoFichaje: datos.modoFichaje ?? 'celular',
    geocerca: datos.geocerca,
    activo: true,
    checklistAlta: [
      { id: 'chk-dni', etiqueta: 'DNI', completo: false },
      { id: 'chk-contrato', etiqueta: 'Contrato firmado', completo: false },
      { id: 'chk-afip', etiqueta: 'Alta AFIP', completo: false },
      {
        id: 'chk-medico',
        etiqueta: 'Examen preocupacional',
        completo: false,
      },
    ],
  };
  empleadosMock.push(nuevo);
  return simular(nuevo);
};

export const actualizarEmpleado = async (
  empleadoId: string,
  datos: Partial<Empleado>
): Promise<Empleado | null> => {
  const empleado = empleadosMock.find((e) => e.id === empleadoId);
  if (empleado) Object.assign(empleado, datos);
  return simular(empleado ?? null);
};

export const darDeBajaEmpleado = async (
  empleadoId: string,
  motivo: string,
  fecha: string
): Promise<Empleado | null> => {
  const empleado = empleadosMock.find((e) => e.id === empleadoId);
  if (empleado) {
    empleado.activo = false;
    empleado.motivoBaja = motivo;
    empleado.fechaBaja = fecha;
    // La finalidad por la que se recolectó el rostro termina con la baja
    // (Ley 25.326). Mismo criterio que en la implementación real.
    empleado.descriptorFacial = undefined;
    empleado.consentimientoBiometrico = undefined;
  }
  return simular(empleado ?? null);
};

export const toggleChecklistItem = async (
  empleadoId: string,
  itemId: string
): Promise<Empleado | null> => {
  const empleado = empleadosMock.find((e) => e.id === empleadoId);
  const item = empleado?.checklistAlta.find((c) => c.id === itemId);
  if (item) item.completo = !item.completo;
  return simular(empleado ?? null);
};

// ---------- Legajo: documentos ----------

export const getDocumentosDeEmpleado = async (
  empleadoId: string
): Promise<DocumentoLegajo[]> =>
  simular(documentosMock.filter((d) => d.empleadoId === empleadoId));

export interface NuevoDocumento {
  empleadoId: string;
  categoria: DocumentoLegajo['categoria'];
  nombre: string;
  fechaVencimiento?: string;
}

export const agregarDocumento = async (
  datos: NuevoDocumento
): Promise<DocumentoLegajo> => {
  const nuevo: DocumentoLegajo = {
    id: `doc-${Date.now()}`,
    empleadoId: datos.empleadoId,
    categoria: datos.categoria,
    nombre: datos.nombre,
    archivoUrl: `/legajos/${datos.empleadoId}/${Date.now()}.pdf`,
    fechaVencimiento: datos.fechaVencimiento,
    creadoEn: hoyISO(),
  };
  documentosMock.push(nuevo);
  return simular(nuevo);
};

export const quitarDocumento = async (documentoId: string): Promise<void> => {
  const i = documentosMock.findIndex((d) => d.id === documentoId);
  if (i >= 0) documentosMock.splice(i, 1);
  return simular(undefined);
};

// ---------- Usuarios y permisos ----------

export const getUsuariosDeEmpresa = async (): Promise<Usuario[]> =>
  simular(usuariosMock.filter((u) => u.empresaId === empresaDemo()));

export const getEquipoIseo = async (): Promise<Usuario[]> =>
  simular(usuariosMock.filter((u) => u.rol === 'superadmin'));

export const actualizarMiPerfil = async (
  nombreCompleto: string
): Promise<Usuario> => {
  const id = usuarioActualId();
  const u = usuariosMock.find((x) => x.id === id);
  if (!u) throw new Error('Sin sesión.');
  u.nombreCompleto = nombreCompleto;
  return simular(u);
};

/** En demo no hay contraseñas reales: se acepta y no se guarda nada. */
export const cambiarMiContrasena = async (): Promise<void> =>
  simular(undefined);

export const cambiarRolUsuario = async (
  usuarioId: string,
  rol: Usuario['rol']
): Promise<Usuario | null> => {
  const u = usuariosMock.find((x) => x.id === usuarioId);
  if (u && u.rol !== 'superadmin' && rol !== 'superadmin') u.rol = rol;
  return simular(u ?? null);
};

export interface NuevoUsuario {
  email: string;
  rol: Exclude<Usuario['rol'], 'superadmin'>;
  nombreCompleto: string;
  empleadoId?: string;
  /** empresa destino cuando invita el superadmin */
  empresaId?: string;
}

export const invitarUsuario = async (datos: NuevoUsuario): Promise<Usuario> => {
  // Con sesión real, la invitación viaja por email (Supabase).
  if (supabaseConfigurado()) {
    const { data } = await supabase().auth.getSession();
    const token = data.session?.access_token;
    if (token) {
      const res = await fetch('/api/invitaciones', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(datos),
      });
      if (!res.ok) {
        const { error } = (await res.json()) as { error?: string };
        throw new Error(error ?? 'No pudimos enviar la invitación.');
      }
      return {
        id: 'pendiente',
        email: datos.email,
        rol: datos.rol,
        empresaId: datos.empresaId ?? null,
        empleadoId: datos.empleadoId ?? null,
        nombreCompleto: datos.nombreCompleto,
      };
    }
  }
  // Modo demo: alta local.
  const nuevo: Usuario = {
    id: `usr-${Date.now()}`,
    email: datos.email,
    rol: datos.rol,
    empresaId: 'emp-1',
    empleadoId: datos.empleadoId ?? null,
    nombreCompleto: datos.nombreCompleto,
  };
  usuariosMock.push(nuevo);
  invitadasEnLaSesion.add(nuevo.email);
  return simular(nuevo);
};

/**
 * En demo no hay Auth: se considera que las cuentas de arranque ya se
 * usaron y que las invitadas durante la sesión están pendientes, que es
 * lo que hace falta para ver la pantalla como se ve con datos reales.
 */
const invitadasEnLaSesion = new Set<string>();

/**
 * Una cuenta a medias, para que el panel que las resuelve se pueda ver y
 * probar. No es un adorno: es el estado en el que quedaron las cuentas
 * reales invitadas entre la migración 33 y el arreglo, y la razón por la
 * que existe "Completar el alta".
 */
const cuentasAMedias: CuentaDeAcceso[] = [
  {
    email: 'sofia.acosta@ejemplo.com',
    nombre: 'Sofía Acosta',
    estado: 'sin_perfil',
    invitadaEn: new Date(Date.now() - 6 * 86_400_000).toISOString(),
    ultimoAcceso: new Date(Date.now() - 5 * 86_400_000).toISOString(),
  },
];

export const getEstadoDeCuentas = async (): Promise<CuentaDeAcceso[]> =>
  simular([
    ...usuariosMock
      .filter((u) => u.empresaId === empresaDemo())
      .map((u) => ({
        email: u.email,
        usuarioId: u.id,
        nombre: u.nombreCompleto,
        estado: invitadasEnLaSesion.has(u.email)
          ? ('pendiente' as const)
          : ('activa' as const),
        ultimoAcceso: invitadasEnLaSesion.has(u.email)
          ? undefined
          : new Date().toISOString(),
      })),
    ...cuentasAMedias,
  ]);

const sacarDeLasAMedias = (email: string) => {
  const i = cuentasAMedias.findIndex((c) => c.email === email);
  if (i >= 0) cuentasAMedias.splice(i, 1);
};

export const reenviarInvitacion = async (email: string): Promise<void> => {
  invitadasEnLaSesion.add(email);
  return simular(undefined);
};

export const quitarAcceso = async (email: string): Promise<void> => {
  const i = usuariosMock.findIndex((u) => u.email === email);
  if (i >= 0) usuariosMock.splice(i, 1);
  invitadasEnLaSesion.delete(email);
  sacarDeLasAMedias(email);
  return simular(undefined);
};

export const completarAlta = async (email: string): Promise<void> => {
  const aMedias = cuentasAMedias.find((c) => c.email === email);
  if (!aMedias) throw new Error('Esa cuenta ya tiene perfil.');
  usuariosMock.push({
    id: `usr-${Date.now()}`,
    email: aMedias.email,
    rol: 'empleado',
    empresaId: empresaDemo(),
    empleadoId: null,
    nombreCompleto: aMedias.nombre,
  });
  sacarDeLasAMedias(email);
  return simular(undefined);
};

export const vincularUsuarioAEmpleado = async (
  usuarioId: string,
  empleadoId: string | null
): Promise<Usuario | null> => {
  const u = usuariosMock.find((x) => x.id === usuarioId);
  if (!u || u.rol === 'superadmin') return simular(null);
  const ocupado =
    empleadoId &&
    usuariosMock.find((x) => x.id !== usuarioId && x.empleadoId === empleadoId);
  if (ocupado) {
    throw new Error(
      `Ese colaborador ya está vinculado a la cuenta de ${ocupado.nombreCompleto}. Desvinculála primero.`
    );
  }
  u.empleadoId = empleadoId;
  return simular(u);
};

// ---------- Configuración general de la plataforma (superadmin) ----------

const configPlataformaMock: ConfigPlataforma = {
  metodosFichajeDefault: ['celular'],
  toleranciaDefaultMin: 10,
  horaEntradaDefault: '08:00',
  horaSalidaDefault: '17:00',
  diasAvisoDefault: 30,
  resumenSemanalEmail: true,
};

export const getConfigPlataforma = async (): Promise<ConfigPlataforma> =>
  simular({ ...configPlataformaMock });

export const actualizarConfigPlataforma = async (
  config: ConfigPlataforma
): Promise<ConfigPlataforma> => {
  Object.assign(configPlataformaMock, config);
  return simular({ ...configPlataformaMock });
};

// ---------- Empresa: datos editables por el admin ----------

export const actualizarEmpresa = async (
  datos: Partial<
    Pick<
      Empresa,
      | 'nombre'
      | 'logoUrl'
      | 'contactoNombre'
      | 'contactoEmail'
      | 'contactoTelefono'
      | 'cuit'
      | 'razonSocial'
      | 'domicilio'
    >
  >
): Promise<Empresa> => {
  Object.assign(empresaMock, datos);
  return simular(empresaMock);
};

// ---------- Ausencias ----------

export const getAusencias = async (
  empresaIdOverride?: string
): Promise<Ausencia[]> =>
  simular(
    ausenciasMock.filter((a) =>
      esDeEmpresaDemo(a.empleadoId, empresaIdOverride)
    )
  );

export const getAusenciasEntre = async (
  desde: string,
  hasta: string,
  empresaIdOverride?: string
): Promise<Ausencia[]> =>
  simular(
    ausenciasMock.filter(
      (a) =>
        esDeEmpresaDemo(a.empleadoId, empresaIdOverride) &&
        // Se solapa con el rango, no "empieza dentro".
        a.fechaDesde <= hasta &&
        a.fechaHasta >= desde
    )
  );

export const getAusenciasDeEmpleado = async (
  empleadoId: string
): Promise<Ausencia[]> =>
  simular(ausenciasMock.filter((a) => a.empleadoId === empleadoId));

export const getAusenciasPendientes = async (): Promise<Ausencia[]> =>
  simular(
    ausenciasMock.filter(
      (a) => a.estado === 'pendiente' && esDeEmpresaDemo(a.empleadoId)
    )
  );

export const getVacacionesAprobadasDeEmpleados = async (
  empleadoIds: string[]
): Promise<Ausencia[]> =>
  simular(
    ausenciasMock.filter(
      (a) =>
        empleadoIds.includes(a.empleadoId) &&
        a.tipo === 'vacaciones' &&
        a.estado === 'aprobada'
    )
  );

export const getVacacionesAprobadasMiSector = async (
  empleadoId?: string
): Promise<VacacionSector[]> => {
  const actual = empleadosMock.find((e) => e.id === empleadoId);
  if (!actual) return simular([]);
  const idsSector = new Set(
    empleadosMock
      .filter((e) => e.activo && e.sector === actual.sector)
      .map((e) => e.id)
  );

  return simular(
    ausenciasMock
      .filter(
        (a) =>
          idsSector.has(a.empleadoId) &&
          a.tipo === 'vacaciones' &&
          a.estado === 'aprobada'
      )
      .map((a) => {
        const empleado = empleadosMock.find((e) => e.id === a.empleadoId);
        return {
          id: a.id,
          empleadoId: a.empleadoId,
          tipo: a.tipo,
          fechaDesde: a.fechaDesde,
          fechaHasta: a.fechaHasta,
          dias: a.dias,
          estado: a.estado,
          adjuntos: [],
          creadaEn: a.creadaEn,
          empleadoNombre: empleado?.nombre ?? 'Compañero',
          empleadoApellido: empleado?.apellido ?? '',
        };
      })
  );
};

export interface NuevaAusencia {
  empleadoId: string;
  tipo: Ausencia['tipo'];
  fechaDesde: string;
  fechaHasta: string;
  comentario?: string;
  /** Certificado o comprobante (opcional). */
  archivo?: File;
  /**
   * Si true (carga desde Admin/RRHH), queda aprobada de una.
   * Las solicitudes del empleado siguen pendientes.
   */
  aprobarAutomaticamente?: boolean;
}

export const crearAusencia = async (
  datos: NuevaAusencia
): Promise<Ausencia> => {
  // Misma fuente que UI y real.ts / trigger SQL: `diasAusencia`.
  const [empresa, feriados] = await Promise.all([getEmpresa(), getFeriados()]);
  const noLaborables = new Set(
    feriados.filter((f) => f.noLaborable).map((f) => f.fecha)
  );
  const dias = diasAusencia(
    datos.fechaDesde,
    datos.fechaHasta,
    datos.tipo,
    empresa.config.vacacionesDiasHabiles,
    noLaborables
  );
  const estado: Ausencia['estado'] = datos.aprobarAutomaticamente
    ? 'aprobada'
    : 'pendiente';
  // Espejo DB (BUG-010): solo al quedar aprobada se exige cupo.
  if (estado === 'aprobada') {
    const anio = Number(datos.fechaDesde.slice(0, 4));
    const previas = ausenciasMock.filter(
      (a) => a.empleadoId === datos.empleadoId
    );
    if (
      !puedeAprobarLicenciaContraCupo(
        cuposLicenciaMock,
        previas,
        datos.tipo,
        anio,
        dias
      )
    ) {
      const quedan = saldoLicenciaDisponibleDe(
        cuposLicenciaMock,
        previas,
        datos.tipo,
        anio
      );
      throw new Error(
        `No hay días de licencia suficientes para ${datos.tipo} (pedís ${dias}, quedan ${Math.max(0, quedan ?? 0)})`
      );
    }
  }
  const nueva: Ausencia = {
    id: `aus-${Date.now()}`,
    empleadoId: datos.empleadoId,
    tipo: datos.tipo,
    fechaDesde: datos.fechaDesde,
    fechaHasta: datos.fechaHasta,
    dias,
    estado,
    adjuntos: datos.archivo ? [datos.archivo.name] : [],
    comentarioEmpleado: datos.comentario,
    creadaEn: hoyISO(),
    ...(datos.aprobarAutomaticamente
      ? { resueltaEn: hoyISO(), comentarioResolucion: 'Carga manual de RRHH' }
      : {}),
  };
  ausenciasMock.unshift(nueva);

  if (!datos.aprobarAutomaticamente) {
    // Avisar a los gestores que hay una solicitud para resolver.
    const empleado = empleadosMock.find((e) => e.id === datos.empleadoId);
    usuariosMock
      .filter((u) => u.rol === 'admin_rrhh' || u.rol === 'supervisor')
      .forEach((u) =>
        notificacionesMock.unshift({
          id: `not-${Date.now()}-${u.id}`,
          usuarioId: u.id,
          tipo: 'ausencia_solicitada',
          titulo: 'Nueva solicitud de ausencia',
          cuerpo: `${empleado ? `${empleado.nombre} ${empleado.apellido}` : 'Un colaborador'} pidió ${nueva.dias} días.`,
          link: '/ausencias',
          leida: false,
          creadaEn: new Date().toISOString(),
        })
      );
  }

  return simular(nueva);
};

/** En la demo no hay storage: el adjunto no se puede abrir. */
export const abrirAdjuntoAusencia = async (
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _ausencia: Ausencia
): Promise<string | null> => simular(null);

export const eliminarAusencia = async (ausenciaId: string): Promise<void> => {
  const i = ausenciasMock.findIndex((a) => a.id === ausenciaId);
  if (i >= 0) ausenciasMock.splice(i, 1);
};

export const resolverAusencia = async (
  ausenciaId: string,
  estado: 'aprobada' | 'rechazada',
  resueltaPor: string,
  comentario?: string
): Promise<Ausencia | null> => {
  const ausencia = ausenciasMock.find((a) => a.id === ausenciaId);
  if (ausencia && ausencia.estado === 'pendiente') {
    if (estado === 'aprobada') {
      const anio = Number(ausencia.fechaDesde.slice(0, 4));
      const previas = ausenciasMock.filter(
        (a) => a.empleadoId === ausencia.empleadoId && a.id !== ausencia.id
      );
      if (
        !puedeAprobarLicenciaContraCupo(
          cuposLicenciaMock,
          previas,
          ausencia.tipo,
          anio,
          ausencia.dias
        )
      ) {
        const quedan = saldoLicenciaDisponibleDe(
          cuposLicenciaMock,
          previas,
          ausencia.tipo,
          anio
        );
        throw new Error(
          `No hay días de licencia suficientes para ${ausencia.tipo} (pedís ${ausencia.dias}, quedan ${Math.max(0, quedan ?? 0)})`
        );
      }
    }
    ausencia.estado = estado;
    ausencia.resueltaPor = resueltaPor;
    ausencia.comentarioResolucion = comentario;
    ausencia.resueltaEn = hoyISO();

    // Notificar al empleado el resultado (con el motivo si fue rechazo).
    const usuario = usuariosMock.find(
      (u) => u.empleadoId === ausencia.empleadoId
    );
    if (usuario) {
      notificacionesMock.unshift({
        id: `not-${Date.now()}`,
        usuarioId: usuario.id,
        tipo: 'ausencia_resuelta',
        titulo:
          estado === 'aprobada' ? 'Ausencia aprobada' : 'Ausencia rechazada',
        cuerpo:
          estado === 'aprobada'
            ? 'Tu solicitud de ausencia fue aprobada.'
            : `Tu solicitud fue rechazada.${
                comentario ? ` Motivo: ${comentario}` : ''
              }`,
        link: '/ausencias',
        leida: false,
        creadaEn: new Date().toISOString(),
      });
    }
  }
  return simular(ausencia ?? null);
};

export const getSaldoVacaciones = async (
  empleadoId: string,
  anio: number
): Promise<SaldoVacaciones | null> => {
  const empleado = empleadosMock.find((e) => e.id === empleadoId);
  if (!empleado) return simular(null);

  const habiles = Boolean(empresaMock.config?.vacacionesDiasHabiles);
  const delEmpleado = ausenciasMock.filter((a) => a.empleadoId === empleadoId);
  // Mismo camino que en Supabase: el régimen sale de la config y, en el
  // legal, las ausencias entran para el cómputo del art. 152.
  const corresponden = diasVacacionesCorresponden({
    config: empresaMock.config,
    fechaIngreso: empleado.fechaIngreso,
    anio,
    fechaBaja: empleado.fechaBaja,
    ausencias: delEmpleado,
  });
  const enAnio = (estado: 'aprobada' | 'pendiente') =>
    delEmpleado.reduce((acc, a) => {
      if (a.tipo !== 'vacaciones' || a.estado !== estado) return acc;
      return (
        acc +
        diasVacacionesDeRangoEnAnio(a.fechaDesde, a.fechaHasta, anio, {
          habiles,
        })
      );
    }, 0);
  const utilizados = enAnio('aprobada');
  const pendientes = enAnio('pendiente');

  const ajuste =
    vacacionesPendientesMock.find(
      (v) => v.empleadoId === empleadoId && v.anio === anio
    )?.dias ?? 0;

  return simular({
    empleadoId,
    anio,
    diasCorresponden: corresponden,
    diasAjuste: ajuste,
    diasUtilizados: utilizados,
    diasPendientesAprobacion: pendientes,
    diasDisponibles: corresponden + ajuste - utilizados - pendientes,
  });
};

// ---------- Vacaciones pendientes de años anteriores ----------

const vacacionesPendientesMock: VacacionesPendientes[] = [];

export const getVacacionesPendientes = async (
  empleadoId: string,
  anio: number
): Promise<VacacionesPendientes | null> =>
  simular(
    vacacionesPendientesMock.find(
      (v) => v.empleadoId === empleadoId && v.anio === anio
    ) ?? null
  );

export const guardarVacacionesPendientes = async (
  empleadoId: string,
  anio: number,
  dias: number,
  motivo?: string
): Promise<VacacionesPendientes | null> => {
  const i = vacacionesPendientesMock.findIndex(
    (v) => v.empleadoId === empleadoId && v.anio === anio
  );
  if (dias <= 0) {
    if (i >= 0) vacacionesPendientesMock.splice(i, 1);
    return simular(null);
  }
  const registro: VacacionesPendientes = {
    id: i >= 0 ? vacacionesPendientesMock[i].id : `vp-${Date.now()}`,
    empleadoId,
    anio,
    dias,
    motivo: motivo?.trim() || undefined,
    creadoEn: hoyISO(),
  };
  if (i >= 0) vacacionesPendientesMock[i] = registro;
  else vacacionesPendientesMock.push(registro);
  return simular(registro);
};

// ---------- Fichajes ----------

export const getFichajesDeHoy = async (
  empresaIdOverride?: string
): Promise<Fichaje[]> =>
  simular(
    fichajesMock.filter((f) => esDeEmpresaDemo(f.empleadoId, empresaIdOverride))
  );

const enRango = (f: Fichaje, desde: string, hasta: string): boolean => {
  const dia = diaLocal(f.timestamp);
  return dia >= desde && dia <= hasta;
};

export const getFichajesEntre = async (
  desde: string,
  hasta: string
): Promise<Fichaje[]> =>
  simular(
    fichajesMock
      .filter((f) => enRango(f, desde, hasta))
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  );

/**
 * En la demo no hay Postgres, así que las jornadas se arman con la
 * misma función que usa el resto de la app. Es justamente la referencia
 * contra la que se testea que la versión SQL dé lo mismo.
 */
export const getJornadas = async (
  desde: string,
  hasta: string,
  opciones: {
    soloAbiertas?: boolean;
    empleadoIds?: string[];
    empresaIdOverride?: string;
  } = {}
): Promise<Jornada[]> => {
  if (opciones.empleadoIds && opciones.empleadoIds.length === 0) {
    return simular([]);
  }
  const ids = opciones.empleadoIds ? new Set(opciones.empleadoIds) : null;
  // Se lee un día de más a cada lado, igual que la SQL, para no partir
  // las jornadas que cruzan el borde del rango.
  // `sumarDiasEmpresa` y no `new Date(...); setDate(...)`: es aritmética
  // de días de calendario, y pasarla por un `Date` local la ataba al huso
  // del dispositivo.
  const margen = sumarDiasEmpresa;
  const jornadas = armarJornadas(
    fichajesMock
      .filter((f) => enRango(f, margen(desde, -1), margen(hasta, 1)))
      .filter((f) => !ids || ids.has(f.empleadoId))
  )
    // Una jornada pertenece al período en el que empezó.
    .filter((j) => j.fecha >= desde && j.fecha <= hasta)
    .filter((j) => !opciones.soloAbiertas || j.incompleta);
  return simular(jornadas);
};

export const getFichajesPagina = async (
  desde: string,
  hasta: string,
  opciones: {
    pagina: number;
    porPagina: number;
    empleadoIds?: string[];
    soloAbiertas?: boolean;
  }
): Promise<{ fichajes: Fichaje[]; total: number }> => {
  if (opciones.empleadoIds && opciones.empleadoIds.length === 0) {
    return simular({ fichajes: [], total: 0 });
  }
  const ids = opciones.empleadoIds ? new Set(opciones.empleadoIds) : null;
  let candidatos = fichajesMock
    .filter((f) => enRango(f, desde, hasta))
    .filter((f) => !ids || ids.has(f.empleadoId));

  if (opciones.soloAbiertas) {
    // Espejo de `fichajes_del_periodo`: se arman las jornadas y se
    // dejan sólo las marcas de las que quedaron sin cerrar. El filtro
    // va ANTES de cortar la página, que es justamente lo que estaba mal
    // cuando esto se hacía en el componente.
    const idsAbiertas = new Set(
      agruparMarcas(candidatos)
        .filter((g) => g.jornada.incompleta)
        .flatMap((g) => g.marcas.map((m) => m.id))
    );
    candidatos = candidatos.filter((f) => idsAbiertas.has(f.id));
  }

  const todos = candidatos.sort((a, b) =>
    b.timestamp.localeCompare(a.timestamp)
  );
  const inicio = opciones.pagina * opciones.porPagina;
  return simular({
    fichajes: todos.slice(inicio, inicio + opciones.porPagina),
    total: todos.length,
  });
};

export const getFichajesDeEmpleadoHoy = async (
  empleadoId: string
): Promise<Fichaje[]> => {
  const desde = desdeEstadoIso();
  return simular(
    fichajesMock.filter(
      (f) => f.empleadoId === empleadoId && !f.anuladoEn && f.timestamp >= desde
    )
  );
};

/**
 * Ficha ingreso o egreso según el estado persistido, no según el día
 * calendario. `opciones.tipo` sólo lo usa la carga manual de RRHH.
 */
export const ficharAhora = async (
  empleadoId: string,
  opciones: OpcionesFichaje = {}
): Promise<Fichaje> => {
  const recientes = fichajesMock.filter(
    (f) => f.empleadoId === empleadoId && !f.anuladoEn
  );
  const tipo: Fichaje['tipo'] =
    opciones.tipo ?? tipoDeMarcaSiguiente(recientes);
  const esManual = opciones.metodo === 'manual';
  // El motivo lo exige el trigger `imponer_actor_fichaje` en producción.
  // Si acá no se exigiera, la demo dejaría pasar un formulario que
  // después falla contra la base de verdad.
  const motivo = (opciones.motivo ?? '').trim();
  if (esManual && !motivo) {
    throw new Error(
      'Decí por qué cargás esta marca a mano: sin motivo no se puede auditar después.'
    );
  }
  // A04: en produccion lo impide `trg_rechazar_fichaje_futuro`, con el
  // mismo margen de 5 minutos para relojes desajustados. Si la demo lo
  // dejara pasar, ensenaria un comportamiento que la base no tiene.
  const cuando = opciones.timestamp ?? new Date().toISOString();
  if (new Date(cuando).getTime() > Date.now() + MARGEN_RELOJ_MS) {
    throw new Error('No se puede registrar un fichaje con fecha futura.');
  }
  const nuevo: Fichaje = {
    id: `fic-${Date.now()}`,
    empleadoId,
    tipo,
    timestamp: cuando,
    metodo: opciones.metodo ?? 'celular',
    // Sin `fotoUrl`: el modo demo recorre el mismo camino que la app
    // conectada, y ahí el fichaje no guarda ninguna fotografía.
    confianza: opciones.confianza,
    geo: esManual
      ? undefined
      : (opciones.geo ?? { lat: -34.7203, lng: -58.2542 }),
    fueraDeZona: opciones.fueraDeZona,
    registradoPor: opciones.registradoPor,
    motivo: esManual ? motivo : undefined,
  };
  fichajesMock.push(nuevo);
  return simular(nuevo);
};

/**
 * Ficha validando el rostro. En la implementación real esto lo resuelve
 * un RPC en Postgres; acá se emula el mismo contrato para que la demo
 * recorra el mismo camino que la app conectada.
 */
export const ficharConRostro = async (
  descriptor: number[],
  opciones: {
    empleadoId?: string;
    geo?: { lat: number; lng: number };
    tipo?: TipoFichaje;
  } = {}
): Promise<Fichaje> => {
  // El mock no compara 128 dimensiones: identifica por el id cuando
  // viene, y si no, por la plantilla más parecida a la captura.
  const cerca = (plantilla?: number[]) =>
    Boolean(
      plantilla &&
        plantilla.length === descriptor.length &&
        plantilla.every((x, i) => Math.abs(x - descriptor[i]) < 0.5)
    );
  const empleado = opciones.empleadoId
    ? empleadosMock.find((e) => e.id === opciones.empleadoId)
    : (empleadosMock.find((e) => cerca(e.descriptorFacial)) ??
      empleadosMock.find((e) => e.descriptorFacial?.length));
  if (!empleado) throw new Error('No reconocimos el rostro.');

  // F-07: el método sale del camino, igual que en la base. Sin
  // `empleadoId` es la terminal; con id, el dispositivo de la persona.
  const metodo: MetodoFichaje = !opciones.empleadoId
    ? 'facial_tablet'
    : empleado.modoFichaje === 'remoto'
      ? 'remoto'
      : 'celular';

  // A06: con geocerca configurada, fichar exige coordenadas y estar
  // dentro. Es la misma tabla de decision que aplica `fichar_con_rostro`:
  //   sin geocerca -> permitir; adentro -> permitir;
  //   afuera -> rechazar; sin ubicacion -> rechazar.
  // Solo 1:1 con modo celular: en el kiosco la geocerca mide a la tablet
  // y bajo techo el GPS no engancha.
  if (
    opciones.empleadoId &&
    empleado.modoFichaje === 'celular' &&
    empleado.geocerca
  ) {
    if (!opciones.geo) {
      throw new Error(
        'No podemos verificar tu ubicación. Activá el permiso de ubicación para fichar.'
      );
    }
    const radio = empleado.geocerca.radioM ?? 150;
    if (distanciaMetros(empleado.geocerca, opciones.geo) > radio) {
      throw new Error(
        'Estás fuera de tu zona de trabajo. Acercate al lugar donde te toca fichar.'
      );
    }
  }

  // Anti-rebote del kiosco: la misma cara, hace un momento, no es otra
  // marca. No decide ingreso/egreso; el tipo lo pone ficharAhora.
  if (!opciones.empleadoId) {
    const limite = Date.now() - 3 * 60_000;
    const reciente = fichajesMock
      .filter(
        (f) =>
          f.empleadoId === empleado.id &&
          !f.anuladoEn &&
          new Date(f.timestamp).getTime() > limite
      )
      .sort(
        (a, b) =>
          a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id)
      )
      .at(-1);
    if (reciente) return simular(reciente);
  }

  // `opciones.tipo` se ignora: el empleado no elige entrada o salida.
  return ficharAhora(empleado.id, {
    metodo,
    geo: opciones.geo,
    confianza: 0.9,
  });
};

/**
 * Anula un fichaje. En demo no hay roles reales, pero se respeta la
 * regla que sí importa: el motivo es obligatorio y la fila no se borra.
 */
export const anularFichaje = async (
  fichajeId: string,
  motivo: string
): Promise<Fichaje> => {
  if (!motivo.trim()) {
    throw new Error('Hay que decir por qué se anula el fichaje.');
  }
  const f = fichajesMock.find((x) => x.id === fichajeId);
  if (!f) throw new Error('Ese fichaje no existe.');
  if (f.anuladoEn) throw new Error('Ese fichaje ya estaba anulado.');
  f.anuladoEn = new Date().toISOString();
  f.anuladoPor = 'demo';
  f.anuladoMotivo = motivo.trim();
  return simular(f);
};

/** Enrola (o actualiza) el rostro de un empleado con su consentimiento. */
export const enrolarRostro = async (
  empleadoId: string,
  descriptor: number[],
  consentimiento: { aceptado: boolean; texto: string }
): Promise<Empleado | null> => {
  // Misma regla que en Supabase (trigger de la migración 48): sin
  // consentimiento no hay enrolamiento.
  if (!consentimiento.aceptado) {
    throw new Error(
      'No se puede registrar el rostro sin el consentimiento del titular.'
    );
  }
  const empleado = empleadosMock.find((e) => e.id === empleadoId);
  if (empleado) {
    empleado.descriptorFacial = descriptor;
    empleado.descriptorVersion = VERSION_PLANTILLA;
    empleado.consentimientoBiometrico = {
      aceptado: true,
      fecha: hoyISO(),
      otorgadoPor: 'demo',
      texto: consentimiento.texto,
    };
  }
  return simular(empleado ?? null);
};

/** Borra el rostro enrolado de un empleado. */
export const borrarRostro = async (
  empleadoId: string
): Promise<Empleado | null> => {
  const empleado = empleadosMock.find((e) => e.id === empleadoId);
  if (empleado) {
    empleado.descriptorFacial = undefined;
    empleado.consentimientoBiometrico = undefined;
  }
  return simular(empleado ?? null);
};

/** Descriptores de los empleados activos con rostro enrolado (para 1:N). */
export const getDescriptoresFaciales = async (): Promise<DescriptorFacial[]> =>
  simular(
    empleadosMock
      .filter(
        (e) =>
          e.activo &&
          e.empresaId === empresaDemo() &&
          e.descriptorFacial?.length
      )
      .map((e) => ({ empleadoId: e.id, descriptor: e.descriptorFacial! }))
  );

// ---------- Notas internas (solo admins) ----------

export interface NuevaNotaInterna {
  motivo: string;
  observacion?: string;
  autorId: string;
  autorNombre: string;
}

export const getNotasInternas = async (
  empleadoId: string
): Promise<NotaInterna[]> =>
  simular(
    notasInternasMock
      .filter((n) => n.empleadoId === empleadoId)
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
  );

export const agregarNotaInterna = async (
  empleadoId: string,
  datos: NuevaNotaInterna
): Promise<NotaInterna> => {
  const nueva: NotaInterna = {
    id: `nin-${Date.now()}`,
    empleadoId,
    fecha: hoyISO(),
    autorId: datos.autorId,
    autorNombre: datos.autorNombre,
    motivo: datos.motivo,
    observacion: datos.observacion,
  };
  notasInternasMock.unshift(nueva);
  return simular(nueva);
};

export const quitarNotaInterna = async (id: string): Promise<void> => {
  const i = notasInternasMock.findIndex((n) => n.id === id);
  if (i >= 0) notasInternasMock.splice(i, 1);
  return simular(undefined);
};

// ---------- Turnos ----------

export const getTurnos = async (): Promise<Turno[]> =>
  simular(turnosMock.filter((t) => esDeEmpresaDemo(t.empleadoId)));

export const getTurnosDeEmpleado = async (
  empleadoId: string
): Promise<Turno[]> =>
  simular(turnosMock.filter((t) => t.empleadoId === empleadoId));

/** Asigna un turno; si ya había uno ese día para el empleado, lo reemplaza. */
export const asignarTurno = async (datos: NuevoTurno): Promise<Turno> => {
  const existente = turnosMock.find(
    (t) => t.empleadoId === datos.empleadoId && t.fecha === datos.fecha
  );
  if (existente) {
    existente.horaEntrada = datos.horaEntrada;
    existente.horaSalida = datos.horaSalida;
    return simular(existente);
  }
  const nuevo: Turno = { id: `tur-${Date.now()}`, ...datos };
  turnosMock.push(nuevo);
  return simular(nuevo);
};

/** Asigna el mismo horario a varios días (semana/mes) de una. */
export const asignarTurnos = async (lista: NuevoTurno[]): Promise<void> => {
  lista.forEach((datos, i) => {
    const existente = turnosMock.find(
      (t) => t.empleadoId === datos.empleadoId && t.fecha === datos.fecha
    );
    if (existente) {
      existente.horaEntrada = datos.horaEntrada;
      existente.horaSalida = datos.horaSalida;
    } else {
      turnosMock.push({ id: `tur-${Date.now()}-${i}`, ...datos });
    }
  });
  return simular(undefined);
};

/**
 * Aprueba las extras de un día. Si ese día no tenía turno planificado
 * se crea uno con el horario general, igual que en producción: ver el
 * porqué en `aprobarExtrasDeJornada` de `supabase/real.ts`.
 */
export const aprobarExtrasDeJornada = async (
  empleadoId: string,
  fecha: string,
  aprobado: boolean
): Promise<Turno> => {
  const existente = turnosMock.find(
    (t) => t.empleadoId === empleadoId && t.fecha === fecha
  );
  if (existente) {
    existente.extrasAprobadas = aprobado;
    return simular(existente);
  }
  const nuevo: Turno = {
    id: `tur-${Date.now()}`,
    empleadoId,
    fecha,
    horaEntrada: empresaMock.config.horaEntrada,
    horaSalida: empresaMock.config.horaSalida,
    extrasAprobadas: aprobado,
  };
  turnosMock.push(nuevo);
  return simular(nuevo);
};

export const quitarTurno = async (id: string): Promise<void> => {
  const i = turnosMock.findIndex((t) => t.id === id);
  if (i >= 0) turnosMock.splice(i, 1);
  return simular(undefined);
};

/** Todos los fichajes de un empleado (para el control de turnos). */
export const getFichajesDeEmpleado = async (
  empleadoId: string,
  opciones: { desde?: string; hasta?: string } = {}
): Promise<Fichaje[]> =>
  simular(
    fichajesMock.filter(
      (f) =>
        f.empleadoId === empleadoId &&
        // F-12: una marca anulada no ocurrio a efectos de ningun calculo.
        // La real tampoco la devuelve; si la demo lo hiciera, ensenaria un
        // comportamiento que produccion no tiene.
        !f.anuladoEn &&
        (!opciones.desde || diaEmpresa(f.timestamp) >= opciones.desde) &&
        (!opciones.hasta || diaEmpresa(f.timestamp) <= opciones.hasta)
    )
  );

// ---------- Convenio colectivo ----------

const conveniosMock: Convenio[] = [];
const convenioEjemplo: Convenio = {
  id: 'cnv-1',
  empresaId: 'emp-1',
  nombre: 'CCT 130/75 — Empleados de Comercio (ejemplo)',
  contenido: `Artículo 10 - Jornada de trabajo.
La jornada máxima de trabajo será de 8 horas diarias o 48 horas semanales.

Artículo 11 - Horas extras.
Las horas extraordinarias se abonan con un recargo del 50% en días hábiles y del 100% en días sábado después de las 13, domingos y feriados.

Artículo 20 - Vacaciones.
El trabajador gozará de vacaciones anuales según su antigüedad: 14 días corridos hasta 5 años, 21 días de 5 a 10 años, 28 días de 10 a 20 años y 35 días con más de 20 años.

Artículo 25 - Licencias especiales.
Por nacimiento de hijo: 2 días corridos. Por matrimonio: 10 días corridos. Por fallecimiento de cónyuge, hijos o padres: 3 días corridos. Por fallecimiento de hermano: 1 día. Por examen: 2 días corridos por examen, con máximo de 10 al año.

Artículo 30 - Categorías.
Las categorías del personal son: Maestranza, Administrativo, Cajero, Vendedor y Auxiliar especializado, según las tareas efectivamente desempeñadas.`,
  actualizadoEn: hoyISO(),
};
conveniosMock.push(convenioEjemplo);

// ---------- Terminales de fichaje ----------

const terminalesMock: Terminal[] = [];

export const getTerminales = async (): Promise<Terminal[]> =>
  simular([...terminalesMock]);

/**
 * En demo el secreto es de mentira y no protege nada: la demo no tiene
 * backend contra el cual validarlo. Se devuelve igual para que el flujo
 * de la pantalla —autorizar, guardar la credencial, entrar al kiosco—
 * sea el mismo que en producción y no haya un camino que sólo se
 * ejercite contra la base real.
 */
export const autorizarTerminal = async (
  nombre: string
): Promise<{ terminal: Terminal; secreto: string }> => {
  const nueva: Terminal = {
    id: `term-${Date.now()}`,
    empresaId: 'emp-1',
    nombre,
    activa: true,
    creadoEn: hoyISO(),
  };
  terminalesMock.push(nueva);
  return simular({ terminal: nueva, secreto: `demo-${nueva.id}` });
};

export const setTerminalActiva = async (
  id: string,
  activa: boolean
): Promise<void> => {
  const t = terminalesMock.find((x) => x.id === id);
  if (t) t.activa = activa;
  return simular(undefined);
};

export const quitarTerminal = async (id: string): Promise<void> => {
  const i = terminalesMock.findIndex((t) => t.id === id);
  if (i >= 0) terminalesMock.splice(i, 1);
  return simular(undefined);
};

// ---------- Convenio colectivo ----------

export const getConvenios = async (): Promise<Convenio[]> =>
  simular(
    conveniosMock
      .filter((c) => c.empresaId === empresaDemo())
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
  );

export const crearConvenio = async (
  datos: NuevoConvenio
): Promise<Convenio> => {
  const nuevo: Convenio = {
    id: `cnv-${Date.now()}`,
    empresaId: empresaDemo(),
    nombre: datos.nombre,
    contenido: datos.contenido,
    actualizadoEn: hoyISO(),
  };
  conveniosMock.push(nuevo);
  return simular(nuevo);
};

export const actualizarConvenio = async (
  id: string,
  datos: NuevoConvenio
): Promise<Convenio> => {
  const convenio = conveniosMock.find((c) => c.id === id);
  if (!convenio) throw new Error('Convenio inexistente.');
  convenio.nombre = datos.nombre;
  convenio.contenido = datos.contenido;
  convenio.actualizadoEn = hoyISO();
  return simular(convenio);
};

export const eliminarConvenio = async (id: string): Promise<void> => {
  const i = conveniosMock.findIndex((c) => c.id === id);
  if (i >= 0) conveniosMock.splice(i, 1);
  await simular(undefined);
};

// ---------- Alertas, agenda y notificaciones ----------

export const getAlertas = async (): Promise<Alerta[]> =>
  simular(
    alertasMock.filter(
      (a) => a.estado !== 'resuelta' && a.empresaId === empresaDemo()
    )
  );

export const getEventosProximos = async (): Promise<EventoAgenda[]> =>
  simular(
    eventosMock
      .filter((e) => e.empresaId === empresaDemo() && e.fecha >= hoyISO())
      .sort((a, b) => a.fecha.localeCompare(b.fecha))
  );

export const getNotificaciones = async (
  usuarioId: string
): Promise<Notificacion[]> =>
  simular(notificacionesMock.filter((n) => n.usuarioId === usuarioId));

// ---------- Reportes de control ----------

export const getResumenControl = async (
  empresaIdOverride?: string
): Promise<ResumenControl> => {
  const empresa = empresaDemo(empresaIdOverride);
  const activos = empleadosMock.filter(
    (e) => e.activo && e.empresaId === empresa
  );

  const porEmpleado = activos
    .map((e) => {
      const jornadas = jornadasMock.filter((j) => j.empleadoId === e.id);
      return {
        empleadoId: e.id,
        nombreCompleto: `${e.nombre} ${e.apellido}`,
        llegadasTarde: jornadas.filter((j) => j.llegadaTardeMin > 0).length,
        minutosTarde: jornadas.reduce((acc, j) => acc + j.llegadaTardeMin, 0),
        horasExtras: jornadas.reduce((acc, j) => acc + j.horasExtras, 0),
        jornadasIncompletas: jornadas.filter((j) => j.incompleta).length,
      };
    })
    .sort((a, b) => b.minutosTarde - a.minutosTarde);

  // Ausentismo del mes en curso: días aprobados / días-persona hábiles (aprox 22)
  // Mes de negocio, no el de UTC: ver `mesEmpresa` y el comentario en la
  // implementacion real.
  const mesActual = mesEmpresa();
  const diasAusencia = ausenciasMock
    .filter(
      (a) =>
        a.estado === 'aprobada' &&
        a.fechaDesde.startsWith(mesActual) &&
        esDeEmpresaDemo(a.empleadoId, empresaIdOverride)
    )
    .reduce((acc, a) => acc + a.dias, 0);
  const diasPersona = activos.length * 22;

  return simular({
    ausentismoPct:
      diasPersona > 0
        ? Math.round((diasAusencia / diasPersona) * 1000) / 10
        : 0,
    llegadasTardeTotal: porEmpleado.reduce(
      (acc, e) => acc + e.llegadasTarde,
      0
    ),
    horasExtrasTotal: porEmpleado.reduce((acc, e) => acc + e.horasExtras, 0),
    jornadasIncompletas: porEmpleado.reduce(
      (acc, e) => acc + e.jornadasIncompletas,
      0
    ),
    recibosSinFirmar: recibosMock.filter(
      (r) =>
        r.estadoFirma === 'pendiente' &&
        esDeEmpresaDemo(r.empleadoId, empresaIdOverride)
    ).length,
    porEmpleado,
  });
};

export interface MiMes {
  horasTrabajadas: number;
  horasExtras: number;
  llegadasTarde: number;
  minutosTarde: number;
}

/** Estadísticas personales del empleado (sus propias jornadas) */
export const getMiMes = async (empleadoId: string): Promise<MiMes> => {
  const jornadas = jornadasMock.filter((j) => j.empleadoId === empleadoId);
  return simular({
    horasTrabajadas:
      Math.round(jornadas.reduce((acc, j) => acc + j.horasTrabajadas, 0) * 10) /
      10,
    horasExtras: jornadas.reduce((acc, j) => acc + j.horasExtras, 0),
    llegadasTarde: jornadas.filter((j) => j.llegadaTardeMin > 0).length,
    minutosTarde: jornadas.reduce((acc, j) => acc + j.llegadaTardeMin, 0),
  });
};

export interface HorasExtrasPeriodo {
  /** Horas fuera de horario detectadas en el período. */
  detectadas: number;
  /**
   * De esas, las que el supervisor aprobó en Turnos.
   *
   * Es lo único que se ofrece sumar al bruto: aprobar las extras es una
   * decisión de quien supervisa, no del reloj. Las detectadas se
   * muestran igual para que se vea la diferencia — si no, un cero
   * pelado se lee como "no hizo extras" cuando en realidad son
   * "todavía nadie las aprobó".
   */
  aprobadas: number;
}

/**
 * Horas extras de un período (YYYY-MM), para sugerirlas al liquidar.
 * El mock no tiene jornadas de varios meses, así que devuelve las que
 * hay; en Supabase sí se filtra por el rango real del mes.
 */
export const getHorasExtrasDelPeriodo = async (
  empleadoId: string,
  periodo: string
): Promise<HorasExtrasPeriodo> => {
  const jornadas = jornadasMock.filter(
    (j) => j.empleadoId === empleadoId && j.fecha.startsWith(periodo)
  );
  const detectadas =
    Math.round(jornadas.reduce((acc, j) => acc + j.horasExtras, 0) * 10) / 10;
  // El mock no modela la aprobación por turno: las da todas por aprobadas
  // para que la pantalla de demo muestre el flujo completo.
  return simular({ detectadas, aprobadas: detectadas });
};

// ---------- Remuneraciones y recibos ----------

export const getRemuneraciones = async (
  empleadoId: string
): Promise<Remuneracion[]> =>
  simular(remuneracionesMock.filter((r) => r.empleadoId === empleadoId));

/** Todas las remuneraciones de la empresa (vista admin). */
export const getRemuneracionesTodas = async (): Promise<Remuneracion[]> =>
  simular(remuneracionesMock.filter((r) => esDeEmpresaDemo(r.empleadoId)));

/** Carga o actualiza la remuneración de un empleado para un período. */
export const cargarRemuneracion = async (
  datos: NuevaRemuneracion
): Promise<Remuneracion> => {
  const { aportes, neto } = calcularLiquidacion(datos);
  const tipo = datos.tipo ?? 'mensual';
  const existente = remuneracionesMock.find(
    (r) =>
      r.empleadoId === datos.empleadoId &&
      r.periodo === datos.periodo &&
      (r.tipo ?? 'mensual') === tipo
  );
  if (existente) {
    Object.assign(existente, {
      montoBruto: datos.montoBruto,
      noRemunerativo: datos.noRemunerativo,
      otrosDescuentos: datos.otrosDescuentos,
      convenio: datos.convenio,
      aportes,
      montoNeto: neto,
    });
    return simular(existente);
  }
  const nueva: Remuneracion = {
    id: `rem-${Date.now()}`,
    empleadoId: datos.empleadoId,
    periodo: datos.periodo,
    tipo,
    montoBruto: datos.montoBruto,
    noRemunerativo: datos.noRemunerativo,
    otrosDescuentos: datos.otrosDescuentos,
    convenio: datos.convenio,
    aportes,
    montoNeto: neto,
  };
  remuneracionesMock.push(nueva);
  return simular(nueva);
};

export const getRecibos = async (empleadoId: string): Promise<ReciboSueldo[]> =>
  simular(
    recibosMock.filter(
      (r) => r.empleadoId === empleadoId && r.firmadoEmpleadorEn
    )
  );

export const getRecibosTodos = async (): Promise<ReciboSueldo[]> =>
  simular(recibosMock.filter((r) => esDeEmpresaDemo(r.empleadoId)));

// En la demo no se rectifica nada, así que no hay versiones archivadas.
// Existen para que la pantalla funcione igual con datos de ejemplo.
export const getRecibosArchivados = async (
  empleadoId: string
): Promise<ReciboSueldo[]> =>
  simular(
    recibosMock.filter((r) => r.empleadoId === empleadoId && r.archivadoEn)
  );

export const getRecibosArchivadosTodos = async (): Promise<ReciboSueldo[]> =>
  simular(
    recibosMock.filter((r) => esDeEmpresaDemo(r.empleadoId) && r.archivadoEn)
  );

export const firmarRecibo = async (
  reciboId: string
): Promise<ReciboSueldo | null> => {
  const recibo = recibosMock.find((r) => r.id === reciboId);
  if (recibo && recibo.estadoFirma === 'pendiente') {
    recibo.estadoFirma = 'firmado';
    recibo.firmadoEn = hoyISO();
  }
  return simular(recibo ?? null);
};

// ---------- Agenda ----------

export interface NuevoEvento {
  titulo: string;
  tipo: EventoAgenda['tipo'];
  fecha: string;
  descripcion?: string;
}

export const crearEvento = async (
  datos: NuevoEvento
): Promise<EventoAgenda> => {
  const nuevo: EventoAgenda = {
    id: `eve-${Date.now()}`,
    empresaId: empresaDemo(),
    ...datos,
  };
  eventosMock.push(nuevo);
  return simular(nuevo);
};

// ---------- Configuración ----------

export const actualizarConfigEmpresa = async (
  config: Empresa['config']
): Promise<Empresa> => {
  empresaMock.config = { ...config };
  return simular(empresaMock);
};

// ---------- Archivos (demo: sin storage real) ----------

const avisarReciboDisponible = (empleadoId: string) => {
  const usuario = usuariosMock.find((u) => u.empleadoId === empleadoId);
  if (usuario) {
    notificacionesMock.unshift({
      id: `not-${Date.now()}`,
      usuarioId: usuario.id,
      tipo: 'recibo_disponible',
      titulo: 'Recibo de sueldo disponible',
      cuerpo: 'Ya podés verlo y firmarlo desde la sección Recibos.',
      link: '/recibos',
      leida: false,
      creadaEn: new Date().toISOString(),
    });
  }
};

export const cargarRecibo = async (
  empleadoId: string,
  periodo: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _archivo: File,
  publicar = true,
  tipo: TipoRecibo = 'mensual'
): Promise<ReciboSueldo> => {
  const nuevo: ReciboSueldo = {
    id: `rec-${Date.now()}`,
    empleadoId,
    periodo,
    tipo,
    archivoUrl: `/recibos/${empleadoId}/${periodo}-${tipo}.pdf`,
    estadoFirma: 'pendiente',
    firmadoEmpleadorEn: publicar ? hoyISO() : undefined,
  };
  recibosMock.push(nuevo);
  if (publicar) avisarReciboDisponible(empleadoId);
  return simular(nuevo);
};

/** Firma del empleador: publica el recibo para el empleado. */
export const firmarReciboEmpleador = async (
  reciboId: string
): Promise<ReciboSueldo> => {
  const recibo = recibosMock.find((r) => r.id === reciboId);
  if (!recibo) throw new Error('Recibo inexistente.');
  recibo.firmadoEmpleadorEn = hoyISO();
  avisarReciboDisponible(recibo.empleadoId);
  return simular(recibo);
};

// ---------- Descuentos recurrentes ----------

export const getDescuentosRecurrentes = async (
  empleadoId: string
): Promise<DescuentoRecurrente[]> =>
  simular(descuentosRecurrentesMock.filter((d) => d.empleadoId === empleadoId));

export const eliminarDescuentoRecurrente = async (
  id: string
): Promise<void> => {
  const i = descuentosRecurrentesMock.findIndex((d) => d.id === id);
  if (i >= 0) descuentosRecurrentesMock.splice(i, 1);
  await simular(undefined);
};

// ---------- Adelantos ----------

export const getAdelantos = async (empleadoId?: string): Promise<Adelanto[]> =>
  simular(
    adelantosMock.filter((a) => !empleadoId || a.empleadoId === empleadoId)
  );

export const solicitarAdelanto = async (
  empleadoId: string,
  monto: number,
  motivo?: string
): Promise<Adelanto> => {
  const nuevo: Adelanto = {
    id: `ade-${Date.now()}`,
    empleadoId,
    monto,
    motivo: motivo?.trim() || undefined,
    estado: 'pendiente',
    creadoEn: hoyISO(),
  };
  adelantosMock.unshift(nuevo);

  // Avisar a los gestores que hay un pedido para resolver.
  const empleado = empleadosMock.find((e) => e.id === empleadoId);
  usuariosMock
    .filter((u) => u.rol === 'admin_rrhh' || u.rol === 'supervisor')
    .forEach((u) =>
      notificacionesMock.unshift({
        id: `not-${Date.now()}-${u.id}`,
        usuarioId: u.id,
        tipo: 'adelanto_solicitado',
        titulo: 'Pedido de adelanto',
        cuerpo: `${empleado ? `${empleado.nombre} ${empleado.apellido}` : 'Un colaborador'} pidió un adelanto de $${monto.toLocaleString('es-AR')}.`,
        link: '/remuneraciones',
        leida: false,
        creadaEn: new Date().toISOString(),
      })
    );

  return simular(nuevo);
};

export const eliminarAdelanto = async (adelantoId: string): Promise<void> => {
  const i = adelantosMock.findIndex((a) => a.id === adelantoId);
  if (i >= 0) adelantosMock.splice(i, 1);
};

export const resolverAdelanto = async (
  adelantoId: string,
  aprobar: boolean,
  periodo?: string
): Promise<Adelanto> => {
  const adelanto = adelantosMock.find((a) => a.id === adelantoId);
  if (!adelanto) throw new Error('Adelanto inexistente.');
  adelanto.estado = aprobar ? 'aprobado' : 'rechazado';
  adelanto.periodo = aprobar ? (periodo ?? hoyISO().slice(0, 7)) : undefined;
  adelanto.resueltoEn = hoyISO();

  // Avisar al empleado.
  const usuario = usuariosMock.find(
    (u) => u.empleadoId === adelanto.empleadoId
  );
  if (usuario) {
    notificacionesMock.unshift({
      id: `not-${Date.now()}`,
      usuarioId: usuario.id,
      tipo: 'adelanto_resuelto',
      titulo: aprobar ? 'Adelanto aprobado' : 'Adelanto rechazado',
      cuerpo: aprobar
        ? `Te aprobaron un adelanto de $${adelanto.monto.toLocaleString('es-AR')}.`
        : 'Tu pedido de adelanto fue rechazado. Consultá con RRHH.',
      link: '/remuneraciones',
      leida: false,
      creadaEn: new Date().toISOString(),
    });
  }

  return simular(adelanto);
};

/** Marca como leídas todas las notificaciones del usuario. */
export const marcarNotificacionesLeidas = async (
  usuarioId: string
): Promise<void> => {
  notificacionesMock.forEach((n) => {
    if (n.usuarioId === usuarioId) n.leida = true;
  });
  return simular(undefined);
};

export const abrirRecibo = async (recibo: ReciboSueldo): Promise<string> =>
  simular(recibo.archivoUrl);

export const abrirDocumento = async (doc: DocumentoLegajo): Promise<string> =>
  simular(doc.archivoUrl);

// ---------- Finanzas (superadmin) ----------

const periodoDe = (fechaISO: string): string => fechaISO.slice(0, 7);

export const getMovimientos = async (
  periodo?: string
): Promise<MovimientoFinanciero[]> => {
  const lista = periodo
    ? movimientosMock.filter((m) => m.periodo === periodo)
    : [...movimientosMock];
  return simular([...lista].sort((a, b) => (a.fecha < b.fecha ? 1 : -1)));
};

export const crearMovimiento = async (
  datos: NuevoMovimiento
): Promise<MovimientoFinanciero> => {
  const nuevo: MovimientoFinanciero = {
    id: `mov-${Date.now()}`,
    tipo: datos.tipo,
    concepto: datos.concepto,
    categoria: datos.categoria,
    empresaId: datos.empresaId,
    monto: datos.monto,
    fecha: datos.fecha,
    periodo: periodoDe(datos.fecha),
  };
  movimientosMock.push(nuevo);
  return simular(nuevo);
};

export const eliminarMovimiento = async (id: string): Promise<void> => {
  const i = movimientosMock.findIndex((m) => m.id === id);
  if (i >= 0) movimientosMock.splice(i, 1);
  return simular(undefined);
};

export const actualizarAbonoEmpresa = async (
  empresaId: string,
  abonoMensual: number
): Promise<Empresa | null> => {
  const empresa = empresasMock.find((e) => e.id === empresaId);
  if (empresa) empresa.abonoMensual = abonoMensual;
  return simular(empresa ?? null);
};

export const getResumenFinanzas = async (
  periodo: string
): Promise<ResumenFinanzas> => {
  const delMes = movimientosMock.filter((m) => m.periodo === periodo);
  const ingresosDelMes = delMes
    .filter((m) => m.tipo === 'ingreso')
    .reduce((a, m) => a + m.monto, 0);
  const gastosDelMes = delMes
    .filter((m) => m.tipo === 'gasto')
    .reduce((a, m) => a + m.monto, 0);

  const activas = empresasMock.filter((e) => e.estado === 'activa');
  const facturacion: FacturacionEmpresa[] = empresasMock.map((e) => {
    const cobradoEnPeriodo = delMes
      .filter((m) => m.tipo === 'ingreso' && m.empresaId === e.id)
      .reduce((a, m) => a + m.monto, 0);
    const abonoMensual = e.abonoMensual ?? 0;
    return {
      empresaId: e.id,
      nombre: e.nombre,
      estado: e.estado,
      empleados: empleadosActivosDe(e.id),
      abonoMensual,
      cobradoEnPeriodo,
      alDia: abonoMensual === 0 || cobradoEnPeriodo >= abonoMensual,
    };
  });

  const cobrables = facturacion.filter(
    (f) => f.estado === 'activa' && f.abonoMensual > 0
  );

  return simular({
    periodo,
    ingresosDelMes,
    gastosDelMes,
    neto: ingresosDelMes - gastosDelMes,
    mrr: activas.reduce((a, e) => a + (e.abonoMensual ?? 0), 0),
    empresasAlDia: cobrables.filter((f) => f.alDia).length,
    empresasVencidas: cobrables.filter((f) => !f.alDia).length,
    facturacion,
  });
};

// ---------- Extensiones features cliente (demo) ----------

const facturasMonoMock: FacturaMonotributo[] = [];
const cuposLicenciaMock: CupoLicencia[] = [];
const comunicacionesMock: Comunicacion[] = [];
const mensajesComMock: ComunicacionMensaje[] = [];
const docsFirmaMock: DocumentoFirma[] = [];
const docsFirmaDestMock: DocumentoFirmaDestinatario[] = [];

export const eliminarRecibo = async (reciboId: string): Promise<void> => {
  const i = recibosMock.findIndex((r) => r.id === reciboId);
  if (i >= 0) recibosMock.splice(i, 1);
  return simular(undefined);
};

export const eliminarRemuneracion = async (id: string): Promise<void> => {
  const i = remuneracionesMock.findIndex((r) => r.id === id);
  if (i >= 0) remuneracionesMock.splice(i, 1);
  return simular(undefined);
};

export const crearDescuentoRecurrente = async (
  empleadoId: string,
  concepto: string,
  monto: number,
  modo: 'monto' | 'porcentaje' = 'monto',
  porcentaje?: number
): Promise<DescuentoRecurrente> => {
  const nuevo: DescuentoRecurrente = {
    id: `dsc-${Date.now()}`,
    empleadoId,
    concepto,
    monto: modo === 'monto' ? monto : 0,
    modo,
    porcentaje: modo === 'porcentaje' ? (porcentaje ?? monto) : undefined,
  };
  descuentosRecurrentesMock.push(nuevo);
  return simular(nuevo);
};

export const getFacturasMonotributo = async (
  empleadoId: string
): Promise<FacturaMonotributo[]> =>
  simular(facturasMonoMock.filter((f) => f.empleadoId === empleadoId));

export const cargarFacturaMonotributo = async (
  empleadoId: string,
  periodo: string,
  monto: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _archivo?: File,
  aCargoEmpresa = false
): Promise<FacturaMonotributo> => {
  const existente = facturasMonoMock.find(
    (f) => f.empleadoId === empleadoId && f.periodo === periodo
  );
  if (existente) {
    existente.monto = monto;
    existente.aCargoEmpresa = aCargoEmpresa;
    return simular(existente);
  }
  const nueva: FacturaMonotributo = {
    id: `fm-${Date.now()}`,
    empleadoId,
    periodo,
    monto,
    aCargoEmpresa,
    creadoEn: hoyISO(),
  };
  facturasMonoMock.push(nueva);
  return simular(nueva);
};

/** En la demo no se guardan archivos, así que no hay nada que abrir. */
export const abrirFacturaMonotributo = async (
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _factura: FacturaMonotributo
): Promise<string | null> => simular(null);

export const eliminarFacturaMonotributo = async (id: string): Promise<void> => {
  const i = facturasMonoMock.findIndex((f) => f.id === id);
  if (i >= 0) facturasMonoMock.splice(i, 1);
  return simular(undefined);
};

export const getCuposLicencia = async (): Promise<CupoLicencia[]> =>
  simular([...cuposLicenciaMock]);

export const guardarCupoLicencia = async (
  tipo: TipoAusencia,
  diasAnuales: number
): Promise<CupoLicencia> => {
  const existente = cuposLicenciaMock.find((c) => c.tipo === tipo);
  if (existente) {
    existente.diasAnuales = diasAnuales;
    return simular(existente);
  }
  const nuevo: CupoLicencia = {
    id: `cupo-${Date.now()}`,
    empresaId: empresaDemo(),
    tipo,
    diasAnuales,
  };
  cuposLicenciaMock.push(nuevo);
  return simular(nuevo);
};

export const getSaldosLicencia = async (
  empleadoId: string,
  anio: number
): Promise<SaldoLicencia[]> => {
  const ausencias = ausenciasMock.filter((a) => a.empleadoId === empleadoId);
  return simular(
    cuposLicenciaMock.map((c) => {
      const usados = ausencias
        .filter(
          (a) =>
            a.tipo === c.tipo &&
            a.estado === 'aprobada' &&
            a.fechaDesde.startsWith(String(anio))
        )
        .reduce((acc, a) => acc + a.dias, 0);
      return {
        tipo: c.tipo,
        diasAnuales: c.diasAnuales,
        diasUtilizados: usados,
        diasDisponibles: Math.max(0, c.diasAnuales - usados),
      };
    })
  );
};

export const getComunicaciones = async (): Promise<Comunicacion[]> =>
  simular(
    comunicacionesMock
      .filter((c) => c.empresaId === empresaDemo())
      .sort((a, b) => b.actualizadoEn.localeCompare(a.actualizadoEn))
  );

export const getComunicacionesDeEmpleado = async (
  empleadoId: string
): Promise<Comunicacion[]> =>
  simular(comunicacionesMock.filter((c) => c.empleadoId === empleadoId));

export const crearComunicacion = async (datos: {
  empleadoId: string;
  tipo: TipoComunicacion;
  asunto: string;
  cuerpo: string;
}): Promise<Comunicacion> => {
  const nueva: Comunicacion = {
    id: `com-${Date.now()}`,
    empresaId: empresaDemo(),
    empleadoId: datos.empleadoId,
    autorId: usuarioActualId(),
    tipo: datos.tipo,
    asunto: datos.asunto,
    cuerpo: datos.cuerpo,
    estado: 'abierta',
    creadoEn: hoyISO(),
    actualizadoEn: hoyISO(),
  };
  comunicacionesMock.unshift(nueva);
  tocarComunicacionDemo(nueva.id);
  // Lo que acabás de escribir no es novedad para vos.
  await marcarComunicacionLeida(nueva.id);
  return simular(nueva);
};

/**
 * En demo no hay servidor que empuje nada: los mensajes los escribe el
 * mismo navegador. Se devuelve una baja vacía para que la pantalla no
 * tenga que preguntar en qué modo está.
 */
export const suscribirMensajes = (): (() => void) => () => {};

export const getMensajesComunicacion = async (
  comunicacionId: string
): Promise<ComunicacionMensaje[]> =>
  simular(mensajesComMock.filter((m) => m.comunicacionId === comunicacionId));

/** En la demo no se registran errores. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const getErroresApp = async (_limite = 100): Promise<ErrorApp[]> =>
  simular([]);

/** En la demo no se registra auditoría (no hay múltiples usuarios reales operando). */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const getAuditoria = async (_limite = 50): Promise<AccionAuditoria[]> =>
  simular([]);

// ---------- Feriados (demo) ----------

const feriadosMock: Feriado[] = [];

/** Nacionales del año se cargan solos, como en prod vía RPC. */
const asegurarFeriadosDemo = (anios: number[]) => {
  const eid = empresaDemo();
  for (const a of anios) {
    for (const n of feriadosSugeridos(a)) {
      if (
        feriadosMock.some((f) => f.fecha === n.fecha && f.empresaId === eid)
      ) {
        continue;
      }
      feriadosMock.push({
        ...n,
        id: `fer-auto-${n.fecha}`,
        empresaId: eid,
      });
    }
  }
};

export const getFeriados = async (anio?: number): Promise<Feriado[]> => {
  const anios = aniosFeriadosAsegurar(anio);
  asegurarFeriadosDemo(anios);
  return simular(
    feriadosMock
      .filter((f) => !anio || f.fecha.startsWith(String(anio)))
      .sort((a, b) => (a.fecha < b.fecha ? -1 : 1))
  );
};

export const guardarFeriados = async (
  nuevos: NuevoFeriado[]
): Promise<Feriado[]> => {
  const agregados = nuevos
    .filter((n) => !feriadosMock.some((f) => f.fecha === n.fecha))
    .map((n, i) => ({
      ...n,
      id: `fer-${Date.now()}-${i}`,
      empresaId: empresaDemo(),
    }));
  feriadosMock.push(...agregados);
  return simular(agregados);
};

export const eliminarFeriado = async (feriadoId: string): Promise<void> => {
  const i = feriadosMock.findIndex((f) => f.id === feriadoId);
  if (i >= 0) feriadosMock.splice(i, 1);
  return simular(undefined);
};

/**
 * Lectura y actividad de la demo, en instantes completos.
 *
 * `Comunicacion.actualizadoEn` es una fecha sin hora (así viaja a las
 * pantallas), y comparar una fecha contra un instante para decidir si
 * algo está sin leer da resultados arbitrarios dentro del mismo día.
 * Estos dos mapas guardan la hora exacta, que es lo que en producción
 * fecha el servidor.
 */
const lecturasMock = new Map<string, string>();
const actividadMock = new Map<string, string>();

/** Marca actividad en la conversación: la vuelve "sin leer" para el resto. */
const tocarComunicacionDemo = (comunicacionId: string) => {
  actividadMock.set(comunicacionId, new Date().toISOString());
};

export const marcarComunicacionLeida = async (
  comunicacionId: string
): Promise<void> => {
  lecturasMock.set(comunicacionId, new Date().toISOString());
};

/** Conversaciones que este usuario todavía no miró, con su alcance. */
const sinLeerDemo = (): Comunicacion[] => {
  const usuario = useAuthStore.getState().usuario;
  const esGestor =
    usuario?.rol === 'admin_rrhh' ||
    usuario?.rol === 'supervisor' ||
    usuario?.rol === 'superadmin';
  return comunicacionesMock.filter((c) => {
    // El colaborador cuenta las suyas; el gestor, las de la empresa.
    if (
      esGestor
        ? c.empresaId !== empresaDemo()
        : c.empleadoId !== usuario?.empleadoId
    ) {
      return false;
    }
    const leido = lecturasMock.get(c.id);
    const actividad = actividadMock.get(c.id) ?? c.actualizadoEn;
    return !leido || leido < actividad;
  });
};

export const getComunicacionesSinLeer = async (): Promise<string[]> =>
  simular(sinLeerDemo().map((c) => c.id));

export const responderComunicacion = async (
  comunicacionId: string,
  cuerpo: string
): Promise<ComunicacionMensaje> => {
  const msg: ComunicacionMensaje = {
    id: `msg-${Date.now()}`,
    comunicacionId,
    autorId: usuarioActualId(),
    cuerpo,
    creadoEn: new Date().toISOString(),
  };
  mensajesComMock.push(msg);
  const com = comunicacionesMock.find((c) => c.id === comunicacionId);
  if (com && com.estado === 'abierta') com.estado = 'en_curso';
  if (com) com.actualizadoEn = hoyISO();
  tocarComunicacionDemo(comunicacionId);
  await marcarComunicacionLeida(comunicacionId);
  return simular(msg);
};

export const cerrarComunicacion = async (
  comunicacionId: string
): Promise<void> => {
  const com = comunicacionesMock.find((c) => c.id === comunicacionId);
  if (com) {
    com.estado = 'cerrada';
    com.actualizadoEn = hoyISO();
  }
  tocarComunicacionDemo(comunicacionId);
  // Para quien cierra no es novedad: si no, cerrar te dejaba a vos mismo
  // un "sin leer" que no se iba.
  await marcarComunicacionLeida(comunicacionId);
  return simular(undefined);
};

export const getDocumentosFirma = async (): Promise<
  (DocumentoFirma & { pendientes: number; firmados: number })[]
> =>
  simular(
    docsFirmaMock
      .filter((d) => d.empresaId === empresaDemo())
      .map((d) => {
        const dest = docsFirmaDestMock.filter((x) => x.documentoId === d.id);
        return {
          ...d,
          firmados: dest.filter((x) => x.firmadoEn).length,
          pendientes: dest.filter((x) => !x.firmadoEn).length,
        };
      })
  );

export const getDestinatariosDocumento = async (
  documentoId: string
): Promise<DocumentoFirmaDestinatario[]> =>
  simular(docsFirmaDestMock.filter((d) => d.documentoId === documentoId));

export const getDocumentosFirmaPendientes = async (
  empleadoId: string
): Promise<(DocumentoFirma & { destinatarioId: string })[]> => {
  const dest = docsFirmaDestMock.filter(
    (d) => d.empleadoId === empleadoId && !d.firmadoEn
  );
  return simular(
    dest
      .map((d) => {
        const doc = docsFirmaMock.find((x) => x.id === d.documentoId);
        return doc ? { ...doc, destinatarioId: d.id } : null;
      })
      .filter((x): x is DocumentoFirma & { destinatarioId: string } => !!x)
  );
};

export const crearDocumentoFirma = async (datos: {
  titulo: string;
  descripcion?: string;
  archivo: File;
  empleadoIds: string[];
}): Promise<DocumentoFirma> => {
  const doc: DocumentoFirma = {
    id: `df-${Date.now()}`,
    empresaId: empresaDemo(),
    titulo: datos.titulo,
    descripcion: datos.descripcion,
    archivoUrl: datos.archivo.name,
    creadoEn: hoyISO(),
  };
  docsFirmaMock.unshift(doc);
  datos.empleadoIds.forEach((empleadoId) => {
    docsFirmaDestMock.push({
      id: `dfd-${Date.now()}-${empleadoId}`,
      documentoId: doc.id,
      empleadoId,
    });
  });
  return simular(doc);
};

export const firmarDocumento = async (
  destinatarioId: string
): Promise<void> => {
  const d = docsFirmaDestMock.find((x) => x.id === destinatarioId);
  if (d) d.firmadoEn = hoyISO();
  return simular(undefined);
};

export const abrirDocumentoFirma = async (
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _doc: DocumentoFirma
): Promise<string> => simular('#');

export const eliminarDocumentoFirma = async (
  documentoId: string
): Promise<void> => {
  const i = docsFirmaMock.findIndex((d) => d.id === documentoId);
  if (i >= 0) docsFirmaMock.splice(i, 1);
  // En la base los destinatarios cascadean; acá se limpian a mano.
  for (let j = docsFirmaDestMock.length - 1; j >= 0; j -= 1) {
    if (docsFirmaDestMock[j].documentoId === documentoId) {
      docsFirmaDestMock.splice(j, 1);
    }
  }
  return simular(undefined);
};

export const getPendientesResumen = async (): Promise<PendientesResumen> => {
  const recibosPorFirmar = recibosMock.filter(
    (r) => r.estadoFirma === 'pendiente' && r.firmadoEmpleadorEn
  ).length;
  const ausenciasPorResolver = ausenciasMock.filter(
    (a) => a.estado === 'pendiente'
  ).length;
  const comunicacionesSinLeer = sinLeerDemo().length;
  const documentosPorFirmar = docsFirmaDestMock.filter(
    (d) => !d.firmadoEn
  ).length;
  return simular({
    recibosPorFirmar,
    ausenciasPorResolver,
    comunicacionesSinLeer,
    documentosPorFirmar,
    total:
      recibosPorFirmar +
      ausenciasPorResolver +
      comunicacionesSinLeer +
      documentosPorFirmar,
  });
};
