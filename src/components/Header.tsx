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
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm shadow-sm w-full">
      <Container size="xl" className="w-full h-full">
        <Group justify="space-between" align="center" className="h-20">
          <a 
            href="#" 
            onClick={(e) => {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="hover:opacity-80 transition-opacity"
          >
            <Logo width={240} height={72} />
          </a>
          <Group gap="md">
            <Button
              variant="subtle"
              onClick={() => scrollToSection('features')}
            >
              ¿Qué ofrecemos?
            </Button>
            <Button variant="subtle" onClick={() => scrollToSection('about')}>
              ¿Por qué elegirnos?
            </Button>
            <Button variant="filled" onClick={() => scrollToSection('contact')}>
              Contacto
            </Button>
          </Group>
        </Group>
      </Container>
    </header>
  );
};
