import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

declare const process: { env: Record<string, string | undefined> }

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  const frontendPort = Number(process.env.RHN_FRONTEND_PORT ?? env.RHN_FRONTEND_PORT ?? 15176)
  const apiTarget = process.env.RHN_API_TARGET ?? env.RHN_API_TARGET ?? 'http://localhost:18086'

  return {
    plugins: [react()],
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
