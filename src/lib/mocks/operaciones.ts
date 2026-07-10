import {
  Adelanto,
  Alerta,
  Ausencia,
  DescuentoRecurrente,
  DocumentoLegajo,
  EventoAgenda,
  Fichaje,
  NotaInterna,
  Notificacion,
  ReciboSueldo,
  Remuneracion,
  Turno,
} from '@/types/rrhh';

export const documentosMock: DocumentoLegajo[] = [
  {
    id: 'doc-1',
    empleadoId: 'ple-3',
    categoria: 'dni',
    nombre: 'DNI frente y dorso',
    archivoUrl: '/legajos/ple-3/dni.pdf',
    creadoEn: '2021-02-15',
  },
  {
    id: 'doc-2',
    empleadoId: 'ple-3',
    categoria: 'contrato',
    nombre: 'Contrato de trabajo',
    archivoUrl: '/legajos/ple-3/contrato.pdf',
    creadoEn: '2021-02-15',
  },
  {
    id: 'doc-3',
    empleadoId: 'ple-3',
    categoria: 'estudio_medico',
    nombre: 'Examen preocupacional',
    archivoUrl: '/legajos/ple-3/preocupacional.pdf',
    fechaVencimiento: '2026-08-20',
    creadoEn: '2025-08-20',
  },
  {
    id: 'doc-4',
    empleadoId: 'ple-5',
    categoria: 'contrato',
    nombre: 'Contrato a plazo fijo',
    archivoUrl: '/legajos/ple-5/contrato.pdf',
    fechaVencimiento: '2026-08-31',
    creadoEn: '2026-03-01',
  },
];

export const ausenciasMock: Ausencia[] = [
  {
    id: 'aus-1',
    empleadoId: 'ple-3',
    tipo: 'vacaciones',
    fechaDesde: '2026-07-20',
    fechaHasta: '2026-07-24',
    dias: 5,
    estado: 'pendiente',
    adjuntos: [],
    comentarioEmpleado: 'Viaje familiar',
    creadaEn: '2026-06-28',
  },
  {
    id: 'aus-2',
    empleadoId: 'ple-4',
    tipo: 'estudio',
    fechaDesde: '2026-07-06',
    fechaHasta: '2026-07-07',
    dias: 2,
    estado: 'pendiente',
    adjuntos: [],
    comentarioEmpleado: 'Final de Contabilidad II',
    creadaEn: '2026-06-30',
  },
  {
    id: 'aus-3',
    empleadoId: 'ple-6',
    tipo: 'enfermedad',
    fechaDesde: '2026-07-01',
    fechaHasta: '2026-07-03',
    dias: 3,
    estado: 'aprobada',
    adjuntos: ['certificado-medico.pdf'],
    resueltaPor: 'ple-2',
    resueltaEn: '2026-07-01',
    creadaEn: '2026-07-01',
  },
  {
    id: 'aus-4',
    empleadoId: 'ple-3',
    tipo: 'vacaciones',
    fechaDesde: '2026-01-12',
    fechaHasta: '2026-01-16',
    dias: 5,
    estado: 'aprobada',
    adjuntos: [],
    resueltaPor: 'ple-2',
    resueltaEn: '2025-12-20',
    creadaEn: '2025-12-18',
  },
  {
    id: 'aus-5',
    empleadoId: 'ple-5',
    tipo: 'mudanza',
    fechaDesde: '2026-06-15',
    fechaHasta: '2026-06-16',
    dias: 2,
    estado: 'rechazada',
    adjuntos: [],
    resueltaPor: 'ple-2',
    comentarioResolucion: 'Semana de entrega grande, reprogramemos',
    resueltaEn: '2026-06-10',
    creadaEn: '2026-06-08',
  },
];

export const fichajesMock: Fichaje[] = [
  {
    id: 'fic-1',
    empleadoId: 'ple-3',
    tipo: 'ingreso',
    timestamp: '2026-07-02T07:55:00',
    metodo: 'facial_tablet',
  },
  {
    id: 'fic-2',
    empleadoId: 'ple-4',
    tipo: 'ingreso',
    timestamp: '2026-07-02T08:22:00',
    metodo: 'celular',
    geo: { lat: -34.7203, lng: -58.2542 },
  },
  {
    id: 'fic-3',
    empleadoId: 'ple-5',
    tipo: 'ingreso',
    timestamp: '2026-07-02T07:48:00',
    metodo: 'facial_tablet',
  },
  {
    id: 'fic-4',
    empleadoId: 'ple-2',
    tipo: 'ingreso',
    timestamp: '2026-07-02T07:40:00',
    metodo: 'facial_tablet',
  },
];

