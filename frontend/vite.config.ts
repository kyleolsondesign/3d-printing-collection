import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const apiPort = process.env.VITE_API_PORT || '3000';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true
      }
    }
  }
});
