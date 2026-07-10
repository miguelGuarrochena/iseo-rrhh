import React from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { Header } from '@/components/Header';

const renderWithMantine = (component: React.ReactElement) =>
  render(<MantineProvider>{component}</MantineProvider>);

describe('Header', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = jest.fn();
    window.scrollTo = jest.fn();
  });

  it('renderiza el logo', () => {
    renderWithMantine(<Header />);
    expect(screen.getByAltText('ISEO RH')).toBeInTheDocument();
  });

  it('renderiza los enlaces de navegación y el CTA', () => {
    renderWithMantine(<Header />);
    expect(
      screen.getAllByRole('button', { name: /¿qué ofrecemos\?/i }).length
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole('button', { name: /¿por qué elegirnos\?/i }).length
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole('button', { name: /^contactanos$/i }).length
    ).toBeGreaterThan(0);
  });

  it('está fijo en la parte superior', () => {
    const { container } = renderWithMantine(<Header />);
    const header = container.querySelector('header');
    expect(header).toHaveClass('fixed', 'top-0');
  });

  it('hace scroll a #features al clickear "¿Qué ofrecemos?"', async () => {
    const user = userEvent.setup();
    const target = document.createElement('div');
    target.id = 'features';
    document.body.appendChild(target);

    renderWithMantine(<Header />);
    const button = screen.getAllByRole('button', {
      name: /¿qué ofrecemos\?/i,
    })[0];
    await act(async () => {
      await user.click(button);
    });

    expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' });
    document.body.removeChild(target);
  });

  it('hace scroll a #contact al clickear "Contactanos"', async () => {
    const user = userEvent.setup();
    const target = document.createElement('div');
    target.id = 'contact';
    document.body.appendChild(target);

    renderWithMantine(<Header />);
    const button = screen.getAllByRole('button', {
      name: /^contactanos$/i,
    })[0];
    await act(async () => {
      await user.click(button);
    });

    expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' });
    document.body.removeChild(target);
  });
});
