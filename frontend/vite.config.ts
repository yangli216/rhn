import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

declare const process: { env: Record<string, string | undefined> }

export default defineConfig(({ mode }) => {
  const apiTarget = process.env.RHN_API_TARGET ?? loadEnv(mode, '.', '').RHN_API_TARGET ?? 'http://localhost:8080'

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': apiTarget,
        '/actuator': apiTarget,
      },
    },
  }
})
