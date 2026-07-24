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
import { CategoriaDocumento, TipoAusencia } from '@/types/rrhh';

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

/** Tipos de jornada (se alinean con Turnos; también se pueden cargar a mano). */
export const TIPOS_AUSENCIA_JORNADA: TipoAusencia[] = [
  'entrada_tarde',
  'salida_anticipada',
  'salida_intermedia',
  'home_office',
];
