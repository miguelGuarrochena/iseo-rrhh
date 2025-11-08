import React, { useState } from 'react';
import {
  Container,
  Group,
  Button,
  Burger,
  Drawer,
  Stack,
  Box,
  CloseButton,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Logo } from './Logo';

export const Header: React.FC = () => {
  const [opened, { toggle, close }] = useDisclosure(false);
  const [active, setActive] = useState('home');

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
      setActive(id);
      close();
    }
  };

  const links = [
    { label: '¿Qué ofrecemos?', id: 'features' },
    { label: '¿Por qué elegirnos?', id: 'about' },
    { label: 'Contacto', id: 'contact', variant: 'filled' as const },
  ];

  const menuItems = links.map((link) => (
    <Button
      key={link.id}
      variant={link.variant || 'subtle'}
      onClick={() => scrollToSection(link.id)}
      className={`${active === link.id ? 'text-blue-600' : ''} w-full sm:w-auto text-center sm:text-left`}
      fullWidth
    >
      {link.label}
    </Button>
  ));

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm shadow-sm w-full">
      <Container size="xl" className="w-full h-full px-0">
        <Group
          justify="space-between"
          align="center"
          className="h-20 px-4 sm:px-6"
        >
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="hover:opacity-80 transition-opacity"
          >
            <Logo className="ml-0" />
          </a>

          {/* Desktop Navigation */}
          <Group gap="md" className="hidden sm:flex">
            {menuItems}
          </Group>

          {/* Mobile Burger Button */}
          <Burger
            opened={opened}
            onClick={toggle}
            className="block sm:hidden absolute right-4"
            size="md"
            aria-label="Toggle navigation"
          />
        </Group>
      </Container>

      {/* Mobile Drawer */}
      <Drawer
        opened={opened}
        onClose={close}
        position="top"
        size="auto"
        padding={0}
        className="block sm:hidden"
        withCloseButton={false}
        styles={{
          content: {
            backgroundColor: 'var(--mantine-color-white)',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
            borderRadius: '0 0 12px 12px',
            marginTop: 'var(--mantine-header-height, 0)',
          },
          body: {
            padding: '1.5rem 0 2rem 0',
          },
        }}
      >
        <div className="relative w-full">
          <div className="flex justify-end w-full px-6 pt-2">
            <CloseButton
              onClick={close}
              size="lg"
              className="text-gray-500 hover:bg-gray-100"
              aria-label="Cerrar menú"
            />
          </div>
          <Box className="w-full px-6 pb-2">
            <Stack gap="lg" align="stretch">
              {menuItems}
            </Stack>
          </Box>
        </div>
      </Drawer>
    </header>
  );
};
