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
export const cambiarRolUsuario = elegir(
  real.cambiarRolUsuario,
  demo.cambiarRolUsuario
);
export const invitarUsuario = elegir(real.invitarUsuario, demo.invitarUsuario);

// ---------- Ausencias ----------
export const getAusencias = elegir(real.getAusencias, demo.getAusencias);
export const getAusenciasDeEmpleado = elegir(
  real.getAusenciasDeEmpleado,
  demo.getAusenciasDeEmpleado
);
export const getAusenciasPendientes = elegir(
  real.getAusenciasPendientes,
  demo.getAusenciasPendientes
);
export const crearAusencia = elegir(real.crearAusencia, demo.crearAusencia);
export const resolverAusencia = elegir(
  real.resolverAusencia,
  demo.resolverAusencia
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
export const getFichajesDeEmpleadoHoy = elegir(
  real.getFichajesDeEmpleadoHoy,
  demo.getFichajesDeEmpleadoHoy
);
export const ficharAhora = elegir(real.ficharAhora, demo.ficharAhora);

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
export const aprobarExtrasTurno = elegir(
  real.aprobarExtrasTurno,
  demo.aprobarExtrasTurno
);
export const quitarTurno = elegir(real.quitarTurno, demo.quitarTurno);
export const getFichajesDeEmpleado = elegir(
  real.getFichajesDeEmpleado,
  demo.getFichajesDeEmpleado
);

// ---------- Terminales de fichaje ----------
export const getTerminales = elegir(real.getTerminales, demo.getTerminales);
export const registrarTerminal = elegir(
  real.registrarTerminal,
  demo.registrarTerminal
);
export const quitarTerminal = elegir(real.quitarTerminal, demo.quitarTerminal);

// ---------- Convenio colectivo ----------
export const getConvenio = elegir(real.getConvenio, demo.getConvenio);
export const guardarConvenio = elegir(
  real.guardarConvenio,
  demo.guardarConvenio
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

// ---------- Remuneraciones y recibos ----------
export const getRemuneraciones = elegir(
  real.getRemuneraciones,
  demo.getRemuneraciones
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
export const firmarRecibo = elegir(real.firmarRecibo, demo.firmarRecibo);
export const cargarRecibo = elegir(real.cargarRecibo, demo.cargarRecibo);

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
