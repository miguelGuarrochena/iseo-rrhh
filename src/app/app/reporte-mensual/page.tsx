'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  IconArrowNarrowRight,
  IconDownload,
  IconPrinter,
  IconSparkles,
} from '@tabler/icons-react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { Panel } from '@/components/app/Panel';
import { Boton } from '@/components/app/ui/Boton';
import { CampoMes } from '@/components/app/ui/CampoMes';
import { BloqueError } from '@/components/app/EstadoCarga';
import { RequireEmpresa } from '@/components/app/RequireEmpresa';
import { RequireServicio } from '@/components/app/RequireServicio';
import { servicioActivo } from '@/components/app/navItems';
import { TarjetaIndicador } from '@/components/app/reporte/Indicadores';
import { useCarga } from '@/lib/useCarga';
import { useModulos, useServicios } from '@/lib/auth/useModulos';
import { descargarCSV } from '@/lib/csv';
import { formatearPesos } from '@/lib/formato';
import { formatearPeriodo, mesEmpresa, sumarMesesEmpresa } from '@/lib/fechas';
import {
  armarReporteMensual,
  filasDeReporte,
  resumenEjecutivo,
} from '@/lib/reporteMensual';
import { calcularEstadoRrhh, situacionesPrioritarias } from '@/lib/estadoRrhh';
import {
  getDatosReporte,
  getEmpleadosConCuenta,
  getEmpleadosConSueldo,
} from '@/lib/services/rrhh';

/**
 * Reporte mensual de ISEO.
 *
 * Es la única pantalla que cuelga del servicio de asesoría: las empresas
 * que sólo usan la plataforma no la ven ni entrando por la URL. La
 * plataforma es de autogestión; esto es el acompañamiento, que se
 * contrata aparte.
 *
 * Sirve a dos personas a la vez: al asesor de ISEO, que llega a la
 * visita con la foto del mes, y al dueño, que quiere saber en un minuto
 * qué pasó. Por eso arranca con el resumen en frases y recién después
 * vienen los números.
 *
 * Todo lo que se muestra sale de datos ya cargados. Un indicador que no
 * se puede calcular bien no aparece como cero: dice por qué falta.
 */
