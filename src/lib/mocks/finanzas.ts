import { MovimientoFinanciero } from '@/types/rrhh';
import { hoyISO } from '@/lib/fechas';

const hoy = hoyISO();
const periodoActual = hoy.slice(0, 7);
const diaBase = `${periodoActual}-03`;

/** Movimientos de ejemplo del mes en curso (fase demo). */
export const movimientosMock: MovimientoFinanciero[] = [
  {
    id: 'mov-1',
    tipo: 'ingreso',
    concepto: 'Abono mensual — Bombas del Sur S.A.',
    categoria: 'Abono',
    empresaId: 'emp-1',
    monto: 85000,
    fecha: diaBase,
    periodo: periodoActual,
  },
  {
    id: 'mov-2',
    tipo: 'ingreso',
    concepto: 'Implementación inicial — El Negro Holandés',
    categoria: 'Servicios',
    empresaId: 'emp-2',
    monto: 40000,
    fecha: `${periodoActual}-06`,
    periodo: periodoActual,
  },
  {
    id: 'mov-3',
    tipo: 'gasto',
    concepto: 'Infraestructura (hosting y base de datos)',
    categoria: 'Infraestructura',
    monto: 18000,
    fecha: `${periodoActual}-02`,
    periodo: periodoActual,
  },
  {
    id: 'mov-4',
    tipo: 'gasto',
    concepto: 'Honorarios contables',
    categoria: 'Servicios profesionales',
    monto: 22000,
    fecha: `${periodoActual}-05`,
    periodo: periodoActual,
  },
];
