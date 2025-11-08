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
    <section className="bg-gradient-to-br from-blue-50 to-white py-24">
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
              Gestión de Recursos Humanos{' '}
              <span className="text-blue-600">Simplificada</span>
            </Title>
            <Text size="xl" c="dimmed" className="max-w-2xl">
              Talento+ es la solución integral diseñada para pequeñas y medianas
              empresas que buscan profesionalizar su gestión de talento humano
              sin complicaciones.
            </Text>
            <Button
              size="xl"
              radius="md"
              onClick={scrollToContact}
              className="mt-4"
            >
              Solicitar Demo Gratuita
            </Button>
          </Stack>
        </motion.div>
      </Container>
    </section>
  );
};
