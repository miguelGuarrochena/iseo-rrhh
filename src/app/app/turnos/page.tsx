'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  IconAlertTriangle,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconClockExclamation,
  IconClockPlus,
  IconUserOff,
} from '@tabler/icons-react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { Panel } from '@/components/app/Panel';
import { StatCard } from '@/components/app/dashboard/StatCard';
import { Boton } from '@/components/app/ui/Boton';
import { CampoHora } from '@/components/app/ui/CampoHora';
import { CampoSelect } from '@/components/app/ui/Campo';
import { avisoError, avisoExito } from '@/lib/avisos';
import {
  aprobarExtrasDeJornada,
  asignarTurno,
  asignarTurnos,
  getAusenciasDeEmpleado,
  getEmpleados,
  getEmpresa,
  getFichajesDeEmpleado,
  getTurnosDeEmpleado,
  quitarTurno,
} from '@/lib/services/rrhh';
import {
  controlarTurno,
  ficho,
  formatearMinutos,
  resumirControlTurnos,
} from '@/lib/turnos';
import { finDeMesEmpresa, hoyISO, sumarDiasEmpresa } from '@/lib/fechas';
import { tipoAusenciaLabels } from '@/lib/etiquetas';
import { Ausencia, Empleado, Fichaje, Turno } from '@/types/rrhh';
import { RequireModulo } from '@/components/app/RequireModulo';
import { RequireEmpresa } from '@/components/app/RequireEmpresa';
import { BloqueError } from '@/components/app/EstadoCarga';
import { useCarga } from '@/lib/useCarga';

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/**
 * Lunes de la semana que contiene a esa fecha de negocio.
 *
 * Trabaja sobre "YYYY-MM-DD" y no sobre `Date`: la semana que se mira es
 * de dias de negocio, y anclarla al reloj del dispositivo hacia que desde
 * otro huso la pantalla abriera en otra semana que la que la base
 * considera actual.
 */
const lunesDe = (fecha: string): string => {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  return sumarDiasEmpresa(fecha, -((d.getUTCDay() + 6) % 7));
};

