import { expect, test, type Page } from '@playwright/test'

// 医生站候诊工作台（/ui-samples.html，虚构数据）。年龄与等候时长依赖当前时间，所以冻结时钟。
const widths = [1280, 1440, 1920]
const fontSizes = ['standard', 'large'] as const

async function open(page: Page, width: number, fontSize: (typeof fontSizes)[number]) {
  await page.clock.install({ time: new Date('2026-10-28T09:00:00+08:00') })
  await page.setViewportSize({ width, height: 900 })
  await page.addInitScript(value => localStorage.setItem('rhn.display.font-size', value), fontSize)
  await page.goto('/ui-samples.html')
  await expect(page.locator('.patient-name', { hasText: '张建国' })).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
}

for (const fontSize of fontSizes) {
  for (const width of widths) {
    test(`候诊工作台 ${width}px ${fontSize}`, async ({ page }) => {
      await open(page, width, fontSize)
      await expect.soft(page).toHaveScreenshot(`waiting-${width}-${fontSize}.png`)
    })
  }
}

test('候诊工作台 已接诊页签与搜索 1440px standard', async ({ page }) => {
  await open(page, 1440, 'standard')
  await page.getByRole('tab', { name: /已接诊/ }).click()
  await expect(page.locator('.patient-name', { hasText: '吴桂芳' })).toBeVisible()
  await expect.soft(page).toHaveScreenshot('waiting-completed-1440-standard.png')
  await page.getByRole('tab', { name: /待诊/ }).click()
  const search = page.getByRole('searchbox', { name: '搜索门诊患者' })
  await search.fill('李翠华')
  await search.press('Enter')
  await expect(page.getByRole('status')).toContainText('共 1 条')
  await expect.soft(page).toHaveScreenshot('waiting-search-1440-standard.png')
})
