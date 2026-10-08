import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import type { DictionaryValue, DiseaseManagementProgram, RhnApi } from '../../shared/rhnApi'
import { DiseaseManagementMembersDialog } from './BasicDataManagement'

const program: DiseaseManagementProgram = {
  id: 'program', revision: 1, scopeType: 'TENANT', scopeId: 'tenant', code: 'REGISTRY', name: '管理项目',
  sdManagementType: 'SPECIAL_REGISTRY', sdManagementTypeText: '专项登记',
  sdTriggerAction: 'PROMPT_CONFIRMATION', sdTriggerActionText: '提示确认', sdStatus: 'ACTIVE', sdStatusText: '有效',
  effectiveFrom: '2026-01-01', ruleCount: 0, exceptionCount: 0, rules: [], members: [],
}
const row = (id = 'concept') => ({ id, codeSystemId: 'system', systemCode: 'ICD10', systemName: '疾病目录',
  code: id, display: `疾病-${id}`, sdStatus: 'ACTIVE', sdDiagnosisDomain: 'WESTERN_MEDICINE', sdDiagnosisDomainText: '西医诊断' })
const result = (content = [row()], page = 0, totalElements = content.length) => ({
  content, page, size: 10, totalElements, totalPages: Math.ceil(totalElements / 10),
})
function deferred() {
  let resolve!: (value: unknown) => void
  let reject!: (value: Error) => void
  const promise = new Promise<unknown>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}
function setup(search = vi.fn().mockResolvedValue(result()), sharedClient?: QueryClient) {
  const api = { masterData: { searchDiseases: search } } as unknown as RhnApi
  const client = sharedClient ?? new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: 0 } } })
  const onSave = vi.fn().mockImplementation(() => new Promise(() => {}))
  const props = { program, api, onSave, onClose: vi.fn(), codeSystems: [], dictionaries: {
    BD_DIAGNOSIS_DOMAIN: [
      { code: 'WESTERN_MEDICINE', name: '西医诊断', sortOrder: 1 },
      { code: 'TCM_DISEASE', name: '中医病名', sortOrder: 2 },
    ] as DictionaryValue[],
  } }
  const content = (overrides: Partial<typeof props> = {}) => <QueryClientProvider client={client}>
    <DiseaseManagementMembersDialog {...props} {...overrides} /></QueryClientProvider>
  const rendered = render(content())
  const submit = (keyword = '高血压') => {
    fireEvent.change(screen.getByRole('searchbox', { name: '查找精确疾病' }), { target: { value: keyword } })
    fireEvent.click(screen.getByRole('button', { name: '检索' }))
  }
  return { ...rendered, submit, search, client, onSave, props, content }
}

