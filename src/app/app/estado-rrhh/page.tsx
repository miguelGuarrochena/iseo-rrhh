'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  IconAlertTriangle,
  IconArrowNarrowRight,
  IconCircleCheck,
  IconProgressCheck,
} from '@tabler/icons-react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { Panel } from '@/components/app/Panel';
import { StatCard } from '@/components/app/dashboard/StatCard';
import { BloqueError } from '@/components/app/EstadoCarga';
import { RequireEmpresa } from '@/components/app/RequireEmpresa';
import { TarjetaArea } from '@/components/app/estado/TarjetaArea';
import { DetalleAreaDrawer } from '@/components/app/estado/DetalleAreaDrawer';
import { useCarga } from '@/lib/useCarga';
import { useModulos } from '@/lib/auth/useModulos';
import {
  calcularEstadoRrhh,
  ClaveArea,
  situacionesPrioritarias,
} from '@/lib/estadoRrhh';
import {
  getEmpleadosConCuenta,
  getEmpleadosTodos,
  getEmpresa,
  getEmpleadosConSueldo,
} from '@/lib/services/rrhh';
import { Empleado } from '@/types/rrhh';

/**
 * Estado de RRHH.
 *
 * No hay ni una regla nueva acá: todo lo que se muestra sale de
 * `requisitos.ts`, que es lo que ya decide qué falta, con qué severidad
 * y cómo se arregla. `estadoRrhh.ts` lo agrupa por área y saca los
 * números; esta pantalla sólo los dibuja.
 *
 * Está pensada para responder cuatro preguntas en ese orden: ¿está todo
 * bien?, ¿qué requiere atención?, ¿qué es urgente? y ¿qué puedo
 * solucionar ahora? Por eso lo primero es una sola frase, después lo
 * urgente, después las áreas, y el detalle se abre aparte.
 */
