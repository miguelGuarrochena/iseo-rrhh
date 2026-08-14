import React from 'react';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { Footer } from '@/components/Footer';

const renderWithMantine = (component: React.ReactElement) =>
  render(<MantineProvider>{component}</MantineProvider>);

describe('Footer', () => {
  it('renderiza el copyright con el año actual y la marca', () => {
    renderWithMantine(<Footer />);
    const year = new Date().getFullYear();
    expect(
      screen.getByText(new RegExp(`© ${year} ISEO RH`, 'i'))
    ).toBeInTheDocument();
  });

  it('el enlace de WhatsApp apunta al número de contacto', () => {
    renderWithMantine(<Footer />);
    const link = screen.getByRole('link', { name: /whatsapp/i });
    expect(link).toHaveAttribute(
      'href',
      expect.stringContaining('wa.me/5491166667508')
    );
  });

  it('renderiza el panel oscuro interior sobre fondo paper', () => {
    const { container } = renderWithMantine(<Footer />);
    const footer = container.querySelector('footer');
    expect(footer).toHaveClass('bg-paper');
    expect(footer?.querySelector('.text-white')).toBeInTheDocument();
  });
});
