import { distanciaMetros } from '@/lib/facial/ubicacion';
import { demoHabilitado } from '@/lib/entorno';
import { tipoDeMarcaSiguiente } from '@/lib/fichadas';
import {
  enrolarRostro,
  ficharAhora,
  ficharConRostro,
  getFichajesDeEmpleadoHoy,
} from '@/lib/services/rrhh';

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
      motivo: 'Se cayó la tablet',
    });
    expect(marca.tipo).toBe('ingreso');
    expect(marca.metodo).toBe('manual');
    expect(marca.registradoPor).toBe('RRHH Test');
    expect(marca.motivo).toBe('Se cayó la tablet');
    expect(marca.timestamp).toBe(cuando.toISOString());

    const deHoy = await getFichajesDeEmpleadoHoy('ple-5');
    expect(deHoy.some((f) => f.id === marca.id)).toBe(true);
  });

  it('permite forzar un egreso aunque no haya ingreso previo', async () => {
    const marca = await ficharAhora('ple-7', {
      metodo: 'manual',
      tipo: 'egreso',
      registradoPor: 'RRHH Test',
      motivo: 'Se olvidó de fichar la salida',
    });
    expect(marca.tipo).toBe('egreso');
  });

  /**
   * Anular exige motivo desde F-12; crear a mano no exigía nada. La
   * asimetría iba para el lado equivocado: borrar una marca real dejaba
   * rastro de la razón e inventar una que nunca existió, no.
   *
   * En producción lo hace cumplir el trigger `imponer_actor_fichaje`,
   * no el formulario: un campo obligatorio en la pantalla lo saltea
   * cualquiera que hable PostgREST directo.
   */
  it('no se puede cargar a mano sin motivo', async () => {
    await expect(
      ficharAhora('ple-7', { metodo: 'manual', tipo: 'ingreso' })
    ).rejects.toThrow(/motivo/i);
  });

  it('un motivo en blanco no cuenta como motivo', async () => {
    await expect(
      ficharAhora('ple-7', { metodo: 'manual', tipo: 'ingreso', motivo: '   ' })
    ).rejects.toThrow(/motivo/i);
  });

  // El fichaje del empleado entra por `fichar_con_rostro`: ahí no hay
  // nada que explicar, la marca la puso el reloj.
  it('el fichaje normal no pide motivo', async () => {
    const marca = await ficharAhora('ple-6');
    expect(marca.metodo).toBe('celular');
    expect(marca.motivo).toBeUndefined();
  });
});

describe('control horario: el tipo lo decide el estado', () => {
  it('alterna entrada y salida en cuatro fichajes', async () => {
    const uno = await ficharAhora('ple-8');
    expect(uno.tipo).toBe('ingreso');
    const dos = await ficharAhora('ple-8');
    expect(dos.tipo).toBe('egreso');
    const tres = await ficharAhora('ple-8');
    expect(tres.tipo).toBe('ingreso');
    const cuatro = await ficharAhora('ple-8');
    expect(cuatro.tipo).toBe('egreso');
  });

  it('la cámara no puede mandar el tipo contrario al estado del servidor', async () => {
    await enrolarRostro('ple-1', [0.4, 0.5, 0.6], {
      aceptado: true,
      texto: 'Autoriza el uso de su rostro para registrar asistencia.',
    });
    const previos = await getFichajesDeEmpleadoHoy('ple-1');
    const esperado = tipoDeMarcaSiguiente(previos);
    const contrario = esperado === 'ingreso' ? 'egreso' : 'ingreso';
    const marca = await ficharConRostro([0.4, 0.5, 0.6], {
      empleadoId: 'ple-1',
      tipo: contrario,
    });
    expect(marca.tipo).toBe(esperado);
  });

  it('el kiosco no genera otra marca si la misma cara vuelve al toque', async () => {
    await enrolarRostro('ple-2', [0.7, 0.8, 0.9], {
      aceptado: true,
      texto: 'Autoriza el uso de su rostro para registrar asistencia.',
    });
    const primero = await ficharConRostro([0.7, 0.8, 0.9]);
    const repetido = await ficharConRostro([0.7, 0.8, 0.91]);
    expect(repetido.id).toBe(primero.id);
    expect(repetido.tipo).toBe(primero.tipo);
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
