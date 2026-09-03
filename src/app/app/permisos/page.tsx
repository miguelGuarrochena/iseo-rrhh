'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  IconAlertTriangle,
  IconPlus,
  IconSettings,
  IconShieldCheck,
} from '@tabler/icons-react';
import { Modal } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useAuth } from '@/lib/auth/AuthProvider';
import { ListaCard, ListaItem } from '@/components/app/dashboard/ListaCard';
import { Boton } from '@/components/app/ui/Boton';
import { Campo, CampoSelect } from '@/components/app/ui/Campo';
import { aOpciones, Selector } from '@/components/app/ui/Selector';
import { useConfirmacion } from '@/components/app/ui/useConfirmacion';
import { GestionCuentaModal } from '@/components/app/permisos/GestionCuentaModal';
import {
  juntarErrores,
  validarEmail,
  validarRequerido,
} from '@/lib/validaciones';
import { avisoError, avisoExito } from '@/lib/avisos';
import {
  cambiarRolUsuario,
  completarAlta,
  getAuditoria,
  getEmpleados,
  getEstadoDeCuentas,
  getUsuariosDeEmpresa,
  invitarUsuario,
  quitarAcceso,
  reenviarInvitacion,
} from '@/lib/services/rrhh';
import {
  AccionAuditoria,
  CuentaDeAcceso,
  Empleado,
  Rol,
  Usuario,
} from '@/types/rrhh';
import { Paginacion, usePaginacion } from '@/components/app/ui/Paginacion';
import { RequireEmpresa } from '@/components/app/RequireEmpresa';
import { EstadoCarga } from '@/components/app/EstadoCarga';
import { useCarga } from '@/lib/useCarga';
import { formatearInstante } from '@/lib/fechas';

const POR_PAGINA = 8;

const accionLabels: Record<string, string> = {
  crear: 'creó',
  editar: 'editó',
  cambiar_rol: 'cambió el rol de',
  cambiar_estado: 'cambió el estado de',
  invitar: 'invitó a',
  reinvitar: 'reenvió la invitación de',
  vincular: 'vinculó con un colaborador a',
  desvincular: 'desvinculó de su colaborador a',
  quitar_acceso: 'quitó el acceso de',
  eliminar: 'eliminó',
};

const entidadLabels: Record<string, string> = {
  usuario: 'un usuario',
  empresa: 'una empresa',
};

const rolesAsignables: Record<Exclude<Rol, 'superadmin'>, string> = {
  admin_rrhh: 'Admin RRHH',
  supervisor: 'Supervisor',
  empleado: 'Empleado',
};

/** Aviso corto al lado del nombre. Lo que no está bien se ve sin abrir nada. */
const Chip = ({ texto, tono }: { texto: string; tono: 'ambar' | 'neutro' }) => (
  <span
    className={`rounded-full px-2.5 py-1 text-[0.68rem] font-bold ${
      tono === 'ambar'
        ? 'bg-amber-100 text-amber-900'
        : 'bg-paper text-ink-soft'
    }`}
  >
    {texto}
  </span>
);

