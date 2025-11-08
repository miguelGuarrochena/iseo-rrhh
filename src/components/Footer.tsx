import React from 'react';
import { Container, Group, Text, Anchor, Stack } from '@mantine/core';
import { Logo } from './Logo';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-gray-900 text-white py-12">
      <Container size="xl">
        <Stack gap="xl">
          <Group justify="space-between" align="flex-start">
            <Stack gap="md">
              <Logo width={160} height={48} />
              <Text size="sm" c="dimmed" className="max-w-xs">
                Simplificando la gestión de recursos humanos para empresas de
                todos los tamaños.
              </Text>
            </Stack>
            <Group gap="xl">
              <Stack gap="sm">
                <Text fw={600} size="sm">
                  Producto
                </Text>
                <Anchor href="#features" c="dimmed" size="sm">
                  Características
                </Anchor>
                <Anchor href="#about" c="dimmed" size="sm">
                  Nosotros
                </Anchor>
                <Anchor href="#contact" c="dimmed" size="sm">
                  Contacto
                </Anchor>
              </Stack>
              <Stack gap="sm">
                <Text fw={600} size="sm">
                  Legal
                </Text>
                <Anchor href="#" c="dimmed" size="sm">
                  Privacidad
                </Anchor>
                <Anchor href="#" c="dimmed" size="sm">
                  Términos
                </Anchor>
              </Stack>
            </Group>
          </Group>
          <div className="border-t border-gray-800 pt-6">
            <Text size="sm" c="dimmed" ta="center">
              © {new Date().getFullYear()} Talento+. Todos los derechos
              reservados.
            </Text>
          </div>
        </Stack>
      </Container>
    </footer>
  );
};
