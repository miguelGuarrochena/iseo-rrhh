/**
 * Facade de la capa de servicios.
 * Con sesión real (Supabase) usa la implementación de ./supabase/real;
 * en modo demo (botones del login) usa los mocks de ./rrhh.demo.
 * Las pantallas importan siempre de acá y no saben cuál corre detrás.
 */
import { haySesionReal } from '@/lib/auth/store';
import { demoHabilitado } from '@/lib/entorno';
import * as demo from './rrhh.demo';
import * as real from './supabase/real';

// Tipos compartidos por ambas implementaciones
export type {
  HorasExtrasPeriodo,
  MiMes,
  NuevaAusencia,
  NuevaNotaInterna,
  NuevoDocumento,
  NuevoEmpleado,
  NuevoEvento,
  NuevoUsuario,
} from './rrhh.demo';

/** Elige la implementación en el momento de la llamada. */
const elegir = <A extends unknown[], R>(
  reales: (...args: A) => Promise<R>,
  demos: (...args: A) => Promise<R>
): ((...args: A) => Promise<R>) => {
  return (...args: A) => {
    if (haySesionReal()) return reales(...args);
    // Sin sesión real: solo se sirven mocks si el demo está habilitado.
    // En producción esto no debe ocurrir (no hay datos falsos).
    if (!demoHabilitado()) {
      return Promise.reject(
        new Error('La aplicación no está conectada al servidor.')
      );
    }
    return demos(...args);
  };
};

// ---------- Solo demo ----------
export const loginConEmail = demo.loginConEmail;
export const getUsuariosDemo = demo.getUsuariosDemo;

// ---------- Empresa ----------
export const getEmpresa = elegir(real.getEmpresa, demo.getEmpresa);
export const getEmpresas = elegir(real.getEmpresas, demo.getEmpresas);
export const crearEmpresa = elegir(real.crearEmpresa, demo.crearEmpresa);
export const cambiarEstadoEmpresa = elegir(
  real.cambiarEstadoEmpresa,
  demo.cambiarEstadoEmpresa
);
export const getMetricasGlobales = elegir(
  real.getMetricasGlobales,
  demo.getMetricasGlobales
);
export const actualizarEmpresa = elegir(
  real.actualizarEmpresa,
  demo.actualizarEmpresa
);
export const actualizarDatosEmpresa = elegir(
  real.actualizarDatosEmpresa,
  demo.actualizarDatosEmpresa
);
export const actualizarModulosEmpresa = elegir(
  real.actualizarModulosEmpresa,
  demo.actualizarModulosEmpresa
);
export const actualizarServiciosEmpresa = elegir(
  real.actualizarServiciosEmpresa,
  demo.actualizarServiciosEmpresa
);
export const getEmpresaPorId = elegir(
  real.getEmpresaPorId,
  demo.getEmpresaPorId
);
export const getEmpleadosDeEmpresaCount = elegir(
  real.getEmpleadosDeEmpresaCount,
  demo.getEmpleadosDeEmpresaCount
);
export const getMovimientosDeEmpresa = elegir(
  real.getMovimientosDeEmpresa,
  demo.getMovimientosDeEmpresa
);
export const actualizarConfigEmpresa = elegir(
  real.actualizarConfigEmpresa,
  demo.actualizarConfigEmpresa
);

// ---------- Parámetros legales (los mantiene ISEO) ----------
// ---------- Importación de liquidaciones ----------

export const importarRemuneraciones = elegir(
  real.importarRemuneraciones,
  demo.importarRemuneraciones
);

export const getMapeoImportacion = elegir(
  real.getMapeoImportacion,
  demo.getMapeoImportacion
);

export const guardarMapeoImportacion = elegir(
  real.guardarMapeoImportacion,
  demo.guardarMapeoImportacion
);

export const remuneracionesExistentes = elegir(
  real.remuneracionesExistentes,
  demo.remuneracionesExistentes
);

