import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { DiagnosticExecutionTask } from '../../../shared/api/diagnosticsApi'
import type { ClinicalContext } from '../../../shared/clinical/workContext'
import type { RhnApi } from '../../../shared/rhnApi'
import { ExaminationWorkspace } from './ExaminationWorkspace'

const context: ClinicalContext = {
  organization: { id: 'org-pacs', name: '示范医学影像中心' },
  department: { id: 'dept-pacs', name: '放射影像科' },
} as ClinicalContext

const mockExamTasks: DiagnosticExecutionTask[] = [
  {
    id: 'task-exam-1',
    taskNo: null,
    requestId: 'req-dr-1',
    requestNo: 'REQ-DR-2026-0001',
    itemName: '胸部正位DR摄影',
    itemCode: 'EXAM-DR-CHEST',
    requestType: 'EXAMINATION',
    status: 'READY',
    revision: 1,
    organizationId: 'org-pacs',
    departmentId: 'dept-pacs',
    residentId: 'res-1',
    residentName: '赵六',
    healthRecordNo: 'HR-2001',
    encounterId: 'enc-1',
    createdAt: '2026-10-14 09:00:00',
  },
  {
    id: 'task-exam-2',
    taskNo: null,
    requestId: 'req-us-2',
    requestNo: 'REQ-US-2026-0002',
    itemName: '腹部多普勒彩色超声',
    itemCode: 'EXAM-US-ABD',
    requestType: 'EXAMINATION',
    status: 'IN_PROGRESS',
    revision: 2,
    organizationId: 'org-pacs',
    departmentId: 'dept-pacs',
    residentId: 'res-2',
    residentName: '钱七',
    healthRecordNo: 'HR-2002',
    encounterId: 'enc-2',
    createdAt: '2026-10-14 09:15:00',
  },
  {
    id: 'task-exam-3',
    taskNo: null,
    requestId: 'req-ct-3',
    requestNo: 'REQ-CT-2026-0003',
    itemName: '头颅CT平扫',
    itemCode: 'EXAM-CT-HEAD',
    requestType: 'EXAMINATION',
    status: 'COMPLETED',
    reportId: 'rep-ct-3',
    revision: 3,
    organizationId: 'org-pacs',
    departmentId: 'dept-pacs',
    residentId: 'res-3',
    residentName: '孙八',
    healthRecordNo: 'HR-2003',
    encounterId: 'enc-3',
    createdAt: '2026-10-14 09:30:00',
  },
]

