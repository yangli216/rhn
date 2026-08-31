import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { PersonnelAssignment, Practitioner } from '../../shared/api/organizationApi'
import type { WardMedicationReturnRequest } from '../../shared/api/pharmacyApi'
import type { RhnApi } from '../../shared/rhnApi'
import { WardMedicationReturnInbox } from './WardMedicationReturnInbox'

const practitioner = {
  id: 'pharmacist-1', code: 'P001', fullName: '药师甲', sdPersonnelStatus: 'ACTIVE',
} as Practitioner

const assignment = {
  id: 'assignment-1', code: 'PA001', positionName: '住院药师', departmentName: '住院药房',
  sdPersonnelStatus: 'ACTIVE',
} as PersonnelAssignment

const inTransit: WardMedicationReturnRequest = {
  id: 'ward-return-1', revision: 1, requestNo: 'WMR001', status: 'IN_TRANSIT',
  organizationId: 'org-1', stockSiteId: 'site-1', nursingUnitDepartmentId: 'ward-1',
  residentId: 'resident-1', encounterId: 'encounter-1', requestedAt: '2026-08-31T09:00:00+08:00',
  requestedBy: 'nurse-1', requestNote: '停嘱后未使用', handedOverAt: '2026-08-31T09:05:00+08:00',
  handedOverBy: 'nurse-1', handoverNote: '与配送员当面交出',
  lines: [{ id: 'ward-return-line-1', requestId: 'order-1', originalDispenseId: 'dispense-1',
    originalDispenseLineId: 'dispense-line-1', dispenseTaskLineId: 'task-line-1', medicationName: '阿莫西林胶囊',
    requestedQuantity: 1, unitCode: '粒', requestedBaseQuantity: 1, baseUnitCode: '粒' }],
  events: [],
}

function renderInbox(api: RhnApi) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}><WardMedicationReturnInbox api={api}
    practitioners={[practitioner]} assignments={[assignment]} practitionerId={practitioner.id}
    assignmentId={assignment.id} onPractitionerChange={vi.fn()} onAssignmentChange={vi.fn()} />
  </QueryClientProvider>)
}

describe('WardMedicationReturnInbox', () => {
  it('receives every handed-over line with a pharmacy disposition', async () => {
    const received: WardMedicationReturnRequest = {
      ...inTransit, revision: 2, status: 'RECEIVED', receivedAt: '2026-08-31T09:10:00+08:00',
      receivedBy: 'pharmacy-user-1', processorPractitionerId: practitioner.id,
      processorAssignmentId: assignment.id, receiptNote: '包装完好，重新入库',
      lines: inTransit.lines.map((line) => ({ ...line, disposition: 'RESTOCK', stockReturnId: 'return-1',
        returnDispenseId: 'return-dispense-1' })),
    }
    const api = { pharmacy: {
      wardMedicationReturns: vi.fn().mockResolvedValue([inTransit]),
      receiveWardMedicationReturn: vi.fn().mockResolvedValue(received),
    } } as unknown as RhnApi
    vi.stubGlobal('crypto', { randomUUID: () => 'receive-command' })
    renderInbox(api)

    const card = await screen.findByRole('article', { name: '病区退药 WMR001' })
    expect(within(card).getByText('待药房接收')).toBeInTheDocument()
    expect(within(card).getByRole('combobox', { name: '退药处置 阿莫西林胶囊' })).toHaveTextContent('验收合格，重新入库')
    await userEvent.type(within(card).getByLabelText('验收说明'), '包装完好，重新入库')
    await userEvent.click(within(card).getByRole('button', { name: '逐项验收并接收' }))

    await waitFor(() => expect(api.pharmacy.receiveWardMedicationReturn).toHaveBeenCalledWith('ward-return-1', {
      expectedRevision: 1,
      commandCode: 'WARD-RETURN-RECEIVE-ward-return-1-receive-command',
      processorPractitionerId: practitioner.id,
      processorAssignmentId: assignment.id,
      note: '包装完好，重新入库',
      lines: [{ returnRequestLineId: 'ward-return-line-1', disposition: 'RESTOCK' }],
    }))
    expect(await within(card).findByText('已接收')).toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: '逐项验收并接收' })).not.toBeInTheDocument()
  })
})
