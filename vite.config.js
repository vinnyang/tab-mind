import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/background.js'),
        sidebar: resolve(__dirname, 'src/sidebar.js'),
        content: resolve(__dirname, 'src/content.js'),
      },
      output: {
        entryFileNames: '[name].js',
        dir: 'dist',
        format: 'es',
      },
    },
    outDir: 'dist',
    emptyOutDir: true,
  },
});
