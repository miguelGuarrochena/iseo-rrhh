/**
 * Estado de lanzamiento de la plataforma.
 * Con NEXT_PUBLIC_MOSTRAR_INGRESO=0 (ej. en Vercel), la landing oculta
 * el botón "Ingresar" y la sección de la plataforma dice "Próximamente".
 * El login sigue accesible escribiendo /login en la URL.
 */
export const plataformaLanzada =
  process.env.NEXT_PUBLIC_MOSTRAR_INGRESO !== '0';