const EstadoRrhhPage = () => {
  const { rolEfectivo } = useAuth();
  const esAdmin = rolEfectivo === 'admin_rrhh';
  const modulos = useModulos();
  const [abierta, setAbierta] = useState<ClaveArea | null>(null);

  const cEmpleados = useCarga(() => getEmpleadosTodos(), [], {
    activo: esAdmin,
    contexto: 'estado-rrhh/empleados',
    inicial: [] as Empleado[],
  });
  const cEmpresa = useCarga(() => getEmpresa(), [], {
    activo: esAdmin,
    contexto: 'estado-rrhh/empresa',
  });
  const cCuentas = useCarga(() => getEmpleadosConCuenta(), [], {
    activo: esAdmin,
    contexto: 'estado-rrhh/cuentas',
    inicial: [] as string[],
  });
  /*
   * Sólo los ids de quienes tienen algún sueldo cargado: es lo único que
   * mira la regla `sin_sueldo`. Traer la remuneración entera de cada mes
   * de cada persona para quedarse con eso era bajarse el histórico
   * salarial completo en cada carga de la pantalla.
   */
  const cSueldos = useCarga(() => getEmpleadosConSueldo(), [], {
    activo: esAdmin,
    contexto: 'estado-rrhh/sueldos',
    inicial: [] as string[],
  });

  /**
   * Lo que no se pudo consultar viaja como `undefined`, no como conjunto
   * vacío. La diferencia importa: un Set vacío diría "nadie tiene
   * cuenta" y llenaría la pantalla de pendientes inventados.
   */
  const estado = useMemo(
    () =>
      calcularEstadoRrhh({
        empleados: cEmpleados.datos,
        empresa: cEmpresa.datos,
        empleadosConCuenta:
          cCuentas.fase === 'ok' ? new Set(cCuentas.datos) : undefined,
        empleadosConSueldo:
          cSueldos.fase === 'ok' ? new Set(cSueldos.datos) : undefined,
        modulos,
      }),
    [
      cEmpleados.datos,
      cEmpresa.datos,
      cCuentas.datos,
      cCuentas.fase,
      cSueldos.datos,
      cSueldos.fase,
      modulos,
    ]
  );

  const prioritarias = useMemo(() => situacionesPrioritarias(estado), [estado]);

  const areaAbierta =
    estado.areas.find((a) => a.clave === abierta && a.pendientes > 0) ?? null;

  const cargando =
    cEmpleados.fase === 'cargando' || cEmpresa.fase === 'cargando';

  if (!esAdmin) {
    return (
      <p className="text-sm text-ink-soft">
        El estado de RRHH lo ve quien administra Recursos Humanos en la empresa.
      </p>
    );
  }

  const resumen = {
    bien: {
      titulo: 'Está todo en orden',
      texto:
        'No falta ningún dato de los que el sistema controla. Nada te está frenando.',
      clase: 'border-emerald-200 bg-emerald-50',
      icono: 'bg-emerald-100 text-emerald-700',
      Icono: IconCircleCheck,
    },
    atencion: {
      titulo:
        estado.personasConPendientes === 1
          ? 'A 1 persona le falta algo'
          : `A ${estado.personasConPendientes} personas les falta algo`,
      texto:
        'Se puede seguir trabajando. Conviene completar estos datos para que todo funcione como corresponde.',
      clase: 'border-brand-200 bg-paper',
      icono: 'bg-brand-100 text-brand-700',
      Icono: IconProgressCheck,
    },
    urgente: {
      titulo:
        estado.bloqueantes === 1
          ? 'Hay 1 situación que frena a alguien'
          : `Hay ${estado.bloqueantes} situaciones que frenan a alguien`,
      texto:
        'Hay gente que no puede hacer lo que tendría que poder. Resolvelo antes que el resto.',
      clase: 'border-red-200 bg-red-50',
      icono: 'bg-red-100 text-red-700',
      Icono: IconAlertTriangle,
    },
  }[estado.nivel];

  const IconoResumen = resumen.Icono;

  return (
    <RequireEmpresa>
      <div className="flex flex-col gap-6 sm:gap-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[1.75rem]">
            Estado de RRHH
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-soft">
            Qué tan completa está la gestión de tu equipo y qué conviene
            resolver primero. Todo lo que ves acá sale de los datos que ya están
            cargados: no hay nada que completar en esta pantalla.
          </p>
        </div>

        {cEmpleados.fase === 'error' && cEmpleados.error ? (
          <BloqueError
            error={cEmpleados.error}
            onReintentar={cEmpleados.recargar}
          />
        ) : cargando ? (
          <Panel>
            <p className="text-sm text-ink-soft">Revisando los legajos…</p>
          </Panel>
        ) : estado.evaluados === 0 ? (
          <Panel>
            <p className="text-sm leading-relaxed text-ink-soft">
              Todavía no hay colaboradores activos cargados, así que no hay nada
              que revisar.{' '}
              <Link
                href="/colaboradores/nuevo"
                className="font-bold text-brand-700 no-underline hover:underline"
              >
                Cargá el primero
              </Link>{' '}
              y esta pantalla empieza a decirte qué le falta.
            </p>
          </Panel>
        ) : (
          <>
            {/* ¿Está todo bien? Una sola frase, arriba de todo. */}
            <div
              className={`flex items-start gap-3.5 rounded-3xl border p-5 ${resumen.clase}`}
            >
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${resumen.icono}`}
              >
                <IconoResumen size={21} stroke={2} />
              </span>
              <div className="min-w-0">
                <p className="text-base font-bold text-ink">{resumen.titulo}</p>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-soft">
                  {resumen.texto}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatCard
                etiqueta="Legajos al día"
                valor={
                  estado.cumplimientoPct !== undefined
                    ? `${estado.cumplimientoPct}%`
                    : '—'
                }
                detalle={`${estado.evaluados - estado.personasConPendientes} de ${estado.evaluados} sin pendientes`}
              />
              <StatCard
                etiqueta="Personas con pendientes"
                valor={estado.personasConPendientes}
                detalle="al menos un dato incompleto"
                href="/colaboradores"
              />
              <StatCard
                etiqueta="Pendientes"
                valor={estado.pendientes}
                detalle="datos por completar en total"
              />
              <StatCard
                etiqueta="Frenan a alguien"
                valor={estado.bloqueantes}
                detalle={
                  estado.bloqueantes > 0 ? 'resolver primero' : 'nada bloqueado'
                }
              />
            </div>

            {/* ¿Qué puedo solucionar ahora? */}
            {prioritarias.length > 0 && (
              <Panel
                titulo="Qué resolver primero"
                descripcion="Ordenado por lo que frena y por cuánta gente afecta. Cada línea lleva a la pantalla donde se arregla."
              >
                <ul className="flex list-none flex-col gap-2.5">
                  {prioritarias.map((s) => (
                    <li
                      key={s.falta.clave}
                      className="rounded-2xl border border-line bg-paper px-4 py-3.5"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[0.9375rem] font-bold text-ink">
                          {s.falta.titulo}
                        </p>
                        {s.falta.severidad === 'bloquea' && (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-red-800">
                            Frena
                          </span>
                        )}
                        {s.nombres.length > 0 && (
                          <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-bold text-ink-soft">
                            {s.nombres.length}
                          </span>
                        )}
                      </div>
                      {s.nombres.length > 0 && (
                        <p className="mt-1 text-[0.8125rem] leading-snug text-ink-soft">
                          {s.nombres.slice(0, 3).join(', ')}
                          {s.nombres.length > 3
                            ? ` y ${s.nombres.length - 3} más`
                            : ''}
                        </p>
                      )}
                      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                        {s.falta.detalle}
                      </p>
                      {s.falta.ruta && (
                        <Link
                          href={
                            s.nombres.length > 1
                              ? (s.falta.ruta.split('?')[0] ?? s.falta.ruta)
                              : s.falta.ruta
                          }
                          className="mt-2.5 inline-flex items-start gap-1.5 text-sm font-bold text-brand-700 no-underline underline-offset-4 hover:underline"
                        >
                          <IconArrowNarrowRight
                            size={17}
                            className="mt-0.5 shrink-0"
                          />
                          <span>{s.falta.comoSeArregla}</span>
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </Panel>
            )}

            {/* ¿Qué requiere atención, por área? */}
            <Panel
              titulo="Por área"
              descripcion="El porcentaje es el de los legajos activos sin pendientes en esa área. Sólo se muestran las áreas que tu empresa usa."
            >
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {estado.areas.map((a) => (
                  <TarjetaArea
                    key={a.clave}
                    area={a}
                    abierto={a.clave === abierta}
                    onVerDetalle={
                      a.pendientes > 0 ? () => setAbierta(a.clave) : undefined
                    }
                  />
                ))}
              </div>
            </Panel>

            {/* El detalle va en un panel al costado y no debajo del
                grid: con tres columnas, lo de abajo caía fuera de la
                pantalla y apretar "Ver detalle" no parecía hacer nada. */}
            <DetalleAreaDrawer
              area={areaAbierta}
              onCerrar={() => setAbierta(null)}
            />
          </>
        )}
      </div>
    </RequireEmpresa>
  );
};

export default EstadoRrhhPage;
