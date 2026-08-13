'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  IconClockCheck,
  IconClockExclamation,
  IconDeviceTablet,
  IconDeviceMobile,
  IconDownload,
  IconFaceId,
  IconFingerprint,
  IconPencilPlus,
  IconUserOff,
} from '@tabler/icons-react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { Panel } from '@/components/app/Panel';
import { StatCard } from '@/components/app/dashboard/StatCard';
import { ListaCard, ListaItem } from '@/components/app/dashboard/ListaCard';
import { Boton } from '@/components/app/ui/Boton';
import { formatearHora, hoyISO } from '@/lib/fechas';
import { descargarCSV } from '@/lib/csv';
import { avisoExito } from '@/lib/avisos';
import {
  getAusencias,
  getEmpleado,
  getEmpleados,
  getFichajesDeEmpleadoHoy,
  getFichajesDeHoy,
  getResumenControl,
  getTerminales,
} from '@/lib/services/rrhh';
import {
  Ausencia,
  Empleado,
  Fichaje,
  MetodoFichaje,
  ModoFichaje,
} from '@/types/rrhh';
import { FichajeFacialModal } from '@/components/app/facial/FichajeFacialModal';
import { FichajeManualModal } from '@/components/app/facial/FichajeManualModal';
import { getTerminalLocal } from '@/lib/terminal';
import { ActivarKioscoModal } from '@/components/app/fichaje/ActivarKioscoModal';
import { HistorialFichadas } from '@/components/app/fichaje/HistorialFichadas';
import { Paginacion, usePaginacion } from '@/components/app/ui/Paginacion';
import { BloqueError } from '@/components/app/EstadoCarga';
import { useCarga } from '@/lib/useCarga';
import { faltasDeEmpleado } from '@/lib/requisitos';
import { BloqueFaltasDeVarios } from '@/components/app/Faltas';
import { RequireModulo } from '@/components/app/RequireModulo';
import { RequireEmpresa } from '@/components/app/RequireEmpresa';

const POR_PAGINA = 8;

const metodoLabel: Record<MetodoFichaje, string> = {
  facial_tablet: 'Reconocimiento facial',
  celular: 'Celular + GPS',
  remoto: 'Remoto',
  manual: 'Carga manual',
};

const PanelFichajePropio = ({
  modo,
  ultimo,
  proximoTipo,
  tieneRostro,
  onFichar,
}: {
  modo: ModoFichaje;
  ultimo?: Fichaje;
  proximoTipo: 'ingreso' | 'egreso';
  tieneRostro: boolean;
  onFichar: () => void;
}) => {
  const modoTexto =
    modo === 'celular' ? 'Celular + GPS' : 'Remoto con reconocimiento facial';

  if (modo === 'planta') {
    return (
      <Panel className="flex flex-col items-center gap-3 py-10 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 text-brand-700">
          <IconDeviceTablet size={32} stroke={1.6} />
        </span>
        <p className="text-base font-bold text-ink">Fichás en la terminal</p>
        <p className="max-w-sm text-sm text-ink-soft">
          Tu fichaje es en planta: acercate a la tablet de la empresa y fichá
          con reconocimiento facial. Desde este dispositivo no se ficha.
        </p>
      </Panel>
    );
  }

  return (
    <Panel className="flex flex-col items-center gap-4 py-10 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 text-brand-700">
        <IconFingerprint size={32} stroke={1.6} />
      </span>
      {ultimo ? (
        <p className="text-sm text-ink-soft">
          Último movimiento:{' '}
          <strong className="text-ink">
            {ultimo.tipo === 'ingreso' ? 'Ingreso' : 'Egreso'} a las{' '}
            {formatearHora(ultimo.timestamp)}
          </strong>
        </p>
      ) : (
        <p className="text-sm text-ink-soft">Todavía no fichaste hoy.</p>
      )}
      {tieneRostro ? (
        <>
          <div className="grid w-full max-w-md grid-cols-2 gap-3 text-left">
            <div className="rounded-2xl bg-paper px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-widest text-ink-soft">
                Próximo fichaje
              </p>
              <p className="mt-1 text-sm font-bold text-ink">
                {proximoTipo === 'ingreso' ? 'Ingreso' : 'Egreso'}
              </p>
            </div>
            <div className="rounded-2xl bg-paper px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-widest text-ink-soft">
                Método
              </p>
              <p className="mt-1 text-sm font-bold text-ink">{modoTexto}</p>
            </div>
          </div>
          <Boton
            variante="negro"
            onClick={onFichar}
            className="px-8 py-3.5 text-base"
          >
            <IconFaceId size={18} />
            {proximoTipo === 'ingreso' ? 'Fichar ingreso' : 'Fichar egreso'}
          </Boton>
          <p className="max-w-sm text-xs text-ink-soft">
            {modo === 'celular'
              ? 'Confirmás tu identidad con la cara y validamos que estés en tu zona de trabajo.'
              : 'Confirmás tu identidad con la cara. Podés fichar desde cualquier lugar.'}
          </p>
        </>
      ) : (
        <p className="max-w-sm text-sm text-ink-soft">
          Para fichar necesitás tener tu rostro registrado. Pedíselo a RRHH
          desde tu ficha.
        </p>
      )}
    </Panel>
  );
};

