import {
  Icon,
  IconBeach,
  IconFlower,
  IconLicense,
  IconSchool,
  IconStethoscope,
  IconTruck,
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
};

export const tipoAusenciaIconos: Record<TipoAusencia, Icon> = {
  vacaciones: IconBeach,
  enfermedad: IconStethoscope,
  estudio: IconSchool,
  mudanza: IconTruck,
  fallecimiento: IconFlower,
  especial: IconLicense,
};
