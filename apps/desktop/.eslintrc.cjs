/* ESLint config for the desktop app (Phase 1). */
module.exports = {
  root: true,
  env: { browser: true, node: true, es2022: true },
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module', ecmaFeatures: { jsx: true } },
  settings: { react: { version: 'detect' } },
  plugins: ['@typescript-eslint', 'react', 'react-hooks'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
  ],
  rules: {
    'react/prop-types': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
  },
  overrides: [
    {
      // The plugin host bundle runs unprivileged in a utility process
      // (ADR-0010). It must never reach into the privileged main process or
      // Electron — only @shared contracts and the public SDK types.
      files: ['src/plugin-host/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              { group: ['@main/*', '**/main/*', '../main/*'], message: 'The plugin host must not import main-process code (ADR-0010).' },
              { group: ['electron'], message: 'The plugin host must not import electron (ADR-0010).' },
            ],
          },
        ],
      },
    },
  ],
  ignorePatterns: ['out/', 'dist/', 'node_modules/', 'coverage/', '*.config.js', '*.config.ts'],
};
