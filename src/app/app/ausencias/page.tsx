'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { tipoAusenciaIconos, tipoAusenciaLabels } from '@/lib/etiquetas';
import {
  crearAusencia,
  getAusencias,
  getAusenciasDeEmpleado,
  getEmpleados,
  getSaldoVacaciones,
  resolverAusencia,
} from '@/lib/services/rrhh';
import {
  Ausencia,
  Empleado,
  SaldoVacaciones,
  TipoAusencia,
} from '@/types/rrhh';

const ANIO_ACTUAL = new Date().getFullYear();
const POR_PAGINA = 5;

const rangoDe = (a: Ausencia): string =>
  `${formatearFecha(a.fechaDesde)} al ${formatearFecha(a.fechaHasta)} · ${a.dias} días`;

const AusenciasPage = () => {
  const { usuario, rolEfectivo } = useAuth();
  const esEmpleado = rolEfectivo === 'empleado';

  const [saldo, setSaldo] = useState<SaldoVacaciones | null>(null);
  const [ausencias, setAusencias] = useState<Ausencia[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [filtroTipo, setFiltroTipo] = useState<TipoAusencia | ''>('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroEmpleado, setFiltroEmpleado] = useState('');
  const [pagina, setPagina] = useState(1);
  const [modalAbierto, { open, close }] = useDisclosure(false);

  const cargar = useCallback(() => {
    if (!usuario) return;
    if (esEmpleado && usuario.empleadoId) {
      void getAusenciasDeEmpleado(usuario.empleadoId).then(setAusencias);
      void getSaldoVacaciones(usuario.empleadoId, ANIO_ACTUAL).then(setSaldo);
    } else {
      void getAusencias().then(setAusencias);
      void getEmpleados().then(setEmpleados);
    }
  }, [usuario, esEmpleado]);

  useEffect(cargar, [cargar]);

  // Permite llegar filtrado desde otras pantallas: /app/ausencias?empleado=ple-2
  useEffect(() => {
    const desdeUrl = new URLSearchParams(window.location.search).get(
      'empleado'
    );
    if (desdeUrl) setFiltroEmpleado(desdeUrl);
  }, []);

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

  if (!usuario) return null;

  const nombreEmpleado = (id: string): string => {
    const e = empleados.find((x) => x.id === id);
    return e ? `${e.nombre} ${e.apellido}` : '—';
  };

  const crear = async (datos: {
    tipo: TipoAusencia;
    fechaDesde: string;
    fechaHasta: string;
    comentario?: string;
  }) => {
    if (!usuario.empleadoId) return;
    await crearAusencia({ empleadoId: usuario.empleadoId, ...datos });
    close();
    cargar();
  };

  const resolver = async (id: string, estado: 'aprobada' | 'rechazada') => {
    await resolverAusencia(id, estado, usuario.empleadoId ?? usuario.id);
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
            onCambiar={setFiltroEmpleado}
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

      <ListaCard
        titulo={
          esEmpleado ? 'Solicitudes en curso' : 'Pendientes de aprobación'
        }
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
              href={
                esEmpleado ? undefined : `/app/colaboradores/${a.empleadoId}`
              }
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

      <ListaCard titulo="Historial" vacio="Sin movimientos anteriores.">
        {resueltasVisibles.length > 0 &&
          resueltasVisibles.map((a) => (
            <ListaItem
              key={a.id}
              href={
                esEmpleado ? undefined : `/app/colaboradores/${a.empleadoId}`
              }
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
      />
    </div>
  );
};

export default AusenciasPage;
