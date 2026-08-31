'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  IconBeach,
  IconCheck,
  IconDownload,
  IconFilter,
  IconPaperclip,
  IconPlaneDeparture,
  IconPlus,
  IconTrash,
  IconX,
} from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';
import { descargarComoXlsx } from '@/lib/planillas';
import { useAuth } from '@/lib/auth/AuthProvider';
import { StatCard } from '@/components/app/dashboard/StatCard';
import { ListaCard, ListaItem } from '@/components/app/dashboard/ListaCard';
import { Panel } from '@/components/app/Panel';
import { CalendarioAusencias } from '@/components/app/ausencias/CalendarioAusencias';
import { EstadoBadge } from '@/components/app/EstadoBadge';
import { NuevaAusenciaModal } from '@/components/app/ausencias/NuevaAusenciaModal';
import { Boton } from '@/components/app/ui/Boton';
import { aOpciones, Selector } from '@/components/app/ui/Selector';
import {
  Paginacion,
  paginar,
  totalPaginasDe,
} from '@/components/app/ui/Paginacion';
import { anioEmpresa, formatearFecha, hoyISO } from '@/lib/fechas';
import { avisoError, avisoExito } from '@/lib/avisos';
import { abrirArchivo } from '@/lib/archivosUi';
import { useConfirmacion } from '@/components/app/ui/useConfirmacion';
import { tipoAusenciaIconos, tipoAusenciaLabels } from '@/lib/etiquetas';
import {
  eliminarAusencia,
  abrirAdjuntoAusencia,
  crearAusencia,
  getAusencias,
  getFeriados,
  getAusenciasDeEmpleado,
  getEmpleado,
  getEmpleados,
  getSaldoVacaciones,
  getVacacionesAprobadasMiSector,
  resolverAusencia,
} from '@/lib/services/rrhh';
import {
  Ausencia,
  Empleado,
  Feriado,
  SaldoVacaciones,
  TipoAusencia,
  VacacionSector,
} from '@/types/rrhh';
import { RequireModulo } from '@/components/app/RequireModulo';
import { BloqueError } from '@/components/app/EstadoCarga';
import { useCarga } from '@/lib/useCarga';
import { RequireEmpresa } from '@/components/app/RequireEmpresa';

// Año de negocio, no el del dispositivo: es el año sobre el que se
// cuentan saldos y cupos de licencia.
const ANIO_ACTUAL = anioEmpresa();
const POR_PAGINA = 5;

const rangoDe = (a: Ausencia): string =>
  `${formatearFecha(a.fechaDesde)} al ${formatearFecha(a.fechaHasta)} · ${a.dias} días`;