const FilaDia = ({
  fecha,
  etiqueta,
  turno,
  turnoControl,
  fichajes,
  ausencias,
  puedeGestionar,
  onGuardar,
  onAprobarExtras,
  onQuitar,
}: {
  fecha: string;
  etiqueta: string;
  /** El turno planificado, si alguien lo asignó. */
  turno?: Turno;
  /**
   * Contra qué horario se controla la fichada de ese día: el turno
   * asignado o, si no hay, el horario general de la empresa. Lo arma la
   * página para que el resumen de la semana use el mismo criterio.
   */
  turnoControl?: Turno;
  fichajes: Fichaje[];
  ausencias: Ausencia[];
  puedeGestionar: boolean;
  onGuardar: (entrada: string, salida: string) => Promise<void>;
  onAprobarExtras: (aprobado: boolean) => Promise<void>;
  onQuitar: () => Promise<void>;
}) => {
  const [entrada, setEntrada] = useState(turno?.horaEntrada ?? '08:00');
  const [salida, setSalida] = useState(turno?.horaSalida ?? '17:00');
  const [guardando, setGuardando] = useState(false);
  const [quitando, setQuitando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (turno) {
      setEntrada(turno.horaEntrada);
      setSalida(turno.horaSalida);
    }
  }, [turno]);

  const control = useMemo(
    () =>
      turnoControl ? controlarTurno(turnoControl, fichajes, ausencias) : null,
    [turnoControl, fichajes, ausencias]
  );

  const quitar = async () => {
    setQuitando(true);
    try {
      await onQuitar();
    } finally {
      setQuitando(false);
    }
  };

  const guardar = async () => {
    if (!entrada || !salida) {
      setError('Completá entrada y salida.');
      return;
    }
    if (salida <= entrada) {
      setError('La salida debe ser posterior a la entrada.');
      return;
    }
    setError(null);
    setGuardando(true);
    try {
      await onGuardar(entrada, salida);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-paper px-4 py-3">
      <div className="w-24 shrink-0">
        <p className="text-sm font-bold text-ink">{etiqueta}</p>
        <p className="text-xs text-ink-soft">
          {new Date(`${fecha}T00:00:00`).toLocaleDateString('es-AR', {
            day: '2-digit',
            month: '2-digit',
          })}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <CampoHora value={entrada} onChange={setEntrada} />
        <span className="text-ink-soft">→</span>
        <CampoHora value={salida} onChange={setSalida} />
      </div>

      <Boton
        variante="secundario"
        tamano="sm"
        onClick={() => void guardar()}
        disabled={guardando}
      >
        {guardando ? 'Guardando…' : turno ? 'Actualizar' : 'Asignar'}
      </Boton>

      {turno && puedeGestionar && (
        <button
          type="button"
          onClick={() => void quitar()}
          disabled={quitando}
          className="cursor-pointer text-xs font-bold text-ink-soft underline decoration-dotted hover:text-red-600 disabled:opacity-50"
        >
          {quitando ? 'Quitando…' : 'Quitar turno'}
        </button>
      )}

      {error && (
        <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700">
          {error}
        </span>
      )}

      {/* Control contra la fichada */}
      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        {control?.ausente && (
          <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-700">
            Ausente
          </span>
        )}
        {control?.deLicencia && (
          <span className="rounded-full bg-brand-100 px-2.5 py-1 text-xs font-bold text-brand-700">
            De licencia · {tipoAusenciaLabels[control.deLicencia.tipo]}
          </span>
        )}
        {control && control.tardeMin > 0 && (
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">
            Tarde {formatearMinutos(control.tardeMin)}
          </span>
        )}
        {control && control.antesMin > 0 && (
          <span className="rounded-full bg-orange-100 px-2.5 py-1 text-xs font-bold text-orange-800">
            Salió antes {formatearMinutos(control.antesMin)}
          </span>
        )}
        {control && control.extrasMin > 0 && (
          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">
            Extra {formatearMinutos(control.extrasMin)}
          </span>
        )}
        {/* Se puede aprobar aunque el día no tenga turno asignado: antes
            el botón pedía `turno`, así que las extras de un día que
            nadie planificó se detectaban y no se podían pagar nunca. */}
        {control &&
          control.extrasMin > 0 &&
          puedeGestionar &&
          (turno?.extrasAprobadas ? (
            <button
              type="button"
              onClick={() => void onAprobarExtras(false)}
              className="flex cursor-pointer items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white transition-colors hover:bg-emerald-700"
              title="Quitar aprobación"
            >
              <IconCheck size={12} /> Aprobada
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void onAprobarExtras(true)}
              className="cursor-pointer rounded-full border border-emerald-300 px-2.5 py-1 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-50"
              title={
                turno
                  ? 'Marcar estas extras para liquidar'
                  : `Marcar estas extras para liquidar. Como el día no tenía turno asignado, se le asigna el horario general (${turnoControl?.horaEntrada}–${turnoControl?.horaSalida}), que es contra el que ya se estaban midiendo.`
              }
            >
              Aprobar extra
            </button>
          ))}
        {control &&
          !control.ausente &&
          !control.deLicencia &&
          control.tardeMin === 0 &&
          control.antesMin === 0 &&
          control.extrasMin === 0 && (
            <span className="rounded-full bg-paper px-2.5 py-1 text-xs font-bold text-ink-soft">
              En horario
            </span>
          )}
      </div>
    </div>
  );
};

