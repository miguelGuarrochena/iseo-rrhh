import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { ContactSection } from '@/components/ContactSection';

// Mock framer-motion
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

describe('ContactSection', () => {
  it('renders the contact form heading', () => {
    renderWithMantine(<ContactSection />);
    const heading = screen.getByRole('heading', {
      name: /solicita una demo gratuita/i,
    });
    expect(heading).toBeInTheDocument();
  });

  it('renders all form fields', () => {
    renderWithMantine(<ContactSection />);

    expect(screen.getByLabelText(/nombre completo/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email corporativo/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/empresa/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/mensaje/i)).toBeInTheDocument();
  });

  it('renders submit button', () => {
    renderWithMantine(<ContactSection />);
    const button = screen.getByRole('button', { name: /enviar solicitud/i });
    expect(button).toBeInTheDocument();
  });

  it('shows validation error for invalid email', async () => {
    const user = userEvent.setup();
    renderWithMantine(<ContactSection />);

    const emailInput = screen.getByLabelText(/email corporativo/i);
    await user.type(emailInput, 'invalid-email');

    const submitButton = screen.getByRole('button', {
      name: /enviar solicitud/i,
    });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/email inválido/i)).toBeInTheDocument();
    });
  });

  it('shows validation error for short name', async () => {
    const user = userEvent.setup();
    renderWithMantine(<ContactSection />);

    const nameInput = screen.getByLabelText(/nombre completo/i);
    await user.type(nameInput, 'A');

    const submitButton = screen.getByRole('button', {
      name: /enviar solicitud/i,
    });
    await user.click(submitButton);

    await waitFor(() => {
      expect(
        screen.getByText(/el nombre debe tener al menos 2 caracteres/i)
      ).toBeInTheDocument();
    });
  });

  it('submits form with valid data', async () => {
    const user = userEvent.setup();
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    renderWithMantine(<ContactSection />);

    await user.type(screen.getByLabelText(/nombre completo/i), 'Juan Pérez');
    await user.type(
      screen.getByLabelText(/email corporativo/i),
      'juan@empresa.com'
    );
    await user.type(screen.getByLabelText(/empresa/i), 'Mi Empresa S.A.');
    await user.type(
      screen.getByLabelText(/mensaje/i),
      'Estoy interesado en conocer más sobre Talento+'
    );

    const submitButton = screen.getByRole('button', {
      name: /enviar solicitud/i,
    });
    await user.click(submitButton);

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        'Form submitted:',
        expect.objectContaining({
          name: 'Juan Pérez',
          email: 'juan@empresa.com',
          company: 'Mi Empresa S.A.',
          message: 'Estoy interesado en conocer más sobre Talento+',
        })
      );
    });

    consoleSpy.mockRestore();
  });

  it('shows success message after submission', async () => {
    const user = userEvent.setup();
    renderWithMantine(<ContactSection />);

    await user.type(screen.getByLabelText(/nombre completo/i), 'Juan Pérez');
    await user.type(
      screen.getByLabelText(/email corporativo/i),
      'juan@empresa.com'
    );
    await user.type(screen.getByLabelText(/empresa/i), 'Mi Empresa S.A.');
    await user.type(
      screen.getByLabelText(/mensaje/i),
      'Mensaje de prueba para el formulario'
    );

    const submitButton = screen.getByRole('button', {
      name: /enviar solicitud/i,
    });
    await user.click(submitButton);

    await waitFor(() => {
      expect(
        screen.getByText(/¡gracias! nos pondremos en contacto pronto/i)
      ).toBeInTheDocument();
    });
  });

  it('has accessible form labels', () => {
    renderWithMantine(<ContactSection />);

    const nameInput = screen.getByLabelText(/nombre completo/i);
    const emailInput = screen.getByLabelText(/email corporativo/i);
    const companyInput = screen.getByLabelText(/empresa/i);
    const messageInput = screen.getByLabelText(/mensaje/i);

    expect(nameInput).toHaveAttribute('required');
    expect(emailInput).toHaveAttribute('required');
    expect(companyInput).toHaveAttribute('required');
    expect(messageInput).toHaveAttribute('required');
  });
});
