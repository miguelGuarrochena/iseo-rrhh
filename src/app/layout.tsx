import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import {
  ColorSchemeScript,
  MantineProvider,
  mantineHtmlProps,
} from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { Analytics } from '@vercel/analytics/next';
import { theme } from '@/theme/theme';
import { AuthProvider } from '@/lib/auth/AuthProvider';
import { RegistrarSW } from '@/components/RegistrarSW';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import '@/styles/globals.css';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://iseo-rh.com';
const SITE_TITLE = 'ISEO RH — Recursos Humanos para PyMEs';
const SITE_DESCRIPTION =
  'ISEO RH es tu aliado en la gestión y organización del personal. Diagnóstico, herramienta online, visitas programadas y procesos a medida para que tu empresa gane en claridad, previsibilidad y cultura organizacional.';
const OG_IMAGE = `${SITE_URL}/og-image.svg`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  authors: [{ name: 'ISEO RH' }],
  keywords: [
    'recursos humanos',
    'RRHH',
    'PyMEs',
    'gestión de personal',
    'consultoría RRHH',
    'diagnóstico organizacional',
    'Argentina',
  ],
  robots: {
    index: true,
    follow: true,
    'max-image-preview': 'large',
    'max-snippet': -1,
    'max-video-preview': -1,
    googleBot: { index: true, follow: true },
  },
  alternates: { canonical: '/' },
  manifest: '/site.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'ISEO RH',
  },
  openGraph: {
    type: 'website',
    locale: 'es_AR',
    siteName: 'ISEO RH',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: '/',
    images: [
      {
        url: OG_IMAGE,
        width: 1200,
        height: 630,
        alt: 'ISEO RH — Recursos Humanos para PyMEs',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [{ url: OG_IMAGE, alt: 'ISEO RH — Recursos Humanos para PyMEs' }],
  },
  other: { 'content-language': 'es-AR' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#f1f4fa',
};

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
  email: 'info@iseo-rh.com',
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

const RootLayout = ({ children }: { children: ReactNode }) => (
  <html lang="es" {...mantineHtmlProps}>
    <head>
      <ColorSchemeScript defaultColorScheme="light" />

      {/* Tipografía moderna: Plus Jakarta Sans */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        rel="preconnect"
        href="https://fonts.gstatic.com"
        crossOrigin="anonymous"
      />
      <link
        href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,500&display=swap"
        rel="stylesheet"
      />

      {/* Datos estructurados schema.org */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </head>
    <body>
      <MantineProvider theme={theme} defaultColorScheme="light">
        <Notifications position="top-right" containerWidth={340} />
        <AuthProvider>{children}</AuthProvider>
      </MantineProvider>
      <RegistrarSW />
      <Analytics />
    </body>
  </html>
);

export default RootLayout;
