import React from 'react';
import { Container, Text } from '@mantine/core';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-gray-900 text-white py-6">
      <Container size="xl">
        <Text size="sm" c="dimmed" ta="center">
          © {new Date().getFullYear()} ISEO RH. Todos los derechos reservados.
        </Text>
      </Container>
    </footer>
  );
};
