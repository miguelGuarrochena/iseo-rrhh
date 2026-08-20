import {
  activarKiosco,
  desactivarKiosco,
  empresaDelKiosco,
  kioscoActivo,
  MAX_INTENTOS_PIN,
  pinBloqueado,
  pinLargoKiosco,
  pinValido,
  puedeAdministrarTerminal,
  salirKioscoForzado,
} from '@/lib/kiosco';
import { Empresa, Usuario } from '@/types/rrhh';

const usuario = (
  rol: Usuario['rol'],
  empresaId: string | null = 'e1'
): Usuario => ({
  id: 'u1',
  email: 'a@x.com',
  rol,
  empresaId,
  empleadoId: null,
  nombreCompleto: 'Ana',
});

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

  it('guarda el largo del PIN para mostrar esa cantidad de puntos', async () => {
    await activarKiosco('4321');
    expect(pinLargoKiosco()).toBe(4);
    await desactivarKiosco('4321');
    expect(pinLargoKiosco()).toBeNull();
  });

  it('no guarda el PIN en claro', async () => {
    await activarKiosco('9876');
    const guardado = window.localStorage.getItem('iseo_kiosco_pin');
    expect(guardado).toBeTruthy();
    expect(guardado).not.toContain('9876');
  });

  it('guarda la empresa junto al kiosco y la limpia al salir', async () => {
    const empresa = { id: 'e1', nombre: 'Acme' } as Empresa;
    await activarKiosco('4321', empresa);
    expect(empresaDelKiosco()?.id).toBe('e1');
    expect(empresaDelKiosco()?.nombre).toBe('Acme');

    await desactivarKiosco('4321');
    expect(empresaDelKiosco()).toBeNull();
  });

  it('sin kiosco activo no devuelve empresa aunque haya quedado basura', async () => {
    window.localStorage.setItem(
      'iseo_kiosco_empresa',
      JSON.stringify({ id: 'e1' })
    );
    expect(empresaDelKiosco()).toBeNull();
  });

  it('después de varios PIN mal hay que entrar con usuario, no adivinar', async () => {
    await activarKiosco('4321');
    for (let i = 0; i < MAX_INTENTOS_PIN; i += 1) {
      expect(await desactivarKiosco('0000')).toBe(false);
    }
    expect(pinBloqueado()).toBe(true);
    // Ni el PIN correcto: si no, se brute-forcea recargando.
    expect(await desactivarKiosco('4321')).toBe(false);
    expect(kioscoActivo()).toBe(true);

    salirKioscoForzado();
    expect(kioscoActivo()).toBe(false);
    expect(pinBloqueado()).toBe(false);
  });

  it('un colaborador no administra la tablet; RRHH de esa empresa sí', () => {
    const empresa = { id: 'e1', nombre: 'Acme' } as Empresa;
    expect(puedeAdministrarTerminal(usuario('empleado'), empresa)).toBe(false);
    expect(puedeAdministrarTerminal(usuario('admin_rrhh'), empresa)).toBe(true);
    expect(
      puedeAdministrarTerminal(usuario('admin_rrhh', 'otra'), empresa)
    ).toBe(false);
    expect(puedeAdministrarTerminal(usuario('superadmin', null), empresa)).toBe(
      true
    );
  });
});
