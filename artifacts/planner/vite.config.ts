import path from 'path';
import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';

// The planner Satellite: its own address, same API server (life hub). In dev the API runs separately.
const port = Number(process.env.PORT ?? 5174);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT value: "${process.env.PORT}"`);
const apiOrigin = process.env.API_ORIGIN ?? 'http://localhost:8080';

export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  resolve: {alias: {'@': path.resolve(import.meta.dirname, 'src')}, dedupe: ['react', 'react-dom']},
  root: path.resolve(import.meta.dirname),
  build: {outDir: path.resolve(import.meta.dirname, 'dist/public'), emptyOutDir: true},
  server: {proxy: {'/api': {target: apiOrigin, changeOrigin: false}}, port, strictPort: true, host: '0.0.0.0', allowedHosts: true},
  preview: {port, host: '0.0.0.0', allowedHosts: true},
});
