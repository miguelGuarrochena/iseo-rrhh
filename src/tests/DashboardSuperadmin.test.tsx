import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import DashboardPage from '@/app/app/page';
import {
  getEmpresas,
  getEmpresasInicio,
  getMetricasGlobales,
  getResumenFinanzas,
} from '@/lib/services/rrhh';
import type { EmpresaResumen } from '@/types/rrhh';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

jest.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => ({
    usuario: {
      id: 'sa',
      email: 'ana@iseo.test',
      rol: 'superadmin',
      empresaId: null,
      empleadoId: null,
      nombreCompleto: 'Ana Super',
    },
    rolEfectivo: 'superadmin',
    entrarAEmpresa: jest.fn(),
  }),
}));

jest.mock('@/lib/auth/useModulos', () => ({
  useModulos: () => ({}),
}));

jest.mock('@/lib/services/rrhh', () => ({
  getEmpresasInicio: jest.fn(),
  getEmpresas: jest.fn(),
  getMetricasGlobales: jest.fn(),
  getResumenFinanzas: jest.fn(),
  getEventosProximos: jest.fn(),
  getEmpleado: jest.fn(),
  getMiMes: jest.fn(),
  getSaldoVacaciones: jest.fn(),
  getAusenciasDeEmpleado: jest.fn(),
  getVacacionesAprobadasMiSector: jest.fn(),
  getRecibos: jest.fn(),
  getAusenciasPendientes: jest.fn(),
  getEmpleados: jest.fn(),
  getFichajesDeHoy: jest.fn(),
  getAlertas: jest.fn(),
  getJornadas: jest.fn(),
  getEmpleadosConCuenta: jest.fn(),
  getEmpleadosConSueldo: jest.fn(),
}));

const cliente = (
  over: Partial<EmpresaResumen['empresa']> = {}
): EmpresaResumen => ({
  empresa: {
    id: 'emp-x',
    nombre: 'Cliente X',
    cuit: '30-11111111-1',
    estado: 'activa',
    contactoNombre: 'Rita',
    contactoEmail: 'rita@x.test',
    config: {
      metodosFichaje: ['celular'],
      toleranciaLlegadaTardeMin: 10,
      horaEntrada: '08:00',
      horaSalida: '17:00',
      diasAvisoVencimiento: 30,
    },
    creadaEn: '2026-08-01',
    ...over,
  },
  empleadosActivos: 4,
});

describe('inicio del superadmin', () => {
  beforeEach(() => {
    (getEmpresasInicio as jest.Mock).mockResolvedValue([
      cliente({ id: 'emp-nueva', nombre: 'Taller Nuevo' }),
      cliente({ id: 'emp-vieja', nombre: 'Taller Viejo' }),
    ]);
    (getMetricasGlobales as jest.Mock).mockResolvedValue({
      empresasActivas: 2,
      empresasSuspendidas: 0,
      empleadosGestionados: 8,
      solicitudesPendientes: 0,
    });
    (getResumenFinanzas as jest.Mock).mockResolvedValue({
      empresasVencidas: 0,
    });
  });

  it('pide el preview acotado, no el catálogo entero, y enlaza a /empresas', async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Taller Nuevo')).toBeInTheDocument();
    });
    expect(screen.getByText('Taller Viejo')).toBeInTheDocument();

    const verTodas = screen.getByRole('link', { name: /ver todas/i });
    expect(verTodas).toHaveAttribute('href', '/empresas');

    expect(getEmpresasInicio).toHaveBeenCalled();
    expect(getEmpresas).not.toHaveBeenCalled();
  });
});
