import {
  activarKiosco,
  desactivarKiosco,
  kioscoActivo,
  pinValido,
} from '@/lib/kiosco';

describe('modo kiosco', () => {
  beforeEach(() => window.localStorage.clear());

  it('valida el formato del PIN (4 a 6 números)', () => {
    expect(pinValido('1234')).toBe(true);
    expect(pinValido('123456')).toBe(true);
    expect(pinValido('123')).toBe(false);
    expect(pinValido('1234567')).toBe(false);
    expect(pinValido('12a4')).toBe(false);
  });

  it('se activa, bloquea y solo sale con el PIN correcto', async () => {
    expect(kioscoActivo()).toBe(false);
    await activarKiosco('4321');
    expect(kioscoActivo()).toBe(true);

    expect(await desactivarKiosco('0000')).toBe(false);
    expect(kioscoActivo()).toBe(true);

    expect(await desactivarKiosco('4321')).toBe(true);
    expect(kioscoActivo()).toBe(false);
  });

  it('no guarda el PIN en claro', async () => {
    await activarKiosco('9876');
    const guardado = window.localStorage.getItem('iseo_kiosco_pin');
    expect(guardado).toBeTruthy();
    expect(guardado).not.toContain('9876');
  });
});
