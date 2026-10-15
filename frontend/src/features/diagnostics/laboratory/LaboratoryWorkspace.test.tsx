import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { DiagnosticExecutionTask } from '../../../shared/api/diagnosticsApi'
import type { ClinicalContext } from '../../../shared/clinical/workContext'
import type { RhnApi } from '../../../shared/rhnApi'
import { LaboratoryWorkspace } from './LaboratoryWorkspace'

const context: ClinicalContext = {
  organization: { id: 'org-lis', name: '示范检验中心' },
  department: { id: 'dept-lis', name: '医学检验科' },
} as ClinicalContext

const mockTasks: DiagnosticExecutionTask[] = [
  {
    id: 'task-lab-1',
    taskNo: null,
    requestId: 'req-1',
    requestNo: 'REQ-2026-0001',
    specimenNo: 'SPEC-20261014-001',
    itemName: '全血细胞分析+五分类',
    itemCode: 'LAB-CBC',
    requestType: 'LABORATORY',
    status: 'COLLECTED',
    revision: 1,
    organizationId: 'org-lis',
    departmentId: 'dept-lis',
    residentId: 'res-1',
    residentName: '张三',
    healthRecordNo: 'HR-1001',
    encounterId: 'enc-1',
    createdAt: '2026-10-14 08:00:00',
  },
  {
    id: 'task-lab-2',
    taskNo: null,
    requestId: 'req-2',
    requestNo: 'REQ-2026-0002',
    specimenNo: 'SPEC-20261014-002',
    itemName: '肝功能七项',
    itemCode: 'LAB-LFT',
    requestType: 'LABORATORY',
    status: 'READY',
    revision: 1,
    organizationId: 'org-lis',
    departmentId: 'dept-lis',
    residentId: 'res-2',
    residentName: '李四',
    healthRecordNo: 'HR-1002',
    encounterId: 'enc-2',
    createdAt: '2026-10-14 08:10:00',
  },
]

describe('LaboratoryWorkspace LIS Features', () => {
  const setup = () => {
    const api = {
      diagnostics: {
        worklistPage: vi.fn().mockResolvedValue({
          content: mockTasks,
          totalElements: mockTasks.length,
          totalPages: 1,
          page: 0,
          size: 20,
        }),
        specimens: vi.fn().mockResolvedValue([]),
        reportTemplate: vi.fn().mockResolvedValue(null),
        reportsByRequest: vi.fn().mockResolvedValue([]),
        draft: vi.fn().mockResolvedValue({ revision: 0, doubleSignatureRequired: false }),
      },
      residents: {
        get: vi.fn().mockImplementation(async (id: string) => ({
          id,
          healthRecordNo: mockTasks.find((t) => t.residentId === id)?.healthRecordNo,
          gender: 'MALE',
          birthDate: '1985-05-15',
        })),
      },
    } as unknown as RhnApi

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const result = render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <LaboratoryWorkspace api={api} clinicalContext={context} onNavigate={vi.fn()} />
        </MemoryRouter>
      </QueryClientProvider>
    )

    return { api, ...result }
  }

  it('renders LIS workbench with barcode scanner badge and recommended tube info', async () => {
    setup()

    expect(await screen.findByText('检验工作台 (LIS)')).toBeInTheDocument()
    expect(screen.getByText('扫码枪就绪 (HID)')).toBeInTheDocument()
    expect(await screen.findByText('全血细胞分析+五分类')).toBeInTheDocument()

    // 扫描标本二直接定位肝功能项目并展开右侧标准管信息（黄头分离胶促凝管）
    const barcode = 'SPEC-20261014-002'
    for (const char of barcode) {
      fireEvent.keyDown(window, { key: char })
    }
    fireEvent.keyDown(window, { key: 'Enter' })

    expect(await screen.findByText('分离胶促凝管（黄头管）')).toBeInTheDocument()
    expect(screen.getByText(/惰性分离胶 \+ 促凝剂/)).toBeInTheDocument()
  })

  it('auto-selects matched task when barcode is scanned via keyboard simulation', async () => {
    setup()

    await screen.findByText('全血细胞分析+五分类')

    // 模拟扫码枪高速键入标本号 SPEC-20261014-002 并按 Enter
    const barcode = 'SPEC-20261014-002'
    for (const char of barcode) {
      fireEvent.keyDown(window, { key: char })
    }
    fireEvent.keyDown(window, { key: 'Enter' })

    // 应该弹出扫码定位成功提示
    expect(await screen.findByText(/扫码核收定位成功：已选中条码 SPEC-20261014-002/)).toBeInTheDocument()
    expect(screen.getByText(/李四 · 肝功能七项/)).toBeInTheDocument()
  })

  it('switches to global keyword query when scanned barcode is not in current list', async () => {
    const { api } = setup()

    await screen.findByText('全血细胞分析+五分类')

    // 模拟扫描不在当前列表的条码
    const barcode = 'SPEC-UNKNOWN-999'
    for (const char of barcode) {
      fireEvent.keyDown(window, { key: char })
    }
    fireEvent.keyDown(window, { key: 'Enter' })

    expect(await screen.findByText(/扫码检索：当前页未命中，正在全库检索条码 SPEC-UNKNOWN-999/)).toBeInTheDocument()
    expect(api.diagnostics.worklistPage).toHaveBeenCalledWith(
      'LABORATORY',
      'SPEC-UNKNOWN-999',
      0,
      20,
      undefined,
      undefined,
      expect.anything()
    )
  })
})
