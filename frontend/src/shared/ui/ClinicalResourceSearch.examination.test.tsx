import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { RhnApi } from '../rhnApi'
import { ClinicalResourceSearch } from './ClinicalResourceSearch'

const service = { id: 'ct', code: 'CT01', name: 'CT平扫', sdServiceType: 'EXAMINATION', prices: [] }
const head = { variantId: 'site-head', code: 'HEAD', name: '头部' }
const abdomen = { variantId: 'site-abdomen', code: 'ABDOMEN', name: '腹部' }
const result = { services: [service], candidates: [head, abdomen].map(site => ({ catalogItemId: service.id, site })) }
function fixture() {
  return { masterData: { services: vi.fn().mockResolvedValue([]), medications: vi.fn().mockResolvedValue([]),
    itemGroups: vi.fn().mockResolvedValue([]) }, outpatientPlanTemplates: { list: vi.fn().mockResolvedValue([]) },
    encounters: { searchExaminationOrders: vi.fn().mockResolvedValue(result), orderableMedications: vi.fn().mockResolvedValue([]) } }
}
function query(text: string) { fireEvent.change(screen.getByLabelText('远程检索'), { target: { value: text } }) }

describe('examination single-site search', () => {
  it.each(['头部CT', 'tbct'])('keeps distinct sites on the same service and carries the chosen site for %s', async text => {
    const api = fixture(), onChange = vi.fn()
    render(<ClinicalResourceSearch api={api as unknown as RhnApi} resource="service" encounterId="enc" organizationId="org"
      includeExaminationSites defaultOpen debounceMs={0} onChange={onChange} />)
    query(text)
    await userEvent.click(await screen.findByRole('option', { name: /头部 · CT平扫/ }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      value: 'examination-site:ct:site-head', raw: service, examinationSite: head,
    }))
    expect(api.encounters.searchExaminationOrders).toHaveBeenCalledExactlyOnceWith('enc', text)
    expect(api.masterData.services).toHaveBeenCalledExactlyOnceWith(text, '', 'ACTIVE', 'org')
  })

  it('retains both site candidates and the original project without duplicate identities', async () => {
    const api = fixture(); api.masterData.services.mockResolvedValue([service] as never)
    render(<ClinicalResourceSearch api={api as unknown as RhnApi} resource="mixed" encounterId="enc" includeExaminationSites
      defaultOpen debounceMs={0} onChange={vi.fn()} />)
    query('CT')
    await screen.findByRole('option', { name: /头部 · CT平扫/ })
    expect(screen.getAllByRole('option')).toHaveLength(3)
  })

  it('respects prefix mode and does not query examination combinations for medications or groups', async () => {
    const api = fixture()
    render(<ClinicalResourceSearch api={api as unknown as RhnApi} resource="mixed" encounterId="enc" includeExaminationSites
      searchMode="prefix" defaultOpen debounceMs={0} onChange={vi.fn()} />)
    query('阿莫西林'); await screen.findByText('未找到匹配结果')
    expect(api.encounters.searchExaminationOrders).not.toHaveBeenCalled()
    query('/组合'); await waitFor(() => expect(api.masterData.itemGroups).toHaveBeenCalled())
    expect(api.encounters.searchExaminationOrders).not.toHaveBeenCalled()
    query('.tbct'); await screen.findByRole('option', { name: /头部 · CT平扫/ })
    expect(api.encounters.searchExaminationOrders).toHaveBeenCalledExactlyOnceWith('enc', 'tbct')
  })

  it('reports errors without a whole-catalog pinyin fallback or partial successful candidates', async () => {
    const api = fixture(); api.encounters.searchExaminationOrders.mockRejectedValue(new Error('组合查询失败'))
    api.masterData.services.mockResolvedValue([service] as never)
    render(<ClinicalResourceSearch api={api as unknown as RhnApi} resource="service" encounterId="enc" includeExaminationSites
      defaultOpen debounceMs={0} onChange={vi.fn()} />)
    query('tbct')
    expect(await screen.findByRole('alert')).toHaveTextContent('组合查询失败')
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
    expect(api.masterData.services).toHaveBeenCalledTimes(1)
  })

  it('ignores a late result after the encounter context changes', async () => {
    const api = fixture(); let resolve: (value: typeof result) => void = () => {}
    api.encounters.searchExaminationOrders.mockReturnValueOnce(new Promise(done => { resolve = done }))
    const onChange = vi.fn()
    const content = (encounterId: string) => <ClinicalResourceSearch api={api as unknown as RhnApi} resource="service"
      encounterId={encounterId} includeExaminationSites defaultOpen debounceMs={0} onChange={onChange} />
    const view = render(content('A')); query('tbct')
    await waitFor(() => expect(api.encounters.searchExaminationOrders).toHaveBeenCalledWith('A', 'tbct'))
    view.rerender(content('B'))
    await act(async () => { resolve(result) })
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it.each([
    { services: [service], candidates: [{ catalogItemId: 'missing', site: head }] },
    { services: [service], candidates: [{ catalogItemId: 'ct', site: { ...head, variantId: '' } }] },
    { services: [service], candidates: [result.candidates[0], result.candidates[0]] },
  ])('rejects incomplete or repeated combinations %#', async body => {
    const api = fixture(); api.encounters.searchExaminationOrders.mockResolvedValue(body as never)
    render(<ClinicalResourceSearch api={api as unknown as RhnApi} resource="service" encounterId="enc" includeExaminationSites
      defaultOpen debounceMs={0} onChange={vi.fn()} />)
    query('头部CT')
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
  })
})
