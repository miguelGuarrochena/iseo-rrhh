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
              <Stack gap="lg">
                <Title order={2} size="2.5rem" fw={700}>
                  Sobre <span className="text-blue-600">Talento+</span>
                </Title>
                <Text size="lg" c="dimmed">
                  Entendemos los desafíos que enfrentan las pequeñas y medianas
                  empresas al gestionar su talento humano. Por eso creamos
                  Talento+, una plataforma intuitiva y completa que centraliza
                  todos los procesos de RRHH en un solo lugar.
                </Text>
                <Text size="lg" c="dimmed">
                  Desde el reclutamiento hasta la evaluación de desempeño,
                  pasando por la gestión de nóminas y beneficios, Talento+ te
                  acompaña en cada etapa del ciclo de vida del empleado.
                </Text>
                <Text size="lg" c="dimmed">
                  Nuestra misión es democratizar el acceso a herramientas
                  profesionales de RRHH, permitiendo que empresas de todos los
                  tamaños puedan atraer, desarrollar y retener el mejor talento.
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
              className="bg-gradient-to-br from-blue-100 to-blue-50 rounded-2xl p-12 h-96 flex items-center justify-center"
            >
              <Text size="xl" fw={600} c="blue" className="text-center">
                Más de 500 empresas confían en Talento+ para gestionar su
                talento humano
              </Text>
            </motion.div>
          </Grid.Col>
        </Grid>
      </Container>
    </section>
  );
};
