import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { PractitionerDetail, RhnApi } from '../../shared/rhnApi'
import { PersonnelLifecycleDialog } from './PersonnelLifecycleDialog'
const person = { id: 'person', revision: 1, code: 'P001', fullName: '测试医生', sdPractGender: '1', sdPractGenderText: '男',
  sdPersonnelStatus: 'ACTIVE', sdPersonnelStatusText: '正常', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }
const employment = { id: 'employment', revision: 1, code: 'E001', practitionerId: 'person', organizationId: 'org', organizationName: '机构',
  sdEmploymentType: 'PERMANENT', sdEmploymentTypeText: '正式', primaryEmployment: true, hireDate: '2026-01-01', sdPersonnelStatus: 'ACTIVE', sdPersonnelStatusText: '正常' }
const assignment = { id: 'assignment', revision: 1, code: 'A001', employmentId: 'employment', practitionerId: 'person', practitionerCode: 'P001',
  practitionerName: '测试医生', sdPractGender: '1', organizationId: 'org', organizationName: '机构', departmentId: 'dept', departmentName: '科室',
  positionId: 'position', positionName: '岗位', sdPositionType: 'CLINICAL', sdPositionTypeText: '临床', sdAssignmentType: 'PRIMARY', sdAssignmentTypeText: '主任职',
  primaryAssignment: true, workloadPercent: 100, sdPersonnelStatus: 'ACTIVE', sdPersonnelStatusText: '正常', validFrom: '2026-01-01' }
const detail = { practitioner: person, employments: [employment], assignments: [assignment] } as PractitionerDetail
function show(endAssignment: ReturnType<typeof vi.fn>, snapshot = detail) {
  const onSaved = vi.fn(), onRefresh = vi.fn().mockResolvedValue(undefined)
  const api = { organization: { endAssignment } } as unknown as RhnApi
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
    <PersonnelLifecycleDialog api={api} action={{ kind: 'end-assignment', value: detail.assignments[0] }} detail={snapshot}
      units={[]} positions={[]} available onRefresh={onRefresh} onClose={vi.fn()} onSaved={onSaved} />
  </QueryClientProvider>)
  return { onSaved, onRefresh }
}
describe('personnel lifecycle write confirmation', () => {
  it('retains the draft after failure and confirms the saved end date on retry', async () => {
    const user = userEvent.setup()
    const write = vi.fn().mockRejectedValueOnce(new Error('暂时失败')).mockImplementation(async (_id, input) => ({ ...detail,
      assignments: [{ ...assignment, revision: 2, validTo: input.lastDay }] }))
    const { onSaved, onRefresh } = show(write)
    await user.type(screen.getByLabelText(/变更原因/), '结束轮转')
    await user.clear(screen.getByLabelText(/最后工作日/))
    await user.type(screen.getByLabelText(/最后工作日/), '2026-10-15')
    await user.click(screen.getByRole('button', { name: '结束任职' }))
    expect(await screen.findByText('暂时失败')).toBeInTheDocument()
    expect(screen.getByLabelText(/变更原因/)).toHaveValue('结束轮转')
    expect(onSaved).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '重新核实维护档案' }))
    expect(onRefresh).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: '结束任职' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce())
    expect(write).toHaveBeenLastCalledWith('assignment', { expectedRevision: 1, lastDay: '2026-10-15', reason: '结束轮转' })
  })
  it('rejects a receipt that silently drops an unrelated relationship', async () => {
    const user = userEvent.setup()
    const extra = { ...employment, id: 'second', code: 'E002', primaryEmployment: false } as PractitionerDetail['employments'][number]
    const write = vi.fn().mockImplementation(async (_id, input) => ({ ...detail, assignments: [{ ...assignment, revision: 2, validTo: input.lastDay }] }))
    const { onSaved } = show(write, { ...detail, employments: [...detail.employments, extra] })
    await user.type(screen.getByLabelText(/变更原因/), '结束任职')
    await user.click(screen.getByRole('button', { name: '结束任职' }))
    expect(await screen.findByText(/缺少原有关系记录/)).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()
  })
  it('locks duplicate submits while a request is pending', async () => {
    const user = userEvent.setup(); let finish!: (value: unknown) => void
    const write = vi.fn().mockImplementation(() => new Promise(resolve => { finish = resolve }))
    show(write)
    await user.type(screen.getByLabelText(/变更原因/), '结束任职')
    const save = screen.getByRole('button', { name: '结束任职' })
    await user.click(save)
    expect(screen.getByRole('button', { name: '取消' })).toBeDisabled()
    await user.click(save)
    expect(write).toHaveBeenCalledOnce()
    finish({ ...detail, assignments: [{ ...assignment, revision: 2, validTo: screen.getByLabelText(/最后工作日/).getAttribute('value') }] })
    await waitFor(() => expect(save).toBeEnabled())
  })
})
