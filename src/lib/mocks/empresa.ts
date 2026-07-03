import { ConfigEmpresa, Empresa } from '@/types/rrhh';

const configBase: ConfigEmpresa = {
  metodosFichaje: ['facial_tablet', 'celular'],
  toleranciaLlegadaTardeMin: 10,
  horaEntrada: '08:00',
  horaSalida: '17:00',
  diasAvisoVencimiento: 30,
};

/**
 * Array mutable en memoria: crearEmpresa/actualizar operan sobre él.
 * Se reinicia al recargar la página (fase mock).
 */
export const empresasMock: Empresa[] = [
  {
    id: 'emp-1',
    nombre: 'Bombas del Sur S.A.',
    cuit: '30-71234567-1',
    estado: 'activa',
    contactoNombre: 'Carolina Méndez',
    contactoEmail: 'rrhh@bombasdelsur.com',
    config: configBase,
    creadaEn: '2026-01-05',
  },
  {
    id: 'emp-2',
    nombre: 'El Negro Holandés',
    cuit: '30-70987654-2',
    estado: 'activa',
    contactoNombre: 'Federico Álvarez',
    contactoEmail: 'admin@negroholandes.com',
    config: { ...configBase, metodosFichaje: ['celular'] },
    creadaEn: '2026-03-18',
  },
  {
    id: 'emp-3',
    nombre: 'Distribuidora Pampa SRL',
    cuit: '30-69555444-9',
    estado: 'suspendida',
    contactoNombre: 'Mariana López',
    contactoEmail: 'ml@dpampa.com.ar',
    config: configBase,
    creadaEn: '2026-02-02',
  },
];

/** Dotación mock de las empresas sin empleados cargados en detalle */
export const dotacionMock: Record<string, number> = {
  'emp-2': 11,
  'emp-3': 4,
};

export const empresaMock = empresasMock[0];