const AusenciasPage = () => {
  const { usuario, rolEfectivo } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const esEmpleado = rolEfectivo === 'empleado';
  const esAdminRRHH = rolEfectivo === 'admin_rrhh';
  const { confirmar, dialogo: dialogoConfirmar } = useConfirmacion();

  const [filtroTipo, setFiltroTipo] = useState<TipoAusencia | ''>('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroEmpleado, setFiltroEmpleado] = useState('');
  const [pagina, setPagina] = useState(1);
  const [modalAbierto, { open, close }] = useDisclosure(false);

  const miEmpleadoId = usuario?.empleadoId;
  const soloMias = esEmpleado && Boolean(miEmpleadoId);

  /**
   * Cada consulta va por separado, no en un `Promise.all`: son de
   * importancia distinta. Si falla la lista de colaboradores —que sólo
   * resuelve nombres y llena el filtro— no tiene sentido dejar la
   * pantalla sin las ausencias, que es a lo que se vino.
   */
  const cargaAusencias = useCarga(
    () => (soloMias ? getAusenciasDeEmpleado(miEmpleadoId!) : getAusencias()),
    [soloMias, miEmpleadoId],
    {
      activo: Boolean(usuario),
      contexto: 'ausencias',
      inicial: [] as Ausencia[],
    }
  );
  const ausencias = cargaAusencias.datos;

  const cargaEmpleados = useCarga(
    async () => {
      if (!soloMias) return getEmpleados();
      const propio = await getEmpleado(miEmpleadoId!);
      return propio ? [propio] : [];
    },
    [soloMias, miEmpleadoId],
    {
      activo: Boolean(usuario),
      contexto: 'ausencias/empleados',
      inicial: [] as Empleado[],
    }
  );
  const empleados = cargaEmpleados.datos;

  const cargaSaldo = useCarga(
    () => getSaldoVacaciones(miEmpleadoId!, ANIO_ACTUAL),
    [miEmpleadoId],
    { activo: Boolean(miEmpleadoId), contexto: 'ausencias/saldo' }
  );
  const saldo: SaldoVacaciones | null = cargaSaldo.datos ?? null;

  const cargaSector = useCarga(
    () => getVacacionesAprobadasMiSector(miEmpleadoId!),
    [miEmpleadoId, soloMias],
    {
      activo: soloMias,
      contexto: 'ausencias/sector',
      inicial: [] as VacacionSector[],
    }
  );
  const vacacionesSector = cargaSector.datos;

  /**
   * Sólo para pintar el calendario: marca los feriados y días no
   * laborables. No entra en ninguna cuenta —de eso se ocupa
   * `getFeriadosParaCalculo` dentro del modal de carga— así que si falla
   * la pantalla sigue andando con el calendario sin esa capa.
   */
  const cargaFeriados = useCarga(() => getFeriados(), [], {
    activo: Boolean(usuario),
    contexto: 'ausencias/feriados',
    inicial: [] as Feriado[],
  });
  const feriados = cargaFeriados.datos;

  const cargar = useCallback(() => {
    cargaAusencias.recargar();
    cargaEmpleados.recargar();
    cargaSaldo.recargar();
    cargaSector.recargar();
  }, [cargaAusencias, cargaEmpleados, cargaSaldo, cargaSector]);

  // Permite llegar filtrado desde otras pantallas: /app/ausencias?empleado=ple-2
  useEffect(() => {
    const desdeUrl = searchParams.get('empleado');
    setFiltroEmpleado(desdeUrl ?? '');
  }, [searchParams]);

  const cambiarFiltroEmpleado = (empleadoId: string) => {
    setFiltroEmpleado(empleadoId);
    const params = new URLSearchParams(searchParams.toString());
    if (empleadoId) {
      params.set('empleado', empleadoId);
    } else {
      params.delete('empleado');
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  };

  const filtradas = useMemo(
    () =>
      ausencias.filter((a) => {
        if (filtroTipo && a.tipo !== filtroTipo) return false;
        if (filtroEstado && a.estado !== filtroEstado) return false;
        if (filtroEmpleado && a.empleadoId !== filtroEmpleado) return false;
        return true;
      }),
    [ausencias, filtroTipo, filtroEstado, filtroEmpleado]
  );

  useEffect(() => {
    setPagina(1);
  }, [filtroTipo, filtroEstado, filtroEmpleado]);

  const hayFiltros = Boolean(filtroTipo || filtroEstado || filtroEmpleado);
  const limpiarFiltros = () => {
    setFiltroTipo('');
    setFiltroEstado('');
    cambiarFiltroEmpleado('');
  };

  if (!usuario) return null;

  const nombreEmpleado = (id: string): string => {
    const e = empleados.find((x) => x.id === id);
    if (e) return `${e.nombre} ${e.apellido}`;
    const vacacion = vacacionesSector.find((v) => v.empleadoId === id);
    return vacacion
      ? `${vacacion.empleadoNombre} ${vacacion.empleadoApellido}`.trim()
      : 'Compañero';
  };
  const empleadoActual = usuario.empleadoId
    ? empleados.find((e) => e.id === usuario.empleadoId)
    : undefined;

  const crear = async (datos: {
    empleadoId?: string;
    tipo: TipoAusencia;
    fechaDesde: string;
    fechaHasta: string;
    comentario?: string;
    archivo?: File;
    aprobarAutomaticamente?: boolean;
  }) => {
    const empleadoId = datos.empleadoId ?? usuario.empleadoId;
    if (!empleadoId) return;
    try {
      await crearAusencia({
        empleadoId,
        tipo: datos.tipo,
        fechaDesde: datos.fechaDesde,
        fechaHasta: datos.fechaHasta,
        comentario: datos.comentario,
        archivo: datos.archivo,
        aprobarAutomaticamente: datos.aprobarAutomaticamente,
      });
      avisoExito(
        datos.aprobarAutomaticamente ? 'Ausencia cargada' : 'Solicitud enviada',
        datos.aprobarAutomaticamente
          ? 'Quedó registrada y aprobada.'
          : 'Te avisamos cuando la resuelvan.'
      );
      close();
      cargar();
    } catch (err) {
      avisoError(
        'No pudimos guardar',
        err instanceof Error ? err.message : undefined
      );
      throw err;
    }
  };

  const exportarExcel = async () => {
    const filas = filtradas.map((a) => ({
      Empleado: nombreEmpleado(a.empleadoId),
      Tipo: tipoAusenciaLabels[a.tipo],
      Desde: a.fechaDesde,
      Hasta: a.fechaHasta,
      Días: a.dias,
      Estado: a.estado,
      Comentario: a.comentarioEmpleado ?? '',
    }));
    await descargarComoXlsx(filas, 'Ausencias', `ausencias-${hoyISO()}.xlsx`);
  };

  /**
   * Sólo para lo que se cargó por error. Rechazar es lo correcto cuando
   * la solicitud existió de verdad: deja el registro y su motivo.
   */
  const borrarAusencia = async (a: Ausencia) => {
    const ok = await confirmar({
      titulo: 'Eliminar ausencia',
      detalle: (
        <>
          Vas a eliminar {tipoAusenciaLabels[a.tipo].toLowerCase()} de{' '}
          {nombreEmpleado(a.empleadoId)} ({rangoDe(a)}). Se borra del calendario
          y deja de descontar días. No se puede deshacer.
          <br />
          <br />
          Si la solicitud existió y no corresponde, mejor rechazala: así queda
          el registro con el motivo.
        </>
      ),
      confirmar: 'Eliminar',
      peligrosa: true,
    });
    if (!ok) return;
    try {
      await eliminarAusencia(a.id);
      avisoExito('Ausencia eliminada');
      cargar();
    } catch (err) {
      avisoError(
        'No pudimos eliminarla',
        err instanceof Error ? err.message : undefined
      );
    }
  };

  const verAdjunto = (a: Ausencia) =>
    abrirArchivo(() => abrirAdjuntoAusencia(a), {
      titulo: 'No pudimos abrir el certificado',
      vacio: 'El archivo ya no está guardado.',
    });

  /**
   * ¿Es mi propia ausencia?
   *
   * Un supervisor con legajo puede pedir vacaciones como cualquiera, y
   * las suyas aparecen en la misma lista que las del equipo. Sin esto,
   * los botones de aprobar salían al lado de su propio pedido.
   */
  const esPropia = (a: { empleadoId: string }): boolean =>
    Boolean(miEmpleadoId) && a.empleadoId === miEmpleadoId;

  const resolver = async (id: string, estado: 'aprobada' | 'rechazada') => {
    try {
      await resolverAusencia(id, estado, usuario.empleadoId ?? usuario.id);
      avisoExito(
        estado === 'aprobada' ? 'Solicitud aprobada' : 'Solicitud rechazada'
      );
    } catch (err) {
      avisoError(
        'No pudimos resolver la solicitud',
        err instanceof Error ? err.message : undefined
      );
    }
    cargar();
  };

  /**
   * Los botones que van dentro del detalle del calendario.
   *
   * Se arman acá y no en el calendario a propósito: quién puede resolver
   * qué ya está decidido en esta pantalla (y de verdad, en el trigger de
   * la migración 103). El calendario sólo los dibuja.
   */
  const accionesDetalle = (a: Ausencia, cerrar: () => void) => (
    <>
      {a.adjuntos.length > 0 && (
        <Boton
          variante="secundario"
          tamano="sm"
          onClick={() => void verAdjunto(a)}
        >
          <IconPaperclip size={14} />
          Certificado
        </Boton>
      )}
      {a.estado === 'pendiente' &&
        (esPropia(a) ? (
          <span className="rounded-full border border-line bg-paper px-3 py-1.5 text-xs font-semibold text-ink-soft">
            La tiene que resolver otra persona
          </span>
        ) : (
          <>
            <Boton
              variante="aprobar"
              tamano="sm"
              onClick={() => {
                cerrar();
                void resolver(a.id, 'aprobada');
              }}
            >
              <IconCheck size={14} />
              Aprobar
            </Boton>
            <Boton
              variante="rechazar"
              tamano="sm"
              onClick={() => {
                cerrar();
                void resolver(a.id, 'rechazada');
              }}
            >
              <IconX size={14} />
              Rechazar
            </Boton>
          </>
        ))}
    </>
  );

  const pendientes = filtradas.filter((a) => a.estado === 'pendiente');
  const resueltas = filtradas.filter((a) => a.estado !== 'pendiente');
  const totalPaginas = totalPaginasDe(resueltas.length, POR_PAGINA);
  const resueltasVisibles = paginar(resueltas, pagina, POR_PAGINA);

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[1.75rem]">
            Ausencias
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-soft">
            {esEmpleado
              ? 'Tus vacaciones, licencias y solicitudes.'
              : 'Solicitudes del equipo: cargá ausencias, aprobá o exportá el historial.'}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {!esEmpleado && (
            <Boton variante="secundario" onClick={() => void exportarExcel()}>
              <IconDownload size={18} />
              Exportar Excel
            </Boton>
          )}
          <Boton variante="negro" onClick={open}>
            <IconPlus size={18} />
            {esEmpleado ? 'Nueva solicitud' : 'Cargar ausencia'}
          </Boton>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="flex items-center gap-1.5 text-[0.8125rem] font-bold text-ink">
            <IconFilter size={16} className="text-ink-soft" />
            Filtros
          </span>
          {/* Que se vea que filtran TODO lo de abajo, calendario incluido:
              antes eran tres combos sueltos arriba de un panel y se leían
              como filtros de la lista nada más. */}
          <span className="text-xs text-ink-soft">
            Se aplican al calendario y a las listas.
          </span>
        </div>
        <div className="flex flex-wrap gap-3">
          <Selector
            valor={filtroTipo}
            onCambiar={(v) => setFiltroTipo(v as TipoAusencia | '')}
            opciones={[
              { valor: '', etiqueta: 'Todos los tipos' },
              ...aOpciones(tipoAusenciaLabels),
            ]}
          />
          <Selector
            valor={filtroEstado}
            onCambiar={setFiltroEstado}
            opciones={[
              { valor: '', etiqueta: 'Todos los estados' },
              { valor: 'pendiente', etiqueta: 'Pendientes' },
              { valor: 'aprobada', etiqueta: 'Aprobadas' },
              { valor: 'rechazada', etiqueta: 'Rechazadas' },
            ]}
          />
          {!esEmpleado && empleados.length > 0 && (
            <Selector
              valor={filtroEmpleado}
              onCambiar={cambiarFiltroEmpleado}
              opciones={[
                { valor: '', etiqueta: 'Todos los colaboradores' },
                ...empleados.map((e) => ({
                  valor: e.id,
                  etiqueta: `${e.nombre} ${e.apellido}`,
                })),
              ]}
            />
          )}
        </div>

        {hayFiltros && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-paper px-4 py-2.5 text-sm text-ink-soft">
            <span>
              Mostrando {filtradas.length} de {ausencias.length} solicitudes.
              {filtroEmpleado
                ? ` Colaborador: ${nombreEmpleado(filtroEmpleado)}.`
                : ''}
            </span>
            <Boton
              type="button"
              variante="sutil"
              tamano="sm"
              onClick={limpiarFiltros}
            >
              Limpiar filtros
            </Boton>
          </div>
        )}
      </div>

      {!esEmpleado && (
        <Panel>
          <h2 className="text-[1.0625rem] font-bold tracking-tight text-ink">
            Calendario de ausencias
          </h2>
          <p className="mb-4 mt-1 text-sm text-ink-soft">
            Quién está ausente y por cuánto tiempo. Tocá una barra para ver el
            detalle, o un día para ver a todos los ausentes de esa fecha.
            {hayFiltros ? ' Está filtrado con los filtros de arriba.' : ''}
          </p>
          <CalendarioAusencias
            ausencias={filtradas}
            nombreEmpleado={nombreEmpleado}
            feriados={feriados}
            acciones={accionesDetalle}
          />
        </Panel>
      )}

      {esEmpleado && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <StatCard
            etiqueta="Disponibles"
            valor={saldo ? `${saldo.diasDisponibles}` : '…'}
            detalle={`de ${saldo?.diasCorresponden ?? '—'} días de vacaciones`}
            icono={IconBeach}
          />
          <StatCard
            etiqueta="Utilizados"
            valor={saldo?.diasUtilizados ?? '…'}
            detalle="este año"
            icono={IconPlaneDeparture}
          />
          <StatCard
            etiqueta="En trámite"
            valor={saldo?.diasPendientesAprobacion ?? '…'}
            detalle="esperando aprobación"
            icono={IconCheck}
          />
        </div>
      )}

      {esEmpleado && empleadoActual?.sector && (
        <Panel>
          <h2 className="text-[1.0625rem] font-bold tracking-tight text-ink">
            Vacaciones aprobadas de tu sector
          </h2>
          <p className="mb-4 mt-1 text-sm text-ink-soft">
            Sector {empleadoActual.sector}. Usalo como referencia antes de pedir
            tus vacaciones para no superponer fechas.
          </p>
          <CalendarioAusencias
            ausencias={vacacionesSector}
            nombreEmpleado={nombreEmpleado}
            soloAprobadas
            feriados={feriados}
            vacio="Nadie de tu sector tiene vacaciones aprobadas en este período."
          />
        </Panel>
      )}

      {/* El error va arriba de las dos listas: si la consulta falló,
          "no hay solicitudes pendientes" es mentira y hace que alguien
          dé por aprobado lo que en realidad no se pudo leer. */}
      {cargaAusencias.fase === 'error' && cargaAusencias.error && (
        <BloqueError
          error={cargaAusencias.error}
          onReintentar={cargaAusencias.recargar}
        />
      )}

      <ListaCard
        titulo={
          esEmpleado ? 'Solicitudes en curso' : 'Pendientes de aprobación'
        }
        cargando={cargaAusencias.fase === 'cargando'}
        vacio={
          esEmpleado
            ? 'No tenés solicitudes en curso.'
            : 'No hay solicitudes pendientes. Todo al día.'
        }
      >
        {pendientes.length > 0 &&
          pendientes.map((a) => (
            <ListaItem
              key={a.id}
              href={esEmpleado ? undefined : `/colaboradores/${a.empleadoId}`}
              icono={tipoAusenciaIconos[a.tipo]}
              principal={
                esEmpleado
                  ? tipoAusenciaLabels[a.tipo]
                  : `${nombreEmpleado(a.empleadoId)} — ${tipoAusenciaLabels[a.tipo]}`
              }
              secundario={`${rangoDe(a)}${a.comentarioEmpleado ? ` · "${a.comentarioEmpleado}"` : ''}`}
              extremo={
                esEmpleado ? (
                  <div className="flex shrink-0 items-center gap-2">
                    {a.adjuntos.length > 0 && (
                      <Boton
                        variante="secundario"
                        tamano="sm"
                        onClick={() => void verAdjunto(a)}
                      >
                        <IconPaperclip size={14} />
                        Certificado
                      </Boton>
                    )}
                    <EstadoBadge estado={a.estado} />
                  </div>
                ) : (
                  <div className="flex shrink-0 items-center gap-2">
                    {a.adjuntos.length > 0 && (
                      <Boton
                        variante="secundario"
                        tamano="sm"
                        onClick={() => void verAdjunto(a)}
                      >
                        <IconPaperclip size={14} />
                        Certificado
                      </Boton>
                    )}
                    {/* La propia no se resuelve: tiene que aprobarla otra
                        persona. Esconder los botones es la cortesía; el
                        freno de verdad está en el trigger de la base
                        (migración 103), porque un PATCH a mano se saltea
                        cualquier botón. */}
                    {esPropia(a) ? (
                      <span className="rounded-full border border-line bg-paper px-3 py-1.5 text-xs font-semibold text-ink-soft">
                        La tiene que resolver otra persona
                      </span>
                    ) : (
                      <>
                        <Boton
                          variante="aprobar"
                          tamano="sm"
                          onClick={() => void resolver(a.id, 'aprobada')}
                        >
                          <IconCheck size={14} />
                          Aprobar
                        </Boton>
                        <Boton
                          variante="rechazar"
                          tamano="sm"
                          onClick={() => void resolver(a.id, 'rechazada')}
                        >
                          <IconX size={14} />
                          Rechazar
                        </Boton>
                      </>
                    )}
                  </div>
                )
              }
            />
          ))}
      </ListaCard>

      <ListaCard
        titulo="Historial"
        cargando={cargaAusencias.fase === 'cargando'}
        tieneItems={resueltasVisibles.length > 0}
        vacio="Sin movimientos anteriores."
      >
        {resueltasVisibles.length > 0 &&
          resueltasVisibles.map((a) => (
            <ListaItem
              key={a.id}
              href={esEmpleado ? undefined : `/colaboradores/${a.empleadoId}`}
              icono={tipoAusenciaIconos[a.tipo]}
              principal={
                esEmpleado
                  ? tipoAusenciaLabels[a.tipo]
                  : `${nombreEmpleado(a.empleadoId)} — ${tipoAusenciaLabels[a.tipo]}`
              }
              secundario={`${rangoDe(a)}${a.comentarioResolucion ? ` · "${a.comentarioResolucion}"` : ''}`}
              extremo={
                <div className="flex shrink-0 items-center gap-2">
                  {a.adjuntos.length > 0 && (
                    <Boton
                      variante="secundario"
                      tamano="sm"
                      onClick={() => void verAdjunto(a)}
                    >
                      <IconPaperclip size={14} />
                      Certificado
                    </Boton>
                  )}
                  <EstadoBadge estado={a.estado} />
                  {esAdminRRHH && (
                    <button
                      type="button"
                      onClick={() => void borrarAusencia(a)}
                      aria-label="Eliminar ausencia"
                      title="Eliminar: usá esto sólo si se cargó por error"
                      className="presionable inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-transparent text-ink-soft hover:border-red-200 hover:bg-red-50 hover:text-red-600 sm:h-10 sm:w-10"
                    >
                      <IconTrash size={17} />
                    </button>
                  )}
                </div>
              }
            />
          ))}
        <Paginacion
          pagina={pagina}
          totalPaginas={totalPaginas}
          onCambiar={setPagina}
        />
      </ListaCard>

      <NuevaAusenciaModal
        abierto={modalAbierto}
        onCerrar={close}
        onCrear={crear}
        vacacionesSector={vacacionesSector}
        nombreEmpleado={nombreEmpleado}
        modoAdmin={!esEmpleado}
        empleados={empleados}
        empleadoIdActual={usuario.empleadoId ?? undefined}
      />

      {dialogoConfirmar}
    </div>
  );
};

/** La empresa puede tener esta sección apagada: se bloquea la ruta,
 * no sólo el link del menú. */
const AusenciasPageProtegida = () => (
  <RequireEmpresa>
    <RequireModulo modulo="ausencias">
      <AusenciasPage />
    </RequireModulo>
  </RequireEmpresa>
);

export default AusenciasPageProtegida;
