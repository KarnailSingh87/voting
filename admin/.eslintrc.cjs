module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  env: { node: true, browser: true, mocha: true, es2021: true },
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
  settings: { react: { version: '18.2' } },
  plugins: ['react-refresh'],
  globals: { cy: 'readonly', Cypress: 'readonly' },
  env: { node: true, browser: true, mocha: true },
  rules: {
    'react/jsx-no-target-blank': 'off',
    'react-refresh/only-export-components': 'off',
    'react/prop-types': 'off'
  },
}
