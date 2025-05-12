import tsConfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    root: './',
    globals: true,
    environment: 'node',
    exclude: ['node_modules', 'dist'],
    include: ['**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      reporter: ['text', 'lcov'],
      include: ['./src/**'],
      exclude: ['**/__tests__/**', '**/*.test.ts'],
    },
  },
  plugins: [tsConfigPaths()],
})
