'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  IconBuildingFactory2,
  IconClockExclamation,
  IconClockPlus,
  IconDownload,
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
import { Boton } from '@/components/app/ui/Boton';
import { tipoAusenciaLabels } from '@/lib/etiquetas';
import { descargarCSV } from '@/lib/csv';
import { hoyISO } from '@/lib/fechas';
import {
  getAusencias,
  getEmpleados,
  getEmpresas,
  getFichajesDeHoy,
  getMetricasGlobales,
  getResumenControl,
} from '@/lib/services/rrhh';
import { Ausencia, EmpresaResumen, ResumenControl } from '@/types/rrhh';
import { RequireModulo } from '@/components/app/RequireModulo';
import { RequireEmpresa } from '@/components/app/RequireEmpresa';
import { BloqueError } from '@/components/app/EstadoCarga';
import { useCarga } from '@/lib/useCarga';

/**
 * Reportes con gráficos. Admin/supervisor: control de su empresa.
 * Superadmin (fuera de una empresa): vista global del negocio.
 */
const ReportesPage = () => {
  const { usuario, rolEfectivo, empresaVista } = useAuth();
  const [empresaSel, setEmpresaSel] = useState('');

  const esGlobal = usuario?.rol === 'superadmin' && !empresaVista;

  // Metadata global: lista de empresas y métricas del negocio.
  const cMetricas = useCarga(() => getMetricasGlobales(), [esGlobal], {
    activo: esGlobal,
    contexto: 'reportes/metricas',
  });
  const metricas = cMetricas.datos ?? null;

  const cEmpresas = useCarga(() => getEmpresas(), [esGlobal], {
    activo: esGlobal,
    contexto: 'reportes/empresas',
    inicial: [] as EmpresaResumen[],
  });
  const empresas = cEmpresas.datos;

  // Apenas llega la lista de empresas, elegimos una activa por default.
  useEffect(() => {
    if (!esGlobal || empresaSel || empresas.length === 0) return;
    const primeraActiva = empresas.find((e) => e.empresa.estado === 'activa');
    if (primeraActiva) setEmpresaSel(primeraActiva.empresa.id);
  }, [esGlobal, empresas, empresaSel]);

  /**
   * El detalle sí va junto: las cuatro consultas arman un mismo cuadro de
   * situación de una empresa y un período. Mostrar el ausentismo de una
   * empresa con el presentismo de otra sería peor que no mostrar nada.
   */
  const cDetalle = useCarga(
    async () => {
      const idEmpresa = esGlobal ? empresaSel : undefined;
      const [resumen, ausencias, empleados, fichajes] = await Promise.all([
        getResumenControl(idEmpresa),
        getAusencias(idEmpresa),
        getEmpleados(idEmpresa),
        getFichajesDeHoy(idEmpresa),
      ]);
      return {
        resumen,
        ausencias,
        dotacion: empleados.length,
        presentes: new Set(
          fichajes.filter((f) => f.tipo === 'ingreso').map((f) => f.empleadoId)
        ).size,
      };
    },
    [esGlobal, empresaSel],
    {
      // Sin empresa elegida no hay nada que pedir todavía.
      activo: !esGlobal || Boolean(empresaSel),
      contexto: 'reportes/detalle',
    }
  );

  const resumen: ResumenControl | null = cDetalle.datos?.resumen ?? null;
  const ausencias: Ausencia[] = useMemo(
    () => cDetalle.datos?.ausencias ?? [],
    [cDetalle.datos]
  );
  const dotacion = cDetalle.datos?.dotacion ?? 0;
  const presentes = cDetalle.datos?.presentes ?? 0;
  const cargandoDetalle = cDetalle.fase === 'cargando';

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
      })) ?? [];
  const topExtras =
    resumen?.porEmpleado
      .filter((e) => e.horasExtras > 0)
      .map((e) => ({
        etiqueta: e.nombreCompleto,
        valor: e.horasExtras,
        color: '#34d399',
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
    // Antes esto miraba si empresaSel === 'emp-1' (hardcodeado a la demo):
    // con cualquier empresa real, siempre caía en el placeholder. Ahora el
    // detalle se trae de la empresa elegida (ver useEffect de arriba), así
    // que alcanza con chequear si esa empresa tiene dotación cargada.
    const tieneDatos = dotacion > 0;
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
            href="/empresas"
            icono={IconBuildingFactory2}
          />
          <StatCard
            etiqueta="Empleados"
            valor={metricas?.empleadosGestionados ?? '…'}
            detalle="gestionados en total"
            href="/empresas"
            icono={IconUsers}
          />
          <StatCard
            etiqueta="Solicitudes"
            valor={metricas?.solicitudesPendientes ?? '…'}
            detalle="pendientes en clientes"
            href="/empresas"
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

        <div className="mt-2 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <h2 className="text-lg font-bold tracking-tight text-ink">
            Detalle por empresa
          </h2>
          <Selector
            valor={empresaSel}
            onCambiar={setEmpresaSel}
            className="w-full sm:w-64"
            opciones={empresas
              .filter((e) => e.empresa.estado === 'activa')
              .map((e) => ({
                valor: e.empresa.id,
                etiqueta: e.empresa.nombre,
              }))}
          />
        </div>

        {cDetalle.fase === 'error' && cDetalle.error ? (
          <BloqueError
            error={cDetalle.error}
            onReintentar={cDetalle.recargar}
          />
        ) : cargandoDetalle ? (
          <Panel>
            <p className="text-sm text-ink-soft">Cargando {nombreSel}…</p>
          </Panel>
        ) : tieneDatos ? (
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
              {nombreSel || 'Esta empresa'} todavía no tiene empleados cargados,
              así que no hay datos de puntualidad, extras ni presentismo para
              mostrar.
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

      {/* Los indicadores muestran "…" mientras cargan y cero si no hay
          datos: sin esto, un fallo se leía como "ausentismo 0%". */}
      {cDetalle.fase === 'error' && cDetalle.error && (
        <BloqueError error={cDetalle.error} onReintentar={cDetalle.recargar} />
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          etiqueta="Ausentismo"
          valor={resumen ? `${resumen.ausentismoPct}%` : '…'}
          detalle="del mes en curso"
          href="/ausencias"
          icono={IconUserExclamation}
        />
        <StatCard
          etiqueta="Llegadas tarde"
          valor={resumen?.llegadasTardeTotal ?? '…'}
          detalle="última semana"
          href="/fichaje"
          icono={IconClockExclamation}
        />
        <StatCard
          etiqueta="Horas extras"
          valor={resumen ? `${resumen.horasExtrasTotal} hs` : '…'}
          detalle="última semana"
          href="/fichaje"
          icono={IconClockPlus}
        />
        {/* Los recibos son de RRHH: a un supervisor la base sólo le
            cuenta los propios, así que el número no diría lo que promete
            el rótulo. */}
        {rolEfectivo === 'admin_rrhh' && (
          <StatCard
            etiqueta="Recibos sin firmar"
            valor={resumen?.recibosSinFirmar ?? '…'}
            detalle="a reclamar"
            href="/recibos"
            icono={IconSignature}
          />
        )}
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

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-soft">
          Exportación de novedades para liquidación disponible desde Fichaje.
        </p>
        <Boton
          variante="secundario"
          tamano="sm"
          onClick={() =>
            descargarCSV(`reportes-${hoyISO()}.csv`, [
              ['Colaborador', 'Minutos tarde', 'Horas extras'],
              ...(resumen?.porEmpleado.map((e) => [
                e.nombreCompleto,
                String(e.minutosTarde),
                String(e.horasExtras),
              ]) ?? []),
            ])
          }
        >
          <IconDownload size={16} />
          Exportar CSV
        </Boton>
      </div>
    </div>
  );
};

/** La empresa puede tener esta sección apagada: se bloquea la ruta,
 * no sólo el link del menú. */
const ReportesPageProtegida = () => (
  <RequireEmpresa>
    <RequireModulo modulo="reportes">
      <ReportesPage />
    </RequireModulo>
  </RequireEmpresa>
);

export default ReportesPageProtegida;
