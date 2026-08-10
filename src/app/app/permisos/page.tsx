'use client';

import { FormEvent, useCallback, useState } from 'react';
import Link from 'next/link';
import { IconLink, IconPlus, IconShieldCheck } from '@tabler/icons-react';
import { Modal } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useAuth } from '@/lib/auth/AuthProvider';
import { ListaCard, ListaItem } from '@/components/app/dashboard/ListaCard';
import { Boton } from '@/components/app/ui/Boton';
import { Campo, CampoSelect } from '@/components/app/ui/Campo';
import { aOpciones, Selector } from '@/components/app/ui/Selector';
import {
  juntarErrores,
  validarEmail,
  validarRequerido,
} from '@/lib/validaciones';
import { avisoError, avisoExito } from '@/lib/avisos';
import {
  cambiarRolUsuario,
  getAuditoria,
  getEmpleados,
  getUsuariosDeEmpresa,
  invitarUsuario,
  vincularUsuarioAEmpleado,
} from '@/lib/services/rrhh';
import { AccionAuditoria, Empleado, Rol, Usuario } from '@/types/rrhh';
import { Paginacion, usePaginacion } from '@/components/app/ui/Paginacion';
import { RequireEmpresa } from '@/components/app/RequireEmpresa';
import { EstadoCarga } from '@/components/app/EstadoCarga';
import { useCarga } from '@/lib/useCarga';

const POR_PAGINA = 8;

