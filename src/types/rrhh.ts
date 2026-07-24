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

/** Cómo quedó registrado un fichaje. 'manual' = carga a mano por RRHH/supervisor. */
export type MetodoFichaje = 'facial_tablet' | 'celular' | 'remoto' | 'manual';

/** Modo de fichaje configurado para un empleado. */
export type ModoFichaje = 'planta' | 'celular' | 'remoto';

/** Zona de trabajo para validar el fichaje por celular (geocerca). */
export interface Geocerca {
  lat: number;
  lng: number;
  /** Radio permitido en metros. */
  radioM: number;
}

export interface ConfigEmpresa {
  metodosFichaje: MetodoFichaje[];
  toleranciaLlegadaTardeMin: number;
  horaEntrada: string; // "08:00"
  horaSalida: string; // "17:00"
  diasAvisoVencimiento: number; // default 30
  /**
   * Si true, las vacaciones se cuentan en días hábiles (lun–vie).
   * Por defecto false = días corridos (LCT).
   */
  vacacionesDiasHabiles?: boolean;
}

export type EstadoEmpresa = 'activa' | 'suspendida';

export interface Empresa {
  id: string;
  /** Nombre comercial / cómo se muestra. */
  nombre: string;
  cuit: string;
  /** Razón social (nombre legal), si difiere del comercial. */
  razonSocial?: string;
  domicilio?: string;
  logoUrl?: string;
  estado: EstadoEmpresa;
  contactoNombre: string;
  contactoEmail: string;
  /** Teléfono del responsable/contacto. */
  contactoTelefono?: string;
  config: ConfigEmpresa;
  /** Nombre del plan contratado (ej. "Básico", "Full"). */
  plan?: string;
  /** Abono mensual que la empresa le paga a ISEO (facturación). */
  abonoMensual?: number;
  creadaEn: string;
}

/** Datos para dar de alta un cliente (superadmin) */
export interface NuevaEmpresa {
  nombre: string;
  cuit: string;
  razonSocial?: string;
  domicilio?: string;
  contactoNombre: string;
  contactoEmail: string;
  contactoTelefono?: string;
  plan?: string;
  abonoMensual?: number;
}

/** Cambios editables de la ficha de un cliente (superadmin). */
export type DatosEmpresaCliente = Partial<
  Pick<
    Empresa,
    | 'nombre'
    | 'razonSocial'
    | 'cuit'
    | 'domicilio'
    | 'contactoNombre'
    | 'contactoEmail'
    | 'contactoTelefono'
    | 'plan'
    | 'abonoMensual'
  >
>;

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
  /** Número de legajo interno (opcional; sirve para matching de recibos). */
  numeroLegajo?: string;
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
  /** Convenio colectivo bajo el que está encuadrado (ej. "CCT 130/75"). */
  convenio?: string;
  // Estado
  activo: boolean;
  fechaBaja?: string;
  motivoBaja?: string;
  checklistAlta: ChecklistItem[];
  // Fichaje
  /** Cómo ficha este empleado (default: 'celular'). */
  modoFichaje?: ModoFichaje;
  /** Zona de trabajo (solo si modoFichaje === 'celular'). */
  geocerca?: Geocerca;
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
  /** Sueldo bruto remunerativo (base para aportes). */
  montoBruto: number;
  /** Adicionales no remunerativos (no tributan aportes). */
  noRemunerativo?: number;
  /** Aportes del empleado (jubilación + PAMI + obra social + otros). */
  aportes?: number;
  /** Otros descuentos (sindicato, adelantos, etc.). */
  otrosDescuentos?: number;
  /** Neto = remunerativo + no remunerativo − aportes − otros descuentos. */
  montoNeto: number;
  /** Convenio colectivo aplicado (ej. "CCT 130/75"). */
  convenio?: string;
}

/** Datos para cargar/actualizar la remuneración de un período. */
export interface NuevaRemuneracion {
  empleadoId: string;
  periodo: string;
  montoBruto: number;
  noRemunerativo?: number;
  otrosDescuentos?: number;
  convenio?: string;
}

