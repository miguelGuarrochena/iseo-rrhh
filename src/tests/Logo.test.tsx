import React from 'react';
import { render, screen } from '@testing-library/react';
import { Logo } from '@/components/Logo';

describe('Logo', () => {
  it('renderiza la imagen con alt accesible', () => {
    render(<Logo />);
    expect(screen.getByAltText('ISEO RH')).toBeInTheDocument();
  });

  it('aplica el className personalizado al wrapper', () => {
    const { container } = render(<Logo className="custom-class" />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('custom-class');
  });

  it('apunta al isotipo', () => {
    render(<Logo />);
    const img = screen.getByAltText('ISEO RH');
    expect(img.getAttribute('src')).toContain('logo-iseo-marca');
  });

  it('sobre fondo oscuro usa la variante de trazo claro', () => {
    render(<Logo tono="sobre-oscuro" />);
    const img = screen.getByAltText('ISEO RH');
    expect(img.getAttribute('src')).toContain('logo-iseo-marca-dark');
  });
});
