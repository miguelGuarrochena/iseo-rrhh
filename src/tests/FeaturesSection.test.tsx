import React from 'react';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { FeaturesSection } from '@/components/FeaturesSection';

jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<object>) => (
      <div {...props}>{children}</div>
    ),
  },
}));

const renderWithMantine = (component: React.ReactElement) =>
  render(<MantineProvider>{component}</MantineProvider>);

describe('FeaturesSection', () => {
  it('renderiza el titular de la sección', () => {
    renderWithMantine(<FeaturesSection />);
    expect(screen.getByText(/¿qué\s+ofrecemos\?/i)).toBeInTheDocument();
    expect(
      screen.getByText(/claridad, previsibilidad y cultura organizacional/i)
    ).toBeInTheDocument();
  });

  it('renderiza las cuatro tarjetas', () => {
    renderWithMantine(<FeaturesSection />);

    expect(
      screen.getByRole('heading', { name: /diagnóstico inicial/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: /implementación de nuestra herramienta online/i,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /visitas programadas/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /procesos claros y a medida/i })
    ).toBeInTheDocument();
  });

  it('expone el id "features" para la navegación', () => {
    const { container } = renderWithMantine(<FeaturesSection />);
    expect(container.querySelector('section')).toHaveAttribute(
      'id',
      'features'
    );
  });
});
