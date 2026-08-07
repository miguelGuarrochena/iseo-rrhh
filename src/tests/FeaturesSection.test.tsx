import React from 'react';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { FeaturesSection } from '@/components/FeaturesSection';

// framer-motion se stubea globalmente en jest.config.js.

const renderWithMantine = (component: React.ReactElement) =>
  render(<MantineProvider>{component}</MantineProvider>);

describe('FeaturesSection', () => {
  it('renderiza el titular de la sección', () => {
    renderWithMantine(<FeaturesSection />);
    const titular = screen.getByRole('heading', { level: 2 });
    expect(titular).toHaveTextContent(/una plataforma simple/i);
    expect(titular).toHaveTextContent(/para tu negocio/i);
    expect(
      screen.getByText(/herramientas esenciales para gestionar tu equipo/i)
    ).toBeInTheDocument();
  });

  // Las cuatro ventajas se renderizan como <span>, no como headings, así
  // que se buscan por texto. Convertirlas en <h3> les daría estructura a
  // los lectores de pantalla, pero es un cambio de markup y va aparte.
  it('renderiza las cuatro ventajas', () => {
    renderWithMantine(<FeaturesSection />);

    expect(screen.getByText(/ahorra tiempo y recursos/i)).toBeInTheDocument();
    expect(
      screen.getByText(/todo en la nube, siempre disponible/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/adaptado a tu empresa/i)).toBeInTheDocument();
    expect(screen.getByText(/probalo sin compromiso/i)).toBeInTheDocument();
  });

  it('expone el id "features" para la navegación', () => {
    const { container } = renderWithMantine(<FeaturesSection />);
    expect(container.querySelector('section')).toHaveAttribute(
      'id',
      'features'
    );
  });
});
