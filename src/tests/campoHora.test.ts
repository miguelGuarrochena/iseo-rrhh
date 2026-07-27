import { parsearHora } from '@/components/app/ui/CampoHora';

describe('parsearHora', () => {
  it('acepta lo que la gente tipea de verdad', () => {
    expect(parsearHora('8')).toBe('08:00');
    expect(parsearHora('08')).toBe('08:00');
    expect(parsearHora('830')).toBe('08:30');
    expect(parsearHora('8:30')).toBe('08:30');
    expect(parsearHora('8.30')).toBe('08:30');
    expect(parsearHora('8 30')).toBe('08:30');
    expect(parsearHora('18:45')).toBe('18:45');
    expect(parsearHora('1845')).toBe('18:45');
  });

  it('normaliza a HH:MM con ceros', () => {
    expect(parsearHora('9:5')).toBe('09:05');
    expect(parsearHora('0:0')).toBe('00:00');
  });

  it('ignora espacios de más', () => {
    expect(parsearHora('  17:15  ')).toBe('17:15');
  });

  it('rechaza horas que no existen', () => {
    expect(parsearHora('24:00')).toBeNull();
    expect(parsearHora('12:60')).toBeNull();
    expect(parsearHora('99')).toBeNull();
  });

  it('rechaza lo que no es una hora', () => {
    expect(parsearHora('')).toBeNull();
    expect(parsearHora('   ')).toBeNull();
    expect(parsearHora('hola')).toBeNull();
    expect(parsearHora('8:')).toBeNull();
    expect(parsearHora('12345')).toBeNull();
  });
});
