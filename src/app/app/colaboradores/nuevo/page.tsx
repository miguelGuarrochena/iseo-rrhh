'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthProvider';
import { Breadcrumbs } from '@/components/app/ui/Breadcrumbs';
import {
  DatosEmpleado,
  FormEmpleado,
} from '@/components/app/colaboradores/FormEmpleado';
import { crearEmpleado } from '@/lib/services/rrhh';

const NuevoColaboradorPage = () => {
  const { usuario, rolEfectivo } = useAuth();
  const router = useRouter();

  if (!usuario || rolEfectivo !== 'admin_rrhh') {
    return (
      <p className="text-sm text-ink-soft">
        No tenés permisos para ver esta sección.
      </p>
    );
  }

  const guardar = async (datos: DatosEmpleado) => {
    const nuevo = await crearEmpleado(datos);
    if (datos.fotoUrl) {
      const { actualizarEmpleado } = await import('@/lib/services/rrhh');
      await actualizarEmpleado(nuevo.id, { fotoUrl: datos.fotoUrl });
    }
    router.push('/app/colaboradores');
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Breadcrumbs
          items={[
            { etiqueta: 'Colaboradores', href: '/app/colaboradores' },
            { etiqueta: 'Alta de colaborador' },
          ]}
        />
        <h1 className="text-2xl font-bold tracking-tight text-ink">
          Alta de colaborador
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          Los campos personales se pueden completar después; los laborales
          básicos son obligatorios.
        </p>
      </div>

      <FormEmpleado
        textoGuardar="Dar de alta"
        onGuardar={guardar}
        onCancelar={() => router.push('/app/colaboradores')}
      />
    </div>
  );
};

export default NuevoColaboradorPage;
