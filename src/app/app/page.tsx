'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  IconAlertTriangle,
  IconBeach,
  IconBuildingFactory2,
  IconCalendarEvent,
  IconChecklist,
  IconClockCheck,
  IconClockExclamation,
  IconClockPlus,
  IconFileCertificate,
  IconInbox,
  IconUsers,
} from '@tabler/icons-react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { tipoAusenciaIconos } from '@/lib/etiquetas';
import { StatCard } from '@/components/app/dashboard/StatCard';
import { ListaCard, ListaItem } from '@/components/app/dashboard/ListaCard';
import { EstadoBadge } from '@/components/app/EstadoBadge';
import {
  getAlertas,
  getAusenciasDeEmpleado,
  getAusenciasPendientes,
  getEmpleados,
  getEmpresas,
  getEventosProximos,
  getFichajesDeHoy,
  getMetricasGlobales,
  getMiMes,
  getRecibos,
  getResumenFinanzas,
  getSaldoVacaciones,
  MiMes,
} from '@/lib/services/rrhh';
import {
  Alerta,
  Ausencia,
  Empleado,
  EmpresaResumen,
  EventoAgenda,
  MetricasGlobales,
  SaldoVacaciones,
} from '@/types/rrhh';

const ANIO_ACTUAL = new Date().getFullYear();

const formatearFecha = (iso: string): string =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'short',
  });

const tipoAusencia: Record<Ausencia['tipo'], string> = {
  vacaciones: 'Vacaciones',
  enfermedad: 'Enfermedad',
  estudio: 'Estudio',
  mudanza: 'Mudanza',
  fallecimiento: 'Fallecimiento',
  especial: 'Licencia especial',
};

