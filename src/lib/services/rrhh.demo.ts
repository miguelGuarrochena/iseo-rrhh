/**
 * Capa de servicios. Hoy lee mocks con una latencia simulada;
 * en la fase de back se reemplaza la implementación por Supabase
 * sin tocar las pantallas.
 */
import {
  Alerta,
  Ausencia,
  ConfigPlataforma,
  Convenio,
  DatosEmpresaCliente,
  DescriptorFacial,
  DocumentoLegajo,
  Empleado,
  Empresa,
  EmpresaResumen,
  EventoAgenda,
  Fichaje,
  FacturacionEmpresa,
  MetricasGlobales,
  MovimientoFinanciero,
  NuevoMovimiento,
  ResumenFinanzas,
  NotaInterna,
  Adelanto,
  DescuentoRecurrente,
  NuevaRemuneracion,
  NuevoConvenio,
  NuevoTurno,
  OpcionesFichaje,
  Notificacion,
  NuevaEmpresa,
  Terminal,
  Turno,
  ReciboSueldo,
  Remuneracion,
  ResumenControl,
  SaldoVacaciones,
  Usuario,
  VacacionSector,
} from '@/types/rrhh';
import { diasVacacionesPorAntiguedad } from '@/lib/vacaciones';
import { calcularLiquidacion } from '@/lib/remuneraciones';
import { diasEntre, hoyISO } from '@/lib/fechas';
import { supabase, supabaseConfigurado } from '@/lib/supabase/cliente';
import { empresaOperativaId } from '@/lib/auth/store';
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

export const getEmpresa = async (): Promise<Empresa> =>
  simular(empresasMock.find((e) => e.id === empresaDemo()) ?? empresaMock);

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
    creadaEn: new Date().toISOString().slice(0, 10),
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
const empresaDemo = (): string => empresaOperativaId() ?? 'emp-1';

/** true si el empleado pertenece a la empresa activa. */
const esDeEmpresaDemo = (empleadoId: string): boolean =>
  empleadosMock.some(
    (e) => e.id === empleadoId && e.empresaId === empresaDemo()
  );

const sinBiometria = (empleado: Empleado): Empleado => {
  const { descriptorFacial, consentimientoBiometrico, ...resto } = empleado;
  void descriptorFacial;
  void consentimientoBiometrico;
  return { ...resto };
};

export const getEmpleados = async (): Promise<Empleado[]> =>
  simular(
    empleadosMock
      .filter((e) => e.activo && e.empresaId === empresaDemo())
      .map(sinBiometria)
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
  fechaNacimiento?: string;
  estadoCivil?: Empleado['estadoCivil'];
  nivelEstudios?: Empleado['nivelEstudios'];
  domicilio?: string;
  telefono?: string;
  email?: string;
  contactoEmergencia?: Empleado['contactoEmergencia'];
  // Datos de pago opcionales
  modalidadPago?: Empleado['modalidadPago'];
  banco?: string;
  cbu?: string;
  obraSocial?: string;
  art?: string;
  convenio?: string;
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
    grupoFamiliar: [],
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
  return simular(nuevo);
};

// ---------- Configuración general de la plataforma (superadmin) ----------

const configPlataformaMock: ConfigPlataforma = {
  metodosFichajeDefault: ['celular'],
  toleranciaDefaultMin: 10,
  horaEntradaDefault: '08:00',
  horaSalidaDefault: '17:00',
  diasAvisoDefault: 30,
  emailAvisos: 'avisos@iseo-rh.com',
  pushHabilitado: true,
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
    Pick<Empresa, 'nombre' | 'logoUrl' | 'contactoNombre' | 'contactoEmail'>
  >
): Promise<Empresa> => {
  Object.assign(empresaMock, datos);
  return simular(empresaMock);
};

// ---------- Ausencias ----------

export const getAusencias = async (): Promise<Ausencia[]> =>
  simular(ausenciasMock.filter((a) => esDeEmpresaDemo(a.empleadoId)));

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
}

export const crearAusencia = async (
  datos: NuevaAusencia
): Promise<Ausencia> => {
  const nueva: Ausencia = {
    id: `aus-${Date.now()}`,
    empleadoId: datos.empleadoId,
    tipo: datos.tipo,
    fechaDesde: datos.fechaDesde,
    fechaHasta: datos.fechaHasta,
    dias: diasEntre(datos.fechaDesde, datos.fechaHasta),
    estado: 'pendiente',
    adjuntos: [],
    comentarioEmpleado: datos.comentario,
    creadaEn: hoyISO(),
  };
  ausenciasMock.unshift(nueva);

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

  return simular(nueva);
};

