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

  it('renderiza el panel oscuro interior sobre fondo paper', () => {
    const { container } = renderWithMantine(<Footer />);
    const footer = container.querySelector('footer');
    expect(footer).toHaveClass('bg-paper');
    expect(footer?.querySelector('.text-white')).toBeInTheDocument();
  });
});
