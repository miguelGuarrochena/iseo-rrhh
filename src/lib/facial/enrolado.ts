import { Empleado } from '@/types/rrhh';
import { VERSION_PLANTILLA } from './plantilla';

/**
 * ¿Esta persona ya tiene el rostro registrado?
 *
 * Existe porque los dos backends contestan la pregunta distinto, y
 * ninguna pantalla debería tener que saberlo:
 *
 * - **Real**: el servidor devuelve `tieneRostro`, un booleano. El
 *   descriptor no sale de la base (FIC-011): es el secreto con el que se
 *   autentica el fichaje facial, y entregárselo al titular equivale a
 *   devolverle su contraseña en texto plano — con esos 128 números se
 *   ficha por REST desde cualquier lado, sin cámara y sin prueba de
 *   vida.
 * - **Demo**: trabaja en memoria y sí tiene el descriptor, porque ahí
 *   mismo hace la comparación. No hay nada que proteger.
 *
 * Antes cada pantalla preguntaba `descriptorFacial?.length`, que con el
 * backend real pasó a ser siempre falso.
 */
export const tieneRostroEnrolado = (
  empleado:
    | Pick<Empleado, 'tieneRostro' | 'descriptorFacial'>
    | null
    | undefined
): boolean =>
  Boolean(empleado?.tieneRostro ?? empleado?.descriptorFacial?.length);

type ConVersion = Pick<
  Empleado,
  'tieneRostro' | 'descriptorFacial' | 'descriptorVersion'
>;

/**
 * ¿La plantilla de esta persona sirve para fichar hoy?
 *
 * El servidor compara sólo contra plantillas de la misma
 * `descriptor_version`. Alguien enrolado con el pipeline viejo **está
 * enrolado y aun así no puede fichar**: para el RPC, su plantilla no
 * existe. Esas dos preguntas dejaron de ser la misma y por eso hay dos
 * funciones.
 *
 * Sin esto la pantalla mostraría "Rostro registrado ✓" a alguien que va
 * a rebotar en la terminal, y el problema aparecería recién con la fila
 * formada adelante.
 */
export const plantillaVigente = (
  empleado: ConVersion | null | undefined
): boolean =>
  tieneRostroEnrolado(empleado) &&
  // Sin versión se asume 1: es lo que hay en las filas anteriores a la
  // migración, y coincide con cómo lo lee el servidor (`coalesce(...,1)`).
  (empleado?.descriptorVersion ?? 1) === VERSION_PLANTILLA;

/**
 * ¿Hay que volver a tomarle el rostro?
 *
 * Distinto de "no está enrolado": acá la persona **sí** tiene plantilla,
 * pero de una versión que ya no se compara. Es el listado que RRHH
 * necesita para saber a quién le falta durante el despliegue.
 */
export const necesitaReenrolar = (
  empleado: ConVersion | null | undefined
): boolean => tieneRostroEnrolado(empleado) && !plantillaVigente(empleado);
