import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { ClinicalContext } from '../../app/AppShell'
import type { SkinTestWorkItem } from '../../shared/api/treatmentApi'
import type { RhnApi } from '../../shared/rhnApi'
import { SkinTestManagementWorkspace } from './SkinTestManagementWorkspace'

const clinicalContext = {
  organization: { id: 'org-1', name: '测试医院' },
  department: { id: 'dept-1', name: '门诊注射室' },
} as ClinicalContext

const dilutedItem: SkinTestWorkItem = {
  medicationRequestId: 'request-1', medicationRequestRevision: 2, requestNo: 'MR001',
  residentId: 'resident-1', residentName: '张测试', healthRecordNo: 'HR001', encounterId: 'encounter-1',
  organizationId: 'org-1', departmentId: 'dept-1', medicationId: 'med-1', medicationCode: 'PEN-G',
  medicationName: '青霉素钠', itemName: '注射用青霉素钠 80万单位', routeCode: 'IVGTT',
  doseValue: 800000, doseUnit: 'U', configuredTestMethod: 'INTRADERMAL',
  configuredSolutionMode: 'DILUTED_SOLUTION', configuredObservationMinutes: 20, resultValidityHours: 24,
  configurationInstructions: '皮试液500 U/ml，皮内注射0.1ml',
  settlementRequiredBeforeStart: false, dispenseRequiredBeforeStart: false,
  status: 'PENDING', originalSolution: false,
}

function renderWorkspace(item: SkinTestWorkItem) {
  const startSkinTest = vi.fn().mockResolvedValue({ ...item, status: 'IN_PROGRESS' })
  const completeSkinTest = vi.fn().mockResolvedValue({ ...item, status: 'NEGATIVE' })
  const api = {
    treatments: {
      skinTestWorklist: vi.fn().mockResolvedValue([item]),
      startSkinTest,
      completeSkinTest,
      cancelSkinTest: vi.fn(),
    },
    organization: {
      practitioners: vi.fn().mockResolvedValue([
        { id: 'pract-101', fullName: '李复核护士', code: 'N001', sdPersonnelStatus: 'ACTIVE' },
      ]),
    },
    residents: {
      allergies: vi.fn().mockResolvedValue([
        {
          id: 'allergy-1',
          assertionType: 'ALLERGY',
          substanceDisplay: '头孢曲松',
          reactionText: '皮疹伴瘙痒',
          clinicalStatus: 'ACTIVE',
        },
      ]),
    },
  } as unknown as RhnApi
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const view = render(<QueryClientProvider client={client}><MemoryRouter>
    <SkinTestManagementWorkspace api={api} clinicalContext={clinicalContext} />
  </MemoryRouter></QueryClientProvider>)
  return { ...view, startSkinTest, completeSkinTest }
}

