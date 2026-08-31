'use client';

import { ReactNode, useState } from 'react';
import { IconDownload, IconFileText, IconPencil } from '@tabler/icons-react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { Panel } from '@/components/app/Panel';
import { Boton } from '@/components/app/ui/Boton';
import { categoriaDocumentoLabels } from '@/lib/etiquetas';
import { abrirArchivo } from '@/lib/archivosUi';
import {
  abrirDocumento,
  getDocumentosDeEmpleado,
  getEmpleado,
  getMisSolicitudesDeLegajo,
} from '@/lib/services/rrhh';
import { PedirCambioModal } from '@/components/app/legajo/PedirCambioModal';
import { MisPedidos } from '@/components/app/legajo/MisPedidos';
import { pendientes, SolicitudDatoLegajo } from '@/lib/autoservicioLegajo';
import { DocumentoLegajo, EstadoCivil, NivelEstudios } from '@/types/rrhh';
import { BloqueError } from '@/components/app/EstadoCarga';
import { useCarga } from '@/lib/useCarga';
import { formatearFechaCivil } from '@/lib/fechas';

const estadoCivilLabel: Record<EstadoCivil, string> = {
  soltero: 'Soltero/a',
  casado: 'Casado/a',
  divorciado: 'Divorciado/a',
  viudo: 'Viudo/a',
  union_convivencial: 'Unión convivencial',
};

const nivelEstudiosLabel: Record<NivelEstudios, string> = {
  primario: 'Primario',
  secundario: 'Secundario',
  terciario: 'Terciario',
  universitario: 'Universitario',
  posgrado: 'Posgrado',
};

