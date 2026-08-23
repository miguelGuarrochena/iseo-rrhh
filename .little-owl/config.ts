/**
 * Little Owl Code configuration.
 * Docs: https://littleowlcode.com/docs/configuration
 *
 * Installing the package as a dev dependency gets you type checking here:
 *
 *   import { defineConfig } from 'little-owl-code';
 *   export default defineConfig({ ... });
 */
export default {
  strictness: 'balanced',

  architecture: {
    // Layers are listed top to bottom. A layer may depend on the one below it.
    layers: {
      ui: ['app', 'components'],
      application: ['lib/services', 'lib/auth', 'lib/api', 'lib/email', 'lib/ia'],
      data: ['lib/supabase'],
    },
    layerPolicy: 'adjacent',
  },

  thresholds: {
    maxFileLines: 800,
    maxFunctionLines: 100,
    maxComponentLines: 800,
    maxComplexity: 15,
  },

  // Severity: 'off' | 'info' | 'warning' | 'error'
  rules: {
    'architecture/circular-dependency': 'error',
    'architecture/layer-violation': 'error',
    'architecture/layer-skip': 'warning',
  },

  ignore: ['generated/**'],

  ci: {
    failOn: 'error',
    maxOverallDrop: 5,
  },
};
