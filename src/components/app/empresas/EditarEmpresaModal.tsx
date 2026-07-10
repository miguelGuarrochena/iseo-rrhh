'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@mantine/core';
import { IconLogin2 } from '@tabler/icons-react';
import { Boton } from '@/components/app/ui/Boton';
import { Campo } from '@/components/app/ui/Campo';
import { actualizarDatosEmpresa } from '@/lib/services/rrhh';
import { avisoError, avisoExito } from '@/lib/avisos';
import { formatearPesos } from '@/lib/formato';
import {
  juntarErrores,
  validarCuit,
  validarEmail,
  validarRequerido,
} from '@/lib/validaciones';
import { DatosEmpresaCliente, Empresa } from '@/types/rrhh';

interface EditarEmpresaModalProps {
  empresa: Empresa | null;
  empleados: number;
  onCerrar: () => void;
  onGuardado: () => void;
  onIngresar: (empresa: Empresa) => void;
  onCambiarEstado: (empresa: Empresa) => void;
}

const vacio: DatosEmpresaCliente = {};

export const EditarEmpresaModal = ({
  empresa,
  empleados,
  onCerrar,
  onGuardado,
  onIngresar,
  onCambiarEstado,
}: EditarEmpresaModalProps) => {
  const [datos, setDatos] = useState<DatosEmpresaCliente>(vacio);
  const [guardando, setGuardando] = useState(false);
  const [errores, setErrores] = useState<Record<string, string>>({});

  useEffect(() => {
    if (empresa) {
      setDatos({
        nombre: empresa.nombre,
        razonSocial: empresa.razonSocial ?? '',
        cuit: empresa.cuit,
        domicilio: empresa.domicilio ?? '',
        contactoNombre: empresa.contactoNombre,
        contactoEmail: empresa.contactoEmail,
        contactoTelefono: empresa.contactoTelefono ?? '',
        plan: empresa.plan ?? '',
        abonoMensual: empresa.abonoMensual ?? 0,
      });
    }
  }, [empresa]);

  const set =
    (campo: keyof DatosEmpresaCliente) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setDatos((prev) => ({ ...prev, [campo]: e.target.value }));

  const guardar = async () => {
    if (!empresa) return;
    const nuevos = juntarErrores({
      nombre: validarRequerido(datos.nombre ?? '', 'El nombre comercial'),
      cuit:
        validarRequerido(datos.cuit ?? '', 'El CUIT') ??
        validarCuit(datos.cuit ?? ''),
      contactoNombre: validarRequerido(
        datos.contactoNombre ?? '',
        'El responsable'
      ),
      contactoEmail:
        validarRequerido(
          datos.contactoEmail ?? '',
          'El email del responsable'
        ) ?? validarEmail(datos.contactoEmail ?? ''),
    });
    setErrores(nuevos);
    if (Object.keys(nuevos).length > 0) return;

    setGuardando(true);
    try {
      await actualizarDatosEmpresa(empresa.id, {
        ...datos,
        abonoMensual: Number(datos.abonoMensual) || 0,
      });
      avisoExito('Ficha actualizada');
      onGuardado();
      onCerrar();
    } catch (err) {
      avisoError(
        'No pudimos guardar',
        err instanceof Error ? err.message : undefined
      );
    }
    setGuardando(false);
  };

  const activa = empresa?.estado === 'activa';

  return (
    <Modal
      opened={Boolean(empresa)}
      onClose={onCerrar}
      title="Ficha de la empresa"
      radius="lg"
      centered
      size="lg"
      styles={{ title: { fontWeight: 800 } }}
    >
      {empresa && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3 rounded-xl bg-paper px-4 py-3">
            <div>
              <p className="text-sm font-bold text-ink">{empresa.nombre}</p>
              <p className="text-xs text-ink-soft">
                {empleados} {empleados === 1 ? 'empleado' : 'empleados'} · abono{' '}
                {formatearPesos(empresa.abonoMensual ?? 0)}
              </p>
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                activa
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-red-100 text-red-700'
              }`}
            >
              {activa ? 'Activa' : 'Suspendida'}
            </span>
          </div>

          <div className="grid gap-3.5 sm:grid-cols-2">
            <Campo
              etiqueta="Nombre comercial"
              value={datos.nombre ?? ''}
              onChange={set('nombre')}
              error={errores.nombre}
            />
            <Campo
              etiqueta="Razón social"
              value={datos.razonSocial ?? ''}
              onChange={set('razonSocial')}
            />
            <Campo
              etiqueta="CUIT"
              value={datos.cuit ?? ''}
              onChange={set('cuit')}
              error={errores.cuit}
            />
            <Campo
              etiqueta="Plan"
              value={datos.plan ?? ''}
              onChange={set('plan')}
              placeholder="Básico, Full…"
            />
            <Campo
              etiqueta="Abono mensual"
              type="number"
              value={String(datos.abonoMensual ?? '')}
              onChange={set('abonoMensual')}
            />
            <Campo
              etiqueta="Domicilio"
              value={datos.domicilio ?? ''}
              onChange={set('domicilio')}
            />
            <Campo
              etiqueta="Responsable"
              value={datos.contactoNombre ?? ''}
              onChange={set('contactoNombre')}
              error={errores.contactoNombre}
            />
            <Campo
              etiqueta="Email del responsable"
              type="email"
              value={datos.contactoEmail ?? ''}
              onChange={set('contactoEmail')}
              error={errores.contactoEmail}
            />
            <Campo
              etiqueta="Teléfono del responsable"
              value={datos.contactoTelefono ?? ''}
              onChange={set('contactoTelefono')}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <Boton onClick={() => void guardar()} disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar cambios'}
            </Boton>
            {activa && (
              <Boton variante="secundario" onClick={() => onIngresar(empresa)}>
                <IconLogin2 size={16} />
                Ingresar
              </Boton>
            )}
            <div className="ml-auto">
              <Boton
                variante={activa ? 'rechazar' : 'aprobar'}
                onClick={() => onCambiarEstado(empresa)}
              >
                {activa ? 'Dar de baja' : 'Reactivar'}
              </Boton>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};
