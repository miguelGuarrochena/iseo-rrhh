'use client';

import { useEffect, useMemo, useState } from 'react';
import { IconEdit, IconSearch, IconSparkles } from '@tabler/icons-react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { Panel } from '@/components/app/Panel';
import { Boton } from '@/components/app/ui/Boton';
import { Campo } from '@/components/app/ui/Campo';
import { avisoError, avisoExito } from '@/lib/avisos';
import { getConvenio, guardarConvenio } from '@/lib/services/rrhh';
import { buscarParrafos } from '@/lib/convenio';
import { Convenio } from '@/types/rrhh';

const EjemplosPreguntas = [
  '¿Cuántos días corresponden por fallecimiento de un familiar?',
  '¿Cómo se pagan las horas extras?',
  '¿Cuántos días de vacaciones me tocan?',
];

const ConvenioPage = () => {
  const { rolEfectivo } = useAuth();
  const esAdmin = rolEfectivo === 'admin_rrhh' || rolEfectivo === 'superadmin';

  const [convenio, setConvenio] = useState<Convenio | null>(null);
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState('');
  const [contenido, setContenido] = useState('');
  const [guardando, setGuardando] = useState(false);

  const [busqueda, setBusqueda] = useState('');
  const [pregunta, setPregunta] = useState('');
  const [respuesta, setRespuesta] = useState<string | null>(null);
  const [consultando, setConsultando] = useState(false);
  const [errorIA, setErrorIA] = useState<string | null>(null);

  useEffect(() => {
    void getConvenio().then((c) => {
      setConvenio(c);
      if (c) {
        setNombre(c.nombre);
        setContenido(c.contenido);
      }
    });
  }, []);

  const resultados = useMemo(
    () =>
      convenio && busqueda.trim()
        ? buscarParrafos(convenio.contenido, busqueda, 6)
        : [],
    [convenio, busqueda]
  );

  const guardar = async () => {
    setGuardando(true);
    try {
      const actualizado = await guardarConvenio({ nombre, contenido });
      setConvenio(actualizado);
      setEditando(false);
      avisoExito('Convenio guardado', 'Ya se puede consultar con la IA.');
    } catch {
      avisoError('No pudimos guardar el convenio', 'Probá de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  const preguntar = async (texto: string) => {
    if (!texto.trim() || !convenio) return;
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
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            Convenio colectivo
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            {convenio
              ? convenio.nombre
              : 'Cargá el convenio de tu empresa para consultarlo.'}
          </p>
        </div>
        {esAdmin && !editando && (
          <Boton variante="secundario" onClick={() => setEditando(true)}>
            <IconEdit size={18} />
            {convenio ? 'Editar convenio' : 'Cargar convenio'}
          </Boton>
        )}
      </div>

      {/* Edición (admin) */}
      {editando && (
        <Panel>
          <div className="flex flex-col gap-4">
            <Campo
              etiqueta="Nombre del convenio"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. CCT 130/75 — Empleados de Comercio"
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
            </label>
            <div className="flex gap-2">
              <Boton onClick={() => void guardar()} disabled={guardando}>
                {guardando ? 'Guardando…' : 'Guardar'}
              </Boton>
              <Boton variante="secundario" onClick={() => setEditando(false)}>
                Cancelar
              </Boton>
            </div>
          </div>
        </Panel>
      )}

      {!convenio && !editando && (
        <Panel>
          <p className="text-sm text-ink-soft">
            Todavía no hay un convenio cargado.
          </p>
        </Panel>
      )}

      {convenio && !editando && (
        <>
          {/* Asistente IA */}
          <Panel>
            <h2 className="flex items-center gap-2 text-base font-bold text-ink">
              <IconSparkles size={18} className="text-brand-600" />
              Preguntá al asistente
            </h2>
            <p className="mt-1 text-sm text-ink-soft">
              Respuestas basadas en el texto del convenio, con la cita del
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
      )}
    </div>
  );
};

export default ConvenioPage;
