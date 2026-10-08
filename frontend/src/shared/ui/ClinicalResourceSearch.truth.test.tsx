import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { RhnApi } from '../rhnApi'
import { ClinicalResourceSearch, type ClinicalResourceType } from './ClinicalResourceSearch'

const med = { id: 'med', code: 'MED', name: '对乙酰氨基酚片', products: [], sdMedicationType: 'WESTERN' }
const service = { id: 'service', code: 'SRV', name: '血常规', prices: [] }
const group = { id: 'group', code: 'GROUP', name: '体检组套', members: [] }
function fixture() {
  return { masterData: { diseases: vi.fn().mockResolvedValue([]), medications: vi.fn().mockResolvedValue([]),
    services: vi.fn().mockResolvedValue([]), itemGroups: vi.fn().mockResolvedValue([]) }, encounters: { orderableMedications: vi.fn().mockResolvedValue([]) } }
}
function setup(resource: ClinicalResourceType, api = fixture(), encounterId?: string, searchMode: 'smart' | 'prefix' = 'smart') {
  const onChange = vi.fn()
  const content = (value = api, encounter = encounterId, org = 'org') => <ClinicalResourceSearch api={value as unknown as RhnApi}
    resource={resource} encounterId={encounter} organizationId={org} searchMode={searchMode} defaultOpen debounceMs={0} onChange={onChange} />
  const view = render(content())
  return { api, onChange, ...view, switchContext: (value: ReturnType<typeof fixture>, encounter = encounterId, org = 'org') => view.rerender(content(value, encounter, org)) }
}
function query(value: string) { fireEvent.change(screen.getByLabelText('远程检索'), { target: { value } }) }

