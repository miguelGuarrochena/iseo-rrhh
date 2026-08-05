import {
  PAGINA,
  TOPE_FILAS,
  traerTodo,
} from '@/lib/services/supabase/paginado';

/** El `fallar` de real.ts nunca vuelve: acá se simula con un throw. */
const alFallar = (mensaje: string): never => {
  throw new Error(mensaje);
};

/**
 * Tabla falsa de `n` filas que respeta `range(desde, hasta)`, igual que
 * PostgREST. Registra los rangos pedidos para poder verificar que no se
 * pidan páginas de más.
 */
const tablaDe = (n: number) => {
  const filas = Array.from({ length: n }, (_, i) => ({ id: i }));
  const rangos: [number, number][] = [];
  const consulta = async (desde: number, hasta: number) => {
    rangos.push([desde, hasta]);
    return { data: filas.slice(desde, hasta + 1), error: null };
  };
  return { consulta, rangos };
};

describe('traerTodo', () => {
  it('una tabla vacía devuelve vacío y pide una sola página', async () => {
    const { consulta, rangos } = tablaDe(0);
    expect(await traerTodo(consulta, 'test', alFallar)).toEqual([]);
    expect(rangos).toHaveLength(1);
  });

  it('con menos de una página no vuelve a pedir', async () => {
    const { consulta, rangos } = tablaDe(10);
    const filas = await traerTodo(consulta, 'test', alFallar);
    expect(filas).toHaveLength(10);
    expect(rangos).toEqual([[0, PAGINA - 1]]);
  });

  it('trae TODO cuando hay más del tope de PostgREST', async () => {
    // Es el bug que motivó todo esto: sin paginar, esto devolvía 1000
    // filas sin error y el Excel salía incompleto en silencio.
    const { consulta } = tablaDe(3000);
    const filas = await traerTodo(consulta, 'test', alFallar);
    expect(filas).toHaveLength(3000);
    expect(filas[2999]).toEqual({ id: 2999 });
  });

  it('no repite ni saltea filas entre páginas', async () => {
    const { consulta } = tablaDe(2500);
    const filas = await traerTodo(consulta, 'test', alFallar);
    const ids = filas.map((f) => f.id);
    expect(new Set(ids).size).toBe(2500);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
  });

  it('en el múltiplo exacto pide una página más para saber que terminó', async () => {
    // Con exactamente PAGINA filas no se puede distinguir "esto es todo"
    // de "hay más": hay que preguntar una vez más.
    const { consulta, rangos } = tablaDe(PAGINA);
    const filas = await traerTodo(consulta, 'test', alFallar);
    expect(filas).toHaveLength(PAGINA);
    expect(rangos).toHaveLength(2);
  });

  it('propaga el error de la primera página', async () => {
    const consulta = async () => ({
      data: null,
      error: { message: 'permission denied for table fichajes' },
    });
    await expect(traerTodo(consulta, 'test', alFallar)).rejects.toThrow(
      'permission denied'
    );
  });

  it('corta con un error claro si se pasa del tope duro', async () => {
    const { consulta } = tablaDe(TOPE_FILAS + PAGINA);
    await expect(traerTodo(consulta, 'fichajes', alFallar)).rejects.toThrow(
      /superó las .* filas/
    );
  });
});
