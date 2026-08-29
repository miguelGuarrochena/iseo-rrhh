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

/**
 * En qué anda una invitación. Vive en Auth, no en `usuarios`: la fila del
 * perfil existe desde que se manda el mail, así que por sí sola no
 * distingue a quien ya entró de quien nunca abrió la invitación.
 *
 *  - `activa`: entró al menos una vez y tiene contraseña.
 *  - `pendiente`: se le mandó el mail y todavía no la usó.
 *  - `sin_perfil`: la cuenta quedó a medias. Puede entrar pero la app no
 *    sabe quién es; hay que rehacer la invitación.
 */
export type EstadoDeCuenta = 'activa' | 'pendiente' | 'sin_perfil';

export interface CuentaDeAcceso {
  email: string;
  /** Falta cuando la cuenta quedó sin perfil. */
  usuarioId?: string;
  nombre: string;
  estado: EstadoDeCuenta;
  invitadaEn?: string;
  ultimoAcceso?: string;
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
  /**
   * Días por tramo de antigüedad, **sólo cuando se cuentan en hábiles**.
   *
   * En días corridos rige la escala de la LCT y no hay nada que
   * configurar. En hábiles la empresa ya está dando algo mejor que el
   * mínimo legal, así que define cuánto: arranca en el equivalente al
   * piso (10/15/20/25) y puede subirlo a lo que haya acordado.
   *
   * Lo que no figure acá cae al mínimo, así que una empresa que sólo
   * mejora un tramo guarda un solo número.
   */
  vacacionesEscala?: Partial<{
    hasta5: number;
    hasta10: number;
    hasta20: number;
    masDe20: number;
  }>;
  /**
   * Secciones que la empresa decide no usar. La clave es el `modulo` del
   * NavItem y sólo se guarda cuando está apagada: lo que no figura acá
   * queda encendido, así las empresas que ya existen no cambian.
   *
   * Es el germen de los módulos por tipo de negocio: cuando se defina
   * ese paquete, se suman claves acá sin migrar nada.
   */
  modulos?: Record<string, boolean>;
  /**
   * % estimado de cargas patronales sobre el bruto (ej. 0.27 = 27%), para
   * el costo laboral de Remuneraciones. Si no está definido, se usa una
   * estimación genérica.
   */
  cargasPatronalesPct?: number;
  /**
   * Horas mensuales con las que se divide el bruto para sacar el valor
   * hora de las extras. 192 es la jornada legal (48 semanales), pero
   * muchos convenios usan otra base, así que es configurable.
   */
  horasMensuales?: number;
  /**
   * Tope máximo de la base imponible para los aportes personales
   * (jubilación, PAMI y obra social), en pesos del período.
   *
   * El art. 9 de la Ley 24.241 fija un límite por encima del cual no se
   * aporta, y ANSES lo actualiza cada trimestre. Por eso es un número
   * configurable y no una constante: cablearlo garantiza que quede viejo.
   *
   * Sin definir, no se aplica tope y los aportes salen sobre el bruto
   * completo — que es lo que hacía la app antes de existir este campo, y
   * lo que corresponde mientras nadie cargue el valor vigente.
   */
  topeImponibleAportes?: number;
  /**
   * Si la empresa recibe el resumen semanal por mail. Ausente = sí, así
   * las empresas que ya existen lo tienen sin tocar nada.
   *
   * Es una sola clave y no dos (una de ISEO, otra del cliente) porque no
   * se cobra: no hay un "servicio habilitado" separado de la preferencia
   * de quien lo recibe. Lo pueden cambiar tanto RRHH desde su
   * Configuración como ISEO desde la ficha de la empresa, y lo último
   * que se guarda es lo que vale.
   */
  resumenSemanal?: boolean;
}

export type EstadoEmpresa = 'activa' | 'suspendida';

