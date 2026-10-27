import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        onlyExplicitManualChunks: true,
        manualChunks(id) {
          if (id.includes('commonjsHelpers')) return 'vendor-runtime'
          if (!id.includes('node_modules')) {
            return
          }

          if (id.includes('@clerk/')) return 'vendor-clerk'
          if (id.includes('@stripe/')) return 'vendor-stripe'
          if (id.includes('posthog-js')) return 'vendor-analytics'
          if (id.includes('framer-motion')) return 'vendor-motion'
          if (id.includes('recharts')) return 'vendor-charts'
          if (id.includes('lucide-react')) return 'vendor-icons'
          if (id.includes('axios')) return 'vendor-http'
          if (id.includes('@tanstack/')) return 'vendor-query'
          if (id.includes('zustand')) return 'vendor-state'
          if (id.includes('react-hot-toast')) return 'vendor-feedback'
          if (id.includes('date-fns')) return 'vendor-date'
          // Keep React, its scheduler and shared CommonJS dependencies together.
          return 'vendor'
        },
      },
    },
  },
})
