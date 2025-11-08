import React from 'react';
import { Container, Title, Text, Button, Stack } from '@mantine/core';
import { motion } from 'framer-motion';

export const HeroSection: React.FC = () => {
  const scrollToContact = () => {
    const element = document.getElementById('contact');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section className="bg-gradient-to-br from-blue-50 to-white pt-36 pb-24">
      <Container size="xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <Stack align="center" gap="xl" className="text-center">
            <Title
              order={1}
              size="3.5rem"
              fw={700}
              className="text-gray-900 max-w-4xl"
            >
              Organizá tu empresa y tu equipo con nuestro servicio de{' '}
              <span className="text-blue-600">Recursos Humanos</span>
            </Title>
            <Text size="xl" c="dimmed" className="max-w-3xl">
              Muchas pequeñas y medianas empresas no cuentan con un área de
              Recursos Humanos, pero igualmente necesitan orden, procesos claros
              y una mirada profesional que les permita crecer sin perder el
              control de su equipo.
            </Text>
            <Text size="lg" c="dimmed" className="max-w-3xl">
              Nuestro servicio está pensado justamente para eso: ser tu aliado
              en la gestión y organización del personal, creando herramientas y
              procesos a medida para que tu empresa gane en claridad,
              previsibilidad y cultura organizacional.
            </Text>
            <Button
              size="xl"
              radius="md"
              onClick={scrollToContact}
              className="mt-4"
            >
              Contactanos
            </Button>
          </Stack>
        </motion.div>
      </Container>
    </section>
  );
};
