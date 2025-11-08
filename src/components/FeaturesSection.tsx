import React from 'react';
import { Container, Title, Text, Grid, Card, Stack } from '@mantine/core';
import {
  IconRobot,
  IconCurrencyDollar,
  IconMessages,
  IconChartBar,
} from '@tabler/icons-react';
import { motion } from 'framer-motion';

interface Feature {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const features: Feature[] = [
  {
    icon: <IconRobot size={40} stroke={1.5} className="text-blue-600" />,
    title: 'Automatiza Procesos',
    description:
      'Elimina tareas repetitivas y ahorra tiempo con flujos de trabajo automatizados para onboarding, evaluaciones y más.',
  },
  {
    icon: (
      <IconCurrencyDollar size={40} stroke={1.5} className="text-blue-600" />
    ),
    title: 'Reduce Costos',
    description:
      'Optimiza recursos y reduce gastos operativos con una plataforma todo-en-uno que reemplaza múltiples herramientas.',
  },
  {
    icon: <IconMessages size={40} stroke={1.5} className="text-blue-600" />,
    title: 'Mejora la Comunicación',
    description:
      'Centraliza la información y facilita la comunicación entre equipos con notificaciones y mensajería integrada.',
  },
  {
    icon: <IconChartBar size={40} stroke={1.5} className="text-blue-600" />,
    title: 'Analítica en Tiempo Real',
    description:
      'Toma decisiones informadas con reportes y dashboards que muestran métricas clave de tu equipo.',
  },
];

export const FeaturesSection: React.FC = () => {
  return (
    <section id="features" className="py-24 bg-white">
      <Container size="xl">
        <Stack align="center" gap="xl" mb={60}>
          <Title order={2} size="2.5rem" fw={700} className="text-center">
            ¿Por qué elegir <span className="text-blue-600">Talento+</span>?
          </Title>
          <Text size="lg" c="dimmed" className="text-center max-w-2xl">
            Descubre cómo nuestra plataforma puede transformar la gestión de
            recursos humanos en tu empresa.
          </Text>
        </Stack>

        <Grid gutter="xl">
          {features.map((feature, index) => (
            <Grid.Col key={index} span={{ base: 12, sm: 6, md: 3 }}>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                <Card
                  shadow="md"
                  radius="lg"
                  p="xl"
                  className="h-full hover:shadow-xl transition-shadow"
                >
                  <Stack gap="md">
                    <div className="bg-blue-50 w-16 h-16 rounded-lg flex items-center justify-center">
                      {feature.icon}
                    </div>
                    <Title order={3} size="h4" fw={600}>
                      {feature.title}
                    </Title>
                    <Text size="sm" c="dimmed">
                      {feature.description}
                    </Text>
                  </Stack>
                </Card>
              </motion.div>
            </Grid.Col>
          ))}
        </Grid>
      </Container>
    </section>
  );
};
