import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { ClinicalContext } from '../../../app/AppShell'
import type {
  DepartmentRecommendation,
  PendingEncounter,
  TriageRecord,
  TriageStatistics,
} from '../../../shared/api/outpatientTriageApi'
import type { Resident } from '../../../shared/model'
import type { RhnApi } from '../../../shared/rhnApi'
import { OutpatientTriageWorkspace } from './OutpatientTriageWorkspace'

const mockPatient: Resident = {
  id: 'resident-101',
  maskedNationalId: '110101********1234',
  fullName: '周建国',
  gender: 'MALE',
  birthDate: '1985-05-05',
  phone: '13800001111',
  healthRecordNo: 'HR850505',
  status: 'ACTIVE',
  deceased: false,
  version: 1,
  identifiers: [],
  createdAt: '2026-01-01T00:00:00Z',
}

const mockPendingEncounter: PendingEncounter = {
  encounterId: 'enc-001',
  registrationId: 'reg-001',
  residentId: 'resident-101',
  healthRecordNo: 'HR850505',
  residentName: '周建国',
  gender: 'MALE',
  birthDate: '1985-05-05',
  age: 41,
  phone: '13800001111',
  registrationNo: 'REG20260909001',
  ticketNo: 'A001',
  sequenceNo: 1,
  departmentId: 'dept-gen',
  departmentName: '全科医疗科',
  practitionerName: '王医生',
  registeredAt: '2026-09-09T08:30:00Z',
  triaged: false,
}

const mockStats: TriageStatistics = {
  totalCount: 15,
  level1CriticalCount: 1,
  level2UrgentCount: 2,
  level3RoutineUrgentCount: 8,
  level4NonUrgentCount: 4,
  feverCount: 3,
  greenChannelCount: 1,
}

const mockRecommendations: DepartmentRecommendation[] = [
  {
    departmentId: 'dept-fever',
    departmentName: '发热门诊',
    score: 95,
    rationale: '体温超标 (≥37.3℃) 且伴有发热/咳嗽症状，高优先级分流至发热门诊',
    availableScheduleCount: 12,
    alertNotice: '发热门诊独立通道，避免院内交叉感染',
  },
  {
    departmentId: 'dept-resp',
    departmentName: '呼吸内科',
    score: 80,
    rationale: '呼吸道感染常见就诊科室',
    availableScheduleCount: 8,
  },
]

const mockTriageRecord: TriageRecord = {
  id: 'triage-rec-1',
  tenantId: 'default-tenant',
  organizationId: 'org-1',
  triageNo: 'TRI202609090001',
  greenChannel: 'NONE',
  disposition: 'WAITING_QUEUE',
  encounterId: 'enc-001',
  registrationId: 'reg-001',
  residentId: 'resident-101',
  patientName: '周建国',
  gender: 'MALE',
  age: 41,
  phone: '13800001111',
  idCardNo: '110101198505051234',
  healthRecordNo: 'HR850505',
  arrivalMethod: 'WALK_IN',
  companionType: 'NONE',
  triageTime: '2026-09-09T09:00:00Z',
  temperature: 38.6,
  pulseRate: 98,
  respiratoryRate: 20,
  systolic: 135,
  diastolic: 85,
  oxygenSaturation: 98,
  painScore: 0,
  consciousness: 'ALERT',
  fever: true,
  riskTags: '发热/发烧',
  triageLevel: 'LEVEL_2_URGENT',
  triageReason: '体温38.6℃伴发热，判定为2级危重',
  targetDepartmentId: 'dept-fever',
  targetDepartmentName: '发热门诊',
  triageNurseName: '分诊护士李静',
  status: 'RECORDED',
  createdAt: '2026-09-09T09:00:00Z',
  updatedAt: '2026-09-09T09:00:00Z',
}

const clinicalContext: ClinicalContext = {
  organization: { id: 'org-1', name: '社区卫生服务中心' },
  department: { id: 'dept-1', name: '分诊护士站' },
} as unknown as ClinicalContext

