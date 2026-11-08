import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals:     true,
    environment: 'node',
    include:     ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include:  ['src/**/*.ts'],
      exclude:  ['src/**/*.test.ts', 'src/db/migrate.ts'],
    },
    // Isolate each test file — important for tests that mock env vars
    isolate: true,
  },
  resolve: {
    // Handle .js extensions in ESM imports
    alias: {
      '.js': '.ts',
    },
  },
})