const TurnosPage = () => {
  const { usuario, rolEfectivo } = useAuth();
  const [empleadoId, setEmpleadoId] = useState('');
  const [semana, setSemana] = useState(() => lunesDe(hoyISO()));
  const [baseEntrada, setBaseEntrada] = useState('08:00');
  const [baseSalida, setBaseSalida] = useState('17:00');
  const [aplicando, setAplicando] = useState(false);

  const puedeGestionar =
    rolEfectivo === 'admin_rrhh' ||
    rolEfectivo === 'supervisor' ||
    rolEfectivo === 'superadmin';

  const cEmpleados = useCarga(() => getEmpleados(), [puedeGestionar], {
    activo: puedeGestionar,
    contexto: 'turnos/empleados',
    inicial: [] as Empleado[],
  });
  const empleados = cEmpleados.datos;

  // Al llegar la lista se elige el primero; el colaborador se ve a sí
  // mismo. Va en un efecto aparte para que también aplique al reintentar.
  useEffect(() => {
    if (puedeGestionar) {
      if (empleados[0]) setEmpleadoId((prev) => prev || empleados[0].id);
    } else if (usuario?.empleadoId) {
      setEmpleadoId(usuario.empleadoId);
    }
  }, [puedeGestionar, empleados, usuario]);

  /**
   * Turnos, fichajes y ausencias van juntas: el control compara lo
   * planificado contra lo fichado y descuenta las licencias aprobadas.
   * Con una sola de las tres el cuadro miente —marcaría como ausencia
   * injustificada a alguien que estaba de vacaciones.
   */
  const cSemana = useCarga(
    async () => {
      const [turnos, fichajes, ausencias] = await Promise.all([
        getTurnosDeEmpleado(empleadoId),
        // Solo la semana que se esta mirando, con un dia de margen a cada
        // lado: la jornada que arranca el domingo a la noche pertenece al
        // domingo, y sin el margen llegaria sin su ingreso. Antes esto
        // bajaba el historial completo de la persona para pintar 7 dias.
        getFichajesDeEmpleado(empleadoId, {
          desde: sumarDiasEmpresa(semana, -1),
          hasta: sumarDiasEmpresa(semana, 7),
        }),
        getAusenciasDeEmpleado(empleadoId),
      ]);
      return { turnos, fichajes, ausencias };
    },
    [empleadoId, semana],
    { activo: Boolean(empleadoId), contexto: 'turnos' }
  );

  const turnos = useMemo(() => cSemana.datos?.turnos ?? [], [cSemana.datos]);
  const fichajes = useMemo(
    () => cSemana.datos?.fichajes ?? [],
    [cSemana.datos]
  );
  const ausencias = useMemo(
    () => cSemana.datos?.ausencias ?? [],
    [cSemana.datos]
  );

  /**
   * Horario general de la empresa: es el que se aplica a los días sin
   * turno asignado. Va aparte de `cSemana` porque no depende del
   * empleado elegido y no tiene por qué volver a pedirse al cambiarlo.
   */
  const cEmpresa = useCarga(() => getEmpresa(), [], {
    contexto: 'turnos/empresa',
  });
  const horarioGeneral = cEmpresa.datos?.config
    ? {
        horaEntrada: cEmpresa.datos.config.horaEntrada,
        horaSalida: cEmpresa.datos.config.horaSalida,
      }
    : null;

  const cargar = cSemana.recargar;

  const dias = useMemo(
    () => Array.from({ length: 7 }).map((_, i) => sumarDiasEmpresa(semana, i)),
    [semana]
  );

  const turnoDe = (fecha: string) => turnos.find((t) => t.fecha === fecha);

  /**
   * Contra qué horario se controla cada día: el turno asignado o, si no
   * hay, el horario general de la empresa — el mismo criterio que usa
   * `controlDeJornadas` en el servidor para Reportes y la liquidación.
   *
   * Sólo se arma el turno "de control" si esa persona fichó ese día. Sin
   * marcas no hay nada que controlar, y compararlo igual contra el
   * horario general pondría "Ausente" en cada sábado y domingo.
   */
  const turnoDeControl = (fecha: string): Turno | undefined => {
    const asignado = turnoDe(fecha);
    if (asignado) return asignado;
    if (!horarioGeneral || !empleadoId) return undefined;
    if (!ficho(fichajes, empleadoId, fecha)) return undefined;
    return {
      id: '',
      empleadoId,
      fecha,
      horaEntrada: horarioGeneral.horaEntrada,
      horaSalida: horarioGeneral.horaSalida,
      extrasAprobadas: false,
    };
  };

  const turnosSemana = dias
    .map(turnoDeControl)
    .filter((t): t is Turno => Boolean(t));
  const resumen = resumirControlTurnos(turnosSemana, fichajes, ausencias);

  const moverSemana = (delta: number) =>
    setSemana(sumarDiasEmpresa(semana, delta * 7));

  const licenciaEn = (fecha: string) =>
    ausencias.find(
      (a) =>
        a.estado === 'aprobada' &&
        a.fechaDesde <= fecha &&
        fecha <= a.fechaHasta
    );

  const guardar = async (fecha: string, entrada: string, salida: string) => {
    if (!empleadoId) return;
    if (!entrada || !salida || salida <= entrada) {
      avisoError(
        'Revisá el horario',
        'La salida debe ser posterior a la entrada.'
      );
      return;
    }
    const licencia = licenciaEn(fecha);
    if (licencia) {
      avisoError(
        'Tiene una ausencia aprobada ese día',
        `${tipoAusenciaLabels[licencia.tipo]} del ${licencia.fechaDesde} al ${licencia.fechaHasta}. Si igual querés asignarle el turno, primero cancelá o ajustá la ausencia.`
      );
      return;
    }
    await asignarTurno({
      empleadoId,
      fecha,
      horaEntrada: entrada,
      horaSalida: salida,
    });
    avisoExito('Turno guardado', 'Se comparará con la fichada del día.');
    cargar();
  };

  const aplicar = async (fechas: string[], etiqueta: string) => {
    if (!empleadoId) return;
    if (!baseEntrada || !baseSalida || baseSalida <= baseEntrada) {
      avisoError(
        'Revisá el horario',
        'La salida debe ser posterior a la entrada.'
      );
      return;
    }
    // No pisamos días con una ausencia aprobada (vacaciones, licencia, etc.):
    // si no, ese día pasa a figurar "ausente" contra un turno que nunca
    // debió existir.
    const fechasAAplicar = fechas.filter((f) => !licenciaEn(f));
    const omitidas = fechas.length - fechasAAplicar.length;
    setAplicando(true);
    try {
      await asignarTurnos(
        fechasAAplicar.map((fecha) => ({
          empleadoId,
          fecha,
          horaEntrada: baseEntrada,
          horaSalida: baseSalida,
        }))
      );
      avisoExito(
        `Horario aplicado a ${etiqueta}`,
        `${baseEntrada}–${baseSalida}.${omitidas > 0 ? ` Se salteó ${omitidas} ${omitidas === 1 ? 'día' : 'días'} con ausencia aprobada.` : ''} Podés ajustar días puntuales abajo.`
      );
      cargar();
    } finally {
      setAplicando(false);
    }
  };

  const quitar = async (turnoId: string) => {
    await quitarTurno(turnoId);
    avisoExito('Turno eliminado');
    cargar();
  };

  const aprobarExtras = async (fecha: string, aprobado: boolean) => {
    if (!empleadoId) return;
    const sinTurno = !turnoDe(fecha);
    await aprobarExtrasDeJornada(empleadoId, fecha, aprobado);
    avisoExito(
      aprobado ? 'Horas extra aprobadas' : 'Aprobación quitada',
      aprobado
        ? sinTurno
          ? 'Quedan marcadas para liquidar. Ese día no tenía turno asignado: se le puso el horario general, que es contra el que ya se medían.'
          : 'Quedan marcadas para liquidar.'
        : undefined
    );
    cargar();
  };

  const aplicarSemana = () => aplicar(dias, 'la semana');

  const aplicarMes = () => {
    // Sobre strings de fecha de negocio: `new Date('...T00:00:00')` movia
    // el mes segun el huso del dispositivo.
    const periodo = dias[0].slice(0, 7);
    const total = Number(finDeMesEmpresa(periodo).slice(8));
    const fechas = Array.from(
      { length: total },
      (_, i) => `${periodo}-${String(i + 1).padStart(2, '0')}`
    );
    aplicar(fechas, 'todo el mes');
  };

  if (!usuario) return null;

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[1.75rem]">
          Turnos
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Asigná horarios y compará con la fichada real: tarde, salidas antes,
          extras y ausencias.
        </p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        {puedeGestionar && empleados.length > 0 && (
          <div className="w-full max-w-xs">
            <CampoSelect
              etiqueta="Colaborador"
              value={empleadoId}
              onChange={setEmpleadoId}
              opciones={empleados.map((e) => ({
                valor: e.id,
                etiqueta: `${e.nombre} ${e.apellido}`,
              }))}
            />
          </div>
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => moverSemana(-1)}
            aria-label="Semana anterior"
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-line bg-surface text-ink-soft transition-colors hover:border-brand-300 hover:text-brand-700"
          >
            <IconChevronLeft size={16} />
          </button>
          <span className="text-sm font-semibold text-ink">
            Semana del{' '}
            {new Date(`${dias[0]}T00:00:00`).toLocaleDateString('es-AR', {
              day: 'numeric',
              month: 'short',
            })}
          </span>
          <button
            type="button"
            onClick={() => moverSemana(1)}
            aria-label="Semana siguiente"
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-line bg-surface text-ink-soft transition-colors hover:border-brand-300 hover:text-brand-700"
          >
            <IconChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard
          etiqueta="Ausencias"
          valor={resumen.ausencias}
          detalle="turnos sin fichaje"
          icono={IconUserOff}
        />
        <StatCard
          etiqueta="Llegadas tarde"
          valor={resumen.llegadasTarde}
          detalle={formatearMinutos(resumen.minutosTarde)}
          icono={IconClockExclamation}
        />
        <StatCard
          etiqueta="Salidas antes"
          valor={resumen.salidasAntes}
          detalle="sobre el turno"
          icono={IconAlertTriangle}
        />
        <StatCard
          etiqueta="Horas extras"
          valor={formatearMinutos(resumen.minutosExtras)}
          detalle="en la semana"
          icono={IconClockPlus}
        />
      </div>

      {empleadoId && puedeGestionar && (
        <Panel
          titulo="Horario habitual"
          descripcion="Cargalo una vez y aplicalo a toda la semana o el mes. Después ajustás los días que difieran."
        >
          {/* Los dos horarios y los botones que los aplican son un solo
              gesto: iban en la misma línea que el título y la barra
              quedaba con tres bloques sueltos que no se leían como
              pasos. */}
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex items-center gap-2">
              <CampoHora value={baseEntrada} onChange={setBaseEntrada} />
              <span className="text-ink-soft">→</span>
              <CampoHora value={baseSalida} onChange={setBaseSalida} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Boton
                variante="secundario"
                onClick={() => void aplicarSemana()}
                disabled={aplicando}
              >
                Aplicar a la semana
              </Boton>
              <Boton
                variante="negro"
                onClick={() => void aplicarMes()}
                disabled={aplicando}
              >
                Aplicar al mes
              </Boton>
            </div>
          </div>
        </Panel>
      )}

      <Panel>
        {!empleadoId ? (
          <p className="text-sm text-ink-soft">Elegí un colaborador.</p>
        ) : cSemana.fase === 'error' && cSemana.error ? (
          // Sin esto el control se veía vacío y parecía "no tiene turnos
          // asignados", cuando en realidad no se pudo leer nada.
          <BloqueError error={cSemana.error} onReintentar={cSemana.recargar} />
        ) : cSemana.fase === 'cargando' ? (
          <p className="text-sm text-ink-soft">Cargando la semana…</p>
        ) : (
          <div className="flex flex-col gap-2">
            {dias.map((fecha, i) => (
              <FilaDia
                key={fecha}
                fecha={fecha}
                etiqueta={DIAS[i]}
                turno={turnoDe(fecha)}
                turnoControl={turnoDeControl(fecha)}
                fichajes={fichajes}
                ausencias={ausencias}
                puedeGestionar={puedeGestionar}
                onGuardar={(entrada, salida) => guardar(fecha, entrada, salida)}
                onAprobarExtras={(aprobado) => aprobarExtras(fecha, aprobado)}
                onQuitar={() => {
                  const t = turnoDe(fecha);
                  return t ? quitar(t.id) : Promise.resolve();
                }}
              />
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
};

/** La empresa puede tener esta sección apagada: se bloquea la ruta,
 * no sólo el link del menú. */
const TurnosPageProtegida = () => (
  <RequireEmpresa>
    <RequireModulo modulo="turnos">
      <TurnosPage />
    </RequireModulo>
  </RequireEmpresa>
);

export default TurnosPageProtegida;
