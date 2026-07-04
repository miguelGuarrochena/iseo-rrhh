import { buscarParrafos, partirEnParrafos } from '@/lib/convenio';

const convenio = `Artículo 10 - Vacaciones.
El trabajador gozará de un período de vacaciones anuales según su antigüedad.

Artículo 12 - Licencia por fallecimiento.
Por fallecimiento de familiar directo corresponden tres días corridos.

Artículo 20 - Horas extras.
Las horas extras se abonan con un recargo del cincuenta por ciento.`;

describe('partirEnParrafos', () => {
  it('separa por líneas en blanco', () => {
    expect(partirEnParrafos(convenio)).toHaveLength(3);
  });
});

describe('buscarParrafos', () => {
  it('encuentra el párrafo relevante por palabra clave', () => {
    const r = buscarParrafos(convenio, '¿Cuántos días por fallecimiento?');
    expect(r[0]).toContain('fallecimiento');
  });

  it('ignora acentos y mayúsculas', () => {
    const r = buscarParrafos(convenio, 'VACACIONES');
    expect(r[0]).toContain('Vacaciones');
  });

  it('devuelve vacío si no hay coincidencias', () => {
    expect(buscarParrafos(convenio, 'teletrabajo remoto')).toHaveLength(0);
  });
});
