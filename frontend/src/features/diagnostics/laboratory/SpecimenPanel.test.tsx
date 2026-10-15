import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { DiagnosticExecutionTask } from '../../../shared/api/diagnosticsApi'
import type { RhnApi } from '../../../shared/rhnApi'
import { SpecimenPanel } from './SpecimenPanel'

const task: DiagnosticExecutionTask = {
  id: 'task-1',
  taskNo: null,
  requestId: 'req-1',
  requestNo: 'REQ-2026-0001',
  itemCode: 'LAB-CBC-5DIFF',
  itemName: '血常规五分类',
  requestType: 'LABORATORY',
  status: 'READY',
  revision: 1,
  organizationId: 'org-1',
  departmentId: 'dept-1',
  residentId: 'res-1',
  residentName: '张三',
  healthRecordNo: 'HR-0001',
  encounterId: 'enc-1',
  createdAt: '2026-10-14T00:00:00Z',
}

describe('SpecimenPanel with YY/T 0314-2007 tube standards', () => {
  it('renders recommended tube color and additive for pending lab tasks', async () => {
    const api = {
      diagnostics: {
        specimens: vi.fn().mockResolvedValue([]),
        generateSpecimens: vi.fn(),
      },
    } as unknown as RhnApi

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <SpecimenPanel
          api={api}
          task={task}
          candidates={[task]}
          onRefresh={vi.fn().mockResolvedValue(undefined)}
          refreshing={false}
        />
      </QueryClientProvider>
    )

    expect(await screen.findByText('EDTA-K2抗凝管（紫头管）')).toBeInTheDocument()
    expect(screen.getByText(/乙二胺四乙酸二钾/)).toBeInTheDocument()
  })

  it('provides standard rejection reasons in rejection dialog and auto-fills reason', async () => {
    const user = userEvent.setup()
    const mockSpecimen = {
      id: 'spec-1',
      specimenNo: 'SPEC-20261014-001',
      specimenName: '全血',
      containerName: 'EDTA紫头管',
      containerCode: 'TUBE_PURPLE_EDTA',
      status: 'COLLECTED',
      taskIds: ['task-1'],
      revision: 1,
      collectedAt: '2026-10-14T10:00:00Z',
    }

    const api = {
      diagnostics: {
        specimens: vi.fn().mockResolvedValue([mockSpecimen]),
        rejectSpecimen: vi.fn().mockResolvedValue({}),
      },
    } as unknown as RhnApi

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <SpecimenPanel
          api={api}
          task={{ ...task, status: 'COLLECTED' }}
          candidates={[]}
          onRefresh={vi.fn().mockResolvedValue(undefined)}
          refreshing={false}
        />
      </QueryClientProvider>
    )

    expect(await screen.findByText('SPEC-20261014-001')).toBeInTheDocument()
    const rejectBtn = screen.getByRole('button', { name: '拒收标本' })
    fireEvent.click(rejectBtn)

    expect(screen.getByRole('heading', { name: '拒收标本' })).toBeInTheDocument()
    const trigger = screen.getByRole('combobox', { name: '快速选择标准原因' })
    await user.click(trigger)

    const option = await screen.findByRole('option', { name: /标本严重溶血/ })
    await user.click(option)

    const input = screen.getByLabelText(/拒收原因/) as HTMLInputElement
    expect(input.value).toBe('标本严重溶血')
  })
})
