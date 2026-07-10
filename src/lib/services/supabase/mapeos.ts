/**
 * Conversión entre las filas de Postgres (snake_case) y los tipos
 * de dominio (camelCase). Un solo lugar para todo el mapeo.
 */
import {
  Adelanto,
  Ausencia,
  ChecklistItem,
  ContactoEmergencia,
  Convenio,
  DescuentoRecurrente,
  DocumentoLegajo,
  Empleado,
  Empresa,
  EventoAgenda,
  Familiar,
  Fichaje,
  MovimientoFinanciero,
  NotaInterna,
  Notificacion,
  ReciboSueldo,
  Remuneracion,
  Terminal,
  Turno,
  Usuario,
} from '@/types/rrhh';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Fila = Record<string, any>;

export const aEmpresa = (f: Fila): Empresa => ({
  id: f.id,
  nombre: f.nombre,
  cuit: f.cuit,
  razonSocial: f.razon_social ?? undefined,
  domicilio: f.domicilio ?? undefined,
  logoUrl: f.logo_url ?? undefined,
  estado: f.estado,
  contactoNombre: f.contacto_nombre,
  contactoEmail: f.contacto_email,
  contactoTelefono: f.contacto_telefono ?? undefined,
  config: f.config,
  plan: f.plan ?? undefined,
  abonoMensual: f.abono_mensual != null ? Number(f.abono_mensual) : undefined,
  creadaEn: String(f.creada_en).slice(0, 10),
});

export const aMovimiento = (f: Fila): MovimientoFinanciero => ({
  id: f.id,
  tipo: f.tipo,
  concepto: f.concepto,
  categoria: f.categoria ?? undefined,
  empresaId: f.empresa_id ?? undefined,
  monto: Number(f.monto),
  fecha: String(f.fecha).slice(0, 10),
  periodo: f.periodo,
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
  convenio: f.convenio ?? undefined,
  activo: f.activo,
  fechaBaja: f.fecha_baja ?? undefined,
  motivoBaja: f.motivo_baja ?? undefined,
  checklistAlta: (f.checklist_alta ?? []) as ChecklistItem[],
  modoFichaje: (f.modo_fichaje ?? undefined) as Empleado['modoFichaje'],
  geocerca: (f.geocerca ?? undefined) as Empleado['geocerca'],
  descriptorFacial: (f.descriptor_facial ?? undefined) as number[] | undefined,
  consentimientoBiometrico: (f.consentimiento_biometrico ?? undefined) as
    | Empleado['consentimientoBiometrico']
    | undefined,
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
  confianza: f.confianza ?? undefined,
  fueraDeZona: f.fuera_de_zona ?? undefined,
  registradoPor: f.registrado_por ?? undefined,
});

export const aTerminal = (f: Fila): Terminal => ({
  id: f.id,
  empresaId: f.empresa_id,
  nombre: f.nombre,
  creadoEn: f.creado_en ? String(f.creado_en).slice(0, 10) : undefined,
});

export const aConvenio = (f: Fila): Convenio => ({
  empresaId: f.empresa_id,
  nombre: f.nombre,
  contenido: f.contenido ?? '',
  actualizadoEn: f.actualizado_en ?? undefined,
});

export const aTurno = (f: Fila): Turno => ({
  id: f.id,
  empleadoId: f.empleado_id,
  fecha: String(f.fecha).slice(0, 10),
  horaEntrada: String(f.hora_entrada).slice(0, 5),
  horaSalida: String(f.hora_salida).slice(0, 5),
  extrasAprobadas: f.extras_aprobadas ?? false,
});

export const aNotaInterna = (f: Fila): NotaInterna => ({
  id: f.id,
  empleadoId: f.empleado_id,
  fecha: String(f.fecha).slice(0, 10),
  autorId: f.autor_id,
  autorNombre: f.autor_nombre,
  motivo: f.motivo,
  observacion: f.observacion ?? undefined,
});

export const aRecibo = (f: Fila): ReciboSueldo => ({
  id: f.id,
  empleadoId: f.empleado_id,
  periodo: f.periodo,
  archivoUrl: f.archivo_url,
  estadoFirma: f.estado_firma,
  firmadoEn: f.firmado_en ? String(f.firmado_en).slice(0, 10) : undefined,
  firmadoEmpleadorEn: f.firmado_empleador_en
    ? String(f.firmado_empleador_en).slice(0, 10)
    : undefined,
});

export const aDescuentoRecurrente = (f: Fila): DescuentoRecurrente => ({
  id: f.id,
  empleadoId: f.empleado_id,
  concepto: f.concepto,
  monto: Number(f.monto),
});

export const aAdelanto = (f: Fila): Adelanto => ({
  id: f.id,
  empleadoId: f.empleado_id,
  monto: Number(f.monto),
  motivo: f.motivo ?? undefined,
  estado: f.estado,
  periodo: f.periodo ?? undefined,
  creadoEn: String(f.creado_en).slice(0, 10),
  resueltoEn: f.resuelto_en ? String(f.resuelto_en).slice(0, 10) : undefined,
});

export const aRemuneracion = (f: Fila): Remuneracion => ({
  id: f.id,
  empleadoId: f.empleado_id,
  periodo: f.periodo,
  montoBruto: Number(f.monto_bruto),
  noRemunerativo:
    f.no_remunerativo != null ? Number(f.no_remunerativo) : undefined,
  aportes: f.aportes != null ? Number(f.aportes) : undefined,
  otrosDescuentos:
    f.otros_descuentos != null ? Number(f.otros_descuentos) : undefined,
  montoNeto: Number(f.monto_neto),
  convenio: f.convenio ?? undefined,
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