const FichajePage = () => {
  const { usuario, rolEfectivo } = useAuth();
  const esEmpleado = rolEfectivo === 'empleado';

  const [facialAbierto, setFacialAbierto] = useState(false);
  const [kioscoAbierto, setKioscoAbierto] = useState(false);
  const [manualAbierto, setManualAbierto] = useState(false);
  const [esTerminal, setEsTerminal] = useState(false);

  const miId = usuario?.empleadoId;
  const vistaEquipo = Boolean(usuario) && !esEmpleado;

  const cMisFichajes = useCarga(() => getFichajesDeEmpleadoHoy(miId!), [miId], {
    activo: Boolean(miId),
    contexto: 'fichaje/mios',
    inicial: [] as Fichaje[],
  });
  const misFichajes = cMisFichajes.datos;

  const cMiEmpleado = useCarga(() => getEmpleado(miId!), [miId], {
    activo: Boolean(miId),
    contexto: 'fichaje/mi-ficha',
  });
  const miEmpleado = cMiEmpleado.datos ?? null;

  const cFichajesHoy = useCarga(() => getFichajesDeHoy(), [vistaEquipo], {
    activo: vistaEquipo,
    contexto: 'fichaje/hoy',
    inicial: [] as Fichaje[],
  });
  const fichajesHoy = cFichajesHoy.datos;

  const cEmpleados = useCarga(() => getEmpleados(), [vistaEquipo], {
    activo: vistaEquipo,
    contexto: 'fichaje/empleados',
    inicial: [] as Empleado[],
  });
  const empleados = cEmpleados.datos;

  const cAusencias = useCarga(() => getAusencias(), [vistaEquipo], {
    activo: vistaEquipo,
    contexto: 'fichaje/ausencias',
    inicial: [] as Ausencia[],
  });
  const ausenciasHoy = cAusencias.datos;

  const cargar = useCallback(() => {
    cMisFichajes.recargar();
    cMiEmpleado.recargar();
    cFichajesHoy.recargar();
    cEmpleados.recargar();
    cAusencias.recargar();
  }, [cMisFichajes, cMiEmpleado, cFichajesHoy, cEmpleados, cAusencias]);

  // Verifica si ESTE dispositivo está autorizado como terminal de planta.
  useEffect(() => {
    if (esEmpleado) return;
    const localId = getTerminalLocal();
    if (!localId) {
      setEsTerminal(false);
      return;
    }
    void getTerminales()
      .then((ts) => setEsTerminal(ts.some((t) => t.id === localId)))
      .catch(() => setEsTerminal(false));
  }, [esEmpleado]);

  const ultimo = misFichajes[misFichajes.length - 1];
  const proximoTipo = ultimo?.tipo === 'ingreso' ? 'egreso' : 'ingreso';
  const tieneRostro = Boolean(miEmpleado?.descriptorFacial?.length);
  const modoEmp: ModoFichaje = miEmpleado?.modoFichaje ?? 'celular';

  const trasFichar = (marca: Fichaje) => {
    avisoExito(
      marca.tipo === 'ingreso' ? 'Ingreso registrado' : 'Egreso registrado',
      `A las ${formatearHora(marca.timestamp)}.`
    );
    cargar();
  };

  const exportarNovedades = async () => {
    const resumen = await getResumenControl();
    descargarCSV('novedades-liquidacion.csv', [
      [
        'Empleado',
        'Llegadas tarde',
        'Minutos tarde',
        'Horas extras',
        'Fichajes incompletos',
      ],
      ...resumen.porEmpleado.map((e) => [
        e.nombreCompleto,
        String(e.llegadasTarde),
        String(e.minutosTarde),
        String(e.horasExtras),
        String(e.jornadasIncompletas),
      ]),
    ]);
  };

  const nombreEmpleado = (id: string): string => {
    const e = empleados.find((x) => x.id === id);
    return e ? `${e.nombre} ${e.apellido}` : '—';
  };

  const idsQueFicharon = new Set(fichajesHoy.map((f) => f.empleadoId));
  const hoy = hoyISO();
  const licenciaDe = (empleadoId: string) =>
    ausenciasHoy.find(
      (a) =>
        a.empleadoId === empleadoId &&
        a.estado === 'aprobada' &&
        a.fechaDesde <= hoy &&
        hoy <= a.fechaHasta
    );
  // "Sin fichar" mezclaba a quien realmente faltó con quien está de
  // vacaciones/licencia aprobada ese día: eso hacía parecer un problema de
  // presentismo donde en realidad no hay nada que reclamar.
  const sinFicharTodos = empleados.filter((e) => !idsQueFicharon.has(e.id));
  const sinFichar = sinFicharTodos.filter((e) => !licenciaDe(e.id));
  const deLicenciaHoy = sinFicharTodos.filter((e) => licenciaDe(e.id));

  const paginaFichajes = usePaginacion(fichajesHoy, POR_PAGINA);
  const paginaSinFichar = usePaginacion(sinFichar, POR_PAGINA);

  if (!usuario) return null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            Fichaje
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            {esEmpleado
              ? 'Registrá tu ingreso y egreso desde el celular.'
              : 'El presentismo de hoy, en vivo.'}
          </p>
        </div>
        {!esEmpleado && (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            {esTerminal && (
              <Boton variante="negro" onClick={() => setKioscoAbierto(true)}>
                <IconFaceId size={18} />
                Modo planta
              </Boton>
            )}
            <Boton variante="secundario" onClick={() => setManualAbierto(true)}>
              <IconPencilPlus size={18} />
              Cargar a mano
            </Boton>
            <Boton
              variante="secundario"
              onClick={() => void exportarNovedades()}
            >
              <IconDownload size={18} />
              Novedades de la semana
            </Boton>
          </div>
        )}
      </div>

      {!esEmpleado && !esTerminal && (
        <div className="flex flex-col gap-2 rounded-2xl border border-line bg-paper px-4 py-3.5 text-sm text-ink-soft">
          <p className="flex items-center gap-2 font-semibold text-ink">
            <IconDeviceTablet size={16} className="shrink-0" />
            Para dejar esta tablet fichando
          </p>
          <ol className="ml-6 list-decimal text-xs leading-relaxed">
            <li>Autorizala en Configuración, Terminales de fichaje.</li>
            <li>Volvé acá y tocá Modo planta. Elegí un PIN y anotalo.</li>
            <li>
              Si la tablet falla, usá &quot;Cargar a mano&quot; como respaldo.
            </li>
          </ol>
        </div>
      )}

      {!esEmpleado && esTerminal && (
        <p className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          <IconDeviceTablet size={16} className="shrink-0" />
          Esta tablet ya está autorizada. Tocá Modo planta para dejarla
          fichando.
        </p>
      )}

      {usuario.empleadoId && (
        <PanelFichajePropio
          modo={modoEmp}
          ultimo={ultimo}
          proximoTipo={proximoTipo}
          tieneRostro={tieneRostro}
          onFichar={() => setFacialAbierto(true)}
        />
      )}

      {miEmpleado && (
        <FichajeFacialModal
          abierto={facialAbierto}
          onCerrar={() => setFacialAbierto(false)}
          modo="verificar"
          empleadoId={miEmpleado.id}
          metodoRegistro={modoEmp === 'remoto' ? 'remoto' : 'celular'}
          pedirUbicacion={modoEmp === 'celular'}
          onFichado={(marca) => trasFichar(marca)}
        />
      )}

      {!esEmpleado && (
        <ActivarKioscoModal
          abierto={kioscoAbierto}
          onCerrar={() => setKioscoAbierto(false)}
        />
      )}

      {!esEmpleado && (
        <FichajeManualModal
          abierto={manualAbierto}
          onCerrar={() => setManualAbierto(false)}
          empleados={empleados}
          registradoPor={usuario.nombreCompleto ?? 'RRHH'}
          onFichado={() => {
            avisoExito('Fichaje manual cargado');
            cargar();
          }}
        />
      )}

      {!esEmpleado && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <StatCard
              etiqueta="Presentes"
              valor={`${idsQueFicharon.size}/${empleados.length || '—'}`}
              detalle="ficharon hoy"
              icono={IconClockCheck}
            />
            <StatCard
              etiqueta="Sin fichar"
              valor={sinFichar.length}
              detalle="todavía no registraron"
              icono={IconUserOff}
            />
            <StatCard
              etiqueta="Movimientos"
              valor={fichajesHoy.length}
              detalle="registrados hoy"
              icono={IconClockExclamation}
            />
          </div>

          {cFichajesHoy.fase === 'error' && cFichajesHoy.error && (
            <BloqueError
              error={cFichajesHoy.error}
              onReintentar={cFichajesHoy.recargar}
            />
          )}

          {/* Explica una parte del "sin fichar": si la terminal no
              reconoce a alguien porque nunca se le enroló el rostro, no
              es que faltó. */}
          <BloqueFaltasDeVarios
            items={empleados.map((e) => ({
              nombre: `${e.nombre} ${e.apellido}`,
              faltas: faltasDeEmpleado(e, {}, 'fichaje'),
            }))}
            titulo="Hay gente que todavía no puede fichar"
          />

          <div className="grid gap-4 lg:grid-cols-2">
            <ListaCard
              titulo="Fichajes de hoy"
              cargando={cFichajesHoy.fase === 'cargando'}
              vacio="Sin fichajes todavía."
            >
              {fichajesHoy.length > 0 &&
                paginaFichajes.visibles.map((f) => (
                  <ListaItem
                    key={f.id}
                    href={`/colaboradores/${f.empleadoId}`}
                    icono={
                      f.metodo === 'facial_tablet'
                        ? IconDeviceTablet
                        : f.metodo === 'manual'
                          ? IconPencilPlus
                          : IconDeviceMobile
                    }
                    principal={nombreEmpleado(f.empleadoId)}
                    secundario={`${f.tipo === 'ingreso' ? 'Ingreso' : 'Egreso'} · ${metodoLabel[f.metodo]}${
                      f.confianza != null
                        ? ` · ${Math.round(f.confianza * 100)}% de confianza`
                        : ''
                    }${f.registradoPor ? ` · por ${f.registradoPor}` : ''}`}
                    extremo={
                      <span className="flex shrink-0 items-center gap-2">
                        {f.fueraDeZona && (
                          <span
                            title="Fichó fuera de la zona de trabajo"
                            className="rounded-full bg-red-100 px-2 py-0.5 text-[0.65rem] font-bold text-red-700"
                          >
                            Fuera de zona
                          </span>
                        )}
                        <span className="text-sm font-bold text-ink">
                          {formatearHora(f.timestamp)}
                        </span>
                      </span>
                    }
                  />
                ))}
              <Paginacion
                pagina={paginaFichajes.pagina}
                totalPaginas={paginaFichajes.totalPaginas}
                onCambiar={paginaFichajes.setPagina}
              />
            </ListaCard>

            <ListaCard
              titulo="Sin fichar hoy"
              vacio="Todos ficharon o están de licencia. Equipo al día."
            >
              {sinFichar.length > 0 &&
                paginaSinFichar.visibles.map((e) => (
                  <ListaItem
                    key={e.id}
                    href={`/colaboradores/${e.id}`}
                    icono={IconUserOff}
                    principal={`${e.nombre} ${e.apellido}`}
                    secundario={`${e.puesto} · ${e.sector}`}
                  />
                ))}
              <Paginacion
                pagina={paginaSinFichar.pagina}
                totalPaginas={paginaSinFichar.totalPaginas}
                onCambiar={paginaSinFichar.setPagina}
              />
              {deLicenciaHoy.length > 0 && (
                <div className="border-t border-line px-4 py-3">
                  <p className="text-xs font-semibold text-ink-soft">
                    {deLicenciaHoy.length}{' '}
                    {deLicenciaHoy.length === 1
                      ? 'colaborador de licencia hoy (no cuenta como ausente)'
                      : 'colaboradores de licencia hoy (no cuentan como ausentes)'}
                    : {deLicenciaHoy.map((e) => e.nombre).join(', ')}.
                  </p>
                </div>
              )}
            </ListaCard>
          </div>

          {/* Ver hacia atrás con filtros y bajar el Excel. Va debajo del
              hoy y no en otra ruta: es la misma pregunta ("quién fichó y
              cuándo"), solo que con otro rango. */}
          <HistorialFichadas />
        </>
      )}
    </div>
  );
};

/** La empresa puede tener esta sección apagada: se bloquea la ruta,
 * no sólo el link del menú. */
const FichajePageProtegida = () => (
  <RequireEmpresa>
    <RequireModulo modulo="fichaje">
      <FichajePage />
    </RequireModulo>
  </RequireEmpresa>
);

export default FichajePageProtegida;
