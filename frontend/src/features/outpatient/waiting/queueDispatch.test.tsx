import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { ClinicalContext } from '../../../app/AppShell'
import type { ReceptionQueueItem } from '../../../shared/api/schedulingApi'
import type { Encounter, Resident } from '../../../shared/model'
import type { RhnApi } from '../../../shared/rhnApi'
import { DoctorWorkstation } from '../DoctorWorkstation'
import { DedicatedWaitingWorkspace } from './DedicatedWaitingWorkspace'
import { PreEncounterBriefingCard } from './PreEncounterBriefingCard'
import { QueueCapsuleBar } from './QueueCapsuleBar'
import { QueuePeekDrawer } from './QueuePeekDrawer'
import { enhanceQueueItem, enhanceQueueList } from './queueDataEnhancer'
import {
  DEFAULT_DISPATCH_RULES,
  announceQueueCall,
  determineNextCallCandidate,
  filterQueueItems,
} from './queueDispatchService'

const mockItem1: ReceptionQueueItem = {
  registrationId: 'reg-1',
  encounterId: 'enc-1',
  residentId: 'res-1',
  healthRecordNo: 'HR001',
  residentName: '张建国',
  gender: 'MALE',
  birthDate: '1970-01-01',
  registrationNo: 'REG001',
  ticketNo: 'A001',
  sequenceNo: 1,
  priority: 0,
  registrationSource: 'DIRECT',
  visitType: 'GENERAL',
  registrationStatus: 'REGISTERED',
  status: 'WAITING',
  practitionerName: '测试医生',
  serviceName: '普通全科门诊',
  locationName: '1号诊室',
  registeredAt: '2026-09-05T08:00:00Z',
}

const mockItem2: ReceptionQueueItem = {
  registrationId: 'reg-2',
  encounterId: 'enc-2',
  residentId: 'res-2',
  healthRecordNo: 'HR002',
  residentName: '李翠华',
  gender: 'FEMALE',
  birthDate: '1978-05-12',
  registrationNo: 'REG002',
  ticketNo: 'A002',
  sequenceNo: 2,
  priority: 0,
  registrationSource: 'DIRECT',
  visitType: 'FOLLOW_UP',
  registrationStatus: 'REGISTERED',
  status: 'WAITING',
  practitionerName: '测试医生',
  serviceName: '普通全科门诊',
  locationName: '1号诊室',
  registeredAt: '2026-09-05T08:05:00Z',
}

const mockItem3: ReceptionQueueItem = {
  registrationId: 'reg-3',
  encounterId: 'enc-3',
  residentId: 'res-3',
  healthRecordNo: 'HR003',
  residentName: '王振华',
  gender: 'MALE',
  birthDate: '1942-03-20',
  registrationNo: 'REG003',
  ticketNo: 'A003',
  sequenceNo: 3,
  priority: 2,
  registrationSource: 'EMERGENCY',
  visitType: 'EMERGENCY',
  registrationStatus: 'REGISTERED',
  status: 'WAITING',
  practitionerName: '测试医生',
  serviceName: '全科急诊',
  locationName: '1号诊室',
  registeredAt: '2026-09-05T08:10:00Z',
}

