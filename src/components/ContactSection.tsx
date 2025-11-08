import React, { useState } from 'react';
import {
  Container,
  Title,
  Text,
  Stack,
  TextInput,
  Textarea,
  Button,
  Box,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { motion } from 'framer-motion';
import { IconBrandWhatsapp, IconPhone } from '@tabler/icons-react';

interface ContactFormValues {
  name: string;
  email: string;
  company: string;
  message: string;
}

export const ContactSection: React.FC = () => {
  const [submitted, setSubmitted] = useState(false);

  const form = useForm<ContactFormValues>({
    initialValues: {
      name: '',
      email: '',
      company: '',
      message: '',
    },
    validate: {
      name: (value) =>
        value.length < 2 ? 'El nombre debe tener al menos 2 caracteres' : null,
      email: (value) => (/^\S+@\S+$/.test(value) ? null : 'Email inválido'),
      company: (value) =>
        value.length < 2
          ? 'El nombre de la empresa debe tener al menos 2 caracteres'
          : null,
      message: (value) =>
        value.length < 10
          ? 'El mensaje debe tener al menos 10 caracteres'
          : null,
    },
  });

  const handleSubmit = async (values: ContactFormValues) => {
    try {
      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(values),
      });

      if (response.ok) {
        setSubmitted(true);
        form.reset();
      } else {
        throw new Error('Error al enviar el mensaje');
      }
    } catch (error) {
      console.error('Error:', error);
      alert(
        'Ocurrió un error al enviar el mensaje. Por favor, intente nuevamente.'
      );
    }
    setTimeout(() => setSubmitted(false), 5000);
  };

  return (
    <section id="contact" className="py-16 bg-white">
      <Container size="md" className="py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
        >
          <Stack gap="xl" align="center" className="text-center px-4">
            <Title
              order={2}
              size="2.5rem"
              fw={700}
              className="text-gray-900 text-3xl sm:text-4xl leading-tight"
            >
              ¿Listo para organizar tu empresa?
            </Title>

            <div className="flex flex-col sm:flex-row gap-8 justify-start sm:justify-center items-start sm:items-center mt-4 text-gray-700 w-full max-w-2xl mx-auto px-4 sm:px-0">
              <a
                href="https://wa.me/5491154018969?text=Hola%20ISEO%20RH%2C%20me%20interesar%C3%ADa%20conocer%20m%C3%A1s%20sobre%20sus%20servicios%20de%20Recursos%20Humanos.%20%C2%A1Gracias!"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 hover:text-green-600 transition-colors no-underline group"
                title="Escribinos por WhatsApp"
                onClick={() => {
                  // Opcional: Puedes agregar seguimiento de eventos aquí
                  // Ejemplo: trackEvent('WhatsApp Click', 'Contact Section');
                }}
              >
                <IconBrandWhatsapp size={28} className="text-green-500" />
                <span className="text-current group-hover:underline">
                  WhatsApp
                </span>
                <span className="sr-only">
                  (Se abrirá en una nueva pestaña)
                </span>
              </a>

              <div className="hidden sm:block text-gray-400">|</div>

              <a
                href="tel:+5491154018969"
                className="flex items-center gap-2 hover:text-blue-600 transition-colors no-underline"
                title="Llamanos"
              >
                <IconPhone size={28} className="text-blue-500" />
                <span className="text-current">+54 9 11 5401-8969</span>
              </a>
            </div>

            <Text size="xl" c="dimmed" className="max-w-2xl mt-8">
              O completá el formulario y nos pondremos en contacto a la
              brevedad:
            </Text>
          </Stack>

          <Box className="mt-8 max-w-2xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              viewport={{ once: true }}
            >
              <form onSubmit={form.onSubmit(handleSubmit)}>
                <Stack gap="md">
                  <TextInput
                    label="Nombre completo"
                    placeholder="Juan Pérez"
                    required
                    {...form.getInputProps('name')}
                  />
                  <TextInput
                    label="Email corporativo"
                    placeholder="juan@empresa.com"
                    required
                    type="email"
                    {...form.getInputProps('email')}
                  />
                  <TextInput
                    label="Empresa"
                    placeholder="Mi Empresa S.A."
                    required
                    {...form.getInputProps('company')}
                  />
                  <Textarea
                    label="Mensaje"
                    placeholder="Contanos sobre tu empresa y tus necesidades..."
                    required
                    minRows={4}
                    {...form.getInputProps('message')}
                  />
                  <Button
                    type="submit"
                    size="lg"
                    className="mt-4 w-full bg-blue-600 hover:bg-blue-700"
                  >
                    Enviar mensaje
                  </Button>

                  {submitted && (
                    <Text c="green" size="sm" ta="center" mt="md">
                      ¡Gracias! Nos pondremos en contacto pronto.
                    </Text>
                  )}
                </Stack>
              </form>
            </motion.div>
          </Box>
        </motion.div>
      </Container>
    </section>
  );
};
