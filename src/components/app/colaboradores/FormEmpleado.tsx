'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { IconCamera, IconX } from '@tabler/icons-react';
import { Panel } from '@/components/app/Panel';
import { Boton } from '@/components/app/ui/Boton';
import { Campo, CampoSelect } from '@/components/app/ui/Campo';
import { aOpciones } from '@/components/app/ui/Selector';
import { hoyISO } from '@/lib/fechas';
import {
  juntarErrores,
  validarCbu,
  validarCuit,
  validarDni,
  validarEmail,
  validarRequerido,
  validarTelefono,
} from '@/lib/validaciones';
import { getEmpleados, NuevoEmpleado } from '@/lib/services/rrhh';
import {
  Empleado,
  EstadoCivil,
  ModalidadContratacion,
  ModalidadPago,
  NivelEstudios,
} from '@/types/rrhh';

const modalidades: Record<ModalidadContratacion, string> = {
  indeterminado: 'Tiempo indeterminado',
  plazo_fijo: 'Plazo fijo',
  eventual: 'Eventual',
  pasantia: 'Pasantía',
  monotributista: 'Monotributista',
};

const estadosCiviles: Record<EstadoCivil, string> = {
  soltero: 'Soltero/a',
  casado: 'Casado/a',
  divorciado: 'Divorciado/a',
  viudo: 'Viudo/a',
  union_convivencial: 'Unión convivencial',
};

const niveles: Record<NivelEstudios, string> = {
  primario: 'Primario',
  secundario: 'Secundario',
  terciario: 'Terciario',
  universitario: 'Universitario',
  posgrado: 'Posgrado',
};

const modalidadesPago: Record<ModalidadPago, string> = {
  mensual: 'Mensual',
  quincenal: 'Quincenal',
  semanal: 'Semanal',
  jornal: 'Jornal',
};

export interface DatosEmpleado extends NuevoEmpleado {
  fotoUrl?: string;
}

interface FormEmpleadoProps {
  inicial?: Empleado;
  textoGuardar: string;
  onGuardar: (datos: DatosEmpleado) => Promise<void>;
  onCancelar: () => void;
}

const desdeEmpleado = (e: Empleado): DatosEmpleado => ({
  nombre: e.nombre,
  apellido: e.apellido,
  dni: e.dni,
  cuil: e.cuil || undefined,
  fechaNacimiento: e.fechaNacimiento || undefined,
  estadoCivil: e.estadoCivil,
  nivelEstudios: e.nivelEstudios,
  domicilio: e.domicilio || undefined,
  telefono: e.telefono || undefined,
  email: e.email || undefined,
  puesto: e.puesto,
  sector: e.sector,
  fechaIngreso: e.fechaIngreso,
  supervisorId: e.supervisorId ?? undefined,
  modalidadContratacion: e.modalidadContratacion,
  fechaFinContrato: e.fechaFinContrato,
  modalidadPago: e.modalidadPago,
  banco: e.banco || undefined,
  cbu: e.cbu || undefined,
  obraSocial: e.obraSocial || undefined,
  art: e.art || undefined,
  fotoUrl: e.fotoUrl,
});

