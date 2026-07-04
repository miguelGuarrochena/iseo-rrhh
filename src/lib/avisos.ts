'use client';

import { notifications } from '@mantine/notifications';

/**
 * Toasts con la estética de la marca: pastel, borde fino, sin sombra dura.
 */
const base = {
  radius: 'lg' as const,
  withBorder: true,
  autoClose: 3500,
};

export const avisoExito = (titulo: string, mensaje?: string) =>
  notifications.show({
    ...base,
    title: titulo,
    message: mensaje ?? '',
    color: 'teal',
  });

export const avisoError = (titulo: string, mensaje?: string) =>
  notifications.show({
    ...base,
    title: titulo,
    message: mensaje ?? '',
    color: 'red',
    autoClose: 6000,
  });
