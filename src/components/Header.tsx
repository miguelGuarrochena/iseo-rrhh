'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Burger, Drawer, Stack } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Logo } from './Logo';
import { plataformaLanzada } from '@/lib/lanzamiento';

interface NavLink {
  label: string;
  id: string;
}

const links: NavLink[] = [
  { label: '¿Qué ofrecemos?', id: 'features' },
  { label: 'La plataforma', id: 'producto' },
  { label: '¿Por qué elegirnos?', id: 'about' },
];

const mostrarIngreso = plataformaLanzada;

export const Header: React.FC = () => {
  const [opened, { toggle, close }] = useDisclosure(false);
  const [active, setActive] = useState('');
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
      setActive(id);
      close();
    }
  };

  const goTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setActive('');
    close();
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex justify-center px-3 pt-3 sm:pt-4">
      <nav
        className={`flex w-full max-w-7xl items-center justify-between rounded-2xl border py-2 pl-4 pr-2 sm:pl-5 transition-all duration-300 ${
          scrolled
            ? 'border-line bg-white/85 shadow-soft backdrop-blur-md'
            : 'border-transparent bg-white/55 backdrop-blur-sm'
        }`}
      >
        <button
          onClick={goTop}
          aria-label="Ir al inicio"
          className="cursor-pointer border-0 bg-transparent transition-opacity hover:opacity-80"
        >
          <Logo size="sm" />
        </button>

        {/* Navegación desktop */}
        <div className="hidden items-center gap-1 lg:flex">
          {links.map((link) => (
            <button
              key={link.id}
              onClick={() => scrollToSection(link.id)}
              className={`cursor-pointer rounded-lg border-0 bg-transparent px-4 py-2 text-[0.95rem] font-medium transition-colors ${
                active === link.id
                  ? 'text-ink'
                  : 'text-ink-soft hover:bg-paper hover:text-ink'
              }`}
            >
              {link.label}
            </button>
          ))}
        </div>

        {/* CTA + burger */}
        <div className="flex items-center gap-2">
          {mostrarIngreso && (
            <Link
              href="/login"
              className="hidden rounded-xl border border-line bg-white px-5 py-2.5 text-[0.95rem] font-semibold text-ink no-underline transition-colors hover:border-brand-600 hover:text-brand-600 sm:inline-block"
            >
              Ingresar
            </Link>
          )}
          <button
            onClick={() => scrollToSection('contact')}
            className="hidden cursor-pointer rounded-xl border-0 bg-ink px-5 py-2.5 text-[0.95rem] font-semibold text-white transition-colors hover:bg-brand-600 sm:inline-block"
          >
            Contactanos
          </button>
          <Burger
            opened={opened}
            onClick={toggle}
            className="mr-1 block lg:hidden"
            size="sm"
            aria-label="Abrir menú"
          />
        </div>
      </nav>

      {/* Drawer mobile */}
      <Drawer
        opened={opened}
        onClose={close}
        position="top"
        size="auto"
        padding={0}
        withCloseButton={false}
        className="block lg:hidden"
        overlayProps={{ backgroundOpacity: 0.35, blur: 2 }}
        styles={{
          content: {
            backgroundColor: 'var(--mantine-color-white)',
            borderRadius: '0 0 24px 24px',
          },
        }}
      >
        <div className="px-6 pb-8 pt-24">
          <Stack gap="xs">
            {links.map((link) => (
              <button
                key={link.id}
                onClick={() => scrollToSection(link.id)}
                className="w-full cursor-pointer rounded-2xl border-0 bg-paper px-5 py-4 text-left text-lg font-semibold text-ink transition-colors hover:bg-line"
              >
                {link.label}
              </button>
            ))}
            <button
              onClick={() => scrollToSection('contact')}
              className="mt-2 w-full cursor-pointer rounded-2xl border-0 bg-ink px-5 py-4 text-center text-lg font-semibold text-white transition-colors hover:bg-brand-600"
            >
              Contactanos
            </button>
            {mostrarIngreso && (
              <Link
                href="/login"
                onClick={close}
                className="w-full rounded-2xl border border-line bg-white px-5 py-4 text-center text-lg font-semibold text-ink no-underline transition-colors hover:border-brand-600 hover:text-brand-600"
              >
                Ingresar
              </Link>
            )}
          </Stack>
        </div>
      </Drawer>
    </header>
  );
};
