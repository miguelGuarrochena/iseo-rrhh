'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  IconAlertTriangle,
  IconArchive,
  IconArrowNarrowRight,
  IconCircleCheck,
  IconClock,
  IconDownload,
  IconLock,
  IconLockOpen,
} from '@tabler/icons-react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { Panel } from '@/components/app/Panel';
import { Boton } from '@/components/app/ui/Boton';
import { CampoMes } from '@/components/app/ui/CampoMes';
import { CampoTextarea } from '@/components/app/ui/Campo';
import { BloqueError } from '@/components/app/EstadoCarga';
import { RequireEmpresa } from '@/components/app/RequireEmpresa';
import { CategoriaCard } from '@/components/app/cierre/CategoriaCard';
import { useConfirmacion } from '@/components/app/ui/useConfirmacion';
import { useCarga } from '@/lib/useCarga';
import { useModulos } from '@/lib/auth/useModulos';
import { avisoError, avisoExito } from '@/lib/avisos';
import { descargarCSV } from '@/lib/csv';
import { formatearInstante, formatearPeriodo, mesEmpresa } from '@/lib/fechas';
import { armarNovedades, filasDeExportacion } from '@/lib/novedades';
import { Usuario } from '@/types/rrhh';
import {
  cerrarPeriodo,
  getCierrePeriodo,
  getDatosNovedades,
  getEmpresa,
  getUsuariosDeEmpresa,
  marcarCategoriaRevisada,
  reabrirPeriodo,
} from '@/lib/services/rrhh';

/**
 * Cierre de novedades del mes.
 *
 * La idea es que RRHH entre a fin de mes y encuentre en un solo lugar
 * todo lo que puede afectar la liquidación: qué pasó, qué falta revisar
 * y, cuando está todo mirado, el acto de cerrar.
 *
 * No liquida nada. No calcula sueldos. Junta lo que ya está cargado y lo
 * ordena por categoría para poder mandárselo al contador.
 *
 * Cerrar y reabrir los resuelve la base (RPC de la migración 99), que es
 * la que valida rol y tenant y deja el rastro en la auditoría. Acá se
 * pide y se muestra el resultado.
 *
 * La pantalla está armada para contestar dos preguntas en ese orden:
 * "¿está todo listo para cerrar este mes?" y, recién cuando se aprieta,
 * "¿qué pasa si lo cierro?". De ahí el encabezado con el estado y la
 * confirmación con las consecuencias reales — que son sólo dos, y son
 * las que aplica la base.
 */

/** Los tres estados que puede tener el período en pantalla. */
type EstadoVisual = 'cerrado' | 'futuro' | 'listo' | 'revisar' | 'desconocido';

const CARTEL: Record<
  EstadoVisual,
  { texto: string; clases: string; icono: typeof IconLock }
> = {
  cerrado: {
    texto: 'Período cerrado',
    clases: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    icono: IconLock,
  },
  listo: {
    texto: 'Listo para cerrar',
    clases: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    icono: IconCircleCheck,
  },
  revisar: {
    texto: 'Hay cosas para revisar',
    clases: 'border-amber-200 bg-amber-50 text-amber-900',
    icono: IconAlertTriangle,
  },
  futuro: {
    texto: 'El mes todavía no terminó',
    clases: 'border-line bg-paper text-ink',
    icono: IconClock,
  },
  desconocido: {
    texto: 'No pudimos leer el estado',
    clases: 'border-line bg-paper text-ink',
    icono: IconAlertTriangle,
  },
};

