'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  IconArrowUpRight,
  IconBuildingBank,
  IconChevronDown,
  IconCoin,
  IconDownload,
  IconGift,
  IconPencil,
  IconPlus,
  IconReceipt2,
  IconReportMoney,
  IconSearch,
  IconTrendingUp,
  IconUsers,
} from '@tabler/icons-react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { Panel } from '@/components/app/Panel';
import {
  AdelantosAdmin,
  AdelantosEmpleado,
} from '@/components/app/remuneraciones/Adelantos';
import { RemuneracionModal } from '@/components/app/remuneraciones/RemuneracionModal';
import { GenerarAguinaldoModal } from '@/components/app/remuneraciones/GenerarAguinaldoModal';
import { StatCard } from '@/components/app/dashboard/StatCard';
import {
  getEmpleados,
  getEmpresa,
  getRemuneraciones,
  getRemuneracionesTodas,
} from '@/lib/services/rrhh';
import { Empleado, Remuneracion } from '@/types/rrhh';
import {
  analizarSalario,
  CARGAS_PATRONALES,
  resumirMasa,
} from '@/lib/remuneraciones';
import { formatearPesos, formatearPorcentaje } from '@/lib/formato';
import { formatearPeriodo } from '@/lib/fechas';
import { descargarCSV } from '@/lib/csv';
import { Boton } from '@/components/app/ui/Boton';
import { Paginacion, usePaginacion } from '@/components/app/ui/Paginacion';
import { BloqueError } from '@/components/app/EstadoCarga';
import { useCarga } from '@/lib/useCarga';
import { faltasDeEmpleado } from '@/lib/requisitos';
import { BloqueFaltasDeVarios } from '@/components/app/Faltas';
import { avisoExito } from '@/lib/avisos';
import { RequireModulo } from '@/components/app/RequireModulo';
import { RequireEmpresa } from '@/components/app/RequireEmpresa';

const POR_PAGINA = 10;

type ColumnaMasa =
  | 'colaborador'
  | 'periodo'
  | 'bruto'
  | 'descuentos'
  | 'neto';

const COLUMNAS_MASA: { id: ColumnaMasa; etiqueta: string }[] = [
  { id: 'colaborador', etiqueta: 'Colaborador' },
  { id: 'periodo', etiqueta: 'Período' },
  { id: 'bruto', etiqueta: 'Bruto' },
  { id: 'descuentos', etiqueta: 'Descuentos' },
  { id: 'neto', etiqueta: 'Neto' },
];

const esColumnaNumerica = (col: ColumnaMasa) =>
  col === 'bruto' || col === 'descuentos' || col === 'neto';

const CabeceraOrdenable = ({
  col,
  orden,
  onOrdenar,
  align = 'left',
}: {
  col: ColumnaMasa;
  orden: { col: ColumnaMasa; dir: 'asc' | 'desc' };
  onOrdenar: (col: ColumnaMasa) => void;
  align?: 'left' | 'right';
}) => {
  const activo = orden.col === col;
  const etiqueta = COLUMNAS_MASA.find((c) => c.id === col)?.etiqueta ?? col;
  const sentido = activo
    ? orden.dir === 'asc'
      ? esColumnaNumerica(col)
        ? 'de menor a mayor'
        : 'de A a Z'
      : esColumnaNumerica(col)
        ? 'de mayor a menor'
        : 'de Z a A'
    : esColumnaNumerica(col)
      ? 'de mayor a menor'
      : 'de A a Z';
  return (
    <th
      className={`pb-2.5 ${align === 'right' ? 'pr-4 text-right' : 'pr-4 text-left'}`}
      aria-sort={
        activo ? (orden.dir === 'asc' ? 'ascending' : 'descending') : 'none'
      }
    >
      <button
        type="button"
        onClick={() => onOrdenar(col)}
        aria-label={`Ordenar por ${etiqueta.toLowerCase()}, ${sentido}`}
        className={`inline-flex cursor-pointer items-center gap-0.5 border-0 bg-transparent p-0 text-xs font-bold uppercase tracking-wider ${
          align === 'right' ? 'w-full justify-end' : ''
        } ${activo ? 'text-ink' : 'text-ink-soft hover:text-ink'}`}
      >
        {etiqueta}
        <IconChevronDown
          size={14}
          className={`shrink-0 transition-transform ${
            activo && orden.dir === 'asc' ? 'rotate-180' : ''
          } ${activo ? 'opacity-100' : 'opacity-40'}`}
        />
      </button>
    </th>
  );
};

