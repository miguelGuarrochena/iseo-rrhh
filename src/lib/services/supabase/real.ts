/**
 * Implementación real de la capa de servicios contra Supabase.
 * Mismas firmas que la versión demo (rrhh.demo.ts); la elección
 * entre una y otra la hace el facade src/lib/services/rrhh.ts.
 */
import {
  Adelanto,
  Alerta,
  Ausencia,
  Comunicacion,
  ComunicacionMensaje,
  ConfigPlataforma,
  Convenio,
  CupoLicencia,
  DatosEmpresaCliente,
  DescriptorFacial,
  DescuentoRecurrente,
  DocumentoFirma,
  DocumentoLegajo,
  Empleado,
  Empresa,
  EmpresaResumen,
  EstadoComunicacion,
  EventoAgenda,
  FacturaMonotributo,
  Fichaje,
  FacturacionEmpresa,
  MetricasGlobales,
  MovimientoFinanciero,
  NuevoMovimiento,
  ResumenFinanzas,
  NotaInterna,
  Notificacion,
  NuevaEmpresa,
  NuevaRemuneracion,
  NuevoConvenio,
  OpcionesFichaje,
  PendientesResumen,
  ReciboSueldo,
  Remuneracion,
  NuevoTurno,
  ResumenControl,
  SaldoLicencia,
  SaldoVacaciones,
  TipoAusencia,
  TipoComunicacion,
  Terminal,
  Turno,
  Usuario,
  VacacionSector,
} from '@/types/rrhh';
import type {
  MiMes,
  NuevaAusencia,
  NuevaNotaInterna,
  NuevoDocumento,
  NuevoEmpleado,
  NuevoEvento,
  NuevoUsuario,
} from '@/lib/services/rrhh.demo';
import { diasVacacionesPorAntiguedad } from '@/lib/vacaciones';
import { tipoAusenciaLabels } from '@/lib/etiquetas';
import { calcularLiquidacion } from '@/lib/remuneraciones';
import { diasAusencia, diasEntre, hoyISO } from '@/lib/fechas';
import { supabase } from '@/lib/supabase/cliente';
import { empresaOperativaId, useAuthStore } from '@/lib/auth/store';
import {
  aAdelanto,
  aAusencia,
  aConvenio,
  aDescuentoRecurrente,
  aDocumento,
  aEmpleado,
  aEmpresa,
  aEvento,
  aFichaje,
  aMovimiento,
  aNotaInterna,
  aNotificacion,
  aRecibo,
  aRemuneracion,
  aTerminal,
  aTurno,
  aUsuario,
} from './mapeos';
import {
  esPathDeStorage,
  subirDocumentoLegajo,
  subirFotoEmpleado,
  subirLogoEmpresa,
  subirReciboPdf,
  urlFirmada,
  urlsFirmadas,
} from './archivos';

const sb = () => supabase();

const empresaId = (): string => {
  const id = empresaOperativaId();
  if (!id) throw new Error('Sin empresa activa.');
  return id;
};

const oFalla = <T>(data: T | null, error: { message: string } | null): T => {
  if (error) throw new Error(error.message);
  if (data === null) throw new Error('Sin datos.');
  return data;
};

const registrarAuditoria = async (
  accion: string,
  entidad: string,
  entidadId?: string,
  detalle: Record<string, unknown> = {}
): Promise<void> => {
  try {
    const { usuario } = useAuthStore.getState();
    if (!usuario) return;
    await sb()
      .from('auditoria_acciones')
      .insert({
        empresa_id: empresaId(),
        actor_id: usuario.id,
        actor_nombre: usuario.nombreCompleto,
        accion,
        entidad,
        entidad_id: entidadId ?? null,
        detalle,
      });
  } catch {
    // La auditoría no debe romper la acción principal.
  }
};

// ---------- Empresa ----------

export const getEmpresa = async (): Promise<Empresa> => {
  const { data, error } = await sb()
    .from('empresas')
    .select('*')
    .eq('id', empresaId())
    .single();
  return aEmpresa(oFalla(data, error));
};

export const getEmpresas = async (): Promise<EmpresaResumen[]> => {
  const [empresas, empleados] = await Promise.all([
    sb().from('empresas').select('*').order('nombre'),
    sb().from('empleados').select('empresa_id').eq('activo', true),
  ]);
  if (empresas.error) throw new Error(empresas.error.message);
  const conteo = new Map<string, number>();
  (empleados.data ?? []).forEach((e) =>
    conteo.set(e.empresa_id, (conteo.get(e.empresa_id) ?? 0) + 1)
  );
  return (empresas.data ?? []).map((f) => ({
    empresa: aEmpresa(f),
    empleadosActivos: conteo.get(f.id) ?? 0,
  }));
};

export const crearEmpresa = async (datos: NuevaEmpresa): Promise<Empresa> => {
  const cfg = await getConfigPlataforma();
  const { data, error } = await sb()
    .from('empresas')
    .insert({
      nombre: datos.nombre,
      cuit: datos.cuit,
      razon_social: datos.razonSocial ?? null,
      domicilio: datos.domicilio ?? null,
      contacto_nombre: datos.contactoNombre,
      contacto_email: datos.contactoEmail,
      contacto_telefono: datos.contactoTelefono ?? null,
      plan: datos.plan ?? null,
      abono_mensual: datos.abonoMensual ?? 0,
      config: {
        metodosFichaje: cfg.metodosFichajeDefault,
        toleranciaLlegadaTardeMin: cfg.toleranciaDefaultMin,
        horaEntrada: cfg.horaEntradaDefault,
        horaSalida: cfg.horaSalidaDefault,
        diasAvisoVencimiento: cfg.diasAvisoDefault,
      },
    })
    .select()
    .single();
  return aEmpresa(oFalla(data, error));
};

/** Edita la ficha comercial de un cliente (solo superadmin). */
export const actualizarDatosEmpresa = async (
  empresaId: string,
  datos: DatosEmpresaCliente
): Promise<Empresa> => {
  const mapa: Record<keyof DatosEmpresaCliente, string> = {
    nombre: 'nombre',
    razonSocial: 'razon_social',
    cuit: 'cuit',
    domicilio: 'domicilio',
    contactoNombre: 'contacto_nombre',
    contactoEmail: 'contacto_email',
    contactoTelefono: 'contacto_telefono',
    plan: 'plan',
    abonoMensual: 'abono_mensual',
  };
  const cambios: Record<string, unknown> = {};
  (Object.keys(datos) as (keyof DatosEmpresaCliente)[]).forEach((k) => {
    if (datos[k] !== undefined) cambios[mapa[k]] = datos[k];
  });
  const { data, error } = await sb()
    .from('empresas')
    .update(cambios)
    .eq('id', empresaId)
    .select()
    .single();
  return aEmpresa(oFalla(data, error));
};

export const cambiarEstadoEmpresa = async (
  id: string,
  estado: Empresa['estado']
): Promise<Empresa | null> => {
  const { data, error } = await sb()
    .from('empresas')
    .update({ estado })
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data ? aEmpresa(data) : null;
};

export const getMetricasGlobales = async (): Promise<MetricasGlobales> => {
  const [activas, suspendidas, empleados, pendientes] = await Promise.all([
    sb()
      .from('empresas')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'activa'),
    sb()
      .from('empresas')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'suspendida'),
    sb()
      .from('empleados')
      .select('id', { count: 'exact', head: true })
      .eq('activo', true),
    sb()
      .from('ausencias')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'pendiente'),
  ]);
  return {
    empresasActivas: activas.count ?? 0,
    empresasSuspendidas: suspendidas.count ?? 0,
    empleadosGestionados: empleados.count ?? 0,
    solicitudesPendientes: pendientes.count ?? 0,
  };
};

export const actualizarEmpresa = async (
  datos: Partial<
    Pick<Empresa, 'nombre' | 'logoUrl' | 'contactoNombre' | 'contactoEmail'>
  >
): Promise<Empresa> => {
  const cambios: Record<string, unknown> = {};
  if (datos.nombre !== undefined) cambios.nombre = datos.nombre;
  if (datos.logoUrl !== undefined) {
    // Si viene la previsualización del form, primero sube al bucket público.
    cambios.logo_url = datos.logoUrl.startsWith('data:')
      ? await subirLogoEmpresa(datos.logoUrl)
      : datos.logoUrl;
  }
  if (datos.contactoNombre !== undefined)
    cambios.contacto_nombre = datos.contactoNombre;
  if (datos.contactoEmail !== undefined)
    cambios.contacto_email = datos.contactoEmail;
  const { data, error } = await sb()
    .from('empresas')
    .update(cambios)
    .eq('id', empresaId())
    .select()
    .single();
  return aEmpresa(oFalla(data, error));
};

export const actualizarConfigEmpresa = async (
  config: Empresa['config']
): Promise<Empresa> => {
  const { data, error } = await sb()
    .from('empresas')
    .update({ config })
    .eq('id', empresaId())
    .select()
    .single();
  return aEmpresa(oFalla(data, error));
};

// ---------- Configuración de la plataforma (superadmin) ----------

export const getConfigPlataforma = async (): Promise<ConfigPlataforma> => {
  const { data, error } = await sb()
    .from('config_plataforma')
    .select('config')
    .eq('id', 1)
    .single();
  return oFalla(data, error).config as ConfigPlataforma;
};

export const actualizarConfigPlataforma = async (
  config: ConfigPlataforma
): Promise<ConfigPlataforma> => {
  const { error } = await sb()
    .from('config_plataforma')
    .update({ config })
    .eq('id', 1);
  if (error) throw new Error(error.message);
  return config;
};

// ---------- Empleados ----------

