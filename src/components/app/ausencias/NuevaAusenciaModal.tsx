'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Modal } from '@mantine/core';
import { Boton } from '@/components/app/ui/Boton';
import { CampoSelect, CampoTextarea } from '@/components/app/ui/Campo';
import { CampoArchivo } from '@/components/app/ui/CampoArchivo';
import { CampoFecha } from '@/components/app/ui/CampoFecha';
import { aOpciones } from '@/components/app/ui/Selector';
import {
  diasAusencia,
  diasCorridosEnAnio,
  formatearFecha,
  hoyISO,
} from '@/lib/fechas';
import { TIPOS_AUSENCIA_JORNADA, tipoAusenciaLabels } from '@/lib/etiquetas';
import { juntarErrores, validarRequerido } from '@/lib/validaciones';
import {
  getAusenciasDeEmpleado,
  getEmpresa,
  getFeriadosParaCalculo,
  getSaldoVacaciones,
  getSaldosLicencia,
} from '@/lib/services/rrhh';
import {
  diasVacacionesDeRangoEnAnio,
  unidadVacacionesDe,
  UNIDAD_VACACIONES_LABELS,
} from '@/lib/vacaciones';
import {
  Ausencia,
  Empleado,
  SaldoLicencia,
  SaldoVacaciones,
  TIPOS_LICENCIA_CON_CUPO,
  TipoAusencia,
} from '@/types/rrhh';

interface NuevaAusenciaModalProps {
  abierto: boolean;
  onCerrar: () => void;
  onCrear: (datos: {
    empleadoId?: string;
    tipo: TipoAusencia;
    fechaDesde: string;
    fechaHasta: string;
    comentario?: string;
    archivo?: File;
    aprobarAutomaticamente?: boolean;
  }) => Promise<void>;
  vacacionesSector?: Ausencia[];
  nombreEmpleado?: (empleadoId: string) => string;
  /** Carga desde Admin/RRHH: elige colaborador y queda aprobada. */
  modoAdmin?: boolean;
  empleados?: Empleado[];
  /** Quién pide, cuando no es carga de admin: para controlar su saldo. */
  empleadoIdActual?: string;
}

