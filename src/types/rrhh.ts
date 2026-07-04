/**
 * Tipos de dominio del sistema RRHH.
 * Fuente de verdad para mocks (fase front) y schema Supabase (fase back).
 * Ver docs/DATA_MODEL.md para las reglas de negocio.
 */

// ---------- Roles y usuarios ----------

export type Rol = 'superadmin' | 'admin_rrhh' | 'supervisor' | 'empleado';

export interface Usuario {
  id: string;
  email: string;
  rol: Rol;
  /** null solo para superadmin */
  empresaId: string | null;
  /** vinculado si el usuario es un empleado */
  empleadoId: string | null;
  nombreCompleto: string;
  avatarUrl?: string;
}

// ---------- Empresa (tenant) ----------

export type MetodoFichaje = 'facial_tablet' | 'celular';

export interface ConfigEmpresa {
  metodosFichaje: MetodoFichaje[];
  toleranciaLlegadaTardeMin: number;
  horaEntrada: string; // "08:00"
  horaSalida: string; // "17:00"
  diasAvisoVencimiento: number; // default 30
}

export type EstadoEmpresa = 'activa' | 'suspendida';

export interface Empresa {
  id: string;
  nombre: string;
  cuit: string;
  logoUrl?: string;
  estado: EstadoEmpresa;
  contactoNombre: string;
  contactoEmail: string;
  config: ConfigEmpresa;
  creadaEn: string;
}

/** Datos mínimos para dar de alta un cliente (superadmin) */
export interface NuevaEmpresa {
  nombre: string;
  cuit: string;
  contactoNombre: string;
  contactoEmail: string;
}

/** Empresa + indicadores para el listado del superadmin */
export interface EmpresaResumen {
  empresa: Empresa;
  empleadosActivos: number;
}

/** Configuración general de la plataforma (superadmin) */
export interface ConfigPlataforma {
  /** valores por defecto al crear una empresa nueva */
  metodosFichajeDefault: MetodoFichaje[];
  toleranciaDefaultMin: number;
  horaEntradaDefault: string;
  horaSalidaDefault: string;
  diasAvisoDefault: number;
  /** notificaciones */
  emailAvisos: string;
  pushHabilitado: boolean;
  resumenSemanalEmail: boolean;
}

/** Métricas globales del negocio (superadmin) */
export interface MetricasGlobales {
  empresasActivas: number;
  empresasSuspendidas: number;
  empleadosGestionados: number;
  solicitudesPendientes: number;
}

// ---------- Empleado ----------

export type EstadoCivil =
  | 'soltero'
  | 'casado'
  | 'divorciado'
  | 'viudo'
  | 'union_convivencial';

export type NivelEstudios =
  | 'primario'
  | 'secundario'
  | 'terciario'
  | 'universitario'
  | 'posgrado';

export type ModalidadContratacion =
  | 'indeterminado'
  | 'plazo_fijo'
  | 'eventual'
  | 'pasantia'
  | 'monotributista';

export type ModalidadPago = 'mensual' | 'quincenal' | 'semanal' | 'jornal';

export interface Familiar {
  nombreCompleto: string;
  vinculo: 'conyuge' | 'hijo' | 'otro';
  fechaNacimiento?: string;
  dni?: string;
}

export interface ContactoEmergencia {
  nombreCompleto: string;
  vinculo: string;
  telefono: string;
}

export interface ChecklistItem {
  id: string;
  etiqueta: string;
  completo: boolean;
}

export interface Empleado {
  id: string;
  empresaId: string;
  // Datos personales
  nombre: string;
  apellido: string;
  dni: string;
  cuil: string;
  fechaNacimiento: string;
  estadoCivil: EstadoCivil;
  nivelEstudios: NivelEstudios;
  domicilio: string;
  telefono: string;
  email: string;
  contactoEmergencia: ContactoEmergencia;
  grupoFamiliar: Familiar[];
  fotoUrl?: string;
  // Datos laborales
  fechaIngreso: string;
  puesto: string;
  sector: string;
  supervisorId: string | null;
  modalidadContratacion: ModalidadContratacion;
  /** obligatoria si modalidadContratacion === 'plazo_fijo' */
  fechaFinContrato?: string;
  modalidadPago: ModalidadPago;
  banco: string;
  cbu: string;
  obraSocial: string;
  art: string;
  // Estado
  activo: boolean;
  fechaBaja?: string;
  motivoBaja?: string;
  checklistAlta: ChecklistItem[];
  // Biometría (fichaje por reconocimiento facial)
  /** Descriptor facial (128 números) del rostro enrolado. Dato sensible. */
  descriptorFacial?: number[];
  /** Consentimiento del empleado para usar su rostro (Ley 25.326). */
  consentimientoBiometrico?: {
    aceptado: boolean;
    fecha: string;
  };
}

// ---------- Legajo digital ----------