export const FormEmpleado = ({
  inicial,
  textoGuardar,
  onGuardar,
  onCancelar,
}: FormEmpleadoProps) => {
  const [datos, setDatos] = useState<DatosEmpleado>(
    inicial
      ? desdeEmpleado(inicial)
      : {
          nombre: '',
          apellido: '',
          dni: '',
          puesto: '',
          sector: '',
          fechaIngreso: hoyISO(),
          modalidadContratacion: 'indeterminado',
        }
  );
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [supervisores, setSupervisores] = useState<Empleado[]>([]);
  const [enviando, setEnviando] = useState(false);
  const inputFoto = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void getEmpleados().then((lista) =>
      setSupervisores(
        lista.filter((e) => e.supervisorId === null && e.id !== inicial?.id)
      )
    );
  }, [inicial?.id]);

  const set = (campo: keyof DatosEmpleado) => (valor: string) =>
    setDatos((prev) => ({ ...prev, [campo]: valor || undefined }));

  const cargarFoto = (archivo: File | undefined) => {
    if (!archivo) return;
    const lector = new FileReader();
    lector.onload = () =>
      setDatos((prev) => ({ ...prev, fotoUrl: lector.result as string }));
    lector.readAsDataURL(archivo);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const nuevos = juntarErrores({
      nombre: validarRequerido(datos.nombre ?? '', 'El nombre'),
      apellido: validarRequerido(datos.apellido ?? '', 'El apellido'),
      dni:
        validarRequerido(datos.dni ?? '', 'El DNI') ??
        validarDni(datos.dni ?? ''),
      cuil: validarCuit(datos.cuil ?? ''),
      email: validarEmail(datos.email ?? ''),
      telefono: validarTelefono(datos.telefono ?? ''),
      cbu: validarCbu(datos.cbu ?? ''),
      puesto: validarRequerido(datos.puesto ?? '', 'El puesto'),
      sector: validarRequerido(datos.sector ?? '', 'El sector'),
      fechaIngreso: validarRequerido(
        datos.fechaIngreso ?? '',
        'La fecha de ingreso'
      ),
      fechaFinContrato:
        datos.modalidadContratacion === 'plazo_fijo' && !datos.fechaFinContrato
          ? 'El contrato a plazo fijo necesita fecha de fin.'
          : null,
    });
    setErrores(nuevos);
    if (Object.keys(nuevos).length > 0) return;
    setEnviando(true);
    await onGuardar(datos);
    setEnviando(false);
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Panel>
        <h2 className="text-base font-bold text-ink">Foto</h2>
        <div className="mt-4 flex items-center gap-4">
          {datos.fotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={datos.fotoUrl}
              alt="Foto del colaborador"
              className="h-20 w-20 rounded-full border border-line object-cover"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full border border-dashed border-line bg-paper text-ink-soft">
              <IconCamera size={26} stroke={1.5} />
            </div>
          )}
          <div className="flex gap-2">
            <Boton
              type="button"
              variante="secundario"
              tamano="sm"
              onClick={() => inputFoto.current?.click()}
            >
              <IconCamera size={14} />
              {datos.fotoUrl ? 'Cambiar foto' : 'Subir foto'}
            </Boton>
            {datos.fotoUrl && (
              <Boton
                type="button"
                variante="rechazar"
                tamano="sm"
                onClick={() =>
                  setDatos((prev) => ({ ...prev, fotoUrl: undefined }))
                }
              >
                <IconX size={14} />
                Quitar
              </Boton>
            )}
          </div>
          <input
            ref={inputFoto}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => cargarFoto(e.target.files?.[0])}
          />
        </div>
      </Panel>

      <Panel>
        <h2 className="text-base font-bold text-ink">Datos personales</h2>
        <div className="mt-4 grid gap-3.5 sm:grid-cols-2">
          <Campo
            etiqueta="Nombre *"
            value={datos.nombre}
            onChange={(e) => set('nombre')(e.target.value)}
            error={errores.nombre}
          />
          <Campo
            etiqueta="Apellido *"
            value={datos.apellido}
            onChange={(e) => set('apellido')(e.target.value)}
            error={errores.apellido}
          />
          <Campo
            etiqueta="DNI *"
            value={datos.dni}
            onChange={(e) => set('dni')(e.target.value)}
            placeholder="30123456"
            error={errores.dni}
          />
          <Campo
            etiqueta="CUIL"
            value={datos.cuil ?? ''}
            onChange={(e) => set('cuil')(e.target.value)}
            placeholder="20-30123456-5"
            error={errores.cuil}
          />
          <Campo
            etiqueta="Fecha de nacimiento"
            type="date"
            value={datos.fechaNacimiento ?? ''}
            onChange={(e) => set('fechaNacimiento')(e.target.value)}
          />
          <CampoSelect
            etiqueta="Estado civil"
            value={datos.estadoCivil ?? 'soltero'}
            onChange={set('estadoCivil')}
            opciones={aOpciones(estadosCiviles)}
          />
          <CampoSelect
            etiqueta="Nivel de estudios"
            value={datos.nivelEstudios ?? 'secundario'}
            onChange={set('nivelEstudios')}
            opciones={aOpciones(niveles)}
          />
          <Campo
            etiqueta="Domicilio"
            value={datos.domicilio ?? ''}
            onChange={(e) => set('domicilio')(e.target.value)}
          />
          <Campo
            etiqueta="Teléfono"
            value={datos.telefono ?? ''}
            onChange={(e) => set('telefono')(e.target.value)}
            placeholder="11-5555-0000"
            error={errores.telefono}
          />
          <Campo
            etiqueta="Email"
            type="email"
            value={datos.email ?? ''}
            onChange={(e) => set('email')(e.target.value)}
            placeholder="nombre@email.com"
            error={errores.email}
          />
        </div>
      </Panel>

      <Panel>
        <h2 className="text-base font-bold text-ink">Datos laborales</h2>
        <div className="mt-4 grid gap-3.5 sm:grid-cols-2">
          <Campo
            etiqueta="Puesto *"
            value={datos.puesto}
            onChange={(e) => set('puesto')(e.target.value)}
            placeholder="Operario, Analista…"
            error={errores.puesto}
          />
          <Campo
            etiqueta="Sector *"
            value={datos.sector}
            onChange={(e) => set('sector')(e.target.value)}
            placeholder="Producción, Administración…"
            error={errores.sector}
          />
          <Campo
            etiqueta="Fecha de ingreso *"
            type="date"
            value={datos.fechaIngreso}
            onChange={(e) => set('fechaIngreso')(e.target.value)}
            error={errores.fechaIngreso}
          />
          <CampoSelect
            etiqueta="Supervisor"
            value={datos.supervisorId ?? ''}
            onChange={set('supervisorId')}
            opciones={[
              { valor: '', etiqueta: 'Sin supervisor' },
              ...supervisores.map((s) => ({
                valor: s.id,
                etiqueta: `${s.nombre} ${s.apellido} — ${s.puesto}`,
              })),
            ]}
          />
          <CampoSelect
            etiqueta="Modalidad de contratación"
            value={datos.modalidadContratacion}
            onChange={set('modalidadContratacion')}
            opciones={aOpciones(modalidades)}
          />
          {datos.modalidadContratacion === 'plazo_fijo' && (
            <Campo
              etiqueta="Fin de contrato *"
              type="date"
              value={datos.fechaFinContrato ?? ''}
              onChange={(e) => set('fechaFinContrato')(e.target.value)}
              error={errores.fechaFinContrato}
              ayuda="Genera una alerta automática antes del vencimiento."
            />
          )}
        </div>
      </Panel>

      <Panel>
        <h2 className="text-base font-bold text-ink">Pago y coberturas</h2>
        <div className="mt-4 grid gap-3.5 sm:grid-cols-2">
          <CampoSelect
            etiqueta="Modalidad de pago"
            value={datos.modalidadPago ?? 'mensual'}
            onChange={set('modalidadPago')}
            opciones={aOpciones(modalidadesPago)}
          />
          <Campo
            etiqueta="Banco"
            value={datos.banco ?? ''}
            onChange={(e) => set('banco')(e.target.value)}
          />
          <Campo
            etiqueta="CBU"
            value={datos.cbu ?? ''}
            onChange={(e) => set('cbu')(e.target.value)}
            placeholder="22 dígitos"
            error={errores.cbu}
          />
          <Campo
            etiqueta="Obra social"
            value={datos.obraSocial ?? ''}
            onChange={(e) => set('obraSocial')(e.target.value)}
          />
          <Campo
            etiqueta="ART"
            value={datos.art ?? ''}
            onChange={(e) => set('art')(e.target.value)}
          />
        </div>
      </Panel>

      {Object.keys(errores).length > 0 && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Revisá los campos marcados: hay datos faltantes o inválidos.
        </p>
      )}

      <div className="flex gap-2">
        <Boton type="submit" disabled={enviando}>
          {enviando ? 'Guardando…' : textoGuardar}
        </Boton>
        <Boton type="button" variante="secundario" onClick={onCancelar}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
};