// ---------- Autoservicio del legajo ----------

export const getMisSolicitudesDeLegajo = elegir(
  real.getMisSolicitudesDeLegajo,
  demo.getMisSolicitudesDeLegajo
);

export const getSolicitudesDeLegajo = elegir(
  real.getSolicitudesDeLegajo,
  demo.getSolicitudesDeLegajo
);

export const solicitarCambioDeLegajo = elegir(
  real.solicitarCambioDeLegajo,
  demo.solicitarCambioDeLegajo
);

export const anularSolicitudDeLegajo = elegir(
  real.anularSolicitudDeLegajo,
  demo.anularSolicitudDeLegajo
);

export const resolverSolicitudDeLegajo = elegir(
  real.resolverSolicitudDeLegajo,
  demo.resolverSolicitudDeLegajo
);

export const getParametrosLegales = elegir(
  real.getParametrosLegales,
  demo.getParametrosLegales
);
export const crearParametroLegal = elegir(
  real.crearParametroLegal,
  demo.crearParametroLegal
);
export const eliminarParametroLegal = elegir(
  real.eliminarParametroLegal,
  demo.eliminarParametroLegal
);

// ---------- Cierre de novedades del mes ----------
export const getCierrePeriodo = elegir(
  real.getCierrePeriodo,
  demo.getCierrePeriodo
);
export const getCierresPeriodo = elegir(
  real.getCierresPeriodo,
  demo.getCierresPeriodo
);
export const cerrarPeriodo = elegir(real.cerrarPeriodo, demo.cerrarPeriodo);
export const reabrirPeriodo = elegir(real.reabrirPeriodo, demo.reabrirPeriodo);
export const marcarCategoriaRevisada = elegir(
  real.marcarCategoriaRevisada,
  demo.marcarCategoriaRevisada
);
export const getDescuentosDeEmpresa = elegir(
  real.getDescuentosDeEmpresa,
  demo.getDescuentosDeEmpresa
);
export const getDatosNovedades = elegir(
  real.getDatosNovedades,
  demo.getDatosNovedades
);

// ---------- Reporte mensual (servicio de asesoría) ----------
export const getDatosReporte = elegir(
  real.getDatosReporte,
  demo.getDatosReporte
);

// ---------- Configuración de la plataforma ----------
export const getConfigPlataforma = elegir(
  real.getConfigPlataforma,
  demo.getConfigPlataforma
);
export const actualizarConfigPlataforma = elegir(
  real.actualizarConfigPlataforma,
  demo.actualizarConfigPlataforma
);

// ---------- Empleados ----------
export const getEmpleados = elegir(real.getEmpleados, demo.getEmpleados);
export const getEmpleadosConCuenta = elegir(
  real.getEmpleadosConCuenta,
  demo.getEmpleadosConCuenta
);
export const getEmpleadosTodos = elegir(
  real.getEmpleadosTodos,
  demo.getEmpleadosTodos
);
export const getEmpleado = elegir(real.getEmpleado, demo.getEmpleado);
export const getEquipo = elegir(real.getEquipo, demo.getEquipo);
export const crearEmpleado = elegir(real.crearEmpleado, demo.crearEmpleado);
export const actualizarEmpleado = elegir(
  real.actualizarEmpleado,
  demo.actualizarEmpleado
);
export const darDeBajaEmpleado = elegir(
  real.darDeBajaEmpleado,
  demo.darDeBajaEmpleado
);
export const toggleChecklistItem = elegir(
  real.toggleChecklistItem,
  demo.toggleChecklistItem
);

// ---------- Legajo ----------
export const getDocumentosDeEmpleado = elegir(
  real.getDocumentosDeEmpleado,
  demo.getDocumentosDeEmpleado
);
export const agregarDocumento = elegir(
  real.agregarDocumento,
  demo.agregarDocumento
);
export const quitarDocumento = elegir(
  real.quitarDocumento,
  demo.quitarDocumento
);

