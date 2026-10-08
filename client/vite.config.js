import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const target = 'http://localhost:3001';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': target,
      '/clips': target,
      '/uploads': target,
      '/socket.io': { target, ws: true },
    },
  },
});
