import {
  Icon,
  IconBeach,
  IconClockHour4,
  IconClockPause,
  IconDoorExit,
  IconFlower,
  IconHeartHandshake,
  IconHome,
  IconLicense,
  IconSchool,
  IconStethoscope,
  IconTruck,
  IconWriting,
} from '@tabler/icons-react';
import { CategoriaDocumento, TipoAusencia, TipoRecibo } from '@/types/rrhh';

export const categoriaDocumentoLabels: Record<CategoriaDocumento, string> = {
  dni: 'DNI',
  contrato: 'Contrato',
  alta_afip: 'Alta AFIP',
  certificado: 'Certificado',
  licencia: 'Licencia',
  estudio_medico: 'Estudio médico',
  titulo: 'Título',
  curso: 'Curso',
  otro: 'Otro',
};

export const tipoAusenciaLabels: Record<TipoAusencia, string> = {
  vacaciones: 'Vacaciones',
  enfermedad: 'Enfermedad',
  estudio: 'Estudio',
  mudanza: 'Mudanza',
  fallecimiento: 'Fallecimiento',
  especial: 'Licencia especial',
  entrada_tarde: 'Entrada tarde',
  salida_anticipada: 'Salida anticipada',
  salida_intermedia: 'Salida intermedia',
  home_office: 'Home office',
  casamiento: 'Casamiento',
  donacion_sangre: 'Donación de sangre',
  examenes: 'Exámenes',
};

export const tipoAusenciaIconos: Record<TipoAusencia, Icon> = {
  vacaciones: IconBeach,
  enfermedad: IconStethoscope,
  estudio: IconSchool,
  mudanza: IconTruck,
  fallecimiento: IconFlower,
  especial: IconLicense,
  entrada_tarde: IconClockPause,
  salida_anticipada: IconDoorExit,
  salida_intermedia: IconClockHour4,
  home_office: IconHome,
  casamiento: IconHeartHandshake,
  donacion_sangre: IconHeartHandshake,
  examenes: IconWriting,
};

/**
 * Color sólido por tipo de ausencia (para puntos/indicadores en el calendario).
 * Son fills planos (sin texto encima), así funcionan igual en modo oscuro.
 */
export const tipoAusenciaColores: Record<TipoAusencia, string> = {
  vacaciones: 'bg-brand-600',
  enfermedad: 'bg-red-500',
  estudio: 'bg-violet-500',
  mudanza: 'bg-orange-500',
  fallecimiento: 'bg-slate-500',
  especial: 'bg-teal-500',
  entrada_tarde: 'bg-amber-500',
  salida_anticipada: 'bg-amber-600',
  salida_intermedia: 'bg-amber-400',
  home_office: 'bg-emerald-500',
  casamiento: 'bg-pink-500',
  donacion_sangre: 'bg-rose-600',
  examenes: 'bg-indigo-500',
};

/** Tipos de jornada (se alinean con Turnos; también se pueden cargar a mano). */
export const TIPOS_AUSENCIA_JORNADA: TipoAusencia[] = [
  'entrada_tarde',
  'salida_anticipada',
  'salida_intermedia',
  'home_office',
];

/** Cómo se llama cada concepto en pantalla. */
export const tipoReciboLabels: Record<TipoRecibo, string> = {
  mensual: 'Sueldo mensual',
  sac: 'Aguinaldo (SAC)',
  vacaciones: 'Vacaciones',
  gratificacion: 'Gratificación',
  liquidacion_final: 'Liquidación final',
};
