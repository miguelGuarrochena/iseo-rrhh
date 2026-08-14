import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { HeroSection } from '@/components/HeroSection';

// framer-motion se stubea globalmente en jest.config.js.

const renderWithMantine = (component: React.ReactElement) =>
  render(<MantineProvider>{component}</MantineProvider>);

describe('HeroSection', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = jest.fn();
  });

  it('renderiza el titular principal', () => {
    renderWithMantine(<HeroSection />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent(/somos tu área de/i);
    expect(heading).toHaveTextContent(/recursos humanos/i);
  });

  it('renderiza los párrafos descriptivos', () => {
    renderWithMantine(<HeroSection />);
    expect(
      screen.getByText(/aliado en la gestión y organización del personal/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/plataforma pensada para pequeñas y medianas empresas/i)
    ).toBeInTheDocument();
  });

  it('renderiza las marcas y clientes', () => {
    renderWithMantine(<HeroSection />);
    expect(screen.getByText('Mae Tuanis')).toBeInTheDocument();
    expect(screen.getByText('Ropa de surf')).toBeInTheDocument();
    expect(screen.getByText('Glaciarum')).toBeInTheDocument();
    expect(screen.getByText('Madre Teresa')).toBeInTheDocument();
    expect(screen.getByText('Museo de Hielo')).toBeInTheDocument();
    expect(screen.getByText('Colegio')).toBeInTheDocument();
  });

  it('renderiza los dos CTA', () => {
    renderWithMantine(<HeroSection />);
    expect(
      screen.getByRole('button', { name: /solicitar una demo/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /conocé la plataforma/i })
    ).toBeInTheDocument();
  });

  it('el CTA principal hace scroll al contacto', async () => {
    const user = userEvent.setup();
    const target = document.createElement('div');
    target.id = 'contact';
    document.body.appendChild(target);

    renderWithMantine(<HeroSection />);
    await user.click(
      screen.getByRole('button', { name: /solicitar una demo/i })
    );

    expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' });
    document.body.removeChild(target);
  });

  it('el CTA secundario hace scroll a la sección de producto', async () => {
    const user = userEvent.setup();
    const target = document.createElement('div');
    target.id = 'producto';
    document.body.appendChild(target);

    renderWithMantine(<HeroSection />);
    await user.click(
      screen.getByRole('button', { name: /conocé la plataforma/i })
    );

    expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' });
    document.body.removeChild(target);
  });
});
