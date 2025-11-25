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
  optimizeDeps: {
    exclude: ["async_hooks", "node:async_hooks"],
  },
  resolve: {
    alias: {
      "node:async_hooks": resolve(process.cwd(), "src/async_hooks_mock.js"),
      "async_hooks": resolve(process.cwd(), "src/async_hooks_mock.js"),
    },
  },
});