describe('queueDispatchService & queueDataEnhancer', () => {
  it('adds queue dispatch metadata without inventing clinical facts', () => {
    const enhanced = enhanceQueueList([mockItem1, mockItem2, mockItem3])
    expect(enhanced).toHaveLength(3)

    const priorityItem = enhanced.find((i) => i.registrationId === 'reg-3')!
    expect(priorityItem.queueCategory).toBe('PRIORITY')
    expect(priorityItem.triageLevel).toBe('LEVEL_1_CRITICAL')

    const returnItem = enhanced.find((i) => i.registrationId === 'reg-2')!
    expect(returnItem.queueCategory).toBe('RETURN_VISIT')
    expect(returnItem.reportSummary).toBeUndefined()
    expect(returnItem.vitals).toBeUndefined()
    expect(returnItem.aiPreConsultation).toBeUndefined()
    expect(returnItem.allergies).toBeUndefined()
    expect(returnItem.pastConditions).toBeUndefined()
    expect(returnItem.currentMedications).toBeUndefined()
    expect(returnItem.recentVisits).toBeUndefined()
  })

  it('filters queue items by tabs and search queries', () => {
    const completed = { ...mockItem1, registrationId: 'reg-completed', status: 'COMPLETED' as const,
      completedAt: '2026-09-05T09:30:00Z' }
    const completedEarlier = { ...mockItem2, registrationId: 'reg-completed-earlier', status: 'COMPLETED' as const,
      completedAt: '2026-09-05T09:00:00Z' }
    const enhanced = enhanceQueueList([mockItem1, mockItem2, mockItem3, completedEarlier, completed])

    // Filter by RETURN_VISIT tab
    const returnList = filterQueueItems(enhanced, 'RETURN_VISIT')
    expect(returnList.every((i) => i.queueCategory === 'RETURN_VISIT')).toBe(true)

    // Filter by search query "李翠华"
    const searched = filterQueueItems(enhanced, 'ALL', '李翠华')
    expect(searched).toHaveLength(1)
    expect(searched[0].residentName).toBe('李翠华')

    expect(filterQueueItems(enhanced, 'ALL').some((item) => item.status === 'COMPLETED')).toBe(false)
    expect(filterQueueItems(enhanced, 'COMPLETED').map((item) => item.registrationId)).toEqual([
      'reg-completed', 'reg-completed-earlier',
    ])
  })

  it('prioritizes critical emergency patients over standard queue', () => {
    const enhanced = enhanceQueueList([mockItem1, mockItem2, mockItem3])
    const candidate = determineNextCallCandidate(enhanced, DEFAULT_DISPATCH_RULES, 0)
    expect(candidate.slotType).toBe('PRIORITY')
    expect(candidate.candidate?.registrationId).toBe('reg-3')
  })

  it('alternates return visits after consecutive initial calls ratio', () => {
    const enhanced = enhanceQueueList([mockItem1, mockItem2]).map((item) => item.registrationId === 'reg-2'
      ? {
          ...item,
          reportSummary: {
            totalRequested: 1,
            totalCompleted: 1,
            hasCriticalValue: false,
            hasAbnormalValue: false,
            allReportsReady: true,
          },
        }
      : item)

    // With 0 consecutive initial calls, candidate is initial
    const candidate0 = determineNextCallCandidate(enhanced, { ...DEFAULT_DISPATCH_RULES, initialToReturnRatio: 2 }, 0)
    expect(candidate0.candidate?.registrationId).toBe('reg-1')

    // With 2 consecutive initial calls, candidate should be return visit
    const candidate2 = determineNextCallCandidate(enhanced, { ...DEFAULT_DISPATCH_RULES, initialToReturnRatio: 2 }, 2)
    expect(candidate2.slotType).toBe('RETURN_VISIT')
    expect(candidate2.candidate?.registrationId).toBe('reg-2')
  })

  it('safely handles speech synthesis announcement', () => {
    const speakMock = vi.fn()
    window.speechSynthesis = {
      cancel: vi.fn(),
      speak: speakMock,
      getVoices: vi.fn().mockReturnValue([]),
    } as unknown as SpeechSynthesis
    // @ts-expect-error Mock class for test environment
    globalThis.SpeechSynthesisUtterance = class {
      text = ''
      lang = ''
      rate = 1
      pitch = 1
      volume = 1
      voice = null
      constructor(text: string) {
        this.text = text
      }
    }

    announceQueueCall('A001', '张建国', '1号诊室', { enabled: true })
    expect(speakMock).toHaveBeenCalled()
  })
})

