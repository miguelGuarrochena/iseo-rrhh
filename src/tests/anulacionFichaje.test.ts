import {
  anularFichaje,
  enrolarRostro,
  ficharAhora,
  ficharConRostro,
} from '@/lib/services/rrhh';

/**
 * Contrato de la anulación y del método derivado, del lado del cliente.
 *
 * La autoridad de las dos reglas está en PostgreSQL —los tests que
 * importan son `supabase/tests/metodo_y_anulacion.test.sql`— pero el
 * modo demo tiene que respetar el mismo contrato. Si divergen, la demo
 * enseña un comportamiento que producción no tiene, que es exactamente
 * cómo se colaron antes bugs del módulo.
 */
describe('método derivado del camino (F-07)', () => {
  it('sin empleadoId es la terminal de planta', async () => {
    await enrolarRostro('ple-4', [0.22, 0.22, 0.22], {
      aceptado: true,
      texto: 'Autoriza el uso de su rostro para registrar asistencia.',
    });

    const marca = await ficharConRostro([0.22, 0.22, 0.22]);

    expect(marca.metodo).toBe('facial_tablet');
  });

  it('con empleadoId es el dispositivo de la persona, no la terminal', async () => {
    await enrolarRostro('ple-5', [0.1, 0.2, 0.3], {
      aceptado: true,
      texto: 'Autoriza el uso de su rostro para registrar asistencia.',
    });

    const marca = await ficharConRostro([0.11, 0.2, 0.3], {
      empleadoId: 'ple-5',
    });

    // El caso que F-07 cierra: el cliente ya no tiene forma de pedir
    // 'facial_tablet' para una fichada hecha desde un celular.
    expect(marca.metodo).not.toBe('facial_tablet');
    expect(['celular', 'remoto']).toContain(marca.metodo);
  });
});

describe('anulación de fichajes (F-12)', () => {
  it('exige motivo', async () => {
    const marca = await ficharAhora('ple-6', { metodo: 'manual' });

    await expect(anularFichaje(marca.id, '')).rejects.toThrow(/por qué/i);
    await expect(anularFichaje(marca.id, '   ')).rejects.toThrow(/por qué/i);
  });

  it('un motivo en blanco no anula nada a medias', async () => {
    const marca = await ficharAhora('ple-6', { metodo: 'manual' });

    await expect(anularFichaje(marca.id, '  ')).rejects.toThrow();

    const anulada = await anularFichaje(marca.id, 'Duplicado');
    expect(anulada.anuladoEn).toBeTruthy();
  });

  it('deja constancia de cuándo y por qué, no borra la marca', async () => {
    const marca = await ficharAhora('ple-7', { metodo: 'manual' });

    const anulada = await anularFichaje(
      marca.id,
      'Cargado en el legajo errado'
    );

    // La misma fila, con la anulación encima: los datos originales
    // tienen que seguir ahí para poder auditar qué se sacó.
    expect(anulada.id).toBe(marca.id);
    expect(anulada.tipo).toBe(marca.tipo);
    expect(anulada.timestamp).toBe(marca.timestamp);
    expect(anulada.anuladoEn).toBeTruthy();
    expect(anulada.anuladoMotivo).toBe('Cargado en el legajo errado');
  });

  it('no se puede anular dos veces', async () => {
    const marca = await ficharAhora('ple-7', { metodo: 'manual' });
    await anularFichaje(marca.id, 'Duplicado');

    await expect(anularFichaje(marca.id, 'otra vez')).rejects.toThrow(
      /ya estaba anulado/i
    );
  });

  it('un fichaje inexistente no se puede anular', async () => {
    await expect(anularFichaje('no-existe', 'motivo')).rejects.toThrow(
      /no existe/i
    );
  });
});