const EMPLEADO_SELECT_SIN_BIOMETRIA = `
  id,
  empresa_id,
  nombre,
  apellido,
  dni,
  cuil,
  numero_legajo,
  fecha_nacimiento,
  estado_civil,
  nivel_estudios,
  domicilio,
  telefono,
  email,
  contacto_emergencia,
  grupo_familiar,
  foto_url,
  fecha_ingreso,
  puesto,
  sector,
  supervisor_id,
  modalidad_contratacion,
  fecha_fin_contrato,
  modalidad_pago,
  banco,
  cbu,
  obra_social,
  art,
  convenio,
  activo,
  fecha_baja,
  motivo_baja,
  checklist_alta,
  modo_fichaje,
  geocerca
`;

/** Reemplaza los paths de fotos por URLs firmadas para mostrarlas. */
const conFotosFirmadas = async (empleados: Empleado[]): Promise<Empleado[]> => {
  const paths = empleados
    .map((e) => e.fotoUrl)
    .filter((f): f is string => esPathDeStorage(f));
  if (paths.length === 0) return empleados;
  const urls = await urlsFirmadas('fotos', paths);
  return empleados.map((e) =>
    esPathDeStorage(e.fotoUrl)
      ? { ...e, fotoUrl: urls.get(e.fotoUrl) ?? undefined }
      : e
  );
};

export const getEmpleados = async (): Promise<Empleado[]> => {
  const { data, error } = await sb()
    .from('empleados')
    .select(EMPLEADO_SELECT_SIN_BIOMETRIA)
    .eq('empresa_id', empresaId())
    .eq('activo', true)
    .order('apellido');
  return conFotosFirmadas(oFalla(data, error).map(aEmpleado));
};

export const getEmpleadosTodos = async (): Promise<Empleado[]> => {
  const { data, error } = await sb()
    .from('empleados')
    .select(EMPLEADO_SELECT_SIN_BIOMETRIA)
    .eq('empresa_id', empresaId())
    .order('apellido');
  return conFotosFirmadas(oFalla(data, error).map(aEmpleado));
};

export const getEmpleado = async (id: string): Promise<Empleado | null> => {
  const { data } = await sb()
    .from('empleados')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!data) return null;
  const [empleado] = await conFotosFirmadas([aEmpleado(data)]);
  return empleado;
};

export const getEquipo = async (supervisorId: string): Promise<Empleado[]> => {
  const { data, error } = await sb()
    .from('empleados')
    .select(EMPLEADO_SELECT_SIN_BIOMETRIA)
    .eq('supervisor_id', supervisorId)
    .eq('activo', true);
  return conFotosFirmadas(oFalla(data, error).map(aEmpleado));
};

const CHECKLIST_ALTA = [
  { id: 'chk-dni', etiqueta: 'DNI', completo: false },
  { id: 'chk-contrato', etiqueta: 'Contrato firmado', completo: false },
  { id: 'chk-afip', etiqueta: 'Alta AFIP', completo: false },
  { id: 'chk-medico', etiqueta: 'Examen preocupacional', completo: false },
];

export const crearEmpleado = async (
  datos: NuevoEmpleado & { fotoUrl?: string }
): Promise<Empleado> => {
  const fotoPath = datos.fotoUrl?.startsWith('data:')
    ? await subirFotoEmpleado(datos.fotoUrl)
    : (datos.fotoUrl ?? null);
  const { data, error } = await sb()
    .from('empleados')
    .insert({
      empresa_id: empresaId(),
      nombre: datos.nombre,
      apellido: datos.apellido,
      dni: datos.dni,
      cuil: datos.cuil ?? '',
      numero_legajo: datos.numeroLegajo || null,
      fecha_nacimiento: datos.fechaNacimiento || null,
      estado_civil: datos.estadoCivil ?? 'soltero',
      nivel_estudios: datos.nivelEstudios ?? 'secundario',
      domicilio: datos.domicilio ?? '',
      telefono: datos.telefono ?? '',
      email: datos.email ?? '',
      contacto_emergencia: datos.contactoEmergencia ?? {},
      foto_url: fotoPath,
      fecha_ingreso: datos.fechaIngreso,
      puesto: datos.puesto,
      sector: datos.sector,
      supervisor_id: datos.supervisorId ?? null,
      modalidad_contratacion: datos.modalidadContratacion,
      fecha_fin_contrato: datos.fechaFinContrato ?? null,
      modalidad_pago: datos.modalidadPago ?? 'mensual',
      banco: datos.banco ?? '',
      cbu: datos.cbu ?? '',
      obra_social: datos.obraSocial ?? '',
      art: datos.art ?? '',
      convenio: datos.convenio ?? null,
      modo_fichaje: datos.modoFichaje ?? 'celular',
      geocerca: datos.geocerca ?? null,
      checklist_alta: CHECKLIST_ALTA,
    })
    .select()
    .single();
  return aEmpleado(oFalla(data, error));
};

export const actualizarEmpleado = async (
  id: string,
  datos: Partial<Empleado>
): Promise<Empleado | null> => {
  // Foto nueva desde el form: subir al bucket antes de guardar.
  if (datos.fotoUrl?.startsWith('data:')) {
    datos = { ...datos, fotoUrl: await subirFotoEmpleado(datos.fotoUrl) };
  }
  const cambios: Record<string, unknown> = {};
  const mapa: Record<string, string> = {
    nombre: 'nombre',
    apellido: 'apellido',
    dni: 'dni',
    cuil: 'cuil',
    numeroLegajo: 'numero_legajo',
    fechaNacimiento: 'fecha_nacimiento',
    estadoCivil: 'estado_civil',
    nivelEstudios: 'nivel_estudios',
    domicilio: 'domicilio',
    telefono: 'telefono',
    email: 'email',
    contactoEmergencia: 'contacto_emergencia',
    grupoFamiliar: 'grupo_familiar',
    fotoUrl: 'foto_url',
    fechaIngreso: 'fecha_ingreso',
    puesto: 'puesto',
    sector: 'sector',
    supervisorId: 'supervisor_id',
    modalidadContratacion: 'modalidad_contratacion',
    fechaFinContrato: 'fecha_fin_contrato',
    modalidadPago: 'modalidad_pago',
    banco: 'banco',
    cbu: 'cbu',
    obraSocial: 'obra_social',
    art: 'art',
    convenio: 'convenio',
    modoFichaje: 'modo_fichaje',
    geocerca: 'geocerca',
  };
  Object.entries(datos).forEach(([clave, valor]) => {
    const col = mapa[clave];
    if (col)
      cambios[col] =
        valor === '' && col.startsWith('fecha') ? null : (valor ?? null);
  });
  const { data, error } = await sb()
    .from('empleados')
    .update(cambios)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  if (!data) return null;
  await registrarAuditoria('actualizar', 'empleado', id, {
    campos: Object.keys(cambios),
  });
  return aEmpleado(data);
};

export const darDeBajaEmpleado = async (
  id: string,
  motivo: string,
  fecha: string
): Promise<Empleado | null> => {
  const { data, error } = await sb()
    .from('empleados')
    .update({ activo: false, motivo_baja: motivo, fecha_baja: fecha })
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  if (!data) return null;
  await registrarAuditoria('dar_baja', 'empleado', id, { fecha });
  return aEmpleado(data);
};

export const toggleChecklistItem = async (
  empleadoId: string,
  itemId: string
): Promise<Empleado | null> => {
  const actual = await getEmpleado(empleadoId);
  if (!actual) return null;
  const checklist = actual.checklistAlta.map((c) =>
    c.id === itemId ? { ...c, completo: !c.completo } : c
  );
  const { data, error } = await sb()
    .from('empleados')
    .update({ checklist_alta: checklist })
    .eq('id', empleadoId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data ? aEmpleado(data) : null;
};

// ---------- Legajo: documentos ----------

export const getDocumentosDeEmpleado = async (
  empleadoId: string
): Promise<DocumentoLegajo[]> => {
  const { data, error } = await sb()
    .from('documentos_legajo')
    .select('*')
    .eq('empleado_id', empleadoId)
    .order('creado_en', { ascending: false });
  return oFalla(data, error).map(aDocumento);
};

export const agregarDocumento = async (
  datos: NuevoDocumento & { archivo?: File }
): Promise<DocumentoLegajo> => {
  const path = datos.archivo
    ? await subirDocumentoLegajo(datos.empleadoId, datos.archivo)
    : '';
  const { data, error } = await sb()
    .from('documentos_legajo')
    .insert({
      empresa_id: empresaId(),
      empleado_id: datos.empleadoId,
      categoria: datos.categoria,
      nombre: datos.nombre,
      archivo_url: path,
      fecha_vencimiento: datos.fechaVencimiento ?? null,
    })
    .select()
    .single();
  const documento = aDocumento(oFalla(data, error));
  await registrarAuditoria('agregar', 'documento_legajo', documento.id, {
    empleadoId: datos.empleadoId,
    categoria: datos.categoria,
  });
  return documento;
};

export const quitarDocumento = async (documentoId: string): Promise<void> => {
  const { data: previo } = await sb()
    .from('documentos_legajo')
    .select('empleado_id,categoria')
    .eq('id', documentoId)
    .maybeSingle();
  const { error } = await sb()
    .from('documentos_legajo')
    .delete()
    .eq('id', documentoId);
  if (error) throw new Error(error.message);
  await registrarAuditoria('quitar', 'documento_legajo', documentoId, {
    empleadoId: previo?.empleado_id,
    categoria: previo?.categoria,
  });
};

// ---------- Usuarios y permisos ----------

export const getUsuariosDeEmpresa = async (): Promise<Usuario[]> => {
  const { data, error } = await sb()
    .from('usuarios')
    .select('*')
    .eq('empresa_id', empresaId())
    .neq('rol', 'superadmin')
    .order('nombre_completo');
  return oFalla(data, error).map(aUsuario);
};

export const cambiarRolUsuario = async (
  usuarioId: string,
  rol: Usuario['rol']
): Promise<Usuario | null> => {
  if (rol === 'superadmin') return null;
  const { data, error } = await sb()
    .from('usuarios')
    .update({ rol })
    .eq('id', usuarioId)
    .neq('rol', 'superadmin')
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data ? aUsuario(data) : null;
};

export const invitarUsuario = async (datos: NuevoUsuario): Promise<Usuario> => {
  const { data } = await sb().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sesión vencida: volvé a ingresar.');
  const res = await fetch('/api/invitaciones', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...datos,
      empresaId: datos.empresaId ?? empresaId(),
    }),
  });
  if (!res.ok) {
    const { error } = (await res.json()) as { error?: string };
    throw new Error(error ?? 'No pudimos enviar la invitación.');
  }
  return {
    id: 'pendiente',
    email: datos.email,
    rol: datos.rol,
    empresaId: datos.empresaId ?? empresaId(),
    empleadoId: datos.empleadoId ?? null,
    nombreCompleto: datos.nombreCompleto,
  };
};