const CierrePage = () => {
  const { rolEfectivo } = useAuth();
  const esAdmin = rolEfectivo === 'admin_rrhh';
  const modulos = useModulos();
  const { confirmar, dialogo: dialogoConfirmar } = useConfirmacion();

  const [periodo, setPeriodo] = useState(() => mesEmpresa());
  const [notas, setNotas] = useState('');
  const [motivo, setMotivo] = useState('');
  const [reabriendo, setReabriendo] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const cEmpresa = useCarga(() => getEmpresa(), [], {
    activo: esAdmin,
    contexto: 'cierre/empresa',
  });

  const cDatos = useCarga(() => getDatosNovedades(periodo), [periodo], {
    activo: esAdmin,
    contexto: 'cierre/novedades',
  });

  const cCierre = useCarga(() => getCierrePeriodo(periodo), [periodo], {
    activo: esAdmin,
    contexto: 'cierre/estado',
  });

  /**
   * Sólo para poner un nombre donde la fila del cierre guarda un id. Si
   * falla, el cartel muestra la fecha igual: quién cerró es un dato de
   * lectura, no una condición para operar.
   */
  const cUsuarios = useCarga(() => getUsuariosDeEmpresa(), [], {
    activo: esAdmin,
    contexto: 'cierre/usuarios',
    inicial: [] as Usuario[],
  });
  const nombreDeUsuario = (id?: string): string | null =>
    (id && cUsuarios.datos.find((u) => u.id === id)?.nombreCompleto) || null;

  const cierre = cCierre.datos ?? null;
  const cerrado = cierre?.estado === 'cerrado';
  /*
   * Un mes que todavía no terminó no se cierra: no hay novedades que
   * revisar. La base ya lo rechaza (`assert_periodo_valido`), pero
   * ofrecer el botón para que después salte un error es peor que no
   * ofrecerlo y decir por qué.
   */
  const esFuturo = periodo > mesEmpresa();
  /*
   * Si el estado del período no se pudo leer, no se ofrece cerrar. Antes
   * la pantalla asumía "abierto" y mostraba el botón: apretarlo sobre un
   * mes ya cerrado rebota en la base con un error crudo, y sobre uno
   * abierto cierra a ciegas sin haber podido mostrar en qué estaba.
   */
  const estadoDesconocido = cCierre.fase === 'error';
  const revisadas = useMemo(
    () => new Set(cierre?.categoriasRevisadas ?? []),
    [cierre]
  );

  const novedades = useMemo(
    () => (cDatos.datos ? armarNovedades({ ...cDatos.datos, modulos }) : null),
    [cDatos.datos, modulos]
  );

  const pendientesDeRevisar = novedades
    ? novedades.categorias.filter((c) => !revisadas.has(c.clave)).length
    : 0;
  const requierenAtencion = novedades?.requierenAtencion ?? 0;
  const revisadasCuantas = novedades
    ? novedades.categorias.length - pendientesDeRevisar
    : 0;

  /** Categorías con datos incompletos, con su link para resolverlas. */
  const paraRevisar = novedades
    ? novedades.categorias.filter((c) => c.requiereAtencion)
    : [];

  /**
   * Cuánta gente toca este mes. Sale de las novedades que ya están en
   * memoria —no es una consulta nueva ni una estimación— y es lo que
   * dimensiona el período: ocho novedades de una persona y ocho de ocho
   * personas se revisan distinto.
   */
  const colaboradoresAlcanzados = novedades
    ? new Set(
        novedades.categorias.flatMap((c) => c.items.map((i) => i.empleadoId))
      ).size
    : 0;

  /**
   * Un mes sin ninguna novedad no tiene nada que revisar. Sin esto la
   * pantalla pedía tildar nueve categorías vacías y decía "hay cosas
   * para revisar" sobre un período en el que no pasó nada.
   */
  const sinNovedades = novedades?.total === 0;

  const periodoLargo = formatearPeriodo(periodo);
  const estadoVisual: EstadoVisual = cerrado
    ? 'cerrado'
    : estadoDesconocido
      ? 'desconocido'
      : esFuturo
        ? 'futuro'
        : requierenAtencion === 0 && (pendientesDeRevisar === 0 || sinNovedades)
          ? 'listo'
          : 'revisar';
  const cartel = CARTEL[estadoVisual];
  const IconoEstado = cartel.icono;
  /**
   * El ámbar significa una sola cosa: hay datos que faltan. Si lo único
   * pendiente son los tildes de revisión, el cartel va neutro — si no,
   * el encabezado y el bloque de pendientes gritan lo mismo dos veces y
   * el color deja de señalar nada.
   */
  const clasesCartel =
    estadoVisual === 'revisar' && requierenAtencion === 0
      ? 'border-line bg-paper text-ink'
      : cartel.clases;
  const textoEstado =
    sinNovedades && !cerrado && !esFuturo && !estadoDesconocido
      ? 'Sin novedades para revisar'
      : cartel.texto;

  const alternarRevisada = useCallback(
    async (clave: string, valor: boolean) => {
      try {
        const actualizado = await marcarCategoriaRevisada(
          periodo,
          clave,
          valor
        );
        cCierre.actualizar(actualizado);
      } catch (err) {
        avisoError(
          'No pudimos guardar la revisión',
          err instanceof Error ? err.message : undefined
        );
      }
    },
    [periodo, cCierre]
  );

  /**
   * Cerrar es el acto que no se deshace solo, así que primero se dice
   * qué mes es y qué cambia. Las consecuencias son las que aplica la
   * base y ninguna más: el trigger de la migración 99 frena
   * `remuneraciones` y `adelantos` de ese período, el resto sigue igual,
   * y reabrir existe pidiendo motivo.
   */
  const pedirCierre = async () => {
    if (guardando) return;
    const ok = await confirmar({
      titulo: `Cerrar ${periodoLargo.toLowerCase()}`,
      detalle: (
        <>
          <p>
            Vas a cerrar <strong className="text-ink">{periodoLargo}</strong>.
            Desde ese momento:
          </p>
          <ul className="mt-2 flex list-none flex-col gap-1.5">
            <li>
              · Las <strong className="text-ink">remuneraciones</strong> y los{' '}
              <strong className="text-ink">adelantos</strong> de ese mes se
              bloquean: no se pueden cargar, editar ni borrar mientras esté
              cerrado.
            </li>
            <li>
              · El resto sigue funcionando igual: se siguen cargando ausencias,
              fichajes y todo lo demás.
            </li>
            <li>· Queda registrado quién lo cerró y cuándo.</li>
            <li>
              · Se puede reabrir después explicando el motivo. No se borra ni se
              pierde nada.
            </li>
          </ul>
          {(pendientesDeRevisar > 0 || requierenAtencion > 0) && (
            <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-amber-900">
              {requierenAtencion > 0 && (
                <>
                  Hay {requierenAtencion}{' '}
                  {requierenAtencion === 1 ? 'categoría' : 'categorías'} con
                  datos incompletos.{' '}
                </>
              )}
              {pendientesDeRevisar > 0 && (
                <>
                  Quedan {pendientesDeRevisar}{' '}
                  {pendientesDeRevisar === 1
                    ? 'categoría sin revisar'
                    : 'categorías sin revisar'}
                  .{' '}
                </>
              )}
              Podés cerrar igual.
            </p>
          )}
        </>
      ),
      confirmar: `Cerrar ${periodoLargo.toLowerCase()}`,
    });
    if (!ok) return;
    await confirmarCierre();
  };

  const confirmarCierre = async () => {
    setGuardando(true);
    try {
      const actualizado = await cerrarPeriodo(periodo, notas);
      cCierre.actualizar(actualizado);
      setNotas('');
      avisoExito(
        `${periodoLargo} cerrado`,
        'Quedó registrado quién lo cerró y cuándo.'
      );
    } catch (err) {
      avisoError(
        'No pudimos cerrar el período',
        err instanceof Error ? err.message : undefined
      );
    }
    setGuardando(false);
  };

  const confirmarReapertura = async () => {
    if (!motivo.trim()) {
      avisoError('Falta el motivo', 'Decí por qué hace falta reabrirlo.');
      return;
    }
    setGuardando(true);
    try {
      const actualizado = await reabrirPeriodo(periodo, motivo);
      cCierre.actualizar(actualizado);
      setMotivo('');
      setReabriendo(false);
      avisoExito(`${periodoLargo} reabierto`, 'Quedó el motivo asentado.');
    } catch (err) {
      avisoError(
        'No pudimos reabrir el período',
        err instanceof Error ? err.message : undefined
      );
    }
    setGuardando(false);
  };

  const exportar = () => {
    if (!novedades) return;
    descargarCSV(
      `novedades-${periodo}.csv`,
      filasDeExportacion(novedades, cEmpresa.datos?.nombre ?? '')
    );
  };

  if (!esAdmin) {
    return (
      <p className="text-sm text-ink-soft">
        El cierre del mes lo hace quien administra Recursos Humanos en la
        empresa.
      </p>
    );
  }

  return (
    <RequireEmpresa>
      <div className="flex flex-col gap-6 sm:gap-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[1.75rem]">
            Cierre del mes
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-soft">
            Revisá las novedades del período antes de mandárselas al contador.
            No es una liquidación: acá no se calcula ningún sueldo, se junta lo
            que ya está cargado.
          </p>
        </div>

        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
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
              disabled={!novedades || novedades.total === 0}
            >
              <IconDownload size={16} />
              Exportar para el contador
            </Boton>
          </div>
        </div>

        {/* El estado del período se lee aunque las novedades fallen: son
            dos consultas distintas y "¿está cerrado?" es la pregunta que
            no puede quedar sin respuesta. */}
        {estadoDesconocido && cCierre.error && (
          <BloqueError error={cCierre.error} onReintentar={cCierre.recargar} />
        )}

        {cDatos.fase === 'error' && cDatos.error ? (
          <BloqueError error={cDatos.error} onReintentar={cDatos.recargar} />
        ) : cDatos.fase === 'cargando' || !novedades ? (
          <Panel>
            <p className="text-sm text-ink-soft">
              Juntando las novedades de {periodoLargo.toLowerCase()}…
            </p>
          </Panel>
        ) : (
          <>
            {/* Lo primero: qué mes es y en qué estado está. */}
            <section
              className={`aparece rounded-3xl border p-5 sm:p-6 ${clasesCartel}`}
            >
              <div className="flex flex-wrap items-start gap-3.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface/70">
                  <IconoEstado size={20} stroke={2} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-bold tracking-tight sm:text-xl">
                    {periodoLargo}
                  </p>
                  <p className="mt-0.5 text-sm font-semibold">{textoEstado}</p>

                  {cerrado ? (
                    <div className="mt-2 max-w-2xl text-sm leading-relaxed">
                      <p>
                        {cierre?.cerradoEn
                          ? `Cerrado el ${formatearInstante(cierre.cerradoEn)}`
                          : 'Cerrado'}
                        {nombreDeUsuario(cierre?.cerradoPor)
                          ? ` por ${nombreDeUsuario(cierre?.cerradoPor)}.`
                          : ''}
                      </p>
                      <p className="mt-1">
                        Mientras esté cerrado no se pueden cargar ni modificar
                        remuneraciones ni adelantos de este mes. Todo lo demás
                        sigue igual y se puede seguir mirando.
                      </p>
                      {cierre?.notas && (
                        <p className="mt-2 rounded-xl bg-surface px-3.5 py-2.5 text-ink-soft">
                          {cierre.notas}
                        </p>
                      )}
                      {cierre?.reabiertoEn && (
                        <p className="mt-2 text-[0.8125rem] text-ink-soft">
                          Se había reabierto el{' '}
                          {formatearInstante(cierre.reabiertoEn)}
                          {nombreDeUsuario(cierre.reabiertoPor)
                            ? ` por ${nombreDeUsuario(cierre.reabiertoPor)}`
                            : ''}
                          {cierre.motivoReapertura
                            ? `: “${cierre.motivoReapertura}”`
                            : '.'}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="mt-2 max-w-2xl text-sm leading-relaxed">
                      {estadoDesconocido
                        ? 'No pudimos leer si este mes está abierto o cerrado, así que no se ofrece cerrarlo. Reintentá arriba.'
                        : esFuturo
                          ? 'Todavía no terminó, así que no hay nada que cerrar. Podés mirar lo que ya está cargado.'
                          : sinNovedades
                            ? 'No hay ninguna novedad cargada en este período. Podés cerrarlo igual.'
                            : estadoVisual === 'listo'
                              ? 'Revisaste todas las categorías y no quedan datos incompletos.'
                              : 'Mirá lo que quedó pendiente abajo. Nada de esto impide cerrar el período.'}
                    </p>
                  )}

                  {/* El avance de la revisión, que es el trabajo real. */}
                  {novedades.categorias.length > 0 && !sinNovedades && (
                    <div className="mt-4 max-w-md">
                      <div className="flex flex-wrap items-baseline justify-between gap-2 text-[0.8125rem] font-semibold">
                        <span>
                          {revisadasCuantas} de {novedades.categorias.length}{' '}
                          categorías revisadas
                        </span>
                        <span className="text-ink-soft">
                          {novedades.total}{' '}
                          {novedades.total === 1 ? 'novedad' : 'novedades'} ·{' '}
                          {colaboradoresAlcanzados}{' '}
                          {colaboradoresAlcanzados === 1
                            ? 'colaborador'
                            : 'colaboradores'}
                        </span>
                      </div>
                      <div
                        className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={novedades.categorias.length}
                        aria-valuenow={revisadasCuantas}
                        aria-label="Categorías revisadas"
                      >
                        <div
                          className={`h-full rounded-full ${
                            pendientesDeRevisar === 0
                              ? 'bg-emerald-500'
                              : 'bg-brand-500'
                          }`}
                          style={{
                            width: `${Math.round(
                              (revisadasCuantas / novedades.categorias.length) *
                                100
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {cerrado && (
                  <Boton
                    variante="secundario"
                    onClick={() => setReabriendo((v) => !v)}
                  >
                    <IconLockOpen size={16} />
                    Reabrir
                  </Boton>
                )}
              </div>
            </section>

            {cerrado && reabriendo && (
              <Panel
                titulo="Reabrir el período"
                descripcion="Reabrir un mes que ya se informó es una excepción. El motivo queda asentado en la auditoría junto con tu nombre."
              >
                <div className="flex flex-col gap-3">
                  <CampoTextarea
                    etiqueta="Por qué hace falta reabrirlo"
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    placeholder="Ej: el estudio devolvió el sueldo de Pérez con un error en las extras."
                  />
                  <div className="flex flex-wrap gap-2">
                    <Boton
                      onClick={() => void confirmarReapertura()}
                      disabled={guardando || !motivo.trim()}
                    >
                      {guardando ? 'Reabriendo…' : 'Confirmar reapertura'}
                    </Boton>
                    <Boton
                      variante="secundario"
                      onClick={() => {
                        setReabriendo(false);
                        setMotivo('');
                      }}
                    >
                      Cancelar
                    </Boton>
                  </div>
                </div>
              </Panel>
            )}

            {/* Lo que conviene resolver, con el link a donde se resuelve.
                Separado del cierre a propósito: ninguna de estas cosas lo
                bloquea, y decir lo contrario sería inventar una regla. */}
            {!cerrado && paraRevisar.length > 0 && (
              <section className="aparece rounded-3xl border border-amber-200 bg-amber-50 p-5 sm:p-6">
                <div className="flex items-start gap-3">
                  <IconAlertTriangle
                    size={19}
                    className="mt-0.5 shrink-0 text-amber-700"
                  />
                  <div className="min-w-0 flex-1">
                    <h2 className="text-[1.0625rem] font-bold tracking-tight text-ink">
                      Conviene revisar antes de cerrar
                    </h2>
                    <p className="mt-1 max-w-2xl text-sm leading-relaxed text-amber-900">
                      Son datos que faltan y que no le van a llegar al contador.
                      No impiden cerrar el período.
                    </p>
                    <ul className="mt-3 flex list-none flex-col gap-2">
                      {paraRevisar.map((c) => (
                        <li key={c.clave}>
                          <Link
                            href={c.ruta}
                            className="hover-bloque flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-amber-200 bg-surface px-3.5 py-2.5 text-sm no-underline"
                          >
                            <span className="font-bold text-ink">
                              {c.etiqueta}
                            </span>
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">
                              {c.items.length}
                            </span>
                            <span className="ml-auto inline-flex items-center gap-1 font-bold text-brand-700">
                              Resolver
                              <IconArrowNarrowRight size={16} />
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </section>
            )}

            <Panel
              titulo={`Novedades de ${periodoLargo.toLowerCase()}`}
              descripcion="Sólo aparecen las categorías de las secciones que tu empresa usa. Tildá cada una a medida que la revisás."
            >
              <div className="flex flex-col gap-3">
                {novedades.categorias.map((c) => (
                  <CategoriaCard
                    key={c.clave}
                    categoria={c}
                    revisada={revisadas.has(c.clave)}
                    bloqueada={cerrado}
                    onRevisar={(valor) => void alternarRevisada(c.clave, valor)}
                  />
                ))}
              </div>
            </Panel>

            {!cerrado && !esFuturo && !estadoDesconocido && (
              <Panel
                titulo={`Cerrar ${periodoLargo.toLowerCase()}`}
                descripcion="Al cerrar quedan bloqueadas las remuneraciones y los adelantos de este mes, para que nadie los cambie sin querer. Antes de confirmar te vamos a mostrar exactamente qué cambia."
              >
                <div className="flex flex-col gap-3">
                  <CampoTextarea
                    etiqueta="Notas del cierre (opcional)"
                    value={notas}
                    onChange={(e) => setNotas(e.target.value)}
                    placeholder="Ej: extras de septiembre aprobadas por Marcelo. Adelanto de Gómez va contra octubre."
                  />
                  <div>
                    <Boton
                      variante="negro"
                      onClick={() => void pedirCierre()}
                      disabled={guardando}
                    >
                      <IconArchive size={16} />
                      {guardando
                        ? 'Cerrando…'
                        : `Cerrar ${periodoLargo.toLowerCase()}`}
                    </Boton>
                  </div>
                  <p className="text-xs leading-relaxed text-ink-soft">
                    Se puede reabrir después explicando el motivo. No se borra
                    ni se pierde nada.
                  </p>
                </div>
              </Panel>
            )}
          </>
        )}

        {dialogoConfirmar}
      </div>
    </RequireEmpresa>
  );
};

export default CierrePage;
