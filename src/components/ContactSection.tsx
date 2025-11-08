import React, { useState } from 'react';
import { Container, Title, Text, Stack } from '@mantine/core';
import { motion } from 'framer-motion';
import {
  IconBrandWhatsapp,
  IconPhone,
  IconMail,
  IconCopy,
  IconCheck,
} from '@tabler/icons-react';

export const ContactSection: React.FC = () => {
  const [emailCopied, setEmailCopied] = useState(false);

  return (
    <section id="contact" className="py-16 bg-white">
      <Container size="md" className="py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
        >
          <Stack gap="xl" align="center" className="text-center px-4">
            <Title
              order={2}
              size="2.5rem"
              fw={700}
              className="text-gray-900 text-3xl sm:text-4xl leading-tight"
            >
              ¿Listo para organizar tu empresa?
            </Title>

            <div className="flex flex-col sm:flex-row flex-wrap justify-start sm:justify-center items-start sm:items-center gap-4 sm:gap-8 mt-4 text-gray-700 w-full max-w-4xl mx-auto px-4 sm:px-0">
              {/* WhatsApp */}
              <div className="w-full sm:w-auto flex items-center">
                <IconBrandWhatsapp
                  size={28}
                  className="text-green-500 flex-shrink-0 mr-2"
                />
                <a
                  href="https://wa.me/5491154018969?text=Hola%20ISEO%20RH%2C%20me%20interesar%C3%ADa%20conocer%20m%C3%A1s%20sobre%20sus%20servicios%20de%20Recursos%20Humanos.%20%C2%A1Gracias!"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-green-600 transition-colors no-underline group"
                  title="Escribinos por WhatsApp"
                >
                  <span className="text-current group-hover:underline">
                    WhatsApp
                  </span>
                </a>
              </div>

              {/* Divider - Solo visible en pantallas grandes */}
              <div className="hidden sm:block h-6 w-px bg-gray-300"></div>

              {/* Teléfono */}
              <div className="w-full sm:w-auto flex items-center">
                <IconPhone
                  size={28}
                  className="text-blue-500 flex-shrink-0 mr-2"
                />
                <a
                  href="tel:+5491154018969"
                  className="hover:text-blue-600 transition-colors no-underline"
                  title="Llamanos"
                >
                  <span className="text-current">+54 9 11 5401-8969</span>
                </a>
              </div>

              {/* Divider - Solo visible en pantallas grandes */}
              <div className="hidden sm:block h-6 w-px bg-gray-300"></div>

              {/* Email */}
              <div className="w-full sm:w-auto flex items-center">
                <IconMail
                  size={28}
                  className="text-red-500 flex-shrink-0 mr-2"
                />
                <div className="flex items-center">
                  <span className="text-current">pguarrochena@gmail.com</span>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      navigator.clipboard.writeText('pguarrochena@gmail.com');
                      setEmailCopied(true);
                      setTimeout(() => setEmailCopied(false), 2000);
                    }}
                    className="text-gray-400 hover:text-gray-600 transition-colors p-0.5 -mr-1.5 border-0 bg-transparent focus:outline-none focus:ring-0 focus:shadow-none relative cursor-pointer"
                    style={{
                      WebkitAppearance: 'none',
                      MozAppearance: 'none',
                      appearance: 'none',
                    }}
                    aria-label="Copiar correo electrónico"
                    title="Copiar al portapapeles"
                  >
                    <IconCopy size={16} className="mt-0.5" />
                    {emailCopied && (
                      <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-xs rounded py-1 px-2 whitespace-nowrap flex items-center gap-1">
                        <IconCheck size={14} />
                        ¡Copiado!
                        <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2 w-2 h-2 bg-gray-800 rotate-45"></div>
                      </div>
                    )}
                  </button>
                </div>
              </div>
            </div>

            <Text size="xl" c="dimmed" className="max-w-2xl mt-8">
              responderemos a la brevedad.
            </Text>
          </Stack>

          {/* Formulario deshabilitado por ahora
          <Box className="mt-8 max-w-2xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              viewport={{ once: true }}
            >
              <form onSubmit={form.onSubmit(handleSubmit)}>
                <Stack gap="md">
                  <TextInput
                    label="Nombre completo"
                    placeholder="Juan Pérez"
                    required
                    {...form.getInputProps('name')}
                  />
                  <TextInput
                    label="Email corporativo"
                    placeholder="juan@empresa.com"
                    required
                    type="email"
                    {...form.getInputProps('email')}
                  />
                  <TextInput
                    label="Empresa"
                    placeholder="Mi Empresa S.A."
                    required
                    {...form.getInputProps('company')}
                  />
                  <Textarea
                    label="Mensaje"
                    placeholder="Contanos sobre tu empresa y tus necesidades..."
                    required
                    minRows={4}
                    {...form.getInputProps('message')}
                  />
                  <Button
                    type="submit"
                    size="lg"
                    className="mt-4 w-full bg-blue-600 hover:bg-blue-700"
                  >
                    Enviar mensaje
                  </Button>

                  {submitted && (
                    <Text c="green" size="sm" ta="center" mt="md">
                      ¡Gracias! Nos pondremos en contacto pronto.
                    </Text>
                  )}
                </Stack>
              </form>
            </motion.div>
          </Box>
          */}
        </motion.div>
      </Container>
    </section>
  );
};
