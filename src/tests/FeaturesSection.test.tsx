import React from 'react';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { FeaturesSection } from '@/components/FeaturesSection';

// Mock framer-motion
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<object>) => (
      <div {...props}>{children}</div>
    ),
  },
}));

const renderWithMantine = (component: React.ReactElement) => {
  return render(<MantineProvider>{component}</MantineProvider>);
};

describe('FeaturesSection', () => {
  it('renders the section heading', () => {
    renderWithMantine(<FeaturesSection />);
    const heading = screen.getByRole('heading', {
      name: /¿por qué elegir talento\+\?/i,
    });
    expect(heading).toBeInTheDocument();
  });

  it('renders all four feature cards', () => {
    renderWithMantine(<FeaturesSection />);

    expect(
      screen.getByRole('heading', { name: /automatiza procesos/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /reduce costos/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /mejora la comunicación/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /analítica en tiempo real/i })
    ).toBeInTheDocument();
  });

  it('renders feature descriptions', () => {
    renderWithMantine(<FeaturesSection />);

    expect(
      screen.getByText(/elimina tareas repetitivas y ahorra tiempo/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/optimiza recursos y reduce gastos operativos/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/centraliza la información y facilita la comunicación/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/toma decisiones informadas con reportes/i)
    ).toBeInTheDocument();
  });

  it('has the correct section id for navigation', () => {
    const { container } = renderWithMantine(<FeaturesSection />);
    const section = container.querySelector('section');
    expect(section).toHaveAttribute('id', 'features');
  });
});
