import { MantineProvider } from '@mantine/core';
import { AppProps } from 'next/app';
import Head from 'next/head';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { theme } from '@/theme/theme';
import '@mantine/core/styles.css';
import '@/styles/globals.css';

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();

  useEffect(() => {
    // Prevenir scroll automático al cargar la página
    if (window.location.hash) {
      const element = document.getElementById(window.location.hash.substring(1));
      if (element) {
        // Usar setTimeout para asegurar que se ejecute después de la renderización
        const timer = setTimeout(() => {
          window.scrollTo(0, 0);
        }, 0);
        return () => clearTimeout(timer);
      }
    }
  }, [router.asPath]);

  return (
    <>
      <Head>
        <title>ISEO RH</title>
        <meta
          name="description"
          content="ISEO RH es tu aliado en la gestión y organización del personal. Creamos herramientas y procesos a medida para que tu empresa gane en claridad, previsibilidad y cultura organizacional."
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
