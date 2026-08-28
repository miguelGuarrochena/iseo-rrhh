'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  IconInfoCircle,
  IconPlus,
  IconReceipt2,
  IconRepeat,
  IconTrash,
  IconTrendingDown,
  IconTrendingUp,
  IconWallet,
} from '@tabler/icons-react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { Panel } from '@/components/app/Panel';
import { StatCard } from '@/components/app/dashboard/StatCard';
import { Boton } from '@/components/app/ui/Boton';
import { CampoMes } from '@/components/app/ui/CampoMes';
import { useConfirmacion } from '@/components/app/ui/useConfirmacion';
import { MovimientoModal } from '@/components/app/finanzas/MovimientoModal';
import { AbonoModal } from '@/components/app/finanzas/AbonoModal';
import { BarrasIngresoGasto } from '@/components/app/finanzas/BarrasIngresoGasto';
import {
  faltaDeCuota,
  ordenarPorCuota,
  TarjetaCuota,
} from '@/components/app/finanzas/TarjetaCuota';
import { formatearPesos } from '@/lib/formato';
import { formatearPeriodo, hoyISO, sumarMesesEmpresa } from '@/lib/fechas';
import { avisoError, avisoExito } from '@/lib/avisos';
import {
  crearMovimiento,
  eliminarMovimiento,
  getEmpresas,
  getMovimientos,
  getResumenFinanzas,
} from '@/lib/services/rrhh';
import {
  EmpresaResumen,
  FacturacionEmpresa,
  MovimientoFinanciero,
  TipoMovimiento,
} from '@/types/rrhh';
import { BloqueError } from '@/components/app/EstadoCarga';
import { useCarga } from '@/lib/useCarga';

const periodoActual = hoyISO().slice(0, 7);

const MESES = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];

/**
 * Últimos 6 períodos (YYYY-MM) terminando en el actual.
 *
 * Aritmética de meses sobre el período, sin `Date` de por medio: es la
 * misma cuenta que hace la ficha de empresa, y tenerla dos veces era
 * cómo una de las dos terminó corrida un mes.
 */
const ultimosPeriodos = (): string[] =>
  Array.from({ length: 6 }, (_, i) =>
    sumarMesesEmpresa(periodoActual, -(5 - i))
  );

