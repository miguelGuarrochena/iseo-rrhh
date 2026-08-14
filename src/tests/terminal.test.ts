import {
  borrarTerminalLocal,
  getTerminalLocal,
  setTerminalLocal,
} from '@/lib/terminal';

/**
 * La credencial local de la terminal.
 *
 * Lo que se prueba acá NO es la autorización —ésa vive en el RPC, que la
 * valida contra el hash guardado en la base— sino que el dispositivo
 * lleve bien su credencial y, sobre todo, que un id suelto de la versión
 * vieja no se siga tratando como si vinculara algo.
 *
 * Antes de F-01, `iseo_terminal_id` era toda la "autorización" del Modo
 * planta: la pantalla comparaba ese id contra la lista de terminales y
 * listo. Después de F-01 ese id no ficha nada, así que dejarlo vivo sólo
 * lograría que la pantalla ofrezca un Modo planta que la base va a
 * rechazar, con la fila de gente ya formada frente a la tablet.
 */
describe('credencial local de terminal', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('guarda y devuelve el par id + secreto', () => {
    setTerminalLocal({ id: 'term-1', secreto: 'abc123' });

    expect(getTerminalLocal()).toEqual({ id: 'term-1', secreto: 'abc123' });
  });

  it('sin vincular no devuelve nada', () => {
    expect(getTerminalLocal()).toBeNull();
  });

  it('el id suelto de la versión vieja NO vincula el dispositivo', () => {
    window.localStorage.setItem('iseo_terminal_id', 'term-vieja');

    expect(getTerminalLocal()).toBeNull();
  });

  it('y además lo borra, para que la pantalla no ofrezca un kiosco muerto', () => {
    window.localStorage.setItem('iseo_terminal_id', 'term-vieja');

    getTerminalLocal();

    expect(window.localStorage.getItem('iseo_terminal_id')).toBeNull();
  });

  it('vincular limpia el rastro de la clave vieja', () => {
    window.localStorage.setItem('iseo_terminal_id', 'term-vieja');

    setTerminalLocal({ id: 'term-2', secreto: 'xyz' });

    expect(window.localStorage.getItem('iseo_terminal_id')).toBeNull();
    expect(getTerminalLocal()?.id).toBe('term-2');
  });

  it('una credencial a medias no sirve: hacen falta las dos partes', () => {
    window.localStorage.setItem('iseo_terminal', JSON.stringify({ id: 't' }));
    expect(getTerminalLocal()).toBeNull();

    window.localStorage.setItem(
      'iseo_terminal',
      JSON.stringify({ secreto: 's' })
    );
    expect(getTerminalLocal()).toBeNull();
  });

  it('con basura en el storage no rompe y limpia', () => {
    window.localStorage.setItem('iseo_terminal', 'no-soy-json');

    expect(getTerminalLocal()).toBeNull();
    expect(window.localStorage.getItem('iseo_terminal')).toBeNull();
  });

  it('desvincular borra las dos claves', () => {
    setTerminalLocal({ id: 'term-3', secreto: 's' });
    window.localStorage.setItem('iseo_terminal_id', 'term-vieja');

    borrarTerminalLocal();

    expect(getTerminalLocal()).toBeNull();
    expect(window.localStorage.getItem('iseo_terminal_id')).toBeNull();
  });
});
