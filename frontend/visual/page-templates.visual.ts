import { expect, test, type Page } from '@playwright/test'

// PC viewports and both font tiers from docs/ai/frontend-ui.md; the gallery uses fictional data only.
const widths = [1280, 1440, 1920]
const fontSizes = ['standard', 'large'] as const
const templates = [
  { tab: '查询列表', name: 'list' },
  { tab: '主从维护', name: 'master-detail' },
  { tab: '临床工作台', name: 'workbench' },
  { tab: '分组表单', name: 'form' },
]

async function openGallery(page: Page, width: number, fontSize: (typeof fontSizes)[number]) {
  await page.setViewportSize({ width, height: 900 })
  await page.addInitScript(value => localStorage.setItem('rhn.display.font-size', value), fontSize)
  await page.goto('/ui-templates.html')
  await page.evaluate(() => document.fonts.ready)
}

async function showTemplate(page: Page, tab: string) {
  await page.getByRole('tab', { name: tab }).click()
  await expect(page.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true')
}

for (const fontSize of fontSizes) {
  for (const width of widths) {
    test(`模板 ${width}px ${fontSize}`, async ({ page }) => {
      await openGallery(page, width, fontSize)
      for (const { tab, name } of templates) {
        await showTemplate(page, tab)
        await expect.soft(page).toHaveScreenshot(`${name}-${width}-${fontSize}.png`)
      }
    })
  }
}

test('模板 长文本与长列表 1440px standard', async ({ page }) => {
  await openGallery(page, 1440, 'standard')
  await page.getByRole('switch', { name: '长文本与长列表' }).click()
  for (const { tab, name } of templates) {
    await showTemplate(page, tab)
    await expect.soft(page).toHaveScreenshot(`${name}-long-1440-standard.png`)
    if (name === 'workbench') {
      // Long work content must scroll inside the pane, not be clipped by the panel frame.
      const body = page.getByRole('region', { name: '服务详情内容' })
      expect(await body.evaluate(node => node.scrollHeight > node.clientHeight && getComputedStyle(node).overflowY === 'auto')).toBe(true)
    }
  }
})
