import { act, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import type { DiseaseManagementProgram, RhnApi } from '../../shared/rhnApi'
import { DiseaseManagementMembersDialog } from './BasicDataManagement'

describe('disease management member identity', () => {
  it.each([
    [null, '西医诊断', '体系待确认'], ['WESTERN_MEDICINE', '西医诊断', '西医诊断'],
    ['TCM_DISEASE', '中医病名', '中医病名'], ['TCM_SYNDROME', '中医证候', '中医证候'],
    ['TCM_DISEASE', undefined, '体系名称待确认'],
  ] as const)('renders the actual domain %s and preserves member identity on save', async (domain, translated, label) => {
    const program: DiseaseManagementProgram = {
      id: 'program', revision: 2, scopeType: 'TENANT', scopeId: 'tenant', code: 'REGISTRY', name: '管理项目',
      sdManagementType: 'SPECIAL_REGISTRY', sdManagementTypeText: '专项登记',
      sdTriggerAction: 'PROMPT_CONFIRMATION', sdTriggerActionText: '提示确认', sdStatus: 'ACTIVE', sdStatusText: '有效',
      effectiveFrom: '2026-01-01', ruleCount: 0, exceptionCount: 1, rules: [],
      members: [{ conceptId: 'concept', inclusionMode: 'INCLUDE', code: domain ? 'CODE' : null,
        display: domain ? '目录概念' : '概念信息待确认', systemName: domain ? '真实编码体系' : '未知编码体系',
        sdDiagnosisDomain: domain, sdDiagnosisDomainText: translated, note: null }],
    }
    const api = { masterData: { searchDiseases: vi.fn() } } as unknown as RhnApi
    const onSave = vi.fn().mockResolvedValue({ ...program, revision: 3 })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
    render(<QueryClientProvider client={client}><DiseaseManagementMembersDialog program={program} api={api}
      dictionaries={{}} codeSystems={[]} onClose={vi.fn()} onSave={onSave} /></QueryClientProvider>)
    expect(screen.getByText(`${label} · ${domain ? '真实编码体系' : '未知编码体系'}`)).toBeInTheDocument()
    if (!domain) {
      expect(screen.getByText('编码待确认')).toBeInTheDocument()
      expect(screen.queryByText(/西医诊断/)).not.toBeInTheDocument()
      expect(screen.queryByText(/已删除/)).not.toBeInTheDocument()
    }
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '保存识别范围' })))
    expect(onSave).toHaveBeenCalledWith([], [{ conceptId: 'concept', inclusionMode: 'INCLUDE', note: null }])
    expect(api.masterData.searchDiseases).not.toHaveBeenCalled()
  })
})
