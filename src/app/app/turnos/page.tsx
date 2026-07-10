'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { CampoSelect } from '@/components/app/ui/Campo';
import { avisoError, avisoExito } from '@/lib/avisos';
import {
  aprobarExtrasTurno,
  asignarTurno,
  asignarTurnos,
  getEmpleados,
  getFichajesDeEmpleado,
  getTurnosDeEmpleado,
} from '@/lib/services/rrhh';
import {
  controlarTurno,
  formatearMinutos,
  resumirControlTurnos,
} from '@/lib/turnos';
import { Empleado, Fichaje, Turno } from '@/types/rrhh';

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Lunes de la semana que contiene a `d`. */
const lunesDe = (d: Date): Date => {
  const r = new Date(d);
  const offset = (r.getDay() + 6) % 7;
  r.setDate(r.getDate() - offset);
  r.setHours(0, 0, 0, 0);
  return r;
};

const FilaDia = ({
  fecha,
  etiqueta,
  turno,
  fichajes,
  puedeGestionar,
  onGuardar,
  onAprobarExtras,
}: {
  fecha: string;
  etiqueta: string;
  turno?: Turno;
  fichajes: Fichaje[];
  puedeGestionar: boolean;
  onGuardar: (entrada: string, salida: string) => Promise<void>;
  onAprobarExtras: (aprobado: boolean) => Promise<void>;
}) => {
  const [entrada, setEntrada] = useState(turno?.horaEntrada ?? '08:00');
  const [salida, setSalida] = useState(turno?.horaSalida ?? '17:00');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (turno) {
      setEntrada(turno.horaEntrada);
      setSalida(turno.horaSalida);
    }
  }, [turno]);

  const control = useMemo(
    () => (turno ? controlarTurno(turno, fichajes) : null),
    [turno, fichajes]
  );

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

  const claseHora =
    'rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink outline-none focus:border-brand-600';

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
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
        <input
          type="time"
          value={entrada}
          onChange={(e) => setEntrada(e.target.value)}
          className={claseHora}
        />
        <span className="text-ink-soft">→</span>
        <input
          type="time"
          value={salida}
          onChange={(e) => setSalida(e.target.value)}
          className={claseHora}
        />
      </div>

      <Boton
        variante="secundario"
        tamano="sm"
        onClick={() => void guardar()}
        disabled={guardando}
      >
        {guardando ? 'Guardando…' : turno ? 'Actualizar' : 'Asignar'}
      </Boton>

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
        {control &&
          control.extrasMin > 0 &&
          turno &&
          puedeGestionar &&
          (turno.extrasAprobadas ? (
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
            >
              Aprobar extra
            </button>
          ))}
        {control &&
          !control.ausente &&
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
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [empleadoId, setEmpleadoId] = useState('');
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [fichajes, setFichajes] = useState<Fichaje[]>([]);
  const [semana, setSemana] = useState(() => lunesDe(new Date()));
  const [baseEntrada, setBaseEntrada] = useState('08:00');
  const [baseSalida, setBaseSalida] = useState('17:00');
  const [aplicando, setAplicando] = useState(false);

  const puedeGestionar =
    rolEfectivo === 'admin_rrhh' ||
    rolEfectivo === 'supervisor' ||
    rolEfectivo === 'superadmin';

  useEffect(() => {
    if (puedeGestionar) {
      void getEmpleados().then((es) => {
        setEmpleados(es);
        if (es[0]) setEmpleadoId((prev) => prev || es[0].id);
      });
    } else if (usuario?.empleadoId) {
      setEmpleadoId(usuario.empleadoId);
    }
  }, [puedeGestionar, usuario]);

  const cargar = useCallback(() => {
    if (!empleadoId) return;
    void getTurnosDeEmpleado(empleadoId).then(setTurnos);
    void getFichajesDeEmpleado(empleadoId).then(setFichajes);
  }, [empleadoId]);

  useEffect(cargar, [cargar]);

  const dias = useMemo(
    () =>
      Array.from({ length: 7 }).map((_, i) => {
        const d = new Date(semana);
        d.setDate(d.getDate() + i);
        return iso(d);
      }),
    [semana]
  );

  const turnoDe = (fecha: string) => turnos.find((t) => t.fecha === fecha);
  const turnosSemana = dias.map(turnoDe).filter((t): t is Turno => Boolean(t));
  const resumen = resumirControlTurnos(turnosSemana, fichajes);

  const moverSemana = (delta: number) => {
    const d = new Date(semana);
    d.setDate(d.getDate() + delta * 7);
    setSemana(d);
  };

  const guardar = async (fecha: string, entrada: string, salida: string) => {
    if (!empleadoId) return;
    if (!entrada || !salida || salida <= entrada) {
      avisoError(
        'Revisá el horario',
        'La salida debe ser posterior a la entrada.'
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
    setAplicando(true);
    try {
      await asignarTurnos(
        fechas.map((fecha) => ({
          empleadoId,
          fecha,
          horaEntrada: baseEntrada,
          horaSalida: baseSalida,
        }))
      );
      avisoExito(
        `Horario aplicado a ${etiqueta}`,
        `${baseEntrada}–${baseSalida}. Podés ajustar días puntuales abajo.`
      );
      cargar();
    } finally {
      setAplicando(false);
    }
  };

  const aprobarExtras = async (turnoId: string, aprobado: boolean) => {
    await aprobarExtrasTurno(turnoId, aprobado);
    avisoExito(
      aprobado ? 'Horas extra aprobadas' : 'Aprobación quitada',
      aprobado ? 'Quedan marcadas para liquidar.' : undefined
    );
    cargar();
  };

  const aplicarSemana = () => aplicar(dias, 'la semana');

  const aplicarMes = () => {
    const ancla = new Date(`${dias[0]}T00:00:00`);
    const anio = ancla.getFullYear();
    const mes = ancla.getMonth();
    const total = new Date(anio, mes + 1, 0).getDate();
    const fechas = Array.from({ length: total }, (_, i) =>
      iso(new Date(anio, mes, i + 1))
    );
    aplicar(fechas, 'todo el mes');
  };

  if (!usuario) return null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Turnos</h1>
        <p className="mt-1 text-sm text-ink-soft">
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

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
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
        <Panel className="flex flex-wrap items-end gap-4">
          <div>
            <p className="text-sm font-bold text-ink">Horario habitual</p>
            <p className="text-xs text-ink-soft">
              Cargalo una vez y aplicalo a toda la semana o el mes. Después
              ajustás los días que difieran.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="time"
              value={baseEntrada}
              onChange={(e) => setBaseEntrada(e.target.value)}
              className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink outline-none focus:border-brand-600"
            />
            <span className="text-ink-soft">→</span>
            <input
              type="time"
              value={baseSalida}
              onChange={(e) => setBaseSalida(e.target.value)}
              className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink outline-none focus:border-brand-600"
            />
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
        </Panel>
      )}

      <Panel>
        {!empleadoId ? (
          <p className="text-sm text-ink-soft">Elegí un colaborador.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {dias.map((fecha, i) => (
              <FilaDia
                key={fecha}
                fecha={fecha}
                etiqueta={DIAS[i]}
                turno={turnoDe(fecha)}
                fichajes={fichajes}
                puedeGestionar={puedeGestionar}
                onGuardar={(entrada, salida) => guardar(fecha, entrada, salida)}
                onAprobarExtras={(aprobado) => {
                  const t = turnoDe(fecha);
                  return t ? aprobarExtras(t.id, aprobado) : Promise.resolve();
                }}
              />
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
};

export default TurnosPage;
