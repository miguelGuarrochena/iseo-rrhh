import { tieneRostroEnrolado } from '@/lib/facial/enrolado';

/**
 * La pregunta "¿está enrolada?" se contesta distinto según el backend, y
 * ninguna pantalla debería tener que saberlo.
 *
 * El backend real dejó de devolver `descriptorFacial` (FIC-011): es el
 * secreto con el que se autentica el fichaje facial, y con esos 128
 * números se ficha por REST sin cámara ni prueba de vida. Ahora manda
 * `tieneRostro`. El modo demo compara en memoria y sigue teniendo el
 * descriptor.
 *
 * El riesgo que cubren estos casos es silencioso: si una pantalla vuelve
 * a mirar `descriptorFacial?.length`, contra el backend real da siempre
 * falso y el botón "Fichar" desaparece para gente que sí está enrolada,
 * sin ningún error a la vista.
 */
describe('tieneRostroEnrolado', () => {
  it('backend real: se guía por tieneRostro', () => {
    expect(tieneRostroEnrolado({ tieneRostro: true })).toBe(true);
    expect(tieneRostroEnrolado({ tieneRostro: false })).toBe(false);
  });

  it('modo demo: se guía por el descriptor que tiene en memoria', () => {
    expect(tieneRostroEnrolado({ descriptorFacial: [0.1, 0.2] })).toBe(true);
    expect(tieneRostroEnrolado({ descriptorFacial: [] })).toBe(false);
  });

  it('tieneRostro manda sobre el descriptor cuando vienen los dos', () => {
    // El servidor es la autoridad: si dice que no hay rostro, no lo hay,
    // aunque haya quedado un descriptor viejo en memoria.
    expect(
      tieneRostroEnrolado({ tieneRostro: false, descriptorFacial: [0.1] })
    ).toBe(false);
  });

  it('sin ninguno de los dos campos, no está enrolada', () => {
    expect(tieneRostroEnrolado({})).toBe(false);
  });

  it('no rompe con la ficha todavía sin cargar', () => {
    expect(tieneRostroEnrolado(null)).toBe(false);
    expect(tieneRostroEnrolado(undefined)).toBe(false);
  });
});
