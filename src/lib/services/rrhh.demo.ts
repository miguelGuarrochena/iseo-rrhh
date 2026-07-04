/**
 * Capa de servicios. Hoy lee mocks con una latencia simulada;
 * en la fase de back se reemplaza la implementación por Supabase
 * sin tocar las pantallas.
 */
import {
  Alerta,
  Ausencia,
  ConfigPlataforma,
  DescriptorFacial,
  DocumentoLegajo,
  Empleado,
  Empresa,
  EmpresaResumen,
  EventoAgenda,
  Fichaje,
  MetricasGlobales,
  NotaInterna,
  OpcionesFichaje,
  Notificacion,
  NuevaEmpresa,
  ReciboSueldo,
  Remuneracion,
  ResumenControl,
  SaldoVacaciones,
  Usuario,
} from '@/types/rrhh';
import { diasVacacionesPorAntiguedad } from '@/lib/vacaciones';
import { diasEntre, hoyISO } from '@/lib/fechas';
import { supabase, supabaseConfigurado } from '@/lib/supabase/cliente';
import { dotacionMock, empresaMock, empresasMock } from '@/lib/mocks/empresa';
import { usuariosMock } from '@/lib/mocks/usuarios';
import { empleadosMock } from '@/lib/mocks/empleados';
import { jornadasMock } from '@/lib/mocks/jornadas';
import {
  alertasMock,
  ausenciasMock,
  documentosMock,
  eventosMock,
  fichajesMock,
  notasInternasMock,
  notificacionesMock,
  recibosMock,
  remuneracionesMock,
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

export const getEmpresa = async (): Promise<Empresa> => simular(empresaMock);

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
    estado: 'activa',
    contactoNombre: datos.contactoNombre,
    contactoEmail: datos.contactoEmail,
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

export const getEmpleados = async (): Promise<Empleado[]> =>
  simular(empleadosMock.filter((e) => e.activo));

/** Incluye también los dados de baja (para el listado con filtro de estado) */
export const getEmpleadosTodos = async (): Promise<Empleado[]> =>
  simular([...empleadosMock]);

export const getEmpleado = async (id: string): Promise<Empleado | null> =>
  simular(empleadosMock.find((e) => e.id === id) ?? null);

export const getEquipo = async (supervisorId: string): Promise<Empleado[]> =>
  simular(empleadosMock.filter((e) => e.supervisorId === supervisorId));

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
}

export const crearEmpleado = async (
  datos: NuevoEmpleado
): Promise<Empleado> => {
  const nuevo: Empleado = {
    id: `ple-${Date.now()}`,
    empresaId: 'emp-1',
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
  simular(usuariosMock.filter((u) => u.rol !== 'superadmin'));

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
  simular(ausenciasMock);

export const getAusenciasDeEmpleado = async (
  empleadoId: string
): Promise<Ausencia[]> =>
  simular(ausenciasMock.filter((a) => a.empleadoId === empleadoId));

export const getAusenciasPendientes = async (): Promise<Ausencia[]> =>
  simular(ausenciasMock.filter((a) => a.estado === 'pendiente'));

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
        link: '/app/ausencias',
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
  simular(fichajesMock);

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
    ultimo?.tipo === 'ingreso' ? 'egreso' : 'ingreso';
  const nuevo: Fichaje = {
    id: `fic-${Date.now()}`,
    empleadoId,
    tipo,
    timestamp: new Date().toISOString(),
    metodo: opciones.metodo ?? 'celular',
    fotoUrl: opciones.fotoUrl,
    confianza: opciones.confianza,
    geo: opciones.geo ?? { lat: -34.7203, lng: -58.2542 },
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
      .filter((e) => e.activo && e.descriptorFacial?.length)
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

// ---------- Alertas, agenda y notificaciones ----------

export const getAlertas = async (): Promise<Alerta[]> =>
  simular(alertasMock.filter((a) => a.estado !== 'resuelta'));

export const getEventosProximos = async (): Promise<EventoAgenda[]> =>
  simular([...eventosMock].sort((a, b) => a.fecha.localeCompare(b.fecha)));

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
  simular([...remuneracionesMock]);

export const getRecibos = async (empleadoId: string): Promise<ReciboSueldo[]> =>
  simular(recibosMock.filter((r) => r.empleadoId === empleadoId));

export const getRecibosTodos = async (): Promise<ReciboSueldo[]> =>
  simular([...recibosMock]);

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
    empresaId: 'emp-1',
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

export const cargarRecibo = async (
  empleadoId: string,
  periodo: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _archivo: File
): Promise<ReciboSueldo> => {
  const nuevo: ReciboSueldo = {
    id: `rec-${Date.now()}`,
    empleadoId,
    periodo,
    archivoUrl: `/recibos/${empleadoId}/${periodo}.pdf`,
    estadoFirma: 'pendiente',
  };
  recibosMock.push(nuevo);
  return simular(nuevo);
};

export const abrirRecibo = async (recibo: ReciboSueldo): Promise<string> =>
  simular(recibo.archivoUrl);

export const abrirDocumento = async (doc: DocumentoLegajo): Promise<string> =>
  simular(doc.archivoUrl);
