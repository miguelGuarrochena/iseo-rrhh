import { abrirArchivo } from '@/lib/archivosUi';
import { avisoError } from '@/lib/avisos';

jest.mock('@/lib/avisos', () => ({
  avisoError: jest.fn(),
}));

describe('abrirArchivo', () => {
  const pestana = {
    opener: {} as Window | null,
    close: jest.fn(),
    location: { href: '' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    pestana.location.href = '';
    pestana.opener = {} as Window;
    jest.spyOn(window, 'open').mockReturnValue(pestana as unknown as Window);
  });

  afterEach(() => {
    (window.open as jest.Mock).mockRestore();
  });

  it('devuelve true si el PDF se abre', async () => {
    const ok = await abrirArchivo(async () => 'https://files/recibo.pdf');
    expect(ok).toBe(true);
    expect(pestana.location.href).toBe('https://files/recibo.pdf');
    expect(avisoError).not.toHaveBeenCalled();
  });

  it('devuelve false si el archivo no existe', async () => {
    const ok = await abrirArchivo(async () => null);
    expect(ok).toBe(false);
    expect(pestana.close).toHaveBeenCalled();
    expect(avisoError).toHaveBeenCalled();
  });

  it('devuelve false si Storage falla', async () => {
    const ok = await abrirArchivo(async () => {
      throw new Error('El bucket no respondió');
    });
    expect(ok).toBe(false);
    expect(pestana.close).toHaveBeenCalled();
    expect(avisoError).toHaveBeenCalled();
  });
});
