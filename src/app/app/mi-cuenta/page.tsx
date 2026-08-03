'use client';

import { FormEvent, useState } from 'react';
import { IconLock, IconUser } from '@tabler/icons-react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { Panel } from '@/components/app/Panel';
import { Boton } from '@/components/app/ui/Boton';
import { Campo } from '@/components/app/ui/Campo';
import { CampoPassword } from '@/components/app/ui/CampoPassword';
import { juntarErrores, validarRequerido } from '@/lib/validaciones';
import { avisoError, avisoExito } from '@/lib/avisos';
import { interpretarError } from '@/lib/errores';
import { actualizarMiPerfil, cambiarMiContrasena } from '@/lib/services/rrhh';

const etiquetaRol: Record<string, string> = {
  superadmin: 'Dueño de la plataforma',
  admin_rrhh: 'Admin de RRHH',
  supervisor: 'Supervisor',
  empleado: 'Colaborador',
};

const MIN_CONTRASENA = 8;

/**
 * Los datos de la propia cuenta, para cualquier rol.
 *
 * Hasta ahora no había forma de cambiar la contraseña desde adentro de
 * la app: había que salir y pedir el mail de "recuperar contraseña". Eso
 * no es sólo incómodo — si alguien te vio la clave, no la podías cambiar
 * sin cerrar la sesión primero.
 *
 * Va acá y no en Configuración porque es de la persona, no de la
 * empresa: el mismo lugar sirve para el dueño de ISEO y para alguien de
 * planta.
 */
const MiCuentaPage = () => {
  const { usuario, refrescarUsuario } = useAuth();

  const [nombre, setNombre] = useState(usuario?.nombreCompleto ?? '');
  const [guardandoPerfil, setGuardandoPerfil] = useState(false);
  const [erroresPerfil, setErroresPerfil] = useState<Record<string, string>>(
    {}
  );

  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetir, setRepetir] = useState('');
  const [cambiando, setCambiando] = useState(false);
  const [erroresClave, setErroresClave] = useState<Record<string, string>>({});

  if (!usuario) return null;

  const guardarPerfil = async (e: FormEvent) => {
    e.preventDefault();
    const nuevos = juntarErrores({
      nombre: validarRequerido(nombre, 'El nombre'),
    });
    setErroresPerfil(nuevos);
    if (Object.keys(nuevos).length > 0) return;

    setGuardandoPerfil(true);
    try {
      const actualizado = await actualizarMiPerfil(nombre.trim());
      // Sin esto el header sigue mostrando el nombre viejo hasta recargar.
      refrescarUsuario(actualizado);
      avisoExito('Listo', 'Actualizamos tu nombre.');
    } catch (err) {
      const { titulo, detalle } = interpretarError(err);
      avisoError(titulo, detalle);
    }
    setGuardandoPerfil(false);
  };

  const guardarContrasena = async (e: FormEvent) => {
    e.preventDefault();
    const nuevos = juntarErrores({
      actual: validarRequerido(actual, 'La contraseña actual'),
      nueva:
        validarRequerido(nueva, 'La contraseña nueva') ??
        (nueva.length < MIN_CONTRASENA
          ? `Tiene que tener al menos ${MIN_CONTRASENA} caracteres.`
          : nueva === actual
            ? 'La nueva tiene que ser distinta de la actual.'
            : null),
      repetir: nueva !== repetir ? 'Las contraseñas no coinciden.' : null,
    });
    setErroresClave(nuevos);
    if (Object.keys(nuevos).length > 0) return;

    setCambiando(true);
    try {
      await cambiarMiContrasena(actual, nueva);
      avisoExito(
        'Contraseña cambiada',
        'La próxima vez que entres, usá la nueva.'
      );
      setActual('');
      setNueva('');
      setRepetir('');
    } catch (err) {
      // El error más común es la contraseña actual mal puesta, y va en su
      // campo: un aviso flotante obliga a adivinar cuál de los tres falló.
      const { detalle } = interpretarError(err);
      setErroresClave({
        actual: err instanceof Error ? err.message : detalle,
      });
    }
    setCambiando(false);
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">
          Mi cuenta
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          Tus datos de acceso a la plataforma. Nada de esto lo ven los demás.
        </p>
      </div>

      <Panel>
        <h2 className="flex items-center gap-2 text-base font-bold text-ink">
          <IconUser size={18} className="text-ink-soft" />
          Tus datos
        </h2>
        <form onSubmit={guardarPerfil} className="mt-4 flex flex-col gap-3.5">
          <Campo
            etiqueta="Nombre completo"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            error={erroresPerfil.nombre}
            ayuda="Es el nombre con el que te ven en comunicaciones y en la actividad registrada."
          />
          <Campo
            etiqueta="Email"
            value={usuario.email}
            disabled
            ayuda="El email es tu identidad para entrar y no se puede cambiar desde acá. Si necesitás otro, escribinos."
          />
          <div className="rounded-xl bg-paper px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-widest text-ink-soft">
              Tu rol
            </p>
            <p className="mt-0.5 text-sm font-semibold text-ink">
              {etiquetaRol[usuario.rol] ?? usuario.rol}
            </p>
          </div>
          <Boton
            type="submit"
            disabled={guardandoPerfil || nombre === usuario.nombreCompleto}
            className="self-start"
          >
            {guardandoPerfil ? 'Guardando…' : 'Guardar cambios'}
          </Boton>
        </form>
      </Panel>

      <Panel>
        <h2 className="flex items-center gap-2 text-base font-bold text-ink">
          <IconLock size={18} className="text-ink-soft" />
          Cambiar contraseña
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          Te pedimos la actual para confirmar que sos vos: si dejaste la sesión
          abierta en algún lado, que nadie pueda quedarse con tu cuenta.
        </p>
        <form
          onSubmit={guardarContrasena}
          className="mt-4 flex max-w-md flex-col gap-3.5"
        >
          <CampoPassword
            etiqueta="Contraseña actual"
            value={actual}
            onChange={(e) => setActual(e.target.value)}
            error={erroresClave.actual}
            autoComplete="current-password"
          />
          <CampoPassword
            etiqueta="Contraseña nueva"
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
            error={erroresClave.nueva}
            autoComplete="new-password"
            ayuda={`Mínimo ${MIN_CONTRASENA} caracteres.`}
          />
          <CampoPassword
            etiqueta="Repetir la nueva"
            value={repetir}
            onChange={(e) => setRepetir(e.target.value)}
            error={erroresClave.repetir}
            autoComplete="new-password"
          />
          <Boton type="submit" disabled={cambiando} className="self-start">
            {cambiando ? 'Cambiando…' : 'Cambiar contraseña'}
          </Boton>
        </form>
      </Panel>
    </div>
  );
};

export default MiCuentaPage;
