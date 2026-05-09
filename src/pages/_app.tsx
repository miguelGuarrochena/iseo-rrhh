import { MantineProvider } from '@mantine/core';
import { AppProps } from 'next/app';
import Head from 'next/head';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { Analytics } from '@vercel/analytics/next';
import { theme } from '@/theme/theme';
import '@mantine/core/styles.css';
import '@/styles/globals.css';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://iseo-rh.com';
const SITE_TITLE = 'ISEO RH — Recursos Humanos para PyMEs';
const SITE_DESCRIPTION =
  'ISEO RH es tu aliado en la gestión y organización del personal. Diagnóstico, herramienta online, visitas programadas y procesos a medida para que tu empresa gane en claridad, previsibilidad y cultura organizacional.';
const OG_IMAGE = `${SITE_URL}/og-image.svg`;

// Datos estructurados schema.org para que Google entienda
// que ISEO RH es un servicio profesional con datos de contacto.
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'ProfessionalService',
  name: 'ISEO RH',
  alternateName: 'ISEO Recursos Humanos',
  description: SITE_DESCRIPTION,
  url: SITE_URL,
  logo: `${SITE_URL}/logo.svg`,
  image: OG_IMAGE,
  email: 'pguarrochena@gmail.com',
  telephone: '+54-9-11-5401-8969',
  areaServed: { '@type': 'Country', name: 'Argentina' },
  serviceType: [
    'Recursos Humanos',
    'Consultoría de RRHH',
    'Gestión de personal',
    'Diagnóstico organizacional',
  ],
  sameAs: [],
};

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();

  useEffect(() => {
    // Si la URL trae un hash al cargar, lo ignoramos para no
    // saltar a la sección antes de mostrar el hero.
    if (window.location.hash) {
      const timer = setTimeout(() => {
        window.scrollTo(0, 0);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [router.asPath]);

  const canonical = `${SITE_URL}${router.asPath === '/' ? '' : router.asPath}`;

  return (
    <>
      <Head>
        <title>{SITE_TITLE}</title>
        <meta name="description" content={SITE_DESCRIPTION} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#228be6" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="canonical" href={canonical} />

        {/* SEO básico */}
        <meta
          name="robots"
          content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"
        />
        <meta name="googlebot" content="index, follow" />
        <meta name="author" content="ISEO RH" />
        <meta
          name="keywords"
          content="recursos humanos, RRHH, PyMEs, gestión de personal, consultoría RRHH, diagnóstico organizacional, Argentina"
        />
        <meta httpEquiv="content-language" content="es-AR" />

        {/* Open Graph (Facebook, LinkedIn, WhatsApp) */}
        <meta property="og:type" content="website" />
        <meta property="og:locale" content="es_AR" />
        <meta property="og:site_name" content="ISEO RH" />
        <meta property="og:title" content={SITE_TITLE} />
        <meta property="og:description" content={SITE_DESCRIPTION} />
        <meta property="og:url" content={canonical} />
        <meta property="og:image" content={OG_IMAGE} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta
          property="og:image:alt"
          content="ISEO RH — Recursos Humanos para PyMEs"
        />

        {/* Twitter / X */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={SITE_TITLE} />
        <meta name="twitter:description" content={SITE_DESCRIPTION} />
        <meta name="twitter:image" content={OG_IMAGE} />
        <meta
          name="twitter:image:alt"
          content="ISEO RH — Recursos Humanos para PyMEs"
        />

        {/* Datos estructurados schema.org */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </Head>
      <MantineProvider theme={theme}>
        <Component {...pageProps} />
        <Analytics />
      </MantineProvider>
    </>
  );
}
