import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })

it('does not restore an analytics tab when the entry is disabled', async () => {
  vi.stubEnv('VITE_ANALYTICS_ENABLED', '')
  vi.resetModules()
  const { tabForPath } = await import('../../app/AppShell')
  expect(tabForPath('/analytics')).toBeNull()
})

it('registers a real workspace tab when explicitly enabled', async () => {
  vi.stubEnv('VITE_ANALYTICS_ENABLED', 'true')
  vi.resetModules()
  const { tabForPath } = await import('../../app/AppShell')
  expect(tabForPath('/analytics')).toMatchObject({ path: '/analytics', title: '智能统计分析' })
})
