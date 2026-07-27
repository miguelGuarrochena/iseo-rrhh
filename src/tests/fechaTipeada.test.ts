import { parsearFechaTipeada } from '@/components/app/ui/CampoFecha';
import { expandirAnio } from '@/lib/fechas';

describe('parsearFechaTipeada', () => {
  it('acepta dd/mm/aaaa y normaliza a ISO', () => {
    expect(parsearFechaTipeada('02/07/2026')).toBe('2026-07-02');
    expect(parsearFechaTipeada('2/7/2026')).toBe('2026-07-02');
  });

  it('acepta guiones, puntos y año corto', () => {
    expect(parsearFechaTipeada('02-07-2026')).toBe('2026-07-02');
    expect(parsearFechaTipeada('02.07.26')).toBe('2026-07-02');
  });

  it('rechaza fechas inexistentes o incompletas', () => {
    expect(parsearFechaTipeada('31/02/2026')).toBeNull();
    expect(parsearFechaTipeada('12/13/2026')).toBeNull();
    expect(parsearFechaTipeada('12/07')).toBeNull();
    expect(parsearFechaTipeada('hola')).toBeNull();
  });

  it('respeta los años bisiestos', () => {
    expect(parsearFechaTipeada('29/02/2028')).toBe('2028-02-29');
    expect(parsearFechaTipeada('29/02/2026')).toBeNull();
  });

  // Devolución del cliente: no podía cargar una fecha de nacimiento de
  // los 1900 porque al tipear "05/03/19" el campo se cerraba en 2019.
  describe('mientras se tipea (soloAnioCompleto)', () => {
    it('no toma la fecha hasta que el año tiene 4 dígitos', () => {
      expect(parsearFechaTipeada('05/03/1', true)).toBeNull();
      expect(parsearFechaTipeada('05/03/19', true)).toBeNull();
      expect(parsearFechaTipeada('05/03/198', true)).toBeNull();
      expect(parsearFechaTipeada('05/03/1985', true)).toBe('1985-03-05');
    });

    it('deja escribir cualquier año de los 1900', () => {
      expect(parsearFechaTipeada('12/11/1962', true)).toBe('1962-11-12');
      expect(parsearFechaTipeada('01/01/1900', true)).toBe('1900-01-01');
    });
  });

  describe('año corto (al salir del campo)', () => {
    it('manda los años viejos a 19xx', () => {
      expect(parsearFechaTipeada('05/03/85')).toBe('1985-03-05');
      expect(parsearFechaTipeada('12/11/62')).toBe('1962-11-12');
    });

    it('mantiene los años cercanos en 20xx', () => {
      expect(parsearFechaTipeada('02/07/26')).toBe('2026-07-02');
      expect(parsearFechaTipeada('02/07/28')).toBe('2028-07-02');
    });
  });
});

describe('expandirAnio', () => {
  const hoy = new Date(2026, 6, 27);

  it('toma como 20xx hasta 10 años en el futuro', () => {
    expect(expandirAnio(26, hoy)).toBe(2026);
    expect(expandirAnio(36, hoy)).toBe(2036);
    expect(expandirAnio(0, hoy)).toBe(2000);
  });

  it('manda el resto a 19xx', () => {
    expect(expandirAnio(37, hoy)).toBe(1937);
    expect(expandirAnio(85, hoy)).toBe(1985);
    expect(expandirAnio(99, hoy)).toBe(1999);
  });
});
