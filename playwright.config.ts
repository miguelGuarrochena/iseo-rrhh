import { defineConfig, devices } from '@playwright/test';

/**
 * E2E de ISEO RH. Corre contra el server de desarrollo, donde el modo demo
 * está habilitado (NODE_ENV != production), así los flujos felices se
 * prueban con los datos de ejemplo, sin depender de Supabase.
 *
 * Requisitos (una sola vez):
 *   npm i -D @playwright/test
 *   npx playwright install
 * Correr:
 *   npm run test:e2e
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: {
    // app.localhost resuelve a loopback en Chromium y activa el modo
    // "subdominio de la app" del middleware: `/` es el tablero y las rutas
    // (/colaboradores, /fichaje, …) se sirven limpias, igual que en prod.
    baseURL: 'http://app.localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
