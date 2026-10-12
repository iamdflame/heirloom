import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  base: '/heirloom/',
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL('./index.html', import.meta.url)),
        404: fileURLToPath(new URL('./404.html', import.meta.url)),
        og: fileURLToPath(new URL('./og.html', import.meta.url)),
      },
    },
  },
  test: { environment: 'node', include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs'] },
} as import('vite').UserConfig & { test: unknown });