export const resolverAusencia = async (
  ausenciaId: string,
  estado: 'aprobada' | 'rechazada',
  resueltaPor: string,
  comentario?: string
): Promise<Ausencia | null> => {
  const ausencia = ausenciasMock.find((a) => a.id === ausenciaId);
  if (ausencia && ausencia.estado === 'pendiente') {
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

  const corresponden = diasVacacionesPorAntiguedad(empleado.fechaIngreso, anio);
  const deEsteAnio = ausenciasMock.filter(
    (a) =>
      a.empleadoId === empleadoId &&
      a.tipo === 'vacaciones' &&
      a.fechaDesde.startsWith(String(anio))
  );
  const utilizados = deEsteAnio
    .filter((a) => a.estado === 'aprobada')
    .reduce((acc, a) => acc + a.dias, 0);
  const pendientes = deEsteAnio
    .filter((a) => a.estado === 'pendiente')
    .reduce((acc, a) => acc + a.dias, 0);

  return simular({
    empleadoId,
    anio,
    diasCorresponden: corresponden,
    diasAjuste: 0,
    diasUtilizados: utilizados,
    diasPendientesAprobacion: pendientes,
    diasDisponibles: corresponden - utilizados - pendientes,
  });
};

// ---------- Fichajes ----------

export const getFichajesDeHoy = async (): Promise<Fichaje[]> =>
  simular(fichajesMock.filter((f) => esDeEmpresaDemo(f.empleadoId)));

export const getFichajesDeEmpleadoHoy = async (
  empleadoId: string
): Promise<Fichaje[]> =>
  simular(
    fichajesMock.filter(
      (f) => f.empleadoId === empleadoId && f.timestamp.startsWith(hoyISO())
    )
  );

/**
 * Ficha ingreso o egreso según el último movimiento del día.
 */
export const ficharAhora = async (
  empleadoId: string,
  opciones: OpcionesFichaje = {}
): Promise<Fichaje> => {
  const deHoy = fichajesMock.filter(
    (f) => f.empleadoId === empleadoId && f.timestamp.startsWith(hoyISO())
  );
  const ultimo = deHoy[deHoy.length - 1];
  const tipo: Fichaje['tipo'] =
    opciones.tipo ?? (ultimo?.tipo === 'ingreso' ? 'egreso' : 'ingreso');
  const esManual = opciones.metodo === 'manual';
  const nuevo: Fichaje = {
    id: `fic-${Date.now()}`,
    empleadoId,
    tipo,
    timestamp: opciones.timestamp ?? new Date().toISOString(),
    metodo: opciones.metodo ?? 'celular',
    fotoUrl: opciones.fotoUrl,
    confianza: opciones.confianza,
    geo: esManual
      ? undefined
      : (opciones.geo ?? { lat: -34.7203, lng: -58.2542 }),
    fueraDeZona: opciones.fueraDeZona,
    registradoPor: opciones.registradoPor,
  };
  fichajesMock.push(nuevo);
  return simular(nuevo);
};

/** Enrola (o actualiza) el rostro de un empleado con su consentimiento. */
export const enrolarRostro = async (
  empleadoId: string,
  descriptor: number[]
): Promise<Empleado | null> => {
  const empleado = empleadosMock.find((e) => e.id === empleadoId);
  if (empleado) {
    empleado.descriptorFacial = descriptor;
    empleado.consentimientoBiometrico = { aceptado: true, fecha: hoyISO() };
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

export const aprobarExtrasTurno = async (
  turnoId: string,
  aprobado: boolean
): Promise<Turno> => {
  const turno = turnosMock.find((t) => t.id === turnoId);
  if (!turno) throw new Error('Turno no encontrado.');
  turno.extrasAprobadas = aprobado;
  return simular(turno);
};

export const quitarTurno = async (id: string): Promise<void> => {
  const i = turnosMock.findIndex((t) => t.id === id);
  if (i >= 0) turnosMock.splice(i, 1);
  return simular(undefined);
};

/** Todos los fichajes de un empleado (para el control de turnos). */
export const getFichajesDeEmpleado = async (
  empleadoId: string
): Promise<Fichaje[]> =>
  simular(fichajesMock.filter((f) => f.empleadoId === empleadoId));

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

export const registrarTerminal = async (nombre: string): Promise<Terminal> => {
  const nueva: Terminal = {
    id: `term-${Date.now()}`,
    empresaId: 'emp-1',
    nombre,
    creadoEn: hoyISO(),
  };
  terminalesMock.push(nueva);
  return simular(nueva);
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
      .filter((e) => e.empresaId === empresaDemo())
      .sort((a, b) => a.fecha.localeCompare(b.fecha))
  );

export const getNotificaciones = async (
  usuarioId: string
): Promise<Notificacion[]> =>
  simular(notificacionesMock.filter((n) => n.usuarioId === usuarioId));

// ---------- Reportes de control ----------

export const getResumenControl = async (): Promise<ResumenControl> => {
  const activos = empleadosMock.filter((e) => e.activo);

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
  const mesActual = new Date().toISOString().slice(0, 7);
  const diasAusencia = ausenciasMock
    .filter(
      (a) => a.estado === 'aprobada' && a.fechaDesde.startsWith(mesActual)
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
    recibosSinFirmar: recibosMock.filter((r) => r.estadoFirma === 'pendiente')
      .length,
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
  const existente = remuneracionesMock.find(
    (r) => r.empleadoId === datos.empleadoId && r.periodo === datos.periodo
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
  publicar = true
): Promise<ReciboSueldo> => {
  const nuevo: ReciboSueldo = {
    id: `rec-${Date.now()}`,
    empleadoId,
    periodo,
    archivoUrl: `/recibos/${empleadoId}/${periodo}.pdf`,
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

export const crearDescuentoRecurrente = async (
  empleadoId: string,
  concepto: string,
  monto: number
): Promise<DescuentoRecurrente> => {
  const nuevo: DescuentoRecurrente = {
    id: `dsc-${Date.now()}`,
    empleadoId,
    concepto,
    monto,
  };
  descuentosRecurrentesMock.push(nuevo);
  return simular(nuevo);
};

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
