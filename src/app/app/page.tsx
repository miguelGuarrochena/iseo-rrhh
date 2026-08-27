'use client';

import { useMemo } from 'react';
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
import { hoyISO } from '@/lib/fechas';
import { tipoAusenciaIconos } from '@/lib/etiquetas';
import { StatCard } from '@/components/app/dashboard/StatCard';
import { ListaCard, ListaItem } from '@/components/app/dashboard/ListaCard';
import { EstadoBadge } from '@/components/app/EstadoBadge';
import {
  getAlertas,
  getAusenciasDeEmpleado,
  getAusenciasPendientes,
  getEmpleados,
  getEmpleadosConCuenta,
  getEmpresas,
  getEventosProximos,
  getFichajesDeHoy,
  getJornadas,
  getMetricasGlobales,
  getMiMes,
  getRecibos,
  getRemuneracionesTodas,
  getResumenFinanzas,
  getSaldoVacaciones,
  getVacacionesAprobadasMiSector,
} from '@/lib/services/rrhh';
import {
  Alerta,
  Ausencia,
  Empleado,
  EmpresaResumen,
  EventoAgenda,
  Fichaje,
  ReciboSueldo,
  Remuneracion,
  VacacionSector,
} from '@/types/rrhh';
import { desdeIncidencias, horaLocal, Jornada } from '@/lib/fichadas';
import { useModulos } from '@/lib/auth/useModulos';
import { moduloActivo } from '@/components/app/navItems';

import { tipoAusenciaLabels } from '@/lib/etiquetas';
import { useCarga } from '@/lib/useCarga';
import { faltasDeEmpleado } from '@/lib/requisitos';
import { BloqueFaltasDeVarios } from '@/components/app/Faltas';

const ANIO_ACTUAL = new Date().getFullYear();

const formatearFecha = (iso: string): string =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'short',
  });

const tipoAusencia = tipoAusenciaLabels;