describe('SkinTestManagementWorkspace', () => {
  it('uses the snapshotted non-original solution plan and allows skin testing before medication billing', async () => {
    const user = userEvent.setup()
    const { container, startSkinTest } = renderWorkspace(dilutedItem)

    const plan = await screen.findByLabelText('药品主数据皮试方案')
    expect(within(plan).getByText('非原液（配制试液）')).toBeInTheDocument()
    expect(within(plan).getByText('可先皮试')).toBeInTheDocument()
    expect(within(plan).getByText('20 分钟')).toBeInTheDocument()
    expect(screen.getByText(/可在药品结算和发药前进行/)).toBeInTheDocument()
    expect(container.querySelectorAll('.ui-field > select')).toHaveLength(0)

    // Verify injection site chips
    const rightArmChip = screen.getByRole('button', { name: '右前臂屈侧下段' })
    await user.click(rightArmChip)

    await user.click(screen.getByRole('checkbox', { name: /已当面核对患者身份/ }))
    await user.click(screen.getByRole('button', { name: /确认开始并计时/ }))

    await waitFor(() => expect(startSkinTest).toHaveBeenCalledWith('request-1', expect.objectContaining({
      expectedMedicationRevision: 2,
      testMethod: 'INTRADERMAL',
      originalSolution: false,
      observationMinutes: 20,
      solutionName: '按主数据方案配制的皮试液',
      bodySite: '右前臂屈侧下段',
    })))
  })

  it('keeps an original-solution task blocked until medication settlement and dispensing complete', async () => {
    const original = {
      ...dilutedItem,
      configuredSolutionMode: 'ORIGINAL_SOLUTION' as const,
      settlementRequiredBeforeStart: true,
      dispenseRequiredBeforeStart: true,
      status: 'WAITING_SETTLEMENT' as const,
      gateMessage: '当前为原液皮试，药品费用尚未完成结算，暂不能开始皮试',
    }
    renderWorkspace(original)

    const plan = await screen.findByLabelText('药品主数据皮试方案')
    expect(within(plan).getByText('原液')).toBeInTheDocument()
    expect(within(plan).getByText('收费并发药后')).toBeInTheDocument()
    expect(screen.getByText(original.gateMessage)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /确认开始并计时/ })).not.toBeInTheDocument()
  })

  it('requires selecting a verification nurse for dual review before completing skin test', async () => {
    const user = userEvent.setup()
    const observingItem: SkinTestWorkItem = {
      ...dilutedItem,
      status: 'IN_PROGRESS',
      eventId: 'evt-1',
      eventRevision: 1,
      startedAt: new Date(Date.now() - 25 * 60_000).toISOString(),
      observationMinutes: 20,
    }
    const { completeSkinTest } = renderWorkspace(observingItem)

    expect(await screen.findByText('已到判读时间')).toBeInTheDocument()
    expect(screen.getByText(/复核护士（双人复核）/)).toBeInTheDocument()

    // 尚未选择复核护士时，确认判读按钮应被禁用
    const completeBtn = screen.getByRole('button', { name: '确认判读并签名' })
    expect(completeBtn).toBeDisabled()

    // 测试客观标尺快速点击
    const step8Btn = screen.getByRole('button', { name: '8' })
    await user.click(step8Btn)

    // 测试体征勾选
    const signBtn = screen.getByRole('button', { name: /\+ 局部隆起硬结/ })
    await user.click(signBtn)

    // 选择复核护士
    await user.click(screen.getByRole('combobox', { name: /复核护士/ }))
    await user.click(await screen.findByRole('option', { name: /李复核护士/ }))

    expect(completeBtn).toBeEnabled()
    await user.click(completeBtn)

    await waitFor(() => expect(completeSkinTest).toHaveBeenCalledWith('evt-1', expect.objectContaining({
      expectedRevision: 1,
      result: 'NEGATIVE',
      whealDiameterMm: 8,
      verifiedByPractitionerId: 'pract-101',
      verifiedByName: '李复核护士',
    })))
  })

  it('supports emergency anaphylaxis code-red quick action to intercept order and record positive result', async () => {
    const user = userEvent.setup()
    const observingItem: SkinTestWorkItem = {
      ...dilutedItem,
      status: 'IN_PROGRESS',
      eventId: 'evt-2',
      eventRevision: 1,
      startedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
      observationMinutes: 20,
    }
    const { completeSkinTest } = renderWorkspace(observingItem)

    // 点击突发急性严重过敏一键急救
    const emergencyBtn = await screen.findByRole('button', { name: /突发严重过敏/ })
    await user.click(emergencyBtn)

    // 验证出现急救抢救提醒
    expect(await screen.findByText(/已启动过敏性休克急救直通通道/)).toBeInTheDocument()

    // 选择复核护士
    await user.click(screen.getByRole('combobox', { name: /复核护士/ }))
    await user.click(await screen.findByRole('option', { name: /李复核护士/ }))

    const completeBtn = screen.getByRole('button', { name: '确认判读并签名' })
    expect(completeBtn).toBeEnabled()
    await user.click(completeBtn)

    await waitFor(() => expect(completeSkinTest).toHaveBeenCalledWith('evt-2', expect.objectContaining({
      expectedRevision: 1,
      result: 'POSITIVE',
      whealDiameterMm: 15,
      flareDiameterMm: 25,
      earlyReadReason: expect.stringContaining('突发严重急性过敏反应'),
      verifiedByPractitionerId: 'pract-101',
    })))
  })

  it('displays objective clinical guidance when wheal is >= 10mm or pseudopod is checked', async () => {
    const user = userEvent.setup()
    const observingItem: SkinTestWorkItem = {
      ...dilutedItem,
      status: 'IN_PROGRESS',
      eventId: 'evt-3',
      eventRevision: 1,
      startedAt: new Date(Date.now() - 22 * 60_000).toISOString(),
      observationMinutes: 20,
    }
    renderWorkspace(observingItem)

    // 输入风团直径 10mm
    const step10Btns = await screen.findAllByRole('button', { name: '10' })
    await user.click(step10Btns[0])

    // 验证出现智能客观指征提示
    expect(await screen.findByText(/临床指征提示：/)).toBeInTheDocument()
    expect(screen.getByText(/风团直径 ≥10mm 或存在伪足/)).toBeInTheDocument()

    // 勾选伪足体征
    const pseudoSignBtn = screen.getByRole('button', { name: /\+ 伪足\(假足\)/ })
    await user.click(pseudoSignBtn)

    // 验证说明输入框中自动包含了体征
    const reactionInput = screen.getByLabelText(/判读说明与局部体征备注/) as HTMLTextAreaElement
    expect(reactionInput.value).toContain('伪足(假足)')
  })

  it('blocks negative completion before observation period finishes', async () => {
    const user = userEvent.setup()
    const observingItem: SkinTestWorkItem = {
      ...dilutedItem,
      status: 'IN_PROGRESS',
      eventId: 'evt-4',
      eventRevision: 1,
      startedAt: new Date(Date.now() - 5 * 60_000).toISOString(), // 只观察了5分钟
      observationMinutes: 20,
    }
    renderWorkspace(observingItem)

    // 选择复核护士
    await user.click(await screen.findByRole('combobox', { name: /复核护士/ }))
    await user.click(await screen.findByRole('option', { name: /李复核护士/ }))

    // 默认是 NEGATIVE，且留观时间未到，确认按钮应被禁用且提示等待观察结束
    const completeBtn = screen.getByRole('button', { name: '等待观察期结束' })
    expect(completeBtn).toBeDisabled()
    expect(screen.getByText(/阴性结果必须观察满规定时长/)).toBeInTheDocument()
  })
})
