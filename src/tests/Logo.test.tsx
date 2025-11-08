import React from 'react';
import { render } from '@testing-library/react';
import { Logo } from '@/components/Logo';

describe('Logo', () => {
  it('renders with default dimensions', () => {
    const { container } = render(<Logo />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '200');
    expect(svg).toHaveAttribute('height', '60');
  });

  it('renders with custom dimensions', () => {
    const { container } = render(<Logo width={100} height={30} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '100');
    expect(svg).toHaveAttribute('height', '30');
  });

  it('applies custom className', () => {
    const { container } = render(<Logo className="custom-class" />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveClass('custom-class');
  });

  it('has correct viewBox', () => {
    const { container } = render(<Logo />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('viewBox', '0 0 200 60');
  });

  it('renders SVG paths and elements', () => {
    const { container } = render(<Logo />);
    const paths = container.querySelectorAll('path');
    const rects = container.querySelectorAll('rect');
    const circles = container.querySelectorAll('circle');

    expect(paths.length).toBeGreaterThan(0);
    expect(rects.length).toBeGreaterThan(0);
    expect(circles.length).toBeGreaterThan(0);
  });
});
