import { Empleado } from '@/types/rrhh';

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