/**
 * Cómo liquida la empresa. Define qué se le muestra en Remuneraciones y
 * si los colaboradores tienen cuenta en la app.
 *
 * - `relacion_dependencia`: lo de siempre. Aportes de ley, recibo de
 *   sueldo, documentos para firmar, cada colaborador con su usuario.
 * - `simplificado`: monotributo o pago directo. Sin descuentos de ley
 *   —el neto es lo que se paga— y con la cuota de monotributo como
 *   costo aparte si la paga la empresa. Los colaboradores pueden no
 *   tener cuenta: fichan en la terminal y RRHH carga todo.
 *
 * Todo lo demás (fichaje, ausencias, feriados, reportes) es igual.
 */
export type RegimenLaboral = 'relacion_dependencia' | 'simplificado';

export const REGIMEN_LABORAL_LABELS: Record<RegimenLaboral, string> = {
  relacion_dependencia: 'Relación de dependencia',
  simplificado: 'Simplificado (monotributo / pago directo)',
};

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
  /** Cómo liquida. Ausente = relación de dependencia. */
  regimen?: RegimenLaboral;
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
  regimen?: RegimenLaboral;
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
    | 'regimen'
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
  /**
   * Resumen semanal a los admin de RRHH (lunes). Los avisos puntuales
   * —respuesta, recibo listo, ausencia resuelta— se mandan siempre y no
   * se configuran.
   *
   * El remitente sale de EMAIL_FROM y no es configurable acá: Resend
   * exige que el dominio esté verificado, así que dejarlo editable era
   * prometer algo que no iba a funcionar.
   */
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
  /**
   * No va a tener cuenta en la app: ficha en la terminal y RRHH le
   * carga ausencias y remuneración. No recibe invitación ni documentos
   * para firmar. Es la opción que pidieron para el régimen
   * simplificado, donde el cliente prefiere no darle acceso.
   */
  sinUsuario?: boolean;
  // Fichaje
  /** Cómo ficha este empleado (default: 'celular'). */
  modoFichaje?: ModoFichaje;
  /** Zona de trabajo (solo si modoFichaje === 'celular'). */
  geocerca?: Geocerca;
  // Biometría (fichaje por reconocimiento facial)
  /**
   * Si esta persona tiene el rostro enrolado. Es lo único que la app
   * necesita saber, y lo único que el servidor devuelve (FIC-011).
   */
  tieneRostro?: boolean;
  /**
   * Con qué versión del pipeline se generó la plantilla enrolada.
   *
   * 1 = pipeline anterior al rediseño (sin alineamiento canónico), 2 =
   * actual. Sirve para saber a quién falta re-enrolar: quien tenga una
   * versión distinta de `VERSION_PLANTILLA` **no puede fichar**, porque
   * el servidor sólo compara contra plantillas de la misma versión.
   *
   * No es dato biométrico: es un entero de un dígito que dice con qué
   * código se calculó el descriptor, no nada sobre el rostro.
   */
  descriptorVersion?: number;
  /**
   * Descriptor facial (128 números) del rostro enrolado.
   *
   * **El backend real ya no lo devuelve nunca**: es el secreto con el
   * que se autentica el fichaje facial, y con él en la mano se puede
   * fichar por REST sin cámara ni prueba de vida. Se escribe al enrolar
   * y se lee sólo dentro de `fichar_con_rostro` (SECURITY DEFINER).
   *
   * Sigue en el tipo porque el modo demo trabaja en memoria y compara
   * descriptores ahí mismo, donde no hay nada que proteger. Para
   * preguntar "¿está enrolada?" usar `tieneRostroEnrolado()`, que
   * funciona con los dos backends.
   */
  descriptorFacial?: number[];
  /** Consentimiento del empleado para usar su rostro (Ley 25.326). */
  consentimientoBiometrico?: ConsentimientoBiometrico;
}

/**
 * Constancia de que el titular autorizó el uso de su rostro.
 *
 * No alcanza con un booleano: si mañana alguien reclama, hay que poder
 * mostrar qué se aceptó, cuándo y quién lo registró. La base no deja
 * guardar un descriptor facial sin esto (trigger
 * `exigir_consentimiento_biometrico`).
 */