// ---------- Usuarios y permisos ----------
export const getUsuariosDeEmpresa = elegir(
  real.getUsuariosDeEmpresa,
  demo.getUsuariosDeEmpresa
);
export const getEquipoIseo = elegir(real.getEquipoIseo, demo.getEquipoIseo);
export const actualizarMiPerfil = elegir(
  real.actualizarMiPerfil,
  demo.actualizarMiPerfil
);
export const cambiarMiContrasena = elegir(
  real.cambiarMiContrasena,
  demo.cambiarMiContrasena
);
export const cambiarRolUsuario = elegir(
  real.cambiarRolUsuario,
  demo.cambiarRolUsuario
);
export const invitarUsuario = elegir(real.invitarUsuario, demo.invitarUsuario);
export const vincularUsuarioAEmpleado = elegir(
  real.vincularUsuarioAEmpleado,
  demo.vincularUsuarioAEmpleado
);
export const getEstadoDeCuentas = elegir(
  real.getEstadoDeCuentas,
  demo.getEstadoDeCuentas
);
export const reenviarInvitacion = elegir(
  real.reenviarInvitacion,
  demo.reenviarInvitacion
);
export const quitarAcceso = elegir(real.quitarAcceso, demo.quitarAcceso);
export const completarAlta = elegir(real.completarAlta, demo.completarAlta);

// ---------- Ausencias ----------
export const getAusencias = elegir(real.getAusencias, demo.getAusencias);
/** Las que se solapan con un rango. Evita traer el histórico entero. */
export const getAusenciasEntre = elegir(
  real.getAusenciasEntre,
  demo.getAusenciasEntre
);
export const getAusenciasDeEmpleado = elegir(
  real.getAusenciasDeEmpleado,
  demo.getAusenciasDeEmpleado
);
export const getAusenciasPendientes = elegir(
  real.getAusenciasPendientes,
  demo.getAusenciasPendientes
);
export const getVacacionesAprobadasDeEmpleados = elegir(
  real.getVacacionesAprobadasDeEmpleados,
  demo.getVacacionesAprobadasDeEmpleados
);
export const getVacacionesAprobadasMiSector = elegir(
  real.getVacacionesAprobadasMiSector,
  demo.getVacacionesAprobadasMiSector
);
export const crearAusencia = elegir(real.crearAusencia, demo.crearAusencia);
export const abrirAdjuntoAusencia = elegir(
  real.abrirAdjuntoAusencia,
  demo.abrirAdjuntoAusencia
);
export const eliminarAusencia = elegir(
  real.eliminarAusencia,
  demo.eliminarAusencia
);
export const resolverAusencia = elegir(
  real.resolverAusencia,
  demo.resolverAusencia
);
export const getVacacionesPendientes = elegir(
  real.getVacacionesPendientes,
  demo.getVacacionesPendientes
);
export const guardarVacacionesPendientes = elegir(
  real.guardarVacacionesPendientes,
  demo.guardarVacacionesPendientes
);
export const getSaldoVacaciones = elegir(
  real.getSaldoVacaciones,
  demo.getSaldoVacaciones
);

// ---------- Fichajes ----------
export const getFichajesDeHoy = elegir(
  real.getFichajesDeHoy,
  demo.getFichajesDeHoy
);
export const getFichajesEntre = elegir(
  real.getFichajesEntre,
  demo.getFichajesEntre
);
/** Una fila por empleado y día: lo agrupa la base, no el navegador. */
export const getJornadas = elegir(real.getJornadas, demo.getJornadas);
/** Movimientos sueltos, paginados del lado del servidor. */
export const getFichajesPagina = elegir(
  real.getFichajesPagina,
  demo.getFichajesPagina
);
export const getFichajesDeEmpleadoHoy = elegir(
  real.getFichajesDeEmpleadoHoy,
  demo.getFichajesDeEmpleadoHoy
);
export const ficharAhora = elegir(real.ficharAhora, demo.ficharAhora);
/** Fichaje facial: el rostro y la geocerca los valida el servidor. */
export const ficharConRostro = elegir(
  real.ficharConRostro,
  demo.ficharConRostro
);
/** Anulación auditable (F-12): exige motivo, no borra, sólo admin_rrhh. */
export const anularFichaje = elegir(real.anularFichaje, demo.anularFichaje);

