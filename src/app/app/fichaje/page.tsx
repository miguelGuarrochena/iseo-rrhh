'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  IconClockCheck,
  IconClockExclamation,
  IconDeviceTablet,
  IconDeviceMobile,
  IconDownload,
  IconFingerprint,
  IconUserOff,
} from '@tabler/icons-react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { Panel } from '@/components/app/Panel';
import { StatCard } from '@/components/app/dashboard/StatCard';
import { ListaCard, ListaItem } from '@/components/app/dashboard/ListaCard';
import { Boton } from '@/components/app/ui/Boton';
import { formatearHora } from '@/lib/fechas';
import {
  ficharAhora,
  getEmpleados,
  getFichajesDeEmpleadoHoy,
  getFichajesDeHoy,
  getResumenControl,
} from '@/lib/services/rrhh';
import { Empleado, Fichaje } from '@/types/rrhh';

const metodoLabel = {
  facial_tablet: 'Reconocimiento facial',
  celular: 'Celular',
} as const;

const descargarCSV = (nombre: string, filas: string[][]) => {
  const csv = filas.map((f) => f.map((c) => `"${c}"`).join(';')).join('\n');
  const url = URL.createObjectURL(
    new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' })
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
};

const FichajePage = () => {
  const { usuario, rolEfectivo } = useAuth();
  const esEmpleado = rolEfectivo === 'empleado';

  const [misFichajes, setMisFichajes] = useState<Fichaje[]>([]);
  const [fichajesHoy, setFichajesHoy] = useState<Fichaje[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [fichando, setFichando] = useState(false);

  const cargar = useCallback(() => {
    if (!usuario) return;
    if (usuario.empleadoId) {
      void getFichajesDeEmpleadoHoy(usuario.empleadoId).then(setMisFichajes);
    }
    if (!esEmpleado) {
      void getFichajesDeHoy().then(setFichajesHoy);
      void getEmpleados().then(setEmpleados);
    }
  }, [usuario, esEmpleado]);

  useEffect(cargar, [cargar]);

  if (!usuario) return null;

  const ultimo = misFichajes[misFichajes.length - 1];
  const proximoTipo = ultimo?.tipo === 'ingreso' ? 'egreso' : 'ingreso';

  const fichar = async () => {
    if (!usuario.empleadoId) return;
    setFichando(true);
    await ficharAhora(usuario.empleadoId);
    setFichando(false);
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
          <Boton variante="secundario" onClick={() => void exportarNovedades()}>
            <IconDownload size={18} />
            Exportar novedades
          </Boton>
        )}
      </div>

      {usuario.empleadoId && (
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
          <Boton
            variante="negro"
            onClick={() => void fichar()}
            disabled={fichando}
            className="px-8 py-3.5 text-base"
          >
            {fichando
              ? 'Registrando…'
              : proximoTipo === 'ingreso'
                ? 'Fichar ingreso'
                : 'Fichar egreso'}
          </Boton>
          <p className="text-xs text-ink-soft">
            Se registra la hora y tu ubicación aproximada.
          </p>
        </Panel>
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
                    href={`/app/colaboradores/${f.empleadoId}`}
                    icono={
                      f.metodo === 'facial_tablet'
                        ? IconDeviceTablet
                        : IconDeviceMobile
                    }
                    principal={nombreEmpleado(f.empleadoId)}
                    secundario={`${f.tipo === 'ingreso' ? 'Ingreso' : 'Egreso'} · ${metodoLabel[f.metodo]}`}
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
                    href={`/app/colaboradores/${e.id}`}
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
