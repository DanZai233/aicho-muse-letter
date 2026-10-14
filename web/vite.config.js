import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { host: true, port: 5174, proxy: { '/api': 'http://127.0.0.1:3004', '/audio': 'http://127.0.0.1:3004' } },
  build: { outDir: 'dist', assetsDir: 'assets' },
});
