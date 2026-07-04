'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  IconFileSpreadsheet,
  IconFilter,
  IconPlus,
  IconSearch,
  IconUser,
} from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';
import { useAuth } from '@/lib/auth/AuthProvider';
import { ImportarEmpleadosModal } from '@/components/app/colaboradores/ImportarEmpleadosModal';
import { ListaCard, ListaItem } from '@/components/app/dashboard/ListaCard';
import { Boton } from '@/components/app/ui/Boton';
import { aOpciones, Selector } from '@/components/app/ui/Selector';
import {
  Paginacion,
  paginar,
  totalPaginasDe,
} from '@/components/app/ui/Paginacion';
import { getEmpleadosTodos } from '@/lib/services/rrhh';
import { Empleado, ModalidadContratacion } from '@/types/rrhh';

const POR_PAGINA = 6;

const modalidades: Record<ModalidadContratacion, string> = {
  indeterminado: 'Tiempo indeterminado',
  plazo_fijo: 'Plazo fijo',
  eventual: 'Eventual',
  pasantia: 'Pasantía',
  monotributista: 'Monotributista',
};

const ColaboradoresPage = () => {
  const { usuario, rolEfectivo } = useAuth();
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [sector, setSector] = useState('');
  const [modalidad, setModalidad] = useState('');
  const [legajo, setLegajo] = useState('');
  const [estado, setEstado] = useState('activo');
  const [avanzados, setAvanzados] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [importarAbierto, { open: abrirImportar, close: cerrarImportar }] =
    useDisclosure(false);

  const cargarEmpleados = () => {
    void getEmpleadosTodos().then(setEmpleados);
  };

  useEffect(cargarEmpleados, []);

  const sectores = useMemo(
    () => Array.from(new Set(empleados.map((e) => e.sector))).sort(),
    [empleados]
  );

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return empleados.filter((e) => {
      if (estado === 'activo' && !e.activo) return false;
      if (estado === 'baja' && e.activo) return false;
      if (sector && e.sector !== sector) return false;
      if (modalidad && e.modalidadContratacion !== modalidad) return false;
      if (legajo) {
        const completo = e.checklistAlta.every((c) => c.completo);
        if (legajo === 'completo' && !completo) return false;
        if (legajo === 'pendiente' && completo) return false;
      }
      if (!q) return true;
      return `${e.nombre} ${e.apellido} ${e.puesto} ${e.sector} ${e.dni}`
        .toLowerCase()
        .includes(q);
    });
  }, [empleados, busqueda, sector, modalidad, legajo, estado]);

  const totalPaginas = totalPaginasDe(filtrados.length, POR_PAGINA);
  const visibles = paginar(filtrados, pagina, POR_PAGINA);

  useEffect(() => {
    setPagina(1);
  }, [busqueda, sector, modalidad, legajo, estado]);

  if (!usuario || rolEfectivo === 'empleado') {
    return (
      <p className="text-sm text-ink-soft">
        No tenés permisos para ver esta sección.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            Colaboradores
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            {empleados.filter((e) => e.activo).length} activos. Entrá a la ficha
            para ver todo: legajo, indicadores y solicitudes.
          </p>
        </div>
        {rolEfectivo === 'admin_rrhh' && (
          <div className="flex flex-wrap items-center gap-2">
            <Boton type="button" variante="secundario" onClick={abrirImportar}>
              <IconFileSpreadsheet size={18} />
              Importar Excel
            </Boton>
            <Link href="/app/colaboradores/nuevo" className="no-underline">
              <Boton type="button" variante="negro">
                <IconPlus size={18} />
                Alta de colaborador
              </Boton>
            </Link>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <IconSearch
              size={18}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-soft"
            />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre, puesto, sector o DNI…"
              className="w-full rounded-xl border border-line bg-surface py-3 pl-11 pr-4 text-base text-ink outline-none transition-colors placeholder:text-ink-soft/50 focus:border-brand-600"
            />
          </div>
          <Selector
            valor={sector}
            onCambiar={setSector}
            className="sm:w-52"
            opciones={[
              { valor: '', etiqueta: 'Todos los sectores' },
              ...sectores.map((s) => ({ valor: s, etiqueta: s })),
            ]}
          />
          <Boton
            type="button"
            variante={avanzados ? 'primario' : 'secundario'}
            onClick={() => setAvanzados((v) => !v)}
          >
            <IconFilter size={16} />
            Filtros
          </Boton>
        </div>

        {avanzados && (
          <div className="flex flex-wrap gap-3">
            <Selector
              valor={modalidad}
              onCambiar={setModalidad}
              opciones={[
                { valor: '', etiqueta: 'Todas las modalidades' },
                ...aOpciones(modalidades),
              ]}
            />
            <Selector
              valor={estado}
              onCambiar={setEstado}
              opciones={[
                { valor: 'activo', etiqueta: 'Activos' },
                { valor: 'baja', etiqueta: 'Dados de baja' },
                { valor: '', etiqueta: 'Todos' },
              ]}
            />
            <Selector
              valor={legajo}
              onCambiar={setLegajo}
              opciones={[
                { valor: '', etiqueta: 'Legajo: todos' },
                { valor: 'completo', etiqueta: 'Legajo completo' },
                { valor: 'pendiente', etiqueta: 'Con documentación pendiente' },
              ]}
            />
          </div>
        )}
      </div>

      <ListaCard
        titulo={`Equipo (${filtrados.length})`}
        vacio="No se encontraron colaboradores con esos filtros."
      >
        {visibles.length > 0 &&
          visibles.map((e) => {
            const pendientes = e.checklistAlta.filter(
              (c) => !c.completo
            ).length;
            return (
              <ListaItem
                key={e.id}
                icono={IconUser}
                avatarUrl={e.fotoUrl}
                principal={`${e.nombre} ${e.apellido}`}
                secundario={`${e.puesto} · ${e.sector}`}
                href={`/app/colaboradores/${e.id}`}
                extremo={
                  !e.activo ? (
                    <span className="shrink-0 rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-700">
                      Baja
                    </span>
                  ) : pendientes > 0 ? (
                    <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">
                      {pendientes} doc. pendientes
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">
                      Legajo completo
                    </span>
                  )
                }
              />
            );
          })}
        <Paginacion
          pagina={pagina}
          totalPaginas={totalPaginas}
          onCambiar={setPagina}
        />
      </ListaCard>

      <ImportarEmpleadosModal
        abierto={importarAbierto}
        onCerrar={cerrarImportar}
        onImportado={cargarEmpleados}
      />
    </div>
  );
};

export default ColaboradoresPage;
