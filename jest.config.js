// Huso de la app (zona_empresa). Tiene que estar antes de que Jest
// construya `Date`: sin esto, `controlarTurno` y los tests con
// timestamps `+00:00` dependen del huso de la máquina de CI.
process.env.TZ = 'America/Argentina/Buenos_Aires';

const nextJest = require('next/jest');

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
});

// Add any custom config to be passed to Jest
const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    /*
     * En jsdom, `exceljs` resuelve `uuid` a su build ESM y Jest no lo
     * puede parsear. `uuid` publica un CJS al lado; se apunta ahí. Sin
     * esto no se puede probar nada que lea o escriba planillas.
     *
     * La ruta es del build CJS de Node. En uuid 8 estaba en `dist/`; en
     * 11 pasó a `dist/cjs/` (hay además `cjs-browser`, que usa la
     * criptografía del navegador). Si un día vuelve a mudarse, el
     * síntoma es un "Cannot find module" en todos los tests de planillas
     * a la vez.
     */
    '^uuid$': '<rootDir>/node_modules/uuid/dist/cjs/index.js',
    // Dependencia opcional de supabase-js (buckets analíticos): no la usamos.
    '^iceberg-js$': '<rootDir>/src/tests/mocks/moduloVacio.js',
    // En jsdom las animaciones no aportan nada y la librería real sólo
    // agrega ruido. El stub renderiza el contenido y ya. Centralizado acá
    // para que ningún test tenga que mantener su propia lista de
    // elementos `motion.*` (ver el comentario del archivo).
    '^framer-motion$': '<rootDir>/src/tests/mocks/framerMotion.tsx',
  },
  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.stories.{js,jsx,ts,tsx}',
    '!src/**/__tests__/**',
  ],
  testMatch: [
    '<rootDir>/src/tests/**/*.test.{js,jsx,ts,tsx}',
    '<rootDir>/src/**/__tests__/**/*.{js,jsx,ts,tsx}',
  ],
};

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig);
