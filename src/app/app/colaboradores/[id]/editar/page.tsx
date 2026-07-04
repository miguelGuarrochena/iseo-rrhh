'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthProvider';
import { Breadcrumbs } from '@/components/app/ui/Breadcrumbs';
import {
  DatosEmpleado,
  FormEmpleado,
} from '@/components/app/colaboradores/FormEmpleado';
import { avisoError, avisoExito } from '@/lib/avisos';
import { actualizarEmpleado, getEmpleado } from '@/lib/services/rrhh';
import { Empleado } from '@/types/rrhh';

const EditarColaboradorPage = () => {
  const { id } = useParams<{ id: string }>();
  const { usuario, rolEfectivo } = useAuth();
  const router = useRouter();
  const [empleado, setEmpleado] = useState<Empleado | null>(null);

  useEffect(() => {
    if (id) void getEmpleado(id).then(setEmpleado);
  }, [id]);

  if (!usuario || rolEfectivo !== 'admin_rrhh') {
    return (
      <p className="text-sm text-ink-soft">
        No tenés permisos para ver esta sección.
      </p>
    );
  }

  if (!empleado) {
    return <p className="text-sm text-ink-soft">Cargando…</p>;
  }

  const guardar = async (datos: DatosEmpleado) => {
    await actualizarEmpleado(empleado.id, {
      ...datos,
      supervisorId: datos.supervisorId ?? null,
      cuil: datos.cuil ?? '',
      domicilio: datos.domicilio ?? '',
      telefono: datos.telefono ?? '',
      email: datos.email ?? '',
      banco: datos.banco ?? '',
      cbu: datos.cbu ?? '',
      obraSocial: datos.obraSocial ?? '',
      art: datos.art ?? '',
      fotoUrl: datos.fotoUrl,
    })
      .then(() => {
        avisoExito('Cambios guardados');
        router.push(`/colaboradores/${empleado.id}`);
      })
      .catch((err: unknown) => {
        avisoError(
          'No pudimos guardar los cambios',
          err instanceof Error ? err.message : undefined
        );
      });
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Breadcrumbs
          items={[
            { etiqueta: 'Colaboradores', href: '/colaboradores' },
            {
              etiqueta: `${empleado.nombre} ${empleado.apellido}`,
              href: `/colaboradores/${empleado.id}`,
            },
            { etiqueta: 'Editar' },
          ]}
        />
        <h1 className="text-2xl font-bold tracking-tight text-ink">
          Editar colaborador
        </h1>
      </div>

      <FormEmpleado
        inicial={empleado}
        textoGuardar="Guardar cambios"
        onGuardar={guardar}
        onCancelar={() => router.push(`/colaboradores/${empleado.id}`)}
      />
    </div>
  );
};

export default EditarColaboradorPage;