/** Gráfico de líneas simple en SVG (sin librerías). */
const LineaEvolucion = ({
  puntos,
}: {
  puntos: { etiqueta: string; valor: number }[];
}) => {
  if (puntos.length < 2) {
    return (
      <p className="text-sm text-ink-soft">
        Se necesita más de un período para ver la evolución.
      </p>
    );
  }
  const W = 640;
  const H = 200;
  const P = 24;
  const valores = puntos.map((p) => p.valor);
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const rango = max - min || 1;
  const x = (i: number) => P + (i * (W - 2 * P)) / (puntos.length - 1);
  const y = (v: number) => H - P - ((v - min) / rango) * (H - 2 * P);
  const linea = puntos.map((p, i) => `${x(i)},${y(p.valor)}`).join(' ');
  const area = `${P},${H - P} ${linea} ${W - P},${H - P}`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      preserveAspectRatio="none"
      role="img"
      aria-label="Evolución del sueldo"
    >
      <polygon points={area} fill="rgb(74 122 245 / 0.12)" />
      <polyline
        points={linea}
        fill="none"
        stroke="#4a7af5"
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {puntos.map((p, i) => (
        <circle
          key={p.etiqueta}
          cx={x(i)}
          cy={y(p.valor)}
          r={4}
          fill="#4a7af5"
        />
      ))}
    </svg>
  );
};

/** Desglose de la última liquidación del empleado, con el neto grande. */
const UltimaLiquidacion = ({ rem }: { rem: Remuneracion }) => {
  const fila = (etiqueta: string, valor: number, resta?: boolean) => (
    <div className="flex items-baseline justify-between py-2">
      <span className="text-sm text-ink-soft">{etiqueta}</span>
      <span
        className={`text-sm font-semibold ${resta ? 'text-red-700' : 'text-ink'}`}
      >
        {resta ? '− ' : ''}
        {formatearPesos(valor)}
      </span>
    </div>
  );

  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <IconReceipt2 size={18} className="text-ink-soft" />
          <h2 className="text-base font-bold text-ink">
            Tu última liquidación
          </h2>
        </div>
        <span className="rounded-full bg-brand-100 px-3 py-1 text-xs font-bold text-brand-800">
          {formatearPeriodo(rem.periodo)}
        </span>
      </div>

      <div className="mt-4 grid gap-5 sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="flex flex-col divide-y divide-line/60">
          {fila('Remunerativo', rem.montoBruto)}
          {(rem.noRemunerativo ?? 0) > 0 &&
            fila('No remunerativo', rem.noRemunerativo ?? 0)}
          {fila(
            'Aportes (jubilación, PAMI, obra social)',
            rem.aportes ?? 0,
            true
          )}
          {(rem.otrosDescuentos ?? 0) > 0 &&
            fila('Otros descuentos', rem.otrosDescuentos ?? 0, true)}
        </div>
        <div className="rounded-2xl border border-brand-200 bg-brand-50/60 px-6 py-5 text-center sm:min-w-52">
          <p className="text-xs font-bold uppercase tracking-widest text-ink-soft">
            Neto a cobrar
          </p>
          <p className="mt-1 text-3xl font-extrabold tracking-tight text-ink">
            {formatearPesos(rem.montoNeto)}
          </p>
          {rem.convenio && (
            <p className="mt-1 text-xs text-ink-soft">{rem.convenio}</p>
          )}
        </div>
      </div>
    </Panel>
  );
};

