'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  IconBrandWhatsapp,
  IconMail,
  IconCopy,
  IconCheck,
} from '@tabler/icons-react';

const WHATSAPP_URL =
  'https://wa.me/5491154018969?text=Hola%20ISEO%20RH%2C%20me%20interesar%C3%ADa%20conocer%20m%C3%A1s%20sobre%20sus%20servicios%20de%20Recursos%20Humanos.%20%C2%A1Gracias!';
const EMAIL = 'info@iseo-rh.com';

export const ContactSection: React.FC = () => {
  const [emailCopied, setEmailCopied] = useState(false);

  const copyEmail = () => {
    navigator.clipboard.writeText(EMAIL);
    setEmailCopied(true);
    setTimeout(() => setEmailCopied(false), 2000);
  };

  return (
    <section id="contact" className="bg-paper px-2 py-2 sm:px-3">
      <div className="mx-auto max-w-7xl">
        {/* Bloque */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="relative overflow-hidden rounded-2xl bg-brand-600 px-6 py-16 text-center sm:px-12 sm:py-20"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -left-20 -top-24 h-72 w-72 rounded-full bg-white/20 blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-24 -right-16 h-72 w-72 rounded-full bg-brand-900/40 blur-3xl"
          />

          <div className="relative mx-auto max-w-2xl">
            <h2 className="text-balance text-4xl font-extrabold leading-tight text-white sm:text-5xl">
              ¿Listo para organizar tu empresa?
            </h2>

            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-7 py-3.5 text-base font-semibold text-ink no-underline transition-transform hover:scale-[1.02] sm:w-auto"
              >
                <IconBrandWhatsapp size={20} className="text-green-600" />
                WhatsApp
              </a>

              <div className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/30 bg-white/10 px-6 py-3.5 text-base font-semibold text-white sm:w-auto">
                <IconMail size={20} />
                <span>{EMAIL}</span>
                <button
                  onClick={copyEmail}
                  aria-label="Copiar correo electrónico"
                  title="Copiar al portapapeles"
                  className="relative ml-1 cursor-pointer border-0 bg-transparent p-0.5 text-white/70 transition-colors hover:text-white"
                >
                  {emailCopied ? (
                    <IconCheck size={18} />
                  ) : (
                    <IconCopy size={18} />
                  )}
                  {emailCopied && (
                    <span className="absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs text-white">
                      ¡Copiado!
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};
