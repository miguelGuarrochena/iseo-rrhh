'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  IconBuildingFactory2,
  IconId,
  IconLogin2,
  IconPlus,
  IconSearch,
} from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';
import { useAuth } from '@/lib/auth/AuthProvider';
import { ListaCard, ListaItem } from '@/components/app/dashboard/ListaCard';
import { NuevaEmpresaModal } from '@/components/app/empresas/NuevaEmpresaModal';
import { Boton } from '@/components/app/ui/Boton';
import { Selector } from '@/components/app/ui/Selector';
import { Paginacion, usePaginacion } from '@/components/app/ui/Paginacion';
import { getEmpresas } from '@/lib/services/rrhh';
import { Empresa, EmpresaResumen, NuevaEmpresa } from '@/types/rrhh';
import { crearEmpresa } from '@/lib/services/rrhh';
import { BloqueError } from '@/components/app/EstadoCarga';
import { useCarga } from '@/lib/useCarga';

const POR_PAGINA = 8;

const EmpresasPage = () => {
  const { usuario, entrarAEmpresa } = useAuth();
  const router = useRouter();
  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState('');
  const [plan, setPlan] = useState('');
  const [modalAbierto, { open, close }] = useDisclosure(false);

  const carga = useCarga(() => getEmpresas(), [], {
    contexto: 'empresas',
    inicial: [] as EmpresaResumen[],
  });
  const empresas = carga.datos;
  const cargar = carga.recargar;

  useEffect(() => {
    if (usuario && usuario.rol !== 'superadmin') {
      router.replace('/');
    }
  }, [usuario, router]);

  const planes = useMemo(
    () =>
      Array.from(
        new Set(
          empresas
            .map(({ empresa }) => empresa.plan?.trim())
            .filter((p): p is string => Boolean(p))
        )
      ).sort((a, b) => a.localeCompare(b, 'es')),
    [empresas]
  );

  const filtradas = empresas.filter(({ empresa }) => {
    if (estado && empresa.estado !== estado) return false;
    if (plan && empresa.plan !== plan) return false;
    const q = busqueda.trim().toLowerCase();
    if (!q) return true;
    return `${empresa.nombre} ${empresa.cuit} ${empresa.contactoNombre}`
      .toLowerCase()
      .includes(q);
  });
  const hayFiltros = Boolean(busqueda.trim() || estado || plan);
  const paginaClientes = usePaginacion(filtradas, POR_PAGINA);

  if (!usuario || usuario.rol !== 'superadmin') {
    return null;
  }

  const crear = async (datos: NuevaEmpresa) => {
    await crearEmpresa(datos);
    close();
    cargar();
  };

  const ingresar = (empresa: Empresa) => {
    entrarAEmpresa(empresa);
    router.push('/');
  };

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[1.75rem]">
            Empresas
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-soft">
            Tus clientes: alta, baja y estado de cada cuenta.
          </p>
        </div>
        <Boton variante="negro" onClick={open}>
          <IconPlus size={18} />
          Nueva empresa
        </Boton>
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
              placeholder="Buscar por nombre, CUIT o contacto…"
              className="h-12 w-full rounded-xl border border-line-strong bg-surface pl-11 pr-4 text-base text-ink outline-none transition-colors placeholder:text-ink-soft/50 focus:border-brand-500 focus:shadow-[0_0_0_3px_rgba(74,122,245,0.18)]"
            />
          </div>
          <Selector
            valor={estado}
            onCambiar={setEstado}
            className="sm:w-48 [&>button]:h-12"
            opciones={[
              { valor: '', etiqueta: 'Todos los estados' },
              { valor: 'activa', etiqueta: 'Activas' },
              { valor: 'suspendida', etiqueta: 'Suspendidas' },
            ]}
          />
          {planes.length > 0 && (
            <Selector
              valor={plan}
              onCambiar={setPlan}
              className="sm:w-48 [&>button]:h-12"
              opciones={[
                { valor: '', etiqueta: 'Todos los planes' },
                ...planes.map((p) => ({ valor: p, etiqueta: p })),
              ]}
            />
          )}
        </div>
        {hayFiltros && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-paper px-4 py-3 text-sm text-ink-soft">
            <span>
              Mostrando {filtradas.length} de {empresas.length} clientes con los
              filtros actuales.
            </span>
            <Boton
              type="button"
              variante="sutil"
              tamano="sm"
              onClick={() => {
                setBusqueda('');
                setEstado('');
                setPlan('');
              }}
            >
              Limpiar filtros
            </Boton>
          </div>
        )}
      </div>

      {carga.fase === 'error' && carga.error && (
        <BloqueError error={carga.error} onReintentar={carga.recargar} />
      )}

      <ListaCard
        titulo={
          carga.fase === 'ok' ? `Clientes (${filtradas.length})` : 'Clientes'
        }
        cargando={carga.fase === 'cargando'}
        tieneItems={paginaClientes.visibles.length > 0}
        vacio="No hay empresas con esos filtros."
      >
        {paginaClientes.visibles.map(({ empresa, empleadosActivos }) => (
          <ListaItem
            key={empresa.id}
            onClick={
              empresa.estado === 'activa'
                ? () => {
                    entrarAEmpresa(empresa);
                    router.push('/');
                  }
                : undefined
            }
            icono={IconBuildingFactory2}
            principal={empresa.nombre}
            secundario={`CUIT ${empresa.cuit} · ${empleadosActivos} empleados${
              empresa.plan ? ` · plan ${empresa.plan}` : ''
            } · ${empresa.contactoNombre}`}
            extremo={
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                    empresa.estado === 'activa'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-red-100 text-red-700'
                  }`}
                >
                  {empresa.estado === 'activa' ? 'Activa' : 'Suspendida'}
                </span>
                <Boton
                  variante="secundario"
                  tamano="sm"
                  onClick={() => router.push(`/empresas/${empresa.id}`)}
                >
                  <IconId size={14} />
                  Ver detalle
                </Boton>
                {empresa.estado === 'activa' && (
                  <Boton
                    variante="secundario"
                    tamano="sm"
                    onClick={() => ingresar(empresa)}
                  >
                    <IconLogin2 size={14} />
                    Ingresar
                  </Boton>
                )}
              </div>
            }
          />
        ))}
        <Paginacion
          pagina={paginaClientes.pagina}
          totalPaginas={paginaClientes.totalPaginas}
          onCambiar={paginaClientes.setPagina}
        />
      </ListaCard>

      <NuevaEmpresaModal
        abierto={modalAbierto}
        onCerrar={close}
        onCrear={crear}
      />
    </div>
  );
};

export default EmpresasPage;
