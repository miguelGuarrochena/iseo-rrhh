import React, { useState } from 'react';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Selector } from '@/components/app/ui/Selector';

/**
 * El scroll del panel del Selector con el dedo.
 *
 * El desplegable se reposiciona escuchando `scroll` en fase de captura,
 * así que también se enteraba del scroll de su propio panel; como cada
 * medición devolvía un objeto nuevo, el efecto que lleva a la vista la
 * opción resaltada se volvía a disparar en cada frame del gesto y
 * devolvía la lista a donde estaba la opción elegida.
 *
 * En desktop no se veía: al girar la rueda las opciones pasan bajo el
 * cursor, el `mouseenter` va resaltando una visible y `block: 'nearest'`
 * no tiene nada que corregir. Con el dedo no hay `mouseenter`, la
 * resaltada queda clavada donde la dejó la apertura y la lista rebota. Si
 * la elegida era una de las primeras —o no había ninguna, que resalta la
 * primera— no se podía bajar más allá de la primera pantalla.
 *
 * jsdom no tiene layout ni scroll real, así que lo que se prueba es el
 * contrato que rompía: reposicionar el panel no toca el scroll interno de
 * la lista; moverse con las flechas sí.
 */

const OPCIONES = Array.from({ length: 40 }, (_, i) => ({
  valor: `o-${i}`,
  etiqueta: `Opción ${i}`,
}));

const alaVista = jest.fn();

beforeAll(() => {
  // jsdom no implementa `scrollIntoView`.
  Element.prototype.scrollIntoView = alaVista;
});

beforeEach(() => alaVista.mockClear());

const Caso = ({ inicial = '' }: { inicial?: string }) => {
  const [valor, setValor] = useState(inicial);
  return <Selector valor={valor} onCambiar={setValor} opciones={OPCIONES} />;
};

const abrir = async (inicial?: string) => {
  render(<Caso inicial={inicial} />);
  await userEvent.click(screen.getByRole('button'));
  return screen.getByRole('listbox');
};

/** Un gesto de scroll sobre el panel, como lo emite el navegador. */
const scrollearPanel = (panel: HTMLElement) =>
  act(() => {
    panel.dispatchEvent(new Event('scroll'));
  });

describe('Selector: el scroll del panel', () => {
  it('deja a la vista la opción elegida al abrir', async () => {
    const panel = await abrir('o-30');
    expect(alaVista).toHaveBeenCalledTimes(1);
    expect(within(panel).getByText('Opción 39')).toBeInTheDocument();
  });

  it('no devuelve la lista a la opción elegida al scrollear con el dedo', async () => {
    const panel = await abrir('o-1');
    alaVista.mockClear();

    scrollearPanel(panel);
    scrollearPanel(panel);
    scrollearPanel(panel);

    expect(alaVista).not.toHaveBeenCalled();
  });

  it('tampoco cuando la elegida es la primera de una lista larga', async () => {
    // El caso del desplegable de invitación: abre en "Sin vincular", que
    // es la opción 0, y el rebote dejaba el panel clavado arriba.
    const panel = await abrir();
    alaVista.mockClear();

    scrollearPanel(panel);

    expect(alaVista).not.toHaveBeenCalled();
  });

  it('tampoco cuando scrollea la página o el cuerpo de un modal', async () => {
    await abrir('o-2');
    alaVista.mockClear();

    act(() => {
      window.dispatchEvent(new Event('scroll'));
      document.dispatchEvent(new Event('scroll'));
    });

    expect(alaVista).not.toHaveBeenCalled();
  });

  it('sigue llevando a la vista la opción al moverse con las flechas', async () => {
    await abrir('o-1');
    alaVista.mockClear();

    await userEvent.keyboard('{ArrowDown}');
    expect(alaVista).toHaveBeenCalledTimes(1);

    await userEvent.keyboard('{End}');
    expect(alaVista).toHaveBeenCalledTimes(2);
  });

  it('se puede elegir la última opción y al reabrir el panel sigue vivo', async () => {
    const panel = await abrir();
    await userEvent.click(within(panel).getByText('Opción 39'));
    expect(screen.getByRole('button')).toHaveTextContent('Opción 39');

    alaVista.mockClear();
    await userEvent.click(screen.getByRole('button'));
    // Se reabre: vuelve a llevar a la vista la elegida, una sola vez.
    expect(alaVista).toHaveBeenCalledTimes(1);

    scrollearPanel(screen.getByRole('listbox'));
    expect(alaVista).toHaveBeenCalledTimes(1);
  });
});
