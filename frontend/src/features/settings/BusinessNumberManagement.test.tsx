import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ClinicalContext } from '../../shared/clinical/workContext'
import type { BusinessNumberRuleView, RhnApi } from '../../shared/rhnApi'
import { BusinessNumberManagement } from './BusinessNumberManagement'

const context = { organization: { id: 'org', name: '当前机构' }, department: { id: 'dept', name: '当前科室' } } as ClinicalContext
const row: BusinessNumberRuleView = { businessCode: 'outpatient-encounter',
  rule: { prefix: 'OP', suffix: '', dateFormat: 'yyMMdd', sequenceWidth: 5, scope: 'TENANT' },
  sequence: { businessDate: '2026-10-12', zoneId: 'Asia/Shanghai', scopeKey: 'tenant:1',
    currentSequence: 0, nextSequence: '1', maximumSequence: 99999, nextNumber: 'OP26101200001' }, status: 'AVAILABLE' }
function show(rules: () => Promise<BusinessNumberRuleView[]>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><BusinessNumberManagement tenantId="1" context={context}
    api={{ businessNumbering: { rules } } as unknown as RhnApi} /></QueryClientProvider>)
}

describe('业务编码管理', () => {
  it('shows zero consumption, searches by business name, and refreshes the available sequence', async () => {
    const rules = vi.fn().mockResolvedValueOnce([row]).mockResolvedValueOnce([{ ...row,
      sequence: { ...row.sequence, currentSequence: 1, nextSequence: '2', nextNumber: 'OP26101200002' } }])
    show(rules)
    await screen.findByText('OP26101200001')
    expect(screen.getByText('0')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '门诊就诊' } })
    expect(screen.getByText('OP26101200001')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '刷新流水' }))
    await screen.findByText('OP26101200002')
    expect(rules).toHaveBeenCalledTimes(2)
  })

  it('keeps the rule visible when its counter is unavailable or exhausted', async () => {
    show(async () => [{ ...row, sequence: undefined, status: 'BUSINESS_NUMBER_UNAVAILABLE', message: '流水查询暂不可用' },
      { ...row, businessCode: 'prescription', status: 'EXHAUSTED',
        sequence: { ...row.sequence, currentSequence: 99999, nextSequence: undefined, nextNumber: undefined } }])
    await screen.findByText('流水查询暂不可用')
    expect(screen.getByText('流水已用尽')).toBeInTheDocument()
    expect(screen.queryByText('OP26101200001')).not.toBeInTheDocument()
  })

  it('shows permission failure with a retry instead of an empty rule list', async () => {
    show(async () => { throw new Error('无权查看业务编码') })
    await screen.findByText('无权查看业务编码')
    expect(screen.getByText('编码规则查询失败')).toBeInTheDocument()
    expect(screen.queryByText('暂无匹配规则')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '刷新流水' })).toBeEnabled()
  })
})
