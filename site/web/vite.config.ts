import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Base path: '/' on Vercel, '/heirloom/' for GitHub Pages (set VITE_BASE in the Pages workflow).
const BASE = process.env.VITE_BASE || '/';

// Inline the (small, ~7 kB gz) stylesheet into index.html so first paint waits on no CSS request.
function inlineCss(): Plugin {
  return {
    name: 'inline-css',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!ctx.bundle || !ctx.filename.endsWith('index.html')) return html;
        return html.replace(
          new RegExp(`<link rel="stylesheet"[^>]*href="${BASE.replace(/\//g, '\\/')}(assets\\/[^"]+\\.css)"[^>]*>`, 'g'),
          (tag, file: string) => {
            const asset = ctx.bundle![file];
            if (!asset || asset.type !== 'asset') return tag;
            return `<style>${String(asset.source)}</style>`;
          },
        );
      },
    },
  };
}

export default defineConfig(
  ({ isSsrBuild }) =>
    ({
      base: BASE,
      plugins: [react(), inlineCss()],
      resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
      build: isSsrBuild
        ? {}
        : {
            rollupOptions: {
              input: {
                index: fileURLToPath(new URL('./index.html', import.meta.url)),
                404: fileURLToPath(new URL('./404.html', import.meta.url)),
                og: fileURLToPath(new URL('./og.html', import.meta.url)),
              },
            },
          },
      test: { environment: 'node', include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs'] },
    }) as import('vite').UserConfig & { test: unknown },
);
