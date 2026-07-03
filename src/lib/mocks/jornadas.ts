import { JornadaCalculada } from '@/types/rrhh';

/**
 * Jornadas calculadas de la última semana (mock) para reportes de control.
 */
export const jornadasMock: JornadaCalculada[] = [
  // Lucas Pereyra — cumplidor, algunas extras
  {
    empleadoId: 'ple-3',
    fecha: '2026-06-29',
    horasTrabajadas: 9.5,
    horasExtras: 1.5,
    llegadaTardeMin: 0,
    salidaAnticipadaMin: 0,
    incompleta: false,
  },
  {
    empleadoId: 'ple-3',
    fecha: '2026-06-30',
    horasTrabajadas: 8,
    horasExtras: 0,
    llegadaTardeMin: 0,
    salidaAnticipadaMin: 0,
    incompleta: false,
  },
  {
    empleadoId: 'ple-3',
    fecha: '2026-07-01',
    horasTrabajadas: 10,
    horasExtras: 2,
    llegadaTardeMin: 0,
    salidaAnticipadaMin: 0,
    incompleta: false,
  },
  // Sofía Aguirre — llegadas tarde reiteradas
  {
    empleadoId: 'ple-4',
    fecha: '2026-06-29',
    horasTrabajadas: 7.6,
    horasExtras: 0,
    llegadaTardeMin: 25,
    salidaAnticipadaMin: 0,
    incompleta: false,
  },
  {
    empleadoId: 'ple-4',
    fecha: '2026-06-30',
    horasTrabajadas: 7.8,
    horasExtras: 0,
    llegadaTardeMin: 12,
    salidaAnticipadaMin: 0,
    incompleta: false,
  },
  {
    empleadoId: 'ple-4',
    fecha: '2026-07-01',
    horasTrabajadas: 7.7,
    horasExtras: 0,
    llegadaTardeMin: 18,
    salidaAnticipadaMin: 0,
    incompleta: false,
  },
  // Marcos Villalba — salida anticipada y fichaje incompleto
  {
    empleadoId: 'ple-5',
    fecha: '2026-06-29',
    horasTrabajadas: 8,
    horasExtras: 0,
    llegadaTardeMin: 0,
    salidaAnticipadaMin: 0,
    incompleta: false,
  },
  {
    empleadoId: 'ple-5',
    fecha: '2026-06-30',
    horasTrabajadas: 7.2,
    horasExtras: 0,
    llegadaTardeMin: 0,
    salidaAnticipadaMin: 45,
    incompleta: false,
  },
  {
    empleadoId: 'ple-5',
    fecha: '2026-07-01',
    horasTrabajadas: 0,
    horasExtras: 0,
    llegadaTardeMin: 0,
    salidaAnticipadaMin: 0,
    incompleta: true,
  },
  // Valeria Sosa — extras
  {
    empleadoId: 'ple-6',
    fecha: '2026-06-29',
    horasTrabajadas: 9,
    horasExtras: 1,
    llegadaTardeMin: 0,
    salidaAnticipadaMin: 0,
    incompleta: false,
  },
  {
    empleadoId: 'ple-6',
    fecha: '2026-06-30',
    horasTrabajadas: 9.5,
    horasExtras: 1.5,
    llegadaTardeMin: 8,
    salidaAnticipadaMin: 0,
    incompleta: false,
  },
  // Jorge Ríos — jefe, normal
  {
    empleadoId: 'ple-2',
    fecha: '2026-06-29',
    horasTrabajadas: 8.2,
    horasExtras: 0,
    llegadaTardeMin: 0,
    salidaAnticipadaMin: 0,
    incompleta: false,
  },
  {
    empleadoId: 'ple-2',
    fecha: '2026-06-30',
    horasTrabajadas: 8.4,
    horasExtras: 0,
    llegadaTardeMin: 0,
    salidaAnticipadaMin: 0,
    incompleta: false,
  },
];
