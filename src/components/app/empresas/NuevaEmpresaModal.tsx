'use client';

import { FormEvent, useState } from 'react';
import { interpretarError } from '@/lib/errores';
import { campoDeErrorDb } from '@/lib/erroresDb';
import { avisoError } from '@/lib/avisos';
import { Modal } from '@mantine/core';
import { Boton } from '@/components/app/ui/Boton';
import { Campo, CampoSelect } from '@/components/app/ui/Campo';
import { aOpciones } from '@/components/app/ui/Selector';
import {
  juntarErrores,
  validarCuit,
  validarEmail,
  validarRequerido,
} from '@/lib/validaciones';
import {
  NuevaEmpresa,
  RegimenLaboral,
  REGIMEN_LABORAL_LABELS,
} from '@/types/rrhh';

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
    regimen: 'relacion_dependencia',
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
    try {
      await onCrear({
        ...datos,
        abonoMensual: Number(datos.abonoMensual) || 0,
      });
      setDatos(inicial);
    } catch (err) {
      /**
       * Sin este catch el error se escapaba como promesa sin atrapar: la
       * red de seguridad mostraba "algo no salió bien", el modal quedaba
       * abierto con el botón trabado en "Creando…" y no se decía qué
       * había pasado. El caso real era un CUIT ya cargado.
       */
      const { titulo, detalle } = interpretarError(err);
      const campo = campoDeErrorDb(
        err instanceof Error ? err.message : String(err)
      );
      if (campo) {
        // El error es de un campo concreto: se marca ahí, que es donde la
        // persona lo puede corregir.
        setErrores({ [campo]: detalle || titulo });
      } else {
        avisoError(titulo, detalle);
      }
    } finally {
      // En `finally` para que el botón se destrabe también cuando falla.
      setEnviando(false);
    }
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
        {/* El régimen define cómo se liquida y qué ve la empresa en
            Remuneraciones. Se elige al dar de alta porque cambiarlo con
            períodos ya cargados obliga a recalcular netos hacia atrás,
            aunque se puede corregir después desde la ficha. */}
        <div className="flex flex-col gap-2 rounded-2xl border border-line bg-paper/50 p-4">
          <CampoSelect
            etiqueta="Régimen laboral"
            value={datos.regimen ?? 'relacion_dependencia'}
            onChange={(v) => set('regimen')(v as RegimenLaboral)}
            opciones={aOpciones(REGIMEN_LABORAL_LABELS)}
          />
          <p className="text-xs leading-relaxed text-ink-soft">
            {datos.regimen === 'simplificado' ? (
              <>
                Sin descuentos de ley: el neto es lo que se paga. Se puede
                cargar el monotributo a cargo de la empresa como costo del
                período, y los colaboradores pueden quedar sin cuenta en la app
                (fichan en la terminal y RRHH carga todo).
              </>
            ) : (
              <>
                Liquidación con aportes de ley (jubilación, PAMI, obra social),
                recibos de sueldo y documentos para firmar. Cada colaborador
                tiene su usuario.
              </>
            )}
          </p>
        </div>

        <div className="grid gap-3.5 sm:grid-cols-2">
          <Campo
            etiqueta="Plan"
            value={datos.plan ?? ''}
            onChange={(e) => set('plan')(e.target.value)}
            placeholder="Básico, Full…"
            ayuda="Es una etiqueta comercial: no habilita ni bloquea nada. Lo que la empresa puede usar se define en Módulos y Servicios."
          />
          <Campo
            etiqueta="Cuota mensual"
            type="number"
            value={String(datos.abonoMensual ?? '')}
            onChange={(e) => set('abonoMensual')(e.target.value)}
            placeholder="0"
            ayuda="Cuánto te va a pagar por mes."
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
