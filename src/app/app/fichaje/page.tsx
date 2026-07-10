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
import { formatearHora } from '@/lib/fechas';
import { descargarCSV } from '@/lib/csv';
import { avisoExito } from '@/lib/avisos';
import {
  getEmpleado,
  getEmpleados,
  getFichajesDeEmpleadoHoy,
  getFichajesDeHoy,
  getResumenControl,
  getTerminales,
} from '@/lib/services/rrhh';
import { Empleado, Fichaje, MetodoFichaje, ModoFichaje } from '@/types/rrhh';
import { FichajeFacialModal } from '@/components/app/facial/FichajeFacialModal';
import { FichajeManualModal } from '@/components/app/facial/FichajeManualModal';
import { getTerminalLocal } from '@/lib/terminal';
import { ActivarKioscoModal } from '@/components/app/fichaje/ActivarKioscoModal';

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

  const [misFichajes, setMisFichajes] = useState<Fichaje[]>([]);
  const [fichajesHoy, setFichajesHoy] = useState<Fichaje[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [miEmpleado, setMiEmpleado] = useState<Empleado | null>(null);
  const [facialAbierto, setFacialAbierto] = useState(false);
  const [kioscoAbierto, setKioscoAbierto] = useState(false);
  const [manualAbierto, setManualAbierto] = useState(false);
  const [esTerminal, setEsTerminal] = useState(false);

  const cargar = useCallback(() => {
    if (!usuario) return;
    if (usuario.empleadoId) {
      void getFichajesDeEmpleadoHoy(usuario.empleadoId).then(setMisFichajes);
      void getEmpleado(usuario.empleadoId).then(setMiEmpleado);
    }
    if (!esEmpleado) {
      void getFichajesDeHoy().then(setFichajesHoy);
      void getEmpleados().then(setEmpleados);
    }
  }, [usuario, esEmpleado]);

  useEffect(cargar, [cargar]);

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

  if (!usuario) return null;

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
  const sinFichar = empleados.filter((e) => !idsQueFicharon.has(e.id));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
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
          <div className="flex flex-wrap gap-2">
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
              Exportar novedades
            </Boton>
          </div>
        )}
      </div>

      {!esEmpleado && !esTerminal && (
        <p className="flex items-center gap-2 rounded-xl bg-paper px-4 py-2.5 text-xs text-ink-soft">
          <IconDeviceTablet size={14} className="shrink-0" />
          Para el fichaje en planta (Modo planta), autorizá esta tablet como
          terminal en Configuración → Terminales de fichaje. Si la tablet falla
          o no hay conexión, usá &quot;Cargar a mano&quot; como respaldo.
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
          descriptorEmpleado={miEmpleado.descriptorFacial}
          metodoRegistro={modoEmp === 'remoto' ? 'remoto' : 'celular'}
          pedirUbicacion={modoEmp === 'celular'}
          geocerca={miEmpleado.geocerca}
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
          <div className="grid grid-cols-3 gap-4">
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

          <div className="grid gap-4 lg:grid-cols-2">
            <ListaCard titulo="Fichajes de hoy" vacio="Sin fichajes todavía.">
              {fichajesHoy.length > 0 &&
                fichajesHoy.map((f) => (
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
                      <span className="shrink-0 text-sm font-bold text-ink">
                        {formatearHora(f.timestamp)}
                      </span>
                    }
                  />
                ))}
            </ListaCard>

            <ListaCard
              titulo="Sin fichar hoy"
              vacio="Todos ficharon. Equipo completo."
            >
              {sinFichar.length > 0 &&
                sinFichar.map((e) => (
                  <ListaItem
                    key={e.id}
                    href={`/colaboradores/${e.id}`}
                    icono={IconUserOff}
                    principal={`${e.nombre} ${e.apellido}`}
                    secundario={`${e.puesto} · ${e.sector}`}
                  />
                ))}
            </ListaCard>
          </div>
        </>
      )}
    </div>
  );
};

export default FichajePage;