const PermisosPage = () => {
  const { usuario, rolEfectivo, empresaVista } = useAuth();
  const searchParams = useSearchParams();
  const { confirmar, dialogo: dialogoConfirmar } = useConfirmacion();
  const [modalAbierto, { open, close }] = useDisclosure(false);
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [rol, setRol] = useState<Exclude<Rol, 'superadmin'>>('empleado');
  const [empleadoId, setEmpleadoId] = useState('');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [gestionando, setGestionando] = useState<Usuario | null>(null);

  /**
   * Los usuarios son el contenido de la pantalla: si fallan, hay que
   * decirlo y ofrecer reintentar, no dejar una lista vacía que parece
   * "esta empresa no tiene usuarios".
   */
  const cargaUsuarios = useCarga(() => getUsuariosDeEmpresa(), [], {
    contexto: 'permisos/usuarios',
    inicial: [] as Usuario[],
  });
  const usuarios = cargaUsuarios.datos;

  // Los empleados llenan los desplegables de invitación y vínculo: si no
  // vienen, la pantalla sigue siendo útil.
  const cargaEmpleados = useCarga(() => getEmpleados(), [], {
    contexto: 'permisos/empleados',
    inicial: [] as Empleado[],
  });
  const empleados = cargaEmpleados.datos;

  // El estado de cada invitación vive en Auth y se pide aparte: si esta
  // consulta falla, la lista de usuarios se ve igual, sólo sin los avisos
  // de "pendiente".
  const cargaCuentas = useCarga(() => getEstadoDeCuentas(), [], {
    contexto: 'permisos/cuentas',
    inicial: [] as CuentaDeAcceso[],
  });
  const cuentas = cargaCuentas.datos;

  // La auditoría es lo que respalda "quién tocó qué" ante un reclamo:
  // cortarla en 20 dejaba afuera la semana pasada. Se traen más y se
  // paginan.
  const cargaAuditoria = useCarga(() => getAuditoria(200), [], {
    contexto: 'permisos/auditoria',
    inicial: [] as AccionAuditoria[],
  });
  const auditoria = cargaAuditoria.datos;

  const cargar = useCallback(() => {
    cargaUsuarios.recargar();
    cargaEmpleados.recargar();
    cargaCuentas.recargar();
    cargaAuditoria.recargar();
  }, [cargaUsuarios, cargaEmpleados, cargaCuentas, cargaAuditoria]);

  /**
   * Se llega acá desde el aviso "sin cuenta" de un colaborador
   * (`/permisos?empleado=ple-3`): se abre la invitación con sus datos
   * puestos, para no tener que buscarlo de nuevo ni copiar el email a
   * mano —que es donde se colaba el error que dejaba la cuenta sin
   * vincular.
   */
  const atajoUsado = useRef(false);
  useEffect(() => {
    const id = searchParams.get('empleado');
    if (!id || atajoUsado.current || empleados.length === 0) return;
    const e = empleados.find((x) => x.id === id);
    if (!e) return;
    atajoUsado.current = true;
    setNombre(`${e.nombre} ${e.apellido}`);
    setEmail(e.email ?? '');
    setEmpleadoId(e.id);
    setRol('empleado');
    open();
  }, [searchParams, empleados, open]);

  const {
    pagina,
    setPagina,
    totalPaginas,
    visibles: auditoriaVisible,
  } = usePaginacion(auditoria, POR_PAGINA);

  const puedeGestionar =
    usuario?.rol === 'superadmin' || rolEfectivo === 'admin_rrhh';

  if (!usuario || !puedeGestionar) {
    return (
      <p className="text-sm text-ink-soft">
        No tenés permisos para ver esta sección.
      </p>
    );
  }

  const admins = usuarios.filter((u) => u.rol === 'admin_rrhh');

  const empleadosConCuenta = new Set(
    usuarios.filter((u) => u.empleadoId).map((u) => u.empleadoId as string)
  );

  const cuentaDe = (u: Usuario) => cuentas.find((c) => c.usuarioId === u.id);

  // Cuentas que existen para entrar pero que la app no sabe de quién son.
  const aMedias = cuentas.filter((c) => c.estado === 'sin_perfil');

  const nombreDeEmpleado = (id: string) => {
    const e = empleados.find((x) => x.id === id);
    return e ? `${e.nombre} ${e.apellido}` : 'colaborador dado de baja';
  };

  const cambiarRol = async (usuarioId: string, nuevoRol: Rol) => {
    try {
      await cambiarRolUsuario(usuarioId, nuevoRol);
      cargar();
    } catch (err) {
      // Antes fallaba en silencio: el selector volvía solo y no se sabía
      // por qué. El caso típico es querer bajar al único admin.
      avisoError(
        'No pudimos cambiar el rol',
        err instanceof Error ? err.message : undefined
      );
      cargar();
    }
  };

  const rehacerInvitacion = async (correo: string) => {
    const ok = await confirmar({
      titulo: 'Rehacer la invitación',
      detalle: `Se vuelve a crear el alta de ${correo} y le llega un mail nuevo para poner su contraseña. El link anterior deja de servir.`,
      confirmar: 'Reenviar',
    });
    if (!ok) return;
    try {
      await reenviarInvitacion(correo);
      avisoExito('Invitación reenviada', `${correo} va a recibir el mail.`);
      cargar();
    } catch (err) {
      avisoError(
        'No pudimos reenviar la invitación',
        err instanceof Error ? err.message : undefined
      );
    }
  };

  const completarCuenta = async (correo: string) => {
    try {
      await completarAlta(correo);
      avisoExito(
        'Alta completada',
        `${correo} ya puede entrar con la contraseña que tenga.`
      );
      cargar();
    } catch (err) {
      avisoError(
        'No pudimos completar el alta',
        err instanceof Error ? err.message : undefined
      );
    }
  };

  const liberarCuenta = async (correo: string) => {
    const ok = await confirmar({
      titulo: '¿Borrar esta cuenta?',
      detalle: `Se elimina el acceso de ${correo} y su email queda libre para volver a invitarlo desde cero.`,
      confirmar: 'Borrar cuenta',
      peligrosa: true,
    });
    if (!ok) return;
    try {
      await quitarAcceso(correo);
      avisoExito('Cuenta borrada', `${correo} ya no existe en la plataforma.`);
      cargar();
    } catch (err) {
      avisoError(
        'No pudimos borrar la cuenta',
        err instanceof Error ? err.message : undefined
      );
    }
  };

  const invitar = async (e: FormEvent) => {
    e.preventDefault();
    const nuevos = juntarErrores({
      nombre: validarRequerido(nombre, 'El nombre'),
      email: validarRequerido(email, 'El email') ?? validarEmail(email),
    });
    setErrores(nuevos);
    if (Object.keys(nuevos).length > 0) return;
    setEnviando(true);
    try {
      await invitarUsuario({
        nombreCompleto: nombre.trim(),
        email: email.trim(),
        rol,
        empleadoId: empleadoId || undefined,
        empresaId: empresaVista?.id ?? usuario?.empresaId ?? undefined,
      });
      avisoExito(
        'Invitación enviada',
        `${email.trim()} va a recibir el mail para crear su contraseña.`
      );
    } catch (err) {
      setErrores({
        email: err instanceof Error ? err.message : 'No pudimos invitar.',
      });
      setEnviando(false);
      return;
    }
    setEnviando(false);
    setNombre('');
    setEmail('');
    setEmpleadoId('');
    close();
    cargar();
  };

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[1.75rem]">
            Permisos
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-soft">
            Quién puede entrar, con qué rol y a qué colaborador está vinculado.
          </p>
        </div>
        <Boton variante="negro" onClick={open}>
          <IconPlus size={18} />
          Invitar usuario
        </Boton>
      </div>

      {aMedias.length > 0 && (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 sm:px-5">
          <div className="flex items-start gap-2.5">
            <IconAlertTriangle
              size={18}
              className="mt-px shrink-0 text-amber-700"
            />
            <div>
              <p className="text-sm font-bold text-amber-900">
                Cuentas que quedaron a medias
              </p>
              <p className="mt-0.5 text-xs text-amber-900">
                Recibieron el mail y pueden poner una contraseña, pero la app no
                sabe quiénes son: al entrar les dice que su cuenta no tiene
                perfil. <strong>Completar el alta</strong> lo resuelve sin
                molestarlas —siguen usando la contraseña que ya tengan—. Rehacer
                la invitación manda un mail nuevo y sirve para quien todavía no
                entró.
              </p>
            </div>
          </div>
          {aMedias.map((c) => (
            <div
              key={c.email}
              className="flex flex-col gap-2 rounded-xl bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">
                  {c.nombre}
                </p>
                <p className="truncate text-xs text-ink-soft">{c.email}</p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Boton
                  tamano="sm"
                  variante="primario"
                  onClick={() => void completarCuenta(c.email)}
                >
                  Completar el alta
                </Boton>
                <Boton
                  tamano="sm"
                  variante="secundario"
                  onClick={() => void rehacerInvitacion(c.email)}
                >
                  Rehacer invitación
                </Boton>
                <Boton
                  tamano="sm"
                  variante="rechazar"
                  onClick={() => void liberarCuenta(c.email)}
                >
                  Borrar
                </Boton>
              </div>
            </div>
          ))}
        </div>
      )}

      <ListaCard
        titulo={
          cargaUsuarios.fase === 'ok'
            ? `Usuarios (${usuarios.length})`
            : 'Usuarios'
        }
        tieneItems
      >
        <EstadoCarga
          carga={cargaUsuarios}
          vacio="Sin usuarios cargados."
          filas={3}
        >
          {(lista) =>
            lista.map((u) => {
              const cuenta = cuentaDe(u);
              return (
                <ListaItem
                  key={u.id}
                  icono={IconShieldCheck}
                  principal={u.nombreCompleto}
                  secundario={
                    u.empleadoId
                      ? `${u.email} · ${nombreDeEmpleado(u.empleadoId)}`
                      : u.email
                  }
                  extremo={
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {cuenta?.estado === 'pendiente' && (
                        <Chip texto="Invitación pendiente" tono="ambar" />
                      )}
                      {!u.empleadoId && (
                        <Chip texto="Sin colaborador" tono="neutro" />
                      )}
                      {u.empleadoId && (
                        <Link
                          href={`/colaboradores/${u.empleadoId}`}
                          className="text-xs font-bold text-brand-700 no-underline hover:underline"
                        >
                          Ver ficha
                        </Link>
                      )}
                      <Selector
                        tamano="sm"
                        valor={u.rol}
                        onCambiar={(v) => void cambiarRol(u.id, v as Rol)}
                        opciones={aOpciones(rolesAsignables)}
                      />
                      <Boton
                        tamano="sm"
                        variante="secundario"
                        onClick={() => setGestionando(u)}
                        aria-label={`Gestionar la cuenta de ${u.nombreCompleto}`}
                      >
                        <IconSettings size={15} />
                        Gestionar
                      </Boton>
                    </div>
                  }
                />
              );
            })
          }
        </EstadoCarga>
      </ListaCard>

      {admins.length === 1 && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-900">
          <span className="font-bold">
            Hay un solo admin en esta empresa ({admins[0].nombreCompleto}).
          </span>{' '}
          Si esa persona se va o pierde el acceso, nadie más puede dar de alta
          colaboradores ni cargar recibos. Conviene nombrar a un segundo admin.
        </p>
      )}

      {auditoria.length > 0 && (
        <ListaCard titulo="Actividad reciente">
          {auditoriaVisible.map((a) => (
            <ListaItem
              key={a.id}
              icono={IconShieldCheck}
              principal={`${a.actorNombre} ${accionLabels[a.accion] ?? a.accion} ${entidadLabels[a.entidad] ?? a.entidad}`}
              secundario={formatearInstante(a.creadaEn)}
            />
          ))}
          <Paginacion
            pagina={pagina}
            totalPaginas={totalPaginas}
            onCambiar={setPagina}
          />
        </ListaCard>
      )}

      <div className="flex flex-col gap-2 rounded-xl bg-paper px-4 py-3 text-xs text-ink-soft">
        <p>
          El rol define qué ve cada persona: los admin gestionan todo, los
          supervisores aprueban y ven indicadores de su equipo, y los empleados
          se autogestionan.
        </p>
        <p>
          <span className="font-semibold text-ink">
            Vincular no es lo mismo que invitar:
          </span>{' '}
          la invitación le da acceso a la app; el vínculo con el colaborador es
          lo que hace que vea sus recibos, su ficha y sus ausencias. Una cuenta
          sin vincular entra pero no encuentra nada suyo.
        </p>
        <p>
          <span className="font-semibold text-ink">
            Si cedés la administración de la empresa:
          </span>{' '}
          nombrá admin a quien la va a llevar. Tu cuenta de ISEO RH sigue viendo
          la empresa igual —el acceso de soporte no depende de figurar en esta
          lista—, pero las tareas del día a día pasan a ser de esa persona.
        </p>
      </div>

      <Modal
        opened={modalAbierto}
        onClose={close}
        title="Invitar usuario"
        radius="lg"
        centered
        styles={{ title: { fontWeight: 800 } }}
      >
        <form onSubmit={invitar} className="flex flex-col gap-3.5" noValidate>
          <Campo
            etiqueta="Nombre completo *"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            error={errores.nombre}
          />
          <Campo
            etiqueta="Email *"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="persona@empresa.com"
            error={errores.email}
            ayuda="Va a recibir la invitación para crear su contraseña."
          />
          <CampoSelect
            etiqueta="Rol"
            value={rol}
            onChange={(v) => setRol(v as Exclude<Rol, 'superadmin'>)}
            opciones={aOpciones(rolesAsignables)}
          />
          <CampoSelect
            etiqueta="Vincular a colaborador"
            value={empleadoId}
            onChange={setEmpleadoId}
            ayuda="Sin esto la persona entra a la app pero no ve sus recibos ni su ficha. Se puede cambiar después desde “Gestionar”. Los marcados “No le vamos a dar cuenta en la app” no figuran acá: para invitarlos, destildá esa opción en su ficha."
            opciones={[
              { valor: '', etiqueta: 'Sin vincular' },
              // Los que ya tienen cuenta no se ofrecen: un legajo admite
              // una sola, y la invitación fallaría igual.
              //
              // Los marcados "No le vamos a dar cuenta en la app" tampoco:
              // es una decisión tomada en su ficha, y ofrecerlos acá deja
              // invitarlos en dos clics sin que nada avise que contradice
              // lo que dice el legajo. Para darle acceso hay que destildar
              // esa opción primero, que es donde está escrita la decisión.
              ...empleados
                .filter((e) => !empleadosConCuenta.has(e.id) && !e.sinUsuario)
                .map((e) => ({
                  valor: e.id,
                  etiqueta: `${e.apellido}, ${e.nombre} — ${e.puesto}`,
                })),
            ]}
          />

          <Boton type="submit" disabled={enviando} className="mt-1 py-3">
            {enviando ? 'Invitando…' : 'Enviar invitación'}
          </Boton>
        </form>
      </Modal>

      <GestionCuentaModal
        usuario={gestionando}
        cuenta={gestionando ? cuentaDe(gestionando) : undefined}
        empleados={empleados}
        empleadosConCuenta={empleadosConCuenta}
        onCerrar={() => setGestionando(null)}
        onCambio={cargar}
      />
      {dialogoConfirmar}
    </div>
  );
};

/** Trabaja sobre una empresa concreta: sin una activa no hay qué pedir. */
const PermisosPageConEmpresa = () => (
  <RequireEmpresa>
    <PermisosPage />
  </RequireEmpresa>
);

export default PermisosPageConEmpresa;
