import {
  clasificarBateria,
  porcentajeBateria,
  textoAvisoBateria,
  UMBRAL_BATERIA_BAJA,
  UMBRAL_BATERIA_CRITICA,
} from '@/lib/dispositivo/bateria';

describe('clasificarBateria', () => {
  it('está ok por encima del umbral, aunque no cargue', () => {
    expect(clasificarBateria(0.5, false)).toBe('ok');
    expect(clasificarBateria(UMBRAL_BATERIA_BAJA + 0.01, false)).toBe('ok');
  });

  it('es crítica al 10% o menos si no está enchufada', () => {
    expect(clasificarBateria(UMBRAL_BATERIA_CRITICA, false)).toBe('critica');
    expect(clasificarBateria(0.04, false)).toBe('critica');
  });

  it('es baja entre crítica y el 20% si no está enchufada', () => {
    expect(clasificarBateria(0.15, false)).toBe('baja');
  });

  it('si está cargando, no asusta: avisa que espere', () => {
    expect(clasificarBateria(0.05, true)).toBe('cargando');
    expect(clasificarBateria(0.18, true)).toBe('cargando');
  });
});

describe('textoAvisoBateria', () => {
  it('no dice nada si hay carga de sobra', () => {
    expect(textoAvisoBateria('ok', 0.8)).toBeNull();
  });

  it('manda a RRHH a fichar a mano mientras se carga', () => {
    const critica = textoAvisoBateria('critica', 0.07);
    expect(critica?.titulo).toContain('7%');
    expect(critica?.detalle.toLowerCase()).toMatch(/rrhh/);
    expect(critica?.detalle.toLowerCase()).toMatch(/mano/);

    const cargando = textoAvisoBateria('cargando', 0.08);
    expect(cargando?.titulo).toMatch(/cargando/i);
    expect(cargando?.detalle.toLowerCase()).toMatch(/rrhh/);
  });

  it('el porcentaje queda entre 0 y 100', () => {
    expect(porcentajeBateria(-0.2)).toBe(0);
    expect(porcentajeBateria(1.4)).toBe(100);
    expect(porcentajeBateria(0.123)).toBe(12);
  });
});