/** Descuento fijo (sindicato, comedor, etc.) que se arrastra cada mes. */
export interface DescuentoRecurrente {
  id: string;
  empleadoId: string;
  concepto: string;
  /** Monto fijo en $ (si modo === 'monto'). */
  monto: number;
  /** 'monto' = $ fijo; 'porcentaje' = % del bruto. */
  modo?: 'monto' | 'porcentaje';
  /** Porcentaje del bruto (si modo === 'porcentaje'). */
  porcentaje?: number;
}

/** Factura / cuota de monotributo cargada como costo laboral. */
export interface FacturaMonotributo {
  id: string;
  empleadoId: string;
  periodo: string;
  monto: number;
  archivoUrl?: string;
  creadoEn: string;
}

export type EstadoAdelanto = 'pendiente' | 'aprobado' | 'rechazado';

/** Adelanto de sueldo: el empleado pide, el admin resuelve. */
export interface Adelanto {
  id: string;
  empleadoId: string;
  monto: number;
  motivo?: string;
  estado: EstadoAdelanto;
  /** YYYY-MM en el que se descuenta del neto (se fija al aprobar). */
  periodo?: string;
  creadoEn: string;
  resueltoEn?: string;
}

export type EstadoFirma = 'pendiente' | 'firmado';

export interface ReciboSueldo {
  id: string;
  empleadoId: string;
  periodo: string;
  archivoUrl: string;
  estadoFirma: EstadoFirma;
  firmadoEn?: string;
  /** Cuándo lo firmó/publicó el empleador; sin esto el empleado no lo ve. */
  firmadoEmpleadorEn?: string;
}

// ---------- Ausencias ----------

export type TipoAusencia =
  | 'vacaciones'
  | 'enfermedad'
  | 'estudio'
  | 'mudanza'
  | 'fallecimiento'
  | 'especial'
  | 'entrada_tarde'
  | 'salida_anticipada'
  | 'salida_intermedia'
  | 'home_office'
  | 'casamiento'
  | 'donacion_sangre'
  | 'examenes';

/** Tipos de licencia legal con cupo anual configurable. */
export const TIPOS_LICENCIA_CON_CUPO: TipoAusencia[] = [
  'mudanza',
  'casamiento',
  'donacion_sangre',
  'examenes',
  'fallecimiento',
  'estudio',
  'especial',
];

export interface CupoLicencia {
  id: string;
  empresaId: string;
  tipo: TipoAusencia;
  diasAnuales: number;
}

export interface SaldoLicencia {
  tipo: TipoAusencia;
  diasAnuales: number;
  diasUtilizados: number;
  diasDisponibles: number;
}

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

/** Vista limitada para que un empleado vea vacaciones aprobadas de su sector. */
export interface VacacionSector extends Ausencia {
  empleadoNombre: string;
  empleadoApellido: string;
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
  /** El fichaje se hizo fuera de la zona de trabajo (geocerca). */
  fueraDeZona?: boolean;
  /** Quién lo cargó a mano (nombre) cuando metodo es 'manual'. */
  registradoPor?: string;
}

/** Opciones al registrar un fichaje (método, foto, confianza, ubicación). */
export interface OpcionesFichaje {
  metodo?: MetodoFichaje;
  fotoUrl?: string;
  confianza?: number;
  geo?: { lat: number; lng: number };
  fueraDeZona?: boolean;
  /** Forzar tipo (para carga manual); por defecto alterna ingreso/egreso. */
  tipo?: TipoFichaje;
  /** Momento del fichaje (para carga manual); por defecto ahora. */
  timestamp?: string;
  /** Quién lo carga a mano (carga manual). */
  registradoPor?: string;
}

/** Descriptor facial enrolado de un empleado (para identificación 1:N). */
export interface DescriptorFacial {
  empleadoId: string;
  descriptor: number[];
}

/** Terminal de fichaje autorizada (tablet en planta para el Modo planta). */
export interface Terminal {
  id: string;
  empresaId: string;
  nombre: string;
  creadoEn?: string;
}

/** Convenio colectivo cargado por la empresa (para el asistente con IA). */
export interface Convenio {
  id: string;
  empresaId: string;
  /** Ej. "CCT 130/75 — Empleados de Comercio". */
  nombre: string;
  /** Texto completo del convenio. */
  contenido: string;
  actualizadoEn?: string;
}

export interface NuevoConvenio {
  nombre: string;
  contenido: string;
}

