'use client';

import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthProvider';
import { Breadcrumbs } from '@/components/app/ui/Breadcrumbs';
import {
  DatosEmpleado,
  FormEmpleado,
} from '@/components/app/colaboradores/FormEmpleado';
import { avisoError, avisoExito } from '@/lib/avisos';
import {
  actualizarEmpleado,
  cambiarEmailDeEmpleado,
  getEmpleado,
  getEstadoDeCuentaDeEmpleado,
} from '@/lib/services/rrhh';
import { BloqueError } from '@/components/app/EstadoCarga';
import { RequireEmpresa } from '@/components/app/RequireEmpresa';
import { useCarga } from '@/lib/useCarga';

const EditarColaboradorPage = () => {
  const { id } = useParams<{ id: string }>();
  const { usuario, rolEfectivo } = useAuth();
  const router = useRouter();
  const carga = useCarga(() => getEmpleado(id), [id], {
    activo: Boolean(id),
    contexto: 'colaborador/editar',
  });
  const empleado = carga.datos ?? null;

  /**
   * En qué anda la cuenta de este legajo. Es lo que le permite al formulario
   * decir si el email es un dato de contacto o la llave con la que esa
   * persona entra. Si no se puede consultar, el campo se comporta como antes
   * en vez de trabar la edición del resto de la ficha.
   */
  const cargaCuenta = useCarga(() => getEstadoDeCuentaDeEmpleado(id), [id], {
    activo: Boolean(id),
    contexto: 'colaborador/editar/cuenta',
  });

  if (!usuario || rolEfectivo !== 'admin_rrhh') {
    return (
      <p className="text-sm text-ink-soft">
        No tenés permisos para ver esta sección.
      </p>
    );
  }

  if (carga.fase === 'error' && carga.error) {
    return <BloqueError error={carga.error} onReintentar={carga.recargar} />;
  }

  if (!empleado) {
    return <p className="text-sm text-ink-soft">Cargando…</p>;
  }

  const cuenta = cargaCuenta.datos;
  const emailNuevo = (empleadoDatos: DatosEmpleado) =>
    (empleadoDatos.email ?? '').trim().toLowerCase();

  const guardar = async (datos: DatosEmpleado) => {
    /*
     * El email va por su propio camino y NO en el update de la ficha.
     *
     * Escribirlo acá tocaba sólo `empleados.email`: la invitación y todos
     * los avisos por mail se resuelven contra `auth.users` / `usuarios`, así
     * que seguían yendo a la dirección anterior. `cambiarEmailDeEmpleado`
     * decide en el servidor qué hacer según el estado de la cuenta —mover la
     * identidad si ya está activa, invalidar y rehacer si la invitación está
     * pendiente— y deja los cuatro lugares iguales.
     */
    const email = emailNuevo(datos);
    const cambioElEmail = email !== (empleado.email ?? '').trim().toLowerCase();

    try {
      await actualizarEmpleado(empleado.id, {
        ...datos,
        supervisorId: datos.supervisorId ?? null,
        cuil: datos.cuil ?? '',
        domicilio: datos.domicilio ?? '',
        telefono: datos.telefono ?? '',
        email: empleado.email ?? '',
        banco: datos.banco ?? '',
        cbu: datos.cbu ?? '',
        obraSocial: datos.obraSocial ?? '',
        art: datos.art ?? '',
        fotoUrl: datos.fotoUrl,
      });
      // Va después del resto del legajo: si el cambio de identidad falla, lo
      // demás quedó guardado y el email sigue siendo el que funciona.
      if (cambioElEmail) await cambiarEmailDeEmpleado(empleado.id, email);
    } catch (err) {
      avisoError(
        'No pudimos guardar los cambios',
        err instanceof Error ? err.message : undefined
      );
      return;
    }

    avisoExito(
      'Cambios guardados',
      cambioElEmail && cuenta?.estado === 'invitacion_pendiente'
        ? `Invalidamos la invitación anterior y le mandamos una nueva a ${email}.`
        : cambioElEmail && cuenta?.estado === 'cuenta_activa'
          ? `Desde ahora entra a la app con ${email}.`
          : undefined
    );
    router.push(`/colaboradores/${empleado.id}`);
  };

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
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
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[1.75rem]">
          Editar colaborador
        </h1>
      </div>

      <FormEmpleado
        inicial={empleado}
        textoGuardar="Guardar cambios"
        onGuardar={guardar}
        onCancelar={() => router.push(`/colaboradores/${empleado.id}`)}
        cuenta={cuenta}
      />
    </div>
  );
};

/** La ficha pertenece a una empresa: sin una activa no hay a quién pedir. */
const EditarColaboradorConEmpresa = () => (
  <RequireEmpresa>
    <EditarColaboradorPage />
  </RequireEmpresa>
);

export default EditarColaboradorConEmpresa;