const FinanzasPage = () => {
  const { usuario } = useAuth();
  const router = useRouter();
  const [periodo, setPeriodo] = useState(periodoActual);
  const [modalTipo, setModalTipo] = useState<TipoMovimiento | null>(null);
  const [abonoEmpresa, setAbonoEmpresa] = useState<FacturacionEmpresa | null>(
    null
  );
  const { confirmar, dialogo: dialogoConfirmar } = useConfirmacion();

  const cResumen = useCarga(() => getResumenFinanzas(periodo), [periodo], {
    contexto: 'finanzas/resumen',
  });
  const resumen = cResumen.datos ?? null;

  const cMovimientos = useCarga(() => getMovimientos(periodo), [periodo], {
    contexto: 'finanzas/movimientos',
    inicial: [] as MovimientoFinanciero[],
  });
  const movimientos = cMovimientos.datos;

  // Todos los períodos: alimenta el gráfico de evolución.
  const cTodos = useCarga(() => getMovimientos(), [], {
    contexto: 'finanzas/historico',
    inicial: [] as MovimientoFinanciero[],
  });
  const todos = cTodos.datos;

  const cEmpresas = useCarga(() => getEmpresas(), [], {
    contexto: 'finanzas/empresas',
    inicial: [] as EmpresaResumen[],
  });
  const empresas = useMemo(
    () => cEmpresas.datos.map((e) => e.empresa),
    [cEmpresas.datos]
  );

  const cargar = useCallback(() => {
    cResumen.recargar();
    cMovimientos.recargar();
    cTodos.recargar();
  }, [cResumen, cMovimientos, cTodos]);

  useEffect(() => {
    if (usuario && usuario.rol !== 'superadmin') {
      router.replace('/');
    }
  }, [usuario, router]);

  if (!usuario || usuario.rol !== 'superadmin') return null;

  const ingresos = movimientos.filter((m) => m.tipo === 'ingreso');
  const gastos = movimientos.filter((m) => m.tipo === 'gasto');
  const facturacion = [...(resumen?.facturacion ?? [])].sort(ordenarPorCuota);
  const vencidas = facturacion.filter(
    (f) => f.estado === 'activa' && f.abonoMensual > 0 && !f.alDia
  );
  const faltaTotal = vencidas.reduce((a, f) => a + faltaDeCuota(f), 0);

  const serieMensual = ultimosPeriodos().map((p) => {
    const delMes = todos.filter((m) => m.periodo === p);
    return {
      label: MESES[Number(p.slice(5, 7)) - 1],
      ingreso: delMes
        .filter((m) => m.tipo === 'ingreso')
        .reduce((a, m) => a + m.monto, 0),
      gasto: delMes
        .filter((m) => m.tipo === 'gasto')
        .reduce((a, m) => a + m.monto, 0),
    };
  });

  const registrarPago = async (f: FacturacionEmpresa) => {
    const falta = faltaDeCuota(f);
    if (falta <= 0) return;
    const ok = await confirmar({
      titulo: `¿Registramos ${formatearPesos(falta)}?`,
      detalle: `Se carga un ingreso de ${f.nombre} por la cuota de ${formatearPeriodo(periodo)}.`,
      confirmar: 'Registrar pago',
    });
    if (!ok) return;
    const fecha = periodo === periodoActual ? hoyISO() : `${periodo}-15`;
    try {
      await crearMovimiento({
        tipo: 'ingreso',
        concepto: `Cuota ${formatearPeriodo(periodo)} — ${f.nombre}`,
        categoria: 'Cuota',
        empresaId: f.empresaId,
        monto: falta,
        fecha,
      });
      avisoExito('Pago registrado', `${f.nombre}: ${formatearPesos(falta)}`);
      cargar();
    } catch (err) {
      avisoError(
        'No pudimos registrar el pago',
        err instanceof Error ? err.message : undefined
      );
    }
  };

  const borrar = async (id: string) => {
    try {
      await eliminarMovimiento(id);
      cargar();
    } catch (err) {
      avisoError(
        'No pudimos eliminar',
        err instanceof Error ? err.message : undefined
      );
    }
  };

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[1.75rem]">
            Finanzas
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-soft">
            Cuánto te pagan las empresas, y en qué se te va la plata.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="w-full sm:w-44">
            <CampoMes
              etiqueta="Período"
              value={periodo}
              onChange={setPeriodo}
            />
          </div>
          <Boton variante="secundario" onClick={() => setModalTipo('gasto')}>
            <IconTrendingDown size={18} />
            Gasto
          </Boton>
          <Boton onClick={() => setModalTipo('ingreso')}>
            <IconPlus size={18} />
            Ingreso
          </Boton>
        </div>
      </div>

      {vencidas.length > 0 && (
        <div className="rounded-3xl border border-brand-200 bg-paper p-4 sm:p-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
              <IconInfoCircle size={19} stroke={2} />
            </span>
            <div className="min-w-0">
              <p className="text-[0.9375rem] font-bold text-ink">
                {vencidas.length === 1
                  ? `Todavía falta la cuota de ${vencidas[0].nombre}`
                  : `Todavía faltan ${vencidas.length} cuotas de ${formatearPeriodo(periodo)}`}
              </p>
              <p className="mt-0.5 text-sm text-ink-soft">
                En total, {formatearPesos(faltaTotal)}.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Las tarjetas muestran "…" mientras cargan: un fallo se leería
          como "cero ingresos este mes". */}
      {cResumen.fase === 'error' && cResumen.error && (
        <BloqueError error={cResumen.error} onReintentar={cResumen.recargar} />
      )}

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard
          etiqueta="Ingresos del mes"
          valor={resumen ? formatearPesos(resumen.ingresosDelMes) : '…'}
          icono={IconTrendingUp}
        />
        <StatCard
          etiqueta="Gastos del mes"
          valor={resumen ? formatearPesos(resumen.gastosDelMes) : '…'}
          icono={IconTrendingDown}
        />
        <StatCard
          etiqueta="Neto del mes"
          valor={resumen ? formatearPesos(resumen.neto) : '…'}
          detalle={resumen && resumen.neto < 0 ? 'en rojo' : 'a favor'}
          icono={IconWallet}
        />
        <StatCard
          etiqueta="Ingreso recurrente"
          valor={resumen ? formatearPesos(resumen.mrr) : '…'}
          detalle={
            resumen
              ? resumen.empresasVencidas === 0
                ? 'todas pagaron este mes'
                : `${resumen.empresasAlDia} pagaron · ${resumen.empresasVencidas} no`
              : 'cuotas mensuales'
          }
          icono={IconRepeat}
        />
      </div>

      <Panel>
        <h2 className="text-[1.0625rem] font-bold tracking-tight text-ink">
          Ingresos y gastos — últimos meses
        </h2>
        <BarrasIngresoGasto datos={serieMensual} />
      </Panel>

      <Panel
        titulo={`Cuotas de ${formatearPeriodo(periodo)}`}
        descripcion="Cada cliente te debe una cuota por mes. Recibido es lo que ya te llegó vinculado a esa empresa. El resto, falta."
      >
        {facturacion.length === 0 ? (
          <p className="text-sm text-ink-soft">
            Todavía no hay empresas para facturar.
          </p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {facturacion.map((f) => (
              <TarjetaCuota
                key={f.empresaId}
                factura={f}
                onEditarCuota={() => setAbonoEmpresa(f)}
                onRegistrarPago={() => void registrarPago(f)}
              />
            ))}
          </div>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <MovimientoLista
          titulo="Ingresos del mes"
          vacio="Sin ingresos cargados."
          items={ingresos}
          onBorrar={borrar}
          positivo
          aviso={
            ingresos.some((m) => !m.empresaId) && vencidas.length > 0
              ? 'Hay ingresos sin empresa: no cuentan para ninguna cuota.'
              : undefined
          }
        />
        <MovimientoLista
          titulo="Gastos del mes"
          vacio="Sin gastos cargados."
          items={gastos}
          onBorrar={borrar}
        />
      </div>

      <MovimientoModal
        abierto={modalTipo !== null}
        tipo={modalTipo ?? 'ingreso'}
        empresas={empresas}
        onCerrar={() => setModalTipo(null)}
        onCreado={cargar}
      />
      <AbonoModal
        empresa={abonoEmpresa}
        onCerrar={() => setAbonoEmpresa(null)}
        onGuardado={cargar}
      />
      {dialogoConfirmar}
    </div>
  );
};

const MovimientoLista = ({
  titulo,
  vacio,
  items,
  onBorrar,
  positivo,
  aviso,
}: {
  titulo: string;
  vacio: string;
  items: MovimientoFinanciero[];
  onBorrar: (id: string) => void;
  positivo?: boolean;
  aviso?: string;
}) => (
  <Panel>
    <div className="flex items-center gap-2">
      <IconReceipt2 size={18} className="text-ink-soft" />
      <h2 className="text-[1.0625rem] font-bold tracking-tight text-ink">
        {titulo}
      </h2>
    </div>
    {aviso && <p className="mt-2 text-xs text-ink-soft">{aviso}</p>}
    {items.length === 0 ? (
      <p className="mt-4 text-sm text-ink-soft">{vacio}</p>
    ) : (
      <div className="mt-3 flex flex-col divide-y divide-line">
        {items.map((m) => (
          <div
            key={m.id}
            className="flex items-center justify-between gap-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">
                {m.concepto}
              </p>
              <p className="text-xs text-ink-soft">
                {m.fecha}
                {m.categoria ? ` · ${m.categoria}` : ''}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span
                className={`text-sm font-bold ${
                  positivo ? 'text-emerald-700' : 'text-ink'
                }`}
              >
                {positivo ? '+' : '−'}
                {formatearPesos(m.monto)}
              </span>
              <button
                onClick={() => onBorrar(m.id)}
                aria-label="Eliminar"
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-paper hover:text-red-600"
              >
                <IconTrash size={15} />
              </button>
            </div>
          </div>
        ))}
      </div>
    )}
  </Panel>
);

export default FinanzasPage;
