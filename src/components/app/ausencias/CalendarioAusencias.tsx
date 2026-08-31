'use client';

import { Fragment, ReactNode, useMemo, useState } from 'react';
import { Modal } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import {
  IconChevronLeft,
  IconChevronRight,
  IconClock,
  IconFilter,
} from '@tabler/icons-react';
import {
  tipoAusenciaColores,
  tipoAusenciaIconos,
  tipoAusenciaLabels,
} from '@/lib/etiquetas';
import { Ausencia, Feriado, TipoAusencia } from '@/types/rrhh';
import { formatearFecha, hoyISO, partesDeFecha } from '@/lib/fechas';
import { feriadoDe } from '@/lib/feriados';
import {
  agruparPorEmpleado,
  agruparPorTipo,
  anclaAlCambiarVista,
  anclaNormalizada,
  ausenciasDelDia,
  capitalizar,
  desbordePorDia,
  DIAS_CORTOS,
  DIAS_INICIAL,
  esDelPeriodo,
  esFinDeSemana,
  filasDeVista,
  moverAncla,
  rangoVisible,
  SegmentoAusencia,
  segmentosDeFila,
  tituloDeVista,
  tocaRango,
  VistaCalendario,
} from '@/lib/calendario';
import { DetalleAusenciaModal } from '@/components/app/ausencias/DetalleAusenciaModal';

interface CalendarioAusenciasProps {
  ausencias: Ausencia[];
  nombreEmpleado: (empleadoId: string) => string;
  soloAprobadas?: boolean;
  /** Para pintar feriados y días no laborables. Sólo decoración. */
  feriados?: Feriado[];
  /** Botones del detalle (aprobar, rechazar, certificado), si los hay. */
  acciones?: (a: Ausencia, cerrar: () => void) => ReactNode;
  /** Texto del cartel cuando el período no tiene ninguna ausencia. */
  vacio?: string;
}

const VISTAS: { valor: VistaCalendario; etiqueta: string }[] = [
  { valor: 'mes', etiqueta: 'Mes' },
  { valor: 'semana', etiqueta: 'Semana' },
  { valor: 'dia', etiqueta: 'Día' },
];

/** Carriles visibles por semana antes de empezar a contar "+N más". */
const CARRILES_MES = { compacto: 2, ancho: 3 };
/** Alto de cada carril, en px. El de la barra sale de acá menos el aire. */
const ALTO_CARRIL = { compacto: 20, ancho: 24 };

const rangoTexto = (a: Ausencia): string =>
  a.fechaDesde === a.fechaHasta
    ? formatearFecha(a.fechaDesde)
    : `${formatearFecha(a.fechaDesde)} al ${formatearFecha(a.fechaHasta)}`;

const tituloBarra = (a: Ausencia, nombre: string): string =>
  `${nombre} · ${tipoAusenciaLabels[a.tipo]} · ${rangoTexto(a)} · ${a.dias} ${a.dias === 1 ? 'día' : 'días'}${a.estado === 'pendiente' ? ' · Pendiente de aprobar' : ''}`;

/**
 * Barra de una ausencia dentro de una fila del calendario.
 *
 * El color del tipo se usa como en el resto de la app (`tipoAusenciaColores`),
 * pero acá va de relleno translúcido y de riel a la izquierda, no de fondo
 * sólido: el bloque tiene texto encima y con el color pleno el nombre no se
 * lee, ni en claro ni en oscuro.
 *
 * El estado NO se distingue sólo por color: pendiente lleva borde punteado
 * y un reloj, y el título del bloque lo dice con todas las letras.
 */
