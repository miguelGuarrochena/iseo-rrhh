import React from 'react';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { HeroSection } from '@/components/HeroSection';

// Mock framer-motion to avoid animation issues in tests
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

describe('HeroSection', () => {
  it('renders the main heading', () => {
    renderWithMantine(<HeroSection />);
    const heading = screen.getByRole('heading', {
      name: /gestión de recursos humanos simplificada/i,
    });
    expect(heading).toBeInTheDocument();
  });

  it('renders the subtitle text', () => {
    renderWithMantine(<HeroSection />);
    const subtitle = screen.getByText(
      /talento\+ es la solución integral diseñada para pequeñas y medianas empresas/i
    );
    expect(subtitle).toBeInTheDocument();
  });

  it('renders the CTA button', () => {
    renderWithMantine(<HeroSection />);
    const button = screen.getByRole('button', {
      name: /solicitar demo gratuita/i,
    });
    expect(button).toBeInTheDocument();
  });

  it('has correct heading level', () => {
    renderWithMantine(<HeroSection />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toBeInTheDocument();
  });

  it('applies correct styling classes', () => {
    const { container } = renderWithMantine(<HeroSection />);
    const section = container.querySelector('section');
    expect(section).toHaveClass(
      'bg-gradient-to-br',
      'from-blue-50',
      'to-white'
    );
  });
});
