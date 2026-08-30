import {
  moduloActivo,
  navItems,
  navItemsPorRol,
  servicioActivo,
  SERVICIOS_OPCIONALES,
} from '@/components/app/navItems';

/**
 * Los servicios contratados se leen AL REVÉS que los módulos, y eso es
 * lo que más fácil se rompe sin que nadie lo note:
 *
 *   - módulo ausente   = ENCENDIDO (la empresa lo tiene y puede apagarlo)
 *   - servicio ausente = NO CONTRATADO (no lo tiene hasta que ISEO lo dé)
 *
 * Si alguna vez el default se invierte, todas las empresas de
 * autogestión empiezan a ver el reporte de la asesoría. Estos casos
 * fijan el porqué.
 */

describe('servicioActivo', () => {
  it('sin configuración, el servicio NO está contratado', () => {
    expect(servicioActivo('asesoria', undefined)).toBe(false);
    expect(servicioActivo('asesoria', {})).toBe(false);
  });

  it('sólo se habilita con true explícito', () => {
    expect(servicioActivo('asesoria', { asesoria: true })).toBe(true);
    expect(servicioActivo('asesoria', { asesoria: false })).toBe(false);
  });

  it('una sección sin servicio declarado se muestra siempre', () => {
    expect(servicioActivo(undefined, {})).toBe(true);
  });

  it('es el default opuesto al de los módulos', () => {
    // El mismo objeto vacío: el módulo está prendido, el servicio no.
    expect(moduloActivo('organigrama', {})).toBe(true);
    expect(servicioActivo('asesoria', {})).toBe(false);
  });
});

describe('el reporte mensual sólo existe con la asesoría contratada', () => {
  const ve = (servicios?: Record<string, boolean>) =>
    navItemsPorRol('admin_rrhh', undefined, servicios).some(
      (i) => i.href === '/reporte-mensual'
    );

  it('una empresa de autogestión no lo ve', () => {
    expect(ve()).toBe(false);
    expect(ve({})).toBe(false);
    expect(ve({ asesoria: false })).toBe(false);
  });

  it('una empresa con asesoría sí', () => {
    expect(ve({ asesoria: true })).toBe(true);
  });

  it('habilitar la asesoría no toca ninguna otra sección del menú', () => {
    const sin = navItemsPorRol('admin_rrhh', undefined, {});
    const con = navItemsPorRol('admin_rrhh', undefined, { asesoria: true });
    expect(con.length).toBe(sin.length + 1);
    expect(
      con.filter((i) => i.href !== '/reporte-mensual').map((i) => i.href)
    ).toEqual(sin.map((i) => i.href));
  });

  it('no se lo mostramos a supervisores ni empleados aunque esté contratado', () => {
    // Lleva masa salarial, y `remuneraciones_select` en la base sólo la
    // deja leer al admin_rrhh: mostrarle la sección a un supervisor sería
    // ofrecerle una pantalla que no puede llenar.
    const con = { asesoria: true };
    expect(
      navItemsPorRol('supervisor', undefined, con).some(
        (i) => i.href === '/reporte-mensual'
      )
    ).toBe(false);
    expect(
      navItemsPorRol('empleado', undefined, con).some(
        (i) => i.href === '/reporte-mensual'
      )
    ).toBe(false);
  });

  it('el superadmin fuera de una empresa tampoco: no hay empresa que reportar', () => {
    expect(
      navItemsPorRol('superadmin', undefined, { asesoria: true }).some(
        (i) => i.href === '/reporte-mensual'
      )
    ).toBe(false);
  });
});

describe('catálogo de servicios', () => {
  it('cada servicio del catálogo habilita al menos una sección', () => {
    // Un servicio que no habilita nada es un interruptor que no hace
    // nada: se puede prender y el cliente no ve ninguna diferencia.
    const enElMenu = new Set(
      navItems.flatMap((i) => (i.servicio ? [i.servicio] : []))
    );
    SERVICIOS_OPCIONALES.forEach((s) => {
      expect(enElMenu.has(s.clave)).toBe(true);
    });
  });

  it('no hay secciones marcadas con un servicio fuera del catálogo', () => {
    const claves = new Set(SERVICIOS_OPCIONALES.map((s) => s.clave));
    navItems.forEach((i) => {
      if (i.servicio) expect(claves.has(i.servicio)).toBe(true);
    });
  });

  it('ninguna sección depende de un servicio Y de un módulo a la vez', () => {
    // Serían dos interruptores para una misma puerta: quien la apaga
    // desde un lado no entiende por qué sigue sin verse desde el otro.
    navItems.forEach((i) => {
      expect(Boolean(i.servicio && i.modulo)).toBe(false);
    });
  });

  it('las secciones de autogestión no dependen de ningún servicio', () => {
    // ISEO RH es, ante todo, una herramienta que la empresa usa sola. La
    // asesoría suma; no puede ser condición de lo básico.
    const conServicio = new Set(
      navItems.filter((i) => i.servicio).map((i) => i.href)
    );
    [
      '/',
      '/colaboradores',
      '/estado-rrhh',
      '/cierre',
      '/mi-legajo',
      '/ausencias',
      '/recibos',
      '/reportes',
      '/configuracion',
    ].forEach((href) => expect(conServicio.has(href)).toBe(false));
  });
});
