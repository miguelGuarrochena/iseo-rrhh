'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  IconArrowLeft,
  IconEdit,
  IconFileText,
  IconPlus,
  IconSearch,
  IconSparkles,
  IconTrash,
} from '@tabler/icons-react';
import { Modal } from '@mantine/core';
import { useAuth } from '@/lib/auth/AuthProvider';
import { Panel } from '@/components/app/Panel';
import { Boton } from '@/components/app/ui/Boton';
import { Campo } from '@/components/app/ui/Campo';
import { avisoError, avisoExito } from '@/lib/avisos';
import {
  actualizarConvenio,
  crearConvenio,
  eliminarConvenio,
  getConvenios,
} from '@/lib/services/rrhh';
import { buscarParrafos } from '@/lib/convenio';
import { iaVisible } from '@/lib/entorno';
import { formatearFecha } from '@/lib/fechas';
import { Convenio } from '@/types/rrhh';

const EjemplosPreguntas = [
  '¿Cuántos días corresponden por fallecimiento de un familiar?',
  '¿Cómo se pagan las horas extras?',
  '¿Cuántos días de vacaciones me tocan?',
];

/** Formulario de alta/edición de un convenio. */
const FormConvenio = ({
  inicial,
  onGuardado,
  onCancelar,
}: {
  inicial?: Convenio | null;
  onGuardado: (c: Convenio) => void;
  onCancelar: () => void;
}) => {
  const [nombre, setNombre] = useState(inicial?.nombre ?? '');
  const [contenido, setContenido] = useState(inicial?.contenido ?? '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardar = async () => {
    if (!nombre.trim()) {
      setError('El nombre del convenio es obligatorio.');
      return;
    }
    if (!contenido.trim()) {
      setError('Pegá el texto del convenio antes de guardar.');
      return;
    }
    setError(null);
    setGuardando(true);
    try {
      const datos = { nombre: nombre.trim(), contenido };
      const guardado = inicial
        ? await actualizarConvenio(inicial.id, datos)
        : await crearConvenio(datos);
      avisoExito('Convenio guardado', 'Ya se puede consultar con la IA.');
      onGuardado(guardado);
    } catch {
      avisoError('No pudimos guardar el convenio', 'Probá de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Panel>
      <div className="flex flex-col gap-4">
        <Campo
          etiqueta="Nombre del convenio"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Ej. CCT 130/75 — Empleados de Comercio"
          error={error?.includes('nombre') ? error : undefined}
        />
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-ink">
            Texto del convenio
          </span>
          <textarea
            value={contenido}
            onChange={(e) => setContenido(e.target.value)}
            rows={14}
            placeholder="Pegá acá el texto del convenio. Separá los artículos con una línea en blanco."
            className="w-full resize-y rounded-xl border border-line bg-surface px-4 py-3 text-sm leading-relaxed text-ink outline-none transition-colors placeholder:text-ink-soft/50 focus:border-brand-600"
          />
          {error && !error.includes('nombre') && (
            <span className="text-xs font-medium text-red-600">{error}</span>
          )}
        </label>
        <div className="flex gap-2">
          <Boton onClick={() => void guardar()} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </Boton>
          <Boton variante="secundario" onClick={onCancelar}>
            Cancelar
          </Boton>
        </div>
      </div>
    </Panel>
  );
};

/** Detalle de un convenio: asistente IA + búsqueda por texto. */
const DetalleConvenio = ({ convenio }: { convenio: Convenio }) => {
  const [busqueda, setBusqueda] = useState('');
  const [pregunta, setPregunta] = useState('');
  const [respuesta, setRespuesta] = useState<string | null>(null);
  const [consultando, setConsultando] = useState(false);
  const [errorIA, setErrorIA] = useState<string | null>(null);

  const resultados = useMemo(
    () =>
      busqueda.trim() ? buscarParrafos(convenio.contenido, busqueda, 6) : [],
    [convenio, busqueda]
  );

  const preguntar = async (texto: string) => {
    if (!texto.trim()) return;
    setPregunta(texto);
    setConsultando(true);
    setRespuesta(null);
    setErrorIA(null);
    // Recuperación local: mandamos solo los artículos relevantes como contexto.
    const contexto = buscarParrafos(convenio.contenido, texto, 6).join('\n\n');
    try {
      const res = await fetch('/api/convenio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pregunta: texto, contexto }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorIA(data?.error ?? 'No pudimos consultar la IA.');
        return;
      }
      setRespuesta(data.respuesta || 'Sin respuesta.');
    } catch {
      setErrorIA('No pudimos consultar la IA. Probá de nuevo.');
    } finally {
      setConsultando(false);
    }
  };

  return (
    <>
      {/* Asistente IA (se oculta con NEXT_PUBLIC_MOSTRAR_IA=0) */}
      {iaVisible() && (
        <Panel>
          <h2 className="flex items-center gap-2 text-base font-bold text-ink">
            <IconSparkles size={18} className="text-brand-600" />
            Preguntá al asistente
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Respuestas basadas en el texto de {convenio.nombre}, con la cita del
            artículo.
          </p>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input
              value={pregunta}
              onChange={(e) => setPregunta(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void preguntar(pregunta)}
              placeholder="Escribí tu pregunta…"
              className="flex-1 rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink outline-none transition-colors placeholder:text-ink-soft/50 focus:border-brand-600"
            />
            <Boton
              onClick={() => void preguntar(pregunta)}
              disabled={consultando || !pregunta.trim()}
            >
              {consultando ? 'Consultando…' : 'Preguntar'}
            </Boton>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {EjemplosPreguntas.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => void preguntar(q)}
                className="cursor-pointer rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-ink-soft transition-colors hover:border-brand-300 hover:text-brand-700"
              >
                {q}
              </button>
            ))}
          </div>

          {errorIA && (
            <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {errorIA}
            </p>
          )}
          {respuesta && (
            <div className="mt-4 whitespace-pre-wrap rounded-2xl border border-brand-200 bg-brand-50/50 px-4 py-3 text-sm leading-relaxed text-ink">
              {respuesta}
            </div>
          )}
        </Panel>
      )}

      {/* Búsqueda por texto */}
      <Panel>
        <h2 className="flex items-center gap-2 text-base font-bold text-ink">
          <IconSearch size={18} className="text-ink-soft" />
          Buscar en el convenio
        </h2>
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscá por palabra: vacaciones, licencias, horas extras…"
          className="mt-4 w-full rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink outline-none transition-colors placeholder:text-ink-soft/50 focus:border-brand-600"
        />
        <div className="mt-4 flex flex-col gap-2">
          {busqueda.trim() && resultados.length === 0 && (
            <p className="text-sm text-ink-soft">Sin coincidencias.</p>
          )}
          {resultados.map((p, i) => (
            <p
              key={i}
              className="whitespace-pre-wrap rounded-xl border border-line bg-surface px-4 py-3 text-sm leading-relaxed text-ink"
            >
              {p}
            </p>
          ))}
        </div>
      </Panel>
    </>
  );
};

