
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Setting base to './' allows the app to be deployed to any subdirectory 
  // (like a GitHub repo) without hardcoding the repository name.
  base: './',
  build: {
    // Increase the warning limit slightly (optional)
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // Separate heavy libraries into their own files to improve caching and silence warnings
        manualChunks: {
          'recharts': ['recharts'],
          'xlsx': ['xlsx'],
          'vendor': ['react', 'react-dom', 'react-dropzone']
        }
      }
    }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})