import React, { useState } from 'react';
import {
  Container,
  Title,
  Text,
  Stack,
  TextInput,
  Textarea,
  Button,
  Grid,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { motion } from 'framer-motion';

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

  const handleSubmit = (values: ContactFormValues) => {
    console.log('Form submitted:', values);
    setSubmitted(true);
    form.reset();
    setTimeout(() => setSubmitted(false), 5000);
  };

  return (
    <section id="contact" className="py-24 bg-white">
      <Container size="xl">
        <Grid gutter="xl">
          <Grid.Col span={{ base: 12, md: 5 }}>
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <Stack gap="lg">
                <Title order={2} size="2.5rem" fw={700}>
                  Solicita una{' '}
                  <span className="text-blue-600">Demo Gratuita</span>
                </Title>
                <Text size="lg" c="dimmed">
                  ¿Listo para transformar la gestión de recursos humanos en tu
                  empresa? Completa el formulario y uno de nuestros expertos se
                  pondrá en contacto contigo.
                </Text>
                <Text size="md" c="dimmed">
                  📧 contacto@talentoplus.com
                  <br />
                  📞 +54 11 1234-5678
                  <br />
                  📍 Buenos Aires, Argentina
                </Text>
              </Stack>
            </motion.div>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 7 }}>
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
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
                    placeholder="Cuéntanos sobre tu empresa y tus necesidades..."
                    required
                    minRows={4}
                    {...form.getInputProps('message')}
                  />
                  <Button type="submit" size="lg" fullWidth>
                    Enviar Solicitud
                  </Button>
                  {submitted && (
                    <Text c="green" size="sm" ta="center">
                      ¡Gracias! Nos pondremos en contacto pronto.
                    </Text>
                  )}
                </Stack>
              </form>
            </motion.div>
          </Grid.Col>
        </Grid>
      </Container>
    </section>
  );
};
