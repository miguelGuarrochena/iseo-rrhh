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
import { ErrorDeCambioDeEmail } from '@/lib/api/cambioDeEmail';
import { useConfirmacion } from '@/components/app/ui/useConfirmacion';
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
   * persona entra, y a esta pantalla saber qué confirmar antes de guardar.
   */
  const cargaCuenta = useCarga(() => getEstadoDeCuentaDeEmpleado(id), [id], {
    activo: Boolean(id),
    contexto: 'colaborador/editar/cuenta',
  });
  const { confirmar, dialogo: dialogoConfirmar } = useConfirmacion();

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

  /**
   * Sin saber en qué anda la cuenta, cambiar el email es a ciegas: podría
   * estar anulando una invitación pendiente sin decírselo a nadie. Se
   * bloquea sólo ese campo; el resto de la ficha se sigue editando.
   */
  const bloqueoDeEmail =
    cargaCuenta.fase === 'error'
      ? 'No pudimos verificar si esta persona tiene cuenta, así que el email no se puede cambiar ahora. Guardá el resto y reintentá en un momento.'
      : undefined;

  const nombre = `${empleado.nombre} ${empleado.apellido}`;
  const emailAnterior = (empleado.email ?? '').trim();

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
    const cambioElEmail = email !== emailAnterior.toLowerCase();

    /*
     * Cambiar el email de alguien que ya tiene cuenta no es guardar un dato:
     * o anula una invitación viva y manda otra, o mueve la identidad con la
     * que esa persona entra. Y el aviso del campo queda cuatro paneles más
     * arriba del botón, así que para cuando se guarda ya no se ve. Se
     * pregunta acá, igual que en Permisos para estas mismas operaciones.
     */
    if (cambioElEmail && cuenta && cuenta.estado !== 'sin_cuenta') {
      const pendiente = cuenta.estado === 'invitacion_pendiente';
      const ok = await confirmar({
        titulo: pendiente
          ? 'Se va a anular la invitación anterior'
          : 'Se va a cambiar el email con el que entra a la app',
        detalle: pendiente ? (
          <>
            <span className="font-semibold text-ink">{nombre}</span> todavía no
            usó la invitación que le mandamos a {cuenta.emailDeLaCuenta}. Al
            guardar, ese link deja de servir y le llega una invitación nueva a{' '}
            <span className="font-semibold text-ink">{email}</span>. Su legajo y
            todo lo cargado quedan igual.
          </>
        ) : (
          <>
            Desde que guardes,{' '}
            <span className="font-semibold text-ink">{nombre}</span> entra con{' '}
            <span className="font-semibold text-ink">{email}</span> en lugar de{' '}
            {cuenta.emailDeLaCuenta}. Conserva su contraseña, su legajo, sus
            recibos y sus firmas: no se crea una cuenta nueva.
            <br />
            <br />
            Avisale del cambio, porque con el email anterior no va a poder
            entrar.
          </>
        ),
        confirmar: pendiente
          ? 'Guardar y reinvitar'
          : 'Cambiar el email de acceso',
      });
      if (!ok) return;
    }

    // 1) El legajo. Si esto falla, no se guardó nada.
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
    } catch (err) {
      avisoError(
        'No pudimos guardar los cambios',
        err instanceof Error ? err.message : undefined
      );
      return;
    }

    /*
     * 2) El email, por su propio camino. Va después a propósito: si el
     * cambio de identidad falla, el resto del legajo ya quedó guardado y el
     * email sigue siendo el que funciona. Decir acá "no pudimos guardar los
     * cambios" sería falso y llevaría a reintentar todo al pedo.
     */
    if (cambioElEmail) {
      try {
        await cambiarEmailDeEmpleado(empleado.id, email);
      } catch (err) {
        if (err instanceof ErrorDeCambioDeEmail && err.requiereReinvitar) {
          // El cambio se hizo: lo que falta es una acción del admin.
          avisoError(
            'Anulamos la invitación anterior, pero el mail nuevo no salió',
            `Guardamos ${email} en la ficha y el legajo quedó sin cuenta. Invitalo de nuevo desde Permisos cuando quieras.`
          );
          router.push(`/colaboradores/${empleado.id}`);
          return;
        }
        avisoError(
          'Guardamos el legajo, pero no el email',
          `El resto de los cambios quedaron guardados. El email sigue siendo ${
            emailAnterior || '(vacío)'
          }.${err instanceof Error ? ` ${err.message}` : ''}`
        );
        return;
      }
    }

    if (cambioElEmail && cuenta?.estado === 'invitacion_pendiente') {
      avisoExito(
        'Invitación reenviada al email nuevo',
        `Anulamos la anterior y le mandamos una a ${email}. El link viejo ya no sirve.`
      );
    } else if (cambioElEmail && cuenta?.estado === 'cuenta_activa') {
      avisoExito(
        'Email de acceso actualizado',
        `${nombre} entra a la app con ${email}. Es la misma cuenta de siempre.`
      );
    } else {
      avisoExito('Cambios guardados');
    }
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
        bloqueoDeEmail={bloqueoDeEmail}
      />
      {dialogoConfirmar}
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
