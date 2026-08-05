'use client';

import { useMemo, useState } from 'react';
import {
  IconDeviceMobile,
  IconDeviceTablet,
  IconDownload,
  IconFilter,
  IconPencilPlus,
  IconTable,
  IconList,
} from '@tabler/icons-react';
import { Panel } from '@/components/app/Panel';
import { Boton } from '@/components/app/ui/Boton';
import { Paginacion, usePaginacion } from '@/components/app/ui/Paginacion';
import { BloqueError } from '@/components/app/EstadoCarga';
import { FiltrosFichadasModal, FiltrosFichadas } from './FiltrosFichadasModal';
import { avisoError, avisoExito } from '@/lib/avisos';
import { useCarga } from '@/lib/useCarga';
import {
  getAusencias,
  getEmpleados,
  getEmpresa,
  getFeriados,
  getFichajesEntre,
} from '@/lib/services/rrhh';
import { armarResumen, diaLocal, horaLocal } from '@/lib/fichadas';
import { descargarResumenFichadas } from '@/lib/exportarFichadas';
import { formatearFecha, hoyISO } from '@/lib/fechas';
import {
  Ausencia,
  Empleado,
  Feriado,
  Fichaje,
  MetodoFichaje,
} from '@/types/rrhh';

const POR_PAGINA = 15;

const metodoLabel: Record<MetodoFichaje, string> = {
  facial_tablet: 'Reconocimiento facial',
  celular: 'Celular + GPS',
  remoto: 'Remoto',
  manual: 'Carga manual',
};

const iconoMetodo = (m: MetodoFichaje) =>
  m === 'facial_tablet'
    ? IconDeviceTablet
    : m === 'manual'
      ? IconPencilPlus
      : IconDeviceMobile;

/** Últimos 7 días, que es lo que se mira el 90% de las veces. */
const rangoPorDefecto = (): { desde: string; hasta: string } => {
  const hasta = hoyISO();
  const d = new Date();
  d.setDate(d.getDate() - 6);
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return { desde: `${d.getFullYear()}-${mes}-${dia}`, hasta };
};

/**
 * Historial de fichadas: ver hacia atrás con filtros, y bajar el
 * resumen en Excel.
 *
 * Hasta ahora la pantalla de Fichaje solo mostraba el día de hoy, así
 * que revisar una semana pasada —lo que se hace al liquidar, o cuando
 * alguien discute un día— no se podía hacer desde la app.
 */