/** Turno asignado a un empleado para un día. Horas en formato "HH:MM". */
export interface Turno {
  id: string;
  empleadoId: string;
  /** YYYY-MM-DD */
  fecha: string;
  horaEntrada: string;
  horaSalida: string;
  /** El supervisor aprobó las horas extra de ese día para pagarlas. */
  extrasAprobadas?: boolean;
}

/** Datos para asignar un turno. */
export interface NuevoTurno {
  empleadoId: string;
  fecha: string;
  horaEntrada: string;
  horaSalida: string;
}

/** Nota interna de un empleado. Solo visible para administradores. */
export interface NotaInterna {
  id: string;
  empleadoId: string;
  /** YYYY-MM-DD */
  fecha: string;
  autorId: string;
  autorNombre: string;
  motivo: string;
  observacion?: string;
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

// ---------- Finanzas del negocio (solo superadmin / ISEO) ----------

export type TipoMovimiento = 'ingreso' | 'gasto';

/** Un ingreso o gasto de ISEO. Los ingresos pueden vincularse a una empresa
 *  cliente (cobro del abono); los gastos son generales. */
export interface MovimientoFinanciero {
  id: string;
  tipo: TipoMovimiento;
  concepto: string;
  categoria?: string;
  /** Empresa cliente asociada (cuando es el cobro de un abono). */
  empresaId?: string;
  monto: number;
  /** YYYY-MM-DD */
  fecha: string;
  /** YYYY-MM (para agrupar por mes) */
  periodo: string;
}

export interface NuevoMovimiento {
  tipo: TipoMovimiento;
  concepto: string;
  categoria?: string;
  empresaId?: string;
  monto: number;
  fecha: string;
}

/** Estado de facturación de una empresa cliente en un período. */
export interface FacturacionEmpresa {
  empresaId: string;
  nombre: string;
  estado: EstadoEmpresa;
  empleados: number;
  abonoMensual: number;
  cobradoEnPeriodo: number;
  alDia: boolean;
}

/** Resumen financiero del negocio para un período (YYYY-MM). */
export interface ResumenFinanzas {
  periodo: string;
  ingresosDelMes: number;
  gastosDelMes: number;
  neto: number;
  /** Ingreso mensual recurrente: suma de abonos de empresas activas. */
  mrr: number;
  empresasAlDia: number;
  empresasVencidas: number;
  facturacion: FacturacionEmpresa[];
}

// ---------- Notificaciones ----------

export interface Notificacion {
  id: string;
  usuarioId: string;
  tipo:
    | 'ausencia_solicitada'
    | 'ausencia_resuelta'
    | 'recibo_disponible'
    | 'adelanto_solicitado'
    | 'adelanto_resuelto'
    | 'vencimiento'
    | 'evento'
    | 'comunicacion'
    | 'documento_firma'
    | 'general';
  titulo: string;
  cuerpo: string;
  link?: string;
  leida: boolean;
  creadaEn: string;
}

// ---------- Comunicaciones (consultas / reclamos / pedidos) ----------

export type TipoComunicacion = 'consulta' | 'reclamo' | 'pedido';
export type EstadoComunicacion = 'abierta' | 'en_curso' | 'cerrada';

export interface Comunicacion {
  id: string;
  empresaId: string;
  empleadoId: string;
  autorId: string;
  tipo: TipoComunicacion;
  asunto: string;
  cuerpo: string;
  estado: EstadoComunicacion;
  creadoEn: string;
  actualizadoEn: string;
}

export interface ComunicacionMensaje {
  id: string;
  comunicacionId: string;
  autorId: string;
  cuerpo: string;
  creadoEn: string;
}

// ---------- Documentos para firma digital ----------

export interface DocumentoFirma {
  id: string;
  empresaId: string;
  titulo: string;
  descripcion?: string;
  archivoUrl: string;
  creadoPor?: string;
  creadoEn: string;
}

export interface DocumentoFirmaDestinatario {
  id: string;
  documentoId: string;
  empleadoId: string;
  firmadoEn?: string;
}

/** Contadores de acciones pendientes (para badges). */
export interface PendientesResumen {
  recibosPorFirmar: number;
  ausenciasPorResolver: number;
  comunicacionesAbiertas: number;
  documentosPorFirmar: number;
  total: number;
}