function buildMockApi(): RhnApi {
  return {
    outpatientTriage: {
      statistics: vi.fn().mockResolvedValue(mockStats),
      pendingEncounters: vi.fn().mockResolvedValue([mockPendingEncounter]),
      assess: vi.fn().mockImplementation(async () => ({
        ruleLevel: 'LEVEL_4_NON_URGENT',
        suggestedLevel: 'LEVEL_4_NON_URGENT',
        source: 'LOCAL_ASSIST',
        aiMode: 'LOCAL_ASSIST',
        aiApplied: false,
        summary: '当前资料未触发急危重规则',
        ruleReasons: ['当前资料未触发急危重规则'],
        dangerSigns: [],
        departmentRecommendations: mockRecommendations,
        fallbackReason: null,
      })),
      recommendDepartments: vi.fn().mockResolvedValue(mockRecommendations),
      create: vi.fn().mockResolvedValue(mockTriageRecord),
      update: vi.fn().mockResolvedValue(mockTriageRecord),
      get: vi.fn().mockResolvedValue(mockTriageRecord),
      getByEncounter: vi.fn().mockResolvedValue(mockTriageRecord),
      search: vi.fn().mockResolvedValue({ content: [mockTriageRecord], totalElements: 1, totalPages: 1 }),
      bindEncounter: vi.fn().mockResolvedValue(mockTriageRecord),
    },
    residents: {
      search: vi.fn().mockResolvedValue([mockPatient]),
      get: vi.fn().mockResolvedValue(mockPatient),
    },
    organizations: {
      departments: vi.fn().mockResolvedValue([
        { id: 'dept-fever', name: '发热门诊', code: 'DEPT_FEVER' },
        { id: 'dept-resp', name: '呼吸内科', code: 'DEPT_RESP' },
        { id: 'dept-gen', name: '全科医疗科', code: 'DEPT_GEN' },
      ]),
    },
  } as unknown as RhnApi
}

function renderWorkspace(api: RhnApi, onNavigate = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/outpatient/triage']}>
        <OutpatientTriageWorkspace api={api} clinicalContext={clinicalContext} onNavigate={onNavigate} />
      </MemoryRouter>
    </QueryClientProvider>
  )
  return { onNavigate, queryClient }
}

