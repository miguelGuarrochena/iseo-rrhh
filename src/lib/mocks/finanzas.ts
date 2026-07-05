import { MovimientoFinanciero } from '@/types/rrhh';
import { hoyISO } from '@/lib/fechas';

const hoy = hoyISO();
const periodoActual = hoy.slice(0, 7);
const diaBase = `${periodoActual}-03`;

/** Devuelve el período (YYYY-MM) de hace n meses respecto de hoy. */
const periodoMenos = (n: number): string => {
  const d = new Date(`${periodoActual}-01T00:00:00`);
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 7);
};

/** Historial de abonos cobrados los meses anteriores (para el gráfico). */
const historial: MovimientoFinanciero[] = [1, 2, 3, 4].flatMap((n) => {
  const p = periodoMenos(n);
  return [
    {
      id: `mov-h1-${n}`,
      tipo: 'ingreso' as const,
      concepto: 'Abono mensual — Bombas del Sur S.A.',
      categoria: 'Abono',
      empresaId: 'emp-1',
      monto: 85000,
      fecha: `${p}-05`,
      periodo: p,
    },
    {
      id: `mov-h2-${n}`,
      tipo: 'ingreso' as const,
      concepto: 'Abono mensual — El Negro Holandés',
      categoria: 'Abono',
      empresaId: 'emp-2',
      monto: 60000,
      fecha: `${p}-08`,
      periodo: p,
    },
  ];
});

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
  ...historial,
];