const VistaColaborador = ({ empleadoId }: { empleadoId: string }) => {
  const carga = useCarga(() => getRemuneraciones(empleadoId), [empleadoId], {
    contexto: 'remuneraciones/propias',
    inicial: [] as Remuneracion[],
  });
  const rems = carga.datos;

  const a = useMemo(() => analizarSalario(rems), [rems]);

  // Un fallo se veía como "todavía no hay remuneraciones cargadas": la
  // persona concluía que RRHH no le cargó el sueldo.
  if (carga.fase === 'error' && carga.error) {
    return <BloqueError error={carga.error} onReintentar={carga.recargar} />;
  }

  if (rems.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <p className="rounded-xl bg-paper px-4 py-3 text-sm text-ink-soft">
          Todavía no hay remuneraciones cargadas.
        </p>
        <AdelantosEmpleado empleadoId={empleadoId} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          etiqueta="Sueldo bruto actual"
          valor={a.ultima ? formatearPesos(a.ultima.montoBruto) : '—'}
          detalle={a.ultima ? formatearPeriodo(a.ultima.periodo) : undefined}
          icono={IconCoin}
        />
        <StatCard
          etiqueta="Variación"
          valor={
            a.variacionPct !== undefined
              ? formatearPorcentaje(a.variacionPct)
              : '—'
          }
          detalle="contra el mes anterior"
          icono={IconTrendingUp}
        />
        <StatCard
          etiqueta="Mejor del semestre"
          valor={formatearPesos(a.mejorSemestreBruto)}
          detalle="base del aguinaldo"
          icono={IconArrowUpRight}
        />
        <StatCard
          etiqueta="Aguinaldo estimado"
          valor={formatearPesos(a.aguinaldoEstimado)}
          detalle="SAC = mejor sueldo / 2"
          icono={IconGift}
        />
      </div>

      {a.ultima && <UltimaLiquidacion rem={a.ultima} />}

      <Panel>
        <h2 className="text-base font-bold text-ink">Evolución salarial</h2>
        <p className="mt-1 text-sm text-ink-soft">Sueldo bruto mes a mes.</p>
        <div className="mt-4">
          <LineaEvolucion
            puntos={a.ordenadas.map((r) => ({
              etiqueta: r.periodo,
              valor: r.montoBruto,
            }))}
          />
          <div className="mt-2 min-w-0 overflow-x-auto">
            <div className="flex justify-between gap-2 text-xs text-ink-soft">
              {a.ordenadas.map((r) => (
                <span key={r.periodo} className="shrink-0">
                  {formatearPeriodo(r.periodo)}
                </span>
              ))}
            </div>
          </div>
        </div>
      </Panel>

      <Panel>
        <h2 className="text-base font-bold text-ink">Historial de aumentos</h2>
        {a.aumentos.length === 0 ? (
          <p className="mt-3 text-sm text-ink-soft">
            Sin aumentos registrados.
          </p>
        ) : (
          <div className="mt-4 flex flex-col gap-2">
            {a.aumentos.map((au) => (
              <div
                key={au.periodo}
                className="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-ink">
                    {formatearPeriodo(au.periodo)}
                  </p>
                  <p className="text-xs text-ink-soft">
                    {formatearPesos(au.desde)} → {formatearPesos(au.hasta)}
                  </p>
                </div>
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">
                  {formatearPorcentaje(au.pct)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <AdelantosEmpleado empleadoId={empleadoId} />
    </div>
  );
};

const VistaAdmin = () => {
  const router = useRouter();
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editando, setEditando] = useState<Remuneracion | null>(null);
  const [empleadoFijo, setEmpleadoFijo] = useState<string | undefined>();
  const [cargasPct, setCargasPct] = useState(CARGAS_PATRONALES);
  const [aguinaldoAbierto, setAguinaldoAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [orden, setOrden] = useState<{ col: ColumnaMasa; dir: 'asc' | 'desc' }>(
    {
      col: 'bruto',
      dir: 'desc',
    }
  );

  const cRems = useCarga(() => getRemuneracionesTodas(), [], {
    contexto: 'remuneraciones',
    inicial: [] as Remuneracion[],
  });
  const rems = cRems.datos;

  const cEmpleados = useCarga(() => getEmpleados(), [], {
    contexto: 'remuneraciones/empleados',
    inicial: [] as Empleado[],
  });
  const empleados = cEmpleados.datos;

  // El % de cargas es un parámetro de la estimación: si no llega, se usa
  // el genérico y la pantalla sirve igual.
  const cEmpresa = useCarga(() => getEmpresa(), [], {
    contexto: 'remuneraciones/empresa',
  });
  useEffect(() => {
    const pct = cEmpresa.datos?.config.cargasPatronalesPct;
    if (pct != null) setCargasPct(pct);
  }, [cEmpresa.datos]);

  const cargar = useCallback(() => {
    cRems.recargar();
    cEmpleados.recargar();
    cEmpresa.recargar();
  }, [cRems, cEmpleados, cEmpresa]);

  const resumen = useMemo(
    () => resumirMasa(rems, cargasPct),
    [rems, cargasPct]
  );

  // Quién no tiene ninguna remuneración cargada. Se saca de `rems`, que
  // ya está en memoria: no hace falta otra consulta.
  const faltantes = useMemo(() => {
    if (cRems.fase !== 'ok' || cEmpleados.fase !== 'ok') return [];
    const conSueldo = new Set(rems.map((r) => r.empleadoId));
    return empleados.map((e) => ({
      nombre: `${e.apellido}, ${e.nombre}`,
      faltas: faltasDeEmpleado(
        e,
        { tieneSueldo: conSueldo.has(e.id) },
        'pagos'
      ),
    }));
  }, [empleados, rems, cRems.fase, cEmpleados.fase]);

  const nombre = (id: string) => {
    const e = empleados.find((x) => x.id === id);
    return e ? `${e.nombre} ${e.apellido}` : '—';
  };

  const descuentosDe = (f: { empleadoId: string; periodo: string }) => {
    const rem = rems.find(
      (r) => r.empleadoId === f.empleadoId && r.periodo === f.periodo
    );
    return (rem?.aportes ?? 0) + (rem?.otrosDescuentos ?? 0);
  };

  const filasOrdenadas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const nombreDe = (id: string) => {
      const e = empleados.find((x) => x.id === id);
      return e ? `${e.nombre} ${e.apellido}` : '—';
    };
    const descDe = (f: { empleadoId: string; periodo: string }) => {
      const rem = rems.find(
        (r) => r.empleadoId === f.empleadoId && r.periodo === f.periodo
      );
      return (rem?.aportes ?? 0) + (rem?.otrosDescuentos ?? 0);
    };
    const filas = q
      ? resumen.porEmpleado.filter((f) => {
          const n = nombreDe(f.empleadoId).toLowerCase();
          const periodoLargo = formatearPeriodo(f.periodo).toLowerCase();
          return (
            n.includes(q) || periodoLargo.includes(q) || f.periodo.includes(q)
          );
        })
      : resumen.porEmpleado;
    const dir = orden.dir === 'asc' ? 1 : -1;
    return [...filas].sort((a, b) => {
      let cmp = 0;
      switch (orden.col) {
        case 'colaborador':
          cmp = nombreDe(a.empleadoId).localeCompare(
            nombreDe(b.empleadoId),
            'es'
          );
          break;
        case 'periodo':
          cmp = a.periodo.localeCompare(b.periodo);
          break;
        case 'bruto':
          cmp = a.bruto - b.bruto;
          break;
        case 'descuentos':
          cmp = descDe(a) - descDe(b);
          break;
        case 'neto':
          cmp = a.neto - b.neto;
          break;
      }
      return cmp * dir;
    });
  }, [resumen.porEmpleado, busqueda, orden, empleados, rems]);

  const {
    pagina,
    setPagina,
    totalPaginas,
    visibles: filasVisibles,
  } = usePaginacion(filasOrdenadas, POR_PAGINA);

  useEffect(() => {
    setPagina(1);
  }, [busqueda, orden, setPagina]);

  const toggleOrden = (col: ColumnaMasa) => {
    setOrden((prev) =>
      prev.col === col
        ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { col, dir: esColumnaNumerica(col) ? 'desc' : 'asc' }
    );
  };

  const abrirNueva = () => {
    setEditando(null);
    setEmpleadoFijo(undefined);
    setModalAbierto(true);
  };

  const abrirEdicion = (empleadoId: string, periodo: string) => {
    const rem = rems.find(
      (r) => r.empleadoId === empleadoId && r.periodo === periodo
    );
    setEditando(rem ?? null);
    setEmpleadoFijo(empleadoId);
    setModalAbierto(true);
  };

  /** CSV con el detalle del último período de cada uno, para el contador. */
  const exportarLiquidacion = () => {
    const filas: string[][] = [
      [
        'Colaborador',
        'CUIL',
        'Convenio',
        'Período',
        'Bruto remunerativo',
        'No remunerativo',
        'Aportes empleado',
        'Otros descuentos',
        'Neto',
      ],
    ];
    resumen.porEmpleado.forEach((f) => {
      const rem = rems.find(
        (r) => r.empleadoId === f.empleadoId && r.periodo === f.periodo
      );
      const emp = empleados.find((e) => e.id === f.empleadoId);
      filas.push([
        nombre(f.empleadoId),
        emp?.cuil ?? '',
        rem?.convenio ?? emp?.convenio ?? '',
        formatearPeriodo(f.periodo),
        String(rem?.montoBruto ?? f.bruto),
        String(rem?.noRemunerativo ?? 0),
        String(rem?.aportes ?? 0),
        String(rem?.otrosDescuentos ?? 0),
        String(rem?.montoNeto ?? f.neto),
      ]);
    });
    descargarCSV('remuneraciones-liquidacion.csv', filas);
    avisoExito('Export listo', 'Se descargó el CSV para tu contador.');
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          etiqueta="Masa salarial"
          valor={formatearPesos(resumen.masaSalarialBruta)}
          detalle="bruto mensual"
          icono={IconReportMoney}
        />
        <StatCard
          etiqueta="Cargas sociales"
          valor={formatearPesos(resumen.cargasSociales)}
          detalle={`estimadas (${Math.round(cargasPct * 100)}%)`}
          icono={IconBuildingBank}
        />
        <StatCard
          etiqueta="Costo total mensual"
          valor={formatearPesos(resumen.costoTotal)}
          detalle="bruto + cargas"
          icono={IconCoin}
        />
        <StatCard
          etiqueta="Costo por empleado"
          valor={formatearPesos(resumen.costoPromedio)}
          detalle={`${resumen.cantidad} con sueldo cargado`}
          icono={IconUsers}
        />
      </div>

      {/* "N con sueldo cargado" deja abierta la pregunta de quiénes son
          los otros, y esa diferencia hace que la masa salarial de arriba
          esté subestimada sin que se note. */}
      <BloqueFaltasDeVarios
        items={faltantes}
        titulo="Estos no entran en los números de arriba"
      />

      <Panel>
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-bold text-ink">
              Remuneración por colaborador
            </h2>
            <p className="mt-0.5 text-sm text-ink-soft">
              Último período cargado de cada uno. Tocá la fila para ir a la
              ficha o el lápiz para editar el período.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Boton
              variante="secundario"
              tamano="sm"
              onClick={exportarLiquidacion}
              disabled={resumen.porEmpleado.length === 0}
            >
              <IconDownload size={14} />
              Exportar para liquidación
            </Boton>
            <Boton
              variante="secundario"
              tamano="sm"
              onClick={() => setAguinaldoAbierto(true)}
            >
              <IconGift size={14} />
              Generar aguinaldo
            </Boton>
            <Boton variante="negro" tamano="sm" onClick={abrirNueva}>
              <IconPlus size={14} />
              Cargar remuneración
            </Boton>
          </div>
        </div>

        {cRems.fase === 'error' && cRems.error ? (
          <div className="mt-4">
            <BloqueError error={cRems.error} onReintentar={cRems.recargar} />
          </div>
        ) : cRems.fase === 'cargando' ? (
          <p className="mt-4 text-sm text-ink-soft">Cargando sueldos…</p>
        ) : resumen.porEmpleado.length === 0 ? (
          <div className="mt-4 flex flex-col items-start gap-3 rounded-xl bg-paper px-5 py-6">
            <p className="text-sm text-ink-soft">
              Todavía no hay sueldos cargados. Cargá la primera remuneración y
              acá vas a ver la masa salarial y el detalle por colaborador.
            </p>
            <Boton tamano="sm" onClick={abrirNueva}>
              <IconPlus size={14} />
              Cargar la primera
            </Boton>
          </div>
        ) : (
          <div className="mt-4 min-w-0">
            <div className="relative">
              <IconSearch
                size={18}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-soft"
              />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre o período…"
                className="h-12 w-full rounded-xl border border-line bg-surface pl-11 pr-4 text-base text-ink outline-none transition-colors placeholder:text-ink-soft/50 focus:border-brand-600"
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5 md:hidden">
              {COLUMNAS_MASA.map((c) => {
                const activo = orden.col === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleOrden(c.id)}
                    className={`inline-flex cursor-pointer items-center gap-0.5 rounded-full border px-2.5 py-1 text-[0.7rem] font-bold uppercase tracking-wide ${
                      activo
                        ? 'border-brand-300 bg-brand-50 text-brand-800'
                        : 'border-line bg-surface text-ink-soft'
                    }`}
                  >
                    {c.etiqueta}
                    <IconChevronDown
                      size={12}
                      className={`transition-transform ${
                        activo && orden.dir === 'asc' ? 'rotate-180' : ''
                      } ${activo ? 'opacity-100' : 'opacity-40'}`}
                    />
                  </button>
                );
              })}
            </div>
            {filasOrdenadas.length === 0 ? (
              <p className="mt-4 text-sm text-ink-soft">
                Nadie coincide con “{busqueda.trim()}”.
              </p>
            ) : (
              <>
            <ul className="mt-4 flex flex-col gap-2 md:hidden">
              {filasVisibles.map((f) => (
                <li key={f.empleadoId}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() =>
                      router.push(`/colaboradores/${f.empleadoId}`)
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        router.push(`/colaboradores/${f.empleadoId}`);
                      }
                    }}
                    className="hover-bloque cursor-pointer rounded-2xl border border-line bg-paper px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-ink">
                          {nombre(f.empleadoId)}
                        </p>
                        <p className="text-xs text-ink-soft">
                          {formatearPeriodo(f.periodo)}
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label={`Editar remuneración de ${nombre(f.empleadoId)}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          abrirEdicion(f.empleadoId, f.periodo);
                        }}
                        className="inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-line bg-surface text-ink-soft transition-colors hover:border-brand-300 hover:text-brand-700"
                      >
                        <IconPencil size={15} />
                      </button>
                    </div>
                    <div className="mt-3">
                      <p className="text-[0.65rem] font-bold uppercase tracking-wide text-ink-soft">
                        Neto
                      </p>
                      <p className="break-words text-lg font-bold tabular-nums tracking-tight text-ink">
                        {formatearPesos(f.neto)}
                      </p>
                      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                        <div className="min-w-0">
                          <dt className="text-[0.65rem] font-bold uppercase tracking-wide text-ink-soft">
                            Bruto
                          </dt>
                          <dd className="break-words text-sm font-semibold tabular-nums text-ink">
                            {formatearPesos(f.bruto)}
                          </dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-[0.65rem] font-bold uppercase tracking-wide text-ink-soft">
                            Descuentos
                          </dt>
                          <dd className="break-words text-sm tabular-nums text-red-700/80">
                            − {formatearPesos(descuentosDe(f))}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-4 hidden min-w-0 overflow-x-auto md:block">
              <table className="w-full min-w-[34rem] text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <CabeceraOrdenable
                      col="colaborador"
                      orden={orden}
                      onOrdenar={toggleOrden}
                    />
                    <CabeceraOrdenable
                      col="periodo"
                      orden={orden}
                      onOrdenar={toggleOrden}
                    />
                    <CabeceraOrdenable
                      col="bruto"
                      orden={orden}
                      onOrdenar={toggleOrden}
                      align="right"
                    />
                    <CabeceraOrdenable
                      col="descuentos"
                      orden={orden}
                      onOrdenar={toggleOrden}
                      align="right"
                    />
                    <CabeceraOrdenable
                      col="neto"
                      orden={orden}
                      onOrdenar={toggleOrden}
                      align="right"
                    />
                    <th className="pb-2.5" aria-label="Acciones" />
                  </tr>
                </thead>
                <tbody>
                  {filasVisibles.map((f) => (
                    <tr
                      key={f.empleadoId}
                      onClick={() =>
                        router.push(`/colaboradores/${f.empleadoId}`)
                      }
                      className="cursor-pointer border-b border-line/60 transition-colors hover:bg-paper"
                    >
                      <td className="py-3 pr-4 font-semibold text-ink">
                        {nombre(f.empleadoId)}
                      </td>
                      <td className="py-3 pr-4 text-ink-soft">
                        {formatearPeriodo(f.periodo)}
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums text-ink">
                        {formatearPesos(f.bruto)}
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums text-red-700/80">
                        − {formatearPesos(descuentosDe(f))}
                      </td>
                      <td className="py-3 pr-4 text-right font-bold tabular-nums text-ink">
                        {formatearPesos(f.neto)}
                      </td>
                      <td className="py-3 text-right">
                        <button
                          type="button"
                          aria-label={`Editar remuneración de ${nombre(f.empleadoId)}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            abrirEdicion(f.empleadoId, f.periodo);
                          }}
                          className="cursor-pointer rounded-full border border-line bg-surface p-1.5 text-ink-soft transition-colors hover:border-brand-300 hover:text-brand-700"
                        >
                          <IconPencil size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Paginacion
              pagina={pagina}
              totalPaginas={totalPaginas}
              onCambiar={setPagina}
            />
              </>
            )}
          </div>
        )}
        <p className="mt-4 text-xs text-ink-soft">
          Las cargas sociales son una estimación ({Math.round(cargasPct * 100)}%
          sobre el bruto, configurable en Configuración). Para valores exactos,
          consultá con tu contador.
        </p>
      </Panel>

      <AdelantosAdmin empleados={empleados} />

      <RemuneracionModal
        abierto={modalAbierto}
        empleadoId={empleadoFijo}
        empleados={empleadoFijo ? undefined : empleados}
        inicial={editando}
        convenioSugerido={
          empleadoFijo
            ? empleados.find((e) => e.id === empleadoFijo)?.convenio
            : undefined
        }
        onCerrar={() => setModalAbierto(false)}
        onGuardado={cargar}
      />

      <GenerarAguinaldoModal
        abierto={aguinaldoAbierto}
        empleados={empleados}
        remuneraciones={rems}
        onCerrar={() => setAguinaldoAbierto(false)}
        onGenerado={cargar}
      />
    </div>
  );
};

const RemuneracionesPage = () => {
  const { usuario, rolEfectivo } = useAuth();
  if (!usuario) return null;

  const esAdmin = rolEfectivo === 'admin_rrhh' || rolEfectivo === 'superadmin';

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">
          Remuneraciones
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          {esAdmin
            ? 'Masa salarial, costos y sueldos del equipo.'
            : 'Tu evolución salarial y aguinaldo estimado.'}
        </p>
      </div>

      {esAdmin ? (
        <VistaAdmin />
      ) : usuario.empleadoId ? (
        <VistaColaborador empleadoId={usuario.empleadoId} />
      ) : (
        <p className="rounded-xl bg-paper px-4 py-3 text-sm text-ink-soft">
          Tu usuario no está vinculado a un legajo.
        </p>
      )}
    </div>
  );
};

/** La empresa puede tener esta sección apagada: se bloquea la ruta,
 * no sólo el link del menú. */
const RemuneracionesPageProtegida = () => (
  <RequireEmpresa>
    <RequireModulo modulo="remuneraciones">
      <RemuneracionesPage />
    </RequireModulo>
  </RequireEmpresa>
);

export default RemuneracionesPageProtegida;