export interface ConsentimientoBiometrico {
  aceptado: boolean;
  /** YYYY-MM-DD en que se otorgó. */
  fecha: string;
  /** Usuario que registró el consentimiento (suele ser quien opera la ficha). */
  otorgadoPor?: string;
  /** Texto exacto que se aceptó, para poder acreditar qué se informó. */
  texto?: string;
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
  /**
   * Mensual, aguinaldo (SAC), vacaciones, gratificación o liquidación
   * final. Junto con el período, distingue varias remuneraciones del
   * mismo mes (ej. sueldo de junio + SAC de junio) sin pisarse.
   */
  tipo: TipoRecibo;
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
  /** Default 'mensual' si no se especifica. */
  tipo?: TipoRecibo;
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
  /**
   * La cuota la paga la empresa, no el colaborador. Cambia el costo
   * laboral del período: el caso del pedido es "Pablo sueldo $100, la
   * empresa paga monotributo $23" → el costo del mes es 123, no 100.
   */
  aCargoEmpresa?: boolean;
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

/**
 * Conceptos que se liquidan por separado. Un mismo mes puede tener
 * varios: el sueldo y el SAC de junio son dos recibos distintos, cada
 * uno con su firma.
 */
export type TipoRecibo =
  | 'mensual'
  | 'sac'
  | 'vacaciones'
  | 'gratificacion'
  | 'liquidacion_final';

export interface ReciboSueldo {
  id: string;
  empleadoId: string;
  periodo: string;
  tipo: TipoRecibo;
  archivoUrl: string;
  estadoFirma: EstadoFirma;
  firmadoEn?: string;
  /** Cuándo lo firmó/publicó el empleador; sin esto el empleado no lo ve. */
  firmadoEmpleadorEn?: string;
  /**
   * Si tiene fecha, dejó de ser el vigente: lo rectificó otro recibo.
   * Se conserva porque es la prueba de lo que se firmó en su momento.
   */
  archivadoEn?: string;
  /** Recibo al que vino a corregir. */
  rectificaA?: string;
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
  | 'examenes'
  | 'maternidad'
  | 'nacimiento'
  | 'excedencia';

/**
 * Licencias que la ley otorga por HECHO GENERADOR, no por año.
 *
 * El art. 158 concede diez días corridos por matrimonio, tres por
 * fallecimiento de cónyuge/hijos/padres, uno por fallecimiento de hermano
 * y dos por nacimiento de hijo — cada vez que el hecho ocurre. Un cupo
 * anual sobre estos tipos le niega al trabajador la segunda licencia del
 * año, que es exactamente el derecho que el artículo le da.
 *
 * Lo mismo vale para maternidad (art. 177) y excedencia (art. 183): son
 * licencias de duración legal propia, no un saldo que se consume.
 *
 * Estar en esta lista significa: nunca tienen cupo, ni en la
 * configuración ni en el control de la base.
 */
export const TIPOS_LICENCIA_POR_EVENTO: TipoAusencia[] = [
  'fallecimiento',
  'casamiento',
  'nacimiento',
  'maternidad',
  'excedencia',
];

/**
 * Tipos de licencia con cupo anual configurable.
 *
 * `examenes` está acá por el art. 158 inc. e, que sí fija un máximo de
 * diez días por año calendario. `mudanza`, `estudio` y `especial` son
 * convencionales: el tope lo decide el convenio o el acuerdo de cada
 * empresa, y por eso siguen siendo configurables.
 */
export const TIPOS_LICENCIA_CON_CUPO: TipoAusencia[] = [
  'mudanza',
  'donacion_sangre',
  'examenes',
  'estudio',
  'especial',
];

export interface CupoLicencia {
  id: string;
  empresaId: string;
  tipo: TipoAusencia;
  diasAnuales: number;
}

// ---------- Errores registrados ----------

/** Un error que la app guardó para que soporte lo mire después. */
export interface ErrorApp {
  id: string;
  empresaId?: string;
  usuarioId?: string;
  ruta?: string;
  contexto?: string;
  /** El mensaje crudo, sin traducir. */
  mensaje: string;
  creadoEn: string;
}

// ---------- Feriados ----------

/**
 * 'nacional' son los de ley; 'puente' los turísticos que se anuncian
 * cada año; 'empresa' los propios (día del gremio, aniversario).
 */
export type TipoFeriado = 'nacional' | 'puente' | 'empresa';

export interface Feriado {
  id: string;
  empresaId: string;
  /** YYYY-MM-DD */
  fecha: string;
  nombre: string;
  tipo: TipoFeriado;
  /** false = se trabaja, pero lo trabajado va con recargo. */
  noLaborable: boolean;
}

export type NuevoFeriado = Omit<Feriado, 'id' | 'empresaId'>;

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
  /**
   * Días arrastrados de períodos anteriores, cargados a mano por RRHH.
   * Suman a los que corresponden por antigüedad.
   */
  diasAjuste: number;
  diasUtilizados: number;
  diasPendientesAprobacion: number;
  diasDisponibles: number;
}

/**
 * Días de vacaciones que quedaron sin usar y se suman al período
 * siguiente. Se cargan a mano al cerrar el año: la LCT (art. 164) sólo
 * permite arrastrar hasta un tercio del período anterior, y qué se
 * acumula y qué caduca lo decide la empresa, no la app.
 */
export interface VacacionesPendientes {
  id: string;
  empleadoId: string;
  /** Año al que se le suman los días. */
  anio: number;
  dias: number;
  motivo?: string;
  creadoEn: string;
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
  /** Usuario autenticado que cargó a mano (lo impone la base). */
  registradoPorId?: string;
  /**
   * Por qué se cargó a mano. Sólo lo tienen las marcas manuales: las
   * que entran por `fichar_con_rostro` no necesitan explicación.
   */
  motivo?: string;
  /**
   * Anulación (F-12). La fila nunca se borra: se marca. Una marca
   * anulada queda fuera de jornadas, resumen, Excel y liquidación, pero
   * sigue existiendo para la auditoría.
   *
   * Los tres campos van juntos y sólo los escribe `anular_fichaje()`.
   */
  anuladoEn?: string;
  anuladoPor?: string;
  anuladoMotivo?: string;
}

/**
 * Opciones al registrar un fichaje (método, confianza, ubicación).
 *
 * **No hay `fotoUrl`, y es deliberado.** El fichaje no guarda ninguna
 * fotografía: el único dato biométrico del sistema es la plantilla de
 * 128 números del enrolamiento, de la que no se puede reconstruir la
 * cara. Reponer este campo volvería a abrir el camino para que una
 * imagen de un rostro termine guardada junto a cada marca de asistencia.
 * Ver `docs/freeze-facial-2026-08-15.md`.
 */
export interface OpcionesFichaje {
  metodo?: MetodoFichaje;
  confianza?: number;
  geo?: { lat: number; lng: number };
  fueraDeZona?: boolean;
  /** Forzar tipo (para carga manual); por defecto alterna ingreso/egreso. */
  tipo?: TipoFichaje;
  /** Momento del fichaje (para carga manual); por defecto ahora. */
  timestamp?: string;
  /** Quién lo carga a mano (carga manual). */
  registradoPor?: string;
  /**
   * Por qué se carga a mano. Obligatorio en carga manual: lo exige el
   * trigger `imponer_actor_fichaje`, no sólo el formulario.
   */
  motivo?: string;
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
  /**
   * Habilitada para el fichaje en planta. Desactivarla corta el kiosco
   * de esa tablet sin borrar su histórico. El secreto de la terminal no
   * está acá ni en ninguna respuesta de la API: sólo su hash, en la
   * base, y el valor en claro en el dispositivo vinculado.
   */
  activa: boolean;
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

// ---------- Auditoría (quién hizo qué) ----------

export interface AccionAuditoria {
  id: string;
  empresaId: string;
  actorId?: string;
  actorNombre: string;
  accion: string;
  entidad: string;
  entidadId?: string;
  detalle: Record<string, unknown>;
  creadaEn: string;
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
  /**
   * Si tiene fecha, salió de circulación. Se archiva en vez de borrarse
   * cuando ya alguien lo firmó: la constancia de esa firma es prueba.
   */
  archivadoEn?: string;
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
  comunicacionesSinLeer: number;
  documentosPorFirmar: number;
  total: number;
}
