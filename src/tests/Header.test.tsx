import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { Header } from '@/components/Header';

const renderWithMantine = (component: React.ReactElement) => {
  return render(<MantineProvider>{component}</MantineProvider>);
};

describe('Header', () => {
  beforeEach(() => {
    // Mock scrollIntoView
    Element.prototype.scrollIntoView = jest.fn();
  });

  it('renders the logo', () => {
    renderWithMantine(<Header />);
    const logo = screen.getByRole('img', { hidden: true });
    expect(logo).toBeInTheDocument();
  });

  it('renders navigation buttons', () => {
    renderWithMantine(<Header />);

    expect(
      screen.getByRole('button', { name: /características/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /nosotros/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /solicitar demo/i })
    ).toBeInTheDocument();
  });

  it('has sticky positioning', () => {
    const { container } = renderWithMantine(<Header />);
    const header = container.querySelector('header');
    expect(header).toHaveClass('sticky', 'top-0');
  });

  it('scrolls to features section when clicking Características', async () => {
    const user = userEvent.setup();
    const mockElement = document.createElement('div');
    mockElement.id = 'features';
    document.body.appendChild(mockElement);

    renderWithMantine(<Header />);

    const button = screen.getByRole('button', { name: /características/i });
    await user.click(button);

    expect(mockElement.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
    });

    document.body.removeChild(mockElement);
  });

  it('scrolls to about section when clicking Nosotros', async () => {
    const user = userEvent.setup();
    const mockElement = document.createElement('div');
    mockElement.id = 'about';
    document.body.appendChild(mockElement);

    renderWithMantine(<Header />);

    const button = screen.getByRole('button', { name: /nosotros/i });
    await user.click(button);

    expect(mockElement.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
    });

    document.body.removeChild(mockElement);
  });

  it('scrolls to contact section when clicking Solicitar Demo', async () => {
    const user = userEvent.setup();
    const mockElement = document.createElement('div');
    mockElement.id = 'contact';
    document.body.appendChild(mockElement);

    renderWithMantine(<Header />);

    const button = screen.getByRole('button', { name: /solicitar demo/i });
    await user.click(button);

    expect(mockElement.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
    });

    document.body.removeChild(mockElement);
  });
});
