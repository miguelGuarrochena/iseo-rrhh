'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  IconAlertTriangle,
  IconCash,
  IconCheck,
  IconPencil,
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
import { MovimientoModal } from '@/components/app/finanzas/MovimientoModal';
import { AbonoModal } from '@/components/app/finanzas/AbonoModal';
import { BarrasIngresoGasto } from '@/components/app/finanzas/BarrasIngresoGasto';
import { formatearPesos } from '@/lib/formato';
import { hoyISO } from '@/lib/fechas';
import { avisoError, avisoExito } from '@/lib/avisos';
import {
  crearMovimiento,
  eliminarMovimiento,
  getEmpresas,
  getMovimientos,
  getResumenFinanzas,
} from '@/lib/services/rrhh';
import {
  Empresa,
  FacturacionEmpresa,
  MovimientoFinanciero,
  ResumenFinanzas,
  TipoMovimiento,
} from '@/types/rrhh';

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

/** Últimos 6 períodos (YYYY-MM) terminando en el actual. */
const ultimosPeriodos = (): string[] => {
  const base = new Date(`${periodoActual}-01T00:00:00`);
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(base);
    d.setMonth(d.getMonth() - (5 - i));
    return d.toISOString().slice(0, 7);
  });
};

const FinanzasPage = () => {
  const { usuario } = useAuth();
  const [periodo, setPeriodo] = useState(periodoActual);
  const [resumen, setResumen] = useState<ResumenFinanzas | null>(null);
  const [movimientos, setMovimientos] = useState<MovimientoFinanciero[]>([]);
  const [todos, setTodos] = useState<MovimientoFinanciero[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [modalTipo, setModalTipo] = useState<TipoMovimiento | null>(null);
  const [abonoEmpresa, setAbonoEmpresa] = useState<FacturacionEmpresa | null>(
    null
  );

  const cargar = useCallback(() => {
    void getResumenFinanzas(periodo).then(setResumen);
    void getMovimientos(periodo).then(setMovimientos);
    void getMovimientos().then(setTodos);
  }, [periodo]);

  useEffect(cargar, [cargar]);
  useEffect(() => {
    void getEmpresas().then((lista) =>
      setEmpresas(lista.map((e) => e.empresa))
    );
  }, []);

  if (!usuario) return null;
  if (usuario.rol !== 'superadmin') {
    return (
      <p className="text-sm text-ink-soft">
        No tenés permisos para ver esta sección.
      </p>
    );
  }

  const ingresos = movimientos.filter((m) => m.tipo === 'ingreso');
  const gastos = movimientos.filter((m) => m.tipo === 'gasto');
  const vencidas = resumen?.facturacion.filter(
    (f) => f.estado === 'activa' && f.abonoMensual > 0 && !f.alDia
  );

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

  const registrarCobro = async (f: FacturacionEmpresa) => {
    const fecha = periodo === periodoActual ? hoyISO() : `${periodo}-15`;
    try {
      await crearMovimiento({
        tipo: 'ingreso',
        concepto: `Abono mensual — ${f.nombre}`,
        categoria: 'Abono',
        empresaId: f.empresaId,
        monto: f.abonoMensual,
        fecha,
      });
      avisoExito(
        'Cobro registrado',
        `${f.nombre}: ${formatearPesos(f.abonoMensual)}`
      );
      cargar();
    } catch (err) {
      avisoError(
        'No pudimos registrar el cobro',
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
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            Finanzas
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            El negocio de ISEO: facturación de tus empresas, ingresos y gastos.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-44">
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

      {vencidas && vencidas.length > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <IconAlertTriangle
            size={20}
            className="mt-0.5 shrink-0 text-amber-700"
          />
          <div className="text-sm text-amber-900">
            <p className="font-bold">
              {vencidas.length === 1
                ? '1 empresa con el pago pendiente este mes'
                : `${vencidas.length} empresas con el pago pendiente este mes`}
            </p>
            <p className="mt-0.5 text-amber-800">
              {vencidas.map((f) => f.nombre).join(', ')}.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
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
              ? `${resumen.empresasAlDia} al día · ${resumen.empresasVencidas} pendientes`
              : 'MRR'
          }
          icono={IconRepeat}
        />
      </div>

      <Panel>
        <h2 className="text-base font-bold text-ink">
          Ingresos y gastos — últimos meses
        </h2>
        <BarrasIngresoGasto datos={serieMensual} />
      </Panel>

      <Panel>
        <h2 className="text-base font-bold text-ink">
          Facturación por empresa
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          Lo que te paga cada cliente este mes. Registrá el cobro cuando entre.
        </p>
        <div className="mt-4 flex flex-col divide-y divide-line">
          {resumen?.facturacion.map((f) => (
            <div
              key={f.empresaId}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold text-ink">{f.nombre}</p>
                <p className="text-xs text-ink-soft">
                  {f.empleados} {f.empleados === 1 ? 'empleado' : 'empleados'} ·
                  abono {formatearPesos(f.abonoMensual)} · cobrado{' '}
                  {formatearPesos(f.cobradoEnPeriodo)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {f.estado === 'suspendida' ? (
                  <span className="rounded-full bg-paper px-2.5 py-1 text-xs font-bold text-ink-soft">
                    Suspendida
                  </span>
                ) : f.abonoMensual === 0 ? (
                  <span className="rounded-full bg-paper px-2.5 py-1 text-xs font-bold text-ink-soft">
                    Sin abono
                  </span>
                ) : f.alDia ? (
                  <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">
                    <IconCheck size={13} /> Al día
                  </span>
                ) : (
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">
                    Pendiente
                  </span>
                )}
                <Boton
                  variante="secundario"
                  tamano="sm"
                  onClick={() => setAbonoEmpresa(f)}
                >
                  <IconPencil size={14} />
                </Boton>
                {f.estado === 'activa' && f.abonoMensual > 0 && !f.alDia && (
                  <Boton tamano="sm" onClick={() => void registrarCobro(f)}>
                    <IconCash size={14} />
                    Registrar cobro
                  </Boton>
                )}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <MovimientoLista
          titulo="Ingresos del mes"
          vacio="Sin ingresos cargados."
          items={ingresos}
          onBorrar={borrar}
          positivo
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
    </div>
  );
};

const MovimientoLista = ({
  titulo,
  vacio,
  items,
  onBorrar,
  positivo,
}: {
  titulo: string;
  vacio: string;
  items: MovimientoFinanciero[];
  onBorrar: (id: string) => void;
  positivo?: boolean;
}) => (
  <Panel>
    <div className="flex items-center gap-2">
      <IconReceipt2 size={18} className="text-ink-soft" />
      <h2 className="text-base font-bold text-ink">{titulo}</h2>
    </div>
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
