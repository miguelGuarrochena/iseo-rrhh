'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@mantine/core';
import { IconSearch, IconUser } from '@tabler/icons-react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { navItemsPorRol } from './navItems';
import { getEmpleados } from '@/lib/services/rrhh';
import { Empleado } from '@/types/rrhh';

/**
 * Buscador global estilo ⌘K: botón en el header + atajo de teclado
 * que abren una paleta con secciones y colaboradores.
 */
export const BuscadorGlobal = () => {
  const { usuario, rolEfectivo } = useAuth();
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState('');
  const [seleccion, setSeleccion] = useState(0);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);

  const esGestor = rolEfectivo === 'admin_rrhh' || rolEfectivo === 'supervisor';
  const esMac =
    typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);

  useEffect(() => {
    const atajo = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setAbierto((v) => !v);
      }
    };
    window.addEventListener('keydown', atajo);
    return () => window.removeEventListener('keydown', atajo);
  }, []);

  useEffect(() => {
    if (abierto && esGestor) void getEmpleados().then(setEmpleados);
    if (abierto) {
      setQ('');
      setSeleccion(0);
    }
  }, [abierto, esGestor]);

  const resultados = useMemo(() => {
    if (!rolEfectivo) return [];
    const texto = q.trim().toLowerCase();
    const secciones = navItemsPorRol(rolEfectivo)
      .filter((s) => !texto || s.etiqueta.toLowerCase().includes(texto))
      .map((s) => ({
        id: s.href,
        etiqueta: s.etiqueta,
        detalle: 'Sección',
        icono: s.icono,
        href: s.href,
      }));
    const gente =
      esGestor && texto
        ? empleados
            .filter((e) =>
              `${e.nombre} ${e.apellido} ${e.puesto} ${e.dni}`
                .toLowerCase()
                .includes(texto)
            )
            .slice(0, 5)
            .map((e) => ({
              id: e.id,
              etiqueta: `${e.nombre} ${e.apellido}`,
              detalle: e.puesto,
              icono: IconUser,
              href: `/colaboradores/${e.id}`,
            }))
        : [];
    return [...gente, ...secciones].slice(0, 8);
  }, [q, rolEfectivo, empleados, esGestor]);

  const ir = useCallback(
    (href: string) => {
      setAbierto(false);
      router.push(href);
    },
    [router]
  );

  const alTeclear = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSeleccion((s) => Math.min(s + 1, resultados.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSeleccion((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter' && resultados[seleccion]) {
      ir(resultados[seleccion].href);
    }
  };

  if (!usuario) return null;

  return (
    <>
      <button
        onClick={() => setAbierto(true)}
        className="hidden w-full max-w-xs cursor-pointer items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2 text-sm text-ink-soft transition-colors hover:border-brand-300 hover:text-ink md:flex"
      >
        <IconSearch size={16} />
        <span className="flex-1 text-left">Buscar…</span>
        <kbd className="rounded-md border border-line bg-paper px-1.5 py-0.5 text-[0.65rem] font-bold text-ink-soft">
          {esMac ? '⌘K' : 'Ctrl K'}
        </kbd>
      </button>

      {/* En mobile, ícono redondo como los demás del header */}
      <button
        aria-label="Buscar"
        onClick={() => setAbierto(true)}
        className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-ink-soft transition-colors hover:bg-paper hover:text-ink md:hidden"
      >
        <IconSearch size={20} stroke={1.8} />
      </button>

      <Modal
        opened={abierto}
        onClose={() => setAbierto(false)}
        withCloseButton={false}
        radius="lg"
        padding={0}
        centered
        size="lg"
        transitionProps={{ transition: 'pop', duration: 120 }}
      >
        <div className="flex items-center gap-3 border-b border-line px-4 py-3.5">
          <IconSearch size={18} className="shrink-0 text-ink-soft" />
          <input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSeleccion(0);
            }}
            onKeyDown={alTeclear}
            placeholder="Buscar secciones o personas…"
            className="w-full border-0 bg-transparent text-base text-ink outline-none placeholder:text-ink-soft/60"
          />
          <kbd className="shrink-0 rounded-md border border-line bg-paper px-1.5 py-0.5 text-[0.65rem] font-bold text-ink-soft">
            esc
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto py-1.5">
          {resultados.length === 0 && (
            <p className="px-4 py-3 text-sm text-ink-soft">Sin resultados.</p>
          )}
          {resultados.map((r, i) => {
            const Icono = r.icono;
            return (
              <button
                key={r.id}
                onClick={() => ir(r.href)}
                onMouseEnter={() => setSeleccion(i)}
                className={`flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left text-sm font-medium transition-colors ${
                  i === seleccion
                    ? 'bg-brand-100 text-brand-800'
                    : 'bg-transparent text-ink'
                }`}
              >
                <Icono size={16} className="shrink-0 opacity-70" />
                <span className="flex-1 truncate">{r.etiqueta}</span>
                <span className="shrink-0 text-xs opacity-60">{r.detalle}</span>
              </button>
            );
          })}
        </div>
      </Modal>
    </>
  );
};
