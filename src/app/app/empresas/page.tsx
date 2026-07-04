'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  IconBuildingFactory2,
  IconLogin2,
  IconPlus,
} from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';
import { useAuth } from '@/lib/auth/AuthProvider';
import { ListaCard, ListaItem } from '@/components/app/dashboard/ListaCard';
import { NuevaEmpresaModal } from '@/components/app/empresas/NuevaEmpresaModal';
import { Boton } from '@/components/app/ui/Boton';
import { Selector } from '@/components/app/ui/Selector';
import { cambiarEstadoEmpresa, getEmpresas } from '@/lib/services/rrhh';
import { EmpresaResumen, NuevaEmpresa } from '@/types/rrhh';
import { crearEmpresa } from '@/lib/services/rrhh';

const EmpresasPage = () => {
  const { usuario, entrarAEmpresa } = useAuth();
  const router = useRouter();
  const [empresas, setEmpresas] = useState<EmpresaResumen[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState('');
  const [modalAbierto, { open, close }] = useDisclosure(false);

  const cargar = useCallback(() => {
    void getEmpresas().then(setEmpresas);
  }, []);

  useEffect(cargar, [cargar]);

  const filtradas = empresas.filter(({ empresa }) => {
    if (estado && empresa.estado !== estado) return false;
    const q = busqueda.trim().toLowerCase();
    if (!q) return true;
    return `${empresa.nombre} ${empresa.cuit} ${empresa.contactoNombre}`
      .toLowerCase()
      .includes(q);
  });

  if (usuario?.rol !== 'superadmin') {
    return (
      <p className="text-sm text-ink-soft">
        No tenés permisos para ver esta sección.
      </p>
    );
  }

  const alternarEstado = async (empresaId: string, activa: boolean) => {
    await cambiarEstadoEmpresa(empresaId, activa ? 'suspendida' : 'activa');
    cargar();
  };

  const crear = async (datos: NuevaEmpresa) => {
    await crearEmpresa(datos);
    close();
    cargar();
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            Empresas
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            Tus clientes: alta, baja y estado de cada cuenta.
          </p>
        </div>
        <Boton variante="negro" onClick={open}>
          <IconPlus size={18} />
          Nueva empresa
        </Boton>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, CUIT o contacto…"
          className="flex-1 rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink outline-none transition-colors placeholder:text-ink-soft/50 focus:border-brand-600"
        />
        <Selector
          valor={estado}
          onCambiar={setEstado}
          className="sm:w-48"
          opciones={[
            { valor: '', etiqueta: 'Todos los estados' },
            { valor: 'activa', etiqueta: 'Activas' },
            { valor: 'suspendida', etiqueta: 'Suspendidas' },
          ]}
        />
      </div>

      <ListaCard
        titulo={`Clientes (${filtradas.length})`}
        vacio="No hay empresas con esos filtros."
      >
        {filtradas.map(({ empresa, empleadosActivos }) => (
          <ListaItem
            key={empresa.id}
            onClick={
              empresa.estado === 'activa'
                ? () => {
                    entrarAEmpresa(empresa);
                    router.push('/app');
                  }
                : undefined
            }
            icono={IconBuildingFactory2}
            principal={empresa.nombre}
            secundario={`CUIT ${empresa.cuit} · ${empleadosActivos} empleados · ${empresa.contactoNombre} (${empresa.contactoEmail})`}
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
                {empresa.estado === 'activa' && (
                  <Boton
                    variante="secundario"
                    tamano="sm"
                    onClick={() => {
                      entrarAEmpresa(empresa);
                      router.push('/app');
                    }}
                  >
                    <IconLogin2 size={14} />
                    Ingresar
                  </Boton>
                )}
                {empresa.estado === 'activa' ? (
                  <Boton
                    variante="rechazar"
                    tamano="sm"
                    onClick={() => void alternarEstado(empresa.id, true)}
                  >
                    Suspender
                  </Boton>
                ) : (
                  <Boton
                    variante="aprobar"
                    tamano="sm"
                    onClick={() => void alternarEstado(empresa.id, false)}
                  >
                    Reactivar
                  </Boton>
                )}
              </div>
            }
          />
        ))}
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
