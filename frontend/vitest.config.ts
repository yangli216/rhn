import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

declare const process: { env: Record<string, string | undefined> }
// Clinical dates and shifts are business-local (Asia/Shanghai, as on the backend); pin it so results do not
// depend on the developer machine or CI runner timezone. Workers inherit this before any Date is created.
process.env.TZ = 'Asia/Shanghai'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    clearMocks: true,
  },
})
