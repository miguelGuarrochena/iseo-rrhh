'use client';

import { FormEvent, useRef, useState } from 'react';
import { interpretarError } from '@/lib/errores';
import { campoDeErrorDb } from '@/lib/erroresDb';
import { avisoError } from '@/lib/avisos';
import {
  IconCamera,
  IconMapPin,
  IconPlus,
  IconTrash,
  IconX,
} from '@tabler/icons-react';
import { Panel } from '@/components/app/Panel';
import { Boton } from '@/components/app/ui/Boton';
import { Campo, CampoSelect } from '@/components/app/ui/Campo';
import { CampoFecha } from '@/components/app/ui/CampoFecha';
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
import { obtenerUbicacion } from '@/lib/facial/ubicacion';
import {
  Empleado,
  EstadoCivil,
  Familiar,
  ModalidadContratacion,
  ModalidadPago,
  ModoFichaje,
  NivelEstudios,
} from '@/types/rrhh';
import { useCarga } from '@/lib/useCarga';

const vinculosFamiliar: Record<Familiar['vinculo'], string> = {
  conyuge: 'Cónyuge',
  hijo: 'Hijo/a',
  otro: 'Otro',
};

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

const modosFichaje: Record<ModoFichaje, string> = {
  planta: 'En planta (tablet con reconocimiento facial)',
  celular: 'Celular (cara + GPS dentro de la zona de trabajo)',
  remoto: 'Remoto (cara, sin validar ubicación)',
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
  numeroLegajo: e.numeroLegajo || undefined,
  fechaNacimiento: e.fechaNacimiento || undefined,
  estadoCivil: e.estadoCivil,
  nivelEstudios: e.nivelEstudios,
  domicilio: e.domicilio || undefined,
  telefono: e.telefono || undefined,
  email: e.email || undefined,
  contactoEmergencia:
    e.contactoEmergencia &&
    (e.contactoEmergencia.nombreCompleto ||
      e.contactoEmergencia.vinculo ||
      e.contactoEmergencia.telefono)
      ? e.contactoEmergencia
      : undefined,
  grupoFamiliar: e.grupoFamiliar?.length ? e.grupoFamiliar : undefined,
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
  convenio: e.convenio || undefined,
  sinUsuario: e.sinUsuario ?? false,
  modoFichaje: e.modoFichaje ?? 'celular',
  geocerca: e.geocerca,
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
  const [enviando, setEnviando] = useState(false);
  const inputFoto = useRef<HTMLInputElement>(null);

  // Sólo llena el desplegable de supervisor: si falla, el alta sigue
  // sirviendo y se puede asignar el supervisor después.
  const cSupervisores = useCarga(
    async () => {
      const lista = await getEmpleados();
      return lista.filter(
        (e) => e.supervisorId === null && e.id !== inicial?.id
      );
    },
    [inicial?.id],
    { contexto: 'alta/supervisores', inicial: [] as Empleado[] }
  );
  const supervisores = cSupervisores.datos;

  const set = (campo: keyof DatosEmpleado) => (valor: string) =>
    setDatos((prev) => ({ ...prev, [campo]: valor || undefined }));

  /** Para los campos booleanos: `false` es un valor, no un campo vacío. */
  const setBool = (campo: keyof DatosEmpleado) => (valor: boolean) =>
    setDatos((prev) => ({ ...prev, [campo]: valor }));

  const setContacto = (
    campo: keyof NonNullable<DatosEmpleado['contactoEmergencia']>,
    valor: string
  ) =>
    setDatos((prev) => ({
      ...prev,
      contactoEmergencia: {
        nombreCompleto: '',
        vinculo: '',
        telefono: '',
        ...prev.contactoEmergencia,
        [campo]: valor,
      },
    }));

  const agregarFamiliar = () =>
    setDatos((prev) => ({
      ...prev,
      grupoFamiliar: [
        ...(prev.grupoFamiliar ?? []),
        { nombreCompleto: '', vinculo: 'hijo' as const },
      ],
    }));

  const quitarFamiliar = (i: number) =>
    setDatos((prev) => ({
      ...prev,
      grupoFamiliar: (prev.grupoFamiliar ?? []).filter((_, idx) => idx !== i),
    }));

  const setFamiliar = (i: number, campo: keyof Familiar, valor: string) =>
    setDatos((prev) => ({
      ...prev,
      grupoFamiliar: (prev.grupoFamiliar ?? []).map((f, idx) =>
        idx === i ? { ...f, [campo]: valor } : f
      ),
    }));

  const setGeocerca = (campo: 'lat' | 'lng' | 'radioM', valor: string) =>
    setDatos((prev) => {
      const base = prev.geocerca ?? { lat: 0, lng: 0, radioM: 150 };
      const num = Number(valor);
      return {
        ...prev,
        geocerca: { ...base, [campo]: Number.isFinite(num) ? num : 0 },
      };
    });

  const usarUbicacionActual = async () => {
    const geo = await obtenerUbicacion();
    if (!geo) return;
    setDatos((prev) => ({
      ...prev,
      geocerca: {
        lat: geo.lat,
        lng: geo.lng,
        radioM: prev.geocerca?.radioM ?? 150,
      },
    }));
  };

  const cargarFoto = (archivo: File | undefined) => {
    if (!archivo) return;
    const lector = new FileReader();
    lector.onload = () =>
      setDatos((prev) => ({ ...prev, fotoUrl: lector.result as string }));
    lector.readAsDataURL(archivo);
  };

  /** Lleva la vista al primer campo marcado con error. */
  const alPrimerError = () => {
    setTimeout(() => {
      document
        .querySelector('[data-error-campo]')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
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
      // Puesto, sector y fecha de ingreso se pueden completar después
      // desde la ficha (mismo criterio que la importación por Excel).
      fechaFinContrato:
        datos.modalidadContratacion === 'plazo_fijo' && !datos.fechaFinContrato
          ? 'El contrato a plazo fijo necesita fecha de fin.'
          : datos.fechaFinContrato &&
              datos.fechaIngreso &&
              datos.fechaFinContrato < datos.fechaIngreso
            ? 'El fin de contrato no puede ser anterior al ingreso.'
            : null,
      fechaNacimiento:
        datos.fechaNacimiento &&
        datos.fechaIngreso &&
        datos.fechaNacimiento >= datos.fechaIngreso
          ? 'La fecha de nacimiento no puede ser posterior al ingreso.'
          : null,
      // La geocerca es opcional (sin ella, el fichaje por celular no
      // valida ubicación); si se cargó, tiene que ser coherente.
      geocerca:
        datos.geocerca &&
        (datos.geocerca.lat !== 0 ||
          datos.geocerca.lng !== 0 ||
          datos.geocerca.radioM !== 0) &&
        (Math.abs(datos.geocerca.lat) > 90 ||
          Math.abs(datos.geocerca.lng) > 180 ||
          datos.geocerca.radioM < 50)
          ? 'La ubicación no es válida o el radio es menor a 50 m.'
          : null,
    });
    setErrores(nuevos);
    if (Object.keys(nuevos).length > 0) {
      alPrimerError();
      return;
    }
    setEnviando(true);
    try {
      await onGuardar(datos);
    } catch (err) {
      /**
       * Sin este catch, un DNI o CUIL repetido —lo más común al cargar
       * gente a mano— dejaba el botón trabado en "Guardando…" para
       * siempre y el error salía por la red de seguridad como un
       * "algo no salió bien" que no decía qué campo corregir.
       */
      const { titulo, detalle } = interpretarError(err);
      const campo = campoDeErrorDb(
        err instanceof Error ? err.message : String(err)
      );
      if (campo) {
        setErrores({ [campo]: detalle || titulo });
        alPrimerError();
      } else {
        avisoError(titulo, detalle);
      }
    } finally {
      setEnviando(false);
    }
  };

  /** Nombres legibles de los campos con error, para el aviso de abajo. */
  const etiquetasError: Record<string, string> = {
    nombre: 'Nombre',
    apellido: 'Apellido',
    dni: 'DNI',
    cuil: 'CUIL',
    email: 'Email',
    telefono: 'Teléfono',
    cbu: 'CBU',
    fechaFinContrato: 'Fin de contrato',
    fechaNacimiento: 'Fecha de nacimiento',
    geocerca: 'Zona de fichaje',
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
            etiqueta="Nº de legajo"
            value={datos.numeroLegajo ?? ''}
            onChange={(e) => set('numeroLegajo')(e.target.value)}
            placeholder="Opcional — para matching de recibos"
          />
          <CampoFecha
            etiqueta="Fecha de nacimiento"
            value={datos.fechaNacimiento ?? ''}
            onChange={set('fechaNacimiento')}
            error={errores.fechaNacimiento}
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
        <h2 className="text-base font-bold text-ink">Contacto de emergencia</h2>
        <p className="mt-1 text-sm text-ink-soft">
          A quién avisar ante una urgencia con este colaborador.
        </p>
        <div className="mt-4 grid gap-3.5 sm:grid-cols-3">
          <Campo
            etiqueta="Nombre completo"
            value={datos.contactoEmergencia?.nombreCompleto ?? ''}
            onChange={(e) => setContacto('nombreCompleto', e.target.value)}
          />
          <Campo
            etiqueta="Vínculo"
            value={datos.contactoEmergencia?.vinculo ?? ''}
            onChange={(e) => setContacto('vinculo', e.target.value)}
            placeholder="Madre, pareja…"
          />
          <Campo
            etiqueta="Teléfono"
            value={datos.contactoEmergencia?.telefono ?? ''}
            onChange={(e) => setContacto('telefono', e.target.value)}
            placeholder="11-5555-0000"
          />
        </div>
      </Panel>

      <Panel>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-ink">Grupo familiar</h2>
            <p className="mt-1 text-sm text-ink-soft">
              Cónyuge, hijos u otros familiares a cargo.
            </p>
          </div>
          <Boton
            type="button"
            variante="secundario"
            tamano="sm"
            onClick={agregarFamiliar}
          >
            <IconPlus size={14} />
            Agregar
          </Boton>
        </div>
        {(datos.grupoFamiliar ?? []).length > 0 && (
          <div className="mt-4 flex flex-col gap-3">
            {(datos.grupoFamiliar ?? []).map((f, i) => (
              <div
                key={i}
                className="grid gap-2.5 rounded-xl border border-line p-3 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]"
              >
                <Campo
                  etiqueta="Nombre completo"
                  value={f.nombreCompleto}
                  onChange={(e) =>
                    setFamiliar(i, 'nombreCompleto', e.target.value)
                  }
                />
                <CampoSelect
                  etiqueta="Vínculo"
                  value={f.vinculo}
                  onChange={(v) => setFamiliar(i, 'vinculo', v)}
                  opciones={aOpciones(vinculosFamiliar)}
                />
                <CampoFecha
                  etiqueta="Nacimiento"
                  value={f.fechaNacimiento ?? ''}
                  onChange={(v) => setFamiliar(i, 'fechaNacimiento', v)}
                />
                <Campo
                  etiqueta="DNI"
                  value={f.dni ?? ''}
                  onChange={(e) => setFamiliar(i, 'dni', e.target.value)}
                />
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => quitarFamiliar(i)}
                    aria-label="Quitar familiar"
                    className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-red-50 hover:text-red-600"
                  >
                    <IconTrash size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel>
        <h2 className="text-base font-bold text-ink">Datos laborales</h2>
        <div className="mt-4 grid gap-3.5 sm:grid-cols-2">
          <Campo
            etiqueta="Puesto"
            value={datos.puesto}
            onChange={(e) => set('puesto')(e.target.value)}
            placeholder="Operario, Analista…"
            error={errores.puesto}
          />
          <Campo
            etiqueta="Sector"
            value={datos.sector}
            onChange={(e) => set('sector')(e.target.value)}
            placeholder="Producción, Administración…"
            error={errores.sector}
          />
          <CampoFecha
            etiqueta="Fecha de ingreso"
            value={datos.fechaIngreso}
            onChange={set('fechaIngreso')}
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
            <CampoFecha
              etiqueta="Fin de contrato *"
              value={datos.fechaFinContrato ?? ''}
              onChange={set('fechaFinContrato')}
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
          <Campo
            etiqueta="Convenio colectivo"
            value={datos.convenio ?? ''}
            onChange={(e) => set('convenio')(e.target.value)}
            placeholder="CCT 130/75 — Comercio"
            ayuda="Se usa en cada remuneración del empleado."
          />
        </div>
      </Panel>

      <Panel>
        <h2 className="text-base font-bold text-ink">Fichaje</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Definí dónde y cómo ficha este colaborador. En todos los casos se
          confirma la identidad con reconocimiento facial.
        </p>
        <div className="mt-4 grid gap-3.5 sm:grid-cols-2">
          <CampoSelect
            etiqueta="Modo de fichaje"
            value={datos.modoFichaje ?? 'celular'}
            onChange={set('modoFichaje')}
            opciones={aOpciones(modosFichaje)}
          />
        </div>

        {/* Pedido para el régimen simplificado: que la gente fiche en la
            tablet sin tener acceso a la app. Se ofrece siempre porque
            también sirve en una empresa en blanco (personal sin mail, o
            que no usa celular). */}
        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl bg-paper p-4">
          <input
            type="checkbox"
            checked={datos.sinUsuario ?? false}
            onChange={(e) => setBool('sinUsuario')(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-brand-600"
          />
          <span>
            <span className="text-sm font-semibold text-ink">
              No le vamos a dar cuenta en la app
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-ink-soft">
              Ficha en la terminal y RRHH le carga ausencias y remuneración. No
              se le manda invitación, no ve sus recibos ni recibe documentos
              para firmar, y deja de aparecer en los avisos de &quot;sin
              cuenta&quot;.
            </span>
          </span>
        </label>

        {datos.modoFichaje === 'celular' && (
          <div className="mt-4 rounded-xl bg-paper p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-ink">Zona de trabajo</p>
              <Boton
                type="button"
                variante="secundario"
                className="text-xs"
                onClick={usarUbicacionActual}
              >
                <IconMapPin size={15} />
                Usar mi ubicación actual
              </Boton>
            </div>
            <p className="mt-1 text-xs text-ink-soft">
              El fichaje se marca fuera de zona si está a más del radio indicado
              del punto.
            </p>
            <div className="mt-3 grid gap-3.5 sm:grid-cols-3">
              <Campo
                etiqueta="Latitud"
                value={datos.geocerca?.lat?.toString() ?? ''}
                onChange={(e) => setGeocerca('lat', e.target.value)}
                placeholder="-34.6037"
                error={errores.geocerca}
              />
              <Campo
                etiqueta="Longitud"
                value={datos.geocerca?.lng?.toString() ?? ''}
                onChange={(e) => setGeocerca('lng', e.target.value)}
                placeholder="-58.3816"
              />
              <Campo
                etiqueta="Radio (m)"
                value={datos.geocerca?.radioM?.toString() ?? ''}
                onChange={(e) => setGeocerca('radioM', e.target.value)}
                placeholder="150"
              />
            </div>
          </div>
        )}
      </Panel>

      {Object.keys(errores).length > 0 && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Revisá:{' '}
          <strong>
            {Object.keys(errores)
              .map((k) => etiquetasError[k] ?? k)
              .join(', ')}
          </strong>
          . {Object.values(errores)[0]}
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