export const HistorialFichadas = () => {
  const [filtros, setFiltros] = useState<FiltrosFichadas>({
    ...rangoPorDefecto(),
    nombre: '',
    sector: '',
    soloIncompletos: false,
  });
  const [modalAbierto, setModalAbierto] = useState(false);
  const [vista, setVista] = useState<'movimientos' | 'resumen'>('movimientos');
  const [exportando, setExportando] = useState(false);

  const cFichajes = useCarga(
    () => getFichajesEntre(filtros.desde, filtros.hasta),
    [filtros.desde, filtros.hasta],
    { contexto: 'fichaje/historial', inicial: [] as Fichaje[] }
  );
  const cEmpleados = useCarga(() => getEmpleados(), [], {
    contexto: 'fichaje/historial-empleados',
    inicial: [] as Empleado[],
  });
  const cAusencias = useCarga(() => getAusencias(), [], {
    contexto: 'fichaje/historial-ausencias',
    inicial: [] as Ausencia[],
  });
  const cFeriados = useCarga(() => getFeriados(), [], {
    contexto: 'fichaje/historial-feriados',
    inicial: [] as Feriado[],
  });

  const empleados = cEmpleados.datos;
  const empleadoDe = useMemo(
    () => new Map(empleados.map((e) => [e.id, e])),
    [empleados]
  );

  const sectores = useMemo(
    () =>
      [...new Set(empleados.map((e) => e.sector).filter(Boolean))].sort(
        (a, b) => a.localeCompare(b, 'es')
      ),
    [empleados]
  );

  /** Los empleados que pasan el filtro de nombre y sector. */
  const empleadosFiltrados = useMemo(() => {
    const busqueda = filtros.nombre.trim().toLowerCase();
    return empleados.filter((e) => {
      if (filtros.sector && e.sector !== filtros.sector) return false;
      if (!busqueda) return true;
      return `${e.nombre} ${e.apellido} ${e.numeroLegajo ?? ''} ${e.dni}`
        .toLowerCase()
        .includes(busqueda);
    });
  }, [empleados, filtros.nombre, filtros.sector]);

  const idsVisibles = useMemo(
    () => new Set(empleadosFiltrados.map((e) => e.id)),
    [empleadosFiltrados]
  );

  const resumen = useMemo(
    () =>
      armarResumen(
        filtros.desde,
        filtros.hasta,
        empleadosFiltrados,
        cFichajes.datos.filter((f) => idsVisibles.has(f.empleadoId)),
        cAusencias.datos,
        cFeriados.datos
      ),
    [
      filtros.desde,
      filtros.hasta,
      empleadosFiltrados,
      cFichajes.datos,
      idsVisibles,
      cAusencias.datos,
      cFeriados.datos,
    ]
  );

  /** Movimientos sueltos, del más nuevo al más viejo. */
  const movimientos = useMemo(() => {
    const jornadasIncompletas = new Set(
      resumen.filas.flatMap((f) =>
        f.dias
          .filter((d) => d.incompleta && (d.entrada || d.salida))
          .map((d) => `${f.empleado.id}|${d.fecha}`)
      )
    );
    return cFichajes.datos
      .filter((f) => idsVisibles.has(f.empleadoId))
      .filter(
        (f) =>
          !filtros.soloIncompletos ||
          jornadasIncompletas.has(`${f.empleadoId}|${diaLocal(f.timestamp)}`)
      )
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }, [cFichajes.datos, idsVisibles, filtros.soloIncompletos, resumen.filas]);

  const paginaMovimientos = usePaginacion(movimientos, POR_PAGINA);

  const descripcionFiltros = useMemo(() => {
    const lista: string[] = [];
    if (filtros.nombre.trim())
      lista.push(`Colaborador contiene: "${filtros.nombre.trim()}"`);
    if (filtros.sector) lista.push(`Sector: ${filtros.sector}`);
    if (filtros.soloIncompletos)
      lista.push('Solo jornadas incompletas (falta entrada o salida)');
    return lista;
  }, [filtros]);

  const exportar = async () => {
    if (resumen.filas.length === 0) {
      avisoError('No hay nada para exportar', 'Ampliá el rango o los filtros.');
      return;
    }
    setExportando(true);
    try {
      const empresa = await getEmpresa();
      const nombre = await descargarResumenFichadas({
        resumen,
        empresa: empresa.razonSocial || empresa.nombre,
        filtros: descripcionFiltros,
      });
      avisoExito('Excel generado', nombre);
    } catch (err) {
      avisoError(
        'No pudimos generar el Excel',
        err instanceof Error ? err.message : undefined
      );
    }
    setExportando(false);
  };

  const cargando = cFichajes.fase === 'cargando';

  return (
    <Panel className="flex flex-col gap-4">
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-bold text-ink">
            Historial de fichadas
          </h2>
          <p className="mt-0.5 text-sm text-ink-soft">
            {formatearFecha(filtros.desde)} a {formatearFecha(filtros.hasta)} ·{' '}
            {movimientos.length}{' '}
            {movimientos.length === 1 ? 'movimiento' : 'movimientos'}
            {descripcionFiltros.length > 0 && ' · con filtros'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-xl border border-line">
            <button
              type="button"
              onClick={() => setVista('movimientos')}
              className={`flex cursor-pointer items-center gap-1.5 px-3 py-2 text-xs font-semibold transition-colors ${
                vista === 'movimientos'
                  ? 'bg-brand-100 text-brand-800'
                  : 'bg-surface text-ink-soft hover:text-ink'
              }`}
            >
              <IconList size={14} />
              Movimientos
            </button>
            <button
              type="button"
              onClick={() => setVista('resumen')}
              className={`flex cursor-pointer items-center gap-1.5 border-l border-line px-3 py-2 text-xs font-semibold transition-colors ${
                vista === 'resumen'
                  ? 'bg-brand-100 text-brand-800'
                  : 'bg-surface text-ink-soft hover:text-ink'
              }`}
            >
              <IconTable size={14} />
              Resumen
            </button>
          </div>
          <Boton
            variante="secundario"
            tamano="sm"
            onClick={() => setModalAbierto(true)}
          >
            <IconFilter size={15} />
            Filtros
            {descripcionFiltros.length > 0 && (
              <span className="ml-1 rounded-full bg-brand-600 px-1.5 text-[0.65rem] font-bold text-white">
                {descripcionFiltros.length}
              </span>
            )}
          </Boton>
          <Boton
            variante="secundario"
            tamano="sm"
            onClick={() => void exportar()}
            disabled={exportando}
          >
            <IconDownload size={15} />
            {exportando ? 'Generando…' : 'Excel'}
          </Boton>
        </div>
      </div>

      {cFichajes.fase === 'error' && cFichajes.error && (
        <BloqueError
          error={cFichajes.error}
          onReintentar={cFichajes.recargar}
        />
      )}

      {cargando && <p className="py-6 text-sm text-ink-soft">Cargando…</p>}

      {!cargando && vista === 'movimientos' && (
        <>
          {movimientos.length === 0 ? (
            <p className="py-6 text-sm text-ink-soft">
              No hay fichadas en ese rango con esos filtros.
            </p>
          ) : (
            <div className="-mx-2 overflow-x-auto">
              <table className="w-full min-w-[42rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-ink-soft">
                    <th className="px-2 py-2">Fecha</th>
                    <th className="px-2 py-2">Hora</th>
                    <th className="px-2 py-2">Colaborador</th>
                    <th className="px-2 py-2">Fichaje</th>
                    <th className="px-2 py-2">Método</th>
                    <th className="px-2 py-2">Sector</th>
                  </tr>
                </thead>
                <tbody>
                  {paginaMovimientos.visibles.map((f) => {
                    const e = empleadoDe.get(f.empleadoId);
                    const Icono = iconoMetodo(f.metodo);
                    return (
                      <tr
                        key={f.id}
                        className="border-b border-line/60 last:border-0"
                      >
                        <td className="whitespace-nowrap px-2 py-2.5 text-ink-soft">
                          {formatearFecha(diaLocal(f.timestamp))}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2.5 font-semibold text-ink">
                          {horaLocal(f.timestamp)}
                        </td>
                        <td className="px-2 py-2.5 text-ink">
                          {e ? `${e.apellido} ${e.nombre}` : '—'}
                        </td>
                        <td className="px-2 py-2.5">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                              f.tipo === 'ingreso'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {f.tipo === 'ingreso' ? 'Entrada' : 'Salida'}
                          </span>
                          {f.fueraDeZona && (
                            <span className="ml-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-[0.65rem] font-bold text-amber-800">
                              Fuera de zona
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2.5 text-ink-soft">
                          <span className="flex items-center gap-1.5">
                            <Icono size={14} className="shrink-0" />
                            <span className="text-xs">
                              {metodoLabel[f.metodo]}
                            </span>
                          </span>
                        </td>
                        <td className="px-2 py-2.5 text-xs text-ink-soft">
                          {e?.sector ?? '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <Paginacion
            pagina={paginaMovimientos.pagina}
            totalPaginas={paginaMovimientos.totalPaginas}
            onCambiar={paginaMovimientos.setPagina}
          />
        </>
      )}

      {!cargando && vista === 'resumen' && (
        <>
          {resumen.filas.length === 0 ? (
            <p className="py-6 text-sm text-ink-soft">
              Ningún colaborador coincide con esos filtros.
            </p>
          ) : (
            <div className="-mx-2 overflow-x-auto">
              <table className="w-full min-w-[34rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-ink-soft">
                    <th className="px-2 py-2">Colaborador</th>
                    <th className="px-2 py-2 text-right">Días trabajados</th>
                    <th className="px-2 py-2 text-right">Horas totales</th>
                    <th className="px-2 py-2 text-right">
                      Jornadas sin cerrar
                    </th>
                    <th className="px-2 py-2 text-right">
                      Feriados trabajados
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {resumen.filas.map((f) => {
                    const sinCerrar = f.dias.filter(
                      (d) => d.incompleta && (d.entrada || d.salida)
                    ).length;
                    return (
                      <tr
                        key={f.empleado.id}
                        className="border-b border-line/60 last:border-0"
                      >
                        <td className="px-2 py-2.5 text-ink">
                          {f.empleado.apellido} {f.empleado.nombre}
                        </td>
                        <td className="px-2 py-2.5 text-right font-semibold text-ink">
                          {f.diasTrabajados}
                        </td>
                        <td className="px-2 py-2.5 text-right font-semibold text-ink">
                          {f.horasTotales}
                        </td>
                        <td
                          className={`px-2 py-2.5 text-right font-semibold ${
                            sinCerrar > 0 ? 'text-amber-700' : 'text-ink-soft'
                          }`}
                        >
                          {sinCerrar}
                        </td>
                        <td className="px-2 py-2.5 text-right text-ink-soft">
                          {f.feriadosTrabajados}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-ink-soft">
            El detalle día por día —entrada, salida y horas de cada jornada— va
            en el Excel, que es donde entra a lo ancho.
          </p>
        </>
      )}

      <FiltrosFichadasModal
        abierto={modalAbierto}
        valores={filtros}
        sectores={sectores}
        onCerrar={() => setModalAbierto(false)}
        onAplicar={(v) => {
          setFiltros(v);
          setModalAbierto(false);
        }}
        onRestablecer={() =>
          setFiltros({
            ...rangoPorDefecto(),
            nombre: '',
            sector: '',
            soloIncompletos: false,
          })
        }
      />
    </Panel>
  );
};
