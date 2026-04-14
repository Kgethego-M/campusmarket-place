import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './vitest.setup.js',
    coverage: {
      provider: 'v8', // requires @vitest/coverage-v8
      reporter: ['text', 'lcov'],
    },
  },
})
