import { moduloActivo, navItemsPorRol } from '@/components/app/navItems';

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
