import {
  Icon,
  IconAdjustments,
  IconBuildingFactory2,
  IconCashBanknote,
  IconCalendarClock,
  IconCalendarEvent,
  IconChartBar,
  IconClockCheck,
  IconFileCertificate,
  IconFileCheck,
  IconGavel,
  IconHome,
  IconId,
  IconLifebuoy,
  IconMessages,
  IconPlaneDeparture,
  IconReportMoney,
  IconSettings,
  IconShieldCheck,
  IconSitemap,
  IconUsers,
} from '@tabler/icons-react';
import { Rol } from '@/types/rrhh';

export interface NavItem {
  etiqueta: string;
  href: string;
  icono: Icon;
  roles: Rol[];
  /** Clave para badge de pendientes (opcional). */
  badgeKey?:
    | 'recibosPorFirmar'
    | 'ausenciasPorResolver'
    | 'comunicacionesSinLeer'
    | 'documentosPorFirmar';
  /**
   * Sección que la empresa puede apagar desde Configuración. Si no tiene
   * `modulo`, siempre se muestra: son las partes que no se negocian.
   */
  modulo?: ModuloOpcional;
}

/**
 * Secciones que se pueden encender y apagar por empresa.
 *
 * No están todas: Inicio, Mi legajo, Colaboradores, Ayuda, Permisos y
 * Configuración no se negocian. Sin legajo no hay a quién liquidarle ni
 * a quién darle acceso, y sin Permisos la empresa se queda sin forma de
 * administrar sus propios usuarios.
 */
export type ModuloOpcional =
  | 'fichaje'
  | 'turnos'
  | 'ausencias'
  | 'recibos'
  | 'remuneraciones'
  | 'documentos-firma'
  | 'organigrama'
  | 'convenio'
  | 'agenda'
  | 'comunicaciones'
  | 'reportes';

/**
 * Qué sección necesita a cuál. Se usa para avisar antes de apagar algo
 * de lo que cuelga otra cosa.
 *
 * El riesgo real es apagar una sección y dejar a otra a medias sin que
 * nadie lo note hasta que el cliente lo reporta. Por eso la pantalla de
 * módulos lo muestra en vez de dejarlo a criterio de quien configura.
 *
 * Leer `a: [b]` como "si se apaga b, a queda incompleta".
 */
export const DEPENDENCIAS_SECCION: Partial<
  Record<ModuloOpcional, ModuloOpcional[]>
> = {
  // El recibo es el PDF; los números (bruto, aportes, neto, adelantos,
  // horas extras) salen de Remuneraciones. Sin ella, Recibos es un
  // repositorio de archivos sin contexto.
  recibos: ['remuneraciones'],
  // El control de turnos compara lo planificado contra el fichaje real.
  // Sin Fichaje no hay contra qué comparar: quedan horarios escritos.
  turnos: ['fichaje'],
  // Remuneraciones sugiere las horas extras a partir del fichaje.
  // Funciona sin él, pero pierde ese cálculo y hay que cargarlo a mano.
  remuneraciones: ['fichaje'],
  // El calendario de Ausencias y el control de turnos se cruzan: una
  // licencia aprobada no debe contar como ausencia injustificada.
  ausencias: ['turnos'],
};

/** Qué se rompe si apago `modulo`: las secciones que dependen de él. */
export const dependenDe = (modulo: ModuloOpcional): ModuloOpcional[] =>
  (Object.keys(DEPENDENCIAS_SECCION) as ModuloOpcional[]).filter((seccion) =>
    DEPENDENCIAS_SECCION[seccion]?.includes(modulo)
  );

export interface ModuloInfo {
  clave: ModuloOpcional;
  etiqueta: string;
  /** Qué hace la sección, en una línea. */
  descripcion: string;
  /** Para quién tiene sentido apagarla. */
  cuandoApagarla: string;
}

/**
 * Catálogo de módulos. El texto está escrito para que quien configura
 * pueda decidir sin conocer la app por dentro: qué hace y cuándo no
 * sirve.
 */
