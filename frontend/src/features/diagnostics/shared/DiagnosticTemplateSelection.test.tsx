import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { DiagnosticTemplateVersion } from '../../../shared/api/diagnosticTemplateTypes'
import { DiagnosticTemplateSelection } from './DiagnosticTemplateSelection'

const template: DiagnosticTemplateVersion = { id: 'tpl1', organizationId: 'org1', catalogItemId: 'catalog1', version: 1,
  serviceType: 'LABORATORY', effectiveFrom: '2026-01-01', publicationBasis: '机构测试规则', publishedBy: 'user1', publishedAt: '2026-01-01T00:00:00Z',
  content: { minimumImages: 0, requiredChecks: [], phrases: [], indicators: [{ code: 'GLU', name: '血糖', valueType: 'NUMBER',
    required: true, unitCode: 'mmol/L', allowedCodes: [], rules: [] }, { code: 'QUAL', name: '定性', valueType: 'CODE', required: true, allowedCodes: ['NEG','POS'], rules: [] }] } }
describe('explicit diagnostic template selection', () => {
  it('creates empty typed results only after explicit template selection', () => {
    const change=vi.fn()
    render(<DiagnosticTemplateSelection current={template} input={{ expectedRevision: 1 }} disabled={false} onChange={change} />)
    expect(change).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button',{ name: '载入机构模板 V1' }))
    const input=change.mock.calls[0][0]
    expect(input.templateVersionId).toBe('tpl1')
    expect(input.observations).toEqual([
      expect.objectContaining({ observationCode: 'GLU', observationValue: '', valueComparator: 'EQ' }),
      expect.objectContaining({ observationCode: 'QUAL', valueType: 'CODE', observationValue: '', valueComparator: undefined }),
    ])
    expect(input.observations.every((value: { interpretationCode?: string })=>value.interpretationCode === undefined)).toBe(true)
  })
  it('preserves entered results until replacement is confirmed', () => {
    const change=vi.fn()
    render(<DiagnosticTemplateSelection current={template} input={{ expectedRevision: 1, observations: [{ observationCode:'OLD',
      observationName:'旧指标', valueType:'NUMBER', observationValue:'12' }] }} disabled={false} onChange={change} />)
    fireEvent.click(screen.getByRole('button',{ name: '载入机构模板 V1' }))
    expect(change).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button',{ name: '保留当前内容' }))
    expect(change).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button',{ name: '载入机构模板 V1' }))
    fireEvent.click(screen.getByRole('button',{ name: '载入并清空指标结果' }))
    expect(change).toHaveBeenCalledOnce()
  })
  it('does not insert examination conclusions automatically', async () => {
    const change=vi.fn(); const exam={ ...template, serviceType:'EXAMINATION' as const, content:{ ...template.content, indicators:[],
      phrases:[{ code:'PHRASE1', title:'所见词条', findings:'测量 {{尺寸}}', conclusion:'需结合临床' }] } }
    render(<DiagnosticTemplateSelection current={exam} selected={exam} input={{ expectedRevision:1, findings:'原所见', conclusion:'原结论' }} disabled={false} onChange={change} />)
    expect(change).not.toHaveBeenCalled()
    const user=userEvent.setup()
    await user.click(screen.getByRole('combobox',{ name:'选择检查词条' }))
    await user.click(screen.getByRole('option',{ name:'所见词条' }))
    await user.click(screen.getByRole('button',{ name:'插入检查词条' }))
    expect(change).toHaveBeenCalledWith({ findings:'原所见\n测量 {{尺寸}}', conclusion:'原结论\n需结合临床' })
  })
})
