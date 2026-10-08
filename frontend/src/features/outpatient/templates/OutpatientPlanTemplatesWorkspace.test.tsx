import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import type { RhnApi } from '../../../shared/rhnApi'
import { OutpatientPlanTemplatesWorkspace } from './OutpatientPlanTemplatesWorkspace'

it('shows education and follow-up once and keeps applicability in a tooltip', async () => {
  const api = { outpatientPlanTemplates: { list: vi.fn().mockResolvedValue([{
    id: 'plan', revision: 0, scopeType: 'PERSONAL', status: 'ACTIVE', name: '门诊复诊方案', sourceType: 'MANUAL', useCount: 0,
    noteTemplateId: 'note', diagnoses: [], medications: [], services: [],
    tasks: [{ kind: 'EDUCATION', text: '注意休息' }, { kind: 'FOLLOW_UP', text: '一周复诊' }, { kind: 'CONDITION', text: '仅适用于平稳复诊' }],
    searchProfile: { summary: '复诊病历与诊疗方案', conditions: ['仅适用于平稳复诊'], keywords: ['复诊'] },
  }]) }, outpatientNoteTemplates: { list: vi.fn().mockResolvedValue([{
    id: 'note', scopeType: 'PERSONAL', status: 'ACTIVE', name: '配套病历',
    content: { chiefComplaint: '复诊', healthEducation: '注意休息', followUp: '一周复诊' },
  }]) } } as unknown as RhnApi
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <OutpatientPlanTemplatesWorkspace api={api} />
  </QueryClientProvider>)
  await waitFor(() => expect(screen.getByText('注意休息')).toBeInTheDocument())
  expect(screen.getAllByText('一周复诊')).toHaveLength(1)
  expect(screen.queryByText('宣教、随访与补充说明')).not.toBeInTheDocument()
  expect(screen.queryByText('仅适用于平稳复诊')).not.toBeInTheDocument()
  await userEvent.hover(screen.getByRole('button', { name: '查看方案适用条件' }))
  expect(await screen.findByRole('tooltip')).toHaveTextContent('仅适用于平稳复诊')
})

it('renders medication preparation spec inline behind medication name', async () => {
  const api = { outpatientPlanTemplates: { list: vi.fn().mockResolvedValue([{
    id: 'plan-med', revision: 0, scopeType: 'PERSONAL', status: 'ACTIVE', name: '抗感染方案', sourceType: 'MANUAL', useCount: 0,
    diagnoses: [], medications: [{
      lineId: 'line-1', medicationId: 'med-1', medicationName: '阿莫西林胶囊', preparationSpec: '0.125g',
      doseValue: 0.5, doseUnit: 'g', routeName: '口服', frequencyCode: 'TID', durationValue: 7, durationUnit: '天',
    }], services: [], tasks: [],
  }]) }, outpatientNoteTemplates: { list: vi.fn().mockResolvedValue([]) } } as unknown as RhnApi
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <OutpatientPlanTemplatesWorkspace api={api} />
  </QueryClientProvider>)
  await waitFor(() => expect(screen.getByText('阿莫西林胶囊')).toBeInTheDocument())
  const specEl = screen.getByText('0.125g')
  expect(specEl).toHaveClass('doctor-plan-item-spec')
  const medCell = specEl.closest('.doctor-plan-med-name-cell')
  expect(medCell).toBeInTheDocument()
  expect(medCell).toHaveTextContent('阿莫西林胶囊0.125g')
})

it('opens edit modal when clicking 编辑方案', async () => {
  const api = {
    outpatientPlanTemplates: { list: vi.fn().mockResolvedValue([{
      id: 'plan-1', revision: 0, scopeType: 'PERSONAL', status: 'ACTIVE', name: '社区获得性肺炎轻症', sourceType: 'AI_INPUT', useCount: 0,
      noteTemplateId: 'note-1',
      diagnoses: [{ code: 'J18.9', display: '肺炎，未特指', type: 'PRIMARY' }],
      medications: [{
        lineId: 'line-1', medicationId: 'med-1', medicationName: '阿莫西林胶囊', preparationSpec: '0.125g',
        doseValue: 0.5, doseUnit: 'g', routeName: '口服', frequencyCode: 'TID', durationValue: 7, durationUnit: '天',
      }],
      services: [],
      tasks: null as any,
    }]) },
    outpatientNoteTemplates: { list: vi.fn().mockResolvedValue([{
      id: 'note-1', revision: 0, scopeType: 'PERSONAL', status: 'ACTIVE', name: '社区获得性肺炎轻症-病历',
      specialtyCode: 'GENERAL_PRACTICE', documentType: 'OUTPATIENT_NOTE', contentSchema: 'RHN.OUTPATIENT_NOTE_TEMPLATE.V1',
      sortOrder: 0, useCount: 0,
      content: { chiefComplaint: '咳嗽3天', annotations: null as any },
    }]) },
    masterData: {
      clinicalMedicationStandards: vi.fn().mockResolvedValue({ routes: [], frequencies: [], doseUnits: [] }),
    },
  } as unknown as RhnApi
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <OutpatientPlanTemplatesWorkspace api={api} />
  </QueryClientProvider>)
  await waitFor(() => expect(screen.getByText('编辑方案')).toBeInTheDocument())
  await userEvent.click(screen.getByText('编辑方案'))
  expect(await screen.findByText('方案调整与明细微调')).toBeInTheDocument()
  expect(await screen.findByDisplayValue('咳嗽3天')).toBeInTheDocument()
})