describe('PreEncounterBriefingCard', () => {
  it('does not present unavailable clinical data as patient facts', async () => {
    const user = userEvent.setup()
    const item = enhanceQueueItem(mockItem1)
    const onEnterSpy = vi.fn()
    const onCloseSpy = vi.fn()

    render(
      <PreEncounterBriefingCard
        item={item}
        onEnter={onEnterSpy}
        onClose={onCloseSpy}
        canEdit
      />
    )

    expect(screen.getByText('张建国')).toBeInTheDocument()
    expect(screen.queryByText(/分诊生命体征/)).not.toBeInTheDocument()
    expect(screen.queryByText(/AI 预问诊画像提炼/)).not.toBeInTheDocument()
    expect(screen.queryByText(/未登记明确药物过敏史/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '立即接诊' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '立即接诊' }))
    expect(onEnterSpy).toHaveBeenCalled()
  })
})

describe('QueueCapsuleBar & QueuePeekDrawer', () => {
  it('renders mini capsule bar and opens floating action pod on F8 shortcut', async () => {
    const user = userEvent.setup()
    const enhanced = enhanceQueueList([mockItem1, mockItem2])
    const callNextSpy = vi.fn()
    const openDrawerSpy = vi.fn()

    render(
      <QueueCapsuleBar
        items={enhanced}
        currentEncounterId="enc-1"
        currentResidentName="张建国"
        canEdit
        onCallAndEnterNext={callNextSpy}
        onRecallCurrent={vi.fn()}
        onSkipAndPostpone={vi.fn()}
        onSuspendCurrent={vi.fn()}
        onOpenPeekDrawer={openDrawerSpy}
      />
    )

    // Capsule pill is visible
    expect(screen.getByLabelText(/候诊协同胶囊/)).toBeInTheDocument()

    // Press F8 to toggle pod
    fireEvent.keyDown(window, { key: 'F8' })
    expect(await screen.findByText('候诊协同控制岛')).toBeInTheDocument()
    expect(screen.getByText(/快捷键 F8/)).toBeInTheDocument()

    // Click trigger to open peek drawer
    const drawerTrigger = screen.getByRole('button', { name: /展开侧拉透视抽屉/ })
    await user.click(drawerTrigger)
    expect(openDrawerSpy).toHaveBeenCalled()
  })

  it('renders queue peek drawer and allows patient selection', async () => {
    const user = userEvent.setup()
    const enhanced = enhanceQueueList([mockItem1, mockItem2])
    const selectSpy = vi.fn()
    const closeSpy = vi.fn()

    render(
      <QueuePeekDrawer
        open
        onClose={closeSpy}
        items={enhanced}
        currentEncounterId="enc-1"
        canEdit
        onSelectPatient={selectSpy}
      />
    )

    expect(screen.getByText('门诊候诊全景透视')).toBeInTheDocument()
    expect(screen.getByText('张建国')).toBeInTheDocument()
    expect(screen.getByText('李翠华')).toBeInTheDocument()

    // Click "切换接诊" on 李翠华
    const switchBtns = screen.getAllByRole('button', { name: '切换接诊' })
    expect(switchBtns.length).toBeGreaterThan(0)
    await user.click(switchBtns[0])
    expect(selectSpy).toHaveBeenCalled()
  })
})