const ConvenioPage = () => {
  const { rolEfectivo } = useAuth();
  const esAdmin = rolEfectivo === 'admin_rrhh' || rolEfectivo === 'superadmin';

  const [convenios, setConvenios] = useState<Convenio[]>([]);
  const [cargando, setCargando] = useState(true);
  const [seleccionado, setSeleccionado] = useState<Convenio | null>(null);
  const [editando, setEditando] = useState(false);
  const [creando, setCreando] = useState(false);
  const [aEliminar, setAEliminar] = useState<Convenio | null>(null);
  const [eliminando, setEliminando] = useState(false);

  const cargar = useCallback(() => {
    void getConvenios()
      .then((lista) => {
        setConvenios(lista);
        // Con un solo convenio, directo al detalle.
        if (lista.length === 1) setSeleccionado(lista[0]);
      })
      .finally(() => setCargando(false));
  }, []);

  useEffect(cargar, [cargar]);

  const eliminar = async () => {
    if (!aEliminar) return;
    setEliminando(true);
    try {
      await eliminarConvenio(aEliminar.id);
      avisoExito('Convenio eliminado', `${aEliminar.nombre} ya no figura.`);
      setAEliminar(null);
      if (seleccionado?.id === aEliminar.id) setSeleccionado(null);
      cargar();
    } catch {
      avisoError('No pudimos eliminarlo', 'Probá de nuevo.');
    }
    setEliminando(false);
  };

  const extracto = (c: Convenio) =>
    c.contenido.replace(/\s+/g, ' ').slice(0, 140).trim() + '…';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {seleccionado && convenios.length > 1 && !editando && (
            <button
              type="button"
              onClick={() => setSeleccionado(null)}
              aria-label="Volver al listado"
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-line bg-surface text-ink-soft transition-colors hover:border-brand-300 hover:text-brand-700"
            >
              <IconArrowLeft size={17} />
            </button>
          )}
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-ink">
              {seleccionado && !creando
                ? seleccionado.nombre
                : 'Convenios colectivos'}
            </h1>
            <p className="mt-1 text-sm text-ink-soft">
              {seleccionado && !creando
                ? `Actualizado ${seleccionado.actualizadoEn ? formatearFecha(seleccionado.actualizadoEn) : 'recientemente'}.`
                : 'Los convenios de tu empresa, consultables con IA.'}
            </p>
          </div>
        </div>
        {esAdmin && !editando && !creando && (
          <div className="flex flex-wrap gap-2">
            {seleccionado ? (
              <>
                <Boton variante="secundario" onClick={() => setEditando(true)}>
                  <IconEdit size={18} />
                  Editar
                </Boton>
                <Boton
                  variante="secundario"
                  onClick={() => setAEliminar(seleccionado)}
                >
                  <IconTrash size={18} />
                  Eliminar
                </Boton>
              </>
            ) : (
              <Boton variante="negro" onClick={() => setCreando(true)}>
                <IconPlus size={18} />
                Nuevo convenio
              </Boton>
            )}
          </div>
        )}
      </div>

      {/* Alta */}
      {creando && (
        <FormConvenio
          onGuardado={(c) => {
            setCreando(false);
            setSeleccionado(c);
            cargar();
          }}
          onCancelar={() => setCreando(false)}
        />
      )}

      {/* Edición */}
      {editando && seleccionado && (
        <FormConvenio
          inicial={seleccionado}
          onGuardado={(c) => {
            setEditando(false);
            setSeleccionado(c);
            cargar();
          }}
          onCancelar={() => setEditando(false)}
        />
      )}

      {/* Listado */}
      {!seleccionado && !creando && !editando && (
        <>
          {cargando ? (
            <Panel>
              <p className="text-sm text-ink-soft">Cargando…</p>
            </Panel>
          ) : convenios.length === 0 ? (
            <Panel>
              <p className="text-sm text-ink-soft">
                Todavía no hay convenios cargados.
                {esAdmin
                  ? ' Usá "Nuevo convenio" para cargar el primero; podés tener varios (uno por CCT).'
                  : ' Pedile a tu admin de RRHH que los cargue.'}
              </p>
            </Panel>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {convenios.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSeleccionado(c)}
                  className="hover-bloque flex cursor-pointer flex-col gap-2 rounded-2xl border border-line bg-surface px-5 py-4 text-left transition-colors hover:border-brand-300"
                >
                  <span className="flex items-center gap-2">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                      <IconFileText size={18} />
                    </span>
                    <span className="font-bold text-ink">{c.nombre}</span>
                  </span>
                  <span className="text-xs leading-relaxed text-ink-soft">
                    {extracto(c)}
                  </span>
                  <span className="text-xs font-semibold text-brand-700">
                    Consultar →
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* Detalle */}
      {seleccionado && !editando && !creando && (
        <DetalleConvenio key={seleccionado.id} convenio={seleccionado} />
      )}

      {/* Confirmación de borrado */}
      <Modal
        opened={aEliminar !== null}
        onClose={() => setAEliminar(null)}
        title="Eliminar convenio"
        radius="lg"
        centered
        styles={{ title: { fontWeight: 800 } }}
      >
        {aEliminar && (
          <div className="flex flex-col gap-4">
            <p className="text-sm leading-relaxed text-ink-soft">
              Vas a eliminar{' '}
              <strong className="text-ink">{aEliminar.nombre}</strong>. El texto
              se pierde y deja de estar disponible para consultas.
            </p>
            <div className="flex gap-2">
              <Boton
                variante="rechazar"
                className="flex-1"
                onClick={() => void eliminar()}
                disabled={eliminando}
              >
                {eliminando ? 'Eliminando…' : 'Eliminar'}
              </Boton>
              <Boton
                variante="secundario"
                className="flex-1"
                onClick={() => setAEliminar(null)}
              >
                Cancelar
              </Boton>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ConvenioPage;
