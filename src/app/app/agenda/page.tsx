'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  Icon,
  IconAlertTriangle,
  IconCake,
  IconCalendarEvent,
  IconPlus,
  IconSchool,
} from '@tabler/icons-react';
import { Modal } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useAuth } from '@/lib/auth/AuthProvider';
import { ListaCard, ListaItem } from '@/components/app/dashboard/ListaCard';
import { Panel } from '@/components/app/Panel';
import { MiniCalendario } from '@/components/app/agenda/MiniCalendario';
import { Boton } from '@/components/app/ui/Boton';
import { CampoSelect } from '@/components/app/ui/Campo';
import { CampoFecha } from '@/components/app/ui/CampoFecha';
import { aOpciones, Selector } from '@/components/app/ui/Selector';
import { formatearFecha, hoyISO } from '@/lib/fechas';
import { crearEvento, getEventosProximos } from '@/lib/services/rrhh';
import { EventoAgenda, TipoEvento } from '@/types/rrhh';

const tipoEventoLabels: Record<TipoEvento, string> = {
  evento: 'Evento',
  capacitacion: 'Capacitación',
  cumpleanios: 'Cumpleaños',
  vencimiento: 'Vencimiento',
};

const tipoEventoIconos: Record<TipoEvento, Icon> = {
  evento: IconCalendarEvent,
  capacitacion: IconSchool,
  cumpleanios: IconCake,
  vencimiento: IconAlertTriangle,
};

const campoClase =
  'w-full rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink outline-none transition-colors placeholder:text-ink-soft/50 focus:border-brand-600';

const AgendaPage = () => {
  const { usuario, rolEfectivo } = useAuth();
  const puedeCrear =
    rolEfectivo === 'admin_rrhh' || rolEfectivo === 'supervisor';

  const [eventos, setEventos] = useState<EventoAgenda[]>([]);
  const [filtro, setFiltro] = useState<TipoEvento | ''>('');
  const [diaSeleccionado, setDiaSeleccionado] = useState<string | null>(null);
  const [modalAbierto, { open, close }] = useDisclosure(false);
  const [titulo, setTitulo] = useState('');
  const [tipo, setTipo] = useState<TipoEvento>('evento');
  const [fecha, setFecha] = useState(hoyISO());
  const [descripcion, setDescripcion] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    void getEventosProximos().then(setEventos);
  }, []);

  useEffect(cargar, [cargar]);

  if (!usuario) return null;

  const visibles = eventos.filter((e) => {
    if (filtro && e.tipo !== filtro) return false;
    if (diaSeleccionado && e.fecha !== diaSeleccionado) return false;
    return true;
  });
  const fechasConEventos = new Set(eventos.map((e) => e.fecha));

  const crear = async (e: FormEvent) => {
    e.preventDefault();
    if (!titulo.trim()) {
      setError('El título es obligatorio.');
      return;
    }
    setError(null);
    setEnviando(true);
    await crearEvento({
      titulo,
      tipo,
      fecha,
      descripcion: descripcion.trim() || undefined,
    });
    setEnviando(false);
    setTitulo('');
    setDescripcion('');
    close();
    cargar();
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Agenda</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Eventos, capacitaciones, cumpleaños y vencimientos.
          </p>
        </div>
        {puedeCrear && (
          <Boton variante="negro" onClick={open}>
            <IconPlus size={18} />
            Nuevo evento
          </Boton>
        )}
      </div>

      <Selector
        valor={filtro}
        onCambiar={(v) => setFiltro(v as TipoEvento | '')}
        className="self-start"
        opciones={[
          { valor: '', etiqueta: 'Todo' },
          ...aOpciones(tipoEventoLabels),
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_1fr]">
        <Panel className="h-fit">
          <MiniCalendario
            fechasConEventos={fechasConEventos}
            seleccionada={diaSeleccionado}
            onSeleccionar={setDiaSeleccionado}
          />
        </Panel>

        <ListaCard
          titulo={diaSeleccionado ? 'Eventos del día' : 'Próximos'}
          vacio={
            diaSeleccionado
              ? 'No hay eventos ese día.'
              : 'Nada agendado para lo que viene.'
          }
        >
          {visibles.length > 0 &&
            visibles.map((e) => (
              <ListaItem
                key={e.id}
                onClick={() =>
                  setDiaSeleccionado(
                    diaSeleccionado === e.fecha ? null : e.fecha
                  )
                }
                icono={tipoEventoIconos[e.tipo]}
                principal={e.titulo}
                secundario={e.descripcion ?? tipoEventoLabels[e.tipo]}
                extremo={
                  <span className="shrink-0 rounded-full bg-paper px-2.5 py-1 text-xs font-bold text-ink">
                    {formatearFecha(e.fecha)}
                  </span>
                }
              />
            ))}
        </ListaCard>
      </div>

      <Modal
        opened={modalAbierto}
        onClose={close}
        title="Nuevo evento"
        radius="lg"
        centered
        styles={{ title: { fontWeight: 800 } }}
      >
        <form onSubmit={crear} className="flex flex-col gap-3.5">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-ink">Título</span>
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Capacitación de seguridad…"
              className={campoClase}
            />
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <CampoSelect
              etiqueta="Tipo"
              value={tipo}
              onChange={(v) => setTipo(v as TipoEvento)}
              opciones={aOpciones(tipoEventoLabels)}
            />
            <CampoFecha etiqueta="Fecha" value={fecha} onChange={setFecha} />
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-ink">
              Descripción (opcional)
            </span>
            <textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={2}
              placeholder="Detalle, horario, lugar…"
              className={campoClase}
            />
          </label>

          {error && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          )}

          <Boton
            type="submit"
            disabled={enviando}
            className="mt-1 py-3 text-base"
          >
            {enviando ? 'Creando…' : 'Crear evento'}
          </Boton>
        </form>
      </Modal>
    </div>
  );
};

export default AgendaPage;
