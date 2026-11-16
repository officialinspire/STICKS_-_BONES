import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage', 'test-results'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    // The service worker runs in its own global scope.
    files: ['src/pwa/sw.js'],
    languageOptions: { globals: { ...globals.serviceworker } },
  },
  {
    // The engine must stay pure, deterministic and serializable.
    files: ['src/engine/**/*.ts'],
    ignores: ['src/engine/**/*.test.ts'],
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-globals': [
        'error',
        ...['window', 'document', 'localStorage', 'sessionStorage', 'navigator', 'fetch', 'setTimeout', 'setInterval', 'requestAnimationFrame', 'console', 'crypto', 'performance'].map(
          (name) => ({ name, message: 'Engine code must be pure: no DOM, I/O, timers, logging or ambient randomness.' }),
        ),
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seedable RNG in src/engine/rng.ts.' },
        { object: 'Date', property: 'now', message: 'Engine code must not read the clock.' },
      ],
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['**/ui/**', '**/assets/**', '**/audio/**', '**/ai/**'], message: 'Engine must not depend on presentation, assets, audio or AI.' }] },
      ],
    },
  },
  {
    // AI policies may only see the sanitized observation: no route to authoritative state.
    files: ['src/ai/**/*.ts'],
    // observation.ts builds the observation; testing.ts drives matches for tests/tournaments.
    ignores: ['src/ai/**/*.test.ts', 'src/ai/observation.ts', 'src/ai/testing.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/engine/match', '**/engine/view', '**/engine/deal', '**/engine/simulate', '**/engine/serialize', '**/engine/invariants', '**/engine/index', '**/app/**', '**/ui/**'],
              message: 'AI code must decide from AiObservation only.',
            },
            { group: ['**/engine/state'], allowTypeImports: true, message: 'Only types may be imported from engine/state.' },
          ],
        },
      ],
    },
  },
);
