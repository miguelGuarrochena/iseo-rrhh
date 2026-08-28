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
import { Paginacion } from '@/components/app/ui/Paginacion';
import { BloqueError } from '@/components/app/EstadoCarga';
import { FiltrosFichadasModal, FiltrosFichadas } from './FiltrosFichadasModal';
import { AnularFichajeModal } from './AnularFichajeModal';
import { avisoError, avisoExito } from '@/lib/avisos';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useCarga } from '@/lib/useCarga';
import {
  getAusenciasEntre,
  getEmpleado,
  getEmpleados,
  getEmpresa,
  getFeriados,
  getFichajesPagina,
  getJornadas,
} from '@/lib/services/rrhh';
import {
  armarResumen,
  diaLocal,
  horaLocal,
  Jornada,
  ordenPorApellido,
} from '@/lib/fichadas';
import { descargarResumenFichadas } from '@/lib/exportarFichadas';
import { formatearFecha, hoyISO, sumarDiasEmpresa } from '@/lib/fechas';
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

/**
 * Últimos 7 días, que es lo que se mira el 90% de las veces.
 *
 * Los dos extremos salen de la zona de la empresa. El `desde` se armaba
 * con el reloj del dispositivo mientras el `hasta` ya usaba `hoyISO()`:
 * desde otro huso el rango podía abarcar seis días o ocho.
 */
const rangoPorDefecto = (): { desde: string; hasta: string } => {
  const hasta = hoyISO();
  return { desde: sumarDiasEmpresa(hasta, -6), hasta };
};

/**
 * Historial de fichadas: ver hacia atrás con filtros, y bajar el
 * resumen en Excel.
 *
 * Hasta ahora la pantalla de Fichaje solo mostraba el día de hoy, así
 * que revisar una semana pasada —lo que se hace al liquidar, o cuando
 * alguien discute un día— no se podía hacer desde la app.
 *
 * Con `soloEmpleadoId` es el historial de una sola persona, que es como
 * lo ve el propio empleado: sin filtro por colaborador ni sector (sobran
 * con una sola fila) y sin poder anular. No alcanza con esconder cosas
 * en el cliente —eso no protegería nada—: la policy `fichajes_select`
 * ya deja que un empleado lea únicamente sus marcas, y los RPC de
 * jornadas son `security invoker`, así que la base devuelve sólo lo
 * suyo aunque se pida de más.
 */
