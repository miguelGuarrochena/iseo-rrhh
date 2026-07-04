'use client';

import { useEffect, useState } from 'react';
import {
  IconBuildingFactory2,
  IconClockExclamation,
  IconClockPlus,
  IconInbox,
  IconSignature,
  IconUserExclamation,
  IconUsers,
} from '@tabler/icons-react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { StatCard } from '@/components/app/dashboard/StatCard';
import { Panel } from '@/components/app/Panel';
import { Barras, Dona } from '@/components/app/ui/Graficos';
import { Selector } from '@/components/app/ui/Selector';
import { tipoAusenciaLabels } from '@/lib/etiquetas';
import {
  getAusencias,
  getEmpleados,
  getEmpresas,
  getFichajesDeHoy,
  getMetricasGlobales,
  getResumenControl,
} from '@/lib/services/rrhh';
import {
  Ausencia,
  EmpresaResumen,
  MetricasGlobales,
  ResumenControl,
} from '@/types/rrhh';

/**
 * Reportes con gráficos. Admin/supervisor: control de su empresa.
 * Superadmin (fuera de una empresa): vista global del negocio.
 */
const ReportesPage = () => {
  const { usuario, rolEfectivo, empresaVista } = useAuth();
  const [resumen, setResumen] = useState<ResumenControl | null>(null);
  const [ausencias, setAusencias] = useState<Ausencia[]>([]);
  const [metricas, setMetricas] = useState<MetricasGlobales | null>(null);
  const [empresas, setEmpresas] = useState<EmpresaResumen[]>([]);
  const [empresaSel, setEmpresaSel] = useState('emp-1');
  const [presentes, setPresentes] = useState(0);
  const [dotacion, setDotacion] = useState(0);

  const esGlobal = usuario?.rol === 'superadmin' && !empresaVista;

  useEffect(() => {
    if (esGlobal) {
      void getMetricasGlobales().then(setMetricas);
      void getEmpresas().then(setEmpresas);
      void getAusencias().then(setAusencias);
      void getResumenControl().then(setResumen);
    } else {
      void getResumenControl().then(setResumen);
      void getAusencias().then(setAusencias);
    }
    void getEmpleados().then((e) => setDotacion(e.length));
    void getFichajesDeHoy().then((f) =>
      setPresentes(
        new Set(f.filter((x) => x.tipo === 'ingreso').map((x) => x.empleadoId))
          .size
      )
    );
  }, [esGlobal]);

  if (!usuario || rolEfectivo === 'empleado') {
    return (
      <p className="text-sm text-ink-soft">
        No tenés permisos para ver esta sección.
      </p>
    );
  }

  const ausenciasPorTipo = Object.entries(tipoAusenciaLabels)
    .map(([tipo, etiqueta]) => ({
      etiqueta,
      valor: ausencias.filter((a) => a.tipo === tipo).length,
    }))
    .filter((d) => d.valor > 0);

  const topTarde =
    resumen?.porEmpleado
      .filter((e) => e.minutosTarde > 0)
      .map((e) => ({
        etiqueta: e.nombreCompleto,
        valor: e.minutosTarde,
        href: `/app/colaboradores/${e.empleadoId}`,
      })) ?? [];
  const topExtras =
    resumen?.porEmpleado
      .filter((e) => e.horasExtras > 0)
      .map((e) => ({
        etiqueta: e.nombreCompleto,
        valor: e.horasExtras,
        color: '#34d399',
        href: `/app/colaboradores/${e.empleadoId}`,
      })) ?? [];
  const presentismo = [
    { etiqueta: 'Presentes', valor: presentes, color: '#34d399' },
    {
      etiqueta: 'Sin fichar',
      valor: Math.max(dotacion - presentes, 0),
      color: '#e59061',
    },
  ];

  if (esGlobal) {
    const nombreSel =
      empresas.find((e) => e.empresa.id === empresaSel)?.empresa.nombre ?? '';
    const tieneDatos = empresaSel === 'emp-1';
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            Reportes
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            La foto general de tus clientes.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <StatCard
            etiqueta="Empresas activas"
            valor={metricas?.empresasActivas ?? '…'}
            detalle={
              metricas ? `+${metricas.empresasSuspendidas} suspendidas` : ''
            }
            href="/app/empresas"
            icono={IconBuildingFactory2}
          />
          <StatCard
            etiqueta="Empleados"
            valor={metricas?.empleadosGestionados ?? '…'}
            detalle="gestionados en total"
            href="/app/empresas"
            icono={IconUsers}
          />
          <StatCard
            etiqueta="Solicitudes"
            valor={metricas?.solicitudesPendientes ?? '…'}
            detalle="pendientes en clientes"
            href="/app/empresas"
            icono={IconInbox}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel>
            <h2 className="mb-4 text-base font-bold text-ink">
              Empleados por empresa
            </h2>
            <Barras
              datos={empresas.map((e) => ({
                etiqueta: e.empresa.nombre,
                valor: e.empleadosActivos,
              }))}
            />
          </Panel>
          <Panel>
            <h2 className="mb-4 text-base font-bold text-ink">
              Ausencias por tipo (todas las empresas)
            </h2>
            <Dona
              datos={ausenciasPorTipo}
              centro={String(ausencias.length)}
              centroDetalle="solicitudes"
            />
          </Panel>
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold tracking-tight text-ink">
            Detalle por empresa
          </h2>
          <Selector
            valor={empresaSel}
            onCambiar={setEmpresaSel}
            className="w-64"
            opciones={empresas
              .filter((e) => e.empresa.estado === 'activa')
              .map((e) => ({
                valor: e.empresa.id,
                etiqueta: e.empresa.nombre,
              }))}
          />
        </div>

        {tieneDatos ? (
          <>
            <div className="grid gap-4 lg:grid-cols-2">
              <Panel>
                <h2 className="mb-4 text-base font-bold text-ink">
                  Minutos de llegada tarde — {nombreSel}
                </h2>
                <Barras datos={topTarde} sufijo=" min" />
              </Panel>
              <Panel>
                <h2 className="mb-4 text-base font-bold text-ink">
                  Horas extras — {nombreSel}
                </h2>
                <Barras datos={topExtras} sufijo=" hs" />
              </Panel>
            </div>
            <Panel>
              <h2 className="mb-4 text-base font-bold text-ink">
                Presentismo de hoy — {nombreSel}
              </h2>
              <Dona
                datos={presentismo}
                centro={`${presentes}/${dotacion}`}
                centroDetalle="ficharon hoy"
              />
            </Panel>
          </>
        ) : (
          <Panel>
            <p className="text-sm text-ink-soft">
              {nombreSel} todavía no tiene actividad cargada en la demo. Con el
              backend conectado, acá vas a ver sus gráficos de puntualidad,
              extras y presentismo.
            </p>
          </Panel>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Reportes</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Control del mes: ausentismo, puntualidad, horas extras y firmas.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          etiqueta="Ausentismo"
          valor={resumen ? `${resumen.ausentismoPct}%` : '…'}
          detalle="del mes en curso"
          href="/app/ausencias"
          icono={IconUserExclamation}
        />
        <StatCard
          etiqueta="Llegadas tarde"
          valor={resumen?.llegadasTardeTotal ?? '…'}
          detalle="última semana"
          href="/app/fichaje"
          icono={IconClockExclamation}
        />
        <StatCard
          etiqueta="Horas extras"
          valor={resumen ? `${resumen.horasExtrasTotal} hs` : '…'}
          detalle="última semana"
          href="/app/fichaje"
          icono={IconClockPlus}
        />
        <StatCard
          etiqueta="Recibos sin firmar"
          valor={resumen?.recibosSinFirmar ?? '…'}
          detalle="a reclamar"
          href="/app/recibos"
          icono={IconSignature}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <h2 className="mb-4 text-base font-bold text-ink">
            Minutos de llegada tarde por colaborador
          </h2>
          <Barras datos={topTarde} sufijo=" min" />
        </Panel>
        <Panel>
          <h2 className="mb-4 text-base font-bold text-ink">
            Horas extras por colaborador
          </h2>
          <Barras datos={topExtras} sufijo=" hs" />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <h2 className="mb-4 text-base font-bold text-ink">
            Ausencias por tipo (año)
          </h2>
          <Dona
            datos={ausenciasPorTipo}
            centro={String(ausencias.length)}
            centroDetalle="solicitudes"
          />
        </Panel>
        <Panel>
          <h2 className="mb-4 text-base font-bold text-ink">
            Presentismo de hoy
          </h2>
          <Dona
            datos={presentismo}
            centro={`${presentes}/${dotacion}`}
            centroDetalle="ficharon hoy"
          />
        </Panel>
      </div>

      <p className="text-xs text-ink-soft">
        Exportación de novedades para liquidación disponible desde Fichaje.
      </p>
    </div>
  );
};

export default ReportesPage;
