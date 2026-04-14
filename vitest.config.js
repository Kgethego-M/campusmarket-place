import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8', // requires @vitest/coverage-v8
      reporter: ['text', 'lcov'],
    },
  },
})