// ---------- Ausencias ----------

export const getAusencias = async (): Promise<Ausencia[]> => {
  const { data, error } = await sb()
    .from('ausencias')
    .select('*')
    .eq('empresa_id', empresaId())
    .order('creada_en', { ascending: false });
  return oFalla(data, error).map(aAusencia);
};

export const getAusenciasDeEmpleado = async (
  empleadoId: string
): Promise<Ausencia[]> => {
  const { data, error } = await sb()
    .from('ausencias')
    .select('*')
    .eq('empleado_id', empleadoId)
    .order('creada_en', { ascending: false });
  return oFalla(data, error).map(aAusencia);
};

export const getAusenciasPendientes = async (): Promise<Ausencia[]> => {
  const { data, error } = await sb()
    .from('ausencias')
    .select('*')
    .eq('empresa_id', empresaId())
    .eq('estado', 'pendiente')
    .order('creada_en', { ascending: false });
  return oFalla(data, error).map(aAusencia);
};

export const getVacacionesAprobadasDeEmpleados = async (
  empleadoIds: string[]
): Promise<Ausencia[]> => {
  if (empleadoIds.length === 0) return [];
  const { data, error } = await sb()
    .from('ausencias')
    .select(
      'id,empleado_id,tipo,fecha_desde,fecha_hasta,dias,estado,adjuntos,resuelta_en,creada_en'
    )
    .eq('empresa_id', empresaId())
    .eq('tipo', 'vacaciones')
    .eq('estado', 'aprobada')
    .in('empleado_id', empleadoIds)
    .order('fecha_desde', { ascending: true });
  return oFalla(data, error).map(aAusencia);
};

interface FilaVacacionSector {
  id: string;
  empleado_id: string;
  empleado_nombre: string;
  empleado_apellido: string;
  tipo: Ausencia['tipo'];
  fecha_desde: string;
  fecha_hasta: string;
  dias: number;
  estado: Ausencia['estado'];
  creada_en: string;
}

const aVacacionSector = (f: FilaVacacionSector): VacacionSector => ({
  id: f.id,
  empleadoId: f.empleado_id,
  empleadoNombre: f.empleado_nombre,
  empleadoApellido: f.empleado_apellido,
  tipo: f.tipo,
  fechaDesde: String(f.fecha_desde).slice(0, 10),
  fechaHasta: String(f.fecha_hasta).slice(0, 10),
  dias: f.dias,
  estado: f.estado,
  adjuntos: [],
  creadaEn: String(f.creada_en).slice(0, 10),
});

export const getVacacionesAprobadasMiSector = async (
  empleadoId?: string
): Promise<VacacionSector[]> => {
  // En Supabase se ignora el argumento: el sector sale de auth.uid() vía RPC.
  void empleadoId;
  const { data, error } = await sb().rpc('vacaciones_aprobadas_mi_sector');
  const filas = oFalla(data as FilaVacacionSector[] | null, error);
  return filas.map(aVacacionSector);
};

/** Avisa a varios usuarios (best-effort: nunca rompe la acción principal). */
const notificarUsuarios = async (
  usuarioIds: string[],
  tipo: Notificacion['tipo'],
  titulo: string,
  cuerpo: string,
  link?: string
): Promise<void> => {
  const propios = useAuthStore.getState().usuario?.id;
  const destinos = usuarioIds.filter((id) => id && id !== propios);
  if (destinos.length === 0) return;
  await sb()
    .from('notificaciones')
    .insert(
      destinos.map((usuario_id) => ({
        usuario_id,
        tipo,
        titulo,
        cuerpo,
        link: link ?? null,
      }))
    );
};

/** Ids de usuario de los gestores (admin y supervisores) de la empresa. */
const usuariosGestores = async (): Promise<string[]> => {
  const { data } = await sb()
    .from('usuarios')
    .select('id')
    .eq('empresa_id', empresaId())
    .in('rol', ['admin_rrhh', 'supervisor']);
  return (data ?? []).map((u) => u.id);
};

export const crearAusencia = async (
  datos: NuevaAusencia
): Promise<Ausencia> => {
  // Certificado/comprobante opcional: va al bucket privado de documentos.
  const adjuntos: string[] = [];
  if (datos.archivo) {
    adjuntos.push(await subirDocumentoLegajo(datos.empleadoId, datos.archivo));
  }
  const uid = useAuthStore.getState().usuario?.id ?? null;
  const aprobar = Boolean(datos.aprobarAutomaticamente);
  let dias = diasEntre(datos.fechaDesde, datos.fechaHasta);
  try {
    const empresa = await getEmpresa();
    dias = diasAusencia(
      datos.fechaDesde,
      datos.fechaHasta,
      datos.tipo,
      empresa.config.vacacionesDiasHabiles
    );
  } catch {
    // si falla, queda el conteo corrido
  }
  const { data, error } = await sb()
    .from('ausencias')
    .insert({
      empresa_id: empresaId(),
      empleado_id: datos.empleadoId,
      tipo: datos.tipo,
      fecha_desde: datos.fechaDesde,
      fecha_hasta: datos.fechaHasta,
      dias,
      comentario_empleado: datos.comentario ?? null,
      adjuntos,
      ...(aprobar
        ? {
            estado: 'aprobada',
            resuelta_por: uid,
            comentario_resolucion: 'Carga manual de RRHH',
            resuelta_en: new Date().toISOString(),
          }
        : {}),
    })
    .select()
    .single();
  const ausencia = aAusencia(oFalla(data, error));

  if (!aprobar) {
    // Avisar a los gestores que hay una solicitud para resolver.
    try {
      const [gestores, empleado] = await Promise.all([
        usuariosGestores(),
        getEmpleado(datos.empleadoId),
      ]);
      const quien = empleado
        ? `${empleado.nombre} ${empleado.apellido}`
        : 'Un colaborador';
      await notificarUsuarios(
        gestores,
        'ausencia_solicitada',
        'Nueva solicitud de ausencia',
        `${quien} pidió ${tipoAusenciaLabels[datos.tipo].toLowerCase()} (${ausencia.dias} días).`,
        '/ausencias'
      );
    } catch {
      // La notificación nunca bloquea la solicitud.
    }
  }

  return ausencia;
};

/** URL temporal para ver el certificado adjunto de una ausencia. */
export const abrirAdjuntoAusencia = async (
  ausencia: Ausencia
): Promise<string | null> => {
  const path = ausencia.adjuntos[0];
  if (!path) return null;
  return urlFirmada('documentos', path);
};

export const resolverAusencia = async (
  ausenciaId: string,
  estado: 'aprobada' | 'rechazada',
  _resueltaPor: string,
  comentario?: string
): Promise<Ausencia | null> => {
  const uid = useAuthStore.getState().usuario?.id ?? null;
  const { data, error } = await sb()
    .from('ausencias')
    .update({
      estado,
      resuelta_por: uid,
      comentario_resolucion: comentario ?? null,
      resuelta_en: new Date().toISOString(),
    })
    .eq('id', ausenciaId)
    .eq('estado', 'pendiente')
    .select()
    .single();
  if (error) throw new Error(error.message);
  if (!data) return null;

  // Notificar al empleado el resultado (best-effort, no bloquea la resolución).
  try {
    const { data: usuario } = await sb()
      .from('usuarios')
      .select('id')
      .eq('empleado_id', data.empleado_id)
      .maybeSingle();
    if (usuario) {
      await sb()
        .from('notificaciones')
        .insert({
          usuario_id: usuario.id,
          tipo: 'ausencia_resuelta',
          titulo:
            estado === 'aprobada' ? 'Ausencia aprobada' : 'Ausencia rechazada',
          cuerpo:
            estado === 'aprobada'
              ? 'Tu solicitud de ausencia fue aprobada.'
              : `Tu solicitud fue rechazada.${
                  comentario ? ` Motivo: ${comentario}` : ''
                }`,
          link: '/ausencias',
        });
    }
  } catch {
    // Si falla la notificación, la resolución igual queda registrada.
  }

  await registrarAuditoria('resolver', 'ausencia', ausenciaId, {
    estado,
    empleadoId: data.empleado_id,
  });

  return aAusencia(data);
};

export const getSaldoVacaciones = async (
  empleadoId: string,
  anio: number
): Promise<SaldoVacaciones | null> => {
  const empleado = await getEmpleado(empleadoId);
  if (!empleado) return null;
  const ausencias = await getAusenciasDeEmpleado(empleadoId);
  const corresponden = diasVacacionesPorAntiguedad(empleado.fechaIngreso, anio);
  const deEsteAnio = ausencias.filter(
    (a) => a.tipo === 'vacaciones' && a.fechaDesde.startsWith(String(anio))
  );
  const utilizados = deEsteAnio
    .filter((a) => a.estado === 'aprobada')
    .reduce((acc, a) => acc + a.dias, 0);
  const pendientes = deEsteAnio
    .filter((a) => a.estado === 'pendiente')
    .reduce((acc, a) => acc + a.dias, 0);
  return {
    empleadoId,
    anio,
    diasCorresponden: corresponden,
    diasAjuste: 0,
    diasUtilizados: utilizados,
    diasPendientesAprobacion: pendientes,
    diasDisponibles: corresponden - utilizados - pendientes,
  };
};

