import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FormExample, ListExample, MasterDetailExample, WorkbenchExample, PageTemplateGallery } from './PageTemplateGallery'
import { WorkspacePane } from '../shared/ui/templates/PageTemplates'

const ready = { state: 'ready' as const, longData: false, onRetry: () => undefined }

describe('page template examples', () => {
  it('keeps controls outside the reading region and resets only when its reading key changes without discarding drafts', async () => {
    const user = userEvent.setup()
    const pane = (resetScrollKey: string, status: string) => <WorkspacePane label="共建正文" resetScrollKey={resetScrollKey}
      header={<span>固定筛选</span>} footer={<span>{status}</span>}>
      <input aria-label="未保存草稿" defaultValue="" />
    </WorkspacePane>
    const { rerender } = render(pane('first', '等待保存'))
    const body = screen.getByRole('region', { name: '共建正文内容' })
    expect(within(body).queryByText('固定筛选')).not.toBeInTheDocument()
    expect(within(body).queryByText('等待保存')).not.toBeInTheDocument()
    expect(body).toHaveAttribute('tabindex', '0')
    await user.type(screen.getByRole('textbox', { name: '未保存草稿' }), '保留输入')
    body.scrollTop = 240
    rerender(pane('first', '保存状态更新'))
    expect(body.scrollTop).toBe(240)
    rerender(pane('next-page', '等待保存'))
    expect(body.scrollTop).toBe(0)
    expect(screen.getByRole('textbox', { name: '未保存草稿' })).toHaveValue('保留输入')
  })

  it('filters, clears and paginates the list without losing the search field', async () => {
    const user = userEvent.setup()
    render(<ListExample {...ready} longData />)
    expect(screen.getAllByRole('row')).toHaveLength(21)
    const results = screen.getByRole('region', { name: '服务项目查询结果' })
    results.scrollTop = 800
    await user.click(screen.getByRole('button', { name: '下一页' }))
    expect(results.scrollTop).toBe(0)
    expect(screen.getByRole('cell', { name: 'DEMO-021' })).toBeInTheDocument()
    const search = screen.getByRole('searchbox', { name: '搜索服务项目' })
    await user.type(search, 'DEMO-075')
    expect(screen.getAllByRole('row')).toHaveLength(2)
    expect(screen.getByRole('cell', { name: 'DEMO-075' })).toBeInTheDocument()
    await user.clear(search)
    await user.type(search, '不匹配内容')
    expect(screen.getByText('没有匹配结果')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '清空搜索服务项目' }))
    expect(screen.getAllByRole('row')).toHaveLength(21)
    expect(search).toHaveFocus()
  })

  it('preserves query across loading/error and keeps forbidden distinct from empty', async () => {
    const user = userEvent.setup()
    const retry = vi.fn()
    const { rerender } = render(<ListExample {...ready} onRetry={retry} />)
    await user.type(screen.getByRole('searchbox'), 'DEMO-002')
    rerender(<ListExample {...ready} state="loading" onRetry={retry} />)
    expect(screen.getByRole('status')).toHaveTextContent('正在加载示例')
    rerender(<ListExample {...ready} state="error" onRetry={retry} />)
    await user.click(screen.getByRole('button', { name: '重试加载' }))
    expect(retry).toHaveBeenCalledOnce()
    expect(screen.getByRole('searchbox')).toHaveValue('DEMO-002')
    rerender(<ListExample {...ready} state="forbidden" />)
    expect(screen.getByText('无权查看此内容')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    rerender(<ListExample {...ready} state="empty" />)
    expect(screen.getByText('暂无服务项目')).toBeInTheDocument()
  })

  it.each([MasterDetailExample, WorkbenchExample])('switches the selected object while retaining a single page heading', async Example => {
    const user = userEvent.setup()
    render(<Example {...ready} />)
    await user.click(screen.getByRole('button', { name: '健康服务示例 2' }))
    expect(screen.getByRole('heading', { name: '健康服务示例 2', level: 2 })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('button', { name: '健康服务示例 2' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('validates a form, blocks duplicate submission and preserves input after failure for retry', async () => {
    const user = userEvent.setup()
    render(<FormExample {...ready} />)
    const save = screen.getByRole('button', { name: '保存项目' })
    await user.click(save)
    expect(screen.getByText('请填写项目名称')).toBeInTheDocument()
    const name = screen.getByRole('textbox', { name: '项目名称' })
    await user.type(name, '人工验收项目')
    await user.type(screen.getByRole('textbox', { name: '备注' }), '保留这段输入')
    await user.click(screen.getByRole('switch', { name: '模拟保存失败' }))
    await user.click(save)
    expect(save).toBeDisabled()
    expect(name).toBeDisabled()
    expect(await screen.findByRole('alert')).toHaveTextContent('保存失败，输入已保留')
    expect(name).toHaveValue('人工验收项目')
    expect(screen.getByRole('textbox', { name: '备注' })).toHaveValue('保留这段输入')
    await user.click(screen.getByRole('switch', { name: '模拟保存失败' }))
    await user.click(save)
    await waitFor(() => expect(screen.getByText('演示保存成功')).toBeInTheDocument())
    expect(name).toHaveValue('人工验收项目')
  })

  it('exposes all four templates through the shared keyboard-operable tabs', async () => {
    render(<PageTemplateGallery />)
    const tablist = screen.getByRole('tablist', { name: '页面模板' })
    const tabs = within(tablist).getAllByRole('tab')
    tabs[0].focus()
    await userEvent.keyboard('{End}')
    expect(tabs[3]).toHaveFocus()
    expect(screen.getByRole('heading', { level: 1, name: '新建服务项目' })).toBeInTheDocument()
  })
})
