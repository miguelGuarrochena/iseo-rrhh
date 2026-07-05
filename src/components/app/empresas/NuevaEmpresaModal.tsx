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
  const inicial: NuevaEmpresa = {
    nombre: '',
    cuit: '',
    razonSocial: '',
    domicilio: '',
    contactoNombre: '',
    contactoEmail: '',
    contactoTelefono: '',
    plan: '',
    abonoMensual: 0,
  };
  const [datos, setDatos] = useState<NuevaEmpresa>(inicial);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);

  const set = (campo: keyof NuevaEmpresa) => (valor: string | number) =>
    setDatos((prev) => ({ ...prev, [campo]: valor }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const nuevos = juntarErrores({
      nombre: validarRequerido(datos.nombre, 'El nombre'),
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
    await onCrear({ ...datos, abonoMensual: Number(datos.abonoMensual) || 0 });
    setEnviando(false);
    setDatos(inicial);
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
          etiqueta="Nombre *"
          value={datos.nombre}
          onChange={(e) => set('nombre')(e.target.value)}
          placeholder="Metalúrgica Ejemplo"
          error={errores.nombre}
          ayuda="Cómo se muestra la empresa."
        />
        <Campo
          etiqueta="CUIT *"
          value={datos.cuit}
          onChange={(e) => set('cuit')(e.target.value)}
          placeholder="30-12345678-9"
          error={errores.cuit}
          ayuda="Se valida el dígito verificador."
        />
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Campo
            etiqueta="Razón social"
            value={datos.razonSocial ?? ''}
            onChange={(e) => set('razonSocial')(e.target.value)}
            placeholder="Nombre legal (si difiere)"
          />
          <Campo
            etiqueta="Domicilio"
            value={datos.domicilio ?? ''}
            onChange={(e) => set('domicilio')(e.target.value)}
            placeholder="Calle, ciudad, provincia"
          />
        </div>
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Campo
            etiqueta="Plan"
            value={datos.plan ?? ''}
            onChange={(e) => set('plan')(e.target.value)}
            placeholder="Básico, Full…"
          />
          <Campo
            etiqueta="Abono mensual"
            type="number"
            value={String(datos.abonoMensual ?? '')}
            onChange={(e) => set('abonoMensual')(e.target.value)}
            placeholder="0"
          />
        </div>
        <Campo
          etiqueta="Responsable *"
          value={datos.contactoNombre}
          onChange={(e) => set('contactoNombre')(e.target.value)}
          placeholder="Quien administra RRHH"
          error={errores.contactoNombre}
        />
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Campo
            etiqueta="Email del responsable *"
            type="email"
            value={datos.contactoEmail}
            onChange={(e) => set('contactoEmail')(e.target.value)}
            placeholder="rrhh@empresa.com"
            error={errores.contactoEmail}
          />
          <Campo
            etiqueta="Teléfono"
            value={datos.contactoTelefono ?? ''}
            onChange={(e) => set('contactoTelefono')(e.target.value)}
            placeholder="11-1234-5678"
          />
        </div>

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
