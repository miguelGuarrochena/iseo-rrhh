import {
  Icon,
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
    | 'comunicacionesAbiertas'
    | 'documentosPorFirmar';
}

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
  },
  {
    etiqueta: 'Fichaje',
    href: '/fichaje',
    icono: IconClockCheck,
    roles: OPERATIVOS,
  },
  {
    etiqueta: 'Turnos',
    href: '/turnos',
    icono: IconCalendarClock,
    roles: OPERATIVOS,
  },
  {
    etiqueta: 'Recibos',
    href: '/recibos',
    icono: IconFileCertificate,
    roles: OPERATIVOS,
    badgeKey: 'recibosPorFirmar',
  },
  {
    etiqueta: 'Remuneraciones',
    href: '/remuneraciones',
    icono: IconReportMoney,
    roles: OPERATIVOS,
  },
  {
    etiqueta: 'Agenda',
    href: '/agenda',
    icono: IconCalendarEvent,
    roles: OPERATIVOS,
  },
  {
    etiqueta: 'Comunicaciones',
    href: '/comunicaciones',
    icono: IconMessages,
    roles: OPERATIVOS,
    badgeKey: 'comunicacionesAbiertas',
  },
  {
    etiqueta: 'A firmar',
    href: '/documentos-firma',
    icono: IconFileCheck,
    roles: OPERATIVOS,
    badgeKey: 'documentosPorFirmar',
  },
  {
    etiqueta: 'Organigrama',
    href: '/organigrama',
    icono: IconSitemap,
    roles: GESTION,
  },
  {
    etiqueta: 'Convenio',
    href: '/convenio',
    icono: IconGavel,
    roles: OPERATIVOS,
  },
  {
    etiqueta: 'Reportes',
    href: '/reportes',
    icono: IconChartBar,
    roles: GESTION,
  },
  {
    etiqueta: 'Permisos',
    href: '/permisos',
    icono: IconShieldCheck,
    roles: ['superadmin', 'admin_rrhh'],
  },
  {
    etiqueta: 'Ayuda',
    href: '/ayuda',
    icono: IconLifebuoy,
    roles: ['superadmin', ...OPERATIVOS],
  },
  {
    etiqueta: 'Configuración',
    href: '/configuracion',
    icono: IconSettings,
    roles: ['superadmin', 'admin_rrhh'],
  },
];

export const navItemsPorRol = (rol: Rol): NavItem[] =>
  navItems.filter((item) => item.roles.includes(rol));
