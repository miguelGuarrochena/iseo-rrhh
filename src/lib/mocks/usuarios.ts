import { Usuario } from '@/types/rrhh';

export const usuariosMock: Usuario[] = [
  {
    id: 'usr-super',
    email: 'miguel@iseo-rh.com',
    rol: 'superadmin',
    empresaId: null,
    empleadoId: null,
    nombreCompleto: 'Miguel Guarrochena',
  },
  {
    id: 'usr-admin',
    email: 'rrhh@bombasdelsur.com',
    rol: 'admin_rrhh',
    empresaId: 'emp-1',
    empleadoId: 'ple-1',
    nombreCompleto: 'Carolina Méndez',
  },
  {
    id: 'usr-super-1',
    email: 'supervisor@bombasdelsur.com',
    rol: 'supervisor',
    empresaId: 'emp-1',
    empleadoId: 'ple-2',
    nombreCompleto: 'Jorge Ríos',
  },
  {
    id: 'usr-empleado',
    email: 'empleado@bombasdelsur.com',
    rol: 'empleado',
    empresaId: 'emp-1',
    empleadoId: 'ple-3',
    nombreCompleto: 'Lucas Pereyra',
  },
];
