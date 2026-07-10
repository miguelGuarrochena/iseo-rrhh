import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { ContactSection } from '@/components/ContactSection';

jest.mock('framer-motion', () => ({
  motion: {
    div: ({
      children,
      ...props
    }: React.PropsWithChildren<Record<string, unknown>>) => {
      const domProps = { ...props };
      delete domProps.initial;
      delete domProps.whileInView;
      delete domProps.viewport;
      delete domProps.transition;
      return (
        <div {...(domProps as React.HTMLAttributes<HTMLDivElement>)}>
          {children}
        </div>
      );
    },
  },
}));

const renderWithMantine = (component: React.ReactElement) =>
  render(<MantineProvider>{component}</MantineProvider>);

describe('ContactSection', () => {
  it('renderiza el titular', () => {
    renderWithMantine(<ContactSection />);
    expect(
      screen.getByRole('heading', { name: /listo para organizar tu empresa/i })
    ).toBeInTheDocument();
  });

  it('renderiza el link de WhatsApp con el número correcto', () => {
    renderWithMantine(<ContactSection />);
    const link = screen.getByRole('link', { name: /whatsapp/i });
    expect(link).toHaveAttribute(
      'href',
      expect.stringContaining('wa.me/5491154018969')
    );
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('muestra el email de contacto', () => {
    renderWithMantine(<ContactSection />);
    expect(screen.getByText('info@iseo-rh.com')).toBeInTheDocument();
  });

  it('copia el email al portapapeles al tocar el botón', async () => {
    const user = userEvent.setup();
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    renderWithMantine(<ContactSection />);
    await act(async () => {
      await user.click(
        screen.getByRole('button', { name: /copiar correo electrónico/i })
      );
    });

    expect(writeText).toHaveBeenCalledWith('info@iseo-rh.com');
    await waitFor(() => {
      expect(screen.getByText(/¡copiado!/i)).toBeInTheDocument();
    });
  });

  it('expone el id "contact" para la navegación', () => {
    const { container } = renderWithMantine(<ContactSection />);
    expect(container.querySelector('section')).toHaveAttribute('id', 'contact');
  });
});
