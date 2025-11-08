import React from 'react';
import { Container, Title, Text, Stack, Grid, Card } from '@mantine/core';
import { motion } from 'framer-motion';
import {
  IconDeviceLaptop,
  IconSchool,
  IconHeartHandshake,
  IconTrendingUp,
} from '@tabler/icons-react';

interface Method {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const methods: Method[] = [
  {
    icon: <IconDeviceLaptop size={40} stroke={1.5} className="text-blue-600" />,
    title: 'Herramienta online simple y práctica',
    description:
      'Accesible desde cualquier dispositivo, para que puedas gestionar tu equipo donde estés.',
  },
  {
    icon: <IconSchool size={40} stroke={1.5} className="text-blue-600" />,
    title: 'Implementación y capacitación',
    description:
      'Acompañándote para que vos y tu equipo se adapten fácilmente.',
  },
  {
    icon: <IconHeartHandshake size={40} stroke={1.5} className="text-blue-600" />,
    title: 'Seguimiento cercano',
    description:
      'A través de visitas y contacto directo, para que nunca sientas que estás solo.',
  },
  {
    icon: <IconTrendingUp size={40} stroke={1.5} className="text-blue-600" />,
    title: 'Enfoque flexible',
    description:
      'Que crece y se adapta junto a tu empresa.',
  },
];

export const HowWeDoItSection: React.FC = () => {
  return (
    <section className="py-24 bg-gradient-to-br from-blue-50 to-white">
      <Container size="xl">
        <Stack align="center" gap="xl" mb={60}>
          <Title order={2} size="2.5rem" fw={700} className="text-center">
            ¿Cómo lo <span className="text-blue-600">hacemos</span>?
          </Title>
          <Text size="lg" c="dimmed" className="text-center max-w-3xl">
            Con un enfoque integral que combina tecnología, acompañamiento y flexibilidad.
          </Text>
        </Stack>

        <Grid gutter="xl">
          {methods.map((method, index) => (
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
                  className="h-full flex flex-col hover:shadow-xl transition-shadow bg-white"
                  style={{ minHeight: '300px' }}
                >
                  <Stack gap="md" className="h-full">
                    <div className="bg-blue-50 w-16 h-16 rounded-lg flex items-center justify-center flex-shrink-0">
                      {method.icon}
                    </div>
                    <Title order={3} size="h4" fw={600} className="flex-shrink-0">
                      {method.title}
                    </Title>
                    <Text size="sm" c="dimmed" className="flex-grow">
                      {method.description}
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