export const MODULOS_OPCIONALES: ModuloInfo[] = [
  {
    clave: 'fichaje',
    etiqueta: 'Fichaje',
    descripcion:
      'Registro de entrada y salida por celular, tablet con reconocimiento facial o carga manual.',
    cuandoApagarla:
      'Si no se controla horario: equipos por objetivos, todos remotos o gente que factura por su cuenta.',
  },
  {
    clave: 'turnos',
    etiqueta: 'Turnos',
    descripcion:
      'Horarios planificados por persona y control de lo cumplido contra lo fichado.',
    cuandoApagarla:
      'Si todos tienen el mismo horario fijo y no hay rotación ni francos que planificar.',
  },
  {
    clave: 'ausencias',
    etiqueta: 'Ausencias',
    descripcion:
      'Pedidos de vacaciones y licencias, con aprobación, saldo por antigüedad y calendario del equipo.',
    cuandoApagarla:
      'Casi nunca. Es de las que más se usan aun en empresas chicas.',
  },
  {
    clave: 'recibos',
    etiqueta: 'Recibos',
    descripcion:
      'Publicación de los recibos de sueldo y firma digital con constancia de recepción.',
    cuandoApagarla:
      'Si los recibos se siguen entregando en papel o los manda el estudio contable por otro medio.',
  },
  {
    clave: 'remuneraciones',
    etiqueta: 'Remuneraciones',
    descripcion:
      'Sueldos por período, adelantos, descuentos fijos, masa salarial y aguinaldo.',
    cuandoApagarla:
      'Si la liquidación la lleva enteramente el contador y no se quiere duplicar la información acá.',
  },
  {
    clave: 'documentos-firma',
    etiqueta: 'A firmar',
    descripcion:
      'Envío de documentos (políticas, notificaciones, acuerdos) para que el colaborador los firme.',
    cuandoApagarla:
      'Si no se circulan documentos para firmar más allá del recibo.',
  },
  {
    clave: 'organigrama',
    etiqueta: 'Organigrama',
    descripcion: 'Vista del "reporta a" de cada colaborador.',
    cuandoApagarla:
      'Si no hay una estructura de supervisión armada: queda un dibujo plano que no aporta.',
  },
  {
    clave: 'convenio',
    etiqueta: 'Convenio',
    descripcion:
      'El texto del convenio colectivo, consultable y con asistente para preguntarle.',
    cuandoApagarla:
      'Si el personal está fuera de convenio o cada uno se rige por uno distinto.',
  },
  {
    clave: 'agenda',
    etiqueta: 'Agenda',
    descripcion:
      'Eventos, capacitaciones y cumpleaños, junto con los vencimientos que calcula el sistema.',
    cuandoApagarla:
      'Si la empresa ya lleva su calendario en otra herramienta y no quiere duplicarlo.',
  },
  {
    clave: 'comunicaciones',
    etiqueta: 'Comunicaciones',
    descripcion:
      'Canal de consultas, reclamos y pedidos entre el colaborador y RRHH, con historial.',
    cuandoApagarla:
      'Si la comunicación se maneja por otro canal y nadie va a mirar esta bandeja.',
  },
  {
    clave: 'reportes',
    etiqueta: 'Reportes',
    descripcion:
      'Indicadores de ausentismo, llegadas tarde y horas extras, con exportación a CSV.',
    cuandoApagarla:
      'Si nadie mira indicadores todavía. Se puede prender más adelante sin perder nada.',
  },
];

const OPERATIVOS: Rol[] = ['admin_rrhh', 'supervisor', 'empleado'];
const GESTION: Rol[] = ['admin_rrhh', 'supervisor'];

