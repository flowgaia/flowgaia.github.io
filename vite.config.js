import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [wasm(), topLevelAwait(), tailwindcss()],
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    open: true,
    hmr: {
      protocol: 'ws',
      host: 'localhost',
      port: 3000,
    },
  },
  assetsInclude: ['**/*.wasm'],
});
