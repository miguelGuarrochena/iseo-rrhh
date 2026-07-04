import {
  Icon,
  IconBuildingFactory2,
  IconCalendarClock,
  IconCalendarEvent,
  IconChartBar,
  IconClockCheck,
  IconFileCertificate,
  IconGavel,
  IconHome,
  IconId,
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
    etiqueta: 'Colaboradores',
    href: '/colaboradores',
    icono: IconUsers,
    roles: GESTION,
  },
  {
    etiqueta: 'Mi legajo',
    href: '/mi-legajo',
    icono: IconId,
    roles: ['empleado'],
  },
  {
    etiqueta: 'Ausencias',
    href: '/ausencias',
    icono: IconPlaneDeparture,
    roles: OPERATIVOS,
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
  },
  {
    etiqueta: 'Remuneraciones',
    href: '/remuneraciones',
    icono: IconReportMoney,
    roles: ['superadmin', ...OPERATIVOS],
  },
  {
    etiqueta: 'Agenda',
    href: '/agenda',
    icono: IconCalendarEvent,
    roles: OPERATIVOS,
  },
  {
    etiqueta: 'Organigrama',
    href: '/organigrama',
    icono: IconSitemap,
    roles: ['superadmin', ...GESTION],
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
    roles: ['superadmin', ...GESTION],
  },
  {
    etiqueta: 'Permisos',
    href: '/permisos',
    icono: IconShieldCheck,
    roles: ['superadmin', 'admin_rrhh'],
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
