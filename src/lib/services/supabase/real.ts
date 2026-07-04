/**
 * Implementación real de la capa de servicios contra Supabase.
 * Mismas firmas que la versión demo (rrhh.demo.ts); la elección
 * entre una y otra la hace el facade src/lib/services/rrhh.ts.
 */
import {
  Alerta,
  Ausencia,
  ConfigPlataforma,
  DescriptorFacial,
  DocumentoLegajo,
  Empleado,
  Empresa,
  EmpresaResumen,
  EventoAgenda,
  Fichaje,
  MetricasGlobales,
  Notificacion,
  NuevaEmpresa,
  OpcionesFichaje,
  ReciboSueldo,
  Remuneracion,
  ResumenControl,
  SaldoVacaciones,
  Usuario,
} from '@/types/rrhh';
import type {
  MiMes,
  NuevaAusencia,
  NuevoDocumento,
  NuevoEmpleado,
  NuevoEvento,
  NuevoUsuario,
} from '@/lib/services/rrhh.demo';
import { diasVacacionesPorAntiguedad } from '@/lib/vacaciones';
import { diasEntre, hoyISO } from '@/lib/fechas';
import { supabase } from '@/lib/supabase/cliente';
import { empresaOperativaId, useAuthStore } from '@/lib/auth/store';
import {
  aAusencia,
  aDocumento,
  aEmpleado,
  aEmpresa,
  aEvento,
  aFichaje,
  aNotificacion,
  aRecibo,
  aRemuneracion,
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
      contacto_nombre: datos.contactoNombre,
      contacto_email: datos.contactoEmail,
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
    .select('*')
    .eq('empresa_id', empresaId())
    .eq('activo', true)
    .order('apellido');
  return conFotosFirmadas(oFalla(data, error).map(aEmpleado));
};

export const getEmpleadosTodos = async (): Promise<Empleado[]> => {
  const { data, error } = await sb()
    .from('empleados')
    .select('*')
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
    .select('*')
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
  return data ? aEmpleado(data) : null;
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
  return data ? aEmpleado(data) : null;
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
  return aDocumento(oFalla(data, error));
};

export const quitarDocumento = async (documentoId: string): Promise<void> => {
  const { error } = await sb()
    .from('documentos_legajo')
    .delete()
    .eq('id', documentoId);
  if (error) throw new Error(error.message);
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

export const crearAusencia = async (
  datos: NuevaAusencia
): Promise<Ausencia> => {
  const { data, error } = await sb()
    .from('ausencias')
    .insert({
      empresa_id: empresaId(),
      empleado_id: datos.empleadoId,
      tipo: datos.tipo,
      fecha_desde: datos.fechaDesde,
      fecha_hasta: datos.fechaHasta,
      dias: diasEntre(datos.fechaDesde, datos.fechaHasta),
      comentario_empleado: datos.comentario ?? null,
    })
    .select()
    .single();
  return aAusencia(oFalla(data, error));
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
  return data ? aAusencia(data) : null;
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
  const tipo = ultimo?.tipo === 'ingreso' ? 'egreso' : 'ingreso';
  const { data, error } = await sb()
    .from('fichajes')
    .insert({
      empresa_id: empresaId(),
      empleado_id: empleadoId,
      tipo,
      metodo: opciones.metodo ?? 'celular',
      confianza: opciones.confianza ?? null,
      geo: opciones.geo ?? null,
      // La foto es opcional; solo se guarda si ya es una URL (no dataURL).
      foto_url:
        opciones.fotoUrl && !opciones.fotoUrl.startsWith('data:')
          ? opciones.fotoUrl
          : null,
    })
    .select()
    .single();
  return aFichaje(oFalla(data, error));
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
  return data ? aEmpleado(oFalla(data, error)) : null;
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
  return data ? aEmpleado(oFalla(data, error)) : null;
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
  const [{ data, error }, empleados] = await Promise.all([
    sb()
      .from('eventos_agenda')
      .select('*')
      .eq('empresa_id', empresaId())
      .gte('fecha', hoyISO())
      .order('fecha'),
    getEmpleados(),
  ]);

  // Cumpleaños derivados de las fichas (próximos 90 días)
  const hoy = new Date();
  const cumples: EventoAgenda[] = empleados
    .filter((e) => e.fechaNacimiento)
    .map((e) => {
      const [, mes, dia] = e.fechaNacimiento.split('-').map(Number);
      const fecha = new Date(hoy.getFullYear(), mes - 1, dia);
      if (fecha < hoy) fecha.setFullYear(fecha.getFullYear() + 1);
      return {
        id: `cumple-${e.id}`,
        empresaId: e.empresaId,
        tipo: 'cumpleanios' as const,
        titulo: `Cumpleaños de ${e.nombre} ${e.apellido}`,
        fecha: `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`,
      };
    })
    .filter((c) => diasEntre(hoyISO(), c.fecha) <= 90);

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
  return data ? aRecibo(data) : null;
};

/** El admin sube el PDF del recibo de un período (pisa si ya existía). */
export const cargarRecibo = async (
  empleadoId: string,
  periodo: string,
  archivo: File
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
      },
      { onConflict: 'empleado_id,periodo' }
    )
    .select()
    .single();
  return aRecibo(oFalla(data, error));
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
