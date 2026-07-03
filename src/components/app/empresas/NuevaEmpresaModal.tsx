'use client';

import { FormEvent, useState } from 'react';
import { Modal } from '@mantine/core';
import { Boton } from '@/components/app/ui/Boton';
import { Campo } from '@/components/app/ui/Campo';
import {
  juntarErrores,
  validarCuit,
  validarEmail,
  validarRequerido,
} from '@/lib/validaciones';
import { NuevaEmpresa } from '@/types/rrhh';

interface NuevaEmpresaModalProps {
  abierto: boolean;
  onCerrar: () => void;
  onCrear: (datos: NuevaEmpresa) => Promise<void>;
}

export const NuevaEmpresaModal = ({
  abierto,
  onCerrar,
  onCrear,
}: NuevaEmpresaModalProps) => {
  const [datos, setDatos] = useState<NuevaEmpresa>({
    nombre: '',
    cuit: '',
    contactoNombre: '',
    contactoEmail: '',
  });
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);

  const set = (campo: keyof NuevaEmpresa) => (valor: string) =>
    setDatos((prev) => ({ ...prev, [campo]: valor }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const nuevos = juntarErrores({
      nombre: validarRequerido(datos.nombre, 'La razón social'),
      cuit: validarRequerido(datos.cuit, 'El CUIT') ?? validarCuit(datos.cuit),
      contactoNombre: validarRequerido(
        datos.contactoNombre,
        'El nombre de contacto'
      ),
      contactoEmail:
        validarRequerido(datos.contactoEmail, 'El email de contacto') ??
        validarEmail(datos.contactoEmail),
    });
    setErrores(nuevos);
    if (Object.keys(nuevos).length > 0) return;

    setEnviando(true);
    await onCrear(datos);
    setEnviando(false);
    setDatos({ nombre: '', cuit: '', contactoNombre: '', contactoEmail: '' });
  };

  return (
    <Modal
      opened={abierto}
      onClose={onCerrar}
      title="Nueva empresa"
      radius="lg"
      centered
      styles={{ title: { fontWeight: 800 } }}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-3.5" noValidate>
        <Campo
          etiqueta="Razón social *"
          value={datos.nombre}
          onChange={(e) => set('nombre')(e.target.value)}
          placeholder="Metalúrgica Ejemplo S.A."
          error={errores.nombre}
        />
        <Campo
          etiqueta="CUIT *"
          value={datos.cuit}
          onChange={(e) => set('cuit')(e.target.value)}
          placeholder="30-12345678-9"
          error={errores.cuit}
          ayuda="Se valida el dígito verificador."
        />
        <Campo
          etiqueta="Contacto (nombre) *"
          value={datos.contactoNombre}
          onChange={(e) => set('contactoNombre')(e.target.value)}
          placeholder="Quien administra RRHH"
          error={errores.contactoNombre}
        />
        <Campo
          etiqueta="Contacto (email) *"
          type="email"
          value={datos.contactoEmail}
          onChange={(e) => set('contactoEmail')(e.target.value)}
          placeholder="rrhh@empresa.com"
          error={errores.contactoEmail}
        />

        <Boton
          type="submit"
          disabled={enviando}
          className="mt-1 py-3 text-base"
        >
          {enviando ? 'Creando…' : 'Crear empresa'}
        </Boton>
      </form>
    </Modal>
  );
};
