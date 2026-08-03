import { act, renderHook, waitFor } from '@testing-library/react';
import { useCarga } from '@/lib/useCarga';

/** Promesa que se resuelve/rechaza cuando nosotros queramos. */
const diferida = <T,>() => {
  let resolver!: (v: T) => void;
  let rechazar!: (e: unknown) => void;
  const promesa = new Promise<T>((res, rej) => {
    resolver = res;
    rechazar = rej;
  });
  return { promesa, resolver, rechazar };
};

describe('useCarga — camino feliz', () => {
  it('arranca cargando y termina con los datos', async () => {
    const { result } = renderHook(() =>
      useCarga(() => Promise.resolve([1, 2]), [])
    );

    expect(result.current.fase).toBe('cargando');
    await waitFor(() => expect(result.current.fase).toBe('ok'));
    expect(result.current.datos).toEqual([1, 2]);
    expect(result.current.error).toBeNull();
  });
});

describe('useCarga — errores', () => {
  it('atrapa el fallo y lo interpreta', async () => {
    const { result } = renderHook(() =>
      useCarga(() => Promise.reject(new Error('Sin empresa activa.')), [])
    );

    await waitFor(() => expect(result.current.fase).toBe('error'));
    expect(result.current.error?.tipo).toBe('empresa');
    // No tiene sentido ofrecer reintentar si falta elegir empresa.
    expect(result.current.error?.reintentable).toBe(false);
  });

  it('recargar vuelve a pedir y puede salir bien', async () => {
    let intentos = 0;
    const { result } = renderHook(() =>
      useCarga(() => {
        intentos += 1;
        return intentos === 1
          ? Promise.reject(new Error('Failed to fetch'))
          : Promise.resolve(['ok']);
      }, [])
    );

    await waitFor(() => expect(result.current.fase).toBe('error'));
    expect(result.current.error?.reintentable).toBe(true);

    act(() => result.current.recargar());
    await waitFor(() => expect(result.current.fase).toBe('ok'));
    expect(result.current.datos).toEqual(['ok']);
    expect(result.current.error).toBeNull();
  });
});

describe('useCarga — carreras', () => {
  it('una respuesta vieja no pisa a una nueva', async () => {
    // El caso real: se tipea en un filtro, salen dos consultas, y la
    // primera (más lenta) contesta última. Sin protección, la pantalla
    // termina mostrando el resultado del filtro anterior.
    const primera = diferida<string[]>();
    const segunda = diferida<string[]>();

    const { result, rerender } = renderHook(
      ({ q }: { q: string }) =>
        useCarga(() => (q === 'a' ? primera.promesa : segunda.promesa), [q]),
      { initialProps: { q: 'a' } }
    );

    rerender({ q: 'b' });

    // La segunda (la vigente) responde primero.
    await act(async () => {
      segunda.resolver(['resultado de b']);
      await segunda.promesa;
    });
    await waitFor(() =>
      expect(result.current.datos).toEqual(['resultado de b'])
    );

    // Ahora contesta la vieja: debe ser ignorada.
    await act(async () => {
      primera.resolver(['resultado de a']);
      await primera.promesa;
    });

    expect(result.current.datos).toEqual(['resultado de b']);
  });

  it('el error de una consulta vieja tampoco pisa el estado', async () => {
    const primera = diferida<string[]>();
    const segunda = diferida<string[]>();

    const { result, rerender } = renderHook(
      ({ q }: { q: string }) =>
        useCarga(() => (q === 'a' ? primera.promesa : segunda.promesa), [q]),
      { initialProps: { q: 'a' } }
    );

    rerender({ q: 'b' });

    await act(async () => {
      segunda.resolver(['vigente']);
      await segunda.promesa;
    });
    await waitFor(() => expect(result.current.fase).toBe('ok'));

    await act(async () => {
      primera.rechazar(new Error('Failed to fetch'));
      await primera.promesa.catch(() => undefined);
    });

    // Sigue en ok: el fallo era de una consulta que ya no importa.
    expect(result.current.fase).toBe('ok');
    expect(result.current.datos).toEqual(['vigente']);
  });
});

describe('useCarga — activo', () => {
  it('no pide nada mientras activo es false', async () => {
    const pedir = jest.fn(() => Promise.resolve(['x']));
    const { result, rerender } = renderHook(
      ({ listo }: { listo: boolean }) =>
        useCarga(pedir, [listo], { activo: listo }),
      { initialProps: { listo: false } }
    );

    expect(pedir).not.toHaveBeenCalled();
    expect(result.current.fase).toBe('ok');

    rerender({ listo: true });
    await waitFor(() => expect(result.current.fase).toBe('ok'));
    expect(pedir).toHaveBeenCalledTimes(1);
    expect(result.current.datos).toEqual(['x']);
  });
});