describe('ExaminationWorkspace PACS Features', () => {
  const setup = (tasks = mockExamTasks) => {
    const api = {
      diagnostics: {
        worklistPage: vi.fn().mockResolvedValue({
          content: tasks,
          totalElements: tasks.length,
          totalPages: 1,
          page: 0,
          size: 20,
        }),
        start: vi.fn().mockResolvedValue({ id: 'task-exam-1', status: 'IN_PROGRESS' }),
        reportTemplate: vi.fn().mockResolvedValue(null),
        reportsByRequest: vi.fn().mockResolvedValue([
          {
            id: 'rep-ct-3',
            requestId: 'req-ct-3',
            reportNo: 'RPT-2026-001',
            status: 'FINAL',
            findings: '颅内未见异常密度影。',
            conclusion: '头颅CT平扫未见明显异常。',
            observations: [],
          },
        ]),
        draft: vi.fn().mockResolvedValue({
          revision: 1,
          doubleSignatureRequired: false,
          content: { findings: '双肺清晰', conclusion: '未见异常' },
          images: [],
        }),
      },
      residents: {
        get: vi.fn().mockImplementation(async (id: string) => ({
          id,
          healthRecordNo: tasks.find((t) => t.residentId === id)?.healthRecordNo,
          gender: 'FEMALE',
          birthDate: '1990-08-20',
        })),
      },
      printing: {
        recordsBySource: vi.fn().mockResolvedValue([]),
        submitTask: vi.fn().mockResolvedValue({ receiptId: 'rcpt-1' }),
        download: vi.fn().mockResolvedValue(undefined),
      },
    } as unknown as RhnApi

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const result = render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <ExaminationWorkspace api={api} clinicalContext={context} onNavigate={vi.fn()} />
        </MemoryRouter>
      </QueryClientProvider>
    )

    return { api, ...result }
  }

  it('renders PACS examination workbench with modality badges, queue and standard equipment card', async () => {
    setup()

    expect(await screen.findByText('检查工作台 (PACS)')).toBeInTheDocument()
    expect(screen.getByText('PACS 影像网关已联通')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /赵六 · \[DR\] 胸部正位DR摄影/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /钱七 · \[US\] 腹部多普勒彩色超声/ })).toBeInTheDocument()

    // 默认选中第一项 DR，右栏与核对面板显示 DR 设备规范与准备说明
    expect(await screen.findByText('设备规范 (DR)')).toBeInTheDocument()
    expect(screen.getAllByText(/检查前去除检查部位金属物品/).length).toBeGreaterThanOrEqual(1)
  })

  it('performs three-checks & seven-rights verification and starts examination', async () => {
    const { api } = setup()

    // 第一项状态为 READY，中栏显示三查七对面板
    expect(await screen.findByText('三查七对与检查准备核对')).toBeInTheDocument()
    expect(screen.getByText(/已完成患者身份三查七对，已核对检查部位与技术方法/)).toBeInTheDocument()

    const startBtn = screen.getByRole('button', { name: '确认核对并开始检查' })
    expect(startBtn).toBeEnabled()

    fireEvent.click(startBtn)
    await waitFor(() => expect(api.diagnostics.start).toHaveBeenCalledWith('task-exam-1', 1))
  })

  it('switches to PACS imaging tab and renders keyframe management', async () => {
    setup()

    await screen.findByRole('button', { name: /赵六 · \[DR\] 胸部正位DR摄影/ })

    // 切换到 PACS 影像附件 tab
    const imagesTab = screen.getByRole('tab', { name: 'PACS 影像附件' })
    fireEvent.click(imagesTab)

    expect(await screen.findByText('PACS 关键影像采集与灯箱阅片')).toBeInTheDocument()
    expect(screen.getByText(/支持粘贴或上传超声、心电、内窥镜或 DR\/CT 关键征象切面截图/)).toBeInTheDocument()
  })

  it('allows selecting completed examination and displays report printing action', async () => {
    setup()

    // 点击第三项（已完成的头颅CT）
    const ctChoice = await screen.findByRole('button', { name: /孙八 · \[CT\] 头颅CT平扫/ })
    fireEvent.click(ctChoice)

    expect(await screen.findByText('设备规范 (CT)')).toBeInTheDocument()
    expect(screen.getByText('该检查已完成并签发正式医学影像图文报告：')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '下载正式报告 PDF' })).toBeInTheDocument()
  })

  it('filters queue by selected modality', async () => {
    setup()

    await screen.findByRole('button', { name: /赵六 · \[DR\] 胸部正位DR摄影/ })
    expect(screen.getByRole('button', { name: /钱七 · \[US\] 腹部多普勒彩色超声/ })).toBeInTheDocument()

    // 选择超声 US
    const modalityTrigger = screen.getByLabelText('影像类别 (Modality)')
    fireEvent.click(modalityTrigger)
    const usOption = await screen.findByRole('option', { name: /US 超声医学影像/ })
    fireEvent.click(usOption)

    // 点击查询
    fireEvent.click(screen.getByRole('button', { name: '查询' }))

    // 只有 US 项保留，DR 项被过滤
    expect(await screen.findByRole('button', { name: /钱七 · \[US\] 腹部多普勒彩色超声/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /赵六 · \[DR\] 胸部正位DR摄影/ })).not.toBeInTheDocument()
  })
})
