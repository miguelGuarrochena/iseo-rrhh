import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { HeroSection } from '@/components/HeroSection';

jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<object>) => (
      <div {...props}>{children}</div>
    ),
  },
}));

const renderWithMantine = (component: React.ReactElement) =>
  render(<MantineProvider>{component}</MantineProvider>);

describe('HeroSection', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = jest.fn();
  });

  it('renderiza el titular principal', () => {
    renderWithMantine(<HeroSection />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent(/organizá tu empresa/i);
    expect(heading).toHaveTextContent(/recursos humanos/i);
  });

  it('renderiza los párrafos descriptivos', () => {
    renderWithMantine(<HeroSection />);
    expect(
      screen.getByText(/no cuentan con un área de recursos humanos/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/aliado en la gestión y organización del personal/i)
    ).toBeInTheDocument();
  });

  it('renderiza el CTA "Contactanos"', () => {
    renderWithMantine(<HeroSection />);
    expect(
      screen.getByRole('button', { name: /contactanos/i })
    ).toBeInTheDocument();
  });

  it('hace scroll al contacto al tocar el CTA', async () => {
    const user = userEvent.setup();
    const target = document.createElement('div');
    target.id = 'contact';
    document.body.appendChild(target);

    renderWithMantine(<HeroSection />);
    await user.click(screen.getByRole('button', { name: /contactanos/i }));

    expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' });
    document.body.removeChild(target);
  });
});
