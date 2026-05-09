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

  it('apunta a /logo.svg', () => {
    render(<Logo />);
    const img = screen.getByAltText('ISEO RH');
    expect(img.getAttribute('src')).toContain('logo.svg');
  });
});