export const NuevaAusenciaModal = ({
  abierto,
  onCerrar,
  onCrear,
  vacacionesSector = [],
  nombreEmpleado,
  modoAdmin = false,
  empleados = [],
  empleadoIdActual,
}: NuevaAusenciaModalProps) => {
  const [empleadoId, setEmpleadoId] = useState('');
  const [tipo, setTipo] = useState<TipoAusencia>('vacaciones');
  const [fechaDesde, setFechaDesde] = useState(hoyISO());
  const [fechaHasta, setFechaHasta] = useState(hoyISO());
  const [comentario, setComentario] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  /** Misma semántica que `crearAusencia` / trigger SQL: fuente `diasAusencia`. */
  const [vacacionesDiasHabiles, setVacacionesDiasHabiles] = useState(false);
  const [feriadosNoLaborables, setFeriadosNoLaborables] = useState<Set<string>>(
    () => new Set()
  );

  useEffect(() => {
    if (abierto) {
      setEmpleadoId('');
      setTipo('vacaciones');
      setFechaDesde(hoyISO());
      setFechaHasta(hoyISO());
      setComentario('');
      setArchivo(null);
      setError(null);
      setErrores({});
    }
  }, [abierto]);

  /**
   * Si los feriados no se pudieron sincronizar, esta pantalla no puede
   * contar días hábiles con el mismo criterio que la base. Antes seguía
   * en silencio con los feriados que armaba en memoria y mostraba un
   * total distinto del que se guardaba.
   */
  const [feriadosRotos, setFeriadosRotos] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    let vigente = true;
    void (async () => {
      // El régimen y los feriados fallan por separado a propósito. Si el
      // fallo de los feriados apagara el régimen de hábiles, la pantalla
      // se pondría a contar corridos sin decir nada: sería el mismo
      // desacuerdo con la base, disfrazado de otra cosa.
      let habiles = false;
      try {
        const empresa = await getEmpresa();
        habiles = Boolean(empresa.config.vacacionesDiasHabiles);
      } catch {
        if (!vigente) return;
        setVacacionesDiasHabiles(false);
        setFeriadosNoLaborables(new Set());
        setFeriadosRotos(false);
        return;
      }
      if (!vigente) return;
      setVacacionesDiasHabiles(habiles);

      if (!habiles) {
        // En días corridos los feriados no entran en la cuenta.
        setFeriadosNoLaborables(new Set());
        setFeriadosRotos(false);
        return;
      }
      try {
        const feriados = await getFeriadosParaCalculo();
        if (!vigente) return;
        setFeriadosNoLaborables(feriados);
        setFeriadosRotos(false);
      } catch {
        if (!vigente) return;
        setFeriadosNoLaborables(new Set());
        setFeriadosRotos(true);
      }
    })();
    return () => {
      vigente = false;
    };
  }, [abierto]);

  const dias = useMemo(
    () =>
      diasAusencia(
        fechaDesde,
        fechaHasta,
        tipo,
        vacacionesDiasHabiles,
        feriadosNoLaborables
      ),
    [fechaDesde, fechaHasta, tipo, vacacionesDiasHabiles, feriadosNoLaborables]
  );
  const etiquetaUnidad =
    tipo === 'vacaciones'
      ? UNIDAD_VACACIONES_LABELS[unidadVacacionesDe({ vacacionesDiasHabiles })]
      : 'días';
  const superpuestas = useMemo(
    () =>
      tipo === 'vacaciones'
        ? vacacionesSector.filter(
            (a) => fechaDesde <= a.fechaHasta && fechaHasta >= a.fechaDesde
          )
        : [],
    [fechaDesde, fechaHasta, tipo, vacacionesSector]
  );

  /**
   * Saldo de vacaciones de quien va a usar los días. Sin este control se
   * podían pedir (y aprobar) 30 días teniendo 14: en una empresa con RRHH
   * alguien lo frena, en una sin RRHH no lo frena nadie.
   */
  const idParaSaldo = modoAdmin ? empleadoId : empleadoIdActual;

  /**
   * Los años calendario que toca el pedido.
   *
   * Un rango que cruza el 31/12 consume el cupo de los dos años, y el
   * trigger de la base lo verifica año por año (migración 68). La
   * pantalla comparaba el TOTAL de días contra el saldo del año en que
   * empezaba, así que rechazaba pedidos que la base habría aceptado.
   */
  const aniosDelRango = useMemo(() => {
    const desde = Number(fechaDesde.slice(0, 4));
    const hasta = Number(fechaHasta.slice(0, 4));
    if (!desde || !hasta || hasta < desde) return desde ? [desde] : [];
    const años: number[] = [];
    for (let a = desde; a <= hasta; a += 1) años.push(a);
    return años;
  }, [fechaDesde, fechaHasta]);
  const clesAnios = aniosDelRango.join(',');

  const [saldos, setSaldos] = useState<Record<number, SaldoVacaciones>>({});
  const [saldosLicencia, setSaldosLicencia] = useState<
    Record<number, SaldoLicencia | null>
  >({});
  /** Las ausencias del propio empleado, para detectar solapamientos. */
  const [propias, setPropias] = useState<Ausencia[]>([]);
  const esTipoConCupoLicencia = TIPOS_LICENCIA_CON_CUPO.includes(tipo);

  useEffect(() => {
    if (
      !abierto ||
      tipo !== 'vacaciones' ||
      !idParaSaldo ||
      aniosDelRango.length === 0
    ) {
      setSaldos({});
      return;
    }
    let vigente = true;
    void Promise.all(
      aniosDelRango.map((a) =>
        getSaldoVacaciones(idParaSaldo, a).then((s) => [a, s] as const)
      )
    )
      .then((pares) => {
        if (!vigente) return;
        const mapa: Record<number, SaldoVacaciones> = {};
        pares.forEach(([a, s]) => {
          if (s) mapa[a] = s;
        });
        setSaldos(mapa);
      })
      .catch(() => {
        if (vigente) setSaldos({});
      });
    return () => {
      vigente = false;
    };
    // `clesAnios` estabiliza la lista: sin él, el array nuevo de cada
    // render volvería a disparar el efecto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, tipo, idParaSaldo, clesAnios]);

  useEffect(() => {
    if (
      !abierto ||
      !esTipoConCupoLicencia ||
      !idParaSaldo ||
      aniosDelRango.length === 0
    ) {
      setSaldosLicencia({});
      return;
    }
    let vigente = true;
    void Promise.all(
      aniosDelRango.map((a) =>
        getSaldosLicencia(idParaSaldo, a).then(
          (lista) => [a, lista.find((s) => s.tipo === tipo) ?? null] as const
        )
      )
    )
      .then((pares) => {
        if (!vigente) return;
        const mapa: Record<number, SaldoLicencia | null> = {};
        // Sin fila de cupo → sin límite (no inventamos tope).
        pares.forEach(([a, s]) => {
          mapa[a] = s;
        });
        setSaldosLicencia(mapa);
      })
      .catch(() => {
        if (vigente) setSaldosLicencia({});
      });
    return () => {
      vigente = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, esTipoConCupoLicencia, tipo, idParaSaldo, clesAnios]);

  /**
   * Ausencias ya cargadas de esta persona. Se piden para poder avisar de
   * un solapamiento: hasta ahora sólo se miraban las vacaciones de los
   * compañeros del sector, así que alguien podía quedar con vacaciones y
   * enfermedad aprobadas sobre los mismos días.
   */
  useEffect(() => {
    if (!abierto || !idParaSaldo) {
      setPropias([]);
      return;
    }
    let vigente = true;
    void getAusenciasDeEmpleado(idParaSaldo)
      .then((lista) => {
        if (vigente) setPropias(lista);
      })
      .catch(() => {
        if (vigente) setPropias([]);
      });
    return () => {
      vigente = false;
    };
  }, [abierto, idParaSaldo]);

  /** Días del pedido que caen en cada año, en la unidad que corresponda. */
  const pedidoPorAnio = useMemo(() => {
    const mapa: Record<number, number> = {};
    aniosDelRango.forEach((a) => {
      mapa[a] =
        tipo === 'vacaciones'
          ? diasVacacionesDeRangoEnAnio(fechaDesde, fechaHasta, a, {
              habiles: vacacionesDiasHabiles,
              feriados: feriadosNoLaborables,
            })
          : diasCorridosEnAnio(fechaDesde, fechaHasta, a);
    });
    return mapa;
  }, [
    aniosDelRango,
    fechaDesde,
    fechaHasta,
    tipo,
    vacacionesDiasHabiles,
    feriadosNoLaborables,
  ]);

  /**
   * Los días pendientes de aprobación ya están descontados del
   * disponible: si no, pedir dos veces seguidas pasaría el control las
   * dos veces.
   *
   * Se compara **año por año**, igual que el trigger.
   */
  const aniosExcedidos = aniosDelRango.filter((a) => {
    const s = saldos[a];
    return (
      tipo === 'vacaciones' && s && (pedidoPorAnio[a] ?? 0) > s.diasDisponibles
    );
  });
  const excede = aniosExcedidos.length > 0;

  /**
   * Licencias: solo las aprobadas consumen cupo (getSaldosLicencia).
   * UI frena el pedido/carga si no alcanzaría al aprobar; DB es la autoridad.
   * Sin override de gestor (a diferencia de vacaciones).
   */
  const aniosExcedidosLicencia = aniosDelRango.filter((a) => {
    const s = saldosLicencia[a];
    return s && (pedidoPorAnio[a] ?? 0) > s.diasDisponibles;
  });
  const excedeLicencia = aniosExcedidosLicencia.length > 0;
  /** El del año en que arranca, que es el que se muestra en el cartel. */
  const saldoLicencia = saldosLicencia[aniosDelRango[0]] ?? null;
  const disponibleTrasLicencia =
    saldoLicencia != null
      ? Math.max(
          0,
          saldoLicencia.diasDisponibles - (pedidoPorAnio[aniosDelRango[0]] ?? 0)
        )
      : null;

  /**
   * Ausencias propias que pisan el rango pedido.
   *
   * Se miran las aprobadas y las pendientes: dos solicitudes solapadas
   * consumen saldo dos veces y el ausentismo cuenta días que la persona
   * no faltó. Las de jornada (entrada tarde, home office) no cuentan como
   * solapamiento: conviven con un día trabajado.
   */
  const solapadasPropias = useMemo(
    () =>
      propias.filter(
        (a) =>
          a.estado !== 'rechazada' &&
          !TIPOS_AUSENCIA_JORNADA.includes(a.tipo) &&
          fechaDesde <= a.fechaHasta &&
          fechaHasta >= a.fechaDesde
      ),
    [propias, fechaDesde, fechaHasta]
  );

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    // El faltante se marca en el campo, no sólo en el cartel de abajo:
    // el que más se olvida es el colaborador y estaba fuera de vista.
    const primerAnioExcedido = aniosExcedidos[0];
    const primerAnioLicencia = aniosExcedidosLicencia[0];
    const nuevos = juntarErrores({
      empleado: modoAdmin
        ? validarRequerido(empleadoId, 'El colaborador')
        : null,
      fechaHasta:
        dias < 1
          ? 'No puede ser anterior a la fecha de inicio.'
          : feriadosRotos && tipo === 'vacaciones' && vacacionesDiasHabiles
            ? 'No pudimos leer los feriados, así que el total de días puede no coincidir con el que guarde el sistema. Recargá la pantalla.'
            : !modoAdmin && excede
              ? `En ${primerAnioExcedido} te quedan ${saldos[primerAnioExcedido]?.diasDisponibles} días de vacaciones y estás pidiendo ${pedidoPorAnio[primerAnioExcedido]}.`
              : excedeLicencia
                ? `Cupo de ${tipoAusenciaLabels[tipo].toLowerCase()} en ${primerAnioLicencia}: quedan ${saldosLicencia[primerAnioLicencia]?.diasDisponibles} días y estás pidiendo ${pedidoPorAnio[primerAnioLicencia]}.`
                : // Un solapamiento duplica el consumo de saldo y el
                  // ausentismo. Al colaborador se lo frena; RRHH puede
                  // seguir, igual que con el cupo de vacaciones, pero lo
                  // ve advertido arriba.
                  !modoAdmin && solapadasPropias.length > 0
                  ? 'Ya tenés otra ausencia cargada en esas fechas. Revisá el detalle de arriba.'
                  : null,
    });
    setErrores(nuevos);
    if (Object.keys(nuevos).length > 0) return;
    setError(null);
    setEnviando(true);
    try {
      await onCrear({
        empleadoId: modoAdmin ? empleadoId : undefined,
        tipo,
        fechaDesde,
        fechaHasta,
        comentario: comentario.trim() || undefined,
        archivo: archivo ?? undefined,
        aprobarAutomaticamente: modoAdmin,
      });
      setComentario('');
      setArchivo(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'No pudimos guardar la ausencia.'
      );
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal
      opened={abierto}
      onClose={onCerrar}
      title={modoAdmin ? 'Cargar ausencia' : 'Nueva solicitud de ausencia'}
      radius="lg"
      centered
      styles={{ title: { fontWeight: 800 } }}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
        {modoAdmin && (
          <CampoSelect
            etiqueta="Colaborador *"
            value={empleadoId}
            onChange={setEmpleadoId}
            error={errores.empleado}
            opciones={[
              { valor: '', etiqueta: 'Elegí…' },
              ...empleados.map((e) => ({
                valor: e.id,
                etiqueta: `${e.apellido}, ${e.nombre}`,
              })),
            ]}
          />
        )}

        <CampoSelect
          etiqueta="Tipo"
          value={tipo}
          onChange={(v) => setTipo(v as TipoAusencia)}
          opciones={aOpciones(tipoAusenciaLabels)}
        />

        {TIPOS_AUSENCIA_JORNADA.includes(tipo) && (
          <p className="rounded-xl bg-paper px-4 py-3 text-xs text-ink-soft">
            Entrada tarde y salida anticipada también se detectan solas en{' '}
            <strong className="text-ink">Turnos</strong> según el fichaje. Acá
            podés registrarlas a mano cuando haga falta.
          </p>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <CampoFecha
            etiqueta="Desde"
            value={fechaDesde}
            onChange={setFechaDesde}
          />
          <CampoFecha
            etiqueta="Hasta"
            value={fechaHasta}
            min={fechaDesde || undefined}
            onChange={setFechaHasta}
            error={errores.fechaHasta}
          />
        </div>

        {dias > 0 && (
          <p className="text-sm text-ink-soft">
            Total:{' '}
            <strong className="text-ink">
              {dias} {etiquetaUnidad}
            </strong>
          </p>
        )}

        {tipo === 'vacaciones' && aniosDelRango.some((a) => saldos[a]) && (
          <div
            className={`flex flex-col gap-2 rounded-xl px-4 py-3 text-xs ${
              excede ? 'bg-amber-50 text-amber-900' : 'bg-paper text-ink-soft'
            }`}
          >
            {/* Un rango que cruza el 31/12 consume el cupo de los dos
                años, y cada uno tiene su propio saldo. */}
            {aniosDelRango.map((a) => {
              const s = saldos[a];
              if (!s) return null;
              const pedidos = pedidoPorAnio[a] ?? 0;
              return (
                <p key={a}>
                  {aniosDelRango.length > 1 && (
                    <strong className="font-bold">{a}: </strong>
                  )}
                  Le corresponden{' '}
                  <strong className="font-bold">
                    {s.diasCorresponden} días
                  </strong>{' '}
                  en {s.anio} por antigüedad (art. 150 LCT). Ya usó{' '}
                  {s.diasUtilizados}
                  {s.diasPendientesAprobacion > 0 &&
                    ` y tiene ${s.diasPendientesAprobacion} esperando aprobación`}
                  : quedan{' '}
                  <strong className="font-bold">
                    {s.diasDisponibles} disponibles
                  </strong>
                  {aniosDelRango.length > 1 && ` · pedís ${pedidos}`}.
                </p>
              );
            })}
            {excede && (
              <p className="font-bold">
                {aniosExcedidos
                  .map((a) =>
                    modoAdmin
                      ? `En ${a} estás cargando ${pedidoPorAnio[a]} días, ${(pedidoPorAnio[a] ?? 0) - (saldos[a]?.diasDisponibles ?? 0)} más de los que le quedan.`
                      : `En ${a} estás pidiendo ${pedidoPorAnio[a]} días y quedan ${saldos[a]?.diasDisponibles}.`
                  )
                  .join(' ')}
                {modoAdmin && ' Podés seguir, pero revisá que sea a propósito.'}
              </p>
            )}
          </div>
        )}

        {solapadasPropias.length > 0 && (
          <div className="rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-900">
            <p className="font-bold">
              Ya hay otra ausencia cargada en esas fechas:
            </p>
            <ul className="mt-2 flex flex-col gap-1">
              {solapadasPropias.slice(0, 4).map((a) => (
                <li key={a.id}>
                  {tipoAusenciaLabels[a.tipo]} · {formatearFecha(a.fechaDesde)}{' '}
                  al {formatearFecha(a.fechaHasta)} ({a.estado})
                </li>
              ))}
            </ul>
            {modoAdmin && (
              <p className="mt-2 font-bold">
                Podés seguir, pero los días se van a contar dos veces en el
                saldo y en el ausentismo.
              </p>
            )}
          </div>
        )}

        {saldoLicencia && (
          <div
            className={`rounded-xl px-4 py-3 text-xs ${
              excedeLicencia
                ? 'bg-amber-50 text-amber-900'
                : 'bg-paper text-ink-soft'
            }`}
          >
            <p>
              Cupo anual de {tipoAusenciaLabels[tipo].toLowerCase()} en{' '}
              {aniosDelRango[0]}:{' '}
              <strong className="font-bold">{saldoLicencia.diasAnuales}</strong>
              . Ya usó {saldoLicencia.diasUtilizados} (solo aprobadas). Cupo
              disponible:{' '}
              <strong className="font-bold">
                {saldoLicencia.diasDisponibles}
              </strong>
              . Solicitado: <strong className="font-bold">{dias}</strong>.
              {disponibleTrasLicencia != null && (
                <>
                  {' '}
                  Disponible después:{' '}
                  <strong className="font-bold">
                    {disponibleTrasLicencia}
                  </strong>
                  .
                </>
              )}
            </p>
            {excedeLicencia && (
              <p className="mt-2 font-bold">
                Este pedido supera el cupo configurado.
              </p>
            )}
          </div>
        )}

        {tipo === 'vacaciones' && vacacionesSector.length > 0 && (
          <div
            className={`rounded-xl px-4 py-3 text-xs ${
              superpuestas.length > 0
                ? 'bg-amber-50 text-amber-900'
                : 'bg-emerald-50 text-emerald-800'
            }`}
          >
            {superpuestas.length > 0 ? (
              <>
                <p className="font-bold">
                  Hay vacaciones aprobadas del sector en esas fechas:
                </p>
                <ul className="mt-2 flex flex-col gap-1">
                  {superpuestas.slice(0, 4).map((a) => (
                    <li key={a.id}>
                      {nombreEmpleado?.(a.empleadoId) ?? 'Compañero'} ·{' '}
                      {formatearFecha(a.fechaDesde)} al{' '}
                      {formatearFecha(a.fechaHasta)}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              'No hay vacaciones aprobadas del sector pisando este rango.'
            )}
          </div>
        )}

        <CampoTextarea
          etiqueta="Comentario (opcional)"
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          rows={2}
          placeholder={
            modoAdmin
              ? 'Motivo o detalle interno'
              : 'Motivo o detalle para tu supervisor'
          }
        />

        <CampoArchivo
          key={abierto ? 'abierto' : 'cerrado'}
          etiqueta="Certificado o comprobante (opcional)"
          accept=".pdf,image/*"
          onArchivo={setArchivo}
          ayuda={
            tipo === 'enfermedad'
              ? 'Adjuntá el certificado médico en PDF o foto.'
              : 'PDF o foto que respalde el pedido, si corresponde.'
          }
        />

        {error && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <Boton
          type="submit"
          disabled={enviando}
          className="mt-1 py-3 text-base"
        >
          {enviando
            ? 'Guardando…'
            : modoAdmin
              ? 'Guardar ausencia'
              : 'Enviar solicitud'}
        </Boton>
      </form>
    </Modal>
  );
};