const DashboardPage = () => {
  const { usuario, rolEfectivo, entrarAEmpresa } = useAuth();
  const router = useRouter();
  const esEmpleado = rolEfectivo === 'empleado';
  const esSuperadmin = rolEfectivo === 'superadmin';

  const [saldo, setSaldo] = useState<SaldoVacaciones | null>(null);
  const [misAusencias, setMisAusencias] = useState<Ausencia[]>([]);
  const [recibosPendientes, setRecibosPendientes] = useState(0);
  const [pendientes, setPendientes] = useState<Ausencia[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [presentes, setPresentes] = useState(0);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [eventos, setEventos] = useState<EventoAgenda[]>([]);
  const [metricas, setMetricas] = useState<MetricasGlobales | null>(null);
  const [empresas, setEmpresas] = useState<EmpresaResumen[]>([]);
  const [pagosPendientes, setPagosPendientes] = useState(0);
  const [miMes, setMiMes] = useState<MiMes | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!usuario || !rolEfectivo) return;

    if (rolEfectivo === 'superadmin') {
      void getMetricasGlobales().then(setMetricas);
      void getEmpresas()
        .then(setEmpresas)
        .finally(() => setCargando(false));
      void getResumenFinanzas(new Date().toISOString().slice(0, 7)).then((r) =>
        setPagosPendientes(r.empresasVencidas)
      );
      return;
    }

    void getEventosProximos().then(setEventos);

    if (usuario.empleadoId) {
      void getMiMes(usuario.empleadoId).then(setMiMes);
      void getSaldoVacaciones(usuario.empleadoId, ANIO_ACTUAL).then(setSaldo);
      void getAusenciasDeEmpleado(usuario.empleadoId)
        .then(setMisAusencias)
        .finally(() => setCargando(false));
      void getRecibos(usuario.empleadoId).then((r) =>
        setRecibosPendientes(
          r.filter((x) => x.estadoFirma === 'pendiente').length
        )
      );
    }
    if (rolEfectivo !== 'empleado') {
      void getAusenciasPendientes()
        .then(setPendientes)
        .finally(() => setCargando(false));
      void getEmpleados().then(setEmpleados);
      void getFichajesDeHoy().then((f) =>
        setPresentes(
          new Set(
            f.filter((x) => x.tipo === 'ingreso').map((x) => x.empleadoId)
          ).size
        )
      );
      void getAlertas().then(setAlertas);
    }
  }, [usuario, rolEfectivo]);

  if (!usuario) return null;

  const nombrePila = usuario.nombreCompleto.split(' ')[0];
  const nombreEmpleado = (id: string): string => {
    const e = empleados.find((x) => x.id === id);
    return e ? `${e.nombre} ${e.apellido}` : '—';
  };

  if (esSuperadmin) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            Hola, {nombrePila}
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            El estado de tu negocio hoy.
          </p>
        </div>

        {pagosPendientes > 0 && (
          <button
            onClick={() => router.push('/finanzas')}
            className="flex cursor-pointer items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-left transition-colors hover:border-amber-300"
          >
            <IconAlertTriangle size={20} className="shrink-0 text-amber-700" />
            <span className="text-sm text-amber-900">
              <strong>
                {pagosPendientes === 1
                  ? '1 empresa con el pago pendiente'
                  : `${pagosPendientes} empresas con el pago pendiente`}
              </strong>{' '}
              este mes. Revisá Finanzas.
            </span>
          </button>
        )}

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard
            etiqueta="Empresas activas"
            valor={metricas?.empresasActivas ?? '…'}
            detalle={
              metricas && metricas.empresasSuspendidas > 0
                ? `+${metricas.empresasSuspendidas} suspendidas`
                : 'todas al día'
            }
            href="/empresas"
            icono={IconBuildingFactory2}
          />
          <StatCard
            etiqueta="Empleados"
            valor={metricas?.empleadosGestionados ?? '…'}
            detalle="gestionados en total"
            href="/empresas"
            icono={IconUsers}
          />
          <StatCard
            etiqueta="Solicitudes"
            valor={metricas?.solicitudesPendientes ?? '…'}
            detalle="pendientes en clientes"
            href="/empresas"
            icono={IconInbox}
          />
          <StatCard
            etiqueta="Adopción"
            valor="83%"
            detalle="empleados que usan la app"
            href="/empresas"
            icono={IconChecklist}
          />
        </div>

        <ListaCard
          titulo="Tus clientes"
          vacio="Sin empresas cargadas."
          accion={{ etiqueta: 'Ver empresas', href: '/empresas' }}
        >
          {empresas.map(({ empresa, empleadosActivos }) => (
            <ListaItem
              key={empresa.id}
              icono={IconBuildingFactory2}
              onClick={
                empresa.estado === 'activa'
                  ? () => {
                      entrarAEmpresa(empresa);
                      router.push('/');
                    }
                  : undefined
              }
              principal={empresa.nombre}
              secundario={`${empleadosActivos} empleados · ${empresa.contactoNombre}`}
              extremo={
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
                    empresa.estado === 'activa'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-red-100 text-red-700'
                  }`}
                >
                  {empresa.estado === 'activa' ? 'Activa' : 'Suspendida'}
                </span>
              }
            />
          ))}
        </ListaCard>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">
          Hola, {nombrePila}
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          {esEmpleado ? 'Tu resumen de hoy.' : 'El resumen de tu equipo hoy.'}
        </p>
      </div>

      {esEmpleado ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <StatCard
            etiqueta="Vacaciones disponibles"
            valor={saldo ? `${saldo.diasDisponibles} días` : '…'}
            detalle={
              saldo
                ? `de ${saldo.diasCorresponden} que te corresponden`
                : undefined
            }
            href="/ausencias"
            icono={IconBeach}
          />
          <StatCard
            etiqueta="Recibos por firmar"
            valor={recibosPendientes}
            detalle={
              recibosPendientes > 0 ? 'Tenés firmas pendientes' : 'Estás al día'
            }
            href="/recibos"
            icono={IconFileCertificate}
          />
          <StatCard
            etiqueta="Solicitudes activas"
            valor={misAusencias.filter((a) => a.estado === 'pendiente').length}
            detalle="esperando aprobación"
            href="/ausencias"
            icono={IconInbox}
          />
          <StatCard
            etiqueta="Mis horas"
            valor={miMes ? `${miMes.horasTrabajadas} hs` : '…'}
            detalle="última semana"
            href="/fichaje"
            icono={IconClockCheck}
          />
          <StatCard
            etiqueta="Mis extras"
            valor={miMes ? `${miMes.horasExtras} hs` : '…'}
            detalle="última semana"
            href="/fichaje"
            icono={IconClockPlus}
          />
          <StatCard
            etiqueta="Llegadas tarde"
            valor={miMes?.llegadasTarde ?? '…'}
            detalle={
              miMes && miMes.minutosTarde > 0
                ? `${miMes.minutosTarde} min en total`
                : 'estás impecable'
            }
            href="/fichaje"
            icono={IconClockExclamation}
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard
            etiqueta="Por aprobar"
            valor={pendientes.length}
            detalle="solicitudes de ausencia"
            href="/ausencias"
            icono={IconInbox}
          />
          <StatCard
            etiqueta="Presentes hoy"
            valor={`${presentes}/${empleados.length || '—'}`}
            detalle="ficharon ingreso"
            href="/fichaje"
            icono={IconClockCheck}
          />
          <StatCard
            etiqueta="Vencimientos"
            valor={alertas.length}
            detalle="próximos a vencer"
            href="/colaboradores"
            icono={IconAlertTriangle}
          />
          <StatCard
            etiqueta="Colaboradores"
            valor={empleados.length}
            detalle="activos"
            href="/colaboradores"
            icono={IconUsers}
          />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {esEmpleado ? (
          <ListaCard
            titulo="Mis solicitudes"
            vacio="Sin solicitudes."
            accion={{ etiqueta: 'Ver todas', href: '/ausencias' }}
          >
            {misAusencias.length > 0 &&
              misAusencias.map((a) => (
                <ListaItem
                  key={a.id}
                  href="/ausencias"
                  icono={tipoAusenciaIconos[a.tipo]}
                  principal={tipoAusencia[a.tipo]}
                  secundario={`${formatearFecha(a.fechaDesde)} al ${formatearFecha(a.fechaHasta)} · ${a.dias} días`}
                  extremo={<EstadoBadge estado={a.estado} />}
                />
              ))}
          </ListaCard>
        ) : (
          <ListaCard
            titulo="Solicitudes por aprobar"
            vacio="No hay solicitudes pendientes."
            accion={{ etiqueta: 'Ver todas', href: '/ausencias' }}
          >
            {pendientes.length > 0 &&
              pendientes.map((a) => (
                <ListaItem
                  key={a.id}
                  href="/ausencias"
                  icono={IconInbox}
                  principal={nombreEmpleado(a.empleadoId)}
                  secundario={`${tipoAusencia[a.tipo]} · ${formatearFecha(a.fechaDesde)} al ${formatearFecha(a.fechaHasta)}`}
                  extremo={<EstadoBadge estado={a.estado} />}
                />
              ))}
          </ListaCard>
        )}

        <ListaCard
          titulo="Próximos eventos"
          vacio="Sin eventos próximos."
          accion={{ etiqueta: 'Ver agenda', href: '/agenda' }}
        >
          {eventos.length > 0 &&
            eventos
              .slice(0, 4)
              .map((e) => (
                <ListaItem
                  key={e.id}
                  href="/agenda"
                  icono={IconCalendarEvent}
                  principal={e.titulo}
                  secundario={e.descripcion}
                  extremo={
                    <span className="shrink-0 text-xs font-semibold text-ink-soft">
                      {formatearFecha(e.fecha)}
                    </span>
                  }
                />
              ))}
        </ListaCard>
      </div>

      {!esEmpleado && alertas.length > 0 && (
        <ListaCard
          titulo="Vencimientos próximos"
          accion={{ etiqueta: 'Ver colaboradores', href: '/colaboradores' }}
        >
          {alertas.map((a) => (
            <ListaItem
              key={a.id}
              href={
                a.empleadoId
                  ? `/colaboradores/${a.empleadoId}`
                  : '/colaboradores'
              }
              icono={IconAlertTriangle}
              principal={a.titulo}
              extremo={
                <span className="shrink-0 text-xs font-semibold text-peach">
                  {formatearFecha(a.fecha)}
                </span>
              }
            />
          ))}
        </ListaCard>
      )}
    </div>
  );
};

export default DashboardPage;
