'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconProgressCheck,
} from '@tabler/icons-react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { Panel } from '@/components/app/Panel';
import { StatCard } from '@/components/app/dashboard/StatCard';
import { BloqueError } from '@/components/app/EstadoCarga';
import { RequireEmpresa } from '@/components/app/RequireEmpresa';
import {
  SelectorVistaEstado,
  VistasPendientes,
  type VistaEstado,
} from '@/components/app/estado/VistasPendientes';
import { useCarga } from '@/lib/useCarga';
import { useModulos } from '@/lib/auth/useModulos';
import { calcularEstadoRrhh, situacionesPrioritarias } from '@/lib/estadoRrhh';
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
 * bien?, ¿qué requiere atención?, ¿cómo está cada área? y ¿qué puedo
 * solucionar ahora? Por eso lo primero es una sola frase, después los
 * números, y el cuerpo es una vista u otra: el mapa por área (la
 * entrada, porque esta pantalla se llama Estado) o la lista para ir a
 * resolver. El selector vive junto al título, como en Fichaje. El
 * detalle de un área se abre aparte.
 */
const EstadoRrhhPage = () => {
  const { rolEfectivo } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const esAdmin = rolEfectivo === 'admin_rrhh';
  const modulos = useModulos();
  const vista: VistaEstado =
    searchParams.get('ver') === 'resolver' ? 'resolver' : 'area';
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

  const elegirVista = (siguiente: VistaEstado) => {
    const params = new URLSearchParams(searchParams.toString());
    if (siguiente === 'area') params.delete('ver');
    else params.set('ver', 'resolver');
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  };

  const hrefResolver = `${pathname}?ver=resolver`;

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
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[1.75rem]">
              Estado de RRHH
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-soft">
              Qué tan completa está la gestión de tu equipo y qué conviene
              resolver primero. Todo lo que ves acá sale de los datos que ya
              están cargados: no hay nada que completar en esta pantalla.
            </p>
          </div>
          {cEmpleados.fase !== 'error' && !cargando && estado.evaluados > 0 && (
            <SelectorVistaEstado
              vista={vista}
              onElegir={elegirVista}
              pendientes={prioritarias.length}
            />
          )}
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
                href={prioritarias.length > 0 ? hrefResolver : undefined}
              />
              <StatCard
                etiqueta="Frenan a alguien"
                valor={estado.bloqueantes}
                detalle={
                  estado.bloqueantes > 0 ? 'resolver primero' : 'nada bloqueado'
                }
                href={estado.bloqueantes > 0 ? hrefResolver : undefined}
              />
            </div>

            <VistasPendientes
              vista={vista}
              estado={estado}
              prioritarias={prioritarias}
            />
          </>
        )}
      </div>
    </RequireEmpresa>
  );
};

export default EstadoRrhhPage;
