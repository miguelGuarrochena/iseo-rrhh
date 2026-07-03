'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
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
import {
  cambiarRolUsuario,
  getEmpleados,
  getUsuariosDeEmpresa,
  invitarUsuario,
} from '@/lib/services/rrhh';
import { Empleado, Rol, Usuario } from '@/types/rrhh';

const rolesAsignables: Record<Exclude<Rol, 'superadmin'>, string> = {
  admin_rrhh: 'Admin RRHH',
  supervisor: 'Supervisor',
  empleado: 'Empleado',
};

const PermisosPage = () => {
  const { usuario, rolEfectivo } = useAuth();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
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
  }, []);

  useEffect(cargar, [cargar]);

  const puedeGestionar =
    usuario?.rol === 'superadmin' || rolEfectivo === 'admin_rrhh';

  if (!usuario || !puedeGestionar) {
    return (
      <p className="text-sm text-ink-soft">
        No tenés permisos para ver esta sección.
      </p>
    );
  }

  const cambiarRol = async (usuarioId: string, nuevoRol: Rol) => {
    await cambiarRolUsuario(usuarioId, nuevoRol);
    cargar();
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
    await invitarUsuario({
      nombreCompleto: nombre.trim(),
      email: email.trim(),
      rol,
      empleadoId: empleadoId || undefined,
    });
    setEnviando(false);
    setNombre('');
    setEmail('');
    setEmpleadoId('');
    close();
    cargar();
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
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
            href={
              u.empleadoId ? `/app/colaboradores/${u.empleadoId}` : undefined
            }
            icono={IconShieldCheck}
            principal={u.nombreCompleto}
            secundario={u.email}
            extremo={
              <Selector
                tamano="sm"
                valor={u.rol}
                onCambiar={(v) => void cambiarRol(u.id, v as Rol)}
                opciones={aOpciones(rolesAsignables)}
              />
            }
          />
        ))}
      </ListaCard>

      <p className="text-xs text-ink-soft">
        El rol define qué ve cada persona: los admin gestionan todo, los
        supervisores aprueban y ven indicadores de su equipo, y los empleados se
        autogestionan.
      </p>

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