export const navItems: NavItem[] = [
  {
    etiqueta: 'Inicio',
    href: '/',
    icono: IconHome,
    roles: ['superadmin', ...OPERATIVOS],
  },
  {
    etiqueta: 'Empresas',
    href: '/empresas',
    icono: IconBuildingFactory2,
    roles: ['superadmin'],
  },
  {
    etiqueta: 'Finanzas',
    href: '/finanzas',
    icono: IconCashBanknote,
    roles: ['superadmin'],
  },
  {
    // Lo de ISEO. La Configuración de más abajo es la de cada empresa:
    // son dos cosas distintas y por eso no comparten nombre.
    etiqueta: 'Plataforma',
    href: '/plataforma',
    icono: IconAdjustments,
    roles: ['superadmin'],
  },
  {
    etiqueta: 'Colaboradores',
    href: '/colaboradores',
    icono: IconUsers,
    roles: GESTION,
  },
  {
    etiqueta: 'Mi legajo',
    href: '/mi-legajo',
    icono: IconId,
    roles: OPERATIVOS,
  },
  {
    etiqueta: 'Ausencias',
    href: '/ausencias',
    icono: IconPlaneDeparture,
    roles: OPERATIVOS,
    badgeKey: 'ausenciasPorResolver',
    modulo: 'ausencias',
  },
  {
    etiqueta: 'Fichaje',
    href: '/fichaje',
    icono: IconClockCheck,
    roles: OPERATIVOS,
    modulo: 'fichaje',
  },
  {
    etiqueta: 'Turnos',
    href: '/turnos',
    icono: IconCalendarClock,
    roles: OPERATIVOS,
    modulo: 'turnos',
  },
  {
    etiqueta: 'Recibos',
    href: '/recibos',
    icono: IconFileCertificate,
    roles: OPERATIVOS,
    badgeKey: 'recibosPorFirmar',
    modulo: 'recibos',
  },
  {
    etiqueta: 'Remuneraciones',
    href: '/remuneraciones',
    icono: IconReportMoney,
    roles: OPERATIVOS,
    modulo: 'remuneraciones',
  },
  {
    etiqueta: 'Agenda',
    href: '/agenda',
    icono: IconCalendarEvent,
    roles: OPERATIVOS,
    modulo: 'agenda',
  },
  {
    etiqueta: 'Comunicaciones',
    href: '/comunicaciones',
    icono: IconMessages,
    roles: OPERATIVOS,
    badgeKey: 'comunicacionesSinLeer',
    modulo: 'comunicaciones',
  },
  {
    etiqueta: 'A firmar',
    href: '/documentos-firma',
    icono: IconFileCheck,
    roles: OPERATIVOS,
    badgeKey: 'documentosPorFirmar',
    modulo: 'documentos-firma',
  },
  {
    etiqueta: 'Organigrama',
    href: '/organigrama',
    icono: IconSitemap,
    roles: GESTION,
    modulo: 'organigrama',
  },
  {
    etiqueta: 'Convenio',
    href: '/convenio',
    icono: IconGavel,
    roles: OPERATIVOS,
    modulo: 'convenio',
  },
  {
    etiqueta: 'Reportes',
    href: '/reportes',
    icono: IconChartBar,
    roles: GESTION,
    modulo: 'reportes',
  },
  {
    // De una empresa: invita usuarios a ESA empresa. Al superadmin le
    // aparece cuando entra a un cliente (ahí su rol efectivo es admin).
    // En su menú suelto no iba: no hay empresa sobre la cual dar permisos.
    etiqueta: 'Permisos',
    href: '/permisos',
    icono: IconShieldCheck,
    roles: ['admin_rrhh'],
  },
  {
    etiqueta: 'Ayuda',
    href: '/ayuda',
    icono: IconLifebuoy,
    roles: ['superadmin', ...OPERATIVOS],
  },
  {
    // Los parámetros de una empresa. Lo de ISEO está en Plataforma.
    etiqueta: 'Configuración',
    href: '/configuracion',
    icono: IconSettings,
    roles: ['admin_rrhh'],
  },
];

/**
 * ¿La empresa tiene encendido ese módulo? Sin configuración guardada, sí:
 * apagar es una decisión explícita, no el estado por defecto.
 */
export const moduloActivo = (
  modulo: ModuloOpcional | undefined,
  modulos?: Record<string, boolean>
): boolean => (modulo ? modulos?.[modulo] !== false : true);

export const navItemsPorRol = (
  rol: Rol,
  modulos?: Record<string, boolean>
): NavItem[] =>
  navItems.filter(
    (item) => item.roles.includes(rol) && moduloActivo(item.modulo, modulos)
  );

/**
 * Secciones que conviene tener a un toque en el celular o la tablet.
 * El resto va a "Más". Fichaje va segundo: en una tablet de planta era
 * el que más se buscaba y quedaba escondido detrás del menú.
 */
const PRIORIDAD_BARRA = [
  '/',
  '/fichaje',
  '/colaboradores',
  '/ausencias',
  '/mi-legajo',
  '/recibos',
];

/**
 * Arma las pestañas de la barra inferior: las más usadas adelante, y
 * "Más" si no entran todas o si hay que dejar lugar a una acción extra
 * (salir de la empresa).
 */
export const tabsDeBarra = (
  items: NavItem[],
  maxTabs: number,
  forzarMas = false
): { tabs: NavItem[]; resto: NavItem[]; conMas: boolean } => {
  const conMas = items.length > maxTabs || forzarMas;
  const cupo = conMas
    ? Math.max(maxTabs - 1, 1)
    : Math.min(maxTabs, items.length);
  const porHref = new Map(items.map((i) => [i.href, i]));
  const tabs: NavItem[] = [];
  for (const href of PRIORIDAD_BARRA) {
    if (tabs.length >= cupo) break;
    const item = porHref.get(href);
    if (item) tabs.push(item);
  }
  for (const item of items) {
    if (tabs.length >= cupo) break;
    if (!tabs.some((t) => t.href === item.href)) tabs.push(item);
  }
  const enTabs = new Set(tabs.map((t) => t.href));
  const resto = items.filter((i) => !enTabs.has(i.href));
  return { tabs, resto, conMas: conMas || resto.length > 0 };
};
