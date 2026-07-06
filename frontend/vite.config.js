import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backendPort = env.VITE_LOCAL_BACKEND || 5000;

  return {
    server: {
      port: 3000,
      open: true,
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${backendPort}`,
          changeOrigin: true,
          secure: false
        }
      }
    },
    build: {
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('/src/db/')) {
              return 'db-core';
            }
            if (id.includes('/src/modules/')) {
              return 'modules';
            }
            if (id.includes('/src/ui/')) {
              return 'ui-components';
            }
            if (id.includes('/src/auth/')) {
              return 'auth';
            }
          }
        }
      }
    }
  }
});