export const alertasMock: Alerta[] = [
  {
    id: 'ale-1',
    empresaId: 'emp-1',
    tipo: 'contrato_plazo',
    titulo: 'Vence contrato a plazo fijo — Marcos Villalba',
    fecha: '2026-08-31',
    empleadoId: 'ple-5',
    diasAviso: 60,
    estado: 'pendiente',
  },
  {
    id: 'ale-2',
    empresaId: 'emp-1',
    tipo: 'examen_medico',
    titulo: 'Examen médico periódico — Jorge Ríos',
    fecha: '2026-07-15',
    empleadoId: 'ple-2',
    diasAviso: 30,
    estado: 'pendiente',
  },
  {
    id: 'ale-3',
    empresaId: 'emp-1',
    tipo: 'art',
    titulo: 'Renovación póliza ART',
    fecha: '2026-09-01',
    diasAviso: 30,
    estado: 'pendiente',
  },
];

export const eventosMock: EventoAgenda[] = [
  {
    id: 'eve-1',
    empresaId: 'emp-1',
    tipo: 'capacitacion',
    titulo: 'Capacitación: seguridad e higiene',
    fecha: '2026-07-10',
    descripcion: 'Planta completa, 9 a 12 hs',
  },
  {
    id: 'eve-2',
    empresaId: 'emp-1',
    tipo: 'cumpleanios',
    titulo: 'Cumpleaños de Valeria Sosa',
    fecha: '2026-09-30',
  },
  {
    id: 'eve-3',
    empresaId: 'emp-1',
    tipo: 'evento',
    titulo: 'Almuerzo de fin de temporada',
    fecha: '2026-07-17',
  },
];

export const remuneracionesMock: Remuneracion[] = [
  {
    id: 'rem-1',
    empleadoId: 'ple-3',
    periodo: '2026-04',
    montoBruto: 950000,
    montoNeto: 788500,
  },
  {
    id: 'rem-2',
    empleadoId: 'ple-3',
    periodo: '2026-05',
    montoBruto: 1010000,
    montoNeto: 838300,
  },
  {
    id: 'rem-3',
    empleadoId: 'ple-3',
    periodo: '2026-06',
    montoBruto: 1075000,
    montoNeto: 892250,
  },
];

export const recibosMock: ReciboSueldo[] = [
  {
    id: 'rec-1',
    empleadoId: 'ple-3',
    periodo: '2026-05',
    archivoUrl: '/recibos/2026-05.pdf',
    estadoFirma: 'firmado',
    firmadoEn: '2026-06-05',
    firmadoEmpleadorEn: '2026-06-01',
  },
  {
    id: 'rec-2',
    empleadoId: 'ple-3',
    periodo: '2026-06',
    archivoUrl: '/recibos/2026-06.pdf',
    estadoFirma: 'pendiente',
    firmadoEmpleadorEn: '2026-07-01',
  },
];

export const descuentosRecurrentesMock: DescuentoRecurrente[] = [
  {
    id: 'dsc-1',
    empleadoId: 'ple-3',
    concepto: 'Sindicato',
    monto: 21500,
  },
];

export const adelantosMock: Adelanto[] = [
  {
    id: 'ade-1',
    empleadoId: 'ple-3',
    monto: 150000,
    motivo: 'Arreglo del auto',
    estado: 'pendiente',
    creadoEn: '2026-07-06',
  },
];

export const notificacionesMock: Notificacion[] = [
  {
    id: 'not-1',
    usuarioId: 'usr-super-1',
    tipo: 'ausencia_solicitada',
    titulo: 'Nueva solicitud de vacaciones',
    cuerpo: 'Lucas Pereyra solicitó 5 días (20 al 24 de julio)',
    link: '/ausencias',
    leida: false,
    creadaEn: '2026-06-28T10:12:00',
  },
  {
    id: 'not-2',
    usuarioId: 'usr-empleado',
    tipo: 'recibo_disponible',
    titulo: 'Recibo de junio disponible',
    cuerpo: 'Ya podés ver y firmar tu recibo de sueldo',
    link: '/recibos',
    leida: false,
    creadaEn: '2026-07-01T09:00:00',
  },
];

export const turnosMock: Turno[] = [
  {
    id: 'tur-1',
    empleadoId: 'ple-3',
    fecha: '2026-06-29',
    horaEntrada: '08:00',
    horaSalida: '17:00',
  },
  {
    id: 'tur-2',
    empleadoId: 'ple-3',
    fecha: '2026-06-30',
    horaEntrada: '08:00',
    horaSalida: '17:00',
  },
  {
    id: 'tur-3',
    empleadoId: 'ple-3',
    fecha: '2026-07-01',
    horaEntrada: '08:00',
    horaSalida: '17:00',
  },
];

export const notasInternasMock: NotaInterna[] = [
  {
    id: 'nin-1',
    empleadoId: 'ple-3',
    fecha: '2026-07-03',
    autorId: 'usr-admin',
    autorNombre: 'Carolina Méndez',
    motivo: 'Solicitó aumento',
    observacion: 'Pidió revisión salarial en la reunión de equipo.',
  },
  {
    id: 'nin-2',
    empleadoId: 'ple-3',
    fecha: '2026-06-10',
    autorId: 'usr-admin',
    autorNombre: 'Carolina Méndez',
    motivo: 'Problema familiar',
    observacion: 'Necesitó flexibilidad horaria por unos días.',
  },
];