// ---------- Fichajes ----------

const inicioDeHoy = (): string => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

export const getFichajesDeHoy = async (): Promise<Fichaje[]> => {
  const { data, error } = await sb()
    .from('fichajes')
    .select('*')
    .eq('empresa_id', empresaId())
    .gte('ts', inicioDeHoy())
    .order('ts');
  return oFalla(data, error).map(aFichaje);
};

export const getFichajesDeEmpleadoHoy = async (
  empleadoId: string
): Promise<Fichaje[]> => {
  const { data, error } = await sb()
    .from('fichajes')
    .select('*')
    .eq('empleado_id', empleadoId)
    .gte('ts', inicioDeHoy())
    .order('ts');
  return oFalla(data, error).map(aFichaje);
};

export const ficharAhora = async (
  empleadoId: string,
  opciones: OpcionesFichaje = {}
): Promise<Fichaje> => {
  const deHoy = await getFichajesDeEmpleadoHoy(empleadoId);
  const ultimo = deHoy[deHoy.length - 1];
  const tipo =
    opciones.tipo ?? (ultimo?.tipo === 'ingreso' ? 'egreso' : 'ingreso');
  const { data, error } = await sb()
    .from('fichajes')
    .insert({
      empresa_id: empresaId(),
      empleado_id: empleadoId,
      tipo,
      ts: opciones.timestamp ?? undefined,
      metodo: opciones.metodo ?? 'celular',
      confianza: opciones.confianza ?? null,
      geo: opciones.geo ?? null,
      fuera_de_zona: opciones.fueraDeZona ?? null,
      registrado_por: opciones.registradoPor ?? null,
      // La foto es opcional; solo se guarda si ya es una URL (no dataURL).
      foto_url:
        opciones.fotoUrl && !opciones.fotoUrl.startsWith('data:')
          ? opciones.fotoUrl
          : null,
    })
    .select()
    .single();
  const fichaje = aFichaje(oFalla(data, error));
  if (opciones.metodo === 'manual' || opciones.registradoPor) {
    await registrarAuditoria('cargar_manual', 'fichaje', fichaje.id, {
      empleadoId,
      tipo,
      timestamp: fichaje.timestamp,
    });
  }
  return fichaje;
};

/** Enrola (o actualiza) el rostro de un empleado con su consentimiento. */
export const enrolarRostro = async (
  empleadoId: string,
  descriptor: number[]
): Promise<Empleado | null> => {
  const { data, error } = await sb()
    .from('empleados')
    .update({
      descriptor_facial: descriptor,
      consentimiento_biometrico: {
        aceptado: true,
        fecha: new Date().toISOString().slice(0, 10),
      },
    })
    .eq('id', empleadoId)
    .eq('empresa_id', empresaId())
    .select()
    .single();
  if (!data) return null;
  await registrarAuditoria('enrolar', 'biometria_facial', empleadoId);
  return aEmpleado(oFalla(data, error));
};

/** Borra el rostro enrolado de un empleado. */
export const borrarRostro = async (
  empleadoId: string
): Promise<Empleado | null> => {
  const { data, error } = await sb()
    .from('empleados')
    .update({ descriptor_facial: null, consentimiento_biometrico: null })
    .eq('id', empleadoId)
    .eq('empresa_id', empresaId())
    .select()
    .single();
  if (!data) return null;
  await registrarAuditoria('borrar', 'biometria_facial', empleadoId);
  return aEmpleado(oFalla(data, error));
};

/** Descriptores de los empleados activos con rostro enrolado (para 1:N). */
export const getDescriptoresFaciales = async (): Promise<
  DescriptorFacial[]
> => {
  const { data, error } = await sb()
    .from('empleados')
    .select('id, descriptor_facial')
    .eq('empresa_id', empresaId())
    .eq('activo', true)
    .not('descriptor_facial', 'is', null);
  if (error) throw new Error(error.message);
  return (data ?? []).map((f) => ({
    empleadoId: f.id as string,
    descriptor: (f.descriptor_facial ?? []) as number[],
  }));
};

// ---------- Notas internas (solo admins) ----------

