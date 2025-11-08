import React from 'react';
import { Container, Group, Button } from '@mantine/core';
import { Logo } from './Logo';

export const Header: React.FC = () => {
  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <header className="sticky top-0 z-50 bg-white shadow-sm">
      <Container size="xl" py="md">
        <Group justify="space-between" align="center">
          <Logo width={160} height={48} />
          <Group gap="md">
            <Button
              variant="subtle"
              onClick={() => scrollToSection('features')}
            >
              Características
            </Button>
            <Button variant="subtle" onClick={() => scrollToSection('about')}>
              Nosotros
            </Button>
            <Button variant="filled" onClick={() => scrollToSection('contact')}>
              Solicitar Demo
            </Button>
          </Group>
        </Group>
      </Container>
    </header>
  );
};
