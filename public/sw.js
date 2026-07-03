/**
 * Service worker mínimo de ISEO RH.
 * Hace la app instalable; la estrategia de cache llegará con el backend.
 */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Passthrough: todo va a la red (la app necesita datos frescos).
self.addEventListener('fetch', () => {});
