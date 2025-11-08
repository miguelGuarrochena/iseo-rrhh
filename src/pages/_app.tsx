import { MantineProvider } from '@mantine/core';
import { AppProps } from 'next/app';
import Head from 'next/head';
import { theme } from '@/theme/theme';
import '@mantine/core/styles.css';
import '@/styles/globals.css';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>Talento+ | Gestión de Recursos Humanos Simplificada</title>
        <meta
          name="description"
          content="Talento+ es la solución de gestión de recursos humanos diseñada para pequeñas y medianas empresas. Automatiza procesos, reduce costos y mejora la comunicación."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#228be6" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <MantineProvider theme={theme}>
        <Component {...pageProps} />
      </MantineProvider>
    </>
  );
}
