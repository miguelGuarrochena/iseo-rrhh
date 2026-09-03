import React from 'react';
import { render, screen } from '@testing-library/react';
import ModulosEmpresaPage from '@/app/app/empresas/[id]/modulos/page';
import { navItemsPorRol } from '@/components/app/navItems';
import { getEmpresaPorId } from '@/lib/services/rrhh';
import type { Empresa, Rol } from '@/types/rrhh';

/**
 * Quién administra las secciones de una empresa.
 *
 * El modelo no cambia: `superadmin` es el equipo de ISEO y `admin_rrhh` el
 * administrador del cliente. Lo que estaba roto era la navegación: adentro
 * de una empresa el superadmin opera con `rolEfectivo` de admin_rrhh, así
 * que el ítem "Empresas" desaparece del menú y desde Configuración no
 * quedaba ningún camino hasta los interruptores. El atajo que se agregó es
 * de navegación y nada más; el permiso lo sigue poniendo esta pantalla (y,
 * abajo de todo, el trigger `columnas_de_iseo`).
 */

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'emp-1' }),
}));

const usuarioMock = jest.fn();
jest.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => usuarioMock(),
}));

jest.mock('@/lib/auth/useModulos', () => ({
  olvidarCapacidades: jest.fn(),
}));

jest.mock('@/lib/avisos', () => ({
  avisoExito: jest.fn(),
  avisoError: jest.fn(),
}));

jest.mock('@/lib/services/rrhh', () => ({
  getEmpresaPorId: jest.fn(),
  actualizarModulosEmpresa: jest.fn(),
  actualizarServiciosEmpresa: jest.fn(),
}));

const empresa = {
  id: 'emp-1',
  nombre: 'Cliente SA',
  cuit: '30-1',
  estado: 'activa',
  contactoNombre: 'Ana',
  contactoEmail: 'a@a.com',
  config: { modulos: { reportes: false } },
  servicios: {},
  regimen: 'relacion_dependencia',
  creadaEn: '2026-01-01',
} as unknown as Empresa;

/** Cómo entra alguien a la pantalla, con su rol crudo y su contexto. */
const sesion = (rol: Rol, empresaVista: Empresa | null = null) => ({
  usuario: {
    id: 'u-1',
    email: 'x@t.test',
    rol,
    empresaId: rol === 'superadmin' ? null : 'emp-1',
    empleadoId: null,
    nombreCompleto: 'Quien Sea',
  },
  // Adentro de una empresa el superadmin baja a admin_rrhh: es
  // exactamente el contexto en el que antes se quedaba sin acceso.
  rolEfectivo: rol === 'superadmin' && empresaVista ? 'admin_rrhh' : rol,
  empresaVista,
});

const NEGADA = /Solo el dueño de la plataforma/i;

beforeEach(() => {
  (
    getEmpresaPorId as jest.MockedFunction<typeof getEmpresaPorId>
  ).mockResolvedValue(empresa);
});

describe('acceso a Empresas → Módulos', () => {
  it('el superadmin entra y ve los interruptores', async () => {
    usuarioMock.mockReturnValue(sesion('superadmin'));
    render(<ModulosEmpresaPage />);

    expect(await screen.findByText(/Módulos de Cliente SA/i)).toBeVisible();
    expect(screen.queryByText(NEGADA)).not.toBeInTheDocument();
    // Los switches de secciones y de servicios contratados.
    expect(screen.getByText('Secciones')).toBeInTheDocument();
    expect(screen.getByText('Servicios contratados')).toBeInTheDocument();
  });

  it('sigue entrando mientras está adentro de esa empresa', async () => {
    // El guard mira el rol CRUDO, no el efectivo: si mirara el efectivo,
    // el superadmin quedaría afuera de su propia pantalla al visitar un
    // cliente, que es de donde salió el problema.
    usuarioMock.mockReturnValue(sesion('superadmin', empresa));
    render(<ModulosEmpresaPage />);

    expect(await screen.findByText(/Módulos de Cliente SA/i)).toBeVisible();
    expect(screen.queryByText(NEGADA)).not.toBeInTheDocument();
  });

  it('el admin del cliente no entra', async () => {
    usuarioMock.mockReturnValue(sesion('admin_rrhh'));
    render(<ModulosEmpresaPage />);

    expect(await screen.findByText(NEGADA)).toBeVisible();
    expect(screen.queryByText('Secciones')).not.toBeInTheDocument();
    expect(screen.queryByText('Servicios contratados')).not.toBeInTheDocument();
  });

  it('el supervisor y el empleado tampoco', async () => {
    for (const rol of ['supervisor', 'empleado'] as Rol[]) {
      usuarioMock.mockReturnValue(sesion(rol));
      const { unmount } = render(<ModulosEmpresaPage />);
      expect(await screen.findByText(NEGADA)).toBeVisible();
      unmount();
    }
  });
});

describe('el atajo no le suma permisos a nadie más', () => {
  it('"Empresas" sigue siendo sólo del superadmin en el menú', () => {
    const hrefs = (rol: Rol) => navItemsPorRol(rol).map((i) => i.href);

    expect(hrefs('superadmin')).toContain('/empresas');
    expect(hrefs('admin_rrhh')).not.toContain('/empresas');
    expect(hrefs('supervisor')).not.toContain('/empresas');
    expect(hrefs('empleado')).not.toContain('/empresas');
  });

  it('el admin del cliente conserva lo suyo: Configuración y Permisos', () => {
    // El arreglo de navegación no podía recortarle nada al cliente.
    const hrefs = navItemsPorRol('admin_rrhh').map((i) => i.href);
    expect(hrefs).toContain('/configuracion');
    expect(hrefs).toContain('/permisos');
    expect(hrefs).toContain('/colaboradores');
  });
});
