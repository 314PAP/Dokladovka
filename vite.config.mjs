import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: process.env.VITE_BASE_URL || '/',
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    hmr: true,
    watch: { usePolling: true },
  },
  build: {
    rollupOptions: {
      input: {
        main: './index.html',
      },
    },
  },
});