export const HistorialFichadas = ({
  soloEmpleadoId,
}: {
  soloEmpleadoId?: string;
} = {}) => {
  const { rolEfectivo } = useAuth();
  const propio = Boolean(soloEmpleadoId);
  const puedeAnular =
    !propio && (rolEfectivo === 'admin_rrhh' || rolEfectivo === 'superadmin');
  const [filtros, setFiltros] = useState<FiltrosFichadas>({
    ...rangoPorDefecto(),
    nombre: '',
    sector: '',
    soloIncompletos: false,
  });
  const [modalAbierto, setModalAbierto] = useState(false);
  const [anularDe, setAnularDe] = useState<Fichaje | null>(null);
  const [vista, setVista] = useState<'movimientos' | 'resumen'>('movimientos');
  const [exportando, setExportando] = useState(false);
  // 1-based, como espera el componente <Paginacion> compartido. La
  // conversión a offset la hace el llamado al servicio.
  const [pagina, setPagina] = useState(1);

  /**
   * Quiénes tienen alguna jornada sin cerrar en el rango.
   *
   * Sólo hace falta con el filtro "solo sin cerrar" puesto, y es una
   * consulta chica por naturaleza: las incidencias son la excepción, no
   * la regla. Va aparte del resumen porque decide QUÉ empleados entran
   * en la lista, y eso hay que saberlo antes de paginar — si se filtrara
   * sobre la página ya traída, un empleado con una jornada abierta que
   * cayera en la página 4 no aparecería nunca. Es el mismo error que ya
   * se había corregido en Movimientos.
   */
  const cConAbiertas = useCarga(
    () =>
      getJornadas(filtros.desde, filtros.hasta, {
        soloAbiertas: true,
        empleadoIds: soloEmpleadoId ? [soloEmpleadoId] : undefined,
      }),
    [filtros.desde, filtros.hasta, soloEmpleadoId],
    {
      activo: filtros.soloIncompletos,
      contexto: 'fichaje/historial-abiertas',
      inicial: [] as Jornada[],
    }
  );
  // En el historial propio no se pide la dotación: con el legajo de uno
  // alcanza, y así la pantalla del empleado no depende de poder leer la
  // lista de sus compañeros.
  const cEmpleados = useCarga(
    async () =>
      soloEmpleadoId
        ? [await getEmpleado(soloEmpleadoId)].filter(
            (e): e is Empleado => e !== null
          )
        : getEmpleados(),
    [soloEmpleadoId],
    {
      contexto: 'fichaje/historial-empleados',
      inicial: [] as Empleado[],
    }
  );
  // Sólo las que tocan el rango: el histórico completo de una empresa
  // con años de uso son miles de filas para pintar unas pocas celdas.
  const cAusencias = useCarga(
    () => getAusenciasEntre(filtros.desde, filtros.hasta),
    [filtros.desde, filtros.hasta],
    {
      contexto: 'fichaje/historial-ausencias',
      inicial: [] as Ausencia[],
    }
  );
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

  /**
   * Ids a pedirle al servidor. `undefined` = sin filtro (no mandar el
   * `in`, que con cientos de empleados haría una URL enorme); un array
   * vacío significa "la búsqueda no matcheó a nadie".
   */
  const idsFiltrados = useMemo(
    () =>
      soloEmpleadoId
        ? [soloEmpleadoId]
        : empleadosFiltrados.length === empleados.length
          ? undefined
          : empleadosFiltrados.map((e) => e.id),
    [soloEmpleadoId, empleadosFiltrados, empleados.length]
  );

  /**
   * Los empleados que entran en el resumen, ya con el filtro de "solo
   * sin cerrar" aplicado. Es la lista que se pagina.
   */
  const empleadosResumen = useMemo(() => {
    const conAbiertas = new Set(cConAbiertas.datos.map((j) => j.empleadoId));
    return (
      empleadosFiltrados
        .filter((e) => !filtros.soloIncompletos || conAbiertas.has(e.id))
        // Ordenado ANTES de paginar, y con el mismo comparador que usa
        // `armarResumen` para las filas: si no, la página 2 no serían "los
        // siguientes alfabéticamente" sino un recorte arbitrario que
        // después se ordena de nuevo dentro de la página.
        .sort(ordenPorApellido)
    );
  }, [empleadosFiltrados, filtros.soloIncompletos, cConAbiertas.datos]);

  const totalPaginasResumen = Math.max(
    1,
    Math.ceil(empleadosResumen.length / POR_PAGINA)
  );

  /**
   * Los empleados de la página que se está mirando. De ellos —y sólo de
   * ellos— se piden las jornadas.
   *
   * Antes se traía el rango completo: con trescientas personas y un mes
   * son varios miles de filas bajadas al navegador para pintar quince.
   * El Excel sí las necesita todas, pero se las pide al exportar.
   */
  const empleadosPagina = useMemo(
    () =>
      empleadosResumen.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA),
    [empleadosResumen, pagina]
  );

  const idsPagina = useMemo(
    () => empleadosPagina.map((e) => e.id),
    [empleadosPagina]
  );

  const cJornadas = useCarga(
    () => getJornadas(filtros.desde, filtros.hasta, { empleadoIds: idsPagina }),
    [filtros.desde, filtros.hasta, idsPagina],
    {
      activo: vista === 'resumen',
      contexto: 'fichaje/historial',
      inicial: [] as Jornada[],
    }
  );

  const resumen = useMemo(
    () =>
      armarResumen(
        filtros.desde,
        filtros.hasta,
        empleadosPagina,
        cJornadas.datos,
        cAusencias.datos,
        cFeriados.datos
      ),
    [
      filtros.desde,
      filtros.hasta,
      empleadosPagina,
      cJornadas.datos,
      cAusencias.datos,
      cFeriados.datos,
    ]
  );

  /** Filas visibles con sus contadores. */
  const filasResumen = useMemo(
    () =>
      resumen.filas.map((fila) => ({
        fila,
        sinCerrar: fila.dias.filter(
          (d) => d.incompleta && (d.entrada || d.salida)
        ).length,
        enCurso: fila.dias.filter((d) => d.enCurso).length,
      })),
    [resumen.filas]
  );

  // Al cambiar cualquier filtro se vuelve a la primera página: quedarse
  // en la página 7 de un resultado que ahora tiene 2 muestra un vacío
  // que parece un error.
  const clavePagina = `${vista}|${filtros.desde}|${filtros.hasta}|${filtros.nombre}|${filtros.sector}|${filtros.soloIncompletos}`;
  const [claveAnterior, setClaveAnterior] = useState(clavePagina);
  if (claveAnterior !== clavePagina) {
    setClaveAnterior(clavePagina);
    setPagina(1);
  }

  /**
   * Movimientos sueltos: los pide el servidor de a una página, con
   * TODOS los filtros aplicados en SQL —incluido "solo sin cerrar"—.
   *
   * Antes ese filtro se aplicaba acá, sobre la página ya traída, y por
   * eso no funcionaba: una jornada abierta que caía en la página 4 no
   * aparecía nunca, y el contador del paginador contaba filas que
   * después se descartaban.
   */
  const cMovimientos = useCarga(
    () =>
      getFichajesPagina(filtros.desde, filtros.hasta, {
        pagina: pagina - 1,
        porPagina: POR_PAGINA,
        empleadoIds: idsFiltrados,
        soloAbiertas: filtros.soloIncompletos,
      }),
    [
      filtros.desde,
      filtros.hasta,
      filtros.soloIncompletos,
      pagina,
      idsFiltrados,
    ],
    {
      activo: vista === 'movimientos',
      contexto: 'fichaje/historial-movimientos',
      inicial: { fichajes: [], total: 0 },
    }
  );

  const movimientos = cMovimientos.datos.fichajes;
  const totalMovimientos = cMovimientos.datos.total;
  const totalPaginas = Math.max(1, Math.ceil(totalMovimientos / POR_PAGINA));

  const descripcionFiltros = useMemo(() => {
    const lista: string[] = [];
    if (filtros.nombre.trim())
      lista.push(`Colaborador contiene: "${filtros.nombre.trim()}"`);
    if (filtros.sector) lista.push(`Sector: ${filtros.sector}`);
    if (filtros.soloIncompletos)
      lista.push('Solo jornadas incompletas (falta entrada o salida)');
    return lista;
  }, [filtros]);

  /**
   * El Excel del contador lleva el período entero, no la página.
   *
   * La pantalla muestra de a quince y por eso sólo pide las jornadas de
   * esos quince. El Excel no puede heredar ese recorte: una planilla a
   * la que le faltan doscientas personas se ve igual de bien que una
   * completa, y el error aparece recién cuando alguien reclama su
   * sueldo. Así que se piden acá, al exportar, para todos los empleados
   * que pasan el filtro.
   */
  const exportar = async () => {
    if (empleadosResumen.length === 0) {
      avisoError('No hay nada para exportar', 'Ampliá el rango o los filtros.');
      return;
    }
    setExportando(true);
    try {
      const [empresa, jornadasTodas] = await Promise.all([
        getEmpresa(),
        getJornadas(filtros.desde, filtros.hasta, {
          empleadoIds: empleadosResumen.map((e) => e.id),
        }),
      ]);
      const nombre = await descargarResumenFichadas({
        resumen: armarResumen(
          filtros.desde,
          filtros.hasta,
          empleadosResumen,
          jornadasTodas,
          cAusencias.datos,
          cFeriados.datos
        ),
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

  // Cada vista espera lo suyo: la de resumen ya no depende de una
  // consulta del rango entero, y la de movimientos nunca dependió del
  // resumen.
  const cargando =
    vista === 'movimientos'
      ? cMovimientos.fase === 'cargando'
      : cJornadas.fase === 'cargando' ||
        (filtros.soloIncompletos && cConAbiertas.fase === 'cargando');

  return (
    <Panel className="flex flex-col gap-4">
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h2 className="text-[1.0625rem] font-bold tracking-tight text-ink">
            {propio ? 'Mis fichadas' : 'Historial de fichadas'}
          </h2>
          <p className="mt-0.5 text-sm text-ink-soft">
            {formatearFecha(filtros.desde)} a {formatearFecha(filtros.hasta)} ·{' '}
            {vista === 'movimientos'
              ? `${totalMovimientos} ${totalMovimientos === 1 ? 'movimiento' : 'movimientos'}`
              : propio
                ? `${filasResumen[0]?.fila.diasTrabajados ?? 0} días trabajados`
                : `${empleadosResumen.length} ${empleadosResumen.length === 1 ? 'colaborador' : 'colaboradores'}`}
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

      {cJornadas.fase === 'error' && cJornadas.error && (
        <BloqueError
          error={cJornadas.error}
          onReintentar={cJornadas.recargar}
        />
      )}
      {cConAbiertas.fase === 'error' && cConAbiertas.error && (
        <BloqueError
          error={cConAbiertas.error}
          onReintentar={cConAbiertas.recargar}
        />
      )}
      {cMovimientos.fase === 'error' && cMovimientos.error && (
        <BloqueError
          error={cMovimientos.error}
          onReintentar={cMovimientos.recargar}
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
            <div className="min-w-0">
              <ul className="flex flex-col gap-2 md:hidden">
                {movimientos.map((f) => {
                  const e = empleadoDe.get(f.empleadoId);
                  const Icono = iconoMetodo(f.metodo);
                  return (
                    <li
                      key={f.id}
                      className="rounded-2xl border border-line bg-paper px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          {!propio && (
                            <p className="truncate font-semibold text-ink">
                              {e ? `${e.apellido} ${e.nombre}` : '—'}
                            </p>
                          )}
                          <p className="text-xs text-ink-soft">
                            {formatearFecha(diaLocal(f.timestamp))} ·{' '}
                            {horaLocal(f.timestamp)}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${
                            f.tipo === 'ingreso'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {f.tipo === 'ingreso' ? 'Entrada' : 'Salida'}
                        </span>
                      </div>
                      <p className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-soft">
                        <span className="inline-flex items-center gap-1">
                          <Icono size={14} className="shrink-0" />
                          {metodoLabel[f.metodo]}
                          {f.motivo && `: ${f.motivo}`}
                        </span>
                        {e?.sector && <span>· {e.sector}</span>}
                        {f.fueraDeZona && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[0.65rem] font-bold text-amber-800">
                            Fuera de zona
                          </span>
                        )}
                        {puedeAnular && (
                          <button
                            type="button"
                            className="font-semibold text-red-700"
                            onClick={() => setAnularDe(f)}
                          >
                            Anular
                          </button>
                        )}
                      </p>
                    </li>
                  );
                })}
              </ul>
              <div className="-mx-2 hidden min-w-0 overflow-x-auto md:block">
                <table className="w-full min-w-[42rem] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-ink-soft">
                      <th className="px-2 py-2">Fecha</th>
                      <th className="px-2 py-2">Hora</th>
                      {!propio && <th className="px-2 py-2">Colaborador</th>}
                      <th className="px-2 py-2">Fichaje</th>
                      <th className="px-2 py-2">Método</th>
                      {!propio && <th className="px-2 py-2">Sector</th>}
                      {puedeAnular && <th className="px-2 py-2"> </th>}
                    </tr>
                  </thead>
                  <tbody>
                    {movimientos.map((f) => {
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
                          {!propio && (
                            <td className="px-2 py-2.5 text-ink">
                              {e ? `${e.apellido} ${e.nombre}` : '—'}
                            </td>
                          )}
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
                            {/* El motivo es la mitad que importa de una
                                carga manual: sin él sólo se sabe que
                                alguien escribió una hora. */}
                            {f.motivo && (
                              <span className="mt-0.5 block text-[0.7rem] leading-snug text-ink-soft/80">
                                {f.motivo}
                              </span>
                            )}
                          </td>
                          {!propio && (
                            <td className="px-2 py-2.5 text-xs text-ink-soft">
                              {e?.sector ?? '—'}
                            </td>
                          )}
                          {puedeAnular && (
                            <td className="px-2 py-2.5">
                              <button
                                type="button"
                                className="text-xs font-semibold text-red-700"
                                onClick={() => setAnularDe(f)}
                              >
                                Anular
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <Paginacion
            pagina={pagina}
            totalPaginas={totalPaginas}
            onCambiar={setPagina}
          />
        </>
      )}

      {!cargando && vista === 'resumen' && (
        <>
          {empleadosResumen.length === 0 ? (
            <p className="py-6 text-sm text-ink-soft">
              {filtros.soloIncompletos
                ? 'Nadie tiene jornadas sin cerrar en ese período. Está todo listo para liquidar.'
                : 'Ningún colaborador coincide con esos filtros.'}
            </p>
          ) : (
            <div className="min-w-0">
              <ul className="flex flex-col gap-2 md:hidden">
                {filasResumen.map(({ fila: f, sinCerrar, enCurso }) => (
                  <li
                    key={f.empleado.id}
                    className="rounded-2xl border border-line bg-paper px-4 py-3"
                  >
                    <p className="truncate font-semibold text-ink">
                      {f.empleado.apellido} {f.empleado.nombre}
                    </p>
                    <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                      <div>
                        <dt className="text-[0.65rem] font-bold uppercase tracking-wide text-ink-soft">
                          Días
                        </dt>
                        <dd className="font-semibold text-ink">
                          {f.diasTrabajados}
                        </dd>
                      </div>
                      <div>
                        <dt
                          className="text-[0.65rem] font-bold uppercase tracking-wide text-ink-soft"
                          title="Puerta a puerta: de la primera entrada a la última salida del día."
                        >
                          Horas
                        </dt>
                        <dd className="font-semibold text-ink">
                          {f.horasTotales}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[0.65rem] font-bold uppercase tracking-wide text-ink-soft">
                          Sin cerrar
                        </dt>
                        <dd
                          className={`font-semibold ${
                            sinCerrar > 0 ? 'text-amber-700' : 'text-ink-soft'
                          }`}
                        >
                          {sinCerrar}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[0.65rem] font-bold uppercase tracking-wide text-ink-soft">
                          Feriados
                        </dt>
                        <dd className="text-ink-soft">
                          {f.feriadosTrabajados}
                        </dd>
                      </div>
                    </dl>
                    {enCurso > 0 && (
                      <span
                        title="Entró y todavía no salió: está trabajando, no es un error para corregir."
                        className="mt-2 inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[0.65rem] font-bold text-emerald-800"
                      >
                        {enCurso} en curso
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <div className="-mx-2 hidden min-w-0 overflow-x-auto md:block">
                <table className="w-full min-w-[34rem] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-ink-soft">
                      <th className="px-2 py-2">Colaborador</th>
                      <th className="px-2 py-2 text-right">Días trabajados</th>
                      {/* A09: "horas" significa dos cosas distintas en la
                          app. Aca y en el Excel son puerta a puerta (es el
                          criterio con el que se liquida); en el panel del
                          colaborador es tiempo efectivo, sin el corte del
                          almuerzo. El `title` lo deja dicho donde se lee. */}
                      <th
                        className="px-2 py-2 text-right"
                        title="Puerta a puerta: de la primera entrada a la última salida del día, con el corte del almuerzo incluido. Es el criterio con el que se liquida."
                      >
                        Horas totales
                      </th>
                      <th className="px-2 py-2 text-right">
                        Jornadas sin cerrar
                      </th>
                      <th className="px-2 py-2 text-right">En curso</th>
                      <th className="px-2 py-2 text-right">
                        Feriados trabajados
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filasResumen.map(({ fila: f, sinCerrar, enCurso }) => {
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
                          <td className="px-2 py-2.5 text-right">
                            {enCurso > 0 ? (
                              <span
                                title="Entró y todavía no salió: está trabajando, no es un error para corregir."
                                className="rounded-full bg-emerald-100 px-2 py-0.5 text-[0.65rem] font-bold text-emerald-800"
                              >
                                {enCurso} en curso
                              </span>
                            ) : (
                              <span className="text-ink-soft">—</span>
                            )}
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
            </div>
          )}
          <Paginacion
            pagina={pagina}
            totalPaginas={totalPaginasResumen}
            onCambiar={setPagina}
          />
          <p className="text-xs text-ink-soft">
            El detalle día por día —entrada, salida y horas de cada jornada— va
            en el Excel, que es donde entra a lo ancho. El Excel lleva el
            período completo, no sólo esta página.
          </p>
        </>
      )}

      <FiltrosFichadasModal
        abierto={modalAbierto}
        valores={filtros}
        sectores={sectores}
        sinColaborador={propio}
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
      {puedeAnular && (
        <AnularFichajeModal
          abierto={Boolean(anularDe)}
          fichaje={anularDe}
          nombreEmpleado={
            anularDe
              ? (() => {
                  const e = empleadoDe.get(anularDe.empleadoId);
                  return e ? `${e.apellido} ${e.nombre}` : 'Colaborador';
                })()
              : ''
          }
          onCerrar={() => setAnularDe(null)}
          onAnulado={() => {
            cMovimientos.recargar();
            cJornadas.recargar();
          }}
        />
      )}
    </Panel>
  );
};