describe('DedicatedWaitingWorkspace interactive features', () => {
  it('switches queue tabs and filters cards accordingly', async () => {
    const user = userEvent.setup()
    const enhanced = enhanceQueueList([mockItem1, mockItem2, mockItem3])
    const enterSpy = vi.fn()
    const viewSpy = vi.fn()

    render(
      <DedicatedWaitingWorkspace
        items={enhanced}
        clinicalContext={{ organization: { id: 'org-1', name: '社区卫生中心' }, department: { id: 'dept-1', name: '全科医疗科' } } as ClinicalContext}
        canEdit
        busy={false}
        onEnter={enterSpy}
        onView={viewSpy}
        onRefresh={vi.fn()}
        onCallItem={vi.fn().mockResolvedValue(undefined)}
        onMissItem={vi.fn().mockResolvedValue(undefined)}
        onRequeueItem={vi.fn().mockResolvedValue(undefined)}
      />
    )

    // Initially ALL tab has all 3
    expect(screen.getByText('全部待诊')).toBeInTheDocument()
    expect(screen.getByText('张建国')).toBeInTheDocument()
    expect(screen.getByText('李翠华')).toBeInTheDocument()
    expect(screen.getByText('王振华')).toBeInTheDocument()

    // Click "回诊看结果" tab
    await user.click(screen.getByText('回诊看结果'))
    expect(screen.getByRole('button', { name: '查看 李翠华' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '查看 张建国' })).not.toBeInTheDocument()

    // Click "优抚绿通" tab
    await user.click(screen.getByText('优抚绿通'))
    expect(screen.getByRole('button', { name: '查看 王振华' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '查看 李翠华' })).not.toBeInTheDocument()

    // Open settings and change ratio
    await user.click(screen.getByRole('button', { name: '呼叫与调度规则设置' }))
    expect(await screen.findByText('叫号与智能排队设置')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '3:1' }))
    await user.click(screen.getByRole('button', { name: '关闭设置' }))
  })

  it('renders called count badge in header badge group instead of stretching ticket column', () => {
    const calledItem = enhanceQueueItem({
      ...mockItem1,
      status: 'CALLED',
      callCount: 2,
    })

    const { container } = render(
      <DedicatedWaitingWorkspace
        items={[calledItem]}
        clinicalContext={{ organization: { id: 'org-1', name: '社区卫生中心' }, department: { id: 'dept-1', name: '全科医疗科' } } as ClinicalContext}
        canEdit
        busy={false}
        onEnter={vi.fn()}
        onView={vi.fn()}
        onRefresh={vi.fn()}
        onCallItem={vi.fn().mockResolvedValue(undefined)}
        onMissItem={vi.fn().mockResolvedValue(undefined)}
        onRequeueItem={vi.fn().mockResolvedValue(undefined)}
      />
    )

    // Check that called count pill badge exists in card-badge-group
    const calledBadge = screen.getByText('叫号 2 次')
    expect(calledBadge).toBeInTheDocument()
    expect(calledBadge).toHaveClass('category-pill--called')

    // Confirm that ticket column only contains ticketNo and seq (no called-count)
    const ticketCol = container.querySelector('.waiting-card__ticket-col')
    expect(ticketCol).toBeInTheDocument()
    expect(ticketCol?.querySelector('.waiting-card__called-count')).toBeNull()
    expect(ticketCol?.textContent).toContain('A001')
    expect(ticketCol?.textContent).toContain('第 1 号')
    expect(ticketCol?.textContent).not.toContain('叫号')
  })

  it('shows completed encounters in a read-only completed tab', async () => {
    const user = userEvent.setup()
    const completedItem = enhanceQueueItem({
      ...mockItem1,
      status: 'COMPLETED',
      clinicianName: '李医生',
      completedAt: '2026-09-05T09:30:00Z',
    })
    const viewSpy = vi.fn()

    render(
      <DedicatedWaitingWorkspace
        items={[completedItem]}
        clinicalContext={{ organization: { id: 'org-1', name: '社区卫生中心' }, department: { id: 'dept-1', name: '全科医疗科' } } as ClinicalContext}
        canEdit
        busy={false}
        onEnter={vi.fn()}
        onView={viewSpy}
        onRefresh={vi.fn()}
        onCallItem={vi.fn().mockResolvedValue(undefined)}
        onMissItem={vi.fn().mockResolvedValue(undefined)}
        onRequeueItem={vi.fn().mockResolvedValue(undefined)}
      />
    )

    expect(screen.queryByText('张建国')).not.toBeInTheDocument()
    await user.click(screen.getByText('已接诊'))
    expect(screen.getByText('张建国')).toBeInTheDocument()
    expect(screen.getByText('接诊医生: 李医生')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /接诊 张建国/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /呼叫 张建国/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /查看画像 张建国/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '查看病历 张建国' }))
    expect(viewSpy).toHaveBeenCalledWith(completedItem)
  })
})