// ---------- Reconocimiento facial ----------
export const enrolarRostro = elegir(real.enrolarRostro, demo.enrolarRostro);
export const borrarRostro = elegir(real.borrarRostro, demo.borrarRostro);
export const getDescriptoresFaciales = elegir(
  real.getDescriptoresFaciales,
  demo.getDescriptoresFaciales
);

// ---------- Turnos ----------
export const getTurnos = elegir(real.getTurnos, demo.getTurnos);
export const getTurnosDeEmpleado = elegir(
  real.getTurnosDeEmpleado,
  demo.getTurnosDeEmpleado
);
export const asignarTurno = elegir(real.asignarTurno, demo.asignarTurno);
export const asignarTurnos = elegir(real.asignarTurnos, demo.asignarTurnos);
export const aprobarExtrasDeJornada = elegir(
  real.aprobarExtrasDeJornada,
  demo.aprobarExtrasDeJornada
);
export const quitarTurno = elegir(real.quitarTurno, demo.quitarTurno);
export const getFichajesDeEmpleado = elegir(
  real.getFichajesDeEmpleado,
  demo.getFichajesDeEmpleado
);

// ---------- Terminales de fichaje ----------
export const getTerminales = elegir(real.getTerminales, demo.getTerminales);
/** Devuelve el secreto de la terminal UNA sola vez: no se puede recuperar. */
export const autorizarTerminal = elegir(
  real.autorizarTerminal,
  demo.autorizarTerminal
);
export const setTerminalActiva = elegir(
  real.setTerminalActiva,
  demo.setTerminalActiva
);
export const quitarTerminal = elegir(real.quitarTerminal, demo.quitarTerminal);

// ---------- Convenio colectivo ----------
export const getConvenios = elegir(real.getConvenios, demo.getConvenios);
export const crearConvenio = elegir(real.crearConvenio, demo.crearConvenio);
export const actualizarConvenio = elegir(
  real.actualizarConvenio,
  demo.actualizarConvenio
);
export const eliminarConvenio = elegir(
  real.eliminarConvenio,
  demo.eliminarConvenio
);

// ---------- Notas internas (solo admins) ----------
export const getNotasInternas = elegir(
  real.getNotasInternas,
  demo.getNotasInternas
);
export const agregarNotaInterna = elegir(
  real.agregarNotaInterna,
  demo.agregarNotaInterna
);
export const quitarNotaInterna = elegir(
  real.quitarNotaInterna,
  demo.quitarNotaInterna
);

// ---------- Alertas, agenda y notificaciones ----------
export const getAlertas = elegir(real.getAlertas, demo.getAlertas);
export const getEventosProximos = elegir(
  real.getEventosProximos,
  demo.getEventosProximos
);
export const crearEvento = elegir(real.crearEvento, demo.crearEvento);
export const getNotificaciones = elegir(
  real.getNotificaciones,
  demo.getNotificaciones
);
export const marcarNotificacionesLeidas = elegir(
  real.marcarNotificacionesLeidas,
  demo.marcarNotificacionesLeidas
);

// ---------- Reportes ----------
export const getResumenControl = elegir(
  real.getResumenControl,
  demo.getResumenControl
);
export const getMiMes = elegir(real.getMiMes, demo.getMiMes);
export const getHorasExtrasDelPeriodo = elegir(
  real.getHorasExtrasDelPeriodo,
  demo.getHorasExtrasDelPeriodo
);