const BarraAusencia = <T extends Ausencia>({
  segmento,
  nombre,
  principal,
  secundario,
  alto,
  onClick,
}: {
  segmento: SegmentoAusencia<T>;
  /** Nombre del colaborador. Va al `title`, se muestre o no. */
  nombre: string;
  /** Texto grande del bloque. */
  principal: string;
  /** Texto de apoyo, si entra (en la vista mes, el tipo). */
  secundario?: string;
  alto: number;
  onClick: () => void;
}) => {
  const a = segmento.ausencia;
  const color = tipoAusenciaColores[a.tipo];
  const pendiente = a.estado === 'pendiente';
  const puntas = `${segmento.continuaAntes ? 'rounded-l-none' : 'rounded-l-md'} ${
    segmento.continuaDespues ? 'rounded-r-none' : 'rounded-r-md'
  }`;
  return (
    <button
      type="button"
      onClick={onClick}
      title={tituloBarra(a, nombre)}
      style={{
        gridColumn: `${segmento.inicio + 1} / span ${segmento.largo}`,
        gridRow: segmento.carril + 1,
        height: alto - 4,
      }}
      className={`presionable pointer-events-auto relative z-10 mx-[2px] flex min-w-0 cursor-pointer items-center gap-1 self-center overflow-hidden border px-1 text-left ${puntas} ${
        pendiente
          ? 'border-dashed border-amber-500'
          : 'border-solid border-line-strong/50'
      }`}
    >
      {/* Relleno tenue del color del tipo, debajo del texto. */}
      <span aria-hidden className={`absolute inset-0 opacity-20 ${color}`} />
      {!segmento.continuaAntes && (
        <span
          aria-hidden
          className={`relative h-full w-[3px] shrink-0 ${color}`}
        />
      )}
      {pendiente && (
        <IconClock
          size={11}
          className="relative shrink-0 text-amber-600"
          aria-hidden
        />
      )}
      <span className="relative truncate text-[0.6875rem] font-semibold leading-none text-ink">
        {principal}
        {secundario && segmento.largo > 1 && (
          <span className="font-normal text-ink-soft">
            {' · '}
            {secundario}
          </span>
        )}
      </span>
      {segmento.continuaDespues && (
        <IconChevronRight
          size={11}
          className="relative ml-auto shrink-0 text-ink-soft"
          aria-hidden
        />
      )}
    </button>
  );
};

/**
 * Calendario de ausencias del equipo, en mes, semana o día.
 *
 * Muestra lo que ya calcularon la base y la pantalla que lo usa: filtra
 * por estado para no dibujar rechazadas y recorta cada ausencia a la
 * fila que se está viendo. Nada más. Los días de cada ausencia, las
 * aprobaciones y los permisos viven donde vivían.
 */
