import {
  dependenDe,
  moduloActivo,
  MODULOS_OPCIONALES,
  navItems,
  navItemsPorRol,
  tabsDeBarra,
} from '@/components/app/navItems';

describe('moduloActivo', () => {
  it('una sección sin módulo siempre se muestra', () => {
    expect(moduloActivo(undefined, { organigrama: false })).toBe(true);
  });

  it('sin configuración guardada, encendido', () => {
    // Las empresas que ya existen no tienen la clave: apagar es una
    // decisión explícita, no el estado por defecto.
    expect(moduloActivo('organigrama', undefined)).toBe(true);
    expect(moduloActivo('organigrama', {})).toBe(true);
  });

  it('solo se apaga con false explícito', () => {
    expect(moduloActivo('organigrama', { organigrama: false })).toBe(false);
    expect(moduloActivo('organigrama', { organigrama: true })).toBe(true);
  });
});

describe('navItemsPorRol', () => {
  const tiene = (rol: 'admin_rrhh', modulos?: Record<string, boolean>) =>
    navItemsPorRol(rol, modulos).some((i) => i.href === '/organigrama');

  it('el admin ve el organigrama por defecto', () => {
    expect(tiene('admin_rrhh')).toBe(true);
  });

  it('deja de verlo si la empresa lo apagó', () => {
    expect(tiene('admin_rrhh', { organigrama: false })).toBe(false);
  });

  it('apagar un módulo no toca el resto del menú', () => {
    const con = navItemsPorRol('admin_rrhh');
    const sin = navItemsPorRol('admin_rrhh', { organigrama: false });
    expect(sin.length).toBe(con.length - 1);
    expect(sin.some((i) => i.href === '/recibos')).toBe(true);
  });

  it('el empleado nunca tuvo organigrama y sigue igual', () => {
    expect(
      navItemsPorRol('empleado').some((i) => i.href === '/organigrama')
    ).toBe(false);
  });
});

describe('catálogo de módulos', () => {
  it('cada módulo del catálogo tiene su sección en el menú', () => {
    // Si alguien suma una clave al catálogo pero no la engancha a un
    // NavItem, el interruptor queda en la pantalla sin apagar nada.
    const enElMenu = new Set(
      navItems.flatMap((i) => (i.modulo ? [i.modulo] : []))
    );
    MODULOS_OPCIONALES.forEach((m) => {
      expect(enElMenu.has(m.clave)).toBe(true);
    });
  });

  it('no hay secciones del menú marcadas con un módulo fuera del catálogo', () => {
    const claves = new Set(MODULOS_OPCIONALES.map((m) => m.clave));
    navItems.forEach((i) => {
      if (i.modulo) expect(claves.has(i.modulo)).toBe(true);
    });
  });

  it('las secciones que no se negocian no son apagables', () => {
    const apagables = new Set(
      navItems.filter((i) => i.modulo).map((i) => i.href)
    );
    [
      '/',
      '/colaboradores',
      '/mi-legajo',
      '/permisos',
      '/configuracion',
    ].forEach((href) => expect(apagables.has(href)).toBe(false));
  });

  /**
   * El dueño de ISEO adentro de un cliente navega como admin de esa
   * empresa, así que "Empresas" desaparece del menú. Eso está bien —no
   * es una sección de la empresa— pero deja la salida fuera de la
   * navegación: tiene que existir en otro lado (el menú del avatar y el
   * panel "Más"), o en una tablet no hay forma de volver a la lista de
   * clientes. Este test fija el porqué.
   */
  it('adentro de una empresa el menú no lleva de vuelta a Empresas', () => {
    const hrefs = navItemsPorRol('admin_rrhh').map((i) => i.href);
    expect(hrefs).not.toContain('/empresas');
    expect(navItemsPorRol('superadmin').map((i) => i.href)).toContain(
      '/empresas'
    );
  });
});

describe('tabsDeBarra', () => {
  it('deja Fichaje a un toque para el admin, no escondido en Más', () => {
    const items = navItemsPorRol('admin_rrhh');
    const { tabs, resto, conMas } = tabsDeBarra(items, 5, true);
    expect(conMas).toBe(true);
    expect(tabs.map((t) => t.href)).toContain('/fichaje');
    expect(resto.map((t) => t.href)).not.toContain('/fichaje');
    expect(tabs[0].href).toBe('/');
  });

  it('el empleado también tiene Fichaje en la barra', () => {
    const items = navItemsPorRol('empleado');
    const { tabs } = tabsDeBarra(items, 5);
    expect(tabs.map((t) => t.href)).toContain('/fichaje');
  });
});

describe('dependenDe', () => {
  it('apagar Fichaje deja a Turnos y Remuneraciones a medias', () => {
    expect(dependenDe('fichaje').sort()).toEqual(['remuneraciones', 'turnos']);
  });

  it('apagar Remuneraciones deja a Recibos a medias', () => {
    expect(dependenDe('remuneraciones')).toEqual(['recibos']);
  });

  it('una sección de la que no cuelga nada no rompe nada', () => {
    expect(dependenDe('convenio')).toEqual([]);
    expect(dependenDe('agenda')).toEqual([]);
  });
});
