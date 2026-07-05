import { distanciaMetros } from '@/lib/facial/ubicacion';
import { demoHabilitado } from '@/lib/entorno';
import { ficharAhora, getFichajesDeEmpleadoHoy } from '@/lib/services/rrhh';

describe('distanciaMetros (Haversine)', () => {
  it('es 0 entre el mismo punto', () => {
    const p = { lat: -34.6037, lng: -58.3816 };
    expect(distanciaMetros(p, p)).toBe(0);
  });

  it('aproxima ~111 m por 0.001° de latitud', () => {
    const a = { lat: -34.6, lng: -58.38 };
    const b = { lat: -34.601, lng: -58.38 };
    const d = distanciaMetros(a, b);
    expect(d).toBeGreaterThan(105);
    expect(d).toBeLessThan(118);
  });

  it('detecta un punto lejano (fuera de una geocerca chica)', () => {
    const trabajo = { lat: -34.6037, lng: -58.3816 };
    const lejos = { lat: -34.62, lng: -58.4 };
    expect(distanciaMetros(trabajo, lejos)).toBeGreaterThan(2000);
  });
});

describe('regla de fuera de zona', () => {
  const geocerca = { lat: -34.6037, lng: -58.3816, radioM: 150 };
  const fueraDeZona = (p: { lat: number; lng: number }) =>
    distanciaMetros(p, geocerca) > geocerca.radioM;

  it('dentro del radio no está fuera de zona', () => {
    expect(fueraDeZona({ lat: -34.6038, lng: -58.3817 })).toBe(false);
  });

  it('lejos del radio sí está fuera de zona', () => {
    expect(fueraDeZona({ lat: -34.61, lng: -58.39 })).toBe(true);
  });
});

describe('fichaje manual', () => {
  it('respeta el tipo, el horario y quién lo cargó', async () => {
    const cuando = new Date();
    cuando.setHours(9, 30, 0, 0);
    const marca = await ficharAhora('ple-5', {
      metodo: 'manual',
      tipo: 'ingreso',
      timestamp: cuando.toISOString(),
      registradoPor: 'RRHH Test',
    });
    expect(marca.tipo).toBe('ingreso');
    expect(marca.metodo).toBe('manual');
    expect(marca.registradoPor).toBe('RRHH Test');
    expect(marca.timestamp).toBe(cuando.toISOString());

    const deHoy = await getFichajesDeEmpleadoHoy('ple-5');
    expect(deHoy.some((f) => f.id === marca.id)).toBe(true);
  });

  it('permite forzar un egreso aunque no haya ingreso previo', async () => {
    const marca = await ficharAhora('ple-7', {
      metodo: 'manual',
      tipo: 'egreso',
      registradoPor: 'RRHH Test',
    });
    expect(marca.tipo).toBe('egreso');
  });
});

describe('demoHabilitado', () => {
  const original = process.env.NEXT_PUBLIC_DEMO;
  afterEach(() => {
    process.env.NEXT_PUBLIC_DEMO = original;
  });

  it('on lo fuerza habilitado', () => {
    process.env.NEXT_PUBLIC_DEMO = 'on';
    expect(demoHabilitado()).toBe(true);
  });

  it('off lo fuerza deshabilitado', () => {
    process.env.NEXT_PUBLIC_DEMO = 'off';
    expect(demoHabilitado()).toBe(false);
  });
});