export const CalendarioAusencias = ({
  ausencias,
  nombreEmpleado,
  soloAprobadas = false,
  feriados,
  acciones,
  vacio,
}: CalendarioAusenciasProps) => {
  // Día y mes de NEGOCIO. Con el reloj del dispositivo, el calendario
  // abría en el mes siguiente el último día del mes a la noche, y el
  // recuadro de "hoy" se pintaba en el día equivocado.
  const hoyStr = hoyISO();
  const [vista, setVista] = useState<VistaCalendario>('mes');
  const [ancla, setAncla] = useState(() => anclaNormalizada('mes', hoyStr));
  const [diaSel, setDiaSel] = useState<string | null>(null);
  const [ausenciaSel, setAusenciaSel] = useState<Ausencia | null>(null);

  // Escritorio por defecto: en el primer render del servidor no hay
  // `matchMedia`, y arrancar en modo compacto hacía saltar la grilla.
  const compacto = !useMediaQuery('(min-width: 640px)', true);
  const carrilesMes = compacto ? CARRILES_MES.compacto : CARRILES_MES.ancho;
  const altoCarril = compacto ? ALTO_CARRIL.compacto : ALTO_CARRIL.ancho;

  // Admin ve aprobadas y pendientes; empleados solo ven vacaciones aprobadas.
  const vigentes = useMemo(
    () =>
      ausencias.filter((a) =>
        soloAprobadas ? a.estado === 'aprobada' : a.estado !== 'rechazada'
      ),
    [ausencias, soloAprobadas]
  );

  const rango = rangoVisible(vista, ancla);
  const filas = useMemo(() => filasDeVista(vista, ancla), [vista, ancla]);
  const delPeriodo = useMemo(
    () => vigentes.filter((a) => tocaRango(a, rango.desde, rango.hasta)),
    [vigentes, rango.desde, rango.hasta]
  );

  const cambiarVista = (siguiente: VistaCalendario) => {
    // El período se conserva: pasar de mes a semana no puede llevarte a
    // otro mes ni tocar los filtros de la pantalla.
    setAncla(anclaAlCambiarVista(vista, ancla, siguiente, hoyStr));
    setVista(siguiente);
    setDiaSel(null);
  };

  const irHoy = () => {
    setAncla(anclaNormalizada(vista, hoyStr));
    setDiaSel(null);
  };

  const mover = (delta: number) => {
    setAncla(moverAncla(vista, ancla, delta));
    setDiaSel(null);
  };

  const abrirDetalle = (a: Ausencia) => {
    setDiaSel(null);
    setAusenciaSel(a);
  };

  // Tipos presentes en el período, para la leyenda.
  const tiposVisibles = useMemo(() => {
    const vistos = new Set<TipoAusencia>();
    delPeriodo.forEach((a) => vistos.add(a.tipo));
    return Array.from(vistos).sort((a, b) =>
      tipoAusenciaLabels[a].localeCompare(tipoAusenciaLabels[b])
    );
  }, [delPeriodo]);

  const feriadoEn = (fecha: string) =>
    feriados ? feriadoDe(fecha, feriados) : undefined;

  /** Clases de fondo de una celda de día, según qué clase de día es. */
  const fondoDia = (fecha: string, delMes: boolean): string => {
    const feriado = feriadoEn(fecha);
    if (feriado?.noLaborable) return 'bg-amber-50 border-amber-200';
    if (!delMes) return 'bg-transparent border-transparent';
    if (esFinDeSemana(fecha)) return 'bg-paper border-line';
    return 'bg-surface border-line';
  };

  const tituloDia = (fecha: string): string | undefined => {
    const feriado = feriadoEn(fecha);
    if (!feriado) return undefined;
    return feriado.noLaborable
      ? `${feriado.nombre} · feriado`
      : `${feriado.nombre} · se trabaja`;
  };

  const seleccionados = diaSel ? ausenciasDelDia(vigentes, diaSel) : [];

  const encabezado = (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => mover(-1)}
          aria-label="Período anterior"
          className="presionable flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border border-line-strong bg-surface text-ink-soft hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700"
        >
          <IconChevronLeft size={18} />
        </button>
        <button
          type="button"
          onClick={() => mover(1)}
          aria-label="Período siguiente"
          className="presionable flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border border-line-strong bg-surface text-ink-soft hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700"
        >
          <IconChevronRight size={18} />
        </button>
        <h3 className="ml-1 min-w-0 truncate text-[1.0625rem] font-bold tracking-tight text-ink">
          {capitalizar(tituloDeVista(vista, ancla))}
        </h3>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={irHoy}
          className="presionable min-h-10 cursor-pointer rounded-xl border border-line-strong bg-surface px-3.5 text-[0.8125rem] font-semibold text-ink hover:border-brand-400 hover:text-brand-700 sm:min-h-9"
        >
          Hoy
        </button>
        <div
          role="group"
          aria-label="Vista del calendario"
          className="flex items-center gap-1 rounded-xl border border-line bg-paper p-1"
        >
          {VISTAS.map((v) => (
            <button
              key={v.valor}
              type="button"
              aria-pressed={vista === v.valor}
              onClick={() => cambiarVista(v.valor)}
              className={`min-h-8 cursor-pointer rounded-lg px-3 text-[0.8125rem] font-semibold transition-colors ${
                vista === v.valor
                  ? 'bg-surface text-brand-700 shadow-soft'
                  : 'bg-transparent text-ink-soft hover:text-ink'
              }`}
            >
              {v.etiqueta}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const leyenda = (
    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line pt-3 text-[0.7rem] text-ink-soft">
      {tiposVisibles.map((t) => (
        <span key={t} className="flex items-center gap-1.5">
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${tipoAusenciaColores[t]}`}
          />
          {tipoAusenciaLabels[t]}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-4 shrink-0 rounded-sm border border-dashed border-amber-500" />
        Pendiente de aprobar
      </span>
      {feriados && feriados.length > 0 && (
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-4 shrink-0 rounded-sm border border-amber-200 bg-amber-50" />
          Feriado
        </span>
      )}
    </div>
  );

  const sinDatos = delPeriodo.length === 0 && (
    <p className="rounded-xl border border-dashed border-line bg-paper px-4 py-6 text-center text-sm text-ink-soft">
      {vacio ?? 'Nadie ausente en este período.'}
    </p>
  );

  const vistaMes = (
    <div>
      <div className="grid grid-cols-7 gap-1">
        {(compacto ? DIAS_INICIAL : DIAS_CORTOS).map((d, i) => (
          <span
            key={`${d}-${i}`}
            className="pb-1 text-center text-[0.6875rem] font-bold uppercase tracking-wide text-ink-soft"
          >
            {d}
          </span>
        ))}
      </div>
      <div className="flex flex-col gap-1">
        {filas.map((dias) => {
          const segmentos = segmentosDeFila(delPeriodo, dias);
          const visibles = segmentos.filter((s) => s.carril < carrilesMes);
          const desborde = desbordePorDia(segmentos, dias, carrilesMes);
          const altoFila = 26 + carrilesMes * altoCarril + altoCarril;
          return (
            <div
              key={dias[0]}
              className="relative"
              style={{ minHeight: altoFila }}
            >
              <div className="absolute inset-0 grid grid-cols-7 gap-1">
                {dias.map((fecha) => {
                  const delMes = esDelPeriodo(fecha, ancla);
                  const cantidad = ausenciasDelDia(delPeriodo, fecha).length;
                  return (
                    <button
                      key={fecha}
                      type="button"
                      onClick={() => setDiaSel(fecha)}
                      title={tituloDia(fecha)}
                      aria-label={`${partesDeFecha(fecha).dia} · ${cantidad} ${cantidad === 1 ? 'ausente' : 'ausentes'}`}
                      className={`hover-bloque flex cursor-pointer flex-col items-start rounded-lg border p-1 text-left ${fondoDia(fecha, delMes)}`}
                    >
                      <span
                        className={`flex h-[1.375rem] min-w-[1.375rem] items-center justify-center rounded-full px-1 text-[0.75rem] leading-none ${
                          fecha === hoyStr
                            ? 'bg-brand-600 font-bold text-white'
                            : delMes
                              ? 'font-semibold text-ink'
                              : 'font-medium text-ink-soft/60'
                        }`}
                      >
                        {partesDeFecha(fecha).dia}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div
                // `gap-x` sí, `gap-y` no: las columnas tienen que caer
                // exactamente sobre las celdas del fondo, pero un hueco
                // entre carriles empujaba el "+N más" fuera de la fila.
                className="pointer-events-none absolute inset-x-0 grid grid-cols-7 gap-x-1"
                style={{
                  top: 26,
                  gridAutoRows: `${altoCarril}px`,
                }}
              >
                {visibles.map((s) => (
                  <BarraAusencia
                    key={s.clave}
                    segmento={s}
                    nombre={nombreEmpleado(s.ausencia.empleadoId)}
                    principal={nombreEmpleado(s.ausencia.empleadoId)}
                    secundario={tipoAusenciaLabels[s.ausencia.tipo]}
                    alto={altoCarril}
                    onClick={() => abrirDetalle(s.ausencia)}
                  />
                ))}
                {Object.entries(desborde).map(([fecha, cuantas]) => (
                  <button
                    key={`mas-${fecha}`}
                    type="button"
                    onClick={() => setDiaSel(fecha)}
                    style={{
                      gridColumn: dias.indexOf(fecha) + 1,
                      gridRow: carrilesMes + 1,
                      height: altoCarril - 4,
                    }}
                    className="presionable pointer-events-auto z-10 mx-[2px] cursor-pointer self-center truncate rounded-md px-1 text-left text-[0.6875rem] font-bold leading-none text-brand-700 hover:bg-brand-50"
                  >
                    +{cuantas}
                    {!compacto && ' más'}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const dias = filas[0] ?? [];
  const porEmpleado = agruparPorEmpleado(delPeriodo, nombreEmpleado);

  const vistaSemana = (
    <div className="overflow-x-auto">
      {compacto && (
        // En el teléfono la semana entra a lo ancho recién scrolleando:
        // sin este aviso parece que faltaran días.
        <p className="mb-2 text-[0.7rem] text-ink-soft">
          Deslizá de costado para ver la semana completa.
        </p>
      )}
      <div className="min-w-[40rem]">
        <div
          className="grid gap-1 border-b border-line pb-2"
          style={{ gridTemplateColumns: '9rem repeat(7, minmax(0, 1fr))' }}
        >
          <span className="text-[0.6875rem] font-bold uppercase tracking-wide text-ink-soft">
            Colaborador
          </span>
          {dias.map((fecha, i) => {
            const feriado = feriadoEn(fecha);
            return (
              <button
                key={fecha}
                type="button"
                onClick={() => setDiaSel(fecha)}
                title={tituloDia(fecha)}
                className={`cursor-pointer rounded-lg px-1 py-1 text-center transition-colors hover:bg-paper ${
                  feriado?.noLaborable
                    ? 'bg-amber-50'
                    : esFinDeSemana(fecha)
                      ? 'bg-paper/70'
                      : ''
                }`}
              >
                <span className="block text-[0.6875rem] font-bold uppercase tracking-wide text-ink-soft">
                  {DIAS_CORTOS[i]}
                </span>
                <span
                  className={`mx-auto mt-0.5 inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[0.8125rem] leading-none ${
                    fecha === hoyStr
                      ? 'bg-brand-600 font-bold text-white'
                      : 'font-semibold text-ink'
                  }`}
                >
                  {partesDeFecha(fecha).dia}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col">
          {porEmpleado.map(({ empleadoId, nombre, ausencias: suyas }) => {
            const segmentos = segmentosDeFila(suyas, dias);
            const carriles = Math.max(1, ...segmentos.map((s) => s.carril + 1));
            return (
              <div
                key={empleadoId}
                className="grid items-center gap-1 border-b border-line py-1.5 last:border-b-0"
                style={{
                  gridTemplateColumns: '9rem repeat(7, minmax(0, 1fr))',
                }}
              >
                <span className="truncate pr-2 text-[0.8125rem] font-semibold text-ink">
                  {nombre}
                </span>
                <div
                  className="col-span-7 grid grid-cols-7 gap-x-1"
                  style={{
                    gridAutoRows: `${altoCarril}px`,
                    minHeight: carriles * altoCarril,
                  }}
                >
                  {/* Fondo de fin de semana y feriado, para leer la semana
                      de un vistazo aunque la persona no tenga barras ahí. */}
                  {dias.map((fecha, i) => {
                    const feriado = feriadoEn(fecha);
                    const tono = feriado?.noLaborable
                      ? 'bg-amber-50'
                      : esFinDeSemana(fecha)
                        ? 'bg-paper/70'
                        : '';
                    return tono ? (
                      <span
                        key={`f-${fecha}`}
                        aria-hidden
                        className={`rounded-md ${tono}`}
                        style={{ gridColumn: i + 1, gridRow: `1 / -1` }}
                      />
                    ) : (
                      <Fragment key={`f-${fecha}`} />
                    );
                  })}
                  {segmentos.map((s) => (
                    <BarraAusencia
                      key={s.clave}
                      segmento={s}
                      nombre={nombre}
                      principal={tipoAusenciaLabels[s.ausencia.tipo]}
                      alto={altoCarril}
                      onClick={() => abrirDetalle(s.ausencia)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  const vistaDia = (
    <div className="flex flex-col gap-3">
      {agruparPorTipo(ausenciasDelDia(delPeriodo, ancla)).map(
        ({ tipo, ausencias: delTipo }) => {
          const Icono = tipoAusenciaIconos[tipo];
          return (
            <div
              key={tipo}
              className="rounded-xl border border-line bg-paper p-3"
            >
              <p className="mb-2 flex items-center gap-2 text-[0.8125rem] font-bold uppercase tracking-wide text-ink">
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white ${tipoAusenciaColores[tipo]}`}
                >
                  <Icono size={14} />
                </span>
                {tipoAusenciaLabels[tipo]}
                <span className="font-semibold normal-case text-ink-soft">
                  ({delTipo.length})
                </span>
              </p>
              <div className="flex flex-col gap-1.5">
                {delTipo.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => abrirDetalle(a)}
                    className="hover-bloque flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-left"
                  >
                    <span className="truncate text-sm font-semibold text-ink">
                      {nombreEmpleado(a.empleadoId)}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-xs text-ink-soft">
                        {rangoTexto(a)}
                      </span>
                      {a.estado === 'pendiente' && (
                        <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[0.6rem] font-bold text-amber-800">
                          <IconClock size={10} />
                          Pendiente
                        </span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          );
        }
      )}
    </div>
  );

  return (
    <div>
      {encabezado}

      {vista === 'mes' && vistaMes}
      {vista === 'semana' && (delPeriodo.length === 0 ? sinDatos : vistaSemana)}
      {vista === 'dia' && (delPeriodo.length === 0 ? sinDatos : vistaDia)}

      {(tiposVisibles.length > 0 || (feriados && feriados.length > 0)) &&
        leyenda}

      <Modal
        opened={Boolean(diaSel)}
        onClose={() => setDiaSel(null)}
        radius="lg"
        centered
        title={diaSel ? capitalizar(tituloDeVista('dia', diaSel)) : ''}
        styles={{ title: { fontWeight: 800 } }}
      >
        {seleccionados.length === 0 ? (
          <p className="text-sm text-ink-soft">Nadie ausente este día.</p>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="flex items-center gap-1.5 text-sm text-ink-soft">
              <IconFilter size={14} />
              {seleccionados.length}{' '}
              {seleccionados.length === 1
                ? 'persona ausente'
                : 'personas ausentes'}
              . Tocá una para ver el detalle.
            </p>
            {seleccionados.map((a) => {
              const Icono = tipoAusenciaIconos[a.tipo];
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => abrirDetalle(a)}
                  className="hover-bloque flex cursor-pointer items-center justify-between gap-2 rounded-xl border border-line bg-paper px-3.5 py-3 text-left"
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white ${tipoAusenciaColores[a.tipo]}`}
                    >
                      <Icono size={15} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-ink">
                        {nombreEmpleado(a.empleadoId)}
                      </span>
                      <span className="block truncate text-xs text-ink-soft">
                        {tipoAusenciaLabels[a.tipo]} · {rangoTexto(a)}
                      </span>
                    </span>
                  </span>
                  {a.estado === 'pendiente' && (
                    <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[0.6rem] font-bold text-amber-800">
                      <IconClock size={10} />
                      Pendiente
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </Modal>

      <DetalleAusenciaModal
        ausencia={ausenciaSel}
        nombreEmpleado={nombreEmpleado}
        onCerrar={() => setAusenciaSel(null)}
        acciones={acciones}
      />
    </div>
  );
};
