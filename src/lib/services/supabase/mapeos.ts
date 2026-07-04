/**
 * Conversión entre las filas de Postgres (snake_case) y los tipos
 * de dominio (camelCase). Un solo lugar para todo el mapeo.
 */
import {
  Ausencia,
  ChecklistItem,
  ContactoEmergencia,
  DocumentoLegajo,
  Empleado,
  Empresa,
  EventoAgenda,
  Familiar,
  Fichaje,
  Notificacion,
  ReciboSueldo,
  Remuneracion,
  Usuario,
} from '@/types/rrhh';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Fila = Record<string, any>;

export const aEmpresa = (f: Fila): Empresa => ({
  id: f.id,
  nombre: f.nombre,
  cuit: f.cuit,
  logoUrl: f.logo_url ?? undefined,
  estado: f.estado,
  contactoNombre: f.contacto_nombre,
  contactoEmail: f.contacto_email,
  config: f.config,
  creadaEn: String(f.creada_en).slice(0, 10),
});

export const aUsuario = (f: Fila): Usuario => ({
  id: f.id,
  email: f.email,
  rol: f.rol,
  empresaId: f.empresa_id,
  empleadoId: f.empleado_id,
  nombreCompleto: f.nombre_completo,
  avatarUrl: f.avatar_url ?? undefined,
});

export const aEmpleado = (f: Fila): Empleado => ({
  id: f.id,
  empresaId: f.empresa_id,
  nombre: f.nombre,
  apellido: f.apellido,
  dni: f.dni,
  cuil: f.cuil ?? '',
  fechaNacimiento: f.fecha_nacimiento ?? '',
  estadoCivil: f.estado_civil,
  nivelEstudios: f.nivel_estudios,
  domicilio: f.domicilio ?? '',
  telefono: f.telefono ?? '',
  email: f.email ?? '',
  contactoEmergencia: (f.contacto_emergencia ?? {
    nombreCompleto: '',
    vinculo: '',
    telefono: '',
  }) as ContactoEmergencia,
  grupoFamiliar: (f.grupo_familiar ?? []) as Familiar[],
  fotoUrl: f.foto_url ?? undefined,
  fechaIngreso: f.fecha_ingreso,
  puesto: f.puesto,
  sector: f.sector,
  supervisorId: f.supervisor_id,
  modalidadContratacion: f.modalidad_contratacion,
  fechaFinContrato: f.fecha_fin_contrato ?? undefined,
  modalidadPago: f.modalidad_pago,
  banco: f.banco ?? '',
  cbu: f.cbu ?? '',
  obraSocial: f.obra_social ?? '',
  art: f.art ?? '',
  activo: f.activo,
  fechaBaja: f.fecha_baja ?? undefined,
  motivoBaja: f.motivo_baja ?? undefined,
  checklistAlta: (f.checklist_alta ?? []) as ChecklistItem[],
});

export const aDocumento = (f: Fila): DocumentoLegajo => ({
  id: f.id,
  empleadoId: f.empleado_id,
  categoria: f.categoria,
  nombre: f.nombre,
  archivoUrl: f.archivo_url,
  fechaVencimiento: f.fecha_vencimiento ?? undefined,
  creadoEn: String(f.creado_en).slice(0, 10),
});

export const aAusencia = (f: Fila): Ausencia => ({
  id: f.id,
  empleadoId: f.empleado_id,
  tipo: f.tipo,
  fechaDesde: f.fecha_desde,
  fechaHasta: f.fecha_hasta,
  dias: f.dias,
  estado: f.estado,
  adjuntos: (f.adjuntos ?? []) as string[],
  comentarioEmpleado: f.comentario_empleado ?? undefined,
  resueltaPor: f.resuelta_por ?? undefined,
  comentarioResolucion: f.comentario_resolucion ?? undefined,
  resueltaEn: f.resuelta_en ? String(f.resuelta_en).slice(0, 10) : undefined,
  creadaEn: String(f.creada_en).slice(0, 10),
});

export const aFichaje = (f: Fila): Fichaje => ({
  id: f.id,
  empleadoId: f.empleado_id,
  tipo: f.tipo,
  timestamp: f.ts,
  metodo: f.metodo,
  fotoUrl: f.foto_url ?? undefined,
  geo: f.geo ?? undefined,
  dispositivoId: f.dispositivo_id ?? undefined,
});

export const aRecibo = (f: Fila): ReciboSueldo => ({
  id: f.id,
  empleadoId: f.empleado_id,
  periodo: f.periodo,
  archivoUrl: f.archivo_url,
  estadoFirma: f.estado_firma,
  firmadoEn: f.firmado_en ? String(f.firmado_en).slice(0, 10) : undefined,
});

export const aRemuneracion = (f: Fila): Remuneracion => ({
  id: f.id,
  empleadoId: f.empleado_id,
  periodo: f.periodo,
  montoBruto: Number(f.monto_bruto),
  montoNeto: Number(f.monto_neto),
});

export const aEvento = (f: Fila): EventoAgenda => ({
  id: f.id,
  empresaId: f.empresa_id,
  tipo: f.tipo,
  titulo: f.titulo,
  fecha: f.fecha,
  descripcion: f.descripcion ?? undefined,
});

export const aNotificacion = (f: Fila): Notificacion => ({
  id: f.id,
  usuarioId: f.usuario_id,
  tipo: f.tipo,
  titulo: f.titulo,
  cuerpo: f.cuerpo,
  link: f.link ?? undefined,
  leida: f.leida,
  creadaEn: f.creada_en,
});