const ReporteMensualPage = () => {
  const { rolEfectivo } = useAuth();
  const esAdmin = rolEfectivo === 'admin_rrhh';
  const modulos = useModulos();
  // El mes anterior por defecto: el reporte es de un mes terminado.
  const [periodo, setPeriodo] = useState(() =>
    sumarMesesEmpresa(mesEmpresa(), -1)
  );

  /*
   * Las consultas esperan a saber si la empresa tiene el servicio.
   *
   * `RequireServicio` esconde la pantalla, pero los `useCarga` se
   * disparan igual con sólo escribir la URL: una empresa de autogestión
   * pagaba las cuatro consultas del reporte —jornadas del mes incluidas—
   * para terminar viendo el cartel de "no está habilitado". Mientras la
   * config no llegó, `servicioActivo` da false, así que no se pide nada.
   */
  const servicios = useServicios();
  const conAsesoria = esAdmin && servicioActivo('asesoria', servicios);

  const cDatos = useCarga(() => getDatosReporte(periodo), [periodo], {
    activo: conAsesoria,
    contexto: 'reporte-mensual/datos',
  });

  const cCuentas = useCarga(() => getEmpleadosConCuenta(), [], {
    activo: conAsesoria,
    contexto: 'reporte-mensual/cuentas',
    inicial: [] as string[],
  });
  // Sólo los ids: es lo que mira la regla `sin_sueldo` del estado.
  const cSueldos = useCarga(() => getEmpleadosConSueldo(), [], {
    activo: conAsesoria,
    contexto: 'reporte-mensual/sueldos',
    inicial: [] as string[],
  });

  const reporte = useMemo(
    () =>
      cDatos.datos ? armarReporteMensual({ ...cDatos.datos, modulos }) : null,
    [cDatos.datos, modulos]
  );

  const resumen = useMemo(
    () => (reporte ? resumenEjecutivo(reporte) : []),
    [reporte]
  );

  /**
   * El estado de RRHH del mismo momento, para no tener dos pantallas que
   * digan cosas distintas sobre lo mismo. Sale del mismo cálculo que
   * `/estado-rrhh`, que a su vez sale de `requisitos.ts`.
   */
  const estado = useMemo(
    () =>
      cDatos.datos
        ? calcularEstadoRrhh({
            empleados: cDatos.datos.empleados,
            empresa: cDatos.datos.empresa,
            empleadosConCuenta:
              cCuentas.fase === 'ok' ? new Set(cCuentas.datos) : undefined,
            empleadosConSueldo:
              cSueldos.fase === 'ok' ? new Set(cSueldos.datos) : undefined,
            modulos,
          })
        : null,
    [
      cDatos.datos,
      cCuentas.datos,
      cCuentas.fase,
      cSueldos.datos,
      cSueldos.fase,
      modulos,
    ]
  );

  const prioritarias = useMemo(
    () => (estado ? situacionesPrioritarias(estado, 4) : []),
    [estado]
  );

  const exportar = () => {
    if (!reporte || !cDatos.datos) return;
    descargarCSV(
      `reporte-${periodo}.csv`,
      filasDeReporte(reporte, cDatos.datos.empresa.nombre)
    );
  };

  if (!esAdmin) {
    return (
      <p className="text-sm text-ink-soft">
        El reporte mensual lo ve quien administra Recursos Humanos en la
        empresa.
      </p>
    );
  }

  return (
    <RequireEmpresa>
      <RequireServicio servicio="asesoria">
        {/* `hoja-impresa`: la hoja de estilos de impresión cuelga de
            esta clase, así imprimir cualquier otra pantalla de la app
            sigue funcionando como antes (globals.css). */}
        <div className="hoja-impresa flex flex-col gap-6 sm:gap-8">
          {/* Encabezado. En papel queda el título con el período y la
              empresa; los controles no se imprimen. */}
          <div>
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-brand-700">
              <IconSparkles size={14} />
              Asesoría ISEO
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink sm:text-[1.75rem]">
              Reporte de {formatearPeriodo(periodo)}
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-soft">
              {/* Sin agregar un punto propio: media razón social argentina
                  termina en "S.A." y quedaba "S.A..". */}
              {cDatos.datos?.empresa.nombre
                ? `${cDatos.datos.empresa.nombre.replace(/\.$/, '')}. `
                : ''}
              Qué pasó este mes y qué conviene mirar. Todo sale de lo que ya
              está cargado: lo que no se puede calcular con certeza no se
              muestra.
            </p>
          </div>

          <div className="flex flex-col items-stretch gap-3 no-imprimir sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
            <div className="w-full sm:w-56">
              <CampoMes
                etiqueta="Período"
                value={periodo}
                onChange={setPeriodo}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Boton
                variante="secundario"
                onClick={exportar}
                disabled={!reporte}
              >
                <IconDownload size={16} />
                Exportar
              </Boton>
              <Boton
                variante="secundario"
                onClick={() => window.print()}
                disabled={!reporte}
              >
                <IconPrinter size={16} />
                Imprimir
              </Boton>
            </div>
          </div>

          {cDatos.fase === 'error' && cDatos.error ? (
            <BloqueError error={cDatos.error} onReintentar={cDatos.recargar} />
          ) : cDatos.fase === 'cargando' || !reporte ? (
            <Panel>
              <p className="text-sm text-ink-soft">Armando el reporte…</p>
            </Panel>
          ) : (
            <>
              <Panel titulo="Resumen del mes">
                <ul className="flex list-none flex-col gap-2">
                  {resumen.map((frase) => (
                    <li
                      key={frase}
                      className="text-[0.9375rem] leading-relaxed text-ink"
                    >
                      {frase}
                    </li>
                  ))}
                </ul>
              </Panel>

              <div>
                <h2 className="mb-3 text-lg font-bold tracking-tight text-ink">
                  Dotación
                </h2>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <TarjetaIndicador
                    etiqueta="Al cierre del mes"
                    indicador={reporte.dotacion}
                    comparable
                    detalle={`Arrancó con ${reporte.dotacionInicio}`}
                  />
                  <TarjetaIndicador
                    etiqueta="Altas"
                    indicador={{ valor: reporte.altas }}
                  />
                  <TarjetaIndicador
                    etiqueta="Bajas"
                    indicador={{ valor: reporte.bajas }}
                  />
                  <TarjetaIndicador
                    etiqueta="Rotación"
                    indicador={
                      reporte.rotacionPct !== undefined
                        ? { valor: reporte.rotacionPct }
                        : undefined
                    }
                    formato={(n) => `${n}%`}
                    detalle="Bajas sobre la dotación promedio"
                    faltaPorque="Sin dotación en el mes no hay sobre qué calcularla."
                  />
                </div>
              </div>

              <div>
                <h2 className="mb-3 text-lg font-bold tracking-tight text-ink">
                  Ausentismo y horas
                </h2>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  <TarjetaIndicador
                    etiqueta="Ausentismo"
                    indicador={reporte.ausentismoPct}
                    comparable
                    formato={(n) => `${n}%`}
                    subirEsMalo
                    detalle={
                      reporte.diasAusencia !== undefined
                        ? `${reporte.diasAusencia} días hábiles de licencia`
                        : undefined
                    }
                    faltaPorque={
                      reporte.sinAusencias
                        ? 'Esta empresa no usa el módulo de Ausencias, así que no hay licencias cargadas.'
                        : 'Todavía no hay dotación cargada para el mes.'
                    }
                  />
                  <TarjetaIndicador
                    etiqueta="Horas extras aprobadas"
                    indicador={reporte.horasExtras}
                    formato={(n) => `${n} hs`}
                    subirEsMalo
                    faltaPorque="Esta empresa no usa el módulo de Fichaje, así que no hay jornadas de las que sacarlas."
                  />
                  <TarjetaIndicador
                    etiqueta="Costo de las extras"
                    indicador={
                      reporte.costoExtras !== undefined
                        ? { valor: reporte.costoExtras }
                        : undefined
                    }
                    formato={formatearPesos}
                    subirEsMalo
                    detalle={
                      reporte.costoExtrasParcial > 0
                        ? `Es un piso: ${reporte.costoExtrasParcial} ${
                            reporte.costoExtrasParcial === 1
                              ? 'persona con extras no tiene'
                              : 'personas con extras no tienen'
                          } sueldo cargado.`
                        : 'Estimado al 50% de recargo (art. 201 LCT)'
                    }
                    faltaPorque="Hace falta el sueldo cargado para saber cuánto vale la hora."
                  />
                </div>
              </div>

              <div>
                <h2 className="mb-3 text-lg font-bold tracking-tight text-ink">
                  Costo laboral
                </h2>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  <TarjetaIndicador
                    etiqueta="Masa salarial"
                    indicador={reporte.masaSalarial}
                    comparable
                    formato={formatearPesos}
                    detalle={
                      reporte.dotacion.valor
                        ? `${reporte.conSueldoCargado} de ${reporte.dotacion.valor} con sueldo cargado`
                        : undefined
                    }
                    faltaPorque={
                      reporte.sinRemuneraciones
                        ? 'Esta empresa no usa el módulo de Remuneraciones.'
                        : 'Todavía no hay sueldos cargados para este período.'
                    }
                  />
                  <TarjetaIndicador
                    etiqueta="Costo laboral estimado"
                    indicador={
                      reporte.costoLaboralTotal !== undefined
                        ? { valor: reporte.costoLaboralTotal }
                        : undefined
                    }
                    formato={formatearPesos}
                    detalle="Bruto más cargas patronales estimadas"
                    faltaPorque="Sin sueldos cargados no se puede estimar."
                  />
                </div>
              </div>

              {/* El estado de RRHH: lo que hay que resolver, sale del
                  mismo cálculo que la pantalla Estado de RRHH. */}
              {estado && (
                <Panel
                  titulo="Situaciones pendientes"
                  descripcion="Lo mismo que muestra Estado de RRHH, resumido para la visita."
                  acciones={
                    <Link
                      href="/estado-rrhh"
                      className="inline-flex items-center gap-1.5 text-sm font-bold text-brand-700 no-underline underline-offset-4 hover:underline no-imprimir"
                    >
                      Ver todo
                      <IconArrowNarrowRight size={16} />
                    </Link>
                  }
                >
                  {prioritarias.length === 0 ? (
                    <p className="text-sm text-ink-soft">
                      No hay pendientes: los legajos están completos para todo
                      lo que el sistema controla.
                    </p>
                  ) : (
                    <ul className="flex list-none flex-col gap-2">
                      {prioritarias.map((s) => (
                        <li
                          key={s.falta.clave}
                          className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-xl bg-paper px-3.5 py-2.5"
                        >
                          <span className="text-sm font-bold text-ink">
                            {s.falta.titulo}
                          </span>
                          {s.nombres.length > 0 && (
                            <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-bold text-ink-soft">
                              {s.nombres.length}
                            </span>
                          )}
                          {s.falta.severidad === 'bloquea' && (
                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-red-800">
                              Frena
                            </span>
                          )}
                          <span className="w-full text-[0.8125rem] leading-snug text-ink-soft">
                            {s.falta.comoSeArregla}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
              )}

              <p className="text-xs leading-relaxed text-ink-soft">
                Los importes de cargas patronales y del costo de las horas
                extras son estimaciones sobre los porcentajes configurados, no
                una liquidación. El ausentismo se mide en días hábiles sobre la
                dotación al cierre.
              </p>
            </>
          )}
        </div>
      </RequireServicio>
    </RequireEmpresa>
  );
};

export default ReporteMensualPage;
