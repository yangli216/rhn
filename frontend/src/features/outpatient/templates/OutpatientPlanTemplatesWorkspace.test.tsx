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
