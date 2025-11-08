import React from 'react';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { Footer } from '@/components/Footer';

const renderWithMantine = (component: React.ReactElement) => {
  return render(<MantineProvider>{component}</MantineProvider>);
};

describe('Footer', () => {
  it('renders the logo', () => {
    renderWithMantine(<Footer />);
    const logo = screen.getByRole('img', { hidden: true });
    expect(logo).toBeInTheDocument();
  });

  it('renders the company description', () => {
    renderWithMantine(<Footer />);
    expect(
      screen.getByText(
        /simplificando la gestión de recursos humanos para empresas/i
      )
    ).toBeInTheDocument();
  });

  it('renders product links', () => {
    renderWithMantine(<Footer />);

    expect(screen.getByText('Producto')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /características/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /nosotros/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /contacto/i })).toBeInTheDocument();
  });

  it('renders legal links', () => {
    renderWithMantine(<Footer />);

    expect(screen.getByText('Legal')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /privacidad/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /términos/i })).toBeInTheDocument();
  });

  it('renders copyright text with current year', () => {
    renderWithMantine(<Footer />);
    const currentYear = new Date().getFullYear();
    expect(
      screen.getByText(new RegExp(`© ${currentYear} Talento\\+`, 'i'))
    ).toBeInTheDocument();
  });

  it('has correct background styling', () => {
    const { container } = renderWithMantine(<Footer />);
    const footer = container.querySelector('footer');
    expect(footer).toHaveClass('bg-gray-900', 'text-white');
  });
});
