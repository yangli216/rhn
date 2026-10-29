import { expect, test } from '@playwright/test'

// 从已认可页面抽取的组合组件（/ui-samples.html?sample=components，虚构数据）。
const fontSizes = ['standard', 'large'] as const

for (const fontSize of fontSizes) {
  test(`组合组件 1440px ${fontSize}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1100 })
    await page.addInitScript(value => localStorage.setItem('rhn.display.font-size', value), fontSize)
    await page.goto('/ui-samples.html?sample=components')
    await expect(page.getByRole('heading', { name: '目录条目' })).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await expect.soft(page).toHaveScreenshot(`components-1440-${fontSize}.png`, { fullPage: true })
  })
}
