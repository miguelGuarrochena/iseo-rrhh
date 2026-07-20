'use client';

import { useMemo, useState } from 'react';
import {
  IconChevronDown,
  IconLifebuoy,
  IconMail,
  IconSparkles,
} from '@tabler/icons-react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { Panel } from '@/components/app/Panel';
import { Boton } from '@/components/app/ui/Boton';
import { faqParaRol, faqTextoParaRol } from '@/lib/ayuda';
import { iaVisible } from '@/lib/entorno';
import { buscarParrafos } from '@/lib/convenio';

const SOPORTE_WA =
  'https://wa.me/5491154018969?text=Hola%2C%20necesito%20ayuda%20con%20ISEO%20RH.';
const SOPORTE_MAIL = 'info@iseo-rh.com';

const AyudaPage = () => {
  const { rolEfectivo } = useAuth();
  const rol = rolEfectivo ?? 'empleado';

  const categorias = useMemo(() => faqParaRol(rol), [rol]);
  const [abierto, setAbierto] = useState<string | null>(null);

  const [pregunta, setPregunta] = useState('');
  const [respuesta, setRespuesta] = useState<string | null>(null);
  const [consultando, setConsultando] = useState(false);
  const [errorIA, setErrorIA] = useState<string | null>(null);

  const preguntar = async (texto: string) => {
    if (!texto.trim()) return;
    setPregunta(texto);
    setConsultando(true);
    setRespuesta(null);
    setErrorIA(null);
    const guia = faqTextoParaRol(rol);
    const contexto = buscarParrafos(guia, texto, 6).join('\n\n') || guia;
    try {
      const res = await fetch('/api/ayuda', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pregunta: texto, contexto, rol }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorIA(data?.error ?? 'No pudimos consultar el asistente.');
        return;
      }
      setRespuesta(data.respuesta || 'Sin respuesta.');
    } catch {
      setErrorIA('No pudimos consultar el asistente. Probá de nuevo.');
    } finally {
      setConsultando(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Ayuda</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Preguntas frecuentes y un asistente para tus dudas sobre la app.
        </p>
      </div>

      {/* Asistente IA (se oculta con NEXT_PUBLIC_MOSTRAR_IA=0) */}
      {iaVisible() && (
        <Panel>
          <h2 className="flex items-center gap-2 text-base font-bold text-ink">
            <IconSparkles size={18} className="text-brand-600" />
            Asistente de ayuda
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Escribí tu duda y te explico cómo hacerlo en la app.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input
              value={pregunta}
              onChange={(e) => setPregunta(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void preguntar(pregunta)}
              placeholder="Ej. ¿Cómo pido vacaciones?"
              className="flex-1 rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink outline-none transition-colors placeholder:text-ink-soft/50 focus:border-brand-600"
            />
            <Boton
              onClick={() => void preguntar(pregunta)}
              disabled={consultando || !pregunta.trim()}
            >
              {consultando ? 'Consultando…' : 'Preguntar'}
            </Boton>
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

      {/* FAQ */}
      <Panel>
        <h2 className="text-base font-bold text-ink">Preguntas frecuentes</h2>
        <div className="mt-4 flex flex-col gap-5">
          {categorias.map((cat) => (
            <div key={cat.titulo}>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-soft">
                {cat.titulo}
              </p>
              <div className="flex flex-col gap-2">
                {cat.items.map((it) => {
                  const id = `${cat.titulo}-${it.pregunta}`;
                  const open = abierto === id;
                  return (
                    <div
                      key={id}
                      className="overflow-hidden rounded-xl border border-line bg-surface"
                    >
                      <button
                        type="button"
                        onClick={() => setAbierto(open ? null : id)}
                        className="flex w-full cursor-pointer items-center justify-between gap-3 border-0 bg-transparent px-4 py-3 text-left"
                      >
                        <span className="text-sm font-semibold text-ink">
                          {it.pregunta}
                        </span>
                        <IconChevronDown
                          size={16}
                          className={`shrink-0 text-ink-soft transition-transform ${
                            open ? 'rotate-180' : ''
                          }`}
                        />
                      </button>
                      {open && (
                        <p className="px-4 pb-3 text-sm leading-relaxed text-ink-soft">
                          {it.respuesta}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      {/* Contacto soporte */}
      <Panel>
        <h2 className="flex items-center gap-2 text-base font-bold text-ink">
          <IconLifebuoy size={18} className="text-ink-soft" />
          ¿Seguís con dudas?
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          Escribinos y te damos una mano.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a href={SOPORTE_WA} target="_blank" rel="noopener noreferrer">
            <Boton variante="secundario">WhatsApp</Boton>
          </a>
          <a href={`mailto:${SOPORTE_MAIL}`}>
            <Boton variante="secundario">
              <IconMail size={16} /> {SOPORTE_MAIL}
            </Boton>
          </a>
        </div>
      </Panel>
    </div>
  );
};

export default AyudaPage;