export type CategoriaDocumento =
  | 'dni'
  | 'contrato'
  | 'alta_afip'
  | 'certificado'
  | 'licencia'
  | 'estudio_medico'
  | 'titulo'
  | 'curso'
  | 'otro';

export interface DocumentoLegajo {
  id: string;
  empleadoId: string;
  categoria: CategoriaDocumento;
  nombre: string;
  archivoUrl: string;
  fechaVencimiento?: string;
  creadoEn: string;
}

// ---------- Remuneraciones ----------

export interface Remuneracion {
  id: string;
  empleadoId: string;
  /** formato YYYY-MM */
  periodo: string;
  montoBruto: number;
  montoNeto: number;
}

export type EstadoFirma = 'pendiente' | 'firmado';

export interface ReciboSueldo {
  id: string;
  empleadoId: string;
  periodo: string;
  archivoUrl: string;
  estadoFirma: EstadoFirma;
  firmadoEn?: string;
}

// ---------- Ausencias ----------

export type TipoAusencia =
  | 'vacaciones'
  | 'enfermedad'
  | 'estudio'
  | 'mudanza'
  | 'fallecimiento'
  | 'especial';

export type EstadoAusencia = 'pendiente' | 'aprobada' | 'rechazada';

export interface Ausencia {
  id: string;
  empleadoId: string;
  tipo: TipoAusencia;
  fechaDesde: string;
  fechaHasta: string;
  dias: number;
  estado: EstadoAusencia;
  adjuntos: string[];
  comentarioEmpleado?: string;
  resueltaPor?: string;
  comentarioResolucion?: string;
  resueltaEn?: string;
  creadaEn: string;
}

export interface SaldoVacaciones {
  empleadoId: string;
  anio: number;
  /** según antigüedad, LCT art. 150 */
  diasCorresponden: number;
  diasAjuste: number;
  diasUtilizados: number;
  diasPendientesAprobacion: number;
  diasDisponibles: number;
}

// ---------- Fichaje ----------

export type TipoFichaje = 'ingreso' | 'egreso';

export interface Fichaje {
  id: string;
  empleadoId: string;
  tipo: TipoFichaje;
  timestamp: string;
  metodo: MetodoFichaje;
  fotoUrl?: string;
  geo?: { lat: number; lng: number };
  dispositivoId?: string;
  /** Confianza del match facial (0 a 1) cuando metodo es facial. */
  confianza?: number;
}

/** Opciones al registrar un fichaje (método, foto, confianza, ubicación). */
export interface OpcionesFichaje {
  metodo?: MetodoFichaje;
  fotoUrl?: string;
  confianza?: number;
  geo?: { lat: number; lng: number };
}

/** Descriptor facial enrolado de un empleado (para identificación 1:N). */
export interface DescriptorFacial {
  empleadoId: string;
  descriptor: number[];
}

export interface JornadaCalculada {
  empleadoId: string;
  fecha: string;
  horasTrabajadas: number;
  horasExtras: number;
  llegadaTardeMin: number;
  salidaAnticipadaMin: number;
  /** falta ingreso o egreso */
  incompleta: boolean;
}

// ---------- Alertas y agenda ----------

export type TipoAlerta =
  | 'contrato_plazo'
  | 'examen_medico'
  | 'art'
  | 'documento'
  | 'custom';

export type EstadoAlerta = 'pendiente' | 'notificada' | 'resuelta';

export interface Alerta {
  id: string;
  empresaId: string;
  tipo: TipoAlerta;
  titulo: string;
  fecha: string;
  empleadoId?: string;
  diasAviso: number;
  estado: EstadoAlerta;
}

export type TipoEvento =
  | 'evento'
  | 'capacitacion'
  | 'cumpleanios'
  | 'vencimiento';

export interface EventoAgenda {
  id: string;
  empresaId: string;
  tipo: TipoEvento;
  titulo: string;
  fecha: string;
  descripcion?: string;
}

// ---------- Reportes de control ----------

export interface ControlEmpleado {
  empleadoId: string;
  nombreCompleto: string;
  llegadasTarde: number;
  minutosTarde: number;
  horasExtras: number;
  jornadasIncompletas: number;
}

export interface ResumenControl {
  /** días de ausencia aprobados sobre días-persona del período */
  ausentismoPct: number;
  llegadasTardeTotal: number;
  horasExtrasTotal: number;
  jornadasIncompletas: number;
  recibosSinFirmar: number;
  porEmpleado: ControlEmpleado[];
}

// ---------- Notificaciones ----------

export interface Notificacion {
  id: string;
  usuarioId: string;
  tipo:
    | 'ausencia_solicitada'
    | 'ausencia_resuelta'
    | 'recibo_disponible'
    | 'vencimiento'
    | 'evento'
    | 'general';
  titulo: string;
  cuerpo: string;
  link?: string;
  leida: boolean;
  creadaEn: string;
}
