'use client';

import React from 'react';
import { IconBrandWhatsapp, IconMail } from '@tabler/icons-react';

const navLinks = [
  { label: '¿Qué ofrecemos?', id: 'features' },
  { label: '¿Por qué elegirnos?', id: 'about' },
  { label: 'Contacto', id: 'contact' },
];

export const Footer: React.FC = () => {
  const scrollTo = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });

  return (
    <footer className="bg-paper px-2 pb-2 pt-2 sm:px-3">
      <div className="mx-auto max-w-7xl">
        <div className="rounded-2xl bg-ink/90 px-6 py-6 text-white sm:px-10">
          <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:justify-between sm:gap-6 sm:text-left">
            {/* Marca */}
            <p className="text-lg font-extrabold tracking-tight text-white">
              ISEO <span className="text-brand-400">RH</span>
            </p>

            {/* Navegación */}
            <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
              {navLinks.map((link) => (
                <button
                  key={link.id}
                  onClick={() => scrollTo(link.id)}
                  className="cursor-pointer border-0 bg-transparent p-0 text-sm text-white/70 transition-colors hover:text-white"
                >
                  {link.label}
                </button>
              ))}
            </nav>

            {/* Contacto */}
            <div className="flex items-center gap-4">
              <a
                href="https://wa.me/5491154018969"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="WhatsApp"
                className="text-white/70 transition-colors hover:text-white"
              >
                <IconBrandWhatsapp size={20} />
              </a>
              <a
                href="mailto:info@iseo-rh.com"
                aria-label="Email"
                className="text-white/70 transition-colors hover:text-white"
              >
                <IconMail size={20} />
              </a>
            </div>
          </div>

          <div className="mt-5 border-t border-white/10 pt-4 text-center">
            <p className="text-xs text-white/40">
              © {new Date().getFullYear()} ISEO RH. Todos los derechos
              reservados.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
};
