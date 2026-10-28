import { defineConfig, devices } from '@playwright/test'

declare const process: { env: Record<string, string | undefined> }

// Visual baselines for the page-template gallery. Uses its own Vite on a dedicated port so the manual
// 5173 service is never reused or restarted; Playwright stops that server when the run ends.
const port = Number(process.env.RHN_VISUAL_PORT ?? 15190)

export default defineConfig({
  testDir: './visual',
  testMatch: '**/*.visual.ts',
  outputDir: '../.runtime/verification/ui-visual/results',
  // Font rendering differs by OS, so baselines are kept per platform.
  snapshotPathTemplate: '{testDir}/__screenshots__/{platform}/{testFilePath}/{arg}{ext}',
  fullyParallel: true,
  reporter: [['list'], ['html', { open: 'never', outputFolder: '../.runtime/verification/ui-visual/report' }]],
  expect: { toHaveScreenshot: { animations: 'disabled', caret: 'hide', scale: 'css' } },
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://127.0.0.1:${port}`,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    deviceScaleFactor: 1,
  },
  webServer: {
    command: `npx vite --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}/ui-templates.html`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
