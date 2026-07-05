/**
 * Service worker mínimo de ISEO RH.
 * Hace la app instalable como PWA. No intercepta la red: la app siempre
 * pide datos frescos, así que no registramos un handler 'fetch' (uno vacío
 * agrega overhead en cada navegación). La estrategia de cache llegará más
 * adelante si hace falta soporte offline.
 */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
