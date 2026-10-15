import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { DiagnosticExecutionTask, DiagnosticSpecimen } from '../../../shared/api/diagnosticsApi'
import type { RhnApi } from '../../../shared/rhnApi'
import { SpecimenThermalLabelModal } from './SpecimenThermalLabelModal'

describe('SpecimenThermalLabelModal', () => {
  const mockApi = {
    diagnostics: {
      print: vi.fn(),
    },
  } as unknown as RhnApi

  const mockSpecimen: DiagnosticSpecimen = {
    id: 'spec-888',
    specimenNo: 'SPEC-20261014-888',
    specimenType: 'WHOLE_BLOOD',
    specimenName: '静脉全血',
    containerCode: 'TUBE_PURPLE_EDTA',
    containerName: 'EDTA-K2抗凝管',
    status: 'COLLECTED',
    collectedAt: '2026-10-14 08:30:00',
    revision: 1,
    taskIds: ['task-1'],
  }

  const mockTask: DiagnosticExecutionTask = {
    id: 'task-1',
    taskNo: null,
    requestId: 'req-1',
    requestNo: 'REQ-2026-0001',
    itemName: '全血细胞分析+五分类',
    itemCode: 'LAB-CBC-5DIFF',
    requestType: 'LABORATORY',
    status: 'COLLECTED',
    revision: 1,
    organizationId: 'org-1',
    departmentId: 'dept-1',
    residentId: 'res-1',
    residentName: '李四',
    gender: 'MALE',
    genderText: '男',
    healthRecordNo: 'HR-2026-9999',
    encounterId: 'ENC-001',
    createdAt: '2026-10-14 08:00:00',
  }

  const renderModal = (ui: React.ReactElement) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
  }

  it('renders thermal label preview with 60x40mm standards and barcode', () => {
    renderModal(
      <SpecimenThermalLabelModal
        api={mockApi}
        specimen={mockSpecimen}
        task={mockTask}
        organizationName="示范人民医院检验科"
        onClose={vi.fn()}
      />
    )

    expect(screen.getByText('示范人民医院检验科')).toBeInTheDocument()
    expect(screen.getByText('李四')).toBeInTheDocument()
    expect(screen.getByText('HR-2026-9999')).toBeInTheDocument()
    expect(screen.getByText('全血细胞分析+五分类')).toBeInTheDocument()
    expect(screen.getByText('SPEC-20261014-888')).toBeInTheDocument()
    expect(screen.getByText(/EDTA-K2抗凝管/)).toBeInTheDocument()
    expect(screen.getByText('单号: REQ-2026-0001')).toBeInTheDocument()
  })

  it('triggers window.print when print button is clicked', () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {})
    renderModal(
      <SpecimenThermalLabelModal
        api={mockApi}
        specimen={mockSpecimen}
        task={mockTask}
        onClose={vi.fn()}
      />
    )

    const printBtn = screen.getByText('一键热敏打印 (60×40mm)')
    fireEvent.click(printBtn)

    expect(printSpy).toHaveBeenCalled()
    expect(screen.getByText(/已发送至热敏打印机/)).toBeInTheDocument()
    printSpy.mockRestore()
  })

  it('triggers onClose when close button is clicked', () => {
    const onClose = vi.fn()
    renderModal(
      <SpecimenThermalLabelModal
        api={mockApi}
        specimen={mockSpecimen}
        task={mockTask}
        onClose={onClose}
      />
    )

    const closeBtn = screen.getByText('关闭')
    fireEvent.click(closeBtn)

    expect(onClose).toHaveBeenCalled()
  })
})