describe('OutpatientTriageWorkspace', () => {
  it('应当正常渲染统计看板与待分诊队列', async () => {
    const api = buildMockApi()
    renderWorkspace(api)

    // 检查页面标题
    expect(screen.getByText('门诊预检分诊')).toBeInTheDocument()

    // 检查统计指标卡片
    await waitFor(() => {
      expect(screen.getByText('今日评估次数')).toBeInTheDocument()
      expect(screen.getByText('15')).toBeInTheDocument()
    })

    // 检查待分诊列表
    await waitFor(() => {
      expect(screen.getAllByText('周建国').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('A001')).toBeInTheDocument()
    })

    expect(screen.getByRole('tab', { name: /到院初筛/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /待分诊/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /候诊观察/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /记录/ })).toBeInTheDocument()
  })

  it('点击待分诊队列中的患者后，应当载入右侧患者卡片并进入分诊作业', async () => {
    const api = buildMockApi()
    renderWorkspace(api)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '周建国', level: 3 })).toBeInTheDocument()
    })

    const card = screen.getAllByText('周建国')[0].closest('.triage-queue-card')
    expect(card).toBeTruthy()
    fireEvent.click(card!)

    // 应当在中栏患者卡片展示周建国姓名和基本体征输入区
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '周建国', level: 3 })).toBeInTheDocument()
      expect(screen.getByRole('spinbutton', { name: '体温' })).toHaveAttribute('placeholder', '未测')
    })
  })

  it('首次加载时应当自动进入首位待分诊患者，减少一次队列点击', async () => {
    const api = buildMockApi()
    renderWorkspace(api)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '周建国', level: 3 })).toBeInTheDocument()
      expect(screen.getByText('男 · 41岁 · 电话：13800001111 · 档案号：HR850505')).toBeInTheDocument()
    })
  })

  it('到院初筛未调入患者时应显示骨架占位，并统一顶部操作控件规格', async () => {
    const user = userEvent.setup()
    const api = buildMockApi()
    renderWorkspace(api)

    await user.click(screen.getByRole('tab', { name: /到院初筛/ }))

    expect(screen.getByRole('status', { name: '尚未调入患者' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '待分诊患者' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '查询' })).toHaveClass('ui-button--md')
    expect(screen.getByRole('combobox', { name: '到院方式' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '陪同情况' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '清空更换' })).toHaveClass('ui-button--md')
  })

  it('输入异常生命体征时，应当实时触发越界报警并计算四级分诊建议等级', async () => {
    const api = buildMockApi()
    renderWorkspace(api)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '周建国', level: 3 })).toBeInTheDocument()
    })

    // 录入体温 39.2℃
    const tempInput = await screen.findByRole('spinbutton', { name: '体温' })
    fireEvent.change(tempInput, { target: { value: '39.2' } })

    // 录入收缩压 185 mmHg
    const sysInput = screen.getByRole('spinbutton', { name: '收缩压' })
    fireEvent.change(sysInput, { target: { value: '185' } })

    // 应当在体征输入卡片底部显示预警标签
    await waitFor(() => {
      expect(screen.getByText('高热预警')).toBeInTheDocument()
      expect(screen.getByText('高血压危象')).toBeInTheDocument()
    })
  })

  it('挂号前点击高频症状标签时应当自动带入主诉，并支持采纳智能推荐科室', async () => {
    const user = userEvent.setup()
    const api = buildMockApi()
    renderWorkspace(api)

    await user.click(screen.getByRole('tab', { name: /到院初筛/ }))
    expect(screen.getByText('智能导诊')).toBeInTheDocument()

    // 点击常用症状标签“发热/发烧”
    const feverChip = await screen.findByText('发热/发烧')
    await user.click(feverChip)

    // 主诉文本框应当包含发热
    const textarea = screen.getByPlaceholderText(/例如：突发胸痛胸闷伴大汗2小时/)
    expect((textarea as HTMLTextAreaElement).value).toContain('发热/发烧')

    // 验证调用了 recommendDepartments
    await waitFor(() => {
      expect(api.outpatientTriage.assess).toHaveBeenCalled()
      expect(screen.getByText('发热门诊')).toBeInTheDocument()
    })

    // 点击采纳科室
    const adoptBtn = screen.getAllByText('采纳科室')[0]
    await user.click(adoptBtn)

    // 按钮状态应当更新为已采纳
    await waitFor(() => {
      expect(screen.getByText('已采纳')).toBeInTheDocument()
    })
  })

  it('已挂号待分诊场景应聚焦风险判级与疑似错科复核，不再提供重复采科室操作', async () => {
    const user = userEvent.setup()
    const api = buildMockApi()
    renderWorkspace(api)

    await waitFor(() => expect(screen.getByText('分级决策辅助')).toBeInTheDocument())
    await user.click(screen.getByText('发热/发烧'))

    await waitFor(() => {
      expect(screen.getByText('疑似错科提醒，仅供护士复核')).toBeInTheDocument()
      expect(screen.getByText(/当前挂号为全科医疗科，症状更匹配发热门诊/)).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: '采纳科室' })).not.toBeInTheDocument()
  })

  it('再次点击已选症状时应当同步从主诉中移除', async () => {
    const user = userEvent.setup()
    const api = buildMockApi()
    renderWorkspace(api)

    const feverChip = await screen.findByText('发热/发烧')
    await user.click(feverChip)
    const complaint = screen.getByPlaceholderText(/例如：突发胸痛胸闷伴大汗2小时/)
    expect(complaint).toHaveValue('发热/发烧')

    await user.click(feverChip)
    expect(complaint).toHaveValue('')
  })

  it('点击绿色通道时应当确认并激活对应急救绿色通道', async () => {
    const user = userEvent.setup()
    const api = buildMockApi()
    renderWorkspace(api)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '周建国', level: 3 })).toBeInTheDocument()
    })

    // 点击胸痛中心绿色通道
    const chestPainBtn = await screen.findByText('胸痛中心')
    await user.click(chestPainBtn)

    // 胸痛中心按钮应当处于激活状态
    await waitFor(() => {
      expect(chestPainBtn.closest('.triage-green-channel-btn')).toHaveClass('triage-green-channel-btn--active')
    })
  })

  it('已挂号患者分诊保存成功后，应当弹出分诊热敏小票预览对话框', async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()
    const api = buildMockApi()
    renderWorkspace(api, onNavigate)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '周建国', level: 3 })).toBeInTheDocument()
    })

    // 保存并打印小票
    const saveBtn = screen.getByText('保存并打印')
    await user.click(saveBtn)

    // 应当调用 create API
    await waitFor(() => {
      expect(api.outpatientTriage.create).toHaveBeenCalled()
    })

    // 应当弹出小票弹窗
    await waitFor(() => {
      expect(screen.getByText('预检分诊凭条预览与打印')).toBeInTheDocument()
      expect(screen.getByText('门诊预检分诊凭条')).toBeInTheDocument()
      expect(screen.getAllByText(/TRI202609090001/).length).toBeGreaterThanOrEqual(1)
    })

    expect(screen.queryByText('直通挂号')).not.toBeInTheDocument()
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('到院初筛应当允许先选择居民，保存后再直通挂号', async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()
    const api = buildMockApi()
    renderWorkspace(api, onNavigate)

    await user.click(screen.getAllByRole('button', { name: '到院初筛' })[0])
    const patientSearch = screen.getByPlaceholderText('检索姓名/身份证/档案号...')
    await user.type(patientSearch, '周建国{Enter}')
    await user.click(await screen.findByRole('button', { name: /周建国.*男.*41 岁/ }))

    await user.click(screen.getByRole('button', { name: '保存初筛' }))
    await waitFor(() => expect(api.outpatientTriage.create).toHaveBeenCalled())

    await user.click(screen.getByRole('button', { name: '直通挂号' }))
    expect(onNavigate).toHaveBeenCalledWith(expect.stringContaining('/outpatient/registration?residentId=resident-101'))
  })

  it('应当将已分诊且仍候诊的患者移出待分诊并允许新增复评记录', async () => {
    const user = userEvent.setup()
    const api = buildMockApi()
    const observedEncounter: PendingEncounter = {
      ...mockPendingEncounter,
      encounterId: 'enc-observed',
      registrationId: 'reg-observed',
      residentName: '李春梅',
      triaged: true,
      triageId: mockTriageRecord.id,
      triageNo: mockTriageRecord.triageNo,
      triageLevel: mockTriageRecord.triageLevel,
    }
    vi.mocked(api.outpatientTriage.pendingEncounters).mockResolvedValue([mockPendingEncounter, observedEncounter])
    renderWorkspace(api)

    await waitFor(() => {
      expect(screen.getAllByText('周建国').length).toBeGreaterThanOrEqual(1)
      expect(screen.queryByText('李春梅')).not.toBeInTheDocument()
    })

    await user.click(screen.getByRole('tab', { name: /候诊观察/ }))
    expect(screen.queryByRole('button', { name: '直通挂号' })).not.toBeInTheDocument()
    await user.click(await screen.findByText('李春梅'))
    await waitFor(() => {
      expect(screen.getByText(/本次保存将新增一条复评记录/)).toBeInTheDocument()
      expect(screen.getByText('候诊风险复评')).toBeInTheDocument()
      expect(screen.getByText('上次分级')).toBeInTheDocument()
      expect(screen.getByText('风险趋势')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: '保存复评' }))
    await waitFor(() => expect(api.outpatientTriage.create).toHaveBeenCalled())
    expect(api.outpatientTriage.update).not.toHaveBeenCalled()
  })
})
