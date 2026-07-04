import {
  Icon,
  IconBuildingFactory2,
  IconCalendarClock,
  IconCalendarEvent,
  IconChartBar,
  IconClockCheck,
  IconFileCertificate,
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
    href: '/app',
    icono: IconHome,
    roles: ['superadmin', ...OPERATIVOS],
  },
  {
    etiqueta: 'Empresas',
    href: '/app/empresas',
    icono: IconBuildingFactory2,
    roles: ['superadmin'],
  },
  {
    etiqueta: 'Colaboradores',
    href: '/app/colaboradores',
    icono: IconUsers,
    roles: GESTION,
  },
  {
    etiqueta: 'Mi legajo',
    href: '/app/mi-legajo',
    icono: IconId,
    roles: ['empleado'],
  },
  {
    etiqueta: 'Ausencias',
    href: '/app/ausencias',
    icono: IconPlaneDeparture,
    roles: OPERATIVOS,
  },
  {
    etiqueta: 'Fichaje',
    href: '/app/fichaje',
    icono: IconClockCheck,
    roles: OPERATIVOS,
  },
  {
    etiqueta: 'Turnos',
    href: '/app/turnos',
    icono: IconCalendarClock,
    roles: OPERATIVOS,
  },
  {
    etiqueta: 'Recibos',
    href: '/app/recibos',
    icono: IconFileCertificate,
    roles: OPERATIVOS,
  },
  {
    etiqueta: 'Remuneraciones',
    href: '/app/remuneraciones',
    icono: IconReportMoney,
    roles: ['superadmin', ...OPERATIVOS],
  },
  {
    etiqueta: 'Agenda',
    href: '/app/agenda',
    icono: IconCalendarEvent,
    roles: OPERATIVOS,
  },
  {
    etiqueta: 'Organigrama',
    href: '/app/organigrama',
    icono: IconSitemap,
    roles: ['superadmin', ...GESTION],
  },
  {
    etiqueta: 'Reportes',
    href: '/app/reportes',
    icono: IconChartBar,
    roles: ['superadmin', ...GESTION],
  },
  {
    etiqueta: 'Permisos',
    href: '/app/permisos',
    icono: IconShieldCheck,
    roles: ['superadmin', 'admin_rrhh'],
  },
  {
    etiqueta: 'Configuración',
    href: '/app/configuracion',
    icono: IconSettings,
    roles: ['superadmin', 'admin_rrhh'],
  },
];

export const navItemsPorRol = (rol: Rol): NavItem[] =>
  navItems.filter((item) => item.roles.includes(rol));
