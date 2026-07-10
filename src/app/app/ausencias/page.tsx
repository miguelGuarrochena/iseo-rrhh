'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  IconBeach,
  IconCheck,
  IconPlaneDeparture,
  IconPlus,
  IconX,
} from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';
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
import { formatearFecha } from '@/lib/fechas';
import { avisoError, avisoExito } from '@/lib/avisos';
import { tipoAusenciaIconos, tipoAusenciaLabels } from '@/lib/etiquetas';
import {
  crearAusencia,
  getAusencias,
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
  SaldoVacaciones,
  TipoAusencia,
  VacacionSector,
} from '@/types/rrhh';

const ANIO_ACTUAL = new Date().getFullYear();
const POR_PAGINA = 5;

const rangoDe = (a: Ausencia): string =>
  `${formatearFecha(a.fechaDesde)} al ${formatearFecha(a.fechaHasta)} · ${a.dias} días`;

const AusenciasPage = () => {
  const { usuario, rolEfectivo } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const esEmpleado = rolEfectivo === 'empleado';

  const [saldo, setSaldo] = useState<SaldoVacaciones | null>(null);
  const [ausencias, setAusencias] = useState<Ausencia[]>([]);
  const [vacacionesSector, setVacacionesSector] = useState<VacacionSector[]>(
    []
  );
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [filtroTipo, setFiltroTipo] = useState<TipoAusencia | ''>('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroEmpleado, setFiltroEmpleado] = useState('');
  const [pagina, setPagina] = useState(1);
  const [modalAbierto, { open, close }] = useDisclosure(false);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(() => {
    if (!usuario) return;
    if (esEmpleado && usuario.empleadoId) {
      const empleadoId = usuario.empleadoId;
      void (async () => {
        const [misAusencias, saldoVacaciones, empleado, vacaciones] =
          await Promise.all([
            getAusenciasDeEmpleado(empleadoId),
            getSaldoVacaciones(empleadoId, ANIO_ACTUAL),
            getEmpleado(empleadoId),
            getVacacionesAprobadasMiSector(empleadoId),
          ]);
        setAusencias(misAusencias);
        setSaldo(saldoVacaciones);
        setEmpleados(empleado ? [empleado] : []);
        setVacacionesSector(vacaciones);
      })().finally(() => setCargando(false));
    } else {
      void getAusencias()
        .then(setAusencias)
        .finally(() => setCargando(false));
      void getEmpleados().then(setEmpleados);
      setVacacionesSector([]);
    }
  }, [usuario, esEmpleado]);

  useEffect(cargar, [cargar]);

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
    tipo: TipoAusencia;
    fechaDesde: string;
    fechaHasta: string;
    comentario?: string;
  }) => {
    if (!usuario.empleadoId) return;
    try {
      await crearAusencia({ empleadoId: usuario.empleadoId, ...datos });
      avisoExito('Solicitud enviada', 'Te avisamos cuando la resuelvan.');
      close();
      cargar();
    } catch (err) {
      avisoError(
        'No pudimos enviar la solicitud',
        err instanceof Error ? err.message : undefined
      );
      throw err;
    }
  };

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

  const pendientes = filtradas.filter((a) => a.estado === 'pendiente');
  const resueltas = filtradas.filter((a) => a.estado !== 'pendiente');
  const totalPaginas = totalPaginasDe(resueltas.length, POR_PAGINA);
  const resueltasVisibles = paginar(resueltas, pagina, POR_PAGINA);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            Ausencias
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            {esEmpleado
              ? 'Tus vacaciones, licencias y solicitudes.'
              : 'Solicitudes del equipo: aprobá o rechazá con un click.'}
          </p>
        </div>
        {esEmpleado && (
          <Boton variante="negro" onClick={open}>
            <IconPlus size={18} />
            Nueva solicitud
          </Boton>
        )}
      </div>

      <div className="flex flex-col gap-3">
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
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-paper px-4 py-3 text-sm text-ink-soft">
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
          <h2 className="text-base font-bold text-ink">
            Calendario de ausencias
          </h2>
          <p className="mb-4 mt-1 text-sm text-ink-soft">
            Quién está ausente cada día. Tocá un día para ver el detalle.
          </p>
          <CalendarioAusencias
            ausencias={filtradas}
            nombreEmpleado={nombreEmpleado}
          />
        </Panel>
      )}

      {esEmpleado && (
        <div className="grid grid-cols-3 gap-4">
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
          <h2 className="text-base font-bold text-ink">
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
          />
        </Panel>
      )}

      <ListaCard
        titulo={
          esEmpleado ? 'Solicitudes en curso' : 'Pendientes de aprobación'
        }
        cargando={cargando}
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
                  <EstadoBadge estado={a.estado} />
                ) : (
                  <div className="flex shrink-0 items-center gap-2">
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
                  </div>
                )
              }
            />
          ))}
      </ListaCard>

      <ListaCard
        titulo="Historial"
        cargando={cargando}
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
              extremo={<EstadoBadge estado={a.estado} />}
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
      />
    </div>
  );
};

export default AusenciasPage;
