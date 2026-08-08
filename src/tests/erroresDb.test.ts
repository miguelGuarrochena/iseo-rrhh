import { campoDeErrorDb, mensajeDeErrorDb } from '@/lib/erroresDb';
import { normalizarCuit, validarCuit, validarDni } from '@/lib/validaciones';

describe('mensajeDeErrorDb', () => {
  it('traduce el DNI duplicado que veía el cliente', () => {
    const crudo =
      'duplicate key value violates unique constraint "empleados_empresa_id_dni_key"';
    expect(mensajeDeErrorDb(crudo)).toContain('Ya hay un colaborador');
    expect(mensajeDeErrorDb(crudo)).not.toContain('duplicate key');
  });

  it('traduce la violación de RLS de ausencias', () => {
    const crudo =
      'new row violates row-level security policy for table "ausencias"';
    expect(mensajeDeErrorDb(crudo)).toContain('No tenés permiso');
  });

  it('traduce la columna faltante del fichaje manual', () => {
    const crudo =
      "Could not find the 'registrado_por' column of 'fichajes' in the schema cache";
    const msg = mensajeDeErrorDb(crudo);
    expect(msg).toContain('registrado_por');
    expect(msg).toContain('migración');
  });

  it('devuelve el original si no lo reconoce', () => {
    expect(mensajeDeErrorDb('algo raro pasó')).toBe('algo raro pasó');
  });

  it('cae en un mensaje genérico para constraints desconocidas', () => {
    const crudo =
      'duplicate key value violates unique constraint "tabla_nueva_key"';
    expect(mensajeDeErrorDb(crudo)).toContain('ya está cargado');
  });
});

describe('normalización de documentos', () => {
  // 20-25123456-7 es un CUIL con dígito verificador correcto.
  it('acepta CUIL con cualquier separador', () => {
    expect(validarCuit('20-25123456-7')).toBeNull();
    expect(validarCuit('20.25123456.7')).toBeNull();
    expect(validarCuit('20 25123456 7')).toBeNull();
    expect(validarCuit('20251234567')).toBeNull();
  });

  it('sigue rechazando un dígito verificador incorrecto', () => {
    expect(validarCuit('20-25123456-9')).not.toBeNull();
  });

  it('normaliza a solo dígitos para poder comparar', () => {
    expect(normalizarCuit('20.25123456.7')).toBe('20251234567');
    expect(normalizarCuit('20-25123456-7')).toBe('20251234567');
  });

  it('acepta DNI con puntos', () => {
    expect(validarDni('25.123.456')).toBeNull();
    expect(validarDni('25123456')).toBeNull();
    expect(validarDni('123')).not.toBeNull();
  });
});

describe('empresas_cuit_key (caso reportado en producción)', () => {
  const crudo =
    'duplicate key value violates unique constraint "empresas_cuit_key"';

  it('explica que la empresa ya existe en vez del mensaje genérico', () => {
    const m = mensajeDeErrorDb(crudo);
    expect(m).toContain('CUIT');
    expect(m).not.toContain('duplicate key');
    expect(m).not.toContain('Ese dato ya está cargado');
  });

  it('lo atribuye al campo cuit para poder marcarlo en el formulario', () => {
    expect(campoDeErrorDb(crudo)).toBe('cuit');
  });

  it('una constraint que no se puede atribuir a un campo devuelve null', () => {
    expect(
      campoDeErrorDb(
        'duplicate key value violates unique constraint "cupos_licencia_empresa_id_tipo_key"'
      )
    ).toBeNull();
  });

  it('un error que no es de unicidad no marca ningún campo', () => {
    expect(campoDeErrorDb('violates row-level security policy')).toBeNull();
  });
});