describe('AI Pre-consultation data boundary in DoctorWorkstation', () => {
  it('does not expose or apply an AI draft when the queue has no pre-consultation source', async () => {
    const user = userEvent.setup()
    const mockResident: Resident = {
      id: 'res-1',
      fullName: '张建国',
      gender: 'MALE',
      birthDate: '1975-06-15',
      healthRecordNo: 'HR001',
      status: 'ACTIVE',
    } as unknown as Resident

    const mockEncounter: Encounter = {
      id: 'enc-1',
      encounterNo: 'ENC001',
      residentId: 'res-1',
      status: 'REGISTERED',
      visitType: 'GENERAL',
      chiefComplaint: '',
      presentIllness: '',
      medicalHistory: '',
      physicalExam: '',
      treatmentPlan: '',
      diagnoses: [],
    } as unknown as Encounter

    const api = {
      clinicalSafety: {
        vitalSignRules: vi.fn().mockResolvedValue({ rules: [] }),
      },
      scheduling: {
        receptionQueue: vi.fn().mockResolvedValue([mockItem1]),
      },
      outpatientReferrals: { inbox: vi.fn().mockResolvedValue([]) },
      residents: {
        get: vi.fn().mockResolvedValue(mockResident),
        allergies: vi.fn().mockResolvedValue([]),
        conditions: vi.fn().mockResolvedValue([]),
        medications: vi.fn().mockResolvedValue([]),
      },
      encounters: {
        byResident: vi.fn().mockResolvedValue([mockEncounter]),
        start: vi.fn().mockResolvedValue({ ...mockEncounter, status: 'IN_PROGRESS' }),
        complete: vi.fn(),
        suspend: vi.fn(),
        resume: vi.fn(),
      },
      clinicalDocuments: {
        byEncounter: vi.fn().mockResolvedValue([]),
        activeTemplates: vi.fn().mockResolvedValue([]),
      },
      outpatientNoteForms: { list: vi.fn().mockResolvedValue([]) },
      outpatientNoteTemplates: { list: vi.fn().mockResolvedValue([]), use: vi.fn() },
      unifiedOrders: { list: vi.fn().mockResolvedValue([]), serviceDefinitions: vi.fn().mockResolvedValue([]) },
      prescriptions: { byEncounter: vi.fn().mockResolvedValue([]) },
      treatmentTasks: { byEncounter: vi.fn().mockResolvedValue([]) },
      diagnostics: { byEncounter: vi.fn().mockResolvedValue([]) },
      followUp: { byEncounter: vi.fn().mockResolvedValue([]) },
      dictionaries: { systemEnum: vi.fn().mockResolvedValue({ code: 'TEST', name: '测试', items: [] }) },
    } as unknown as RhnApi

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/outpatient/reception']}>
          <DoctorWorkstation api={api} clinicalContext={{ organization: { id: 'org-1', name: '基层中心' }, department: { id: 'dept-1', name: '全科医疗科' } } as ClinicalContext} canEdit />
        </MemoryRouter>
      </QueryClientProvider>
    )

    // Click "接诊 张建国"
    await user.click(await screen.findByRole('button', { name: '接诊 张建国' }))

    expect(await screen.findByPlaceholderText('症状、持续时间及本次就诊原因')).toBeInTheDocument()
    expect(screen.queryByText(/AI 预问诊已提炼主诉与现病史草稿/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /一键采纳预问诊草稿/ })).not.toBeInTheDocument()
    expect((screen.getByPlaceholderText('症状、持续时间及本次就诊原因') as HTMLTextAreaElement).value).toBe('')
    expect((screen.getByPlaceholderText('起病、演变、伴随症状及诊治经过') as HTMLTextAreaElement).value).toBe('')
  })
})
