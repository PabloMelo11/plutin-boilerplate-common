import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src', '!src/**/*.spec.*'],
  format: ['cjs'],
  outDir: 'dist',
  dts: false,
  clean: true,
  splitting: false,
  target: 'es2022',
  minify: false,
  tsconfig: './tsconfig.build.json',
  esbuildOptions(options) {
    options.alias = {
      '@domain': './src/domain',
      '@application': './src/application',
      '@infra': './src/infra',
    }
  },
})
