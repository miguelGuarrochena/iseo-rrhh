import React from 'react';
import { Accordion } from '@mantine/core';
import { motion } from 'framer-motion';

interface QA {
  q: string;
  a: string;
}

const faqs: QA[] = [
  {
    q: '¿Necesito tener un área de RRHH para contratar el servicio?',
    a: 'No. Justamente trabajamos con pequeñas y medianas empresas que no cuentan con un área de Recursos Humanos. Nos convertimos en ese área para vos, sin que tengas que sumarla a tu estructura.',
  },
  {
    q: '¿Cómo empieza el trabajo?',
    a: 'Siempre arrancamos con un diagnóstico inicial: entendemos cómo funciona tu empresa hoy, qué problemas existen y dónde están las oportunidades de mejora. A partir de ahí diseñamos una solución a medida.',
  },
  {
    q: '¿Qué incluye la herramienta online?',
    a: 'Centralizamos licencias, ausencias, horas trabajadas, recibos de sueldo, datos del personal, uniformes y mucho más. Todo accesible desde cualquier dispositivo.',
  },
  {
    q: '¿Las visitas presenciales son obligatorias?',
    a: 'Son opcionales. Cuando las incluís, acompañamos a tu equipo en persona, resolvemos dudas, revisamos avances y proponemos mejoras continuas.',
  },
  {
    q: '¿El servicio se adapta a mi empresa?',
    a: 'Sí. Cada empresa es distinta, por eso trabajamos con un enfoque flexible: diseñamos políticas, reportes, encuestas y evaluaciones que se ajustan a tu realidad y crecen junto a tu empresa.',
  },
];

export const FaqSection: React.FC = () => {
  return (
    <section id="faq" className="bg-white py-24">
      <div className="mx-auto max-w-3xl px-5 text-center">
        <span className="text-sm font-bold uppercase tracking-widest text-brand-600">
          Preguntas frecuentes
        </span>
        <h2 className="text-balance mt-3 text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
          Lo que solés preguntarte
        </h2>
        <p className="mt-4 text-lg text-ink-soft">
          Si te queda alguna duda, escribinos y la resolvemos sin compromiso.
        </p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="mx-auto mt-12 max-w-3xl px-5"
      >
        <Accordion
          variant="separated"
          radius="lg"
          chevronPosition="right"
          defaultValue="0"
          styles={{
            item: {
              backgroundColor: 'var(--mantine-color-white)',
              border: '1px solid #E8E6E0',
              marginBottom: '0.75rem',
            },
            control: { paddingTop: '1.1rem', paddingBottom: '1.1rem' },
            label: { fontWeight: 700, color: '#17161A', fontSize: '1.05rem' },
            content: {
              color: '#5C5A63',
              fontSize: '0.975rem',
              lineHeight: 1.6,
            },
          }}
        >
          {faqs.map((item, i) => (
            <Accordion.Item key={i} value={String(i)}>
              <Accordion.Control>{item.q}</Accordion.Control>
              <Accordion.Panel>{item.a}</Accordion.Panel>
            </Accordion.Item>
          ))}
        </Accordion>
      </motion.div>
    </section>
  );
};
