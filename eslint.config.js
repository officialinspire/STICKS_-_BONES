import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
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
);
