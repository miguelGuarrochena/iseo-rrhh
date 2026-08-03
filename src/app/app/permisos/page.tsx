'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { IconPlus, IconShieldCheck } from '@tabler/icons-react';
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
} from '@/lib/services/rrhh';
import { AccionAuditoria, Empleado, Rol, Usuario } from '@/types/rrhh';
import { Paginacion, usePaginacion } from '@/components/app/ui/Paginacion';

const POR_PAGINA = 8;

const accionLabels: Record<string, string> = {
  crear: 'creó',
  editar: 'editó',
  cambiar_rol: 'cambió el rol de',
  cambiar_estado: 'cambió el estado de',
  invitar: 'invitó a',
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
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [auditoria, setAuditoria] = useState<AccionAuditoria[]>([]);
  const [modalAbierto, { open, close }] = useDisclosure(false);
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [rol, setRol] = useState<Exclude<Rol, 'superadmin'>>('empleado');
  const [empleadoId, setEmpleadoId] = useState('');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(() => {
    void getUsuariosDeEmpresa().then(setUsuarios);
    void getEmpleados().then(setEmpleados);
    // La auditoría es lo que respalda "quién tocó qué" ante un reclamo:
    // cortarla en 20 dejaba afuera la semana pasada. Se traen más y se
    // paginan.
    void getAuditoria(200)
      .then(setAuditoria)
      .catch(() => setAuditoria([]));
  }, []);

  useEffect(cargar, [cargar]);

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
        titulo={`Usuarios (${usuarios.length})`}
        vacio="Sin usuarios cargados."
      >
        {usuarios.map((u) => (
          <ListaItem
            key={u.id}
            icono={IconShieldCheck}
            principal={u.nombreCompleto}
            secundario={u.email}
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
                <Selector
                  tamano="sm"
                  valor={u.rol}
                  onCambiar={(v) => void cambiarRol(u.id, v as Rol)}
                  opciones={aOpciones(rolesAsignables)}
                />
              </div>
            }
          />
        ))}
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
              ...empleados.map((e) => ({
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
    </div>
  );
};

export default PermisosPage;