describe('clinical search failures never become business results', () => {
  it.each(['diagnosis', 'medication', 'service', 'mixed'] as const)('reports %s failure instead of empty or fallback results, and retries the same query', async resource => {
    const api = fixture()
    const endpoint = resource === 'diagnosis' ? api.masterData.diseases : resource === 'service' ? api.masterData.services : api.masterData.medications
    endpoint.mockRejectedValueOnce(new Error('接口暂不可用'))
    setup(resource, api); query('abc')
    expect(await screen.findByRole('alert')).toHaveTextContent('接口暂不可用')
    expect(screen.queryByText('未找到匹配结果')).not.toBeInTheDocument()
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
    expect(endpoint).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('button', { name: '重新检索' }))
    expect(await screen.findByText('未找到匹配结果')).toBeInTheDocument()
  })
  it('does not fetch an unfiltered medication pool after an encounter request fails', async () => {
    const api = fixture(); api.encounters.orderableMedications.mockRejectedValueOnce(new Error('无就诊权限')).mockResolvedValue([med])
    setup('medication', api, 'encounter'); query('dyx')
    expect(await screen.findByRole('alert')).toHaveTextContent('无就诊权限')
    expect(api.encounters.orderableMedications).toHaveBeenCalledExactlyOnceWith('encounter', 'dyx')
    expect(api.masterData.medications).not.toHaveBeenCalled()
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
  })
  it.each(['medication', 'service', 'group'])('rejects mixed partial success when %s is unavailable', async source => {
    const api = fixture(); api.masterData.medications.mockResolvedValue([med]); api.masterData.services.mockResolvedValue([service]); api.masterData.itemGroups.mockResolvedValue([group])
    const endpoint = source === 'medication' ? api.masterData.medications : source === 'service' ? api.masterData.services : api.masterData.itemGroups
    endpoint.mockRejectedValue(new Error('来源加载失败'))
    const view = setup('mixed', api); query('中文')
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
    fireEvent.keyDown(screen.getByLabelText('远程检索'), { key: 'Enter' })
    expect(view.onChange).not.toHaveBeenCalled()
  })
  it.each([undefined, null, {}, [null], [{ id: 'x', code: 'C' }], [{ id: 'x', code: 'C', display: '错误类型' }], [{ ...service, id: '' }], [service, service]])(
    'rejects malformed response %# instead of interpreting it as an empty catalog', async body => {
      const api = fixture(); api.masterData.services.mockResolvedValue(body); setup('service', api); query('X')
      expect(await screen.findByRole('alert')).toBeInTheDocument()
      expect(screen.queryByText('未找到匹配结果')).not.toBeInTheDocument()
      expect(api.masterData.services).toHaveBeenCalledTimes(1)
    })
  it('requires a diagnosis display name instead of accepting another resource shape', async () => {
    const api = fixture(); api.masterData.diseases.mockResolvedValue([service]); setup('diagnosis', api); query('诊断')
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
  })
  it('rejects a missing mixed API source rather than silently skipping it', async () => {
    const api = fixture(); Object.assign(api.masterData, { itemGroups: undefined }); setup('mixed', api); query('中文')
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })
  it('preserves real pinyin matching but propagates supplementary read failures', async () => {
    const api = fixture(); api.encounters.orderableMedications.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('拼音候选读取失败'))
    setup('medication', api, 'enc'); query('dyx')
    expect(await screen.findByRole('alert')).toHaveTextContent('拼音候选读取失败')
    await userEvent.click(screen.getByRole('button', { name: '重新检索' }))
    expect(await screen.findByText('未找到匹配结果')).toBeInTheDocument()
    expect(api.encounters.orderableMedications).toHaveBeenCalledTimes(4)
  })
  it('does not reuse earlier pinyin pools when a new lookup fails', async () => {
    const api = fixture(); api.masterData.medications.mockResolvedValueOnce([]).mockResolvedValueOnce([med])
    setup('medication', api); query('dyx')
    expect(await screen.findByRole('option', { name: /对乙酰氨基酚片/ })).toBeInTheDocument()
    api.masterData.medications.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('候选池不可用'))
    query('dyxa')
    expect(await screen.findByRole('alert')).toHaveTextContent('候选池不可用')
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
  })
  it('does not reuse results across API sessions with the same organization identifier', async () => {
    const first = fixture(); first.masterData.medications.mockResolvedValueOnce([]).mockResolvedValueOnce([med])
    const view = setup('medication', first); query('dyx')
    expect(await screen.findByRole('option', { name: /对乙酰氨基酚片/ })).toBeInTheDocument()
    const second = fixture(); view.switchContext(second); query('dyx')
    expect(await screen.findByText('未找到匹配结果')).toBeInTheDocument()
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
    expect(second.masterData.medications).toHaveBeenCalled()
  })
  it('rechecks a previously successful query instead of indefinitely serving a cached option', async () => {
    const api = fixture(); api.masterData.services.mockResolvedValueOnce([service])
    setup('service', api); query('血')
    expect(await screen.findByRole('option', { name: /血常规/ })).toBeInTheDocument()
    query('无'); expect(await screen.findByText('未找到匹配结果')).toBeInTheDocument()
    api.masterData.services.mockRejectedValueOnce(new Error('服务已不可用')); query('血')
    expect(await screen.findByRole('alert')).toHaveTextContent('服务已不可用')
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
  })
  it('ignores an outstanding response when the encounter changes', async () => {
    const api = fixture(); let resolve!: (value: unknown[]) => void
    api.encounters.orderableMedications.mockReturnValueOnce(new Promise(r => { resolve = r }))
    const view = setup('medication', api, 'first'); query('中文')
    await waitFor(() => expect(api.encounters.orderableMedications).toHaveBeenCalledWith('first', '中文'))
    view.switchContext(api, 'second'); query('中文')
    expect(await screen.findByText('未找到匹配结果')).toBeInTheDocument()
    await act(async () => resolve([med]))
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
  })
  it('marks missing display facts as unknown without inventing western classification or stock shortage', async () => {
    const api = fixture(); api.masterData.medications.mockResolvedValue([{ ...med, sdMedicationType: undefined,
      products: undefined, stockSiteName: '实际药房', availablePackageQuantity: undefined }])
    setup('medication', api); query('药品')
    const option = await screen.findByRole('option', { name: /对乙酰氨基酚片/ })
    expect(option).toHaveTextContent('药品类型待确认')
    expect(option).toHaveTextContent('临床属性待确认')
    expect(option).toHaveTextContent('参考销售价待确认')
    expect(option).toHaveTextContent('库存待确认')
    expect(option).not.toHaveTextContent('西药')
    expect(option).not.toHaveTextContent('缺药')
  })
  it.each([undefined, {}])('does not represent unknown group members as zero selectable items %#', async members => {
    const api = fixture(); api.masterData.itemGroups.mockResolvedValue([{ ...group, members }])
    setup('mixed', api); query('/组套')
    const option = await screen.findByRole('option', { name: /体检组套/ })
    expect(option).toBeDisabled()
    expect(option).toHaveTextContent('明细待确认')
    expect(option).not.toHaveTextContent('0项')
  })
  it.each([['.中文', 'services'], ['/中文', 'itemGroups'], ['中文', 'medications']] as const)(
    'prefix query %s only requires its selected source', async (keyword, endpoint) => {
      const api = fixture(); setup('mixed', api, undefined, 'prefix'); query(keyword)
      expect(await screen.findByText('未找到匹配结果')).toBeInTheDocument()
      expect(api.masterData[endpoint]).toHaveBeenCalledOnce()
      for (const name of ['services', 'itemGroups', 'medications'] as const) if (name !== endpoint) expect(api.masterData[name]).not.toHaveBeenCalled()
    })
})