const accionLabels: Record<string, string> = {
  crear: 'creó',
  editar: 'editó',
  cambiar_rol: 'cambió el rol de',
  cambiar_estado: 'cambió el estado de',
  invitar: 'invitó a',
  vincular: 'vinculó con un colaborador a',
  desvincular: 'desvinculó de su colaborador a',
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

const PermisosPage = () => {
  const { usuario, rolEfectivo, empresaVista } = useAuth();
  const [modalAbierto, { open, close }] = useDisclosure(false);
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [rol, setRol] = useState<Exclude<Rol, 'superadmin'>>('empleado');
  const [empleadoId, setEmpleadoId] = useState('');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [vinculando, setVinculando] = useState<Usuario | null>(null);
  const [empleadoVinculo, setEmpleadoVinculo] = useState('');
  const [errorVinculo, setErrorVinculo] = useState<string>();
  const [guardandoVinculo, setGuardandoVinculo] = useState(false);

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

  // Los empleados sólo llenan el desplegable de la invitación: si no
  // vienen, la pantalla sigue siendo útil.
  const cargaEmpleados = useCarga(() => getEmpleados(), [], {
    contexto: 'permisos/empleados',
    inicial: [] as Empleado[],
  });
  const empleados = cargaEmpleados.datos;

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
    cargaAuditoria.recargar();
  }, [cargaUsuarios, cargaEmpleados, cargaAuditoria]);

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

  /**
   * Colaboradores que se le pueden ofrecer a esta cuenta: los que ya
   * tiene otra cuenta quedan afuera para no terminar con dos personas
   * viendo el mismo recibo. El vínculo actual se agrega siempre, incluso
   * si el colaborador está dado de baja, para que el desplegable no
   * aparezca vacío en una cuenta que sí está vinculada.
   */
  const opcionesDeVinculo = (u: Usuario) => {
    const libres = empleados.filter(
      (e) => !empleadosConCuenta.has(e.id) || e.id === u.empleadoId
    );
    const vinculado = u.empleadoId
      ? libres.find((e) => e.id === u.empleadoId)
      : undefined;
    return [
      { valor: '', etiqueta: 'Sin vincular' },
      ...(u.empleadoId && !vinculado
        ? [{ valor: u.empleadoId, etiqueta: 'Colaborador dado de baja' }]
        : []),
      ...libres.map((e) => ({
        valor: e.id,
        etiqueta: `${e.nombre} ${e.apellido} — ${e.puesto}`,
      })),
    ];
  };

  const nombreDeEmpleado = (empleadoId: string) => {
    const e = empleados.find((x) => x.id === empleadoId);
    return e ? `${e.nombre} ${e.apellido}` : 'colaborador dado de baja';
  };

  const abrirVinculo = (u: Usuario) => {
    setVinculando(u);
    setEmpleadoVinculo(u.empleadoId ?? '');
    setErrorVinculo(undefined);
  };

  const guardarVinculo = async (e: FormEvent) => {
    e.preventDefault();
    if (!vinculando) return;
    setGuardandoVinculo(true);
    try {
      await vincularUsuarioAEmpleado(vinculando.id, empleadoVinculo || null);
      avisoExito(
        empleadoVinculo ? 'Cuenta vinculada' : 'Cuenta desvinculada',
        empleadoVinculo
          ? 'El legajo ya figura con cuenta y esa persona ve sus recibos y su ficha.'
          : 'La cuenta sigue pudiendo entrar, pero ya no está unida a ningún legajo.'
      );
      setVinculando(null);
      cargar();
    } catch (err) {
      setErrorVinculo(
        err instanceof Error ? err.message : 'No pudimos guardar el vínculo.'
      );
    }
    setGuardandoVinculo(false);
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
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            Permisos
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            Quién puede entrar a la plataforma y con qué rol.
          </p>
        </div>
        <Boton variante="negro" onClick={open}>
          <IconPlus size={18} />
          Invitar usuario
        </Boton>
      </div>

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
            lista.map((u) => (
              <ListaItem
                key={u.id}
                icono={IconShieldCheck}
                principal={u.nombreCompleto}
                secundario={
                  u.empleadoId
                    ? `${u.email} · ${nombreDeEmpleado(u.empleadoId)}`
                    : `${u.email} · sin colaborador vinculado`
                }
                extremo={
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {u.empleadoId && (
                      <Link
                        href={`/colaboradores/${u.empleadoId}`}
                        className="text-xs font-bold text-brand-700 no-underline hover:underline"
                      >
                        Ver ficha
                      </Link>
                    )}
                    <Boton
                      variante={u.empleadoId ? 'secundario' : 'primario'}
                      tamano="sm"
                      onClick={() => abrirVinculo(u)}
                    >
                      <IconLink size={15} />
                      {u.empleadoId ? 'Cambiar vínculo' : 'Vincular'}
                    </Boton>
                    <Selector
                      tamano="sm"
                      valor={u.rol}
                      onCambiar={(v) => void cambiarRol(u.id, v as Rol)}
                      opciones={aOpciones(rolesAsignables)}
                    />
                  </div>
                }
              />
            ))
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
              secundario={new Date(a.creadaEn).toLocaleString('es-AR')}
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
            etiqueta="Vincular a colaborador (opcional)"
            value={empleadoId}
            onChange={setEmpleadoId}
            ayuda="Si es un empleado de la empresa, uní el usuario a su ficha."
            opciones={[
              { valor: '', etiqueta: 'Sin vincular' },
              // Los que ya tienen cuenta no se ofrecen: invitarlos otra
              // vez falla igual, porque un legajo admite una sola.
              ...empleados
                .filter((e) => !empleadosConCuenta.has(e.id))
                .map((e) => ({
                  valor: e.id,
                  etiqueta: `${e.nombre} ${e.apellido} — ${e.puesto}`,
                })),
            ]}
          />

          <Boton type="submit" disabled={enviando} className="mt-1 py-3">
            {enviando ? 'Invitando…' : 'Enviar invitación'}
          </Boton>
        </form>
      </Modal>

      <Modal
        opened={vinculando !== null}
        onClose={() => setVinculando(null)}
        title="Vincular con un colaborador"
        radius="lg"
        centered
        styles={{ title: { fontWeight: 800 } }}
      >
        {vinculando && (
          <form onSubmit={guardarVinculo} className="flex flex-col gap-3.5">
            <p className="text-sm text-ink-soft">
              Cuenta de{' '}
              <span className="font-semibold text-ink">
                {vinculando.nombreCompleto}
              </span>{' '}
              ({vinculando.email}).
            </p>
            <CampoSelect
              etiqueta="Colaborador"
              value={empleadoVinculo}
              onChange={setEmpleadoVinculo}
              ayuda="Sin vínculo, el legajo figura “sin cuenta” y esa persona no ve sus recibos aunque pueda entrar a la app."
              opciones={opcionesDeVinculo(vinculando)}
              error={errorVinculo}
            />
            <Boton
              type="submit"
              disabled={guardandoVinculo}
              className="mt-1 py-3"
            >
              {guardandoVinculo ? 'Guardando…' : 'Guardar vínculo'}
            </Boton>
          </form>
        )}
      </Modal>
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
