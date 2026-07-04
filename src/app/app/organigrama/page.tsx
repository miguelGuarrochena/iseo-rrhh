'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Panel } from '@/components/app/Panel';
import { getEmpleados } from '@/lib/services/rrhh';
import { construirOrganigrama, NodoOrg } from '@/lib/organigrama';
import { Empleado } from '@/types/rrhh';

const iniciales = (e: Empleado) =>
  `${e.nombre[0] ?? ''}${e.apellido[0] ?? ''}`.toUpperCase();

const NodoView = ({ nodo }: { nodo: NodoOrg }) => {
  const { empleado, hijos } = nodo;
  return (
    <li className="relative">
      <Link
        href={`/colaboradores/${empleado.id}`}
        className="inline-flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 no-underline transition-colors hover:border-brand-300 hover:bg-brand-50/40"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
          {iniciales(empleado)}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-ink">
            {empleado.nombre} {empleado.apellido}
          </span>
          <span className="block truncate text-xs text-ink-soft">
            {empleado.puesto}
            {empleado.sector ? ` · ${empleado.sector}` : ''}
          </span>
        </span>
      </Link>

      {hijos.length > 0 && (
        <ul className="ml-5 mt-2 flex flex-col gap-2 border-l border-line pl-5">
          {hijos.map((h) => (
            <NodoView key={h.empleado.id} nodo={h} />
          ))}
        </ul>
      )}
    </li>
  );
};

const OrganigramaPage = () => {
  const [empleados, setEmpleados] = useState<Empleado[]>([]);

  useEffect(() => {
    void getEmpleados().then(setEmpleados);
  }, []);

  const arbol = useMemo(() => construirOrganigrama(empleados), [empleados]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">
          Organigrama
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          La estructura del equipo según quién reporta a quién.
        </p>
      </div>

      <Panel>
        {arbol.length === 0 ? (
          <p className="text-sm text-ink-soft">
            No hay colaboradores para mostrar.
          </p>
        ) : (
          <ul className="flex flex-col gap-3 overflow-x-auto">
            {arbol.map((nodo) => (
              <NodoView key={nodo.empleado.id} nodo={nodo} />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
};

export default OrganigramaPage;
