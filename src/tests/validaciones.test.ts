import {
  validarCbu,
  validarCuit,
  validarDni,
  validarEmail,
  validarRequerido,
} from '@/lib/validaciones';

describe('validaciones', () => {
  it('requerido', () => {
    expect(validarRequerido('', 'El nombre')).toContain('obligatorio');
    expect(validarRequerido('Ana', 'El nombre')).toBeNull();
  });

  it('email', () => {
    expect(validarEmail('no-es-email')).not.toBeNull();
    expect(validarEmail('ana@empresa.com')).toBeNull();
    expect(validarEmail('')).toBeNull(); // opcional
  });

  it('dni', () => {
    expect(validarDni('123')).not.toBeNull();
    expect(validarDni('30123456')).toBeNull();
    expect(validarDni('3012345')).toBeNull();
  });

  it('cuit válido con dígito verificador', () => {
    expect(validarCuit('30-71234567-1')).toBeNull();
    expect(validarCuit('30712345671')).toBeNull(); // sin guiones
    expect(validarCuit('30-71234567-9')).not.toBeNull(); // verificador mal
    expect(validarCuit('123')).not.toBeNull();
  });

  /**
   * Un CUIT real de AFIP, como control de que el algoritmo es el correcto
   * y no una implementación que "da bien" sólo con los casos de arriba.
   */
  it('acepta un CUIT real conocido', () => {
    expect(validarCuit('33-69345023-9')).toBeNull();
  });

  it('sugiere el dígito correcto en vez de sólo decir que está mal', () => {
    // Caso reportado por el cliente: tipearon 2 donde iba 0.
    const error = validarCuit('20-31525471-2');
    expect(error).not.toBeNull();
    expect(error).toContain('20-31525471-0');
  });

  it('el CUIT sugerido es válido', () => {
    expect(validarCuit('20-31525471-0')).toBeNull();
  });

  it('cbu', () => {
    expect(validarCbu('0110599520000001234501')).toBeNull();
    expect(validarCbu('123')).not.toBeNull();
  });
});