// ---------- Remuneraciones y recibos ----------
export const getRemuneraciones = elegir(
  real.getRemuneraciones,
  demo.getRemuneraciones
);
export const getRemuneracionesDePeriodos = elegir(
  real.getRemuneracionesDePeriodos,
  demo.getRemuneracionesDePeriodos
);
export const getEmpleadosConSueldo = elegir(
  real.getEmpleadosConSueldo,
  demo.getEmpleadosConSueldo
);
export const getRemuneracionesTodas = elegir(
  real.getRemuneracionesTodas,
  demo.getRemuneracionesTodas
);
export const cargarRemuneracion = elegir(
  real.cargarRemuneracion,
  demo.cargarRemuneracion
);
export const getRecibos = elegir(real.getRecibos, demo.getRecibos);
export const getRecibosTodos = elegir(
  real.getRecibosTodos,
  demo.getRecibosTodos
);
export const getRecibosArchivados = elegir(
  real.getRecibosArchivados,
  demo.getRecibosArchivados
);
export const getRecibosArchivadosTodos = elegir(
  real.getRecibosArchivadosTodos,
  demo.getRecibosArchivadosTodos
);
export const hashDelRecibo = elegir(real.hashDelRecibo, demo.hashDelRecibo);
export const firmarRecibo = elegir(real.firmarRecibo, demo.firmarRecibo);
export const cargarRecibo = elegir(real.cargarRecibo, demo.cargarRecibo);
export const firmarReciboEmpleador = elegir(
  real.firmarReciboEmpleador,
  demo.firmarReciboEmpleador
);
export const getDescuentosRecurrentes = elegir(
  real.getDescuentosRecurrentes,
  demo.getDescuentosRecurrentes
);
export const tieneEmbargo = elegir(real.tieneEmbargo, demo.tieneEmbargo);
export const crearDescuentoRecurrente = elegir(
  real.crearDescuentoRecurrente,
  demo.crearDescuentoRecurrente
);
export const eliminarDescuentoRecurrente = elegir(
  real.eliminarDescuentoRecurrente,
  demo.eliminarDescuentoRecurrente
);
export const getAdelantos = elegir(real.getAdelantos, demo.getAdelantos);
export const solicitarAdelanto = elegir(
  real.solicitarAdelanto,
  demo.solicitarAdelanto
);
export const resolverAdelanto = elegir(
  real.resolverAdelanto,
  demo.resolverAdelanto
);
export const eliminarAdelanto = elegir(
  real.eliminarAdelanto,
  demo.eliminarAdelanto
);

// ---------- Errores registrados (soporte) ----------
export const getErroresApp = elegir(real.getErroresApp, demo.getErroresApp);
export const getAuditoria = elegir(real.getAuditoria, demo.getAuditoria);

// ---------- Feriados ----------
export const getFeriados = elegir(real.getFeriados, demo.getFeriados);
export const getFeriadosParaCalculo = elegir(
  real.getFeriadosParaCalculo,
  demo.getFeriadosParaCalculo
);
export const guardarFeriados = elegir(
  real.guardarFeriados,
  demo.guardarFeriados
);
export const eliminarFeriado = elegir(
  real.eliminarFeriado,
  demo.eliminarFeriado
);

// ---------- Archivos ----------
export const abrirRecibo = elegir(real.abrirRecibo, demo.abrirRecibo);
export const abrirDocumento = elegir(real.abrirDocumento, demo.abrirDocumento);

// ---------- Finanzas (superadmin) ----------
export const getResumenFinanzas = elegir(
  real.getResumenFinanzas,
  demo.getResumenFinanzas
);
export const getMovimientos = elegir(real.getMovimientos, demo.getMovimientos);
export const crearMovimiento = elegir(
  real.crearMovimiento,
  demo.crearMovimiento
);
export const eliminarMovimiento = elegir(
  real.eliminarMovimiento,
  demo.eliminarMovimiento
);
export const actualizarAbonoEmpresa = elegir(
  real.actualizarAbonoEmpresa,
  demo.actualizarAbonoEmpresa
);

