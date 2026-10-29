import { expect, test, type Page } from '@playwright/test'

// 表单控件与默认按钮共用 --control-height-default（中号，大字档只小幅增高），输入框与同行按钮因此同高。
// 紧凑型（sm）与显式大号（lg）按钮保持各自令牌，不跟随默认值。
const fontSizes = ['standard', 'large'] as const
const pages = ['查询列表', '主从维护', '临床工作台', '分组表单']

async function open(page: Page, fontSize: (typeof fontSizes)[number]) {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript(value => localStorage.setItem('rhn.display.font-size', value), fontSize)
  await page.goto('/ui-templates.html')
  await page.evaluate(() => document.fonts.ready)
}

function tokenHeights(page: Page) {
  return page.evaluate(() => {
    const probe = document.createElement('div')
    const read = (token: string) => { probe.style.cssText = `position:absolute;visibility:hidden;height:var(${token})`; document.body.append(probe); return probe.getBoundingClientRect().height }
    const result = { fallback: read('--control-height-default'), sm: read('--control-height-sm'), md: read('--control-height-md'), lg: read('--control-height-lg') }
    probe.remove()
    return result
  })
}

for (const fontSize of fontSizes) {
  test(`默认按钮与输入类控件同高 ${fontSize}`, async ({ page }) => {
    await open(page, fontSize)
    const tokens = await tokenHeights(page)
    expect(tokens.fallback).toBe(tokens.md)
    for (const tab of pages) {
      await page.getByRole('tab', { name: tab }).click()
      const measured = await page.evaluate(() => {
        const visible = (element: Element) => element.getClientRects().length > 0
        const heights = (selector: string) => [...document.querySelectorAll(selector)].filter(visible).map(element => Math.round(element.getBoundingClientRect().height))
        return {
          fields: heights('.ui-search-field, .ui-select__trigger, input.ui-field__control'),
          // 队列/目录里的列表条目按钮按列表约定设置高度，不属于默认操作按钮。
          buttons: heights('.ui-button:not(.ui-button--sm):not(.ui-button--lg):not(.ui-icon-action):not(.template-demo__queue > .ui-button)'),
          compact: heights('.ui-button--sm'),
        }
      })
      const expected = Math.round(tokens.fallback)
      expect.soft(measured.fields.every(height => height === expected), `${tab} 输入类控件应为 ${expected}px：${measured.fields}`).toBe(true)
      expect.soft(measured.buttons.every(height => height === expected), `${tab} 默认按钮应为 ${expected}px：${measured.buttons}`).toBe(true)
      expect.soft(measured.compact.every(height => height === Math.round(tokens.sm)), `${tab} 紧凑按钮应保持 ${Math.round(tokens.sm)}px：${measured.compact}`).toBe(true)
    }
  })
}