export const getNotasInternas = async (
  empleadoId: string
): Promise<NotaInterna[]> => {
  const { data, error } = await sb()
    .from('notas_internas')
    .select('*')
    .eq('empleado_id', empleadoId)
    .order('fecha', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(aNotaInterna);
};

export const agregarNotaInterna = async (
  empleadoId: string,
  datos: NuevaNotaInterna
): Promise<NotaInterna> => {
  const { data, error } = await sb()
    .from('notas_internas')
    .insert({
      empresa_id: empresaId(),
      empleado_id: empleadoId,
      fecha: new Date().toISOString().slice(0, 10),
      autor_id: datos.autorId,
      autor_nombre: datos.autorNombre,
      motivo: datos.motivo,
      observacion: datos.observacion ?? null,
    })
    .select()
    .single();
  return aNotaInterna(oFalla(data, error));
};

export const quitarNotaInterna = async (id: string): Promise<void> => {
  const { error } = await sb().from('notas_internas').delete().eq('id', id);
  if (error) throw new Error(error.message);
};

// ---------- Turnos ----------

export const getTurnos = async (): Promise<Turno[]> => {
  const { data, error } = await sb()
    .from('turnos')
    .select('*')
    .eq('empresa_id', empresaId())
    .order('fecha');
  if (error) throw new Error(error.message);
  return (data ?? []).map(aTurno);
};

export const getTurnosDeEmpleado = async (
  empleadoId: string
): Promise<Turno[]> => {
  const { data, error } = await sb()
    .from('turnos')
    .select('*')
    .eq('empleado_id', empleadoId)
    .order('fecha');
  if (error) throw new Error(error.message);
  return (data ?? []).map(aTurno);
};

export const asignarTurno = async (datos: NuevoTurno): Promise<Turno> => {
  const { data, error } = await sb()
    .from('turnos')
    .upsert(
      {
        empresa_id: empresaId(),
        empleado_id: datos.empleadoId,
        fecha: datos.fecha,
        hora_entrada: datos.horaEntrada,
        hora_salida: datos.horaSalida,
      },
      { onConflict: 'empleado_id,fecha' }
    )
    .select()
    .single();
  return aTurno(oFalla(data, error));
};

/** Asigna el mismo horario a varios días (semana/mes) de una. */
export const asignarTurnos = async (lista: NuevoTurno[]): Promise<void> => {
  if (lista.length === 0) return;
  const emp = empresaId();
  const { error } = await sb()
    .from('turnos')
    .upsert(
      lista.map((d) => ({
        empresa_id: emp,
        empleado_id: d.empleadoId,
        fecha: d.fecha,
        hora_entrada: d.horaEntrada,
        hora_salida: d.horaSalida,
      })),
      { onConflict: 'empleado_id,fecha' }
    );
  if (error) throw new Error(error.message);
};

export const aprobarExtrasTurno = async (
  turnoId: string,
  aprobado: boolean
): Promise<Turno> => {
  const { data, error } = await sb()
    .from('turnos')
    .update({ extras_aprobadas: aprobado })
    .eq('id', turnoId)
    .select()
    .single();
  return aTurno(oFalla(data, error));
};

export const quitarTurno = async (id: string): Promise<void> => {
  const { error } = await sb().from('turnos').delete().eq('id', id);
  if (error) throw new Error(error.message);
};

export const getFichajesDeEmpleado = async (
  empleadoId: string
): Promise<Fichaje[]> => {
  const { data, error } = await sb()
    .from('fichajes')
    .select('*')
    .eq('empleado_id', empleadoId)
    .order('ts');
  if (error) throw new Error(error.message);
  return (data ?? []).map(aFichaje);
};

// ---------- Terminales de fichaje ----------

export const getTerminales = async (): Promise<Terminal[]> => {
  const { data, error } = await sb()
    .from('terminales')
    .select('*')
    .eq('empresa_id', empresaId())
    .order('creado_en');
  if (error) throw new Error(error.message);
  return (data ?? []).map(aTerminal);
};

export const registrarTerminal = async (nombre: string): Promise<Terminal> => {
  const { data, error } = await sb()
    .from('terminales')
    .insert({ empresa_id: empresaId(), nombre })
    .select()
    .single();
  return aTerminal(oFalla(data, error));
};

export const quitarTerminal = async (id: string): Promise<void> => {
  const { error } = await sb().from('terminales').delete().eq('id', id);
  if (error) throw new Error(error.message);
};

// ---------- Convenio colectivo ----------

export const getConvenios = async (): Promise<Convenio[]> => {
  const { data, error } = await sb()
    .from('convenios')
    .select('*')
    .eq('empresa_id', empresaId())
    .order('nombre');
  return oFalla(data, error).map(aConvenio);
};

export const crearConvenio = async (
  datos: NuevoConvenio
): Promise<Convenio> => {
  const { data, error } = await sb()
    .from('convenios')
    .insert({
      empresa_id: empresaId(),
      nombre: datos.nombre,
      contenido: datos.contenido,
    })
    .select()
    .single();
  return aConvenio(oFalla(data, error));
};

export const actualizarConvenio = async (
  id: string,
  datos: NuevoConvenio
): Promise<Convenio> => {
  const { data, error } = await sb()
    .from('convenios')
    .update({
      nombre: datos.nombre,
      contenido: datos.contenido,
      actualizado_en: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();
  return aConvenio(oFalla(data, error));
};

export const eliminarConvenio = async (id: string): Promise<void> => {
  const { error } = await sb().from('convenios').delete().eq('id', id);
  if (error) throw new Error(error.message);
};

// ---------- Jornadas calculadas (para reportes y "mi mes") ----------

interface Jornada {
  empleadoId: string;
  fecha: string;
  horasTrabajadas: number;
  horasExtras: number;
  llegadaTardeMin: number;
  incompleta: boolean;
}

const minutosDe = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
};

/** Agrupa fichajes por empleado+día y calcula la jornada contra la config. */
const calcularJornadas = (
  fichajes: Fichaje[],
  config: Empresa['config']
): Jornada[] => {
  const porDia = new Map<string, Fichaje[]>();
  fichajes.forEach((f) => {
    const fecha = new Date(f.timestamp);
    const clave = `${f.empleadoId}|${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
    porDia.set(clave, [...(porDia.get(clave) ?? []), f]);
  });
  const entrada = minutosDe(config.horaEntrada);
  const salida = minutosDe(config.horaSalida);
  const tolerancia = config.toleranciaLlegadaTardeMin;

  return [...porDia.entries()].map(([clave, movimientos]) => {
    const [empleadoId, fecha] = clave.split('|');
    const ingreso = movimientos.find((m) => m.tipo === 'ingreso');
    const egreso = [...movimientos].reverse().find((m) => m.tipo === 'egreso');
    const minutosLocal = (iso: string) => {
      const d = new Date(iso);
      return d.getHours() * 60 + d.getMinutes();
    };
    const minIngreso = ingreso ? minutosLocal(ingreso.timestamp) : null;
    const minEgreso = egreso ? minutosLocal(egreso.timestamp) : null;
    const horas =
      minIngreso !== null && minEgreso !== null && minEgreso > minIngreso
        ? (minEgreso - minIngreso) / 60
        : 0;
    return {
      empleadoId,
      fecha,
      horasTrabajadas: Math.round(horas * 10) / 10,
      horasExtras:
        minEgreso !== null && minEgreso > salida
          ? Math.round(((minEgreso - salida) / 60) * 10) / 10
          : 0,
      llegadaTardeMin:
        minIngreso !== null && minIngreso > entrada + tolerancia
          ? minIngreso - entrada
          : 0,
      incompleta: !ingreso || !egreso,
    };
  });
};

const fichajesUltimaSemana = async (): Promise<Fichaje[]> => {
  const desde = new Date();
  desde.setDate(desde.getDate() - 7);
  desde.setHours(0, 0, 0, 0);
  const { data, error } = await sb()
    .from('fichajes')
    .select('*')
    .eq('empresa_id', empresaId())
    .gte('ts', desde.toISOString())
    .order('ts');
  return oFalla(data, error).map(aFichaje);
};

export const getResumenControl = async (): Promise<ResumenControl> => {
  const [empresa, empleados, fichajes, ausencias, recibosPend] =
    await Promise.all([
      getEmpresa(),
      getEmpleados(),
      fichajesUltimaSemana(),
      getAusencias(),
      sb()
        .from('recibos')
        .select('id', { count: 'exact', head: true })
        .eq('empresa_id', empresaId())
        .eq('estado_firma', 'pendiente'),
    ]);

  const jornadas = calcularJornadas(fichajes, empresa.config);
  const porEmpleado = empleados
    .map((e) => {
      const propias = jornadas.filter((j) => j.empleadoId === e.id);
      return {
        empleadoId: e.id,
        nombreCompleto: `${e.nombre} ${e.apellido}`,
        llegadasTarde: propias.filter((j) => j.llegadaTardeMin > 0).length,
        minutosTarde: propias.reduce((acc, j) => acc + j.llegadaTardeMin, 0),
        horasExtras:
          Math.round(propias.reduce((acc, j) => acc + j.horasExtras, 0) * 10) /
          10,
        jornadasIncompletas: propias.filter((j) => j.incompleta).length,
      };
    })
    .sort((a, b) => b.minutosTarde - a.minutosTarde);

  const mesActual = new Date().toISOString().slice(0, 7);
  const diasAusencia = ausencias
    .filter(
      (a) => a.estado === 'aprobada' && a.fechaDesde.startsWith(mesActual)
    )
    .reduce((acc, a) => acc + a.dias, 0);
  const diasPersona = empleados.length * 22;

  return {
    ausentismoPct:
      diasPersona > 0
        ? Math.round((diasAusencia / diasPersona) * 1000) / 10
        : 0,
    llegadasTardeTotal: porEmpleado.reduce(
      (acc, e) => acc + e.llegadasTarde,
      0
    ),
    horasExtrasTotal:
      Math.round(porEmpleado.reduce((acc, e) => acc + e.horasExtras, 0) * 10) /
      10,
    jornadasIncompletas: porEmpleado.reduce(
      (acc, e) => acc + e.jornadasIncompletas,
      0
    ),
    recibosSinFirmar: recibosPend.count ?? 0,
    porEmpleado,
  };
};

export const getMiMes = async (empleadoId: string): Promise<MiMes> => {
  const desde = new Date();
  desde.setDate(desde.getDate() - 7);
  desde.setHours(0, 0, 0, 0);
  const [{ data, error }, empresa] = await Promise.all([
    sb()
      .from('fichajes')
      .select('*')
      .eq('empleado_id', empleadoId)
      .gte('ts', desde.toISOString())
      .order('ts'),
    getEmpresa(),
  ]);
  const jornadas = calcularJornadas(
    oFalla(data, error).map(aFichaje),
    empresa.config
  );
  return {
    horasTrabajadas:
      Math.round(jornadas.reduce((acc, j) => acc + j.horasTrabajadas, 0) * 10) /
      10,
    horasExtras:
      Math.round(jornadas.reduce((acc, j) => acc + j.horasExtras, 0) * 10) / 10,
    llegadasTarde: jornadas.filter((j) => j.llegadaTardeMin > 0).length,
    minutosTarde: jornadas.reduce((acc, j) => acc + j.llegadaTardeMin, 0),
  };
};

// ---------- Alertas (derivadas de contratos y documentos) ----------

export const getAlertas = async (): Promise<Alerta[]> => {
  const [empresa, empleados, documentos] = await Promise.all([
    getEmpresa(),
    getEmpleados(),
    sb()
      .from('documentos_legajo')
      .select('*')
      .eq('empresa_id', empresaId())
      .not('fecha_vencimiento', 'is', null),
  ]);
  const diasAviso = empresa.config.diasAvisoVencimiento;
  const limite = new Date();
  limite.setDate(limite.getDate() + diasAviso);
  const limiteISO = limite.toISOString().slice(0, 10);
  const hoy = hoyISO();
  const nombreDe = (id: string) => {
    const e = empleados.find((x) => x.id === id);
    return e ? `${e.nombre} ${e.apellido}` : '—';
  };

  const deContratos: Alerta[] = empleados
    .filter(
      (e) =>
        e.fechaFinContrato &&
        e.fechaFinContrato >= hoy &&
        e.fechaFinContrato <= limiteISO
    )
    .map((e) => ({
      id: `alerta-contrato-${e.id}`,
      empresaId: e.empresaId,
      tipo: 'contrato_plazo' as const,
      titulo: `Vence contrato a plazo fijo — ${e.nombre} ${e.apellido}`,
      fecha: e.fechaFinContrato as string,
      empleadoId: e.id,
      diasAviso,
      estado: 'pendiente' as const,
    }));

  const deDocumentos: Alerta[] = (documentos.data ?? [])
    .map(aDocumento)
    .filter(
      (d) =>
        d.fechaVencimiento &&
        d.fechaVencimiento >= hoy &&
        d.fechaVencimiento <= limiteISO
    )
    .map((d) => ({
      id: `alerta-doc-${d.id}`,
      empresaId: empresaId(),
      tipo: 'documento' as const,
      titulo: `Vence: ${d.nombre} — ${nombreDe(d.empleadoId)}`,
      fecha: d.fechaVencimiento as string,
      empleadoId: d.empleadoId,
      diasAviso,
      estado: 'pendiente' as const,
    }));

  return [...deContratos, ...deDocumentos].sort((a, b) =>
    a.fecha.localeCompare(b.fecha)
  );
};

// ---------- Agenda ----------

export const getEventosProximos = async (): Promise<EventoAgenda[]> => {
  const [{ data, error }, { data: cumplesRaw }] = await Promise.all([
    sb()
      .from('eventos_agenda')
      .select('*')
      .eq('empresa_id', empresaId())
      .gte('fecha', hoyISO())
      .order('fecha'),
    // Cumpleaños de toda la empresa (RPC security definer: el empleado
    // no ve fichas ajenas, pero sí puede ver nombre + fecha de nacimiento).
    sb().rpc('cumples_de_empresa'),
  ]);

  const hoy = new Date();
  const eid = empresaId();
  const cumples: EventoAgenda[] = (cumplesRaw ?? [])
    .filter((e: { fecha_nacimiento?: string }) => e.fecha_nacimiento)
    .map(
      (e: {
        empleado_id: string;
        nombre: string;
        apellido: string;
        fecha_nacimiento: string;
      }) => {
        const [, mes, dia] = e.fecha_nacimiento.split('-').map(Number);
        const fecha = new Date(hoy.getFullYear(), mes - 1, dia);
        if (fecha < hoy) fecha.setFullYear(fecha.getFullYear() + 1);
        return {
          id: `cumple-${e.empleado_id}`,
          empresaId: eid,
          tipo: 'cumpleanios' as const,
          titulo: `Cumpleaños de ${e.nombre} ${e.apellido}`,
          fecha: `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`,
        };
      }
    )
    .filter((c: EventoAgenda) => diasEntre(hoyISO(), c.fecha) <= 90);

  return [...oFalla(data, error).map(aEvento), ...cumples].sort((a, b) =>
    a.fecha.localeCompare(b.fecha)
  );
};

export const crearEvento = async (
  datos: NuevoEvento
): Promise<EventoAgenda> => {
  const { data, error } = await sb()
    .from('eventos_agenda')
    .insert({
      empresa_id: empresaId(),
      tipo: datos.tipo,
      titulo: datos.titulo,
      fecha: datos.fecha,
      descripcion: datos.descripcion ?? null,
    })
    .select()
    .single();
  return aEvento(oFalla(data, error));
};

// ---------- Notificaciones ----------

export const getNotificaciones = async (
  usuarioId: string
): Promise<Notificacion[]> => {
  const { data, error } = await sb()
    .from('notificaciones')
    .select('*')
    .eq('usuario_id', usuarioId)
    .order('creada_en', { ascending: false });
  return oFalla(data, error).map(aNotificacion);
};

// ---------- Remuneraciones y recibos ----------

export const getRemuneraciones = async (
  empleadoId: string
): Promise<Remuneracion[]> => {
  const { data, error } = await sb()
    .from('remuneraciones')
    .select('*')
    .eq('empleado_id', empleadoId)
    .order('periodo', { ascending: false });
  return oFalla(data, error).map(aRemuneracion);
};

/** Todas las remuneraciones de la empresa (vista admin). */
export const getRemuneracionesTodas = async (): Promise<Remuneracion[]> => {
  const { data, error } = await sb()
    .from('remuneraciones')
    .select('*')
    .eq('empresa_id', empresaId())
    .order('periodo', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(aRemuneracion);
};

/** Carga o actualiza la remuneración de un empleado para un período. */
export const cargarRemuneracion = async (
  datos: NuevaRemuneracion
): Promise<Remuneracion> => {
  const { aportes, neto } = calcularLiquidacion(datos);
  const { data, error } = await sb()
    .from('remuneraciones')
    .upsert(
      {
        empresa_id: empresaId(),
        empleado_id: datos.empleadoId,
        periodo: datos.periodo,
        monto_bruto: datos.montoBruto,
        no_remunerativo: datos.noRemunerativo ?? 0,
        otros_descuentos: datos.otrosDescuentos ?? 0,
        convenio: datos.convenio ?? null,
        aportes,
        monto_neto: neto,
      },
      { onConflict: 'empleado_id,periodo' }
    )
    .select()
    .single();
  const remuneracion = aRemuneracion(oFalla(data, error));
  await registrarAuditoria('cargar', 'remuneracion', remuneracion.id, {
    empleadoId: datos.empleadoId,
    periodo: datos.periodo,
  });
  return remuneracion;
};

export const getRecibos = async (
  empleadoId: string
): Promise<ReciboSueldo[]> => {
  const { data, error } = await sb()
    .from('recibos')
    .select('*')
    .eq('empleado_id', empleadoId)
    .order('periodo', { ascending: false });
  return oFalla(data, error).map(aRecibo);
};

export const getRecibosTodos = async (): Promise<ReciboSueldo[]> => {
  const { data, error } = await sb()
    .from('recibos')
    .select('*')
    .eq('empresa_id', empresaId())
    .order('periodo', { ascending: false });
  return oFalla(data, error).map(aRecibo);
};

export const firmarRecibo = async (
  reciboId: string
): Promise<ReciboSueldo | null> => {
  const { data, error } = await sb()
    .from('recibos')
    .update({ estado_firma: 'firmado', firmado_en: new Date().toISOString() })
    .eq('id', reciboId)
    .eq('estado_firma', 'pendiente')
    .select()
    .single();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const recibo = aRecibo(data);
  await registrarAuditoria('firmar', 'recibo', recibo.id, {
    empleadoId: recibo.empleadoId,
    periodo: recibo.periodo,
  });
  return recibo;
};

/** Avisa al empleado que su recibo ya está disponible para firmar. */
const avisarReciboDisponible = async (empleadoId: string): Promise<void> => {
  try {
    const { data: usuario } = await sb()
      .from('usuarios')
      .select('id')
      .eq('empleado_id', empleadoId)
      .maybeSingle();
    if (usuario) {
      await notificarUsuarios(
        [usuario.id],
        'recibo_disponible',
        'Recibo de sueldo disponible',
        'Ya podés verlo y firmarlo desde la sección Recibos.',
        '/recibos'
      );
    }
  } catch {
    // La notificación nunca bloquea la carga.
  }
};

/**
 * El admin sube el PDF del recibo de un período (pisa si ya existía).
 * Con publicar=false queda como borrador hasta la firma del empleador.
 */
export const cargarRecibo = async (
  empleadoId: string,
  periodo: string,
  archivo: File,
  publicar = true
): Promise<ReciboSueldo> => {
  const path = await subirReciboPdf(empleadoId, periodo, archivo);
  const { data, error } = await sb()
    .from('recibos')
    .upsert(
      {
        empresa_id: empresaId(),
        empleado_id: empleadoId,
        periodo,
        archivo_url: path,
        firmado_empleador_en: publicar ? new Date().toISOString() : null,
      },
      { onConflict: 'empleado_id,periodo' }
    )
    .select()
    .single();
  const recibo = aRecibo(oFalla(data, error));
  await registrarAuditoria('cargar', 'recibo', recibo.id, {
    empleadoId,
    periodo,
  });
  if (publicar) await avisarReciboDisponible(empleadoId);
  return recibo;
};

/** Firma del empleador: publica el recibo para que el empleado lo vea. */
export const firmarReciboEmpleador = async (
  reciboId: string
): Promise<ReciboSueldo> => {
  const { data, error } = await sb()
    .from('recibos')
    .update({ firmado_empleador_en: new Date().toISOString() })
    .eq('id', reciboId)
    .select()
    .single();
  const recibo = aRecibo(oFalla(data, error));
  await registrarAuditoria('firmar_empleador', 'recibo', recibo.id, {
    empleadoId: recibo.empleadoId,
    periodo: recibo.periodo,
  });
  await avisarReciboDisponible(recibo.empleadoId);
  return recibo;
};

// ---------- Descuentos recurrentes ----------

export const getDescuentosRecurrentes = async (
  empleadoId: string
): Promise<DescuentoRecurrente[]> => {
  const { data, error } = await sb()
    .from('descuentos_recurrentes')
    .select('*')
    .eq('empleado_id', empleadoId)
    .order('creado_en');
  return oFalla(data, error).map(aDescuentoRecurrente);
};

export const crearDescuentoRecurrente = async (
  empleadoId: string,
  concepto: string,
  monto: number,
  modo: 'monto' | 'porcentaje' = 'monto',
  porcentaje?: number
): Promise<DescuentoRecurrente> => {
  const { data, error } = await sb()
    .from('descuentos_recurrentes')
    .insert({
      empresa_id: empresaId(),
      empleado_id: empleadoId,
      concepto,
      monto: modo === 'monto' ? monto : 0,
      modo,
      porcentaje: modo === 'porcentaje' ? (porcentaje ?? monto) : null,
    })
    .select()
    .single();
  return aDescuentoRecurrente(oFalla(data, error));
};

export const eliminarDescuentoRecurrente = async (
  id: string
): Promise<void> => {
  const { error } = await sb()
    .from('descuentos_recurrentes')
    .delete()
    .eq('id', id);
  if (error) throw new Error(error.message);
};

// ---------- Adelantos ----------

/** Adelantos del empleado, o de toda la empresa si no se pasa id. */
export const getAdelantos = async (
  empleadoId?: string
): Promise<Adelanto[]> => {
  let q = sb()
    .from('adelantos')
    .select('*')
    .eq('empresa_id', empresaId())
    .order('creado_en', { ascending: false });
  if (empleadoId) q = q.eq('empleado_id', empleadoId);
  const { data, error } = await q;
  return oFalla(data, error).map(aAdelanto);
};

/** El empleado pide un adelanto; se avisa a los gestores. */
export const solicitarAdelanto = async (
  empleadoId: string,
  monto: number,
  motivo?: string
): Promise<Adelanto> => {
  const { data, error } = await sb()
    .from('adelantos')
    .insert({
      empresa_id: empresaId(),
      empleado_id: empleadoId,
      monto,
      motivo: motivo?.trim() || null,
    })
    .select()
    .single();
  const adelanto = aAdelanto(oFalla(data, error));
  try {
    const [gestores, empleado] = await Promise.all([
      usuariosGestores(),
      getEmpleado(empleadoId),
    ]);
    const quien = empleado
      ? `${empleado.nombre} ${empleado.apellido}`
      : 'Un colaborador';
    await notificarUsuarios(
      gestores,
      'adelanto_solicitado',
      'Pedido de adelanto',
      `${quien} pidió un adelanto de $${monto.toLocaleString('es-AR')}.`,
      '/remuneraciones'
    );
  } catch {
    // La notificación nunca bloquea el pedido.
  }
  return adelanto;
};

/** El admin aprueba (fijando el período de descuento) o rechaza. */
export const resolverAdelanto = async (
  adelantoId: string,
  aprobar: boolean,
  periodo?: string
): Promise<Adelanto> => {
  const { data, error } = await sb()
    .from('adelantos')
    .update({
      estado: aprobar ? 'aprobado' : 'rechazado',
      periodo: aprobar ? (periodo ?? hoyISO().slice(0, 7)) : null,
      resuelto_en: new Date().toISOString(),
    })
    .eq('id', adelantoId)
    .eq('estado', 'pendiente')
    .select()
    .single();
  const adelanto = aAdelanto(oFalla(data, error));
  try {
    const { data: usuario } = await sb()
      .from('usuarios')
      .select('id')
      .eq('empleado_id', adelanto.empleadoId)
      .maybeSingle();
    if (usuario) {
      await notificarUsuarios(
        [usuario.id],
        'adelanto_resuelto',
        aprobar ? 'Adelanto aprobado' : 'Adelanto rechazado',
        aprobar
          ? `Te aprobaron un adelanto de $${adelanto.monto.toLocaleString('es-AR')}. Se descuenta en el período correspondiente.`
          : 'Tu pedido de adelanto fue rechazado. Consultá con RRHH.',
        '/remuneraciones'
      );
    }
  } catch {
    // La notificación nunca bloquea la resolución.
  }
  return adelanto;
};

/** Marca como leídas todas las notificaciones del usuario. */
export const marcarNotificacionesLeidas = async (
  usuarioId: string
): Promise<void> => {
  await sb()
    .from('notificaciones')
    .update({ leida: true })
    .eq('usuario_id', usuarioId)
    .eq('leida', false);
};

/** URL temporal para ver el PDF del recibo. */
export const abrirRecibo = async (recibo: ReciboSueldo): Promise<string> =>
  esPathDeStorage(recibo.archivoUrl)
    ? urlFirmada('recibos-pdf', recibo.archivoUrl)
    : recibo.archivoUrl;

/** URL temporal para ver un documento del legajo. */
export const abrirDocumento = async (doc: DocumentoLegajo): Promise<string> =>
  esPathDeStorage(doc.archivoUrl)
    ? urlFirmada('documentos', doc.archivoUrl)
    : doc.archivoUrl;

// ---------- Finanzas (superadmin) ----------

export const getMovimientos = async (
  periodo?: string
): Promise<MovimientoFinanciero[]> => {
  let q = sb()
    .from('movimientos_financieros')
    .select('*')
    .order('fecha', { ascending: false });
  if (periodo) q = q.eq('periodo', periodo);
  const { data, error } = await q;
  return oFalla(data, error).map(aMovimiento);
};

export const crearMovimiento = async (
  datos: NuevoMovimiento
): Promise<MovimientoFinanciero> => {
  const { data, error } = await sb()
    .from('movimientos_financieros')
    .insert({
      tipo: datos.tipo,
      concepto: datos.concepto,
      categoria: datos.categoria ?? null,
      empresa_id: datos.empresaId ?? null,
      monto: datos.monto,
      fecha: datos.fecha,
      periodo: datos.fecha.slice(0, 7),
    })
    .select()
    .single();
  return aMovimiento(oFalla(data, error));
};

export const eliminarMovimiento = async (id: string): Promise<void> => {
  const { error } = await sb()
    .from('movimientos_financieros')
    .delete()
    .eq('id', id);
  if (error) throw new Error(error.message);
};

export const actualizarAbonoEmpresa = async (
  empresaId: string,
  abonoMensual: number
): Promise<Empresa | null> => {
  const { data, error } = await sb()
    .from('empresas')
    .update({ abono_mensual: abonoMensual })
    .eq('id', empresaId)
    .select()
    .single();
  return aEmpresa(oFalla(data, error));
};

export const getEmpresaPorId = async (
  empresaId: string
): Promise<Empresa | null> => {
  const { data, error } = await sb()
    .from('empresas')
    .select('*')
    .eq('id', empresaId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? aEmpresa(data) : null;
};

export const getEmpleadosDeEmpresaCount = async (
  empresaId: string
): Promise<number> => {
  const { count, error } = await sb()
    .from('empleados')
    .select('id', { count: 'exact', head: true })
    .eq('empresa_id', empresaId)
    .eq('activo', true);
  if (error) throw new Error(error.message);
  return count ?? 0;
};

export const getMovimientosDeEmpresa = async (
  empresaId: string
): Promise<MovimientoFinanciero[]> => {
  const { data, error } = await sb()
    .from('movimientos_financieros')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('fecha', { ascending: false });
  return oFalla(data, error).map(aMovimiento);
};

export const getResumenFinanzas = async (
  periodo: string
): Promise<ResumenFinanzas> => {
  const [
    { data: movs, error: e1 },
    { data: emps, error: e2 },
    { data: plantel, error: e3 },
  ] = await Promise.all([
    sb().from('movimientos_financieros').select('*').eq('periodo', periodo),
    sb().from('empresas').select('*'),
    sb().from('empleados').select('empresa_id').eq('activo', true),
  ]);
  const movimientos = oFalla(movs, e1).map(aMovimiento);
  const empresas = oFalla(emps, e2).map(aEmpresa);
  const filas = oFalla(plantel, e3) as { empresa_id: string }[];
  const empleadosPorEmpresa = filas.reduce<Record<string, number>>((acc, f) => {
    acc[f.empresa_id] = (acc[f.empresa_id] ?? 0) + 1;
    return acc;
  }, {});

  const ingresosDelMes = movimientos
    .filter((m) => m.tipo === 'ingreso')
    .reduce((a, m) => a + m.monto, 0);
  const gastosDelMes = movimientos
    .filter((m) => m.tipo === 'gasto')
    .reduce((a, m) => a + m.monto, 0);

  const facturacion: FacturacionEmpresa[] = empresas.map((e) => {
    const cobradoEnPeriodo = movimientos
      .filter((m) => m.tipo === 'ingreso' && m.empresaId === e.id)
      .reduce((a, m) => a + m.monto, 0);
    const abonoMensual = e.abonoMensual ?? 0;
    return {
      empresaId: e.id,
      nombre: e.nombre,
      estado: e.estado,
      empleados: empleadosPorEmpresa[e.id] ?? 0,
      abonoMensual,
      cobradoEnPeriodo,
      alDia: abonoMensual === 0 || cobradoEnPeriodo >= abonoMensual,
    };
  });

  const cobrables = facturacion.filter(
    (f) => f.estado === 'activa' && f.abonoMensual > 0
  );

  return {
    periodo,
    ingresosDelMes,
    gastosDelMes,
    neto: ingresosDelMes - gastosDelMes,
    mrr: empresas
      .filter((e) => e.estado === 'activa')
      .reduce((a, e) => a + (e.abonoMensual ?? 0), 0),
    empresasAlDia: cobrables.filter((f) => f.alDia).length,
    empresasVencidas: cobrables.filter((f) => !f.alDia).length,
    facturacion,
  };
};

// ---------- Eliminar recibos / remuneraciones ----------

export const eliminarRecibo = async (reciboId: string): Promise<void> => {
  const { error } = await sb().from('recibos').delete().eq('id', reciboId);
  if (error) throw new Error(error.message);
  await registrarAuditoria('eliminar', 'recibo', reciboId);
};

export const eliminarRemuneracion = async (id: string): Promise<void> => {
  const { error } = await sb().from('remuneraciones').delete().eq('id', id);
  if (error) throw new Error(error.message);
  await registrarAuditoria('eliminar', 'remuneracion', id);
};

// ---------- Monotributo ----------

export const getFacturasMonotributo = async (
  empleadoId: string
): Promise<FacturaMonotributo[]> => {
  const { data, error } = await sb()
    .from('facturas_monotributo')
    .select('*')
    .eq('empleado_id', empleadoId)
    .order('periodo', { ascending: false });
  return oFalla(data, error).map(
    (f): FacturaMonotributo => ({
      id: f.id,
      empleadoId: f.empleado_id,
      periodo: f.periodo,
      monto: Number(f.monto),
      archivoUrl: f.archivo_url ?? undefined,
      creadoEn: String(f.creado_en).slice(0, 10),
    })
  );
};

export const cargarFacturaMonotributo = async (
  empleadoId: string,
  periodo: string,
  monto: number,
  archivo?: File
): Promise<FacturaMonotributo> => {
  let archivoUrl: string | null = null;
  if (archivo) {
    archivoUrl = await subirDocumentoLegajo(empleadoId, archivo);
  }
  const { data, error } = await sb()
    .from('facturas_monotributo')
    .upsert(
      {
        empresa_id: empresaId(),
        empleado_id: empleadoId,
        periodo,
        monto,
        archivo_url: archivoUrl,
      },
      { onConflict: 'empleado_id,periodo' }
    )
    .select()
    .single();
  const f = oFalla(data, error);
  return {
    id: f.id,
    empleadoId: f.empleado_id,
    periodo: f.periodo,
    monto: Number(f.monto),
    archivoUrl: f.archivo_url ?? undefined,
    creadoEn: String(f.creado_en).slice(0, 10),
  };
};

export const eliminarFacturaMonotributo = async (id: string): Promise<void> => {
  const { error } = await sb()
    .from('facturas_monotributo')
    .delete()
    .eq('id', id);
  if (error) throw new Error(error.message);
};

// ---------- Cupos de licencia ----------

export const getCuposLicencia = async (): Promise<CupoLicencia[]> => {
  const { data, error } = await sb()
    .from('cupos_licencia')
    .select('*')
    .eq('empresa_id', empresaId());
  return oFalla(data, error).map(
    (f): CupoLicencia => ({
      id: f.id,
      empresaId: f.empresa_id,
      tipo: f.tipo,
      diasAnuales: Number(f.dias_anuales),
    })
  );
};

export const guardarCupoLicencia = async (
  tipo: TipoAusencia,
  diasAnuales: number
): Promise<CupoLicencia> => {
  const { data, error } = await sb()
    .from('cupos_licencia')
    .upsert(
      {
        empresa_id: empresaId(),
        tipo,
        dias_anuales: diasAnuales,
      },
      { onConflict: 'empresa_id,tipo' }
    )
    .select()
    .single();
  const f = oFalla(data, error);
  return {
    id: f.id,
    empresaId: f.empresa_id,
    tipo: f.tipo,
    diasAnuales: Number(f.dias_anuales),
  };
};

export const getSaldosLicencia = async (
  empleadoId: string,
  anio: number
): Promise<SaldoLicencia[]> => {
  const [cupos, ausencias] = await Promise.all([
    getCuposLicencia(),
    getAusenciasDeEmpleado(empleadoId),
  ]);
  return cupos.map((c) => {
    const usados = ausencias
      .filter(
        (a) =>
          a.tipo === c.tipo &&
          a.estado === 'aprobada' &&
          a.fechaDesde.startsWith(String(anio))
      )
      .reduce((acc, a) => acc + a.dias, 0);
    return {
      tipo: c.tipo,
      diasAnuales: c.diasAnuales,
      diasUtilizados: usados,
      diasDisponibles: Math.max(0, c.diasAnuales - usados),
    };
  });
};

// ---------- Comunicaciones ----------

export const getComunicaciones = async (): Promise<Comunicacion[]> => {
  const { data, error } = await sb()
    .from('comunicaciones')
    .select('*')
    .eq('empresa_id', empresaId())
    .order('actualizado_en', { ascending: false });
  return oFalla(data, error).map(aComunicacion);
};

export const getComunicacionesDeEmpleado = async (
  empleadoId: string
): Promise<Comunicacion[]> => {
  const { data, error } = await sb()
    .from('comunicaciones')
    .select('*')
    .eq('empleado_id', empleadoId)
    .order('actualizado_en', { ascending: false });
  return oFalla(data, error).map(aComunicacion);
};

export const crearComunicacion = async (datos: {
  empleadoId: string;
  tipo: TipoComunicacion;
  asunto: string;
  cuerpo: string;
}): Promise<Comunicacion> => {
  const uid = useAuthStore.getState().usuario?.id;
  if (!uid) throw new Error('Sin sesión.');
  const { data, error } = await sb()
    .from('comunicaciones')
    .insert({
      empresa_id: empresaId(),
      empleado_id: datos.empleadoId,
      autor_id: uid,
      tipo: datos.tipo,
      asunto: datos.asunto,
      cuerpo: datos.cuerpo,
    })
    .select()
    .single();
  const com = aComunicacion(oFalla(data, error));
  try {
    const gestores = await usuariosGestores();
    await notificarUsuarios(
      gestores,
      'comunicacion',
      `Nuevo ${datos.tipo}`,
      datos.asunto,
      '/comunicaciones'
    );
  } catch {
    // no bloquea
  }
  return com;
};

export const getMensajesComunicacion = async (
  comunicacionId: string
): Promise<ComunicacionMensaje[]> => {
  const { data, error } = await sb()
    .from('comunicacion_mensajes')
    .select('*')
    .eq('comunicacion_id', comunicacionId)
    .order('creado_en');
  return oFalla(data, error).map(aMensajeComunicacion);
};

export const responderComunicacion = async (
  comunicacionId: string,
  cuerpo: string
): Promise<ComunicacionMensaje> => {
  const uid = useAuthStore.getState().usuario?.id;
  if (!uid) throw new Error('Sin sesión.');
  const { data, error } = await sb()
    .from('comunicacion_mensajes')
    .insert({
      comunicacion_id: comunicacionId,
      autor_id: uid,
      cuerpo,
    })
    .select()
    .single();
  await sb()
    .from('comunicaciones')
    .update({
      estado: 'en_curso',
      actualizado_en: new Date().toISOString(),
    })
    .eq('id', comunicacionId);
  return aMensajeComunicacion(oFalla(data, error));
};

export const cerrarComunicacion = async (
  comunicacionId: string
): Promise<void> => {
  const { error } = await sb()
    .from('comunicaciones')
    .update({
      estado: 'cerrada',
      actualizado_en: new Date().toISOString(),
    })
    .eq('id', comunicacionId);
  if (error) throw new Error(error.message);
};

// ---------- Documentos para firma ----------

export const getDocumentosFirma = async (): Promise<
  (DocumentoFirma & { pendientes: number; firmados: number })[]
> => {
  const { data, error } = await sb()
    .from('documentos_firma')
    .select('*')
    .eq('empresa_id', empresaId())
    .order('creado_en', { ascending: false });
  const docs = oFalla(data, error).map(aDocumentoFirma);
  const conStats = await Promise.all(
    docs.map(async (d) => {
      const { data: dest } = await sb()
        .from('documento_firma_destinatarios')
        .select('firmado_en')
        .eq('documento_id', d.id);
      const lista = dest ?? [];
      return {
        ...d,
        firmados: lista.filter((x) => x.firmado_en).length,
        pendientes: lista.filter((x) => !x.firmado_en).length,
      };
    })
  );
  return conStats;
};

export const getDocumentosFirmaPendientes = async (
  empleadoId: string
): Promise<(DocumentoFirma & { destinatarioId: string })[]> => {
  const { data, error } = await sb()
    .from('documento_firma_destinatarios')
    .select('id, documento_id, documentos_firma(*)')
    .eq('empleado_id', empleadoId)
    .is('firmado_en', null);
  if (error) throw new Error(error.message);
  return (data ?? [])
    .filter((r) => r.documentos_firma)
    .map((r) => {
      const raw = r.documentos_firma as unknown;
      const doc = Array.isArray(raw) ? raw[0] : raw;
      return {
        ...aDocumentoFirma(doc as Record<string, unknown>),
        destinatarioId: r.id as string,
      };
    });
};

export const crearDocumentoFirma = async (datos: {
  titulo: string;
  descripcion?: string;
  archivo: File;
  empleadoIds: string[];
}): Promise<DocumentoFirma> => {
  const path = await subirDocumentoLegajo('firma-docs', datos.archivo);
  const uid = useAuthStore.getState().usuario?.id ?? null;
  const { data, error } = await sb()
    .from('documentos_firma')
    .insert({
      empresa_id: empresaId(),
      titulo: datos.titulo,
      descripcion: datos.descripcion ?? null,
      archivo_url: path,
      creado_por: uid,
    })
    .select()
    .single();
  const doc = aDocumentoFirma(oFalla(data, error));
  if (datos.empleadoIds.length > 0) {
    await sb()
      .from('documento_firma_destinatarios')
      .insert(
        datos.empleadoIds.map((empleadoId) => ({
          documento_id: doc.id,
          empleado_id: empleadoId,
        }))
      );
    // Notificar a usuarios vinculados
    try {
      const { data: usuarios } = await sb()
        .from('usuarios')
        .select('id')
        .in('empleado_id', datos.empleadoIds);
      if (usuarios?.length) {
        await notificarUsuarios(
          usuarios.map((u) => u.id),
          'documento_firma',
          'Documento para firmar',
          datos.titulo,
          '/documentos-firma'
        );
      }
    } catch {
      // no bloquea
    }
  }
  return doc;
};

export const firmarDocumento = async (
  destinatarioId: string
): Promise<void> => {
  const { error } = await sb()
    .from('documento_firma_destinatarios')
    .update({ firmado_en: new Date().toISOString() })
    .eq('id', destinatarioId);
  if (error) throw new Error(error.message);
};

export const abrirDocumentoFirma = async (
  doc: DocumentoFirma
): Promise<string> => urlFirmada('documentos', doc.archivoUrl);

// ---------- Pendientes (badges) ----------

export const getPendientesResumen = async (): Promise<PendientesResumen> => {
  const usuario = useAuthStore.getState().usuario;
  if (!usuario) {
    return {
      recibosPorFirmar: 0,
      ausenciasPorResolver: 0,
      comunicacionesAbiertas: 0,
      documentosPorFirmar: 0,
      total: 0,
    };
  }
  const rol = usuario.rol;
  const esGestor = rol === 'admin_rrhh' || rol === 'supervisor' || rol === 'superadmin';

  let recibosPorFirmar = 0;
  let ausenciasPorResolver = 0;
  let comunicacionesAbiertas = 0;
  let documentosPorFirmar = 0;

  if (usuario.empleadoId) {
    const [recibos, docs] = await Promise.all([
      getRecibos(usuario.empleadoId),
      getDocumentosFirmaPendientes(usuario.empleadoId),
    ]);
    recibosPorFirmar = recibos.filter(
      (r) => r.estadoFirma === 'pendiente' && r.firmadoEmpleadorEn
    ).length;
    documentosPorFirmar = docs.length;
  }

  if (esGestor) {
    const [ausencias, coms] = await Promise.all([
      getAusenciasPendientes(),
      getComunicaciones(),
    ]);
    ausenciasPorResolver = ausencias.length;
    comunicacionesAbiertas = coms.filter((c) => c.estado !== 'cerrada').length;
  } else if (usuario.empleadoId) {
    const coms = await getComunicacionesDeEmpleado(usuario.empleadoId);
    comunicacionesAbiertas = coms.filter((c) => c.estado !== 'cerrada').length;
  }

  const total =
    recibosPorFirmar +
    ausenciasPorResolver +
    comunicacionesAbiertas +
    documentosPorFirmar;

  return {
    recibosPorFirmar,
    ausenciasPorResolver,
    comunicacionesAbiertas,
    documentosPorFirmar,
    total,
  };
};

const aComunicacion = (f: Record<string, unknown>): Comunicacion => ({
  id: f.id as string,
  empresaId: f.empresa_id as string,
  empleadoId: f.empleado_id as string,
  autorId: f.autor_id as string,
  tipo: f.tipo as TipoComunicacion,
  asunto: f.asunto as string,
  cuerpo: (f.cuerpo as string) ?? '',
  estado: f.estado as EstadoComunicacion,
  creadoEn: String(f.creado_en).slice(0, 10),
  actualizadoEn: String(f.actualizado_en).slice(0, 10),
});

const aMensajeComunicacion = (
  f: Record<string, unknown>
): ComunicacionMensaje => ({
  id: f.id as string,
  comunicacionId: f.comunicacion_id as string,
  autorId: f.autor_id as string,
  cuerpo: f.cuerpo as string,
  creadoEn: String(f.creado_en),
});

const aDocumentoFirma = (f: Record<string, unknown>): DocumentoFirma => ({
  id: f.id as string,
  empresaId: f.empresa_id as string,
  titulo: f.titulo as string,
  descripcion: (f.descripcion as string) ?? undefined,
  archivoUrl: f.archivo_url as string,
  creadoPor: (f.creado_por as string) ?? undefined,
  creadoEn: String(f.creado_en).slice(0, 10),
});