// ---------- Features cliente ----------
export const eliminarRecibo = elegir(real.eliminarRecibo, demo.eliminarRecibo);
export const eliminarRemuneracion = elegir(
  real.eliminarRemuneracion,
  demo.eliminarRemuneracion
);
export const getFacturasMonotributo = elegir(
  real.getFacturasMonotributo,
  demo.getFacturasMonotributo
);
export const cargarFacturaMonotributo = elegir(
  real.cargarFacturaMonotributo,
  demo.cargarFacturaMonotributo
);
export const abrirFacturaMonotributo = elegir(
  real.abrirFacturaMonotributo,
  demo.abrirFacturaMonotributo
);
export const eliminarFacturaMonotributo = elegir(
  real.eliminarFacturaMonotributo,
  demo.eliminarFacturaMonotributo
);
export const getCuposLicencia = elegir(
  real.getCuposLicencia,
  demo.getCuposLicencia
);
export const guardarCupoLicencia = elegir(
  real.guardarCupoLicencia,
  demo.guardarCupoLicencia
);
export const getSaldosLicencia = elegir(
  real.getSaldosLicencia,
  demo.getSaldosLicencia
);
export const getComunicaciones = elegir(
  real.getComunicaciones,
  demo.getComunicaciones
);
export const getComunicacionesDeEmpleado = elegir(
  real.getComunicacionesDeEmpleado,
  demo.getComunicacionesDeEmpleado
);
export const crearComunicacion = elegir(
  real.crearComunicacion,
  demo.crearComunicacion
);
export const getMensajesComunicacion = elegir(
  real.getMensajesComunicacion,
  demo.getMensajesComunicacion
);
/**
 * No pasa por `elegir` porque esa función devuelve una promesa y acá hay
 * que entregar la baja de la suscripción de inmediato: el `useEffect`
 * que la usa necesita la función de limpieza en el mismo tick.
 */
export const suscribirMensajes = (
  comunicacionId: string,
  alLlegar: () => void
): (() => void) =>
  haySesionReal()
    ? real.suscribirMensajes(comunicacionId, alLlegar)
    : demo.suscribirMensajes();
export const responderComunicacion = elegir(
  real.responderComunicacion,
  demo.responderComunicacion
);
export const marcarComunicacionLeida = elegir(
  real.marcarComunicacionLeida,
  demo.marcarComunicacionLeida
);
export const getComunicacionesSinLeer = elegir(
  real.getComunicacionesSinLeer,
  demo.getComunicacionesSinLeer
);
export const cerrarComunicacion = elegir(
  real.cerrarComunicacion,
  demo.cerrarComunicacion
);
export const getDocumentosFirma = elegir(
  real.getDocumentosFirma,
  demo.getDocumentosFirma
);
export const getDocumentosFirmaPendientes = elegir(
  real.getDocumentosFirmaPendientes,
  demo.getDocumentosFirmaPendientes
);
export const getDestinatariosDocumento = elegir(
  real.getDestinatariosDocumento,
  demo.getDestinatariosDocumento
);
export const crearDocumentoFirma = elegir(
  real.crearDocumentoFirma,
  demo.crearDocumentoFirma
);
export const firmarDocumento = elegir(
  real.firmarDocumento,
  demo.firmarDocumento
);
export const abrirDocumentoFirma = elegir(
  real.abrirDocumentoFirma,
  demo.abrirDocumentoFirma
);
export const eliminarDocumentoFirma = elegir(
  real.eliminarDocumentoFirma,
  demo.eliminarDocumentoFirma
);
export const getPendientesResumen = elegir(
  real.getPendientesResumen,
  demo.getPendientesResumen
);
