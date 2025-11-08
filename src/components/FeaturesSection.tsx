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
    title: 'Diagnóstico inicial',
    description:
      'Entendemos cómo funciona tu empresa hoy, qué problemas existen y dónde están las oportunidades de mejora.',
  },
  {
    icon: (
      <IconCurrencyDollar size={40} stroke={1.5} className="text-blue-600" />
    ),
    title: 'Implementación de nuestra herramienta online',
    description:
      'Centralizamos licencias, ausencias, horas trabajadas, recibos de sueldo, datos del personal, uniformes y mucho más.',
  },
  {
    icon: <IconMessages size={40} stroke={1.5} className="text-blue-600" />,
    title: 'Visitas mensuales (opcionales)',
    description:
      'Acompañamos a tu equipo en persona, resolvemos dudas, revisamos avances y proponemos mejoras continuas.',
  },
  {
    icon: <IconChartBar size={40} stroke={1.5} className="text-blue-600" />,
    title: 'Procesos claros y a medida',
    description:
      'Diseñamos políticas, reportes, encuestas y evaluaciones de desempeño que se ajustan a la realidad de tu empresa.',
  },
];

export const FeaturesSection: React.FC = () => {
  return (
    <section id="features" className="py-24 bg-white">
      <Container size="xl">
        <Stack align="center" gap="xl" mb={60}>
          <Title order={2} size="2.5rem" fw={700} className="text-center">
            ¿Qué ofrecemos?
          </Title>
          <Text size="lg" c="dimmed" className="text-center max-w-3xl">
            Herramientas y procesos a medida para que tu empresa gane en claridad, 
            previsibilidad y cultura organizacional.
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
                  className="h-full flex flex-col hover:shadow-xl transition-shadow"
                  style={{ minHeight: '300px' }}
                >
                  <Stack gap="md" className="h-full">
                    <div className="bg-blue-50 w-16 h-16 rounded-lg flex items-center justify-center flex-shrink-0">
                      {feature.icon}
                    </div>
                    <Title order={3} size="h4" fw={600} className="flex-shrink-0">
                      {feature.title}
                    </Title>
                    <Text size="sm" c="dimmed" className="flex-grow">
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
