import { interpretarError, textoDeError } from '@/lib/errores';

describe('textoDeError', () => {
  it('saca el mensaje de un Error', () => {
    expect(textoDeError(new Error('Sin empresa activa.'))).toBe(
      'Sin empresa activa.'
    );
  });

  it('acepta un string pelado', () => {
    expect(textoDeError('algo')).toBe('algo');
  });

  it('acepta un objeto con message (los de Supabase vienen así)', () => {
    expect(textoDeError({ message: 'duplicate key value' })).toBe(
      'duplicate key value'
    );
  });

  it('no explota con null ni undefined', () => {
    expect(textoDeError(null)).toBe('Error desconocido');
    expect(textoDeError(undefined)).toBe('Error desconocido');
  });
});

describe('interpretarError — clasificación', () => {
  const tipoDe = (m: string) => interpretarError(new Error(m)).tipo;

  it('sesión', () => {
    expect(tipoDe('Sin sesión.')).toBe('sesion');
    expect(tipoDe('Sesión vencida: volvé a ingresar.')).toBe('sesion');
    expect(tipoDe('JWT expired')).toBe('sesion');
  });

  it('empresa', () => {
    expect(tipoDe('Sin empresa activa.')).toBe('empresa');
  });

  it('red', () => {
    expect(tipoDe('Failed to fetch')).toBe('red');
    expect(tipoDe('NetworkError when attempting to fetch resource.')).toBe(
      'red'
    );
    expect(tipoDe('La aplicación no está conectada al servidor.')).toBe('red');
  });

  it('permisos', () => {
    expect(
      tipoDe('infinite recursion detected in policy for relation "x"')
    ).toBe('permisos');
    expect(tipoDe('new row violates row-level security policy')).toBe(
      'permisos'
    );
  });

  it('datos: delega en la traducción de Postgres', () => {
    const r = interpretarError(
      new Error(
        'duplicate key value violates unique constraint "empleados_empresa_id_dni_key"'
      )
    );
    expect(r.tipo).toBe('datos');
    expect(r.detalle).toContain('DNI');
  });

  it('lo que no reconoce queda como desconocido', () => {
    expect(tipoDe('vaya uno a saber')).toBe('desconocido');
  });
});

describe('interpretarError — reintentable', () => {
  const reintentable = (m: string) =>
    interpretarError(new Error(m)).reintentable;

  it('un problema de red sí se reintenta', () => {
    expect(reintentable('Failed to fetch')).toBe(true);
  });

  it('lo desconocido se reintenta: puede haber sido puntual', () => {
    expect(reintentable('vaya uno a saber')).toBe(true);
  });

  it('sin empresa activa NO se reintenta', () => {
    // Ofrecer "reintentar" acá hace que la persona lo apriete tres veces
    // y concluya que la app está rota.
    expect(reintentable('Sin empresa activa.')).toBe(false);
  });

  it('sesión vencida NO se reintenta', () => {
    expect(reintentable('Sin sesión.')).toBe(false);
  });

  it('un error de permisos del servidor NO se reintenta', () => {
    expect(reintentable('infinite recursion detected in policy')).toBe(false);
  });
});

describe('interpretarError — el mensaje crudo se conserva', () => {
  it('para poder registrarlo aunque se muestre otro texto', () => {
    const crudo = 'infinite recursion detected in policy for relation "x"';
    const r = interpretarError(new Error(crudo));
    expect(r.crudo).toBe(crudo);
    expect(r.titulo).not.toBe(crudo);
  });
});
