/**
 * Cálculos del módulo de remuneraciones: evolución salarial, aguinaldo
 * (SAC) y masa salarial. Las cargas patronales son una estimación.
 */
import { Remuneracion } from '@/types/rrhh';

/** Contribuciones patronales estimadas sobre el bruto (aprox.). */
export const CARGAS_PATRONALES = 0.27;

/** Aportes personales del empleado sobre el remunerativo. */
export const APORTES = {
  jubilacion: 0.11, // SIPA
  ley19032: 0.03, // PAMI
  obraSocial: 0.03, // obra social
} as const;

/** Total de aportes personales sobre el remunerativo (17%). */
export const APORTES_TOTAL =
  APORTES.jubilacion + APORTES.ley19032 + APORTES.obraSocial;

/** Aportes personales estimados sobre el sueldo remunerativo. */
export const calcularAportes = (remunerativo: number): number =>
  Math.round(Math.max(0, remunerativo) * APORTES_TOTAL);

/**
 * Calcula aportes y neto. Neto = remunerativo + no remunerativo − aportes −
 * otros descuentos.
 */
export const calcularLiquidacion = (d: {
  montoBruto: number;
  noRemunerativo?: number;
  otrosDescuentos?: number;
}): { aportes: number; neto: number } => {
  const aportes = calcularAportes(d.montoBruto);
  const neto = Math.round(
    d.montoBruto + (d.noRemunerativo ?? 0) - aportes - (d.otrosDescuentos ?? 0)
  );
  return { aportes, neto };
};

const semestreDe = (mes: number): 1 | 2 => (mes <= 6 ? 1 : 2);

export interface Aumento {
  periodo: string;
  desde: number;
  hasta: number;
  pct: number;
}

export interface AnalisisSalarial {
  /** Ordenadas ascendente por período. */
  ordenadas: Remuneracion[];
  ultima?: Remuneracion;
  /** Variación % del último bruto contra el anterior. */
  variacionPct?: number;
  /** Mejor remuneración bruta del semestre en curso. */
  mejorSemestreBruto: number;
  /** SAC estimado = mejor bruto del semestre / 2. */
  aguinaldoEstimado: number;
  /** Aumentos detectados (bruto que sube), más recientes primero. */
  aumentos: Aumento[];
}

export const analizarSalario = (
  remuneraciones: Remuneracion[],
  hoy: Date = new Date()
): AnalisisSalarial => {
  const ordenadas = [...remuneraciones].sort((a, b) =>
    a.periodo.localeCompare(b.periodo)
  );
  const ultima = ordenadas[ordenadas.length - 1];
  const anterior = ordenadas[ordenadas.length - 2];
  const variacionPct =
    ultima && anterior && anterior.montoBruto > 0
      ? ((ultima.montoBruto - anterior.montoBruto) / anterior.montoBruto) * 100
      : undefined;

  const anio = hoy.getFullYear();
  const sem = semestreDe(hoy.getMonth() + 1);
  const mejorSemestreBruto = ordenadas
    .filter((r) => {
      const [a, m] = r.periodo.split('-').map(Number);
      return a === anio && semestreDe(m) === sem;
    })
    .reduce((max, r) => Math.max(max, r.montoBruto), 0);

  const aumentos: Aumento[] = [];
  for (let i = 1; i < ordenadas.length; i++) {
    const desde = ordenadas[i - 1].montoBruto;
    const hasta = ordenadas[i].montoBruto;
    if (hasta > desde && desde > 0) {
      aumentos.push({
        periodo: ordenadas[i].periodo,
        desde,
        hasta,
        pct: ((hasta - desde) / desde) * 100,
      });
    }
  }

  return {
    ordenadas,
    ultima,
    variacionPct,
    mejorSemestreBruto,
    aguinaldoEstimado: mejorSemestreBruto / 2,
    aumentos: aumentos.reverse(),
  };
};

export interface FilaMasa {
  empleadoId: string;
  bruto: number;
  neto: number;
  periodo: string;
}

export interface ResumenMasa {
  cantidad: number;
  masaSalarialBruta: number;
  cargasSociales: number;
  costoTotal: number;
  costoPromedio: number;
  porEmpleado: FilaMasa[];
}

/**
 * Resume la masa salarial tomando la última remuneración de cada empleado.
 */
export const resumirMasa = (remuneraciones: Remuneracion[]): ResumenMasa => {
  const ultimaPorEmpleado = new Map<string, Remuneracion>();
  for (const r of remuneraciones) {
    const prev = ultimaPorEmpleado.get(r.empleadoId);
    if (!prev || r.periodo > prev.periodo)
      ultimaPorEmpleado.set(r.empleadoId, r);
  }
  const lista = [...ultimaPorEmpleado.values()];
  const masa = lista.reduce((a, r) => a + r.montoBruto, 0);
  const cargas = masa * CARGAS_PATRONALES;
  const costoTotal = masa + cargas;

  return {
    cantidad: lista.length,
    masaSalarialBruta: masa,
    cargasSociales: cargas,
    costoTotal,
    costoPromedio: lista.length ? costoTotal / lista.length : 0,
    porEmpleado: lista
      .map((r) => ({
        empleadoId: r.empleadoId,
        bruto: r.montoBruto,
        neto: r.montoNeto,
        periodo: r.periodo,
      }))
      .sort((a, b) => b.bruto - a.bruto),
  };
};
