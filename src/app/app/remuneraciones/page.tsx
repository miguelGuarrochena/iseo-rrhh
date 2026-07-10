'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  IconArrowUpRight,
  IconBuildingBank,
  IconCoin,
  IconDownload,
  IconGift,
  IconReportMoney,
  IconTrendingUp,
  IconUsers,
} from '@tabler/icons-react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { Panel } from '@/components/app/Panel';
import { StatCard } from '@/components/app/dashboard/StatCard';
import {
  getEmpleados,
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
import { avisoExito } from '@/lib/avisos';

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

const VistaColaborador = ({ empleadoId }: { empleadoId: string }) => {
  const [rems, setRems] = useState<Remuneracion[]>([]);

  useEffect(() => {
    void getRemuneraciones(empleadoId).then(setRems);
  }, [empleadoId]);

  const a = useMemo(() => analizarSalario(rems), [rems]);

  if (rems.length === 0) {
    return (
      <p className="rounded-xl bg-paper px-4 py-3 text-sm text-ink-soft">
        Todavía no hay remuneraciones cargadas.
      </p>
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
          <div className="mt-2 flex justify-between text-xs text-ink-soft">
            {a.ordenadas.map((r) => (
              <span key={r.periodo}>{formatearPeriodo(r.periodo)}</span>
            ))}
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
    </div>
  );
};

const VistaAdmin = () => {
  const router = useRouter();
  const [rems, setRems] = useState<Remuneracion[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);

  useEffect(() => {
    void getRemuneracionesTodas().then(setRems);
    void getEmpleados().then(setEmpleados);
  }, []);

  const resumen = useMemo(() => resumirMasa(rems), [rems]);
  const nombre = (id: string) => {
    const e = empleados.find((x) => x.id === id);
    return e ? `${e.nombre} ${e.apellido}` : '—';
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
      <Panel className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-bold text-ink">
            ¿Tenés que cargar o actualizar sueldos?
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Entrá al legajo del colaborador y usá “Cargar remuneración” en la
            sección Remuneraciones.
          </p>
        </div>
        <Boton
          variante="secundario"
          onClick={() => router.push('/colaboradores')}
          className="shrink-0"
        >
          Ir a colaboradores
        </Boton>
      </Panel>

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
          detalle={`estimadas (${Math.round(CARGAS_PATRONALES * 100)}%)`}
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

      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold text-ink">
            Remuneración por colaborador
          </h2>
          <Boton
            variante="secundario"
            tamano="sm"
            onClick={exportarLiquidacion}
            disabled={resumen.porEmpleado.length === 0}
          >
            <IconDownload size={14} />
            Exportar para liquidación
          </Boton>
        </div>
        {resumen.porEmpleado.length === 0 ? (
          <p className="mt-3 text-sm text-ink-soft">
            No hay remuneraciones cargadas.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wider text-ink-soft">
                  <th className="pb-2 pr-4">Colaborador</th>
                  <th className="pb-2 pr-4">Período</th>
                  <th className="pb-2 pr-4 text-right">Bruto</th>
                  <th className="pb-2 text-right">Neto</th>
                </tr>
              </thead>
              <tbody>
                {resumen.porEmpleado.map((f) => (
                  <tr
                    key={f.empleadoId}
                    onClick={() =>
                      router.push(`/colaboradores/${f.empleadoId}`)
                    }
                    className="cursor-pointer border-b border-line/60 transition-colors hover:bg-paper"
                  >
                    <td className="py-2.5 pr-4 font-semibold text-ink">
                      {nombre(f.empleadoId)}
                    </td>
                    <td className="py-2.5 pr-4 text-ink-soft">
                      {formatearPeriodo(f.periodo)}
                    </td>
                    <td className="py-2.5 pr-4 text-right text-ink">
                      {formatearPesos(f.bruto)}
                    </td>
                    <td className="py-2.5 text-right text-ink-soft">
                      {formatearPesos(f.neto)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-4 text-xs text-ink-soft">
          Las cargas sociales son una estimación (
          {Math.round(CARGAS_PATRONALES * 100)}% sobre el bruto). Para valores
          exactos, consultá con tu contador.
        </p>
      </Panel>
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

export default RemuneracionesPage;
