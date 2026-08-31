import { readFileSync } from 'fs';
import { join } from 'path';
import {
  CAMPOS,
  CAMPOS_DEL_FORMULARIO,
  CampoAutogestionable,
  errorDePropuesta,
  esCampoAutogestionable,
  etiquetaDeCampo,
  mostrarValor,
  pendientes,
  valorActualDe,
} from '@/lib/autoservicioLegajo';
import { Empleado } from '@/types/rrhh';

/**
 * El autoservicio tiene una sola regla que importa: **el empleado
 * propone, RRHH decide**. La parte que lo hace cumplir está en la
 * migración 106 y se prueba en `supabase/tests/autoservicio_legajo.test.sql`.
 *
 * Lo que se fija acá es lo que pasa antes de llegar al servidor: qué
 * campos ofrece el formulario, y que esa lista no se separe de la que la
 * base acepta.
 */

const empleado = {
  id: 'e1',
  nombre: 'Ana',
  apellido: 'Ruiz',
  domicilio: 'Calle Vieja 100',
  telefono: '11-1111',
  email: 'ana@empresa.com',
  estadoCivil: 'soltero',
  nivelEstudios: 'secundario',
  banco: 'Nación',
  cbu: '0000000000000000000001',
} as unknown as Empleado;

describe('la lista blanca del cliente no se separa de la de la base', () => {
  /**
   * Si alguien suma un campo al formulario y se olvida de la migración,
   * la pantalla ofrece algo que el servidor va a rechazar. Y al revés:
   * un campo habilitado en la base que nadie puso acá pasa desapercibido.
   *
   * Por eso el test lee el SQL en vez de repetir la lista.
   */
  const sql = readFileSync(
    join(
      process.cwd(),
      'supabase/migrations/20260907000106_autoservicio_de_legajo.sql'
    ),
    'utf8'
  );

  const camposDeLaBase = (): string[] => {
    const cuerpo = sql.slice(
      sql.indexOf('function public.campo_de_legajo_autogestionable'),
      sql.indexOf('comment on function public.campo_de_legajo_autogestionable')
    );
    return [...cuerpo.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  };

  it('los mismos campos de los dos lados', () => {
    expect([...camposDeLaBase()].sort()).toEqual(Object.keys(CAMPOS).sort());
  });

  it('el formulario no ofrece nada que la base no acepte', () => {
    const base = new Set(camposDeLaBase());
    CAMPOS_DEL_FORMULARIO.forEach((c) => expect(base.has(c)).toBe(true));
  });

  /**
   * Estos cuatro son el motivo de que exista una lista blanca. Si un día
   * alguno entra, que sea una decisión y no un descuido.
   */
  it.each(['dni', 'cuil', 'puesto', 'fecha_ingreso', 'activo', 'modo_fichaje'])(
    '%s no es autogestionable',
    (campo) => {
      expect(esCampoAutogestionable(campo)).toBe(false);
      expect(camposDeLaBase()).not.toContain(campo);
    }
  );
});

describe('errorDePropuesta', () => {
  it('un campo que no está en la lista no pasa', () => {
    expect(errorDePropuesta({ campo: 'puesto', valor: 'Gerente' })).toMatch(
      /RRHH/
    );
  });

  it('no se puede vaciar un dato', () => {
    expect(errorDePropuesta({ campo: 'telefono', valor: '   ' })).toMatch(
      /Escribí/
    );
  });

  it('proponer lo que ya figura no tiene sentido', () => {
    expect(
      errorDePropuesta({
        campo: 'domicilio',
        valor: 'Calle Vieja 100',
        valorActual: 'Calle Vieja 100',
      })
    ).toMatch(/ya figura/);
  });

  it('los espacios de más no cuentan como cambio', () => {
    expect(
      errorDePropuesta({
        campo: 'domicilio',
        valor: '  Calle Vieja 100 ',
        valorActual: 'Calle Vieja 100',
      })
    ).toMatch(/ya figura/);
  });

  it('un email sin arroba no sale', () => {
    expect(errorDePropuesta({ campo: 'email', valor: 'ana.empresa' })).toMatch(
      /email/i
    );
    expect(
      errorDePropuesta({ campo: 'email', valor: 'ana@empresa.com' })
    ).toBeNull();
  });

  it('una opción inventada no sale', () => {
    expect(
      errorDePropuesta({ campo: 'estado_civil', valor: 'marciano' })
    ).toMatch(/opciones/);
    expect(
      errorDePropuesta({ campo: 'estado_civil', valor: 'casado' })
    ).toBeNull();
  });

  describe('CBU', () => {
    // Un CBU mal tipeado manda el sueldo a otro lado o lo rebota; que
    // llegue así a RRHH sólo traslada el problema.
    it('22 dígitos exactos', () => {
      expect(
        errorDePropuesta({ campo: 'cbu', valor: '0'.repeat(22) })
      ).toBeNull();
      expect(errorDePropuesta({ campo: 'cbu', valor: '0'.repeat(21) })).toMatch(
        /22/
      );
      expect(errorDePropuesta({ campo: 'cbu', valor: '0'.repeat(23) })).toMatch(
        /22/
      );
    });

    it('sin espacios ni guiones', () => {
      expect(
        errorDePropuesta({ campo: 'cbu', valor: '0000-0000-0000-0000-0000-00' })
      ).toMatch(/22/);
    });

    it('no valida el dígito verificador', () => {
      // A propósito: si el banco cambia el esquema, un legajo correcto
      // no puede quedar trabado por una regla nuestra.
      expect(
        errorDePropuesta({ campo: 'cbu', valor: '1234567890123456789012' })
      ).toBeNull();
    });
  });
});

describe('mostrarValor', () => {
  it('los enums se muestran en castellano', () => {
    expect(mostrarValor('estado_civil', 'union_convivencial')).toBe(
      'Unión convivencial'
    );
    expect(mostrarValor('nivel_estudios', 'posgrado')).toBe('Posgrado');
  });

  it('un dato vacío es un guion, no "undefined"', () => {
    expect(mostrarValor('domicilio', undefined)).toBe('—');
    expect(mostrarValor('domicilio', null)).toBe('—');
    expect(mostrarValor('domicilio', '')).toBe('—');
  });

  it('un objeto se muestra entero, sin resumir', () => {
    // Quien aprueba tiene que ver todo lo que está por aplicar.
    const contacto = { nombreCompleto: 'Luis', telefono: '11-9999' };
    const texto = mostrarValor('contacto_emergencia', contacto);
    expect(texto).toContain('Luis');
    expect(texto).toContain('11-9999');
  });

  it('un campo desconocido no rompe la pantalla', () => {
    expect(mostrarValor('inventado', 'x')).toBe('x');
    expect(etiquetaDeCampo('inventado')).toBe('inventado');
  });
});

describe('valorActualDe', () => {
  it.each([
    ['domicilio', 'Calle Vieja 100'],
    ['telefono', '11-1111'],
    ['email', 'ana@empresa.com'],
    ['estado_civil', 'soltero'],
    ['nivel_estudios', 'secundario'],
    ['banco', 'Nación'],
    ['cbu', '0000000000000000000001'],
  ] as [CampoAutogestionable, string][])('lee %s', (campo, esperado) => {
    expect(valorActualDe(empleado, campo)).toBe(esperado);
  });

  it('los campos de objeto no se leen como texto', () => {
    expect(valorActualDe(empleado, 'contacto_emergencia')).toBeUndefined();
    expect(valorActualDe(empleado, 'grupo_familiar')).toBeUndefined();
  });
});

describe('el aviso del revisor', () => {
  it('el CBU avisa, porque aprobarlo mal cambia dónde cobra la persona', () => {
    expect(CAMPOS.cbu.advertencia).toBeTruthy();
  });

  it('los demás no avisan de nada: un cartel en todos no avisa en ninguno', () => {
    const conAviso = Object.values(CAMPOS).filter((c) => c.advertencia);
    expect(conAviso.map((c) => c.campo)).toEqual(['cbu']);
  });
});

describe('pendientes', () => {
  it('deja sólo lo que espera respuesta', () => {
    const lista = [
      { estado: 'pendiente', campo: 'cbu' },
      { estado: 'aprobada', campo: 'domicilio' },
      { estado: 'rechazada', campo: 'email' },
      { estado: 'anulada', campo: 'telefono' },
    ];
    expect(pendientes(lista).map((s) => s.campo)).toEqual(['cbu']);
  });

  it('sin nada pendiente, la lista es vacía', () => {
    expect(pendientes([{ estado: 'aprobada' }])).toEqual([]);
  });
});
