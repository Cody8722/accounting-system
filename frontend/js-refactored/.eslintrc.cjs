module.exports = {
  env: { browser: true, es2022: true },
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  globals: {
    Swal: 'readonly',
    Chart: 'readonly',
    debugLog: 'readonly',
  },
  rules: {
    'no-unused-vars': 'warn',
    'no-undef': 'error',
    'eqeqeq': 'error',
    'no-var': 'error',
    'prefer-const': 'warn',
  },
};
