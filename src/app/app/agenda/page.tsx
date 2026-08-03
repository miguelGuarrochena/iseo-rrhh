'use client';

import { FormEvent, useCallback, useState } from 'react';
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
import { Campo, CampoSelect, CampoTextarea } from '@/components/app/ui/Campo';
import { juntarErrores, validarRequerido } from '@/lib/validaciones';
import { CampoFecha } from '@/components/app/ui/CampoFecha';
import { aOpciones, Selector } from '@/components/app/ui/Selector';
import { formatearFecha, hoyISO } from '@/lib/fechas';
import {
  crearEvento,
  getAlertas,
  getEventosProximos,
} from '@/lib/services/rrhh';
import { Alerta, EventoAgenda, TipoEvento } from '@/types/rrhh';
import { Paginacion, usePaginacion } from '@/components/app/ui/Paginacion';
import { RequireModulo } from '@/components/app/RequireModulo';
import { BloqueError } from '@/components/app/EstadoCarga';
import { useCarga } from '@/lib/useCarga';
import { RequireEmpresa } from '@/components/app/RequireEmpresa';

const POR_PAGINA = 8;

/** Vista unificada: eventos cargados a mano + vencimientos que ya calcula el sistema (contrato, documentos). */
interface ItemAgenda {
  id: string;
  tipo: TipoEvento;
  titulo: string;
  fecha: string;
  descripcion?: string;
  href?: string;
}

const deEvento = (e: EventoAgenda): ItemAgenda => ({
  id: e.id,
  tipo: e.tipo,
  titulo: e.titulo,
  fecha: e.fecha,
  descripcion: e.descripcion,
});

const deAlerta = (a: Alerta): ItemAgenda => ({
  id: a.id,
  tipo: 'vencimiento',
  titulo: a.titulo,
  fecha: a.fecha,
  descripcion: 'Vencimiento automático',
  href: a.empleadoId ? `/colaboradores/${a.empleadoId}` : '/colaboradores',
});

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

const AgendaPage = () => {
  const { usuario, rolEfectivo } = useAuth();
  const puedeCrear =
    rolEfectivo === 'admin_rrhh' || rolEfectivo === 'supervisor';

  const [filtro, setFiltro] = useState<TipoEvento | ''>('');
  const [diaSeleccionado, setDiaSeleccionado] = useState<string | null>(null);
  const [modalAbierto, { open, close }] = useDisclosure(false);
  const [titulo, setTitulo] = useState('');
  const [tipo, setTipo] = useState<TipoEvento>('evento');
  const [fecha, setFecha] = useState(hoyISO());
  const [descripcion, setDescripcion] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});

  const puedeVerAlertas =
    rolEfectivo === 'admin_rrhh' || rolEfectivo === 'supervisor';

  const cargaEventos = useCarga(() => getEventosProximos(), [], {
    contexto: 'agenda/eventos',
    inicial: [] as EventoAgenda[],
  });
  const eventos = cargaEventos.datos;

  // Las alertas (vencimientos que calcula el sistema) sólo las ve quien
  // gestiona; el empleado ve su agenda igual sin ellas.
  const cargaAlertas = useCarga(() => getAlertas(), [puedeVerAlertas], {
    activo: puedeVerAlertas,
    contexto: 'agenda/alertas',
    inicial: [] as Alerta[],
  });
  const alertas = cargaAlertas.datos;

  const cargar = useCallback(() => {
    cargaEventos.recargar();
    cargaAlertas.recargar();
  }, [cargaEventos, cargaAlertas]);

  // Los vencimientos de contrato/documentos ya calculados por el sistema se
  // suman a los eventos cargados a mano, para no vivir en dos pantallas
  // distintas (acá y en el Dashboard).
  const items: ItemAgenda[] = [
    ...eventos.map(deEvento),
    ...alertas.filter((a) => a.estado !== 'resuelta').map(deAlerta),
  ].sort((a, b) => a.fecha.localeCompare(b.fecha));

  const visibles = items.filter((e) => {
    if (filtro && e.tipo !== filtro) return false;
    if (diaSeleccionado && e.fecha !== diaSeleccionado) return false;
    return true;
  });
  const fechasConEventos = new Set(items.map((e) => e.fecha));

  const {
    pagina,
    setPagina,
    totalPaginas,
    visibles: visiblesPagina,
  } = usePaginacion(visibles, POR_PAGINA);

  const crear = async (e: FormEvent) => {
    e.preventDefault();
    const nuevos = juntarErrores({
      titulo: validarRequerido(titulo, 'El título'),
      // Un evento sin fecha no se puede agendar, y el campo se puede
      // vaciar a mano; antes se guardaba con fecha vacía.
      fecha: validarRequerido(fecha, 'La fecha'),
    });
    setErrores(nuevos);
    if (Object.keys(nuevos).length > 0) return;
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

  if (!usuario) return null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
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

      {cargaEventos.fase === 'error' && cargaEventos.error && (
        <BloqueError
          error={cargaEventos.error}
          onReintentar={cargaEventos.recargar}
        />
      )}

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
          cargando={cargaEventos.fase === 'cargando'}
          vacio={
            diaSeleccionado
              ? 'No hay eventos ese día.'
              : 'Nada agendado para lo que viene.'
          }
        >
          {visibles.length > 0 &&
            visiblesPagina.map((e) => (
              <ListaItem
                key={e.id}
                href={e.href}
                onClick={
                  e.href
                    ? undefined
                    : () =>
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
          <Paginacion
            pagina={pagina}
            totalPaginas={totalPaginas}
            onCambiar={setPagina}
          />
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
          <Campo
            etiqueta="Título *"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            error={errores.titulo}
            placeholder="Capacitación de seguridad…"
          />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <CampoSelect
              etiqueta="Tipo"
              value={tipo}
              onChange={(v) => setTipo(v as TipoEvento)}
              opciones={aOpciones(tipoEventoLabels)}
            />
            <CampoFecha
              etiqueta="Fecha *"
              value={fecha}
              onChange={setFecha}
              error={errores.fecha}
            />
          </div>

          <CampoTextarea
            etiqueta="Descripción (opcional)"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            rows={2}
            placeholder="Detalle, horario, lugar…"
          />

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

/** La empresa puede tener esta sección apagada: se bloquea la ruta,
 * no sólo el link del menú. */
const AgendaPageProtegida = () => (
  <RequireEmpresa>
    <RequireModulo modulo="agenda">
      <AgendaPage />
    </RequireModulo>
  </RequireEmpresa>
);

export default AgendaPageProtegida;
