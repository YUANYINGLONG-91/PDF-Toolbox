import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative assets work on GitHub Pages project sites and in local previews.
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 800,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
