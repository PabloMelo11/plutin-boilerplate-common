import tsConfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'tests',
    root: './',
    globals: true,
    environment: 'node',
    exclude: ['node_modules', 'dist', './src/infra/controllers/**/*.spec.ts'],
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