describe('disease member search boundaries', () => {
  it('separates failed lookup from a verified empty result and retries', async () => {
    const search = vi.fn().mockRejectedValueOnce(new Error('目录不可用')).mockResolvedValueOnce(result([]))
    const h = setup(search); h.submit()
    expect(await screen.findByText(/疾病检索失败：目录不可用/)).toBeInTheDocument()
    expect(screen.getByText('数量未确认')).toBeInTheDocument()
    expect(screen.queryByText('共 0 条')).not.toBeInTheDocument()
    expect(screen.queryByText('未找到疾病')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重新检索' }))
    expect(await screen.findByText('未找到疾病')).toBeInTheDocument()
    expect(screen.getByText('共 0 条')).toBeInTheDocument()
    expect(search).toHaveBeenCalledTimes(2)
  })

  it.each([null, { content: [] }, result([{ ...row(), sdStatus: 'SUSPENDED' }])])('rejects malformed lookup results %#', async value => {
    const h = setup(vi.fn().mockResolvedValue(value)); h.submit()
    expect(await screen.findByText(/疾病检索失败：疾病目录结果未确认/)).toBeInTheDocument()
    expect(screen.queryByText('未找到疾病')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '明确纳入' })).not.toBeInTheDocument()
  })

  it('submits the same keyword again and does not expose stale candidates while refreshing', async () => {
    const next = deferred()
    const h = setup(vi.fn().mockResolvedValueOnce(result()).mockReturnValueOnce(next.promise)); h.submit()
    fireEvent.click(await screen.findByRole('button', { name: '明确纳入' }))
    fireEvent.click(screen.getByRole('button', { name: '检索' }))
    expect(await screen.findByText('正在检索疾病…')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '明确纳入' })).not.toBeInTheDocument()
    expect(screen.getByText('1 个例外')).toBeInTheDocument()
    await act(async () => next.reject(new Error('重新查询失败')))
    expect(await screen.findByText(/疾病检索失败：重新查询失败/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '保存识别范围' }))
    expect(h.onSave).toHaveBeenCalledWith([], [{ conceptId: 'concept', inclusionMode: 'INCLUDE', note: null }])
  })

  it.each(['edit', 'reset'] as const)('ignores a late result after %s', async operation => {
    const pending = deferred(); const h = setup(vi.fn().mockReturnValue(pending.promise)); h.submit()
    await waitFor(() => expect(h.search).toHaveBeenCalledTimes(1))
    if (operation === 'reset') fireEvent.click(screen.getByRole('button', { name: '重置' }))
    else fireEvent.change(screen.getByRole('searchbox', { name: '查找精确疾病' }), { target: { value: '糖尿病' } })
    await act(async () => pending.resolve(result()))
    expect(screen.queryByText('疾病-concept')).not.toBeInTheDocument()
    expect(screen.queryByText('共 1 条')).not.toBeInTheDocument()
    expect(screen.queryByText('未找到疾病')).not.toBeInTheDocument()
  })

  it('ignores earlier query completion after the newer query succeeds', async () => {
    const pending = deferred()
    const h = setup(vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValueOnce(result([row('new')]))); h.submit()
    await waitFor(() => expect(h.search).toHaveBeenCalledTimes(1)); h.submit('糖尿病')
    expect(await screen.findByText('疾病-new')).toBeInTheDocument()
    await act(async () => pending.resolve(result([row('old')])))
    expect(screen.queryByText('疾病-old')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '明确排除' }))
    fireEvent.click(screen.getByRole('button', { name: '保存识别范围' }))
    expect(h.onSave).toHaveBeenCalledWith([], [{ conceptId: 'new', inclusionMode: 'EXCLUDE', note: null }])
  })

  it.each(['api', 'program', 'revision'] as const)('starts a fresh editor after %s changes and ignores previous results', async change => {
    const pending = deferred(); const h = setup(vi.fn().mockReturnValue(pending.promise)); h.submit()
    await waitFor(() => expect(h.search).toHaveBeenCalledTimes(1))
    h.rerender(h.content(change === 'api' ? { api: { ...h.props.api } }
      : { program: { ...program, ...(change === 'program' ? { id: 'new-program' } : { revision: 2 }) } }))
    await act(async () => pending.resolve(result()))
    expect(screen.getByRole('searchbox', { name: '查找精确疾病' })).toHaveValue('')
    expect(screen.queryByText('疾病-concept')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '保存识别范围' }))
    expect(h.onSave).toHaveBeenCalledWith([], [])
  })

  it('does not reuse a previous dialog session even with a shared query cache', async () => {
    const h = setup(); h.submit(); expect(await screen.findByText('疾病-concept')).toBeInTheDocument(); h.unmount()
    const pending = deferred(); const reopened = setup(vi.fn().mockReturnValue(pending.promise), h.client); reopened.submit()
    expect(await screen.findByText('正在检索疾病…')).toBeInTheDocument()
    expect(screen.queryByText('疾病-concept')).not.toBeInTheDocument()
    await act(async () => pending.resolve(result([])))
    expect(await screen.findByText('未找到疾病')).toBeInTheDocument()
  })

  it('rejects results that do not match the selected diagnosis domain', async () => {
    const h = setup(); h.submit(); expect(await screen.findByText('疾病-concept')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('combobox', { name: '检索诊断体系' }))
    fireEvent.click(await screen.findByRole('option', { name: /中医病名/ }))
    expect(await screen.findByText(/疾病检索失败：疾病目录结果未确认/)).toBeInTheDocument()
    expect(h.search).toHaveBeenLastCalledWith('高血压', '', 'ACTIVE', 'TCM_DISEASE', 0, 10)
    expect(screen.queryByRole('button', { name: '明确纳入' })).not.toBeInTheDocument()
  })

  it('handles directory shrinkage without claiming there are no diseases', async () => {
    const first = result(Array.from({ length: 10 }, (_, index) => row(`c${index}`)), 0, 11)
    const h = setup(vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(result([], 1, 1)).mockResolvedValueOnce(result()))
    h.submit(); fireEvent.click(await screen.findByRole('button', { name: '下一页' }))
    expect(await screen.findByText('当前页无结果')).toBeInTheDocument()
    expect(screen.getByText('共 1 条')).toBeInTheDocument()
    expect(screen.queryByText('未找到疾病')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '返回第一页' }))
    expect(await screen.findByText('疾病-concept')).toBeInTheDocument()
    expect(h.search).toHaveBeenLastCalledWith('高血压', '', 'ACTIVE', '', 0, 10)
  })

  it('hides cached candidates during a background refetch and after its failure', async () => {
    const pending = deferred()
    const h = setup(vi.fn().mockResolvedValueOnce(result()).mockReturnValueOnce(pending.promise)); h.submit()
    expect(await screen.findByText('疾病-concept')).toBeInTheDocument()
    act(() => { void h.client.invalidateQueries({ queryKey: ['disease-management-scope-search'] }) })
    expect(await screen.findByText('正在检索疾病…')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '明确纳入' })).not.toBeInTheDocument()
    await act(async () => pending.reject(new Error('后台刷新失败')))
    expect(await screen.findByText(/疾病检索失败：后台刷新失败/)).toBeInTheDocument()
    expect(screen.queryByText('疾病-concept')).not.toBeInTheDocument()
    expect(screen.queryByText('未找到疾病')).not.toBeInTheDocument()
  })
})
