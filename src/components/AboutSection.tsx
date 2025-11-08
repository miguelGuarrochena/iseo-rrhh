import React from 'react';
import { Container, Title, Text, Stack, Grid } from '@mantine/core';
import { motion } from 'framer-motion';

export const AboutSection: React.FC = () => {
  return (
    <section id="about" className="py-24 bg-gray-50">
      <Container size="xl">
        <Grid gutter="xl" align="center">
          <Grid.Col span={{ base: 12, md: 6 }}>
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <Stack gap="lg" className="px-4 sm:px-0">
                <Title
                  order={2}
                  size="2.5rem"
                  fw={700}
                  className="text-center sm:text-left text-3xl sm:text-4xl"
                >
                  ¿Por qué <span className="text-blue-600">elegirnos</span>?
                </Title>
                <Text size="lg" c="dimmed">
                  Porque transformamos el desorden en claridad.
                </Text>
                <Text size="lg" c="dimmed">
                  ✓ Tenés un área de RRHH profesional sin sumarlo a tu
                  estructura.
                </Text>
                <Text size="lg" c="dimmed">
                  ✓ Ahorrás tiempo y evitás errores administrativos.
                </Text>
                <Text size="lg" c="dimmed">
                  ✓ Lográs procesos claros y previsibles que mejoran la
                  comunicación interna.
                </Text>
                <Text size="lg" c="dimmed">
                  ✓ Contás con diagnóstico, visitas mensuales y un servicio
                  adaptado a tu empresa.
                </Text>
                <Text size="lg" c="dimmed">
                  ✓ Usás una herramienta práctica y online, respaldada por
                  nuestro acompañamiento humano.
                </Text>
              </Stack>
            </motion.div>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 6 }}>
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="bg-gradient-to-br from-blue-100 to-blue-50 rounded-2xl p-8 sm:p-12 w-full md:min-h-[400px] lg:min-h-[450px] flex items-center"
            >
              <Stack gap="md" className="text-center w-full">
                <Text size="xl" fw={700} c="blue">
                  Tu empresa, con orden y claridad
                </Text>
                <Text size="md" c="dimmed">
                  Nuestro objetivo es que sientas que tenés un área de Recursos
                  Humanos propio, sin necesidad de sumarlo a tu estructura.
                </Text>
                <Text size="md" c="dimmed">
                  Cada empresa es distinta, y por eso trabajamos con un
                  diagnóstico personalizado y soluciones concretas, para que tu
                  equipo trabaje mejor, se comunique mejor y vos tengas siempre
                  información confiable para decidir.
                </Text>
              </Stack>
            </motion.div>
          </Grid.Col>
        </Grid>
      </Container>
    </section>
  );
};
