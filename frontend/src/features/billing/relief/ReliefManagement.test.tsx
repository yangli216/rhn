import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ReliefPolicy, ReliefRosterEntry } from '../../../shared/api/reliefApi'
import type { RhnApi } from '../../../shared/rhnApi'
import { ReliefPolicyManagement } from './ReliefPolicyManagement'
import { ReliefRosterManagement } from './ReliefRosterManagement'

const enumItems: Record<string, string[]> = {
  BIL_RELIEF_TIMING: ['PRE_INSURANCE', 'POST_INSURANCE'], BIL_RELIEF_SPONSOR: ['HOSPITAL', 'GOVERNMENT'],
  BIL_SETTLEMENT_SCENE: ['OUTPATIENT', 'PHARMACY'], BIL_RELIEF_POLICY_STATUS: ['DRAFT', 'ACTIVE'],
  BIL_RELIEF_ROSTER_STATUS: ['ACTIVE', 'REVOKED'],
}
const dictionaries = {
  systemEnum: vi.fn(async (code: string) => ({ code, items: (enumItems[code] ?? []).map((value, index) =>
    ({ code: value, name: value, sortOrder: index })) })),
  get: vi.fn().mockResolvedValue({ items: [] }),
  resolve: vi.fn().mockResolvedValue([]),
}

function renderWithQuery(children: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}>{children}</QueryClientProvider>)
}

const version = {
  id: 'v2', versionNo: 2, status: 'DRAFT', timing: 'POST_INSURANCE', sponsor: 'GOVERNMENT',
  scope: { organizationIds: [], scenes: ['OUTPATIENT'] }, effectiveFrom: '2026-01-01', priority: 10, stackable: true,
  qualificationMode: 'ANY', insuredApplicable: true, baseIncludesPersonalAccount: false, quotaPeriod: 'YEAR',
  periodMaxAmount: 2000, shareAcrossScenes: true, shareAcrossOrganizations: true,
  rules: [{ feeScope: 'ALL', method: 'RATIO', ratio: 0.5, excluded: false }],
  qualifications: [{ source: 'ROSTER', qualificationType: 'MINIMUM_LIVING' }],
}
const policy = {
  id: 'p1', revision: 4, code: 'CIVIL', name: '民政医疗救助', status: 'ACTIVE', statusText: '生效中',
  current: { ...version, id: 'v1', versionNo: 1, status: 'PUBLISHED' }, draft: version,
  versions: [{ id: 'v2', versionNo: 2, status: 'DRAFT' }, { id: 'v1', versionNo: 1, status: 'PUBLISHED' }],
} as ReliefPolicy

describe('ReliefPolicyManagement', () => {
  it('saves the edited draft with the loaded revision and publishes it', async () => {
    const saved = { ...policy, revision: 5, name: '民政医疗救助（2026）' }
    const relief = {
      policies: vi.fn().mockResolvedValue([{ id: 'p1', revision: 4, code: 'CIVIL', name: '民政医疗救助', status: 'ACTIVE',
        statusText: '生效中', timingText: '医保后减免', currentVersionNo: 1, hasDraft: true }]),
      policy: vi.fn().mockResolvedValue(policy),
      updateDraft: vi.fn().mockResolvedValue(saved),
      publish: vi.fn().mockResolvedValue({ ...saved, revision: 6, draft: undefined }),
    }
    renderWithQuery(<ReliefPolicyManagement api={{ relief, dictionaries } as unknown as RhnApi} canManage />)

    const name = await screen.findByLabelText(/^政策名称/)
    expect(name).toHaveValue('民政医疗救助')
    expect(screen.getByText(/正在编辑草稿 V2，当前生效 V1/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '发布' })).toBeEnabled()

    await userEvent.type(name, '（2026）')
    expect(screen.getByRole('button', { name: '发布' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: '保存草稿' }))

    await waitFor(() => expect(relief.updateDraft).toHaveBeenCalledWith('p1', expect.objectContaining({
      expectedRevision: '4', name: '民政医疗救助（2026）',
      draft: expect.objectContaining({ timing: 'POST_INSURANCE', sponsor: 'GOVERNMENT', quotaPeriod: 'YEAR', periodMaxAmount: 2000,
        rules: [expect.objectContaining({ feeScope: 'ALL', method: 'RATIO', ratio: 0.5 })],
        qualifications: [{ source: 'ROSTER', qualificationType: 'MINIMUM_LIVING' }] }),
    })))
    expect(await screen.findByText('草稿已保存')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '发布' }))
    await waitFor(() => expect(relief.publish).toHaveBeenCalledWith('p1', '5'))
  })

  it('is read-only without the manage authority', async () => {
    const relief = {
      policies: vi.fn().mockResolvedValue([{ id: 'p1', revision: 4, code: 'CIVIL', name: '民政医疗救助', status: 'ACTIVE' }]),
      policy: vi.fn().mockResolvedValue(policy),
    }
    renderWithQuery(<ReliefPolicyManagement api={{ relief, dictionaries } as unknown as RhnApi} canManage={false} />)
    expect(await screen.findByLabelText(/^政策名称/)).toBeDisabled()
    expect(screen.queryByRole('button', { name: '保存草稿' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '新建政策' })).not.toBeInTheDocument()
  })
})

describe('ReliefRosterManagement', () => {
  it('revokes an entry with a reason and the current revision', async () => {
    const entry = { id: 'r1', revision: 2, qualificationType: 'FAMILY_DOCTOR_SIGNED', qualificationTypeText: '家庭医生签约',
      residentId: 'res-1', residentName: '张三', effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31', status: 'ACTIVE',
      statusText: '有效' } as ReliefRosterEntry
    const relief = {
      roster: vi.fn().mockResolvedValue([entry]),
      revokeRoster: vi.fn().mockResolvedValue({ ...entry, status: 'REVOKED' }),
    }
    renderWithQuery(<ReliefRosterManagement api={{ relief, dictionaries } as unknown as RhnApi} canEdit />)

    expect(await screen.findByText('张三')).toBeInTheDocument()
    expect(relief.roster).toHaveBeenCalledWith({ status: 'ACTIVE' })
    await userEvent.click(screen.getByRole('button', { name: '停用' }))
    const confirm = screen.getByRole('button', { name: '确认停用' })
    expect(confirm).toBeDisabled()
    await userEvent.type(screen.getByLabelText(/停用原因/), '签约解除')
    await userEvent.click(confirm)

    await waitFor(() => expect(relief.revokeRoster).toHaveBeenCalledWith('r1', { expectedRevision: '2', reason: '签约解除' }))
    expect(await screen.findByText('名单已停用，之后的结算不再按该资格减免')).toBeInTheDocument()
  })
})
