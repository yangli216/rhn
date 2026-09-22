import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { schemaWorkbenchPlugin } from '../scripts/schema-workbench/vite-plugin.mjs'

declare const process: { env: Record<string, string | undefined> }

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  const frontendPort = Number(process.env.RHN_FRONTEND_PORT ?? env.RHN_FRONTEND_PORT ?? 15176)
  const apiTarget = process.env.RHN_API_TARGET ?? env.RHN_API_TARGET ?? 'http://localhost:18086'

  return {
    plugins: [react(), schemaWorkbenchPlugin()],
    build: {
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: mode === 'test' ? {} : {
          manualChunks(id) {
            if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/') || id.includes('node_modules/scheduler/')) {
              return 'vendor-react'
            }
            if (id.includes('node_modules/react-router/') || id.includes('node_modules/react-router-dom/')) {
              return 'vendor-router'
            }
            if (id.includes('node_modules/@tanstack/react-query') || id.includes('node_modules/@tanstack/query-core')) {
              return 'vendor-query'
            }
          },
        },
      },
    },
    preview: {
      port: frontendPort,
      strictPort: true,
    },
    server: {
      port: frontendPort,
      strictPort: true,
      proxy: {
        '/api': apiTarget,
        '/actuator': apiTarget,
      },
    },
  }
})
