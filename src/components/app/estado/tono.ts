import { AreaEstado } from '@/lib/estadoRrhh';

/**
 * El color de un área: rojo es "alguien no puede trabajar", ámbar es
 * "hay algo pendiente", verde es "no falta nada".
 *
 * Vive acá y no adentro de la tarjeta porque el panel de detalle usa el
 * mismo punto y el mismo color de texto que la tarjeta desde la que se
 * abrió. Es lo que hace que se lea como el detalle de *esa* tarjeta y
 * no como una pantalla suelta; con dos copias de la paleta, la primera
 * vez que se toque una queda desalineado.
 */
export const tono = (area: AreaEstado) => {
  if (area.bloquea) {
    return {
      barra: 'bg-red-500',
      pista: 'bg-red-100',
      texto: 'text-red-700',
      punto: 'bg-red-500',
    };
  }
  if (area.pendientes > 0) {
    return {
      barra: 'bg-amber-500',
      pista: 'bg-amber-100',
      texto: 'text-amber-700',
      punto: 'bg-amber-500',
    };
  }
  return {
    barra: 'bg-emerald-500',
    pista: 'bg-emerald-100',
    texto: 'text-emerald-700',
    punto: 'bg-emerald-500',
  };
};