const formatearFecha = (iso?: string): string =>
  iso
    ? formatearFechaCivil(iso, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : '—';

const Dato = ({ etiqueta, valor }: { etiqueta: string; valor?: ReactNode }) => (
  <div>
    <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">
      {etiqueta}
    </p>
    <p className="mt-0.5 text-sm text-ink">{valor || '—'}</p>
  </div>
);

const Seccion = ({
  titulo,
  children,
}: {
  titulo: string;
  children: ReactNode;
}) => (
  <Panel>
    <h2 className="text-[1.0625rem] font-bold tracking-tight text-ink">
      {titulo}
    </h2>
    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
  </Panel>
);

const MiLegajoPage = () => {
  const { usuario } = useAuth();
  const empleadoId = usuario?.empleadoId;

  // `activo` evita pedir con un id vacío: el usuario del superadmin no
  // tiene legajo. Va como opción y no como `if` antes del hook, que
  // rompería el orden de los hooks de React.
  const cargaEmpleado = useCarga(() => getEmpleado(empleadoId!), [empleadoId], {
    activo: Boolean(empleadoId),
    contexto: 'mi-legajo/empleado',
  });
  const empleado = cargaEmpleado.datos ?? null;

  const cargaDocs = useCarga(
    () => getDocumentosDeEmpleado(empleadoId!),
    [empleadoId],
    {
      activo: Boolean(empleadoId),
      contexto: 'mi-legajo/documentos',
      inicial: [] as DocumentoLegajo[],
    }
  );
  const documentos = cargaDocs.datos;

  const cargaSolicitudes = useCarga(() => getMisSolicitudesDeLegajo(), [], {
    activo: Boolean(empleadoId),
    contexto: 'mi-legajo/solicitudes',
    inicial: [] as SolicitudDatoLegajo[],
  });
  const solicitudes = cargaSolicitudes.datos;
  const camposPendientes = pendientes(solicitudes).map((s) => s.campo);

  const [pidiendo, setPidiendo] = useState(false);

  const abrir = (doc: DocumentoLegajo) =>
    abrirArchivo(() => abrirDocumento(doc), {
      titulo: 'No pudimos abrir el documento',
    });

  if (!usuario?.empleadoId) {
    return (
      <p className="rounded-xl bg-paper px-4 py-3 text-sm text-ink-soft">
        Tu usuario no está vinculado a un legajo.
      </p>
    );
  }

  // Antes cualquier fallo se veía como "Cargando tu legajo…" para
  // siempre: la persona esperaba a que apareciera algo que no iba a venir.
  if (cargaEmpleado.fase === 'error' && cargaEmpleado.error) {
    return (
      <BloqueError
        error={cargaEmpleado.error}
        onReintentar={cargaEmpleado.recargar}
      />
    );
  }

  if (!empleado) {
    return <p className="text-sm text-ink-soft">Cargando tu legajo…</p>;
  }

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[1.75rem]">
            Mi legajo
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-soft">
            Tus datos registrados. Si algo no está bien, pedí el cambio y RRHH
            lo revisa.
          </p>
        </div>
        <Boton onClick={() => setPidiendo(true)}>
          <IconPencil size={16} /> Pedir un cambio
        </Boton>
      </div>

      <MisPedidos
        solicitudes={solicitudes}
        onCambio={cargaSolicitudes.recargar}
      />

      <Seccion titulo="Datos personales">
        <Dato
          etiqueta="Nombre"
          valor={`${empleado.nombre} ${empleado.apellido}`}
        />
        <Dato etiqueta="DNI" valor={empleado.dni} />
        <Dato etiqueta="CUIL" valor={empleado.cuil} />
        <Dato
          etiqueta="Fecha de nacimiento"
          valor={formatearFecha(empleado.fechaNacimiento)}
        />
        <Dato
          etiqueta="Estado civil"
          valor={estadoCivilLabel[empleado.estadoCivil]}
        />
        <Dato
          etiqueta="Nivel de estudios"
          valor={nivelEstudiosLabel[empleado.nivelEstudios]}
        />
      </Seccion>

      <Seccion titulo="Contacto">
        <Dato etiqueta="Domicilio" valor={empleado.domicilio} />
        <Dato etiqueta="Teléfono" valor={empleado.telefono} />
        <Dato etiqueta="Email" valor={empleado.email} />
      </Seccion>

      <Seccion titulo="Datos laborales">
        <Dato etiqueta="Puesto" valor={empleado.puesto} />
        <Dato etiqueta="Sector" valor={empleado.sector} />
        <Dato
          etiqueta="Fecha de ingreso"
          valor={formatearFecha(empleado.fechaIngreso)}
        />
        <Dato etiqueta="Obra social" valor={empleado.obraSocial} />
      </Seccion>

      <Panel>
        <h2 className="text-[1.0625rem] font-bold tracking-tight text-ink">
          Grupo familiar
        </h2>
        {empleado.grupoFamiliar.length === 0 ? (
          <p className="mt-3 text-sm text-ink-soft">Sin familiares cargados.</p>
        ) : (
          <div className="mt-4 flex flex-col gap-2">
            {empleado.grupoFamiliar.map((f, i) => (
              <div
                key={`${f.nombreCompleto}-${i}`}
                className="flex items-center justify-between rounded-xl border border-line bg-paper px-4 py-2.5"
              >
                <span className="text-sm font-semibold text-ink">
                  {f.nombreCompleto}
                </span>
                <span className="text-sm capitalize text-ink-soft">
                  {f.vinculo}
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Seccion titulo="Contacto de emergencia">
        <Dato
          etiqueta="Nombre"
          valor={empleado.contactoEmergencia.nombreCompleto}
        />
        <Dato etiqueta="Vínculo" valor={empleado.contactoEmergencia.vinculo} />
        <Dato
          etiqueta="Teléfono"
          valor={empleado.contactoEmergencia.telefono}
        />
      </Seccion>

      <Panel>
        <h2 className="text-[1.0625rem] font-bold tracking-tight text-ink">
          Documentación
        </h2>
        {documentos.length === 0 ? (
          <p className="mt-3 text-sm text-ink-soft">
            No hay documentos cargados.
          </p>
        ) : (
          <div className="mt-4 flex flex-col gap-2">
            {documentos.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-line bg-paper px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                    <IconFileText size={18} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">
                      {doc.nombre}
                    </p>
                    <p className="text-xs text-ink-soft">
                      {categoriaDocumentoLabels[doc.categoria]}
                    </p>
                  </div>
                </div>
                <Boton
                  variante="secundario"
                  tamano="sm"
                  onClick={() => void abrir(doc)}
                >
                  <IconDownload size={15} /> Ver
                </Boton>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <PedirCambioModal
        abierto={pidiendo}
        empleado={empleado}
        yaPendientes={camposPendientes}
        onCerrar={() => setPidiendo(false)}
        onListo={() => {
          cargaSolicitudes.recargar();
          // El legajo no cambió todavía, pero sí la lista de pendientes;
          // se recarga igual por si RRHH resolvió algo mientras tanto.
          cargaEmpleado.recargar();
        }}
      />
    </div>
  );
};

export default MiLegajoPage;