const DashboardPage = () => {
  const { usuario, rolEfectivo, entrarAEmpresa } = useAuth();
  const router = useRouter();
  const esEmpleado = rolEfectivo === 'empleado';
  const esSuperadmin = rolEfectivo === 'superadmin';

  /**
   * Una consulta por tarjeta, cada una con su `activo` según el rol.
   *
   * El dashboard es lo primero que ve todo el mundo y arma su vista con
   * consultas de temas distintos. Si se juntaran, que se caiga el cálculo
   * de presentes dejaría la pantalla entera en blanco al entrar. Así cada
   * tarjeta falla sola y el resto sigue sirviendo.
   */
  const miId = usuario?.empleadoId;
  const esGestion = Boolean(rolEfectivo) && rolEfectivo !== 'empleado';
  const gestionEmpresa = esGestion && !esSuperadmin;

  /**
   * Con Fichaje apagado no hay marcas que contar, pero las tarjetas se
   * pedían igual: mostraban "Presentes 0/12" y "Mis horas 0 hs" con link
   * a una ruta bloqueada. Un cero es una afirmación —"nadie fichó"— y
   * acá la verdad es otra: la empresa no usa fichaje. Se esconden.
   */
  const modulos = useModulos();
  const conFichaje = moduloActivo('fichaje', modulos);

  const cMetricas = useCarga(() => getMetricasGlobales(), [], {
    activo: esSuperadmin,
    contexto: 'inicio/metricas',
  });
  const metricas = cMetricas.datos ?? null;

  const cEmpresas = useCarga(() => getEmpresas(), [], {
    activo: esSuperadmin,
    contexto: 'inicio/empresas',
    inicial: [] as EmpresaResumen[],
  });
  const empresas = cEmpresas.datos;

  const cFinanzas = useCarga(
    () => getResumenFinanzas(hoyISO().slice(0, 7)),
    [],
    { activo: esSuperadmin, contexto: 'inicio/finanzas' }
  );
  const pagosPendientes = cFinanzas.datos?.empresasVencidas ?? 0;

  const cEventos = useCarga(() => getEventosProximos(), [], {
    activo: Boolean(rolEfectivo) && !esSuperadmin,
    contexto: 'inicio/eventos',
    inicial: [] as EventoAgenda[],
  });
  const eventos = cEventos.datos;

  const cMiMes = useCarga(() => getMiMes(miId!), [miId, conFichaje], {
    activo: Boolean(miId) && conFichaje,
    contexto: 'inicio/mi-mes',
  });
  const miMes = cMiMes.datos ?? null;

  const cSaldo = useCarga(
    () => getSaldoVacaciones(miId!, ANIO_ACTUAL),
    [miId],
    { activo: Boolean(miId), contexto: 'inicio/saldo' }
  );
  const saldo = cSaldo.datos ?? null;

  const cMisAusencias = useCarga(() => getAusenciasDeEmpleado(miId!), [miId], {
    activo: Boolean(miId),
    contexto: 'inicio/mis-ausencias',
    inicial: [] as Ausencia[],
  });
  const misAusencias = cMisAusencias.datos;

  const cSector = useCarga(
    () => getVacacionesAprobadasMiSector(miId!),
    [miId],
    {
      activo: Boolean(miId),
      contexto: 'inicio/sector',
      inicial: [] as VacacionSector[],
    }
  );
  const vacacionesSector = cSector.datos;

  const cRecibos = useCarga(() => getRecibos(miId!), [miId], {
    activo: Boolean(miId),
    contexto: 'inicio/recibos',
    inicial: [] as ReciboSueldo[],
  });
  const recibosPendientes = cRecibos.datos.filter(
    (r) => r.estadoFirma === 'pendiente'
  ).length;

  const cPendientes = useCarga(
    () => getAusenciasPendientes(),
    [gestionEmpresa],
    {
      activo: gestionEmpresa,
      contexto: 'inicio/pendientes',
      inicial: [] as Ausencia[],
    }
  );
  const pendientes = cPendientes.datos;

  const cEmpleados = useCarga(() => getEmpleados(), [gestionEmpresa], {
    activo: gestionEmpresa,
    contexto: 'inicio/empleados',
    inicial: [] as Empleado[],
  });
  const empleados = cEmpleados.datos;

  const cFichajes = useCarga(
    () => getFichajesDeHoy(),
    [gestionEmpresa, conFichaje],
    {
      activo: gestionEmpresa && conFichaje,
      contexto: 'inicio/fichajes',
      inicial: [] as Fichaje[],
    }
  );
  const presentes = new Set(
    cFichajes.datos.filter((f) => f.tipo === 'ingreso').map((f) => f.empleadoId)
  ).size;

  const cAlertas = useCarga(() => getAlertas(), [gestionEmpresa], {
    activo: gestionEmpresa,
    contexto: 'inicio/alertas',
    inicial: [] as Alerta[],
  });
  const alertas = cAlertas.datos;

  /**
   * Jornadas que quedaron sin cerrar en las últimas dos semanas.
   *
   * Estaban sólo en la pantalla de Fichaje, así que quien no entra ahí
   * —justamente el que liquida— se enteraba de la salida que faltaba
   * recién al cerrar el mes, cuando ya no hay a quién preguntarle qué
   * pasó ese día.
   */
  const desdeIncid = desdeIncidencias();
  const cIncompletas = useCarga(
    () => getJornadas(desdeIncid, hoyISO(), { soloAbiertas: true }),
    [gestionEmpresa, conFichaje, desdeIncid],
    {
      activo: gestionEmpresa && conFichaje,
      contexto: 'inicio/incompletas',
      inicial: [] as Jornada[],
    }
  );
  const incompletas = cIncompletas.datos;

  // Dos consultas para toda la empresa, no una por persona.
  const cCuentas = useCarga(() => getEmpleadosConCuenta(), [gestionEmpresa], {
    activo: gestionEmpresa,
    contexto: 'inicio/cuentas',
    inicial: [] as string[],
  });
  const cSueldos = useCarga(() => getRemuneracionesTodas(), [gestionEmpresa], {
    activo: gestionEmpresa,
    contexto: 'inicio/sueldos',
    inicial: [] as Remuneracion[],
  });
  const faltantes = useMemo(() => {
    const cuentas = new Set(cCuentas.datos);
    const conSueldo = new Set(cSueldos.datos.map((r) => r.empleadoId));
    return empleados.map((e) => ({
      nombre: `${e.nombre} ${e.apellido}`,
      // Cada dato que no se pudo consultar va undefined por separado: si
      // falla la de sueldos, las faltas de cuenta se siguen mostrando.
      faltas: faltasDeEmpleado(e, {
        tieneCuenta: cCuentas.fase === 'ok' ? cuentas.has(e.id) : undefined,
        tieneSueldo: cSueldos.fase === 'ok' ? conSueldo.has(e.id) : undefined,
      }),
    }));
  }, [empleados, cCuentas.datos, cCuentas.fase, cSueldos.datos, cSueldos.fase]);

  if (!usuario) return null;

  const nombrePila = usuario.nombreCompleto.split(' ')[0];
  const nombreEmpleado = (id: string): string => {
    const e = empleados.find((x) => x.id === id);
    if (e) return `${e.nombre} ${e.apellido}`;
    const vacacion = vacacionesSector.find((v) => v.empleadoId === id);
    return vacacion
      ? `${vacacion.empleadoNombre} ${vacacion.empleadoApellido}`.trim()
      : 'Compañero';
  };
  const hoy = hoyISO();
  const proximasVacacionesSector = vacacionesSector
    .filter((a) => a.fechaHasta >= hoy)
    .slice(0, 4);

  if (esSuperadmin) {
    return (
      <div className="flex flex-col gap-6 sm:gap-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[1.75rem]">
            Hola, {nombrePila}
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-soft">
            El estado de tu negocio hoy.
          </p>
        </div>

        {pagosPendientes > 0 && (
          <button
            onClick={() => router.push('/finanzas')}
            className="flex cursor-pointer items-center gap-3 rounded-3xl border border-brand-200 bg-paper px-4 py-3.5 text-left transition-colors hover:border-brand-300"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
              <IconAlertTriangle size={19} stroke={2} />
            </span>
            <span className="text-sm text-ink">
              <strong>
                {pagosPendientes === 1
                  ? '1 empresa todavía no pagó la cuota'
                  : `${pagosPendientes} empresas todavía no pagaron la cuota`}
              </strong>{' '}
              este mes. Revisá Finanzas.
            </span>
          </button>
        )}

        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <StatCard
            etiqueta="Empresas activas"
            valor={metricas?.empresasActivas ?? '…'}
            detalle={
              metricas && metricas.empresasSuspendidas > 0
                ? `${metricas.empresasSuspendidas} suspendidas`
                : 'ninguna suspendida'
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
    <div className="flex flex-col gap-6 sm:gap-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[1.75rem]">
          Hola, {nombrePila}
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-soft">
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
          {conFichaje && (
            <>
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
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <StatCard
            etiqueta="Por aprobar"
            valor={pendientes.length}
            detalle="solicitudes de ausencia"
            href="/ausencias"
            icono={IconInbox}
          />
          {conFichaje && (
            <StatCard
              etiqueta="Presentes hoy"
              valor={`${presentes}/${empleados.length || '—'}`}
              detalle="ficharon ingreso"
              href="/fichaje"
              icono={IconClockCheck}
            />
          )}
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

      {/* Lo que hay que completar en toda la empresa. Va en Inicio
          porque son cosas que nadie va a buscar: no duelen hasta el día
          que hacen falta, y ese día ya es tarde. Agrupado por falta, con
          los nombres: "10 sin cuenta" sin decir quiénes no sirve. */}
      {gestionEmpresa && (
        <BloqueFaltasDeVarios
          items={faltantes}
          titulo="Para completar cuando puedas"
        />
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {esEmpleado ? (
          <ListaCard
            titulo="Mis solicitudes"
            vacio="Sin solicitudes. Podés pedir vacaciones desde Ausencias."
            accion={{ etiqueta: 'Pedir vacaciones', href: '/ausencias' }}
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

        {esEmpleado && (
          <ListaCard
            titulo="Vacaciones del sector"
            vacio="No hay vacaciones aprobadas próximas en tu sector."
            accion={{ etiqueta: 'Ver calendario', href: '/ausencias' }}
          >
            {proximasVacacionesSector.length > 0 &&
              proximasVacacionesSector.map((a) => (
                <ListaItem
                  key={a.id}
                  href="/ausencias"
                  icono={IconBeach}
                  principal={nombreEmpleado(a.empleadoId)}
                  secundario={`${formatearFecha(a.fechaDesde)} al ${formatearFecha(a.fechaHasta)} · ${a.dias} días`}
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

      {/* Sólo aparece si hay algo que corregir: es un pendiente con
          fecha de vencimiento real (la liquidación), no un indicador
          que convenga tener siempre a la vista diciendo cero. */}
      {!esEmpleado && incompletas.length > 0 && (
        <ListaCard
          titulo={`Jornadas sin cerrar · ${incompletas.length}`}
          accion={{ etiqueta: 'Corregir en Fichaje', href: '/fichaje' }}
        >
          {incompletas.slice(0, 5).map((j) => (
            <ListaItem
              key={`${j.empleadoId}-${j.fecha}-${j.entrada ?? ''}`}
              href="/fichaje"
              icono={IconClockExclamation}
              principal={nombreEmpleado(j.empleadoId)}
              secundario={
                j.entrada
                  ? `Entrada ${horaLocal(j.entrada)}, sin salida`
                  : 'Salida sin entrada'
              }
              extremo={
                <span className="shrink-0 text-xs font-semibold text-peach">
                  {formatearFecha(j.fecha)}
                </span>
              }
            />
          ))}
        </ListaCard>
      )}

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
