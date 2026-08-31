import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Department, PersonnelAssignment, Practitioner } from '../../shared/api/organizationApi'
import type { StockItem, WardSupplyBatch, WardSupplyLine } from '../../shared/api/pharmacyApi'
import type { RhnApi } from '../../shared/rhnApi'
import { WardDailySupplyPanel } from './WardDailySupplyPanel'

const nursingUnit = {
  id: 'ward-1', code: 'WARD01', name: '一病区', sdOrgType: 'NURSING_UNIT', sdOrgStatus: 'ACTIVE',
} as Department

const stockItem = {
  id: 'stock-item-1', stockSiteId: 'site-1', catalogItemId: 'catalog-1', medicationId: 'medication-1',
  packageId: 'package-1', productCode: 'AMOX001', productName: '阿莫西林胶囊', packageUnitName: '盒',
  packageSpec: '0.25g×24粒', splitAllowed: true, status: 'ACTIVE',
} as StockItem

const alternateStockItem = {
  ...stockItem, id: 'stock-item-2', productCode: 'AMOX002', productName: '阿莫西林胶囊（备选）',
} as StockItem

const pharmacist = {
  id: 'practitioner-1', code: 'PHARM001', fullName: '示范药师', sdPersonnelStatus: 'ACTIVE',
} as Practitioner

const pharmacyAssignment = {
  id: 'assignment-1', code: 'ASN-PHARM-1', organizationId: 'org-1', departmentId: 'pharmacy-department-1',
  positionName: '住院药师', departmentName: '住院药房', sdPersonnelStatus: 'ACTIVE',
} as PersonnelAssignment

const supplyLine: WardSupplyLine = {
  id: 'line-1', batchId: 'batch-1', requestId: 'request-1', residentId: 'resident-1',
  encounterId: 'encounter-1', residentName: '王阿姨', bedNo: '12', catalogItemId: 'catalog-1',
  medicationId: 'medication-1', medicationName: '阿莫西林胶囊', scheduledAt: '2026-08-31T10:00:00+08:00',
  requestedQuantity: 2, coveredQuantity: 0, issuedQuantity: 0, pendingReturnQuantity: 1,
  unitCode: '粒', status: 'GAP', exceptionMessage: '尚未建立发药任务',
}

const batch: WardSupplyBatch = {
  id: 'batch-1', revision: 1, batchNo: 'SUP-20260831-01', stockSiteId: 'site-1',
  nursingUnitDepartmentId: 'ward-1', nursingUnitName: '一病区', businessDate: '2026-08-31', shiftCode: 'DAY',
  status: 'OPEN', summary: { totalLineCount: 4, coveredLineCount: 2, gapLineCount: 1,
    issuedLineCount: 1, pendingReturnLineCount: 1, exceptionLineCount: 1 }, lines: [supplyLine],
  createdAt: '2026-08-31T08:00:00+08:00', updatedAt: '2026-08-31T08:00:00+08:00',
}

function renderPanel(api: RhnApi, stockItems: StockItem[] = [stockItem]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}><WardDailySupplyPanel api={api}
    organizationId="org-1" stockSiteId="site-1" stockItems={stockItems}
    practitioners={[pharmacist]} assignments={[pharmacyAssignment]}
    practitionerId={pharmacist.id} assignmentId={pharmacyAssignment.id}
    onPractitionerChange={vi.fn()} onAssignmentChange={vi.fn()} /></QueryClientProvider>)
}

describe('WardDailySupplyPanel', () => {
  it('shows the daily ward summary and intakes a gap line with the matched stock item', async () => {
    const coveredLine = { ...supplyLine, stockItemId: stockItem.id, status: 'COVERED' as const, coveredQuantity: 2 }
    const api = { organization: { departments: vi.fn().mockResolvedValue([nursingUnit]) }, pharmacy: {
      wardSupplyBatches: vi.fn().mockResolvedValue([batch]),
      wardSupplyBatch: vi.fn().mockResolvedValue(batch),
      createWardSupplyBatch: vi.fn().mockResolvedValue(batch),
      intakeWardSupplyLine: vi.fn().mockResolvedValue(coveredLine),
    } } as unknown as RhnApi
    vi.stubGlobal('crypto', { randomUUID: () => 'command-1' })
    renderPanel(api)

    expect(screen.queryByText('SUP-20260831-01')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '进入滚动供药' }))
    const detail = await screen.findByRole('region', { name: '供药批次 SUP-20260831-01' })
    expect(within(detail).getByText('已覆盖')).toBeInTheDocument()
    expect(within(detail).getByText('缺口')).toBeInTheDocument()
    expect(within(detail).getByText('已发')).toBeInTheDocument()
    expect(within(detail).getByText('待退')).toBeInTheDocument()
    expect(within(detail).getByText('尚未建立发药任务')).toBeInTheDocument()
    expect(within(detail).getByRole('combobox', { name: '库存项目 王阿姨 阿莫西林胶囊' }))
      .toHaveTextContent('阿莫西林胶囊 · 0.25g×24粒')

    await userEvent.click(within(detail).getByRole('button', { name: '接方 王阿姨 阿莫西林胶囊' }))
    await waitFor(() => expect(api.pharmacy.intakeWardSupplyLine).toHaveBeenCalledWith('line-1', {
      stockItemId: 'stock-item-1', description: '滚动供药逐行接方',
    }))
    expect(api.pharmacy.wardSupplyBatches).toHaveBeenCalledWith(expect.objectContaining({
      stockSiteId: 'site-1', nursingUnitDepartmentId: 'ward-1',
    }))
  })

  it('creates the batch for the selected date, shift and nursing unit', async () => {
    const api = { organization: { departments: vi.fn().mockResolvedValue([nursingUnit]) }, pharmacy: {
      wardSupplyBatches: vi.fn().mockResolvedValue([]),
      wardSupplyBatch: vi.fn().mockResolvedValue(batch),
      createWardSupplyBatch: vi.fn().mockResolvedValue(batch),
      intakeWardSupplyLine: vi.fn(),
    } } as unknown as RhnApi
    vi.stubGlobal('crypto', { randomUUID: () => 'command-2' })
    renderPanel(api)

    await userEvent.click(screen.getByRole('button', { name: '进入滚动供药' }))
    await screen.findByText('当前班次尚无供药批次')
    const dateInput = screen.getByLabelText('供药日期')
    const businessDate = (dateInput as HTMLInputElement).value
    const shift = screen.getByLabelText('供药班次').textContent?.includes('白班') ? 'DAY'
      : screen.getByLabelText('供药班次').textContent?.includes('小夜') ? 'EVENING' : 'NIGHT'
    await userEvent.click(screen.getByRole('button', { name: '生成供药批次' }))

    await waitFor(() => expect(api.pharmacy.createWardSupplyBatch).toHaveBeenCalledWith({
      stockSiteId: 'site-1', nursingUnitDepartmentId: 'ward-1', businessDate, shiftCode: shift,
      commandCode: `WARD-SUPPLY-${businessDate}-${shift}-command-2`,
    }))
  })

  it('batch-intakes only pending lines with their resolved stock items', async () => {
    const pendingLine = { ...supplyLine, id: 'line-pending', residentName: '李奶奶',
      status: 'PENDING_INTAKE' as const, exceptionMessage: undefined }
    const selectedPendingLine = { ...pendingLine, id: 'line-selected', residentName: '赵大爷' }
    const value = { ...batch, lines: [pendingLine, selectedPendingLine, supplyLine] }
    const afterIntake = { ...value, lines: [
      { ...pendingLine, status: 'PREPARING' as const, stockItemId: stockItem.id },
      { ...selectedPendingLine, status: 'PREPARING' as const, stockItemId: alternateStockItem.id },
      supplyLine,
    ] }
    const api = { organization: { departments: vi.fn().mockResolvedValue([nursingUnit]) }, pharmacy: {
      wardSupplyBatches: vi.fn().mockResolvedValue([value]),
      wardSupplyBatch: vi.fn().mockResolvedValue(value),
      createWardSupplyBatch: vi.fn().mockResolvedValue(value),
      intakeWardSupplyBatch: vi.fn().mockResolvedValue(afterIntake),
      intakeWardSupplyLine: vi.fn(),
    } } as unknown as RhnApi
    renderPanel(api, [stockItem, alternateStockItem])

    await userEvent.click(screen.getByRole('button', { name: '进入滚动供药' }))
    const detail = await screen.findByRole('region', { name: '供药批次 SUP-20260831-01' })
    await userEvent.click(within(detail).getByRole('combobox', { name: '库存项目 赵大爷 阿莫西林胶囊' }))
    await userEvent.click(await screen.findByRole('option', { name: '阿莫西林胶囊（备选） · 0.25g×24粒' }))
    expect(within(detail).getAllByRole('button', { name: /接方/ })).toHaveLength(4)
    await userEvent.click(within(detail).getByRole('button', { name: '批量接方（2）' }))

    await waitFor(() => expect(api.pharmacy.intakeWardSupplyBatch).toHaveBeenCalledWith('batch-1', {
      lines: [
        { lineId: 'line-pending', stockItemId: 'stock-item-1' },
        { lineId: 'line-selected', stockItemId: 'stock-item-2' },
      ],
      description: '滚动供药批量接方',
    }))
    expect(api.pharmacy.intakeWardSupplyLine).not.toHaveBeenCalled()
  })

  it('disables batch intake and explains when any pending line has no matching stock item', async () => {
    const unmatchedLine = { ...supplyLine, id: 'line-unmatched', catalogItemId: 'catalog-unmatched',
      medicationId: 'medication-unmatched', status: 'PENDING_INTAKE' as const, exceptionMessage: undefined }
    const value = { ...batch, lines: [unmatchedLine] }
    const api = { organization: { departments: vi.fn().mockResolvedValue([nursingUnit]) }, pharmacy: {
      wardSupplyBatches: vi.fn().mockResolvedValue([value]),
      wardSupplyBatch: vi.fn().mockResolvedValue(value),
      createWardSupplyBatch: vi.fn().mockResolvedValue(value),
      intakeWardSupplyBatch: vi.fn(),
      intakeWardSupplyLine: vi.fn(),
    } } as unknown as RhnApi
    renderPanel(api)

    await userEvent.click(screen.getByRole('button', { name: '进入滚动供药' }))
    const detail = await screen.findByRole('region', { name: '供药批次 SUP-20260831-01' })
    expect(within(detail).getByRole('button', { name: '批量接方（1）' })).toBeDisabled()
    expect(within(detail).getByText(/当前有 1 条待接方医嘱没有匹配的库存项目/)).toBeInTheDocument()
    expect(within(detail).getByRole('button', { name: '接方 王阿姨 阿莫西林胶囊' })).toBeDisabled()
  })

  it('reviews and reserves every intaken routine supply line as one batch action', async () => {
    const intakenLine = { ...supplyLine, status: 'PREPARING' as const, exceptionMessage: undefined,
      stockItemId: stockItem.id, dispenseTaskLineId: 'task-line-1', dispenseTaskId: 'task-1',
      dispenseTaskStatus: 'PENDING_REVIEW' as const }
    const value = { ...batch, status: 'IN_PROGRESS' as const, lines: [intakenLine] }
    const afterReserve = { ...value, lines: [{ ...intakenLine, dispenseTaskStatus: 'PICKING' as const }] }
    const api = { organization: { departments: vi.fn().mockResolvedValue([nursingUnit]) }, pharmacy: {
      wardSupplyBatches: vi.fn().mockResolvedValue([value]),
      wardSupplyBatch: vi.fn().mockResolvedValue(value),
      createWardSupplyBatch: vi.fn().mockResolvedValue(value),
      intakeWardSupplyBatch: vi.fn(),
      intakeWardSupplyLine: vi.fn(),
      reviewAndReserveWardSupplyBatch: vi.fn().mockResolvedValue(afterReserve),
    } } as unknown as RhnApi
    renderPanel(api)

    await userEvent.click(screen.getByRole('button', { name: '进入滚动供药' }))
    const detail = await screen.findByRole('region', { name: '供药批次 SUP-20260831-01' })
    await userEvent.click(within(detail).getByRole('button', { name: '审方并预留（1）' }))

    await waitFor(() => expect(api.pharmacy.reviewAndReserveWardSupplyBatch).toHaveBeenCalledWith('batch-1', {
      pharmacistPractitionerId: 'practitioner-1', reviewerAssignmentId: 'assignment-1',
      expiryMinutes: 30, description: '住院滚动供药批量审方并预留库存',
    }))
  })

  it('keeps picking and issuing as separate batch stages and creates a pending ward delivery', async () => {
    const pickingLine = { ...supplyLine, status: 'PREPARING' as const, exceptionMessage: undefined,
      stockItemId: stockItem.id, dispenseTaskLineId: 'task-line-1', dispenseTaskId: 'task-1',
      dispenseTaskStatus: 'PICKING' as const }
    const pickingBatch = { ...batch, status: 'IN_PROGRESS' as const, lines: [pickingLine] }
    const readyBatch = { ...pickingBatch, lines: [{ ...pickingLine, dispenseTaskStatus: 'READY_TO_DISPENSE' as const }] }
    const issuedBatch = { ...readyBatch, lines: [{ ...pickingLine, status: 'ISSUED' as const,
      issuedQuantity: 2, dispenseTaskStatus: 'COMPLETED' as const }] }
    const api = { organization: { departments: vi.fn().mockResolvedValue([nursingUnit]) }, pharmacy: {
      wardSupplyBatches: vi.fn().mockResolvedValue([pickingBatch]),
      wardSupplyBatch: vi.fn().mockResolvedValueOnce(pickingBatch).mockResolvedValueOnce(readyBatch)
        .mockResolvedValue(issuedBatch),
      createWardSupplyBatch: vi.fn().mockResolvedValue(pickingBatch),
      intakeWardSupplyBatch: vi.fn(), intakeWardSupplyLine: vi.fn(),
      reviewAndReserveWardSupplyBatch: vi.fn(),
      completePickingWardSupplyBatch: vi.fn().mockResolvedValue(readyBatch),
      dispenseDeliverWardSupplyBatch: vi.fn().mockResolvedValue({ batch: issuedBatch, deliveries: [{
        id: 'delivery-1', deliveryNo: 'IPMS-WD-batch-1-1', status: 'PENDING_DISPATCH', lines: [], events: [],
      }, {
        id: 'delivery-2', deliveryNo: 'IPMS-WD-batch-1-2', status: 'PENDING_DISPATCH', lines: [], events: [],
      }] }),
    } } as unknown as RhnApi
    renderPanel(api)

    await userEvent.click(screen.getByRole('button', { name: '进入滚动供药' }))
    const detail = await screen.findByRole('region', { name: '供药批次 SUP-20260831-01' })
    expect(within(detail).getByRole('button', { name: '整批发药并建配送单' })).toBeDisabled()
    await userEvent.click(within(detail).getByRole('button', { name: '确认整批配药（1）' }))
    await waitFor(() => expect(api.pharmacy.completePickingWardSupplyBatch).toHaveBeenCalledWith('batch-1', {
      pickerPractitionerId: 'practitioner-1', pickerAssignmentId: 'assignment-1',
      description: '住院滚动供药整批配药复核',
    }))
    await waitFor(() => expect(within(detail).getByRole('button', { name: '整批发药并建配送单（1）' })).toBeEnabled())
    await userEvent.click(within(detail).getByRole('button', { name: '整批发药并建配送单（1）' }))
    await waitFor(() => expect(api.pharmacy.dispenseDeliverWardSupplyBatch).toHaveBeenCalledWith('batch-1', {
      dispenserPractitionerId: 'practitioner-1', dispenserAssignmentId: 'assignment-1',
      description: '住院滚动供药整批发药并建立配送交接',
    }))
    expect(await within(detail).findByText(/已建立 2 张待送出的病区配送单/)).toHaveTextContent(
      'IPMS-WD-batch-1-1、IPMS-WD-batch-1-2',
    )
    expect(within(detail).getByRole('button', { name: '恢复配送结果（1）' })).toBeDisabled()
  })

  it('recovers a committed fulfillment after a lost response by replaying the same batch command', async () => {
    const readyLine = { ...supplyLine, status: 'PREPARING' as const, exceptionMessage: undefined,
      stockItemId: stockItem.id, dispenseTaskLineId: 'task-line-1', dispenseTaskId: 'task-1',
      dispenseTaskStatus: 'READY_TO_DISPENSE' as const }
    const readyBatch = { ...batch, status: 'IN_PROGRESS' as const, lines: [readyLine] }
    const issuedBatch = { ...readyBatch, lines: [{ ...readyLine, status: 'ISSUED' as const,
      issuedQuantity: 2, dispenseTaskStatus: 'COMPLETED' as const }] }
    const fulfillment = { batch: issuedBatch, deliveries: [{ id: 'delivery-1',
      deliveryNo: 'IPMS-WD-batch-1-1', status: 'PENDING_DISPATCH', lines: [], events: [] }] }
    const dispenseDeliver = vi.fn().mockRejectedValueOnce(new Error('响应中断')).mockResolvedValue(fulfillment)
    const api = { organization: { departments: vi.fn().mockResolvedValue([nursingUnit]) }, pharmacy: {
      wardSupplyBatches: vi.fn().mockResolvedValue([readyBatch]),
      wardSupplyBatch: vi.fn().mockResolvedValueOnce(readyBatch).mockResolvedValue(issuedBatch),
      createWardSupplyBatch: vi.fn().mockResolvedValue(readyBatch),
      intakeWardSupplyBatch: vi.fn(), intakeWardSupplyLine: vi.fn(),
      reviewAndReserveWardSupplyBatch: vi.fn(), completePickingWardSupplyBatch: vi.fn(),
      dispenseDeliverWardSupplyBatch: dispenseDeliver,
    } } as unknown as RhnApi
    renderPanel(api)

    await userEvent.click(screen.getByRole('button', { name: '进入滚动供药' }))
    const detail = await screen.findByRole('region', { name: '供药批次 SUP-20260831-01' })
    await userEvent.click(within(detail).getByRole('button', { name: '整批发药并建配送单（1）' }))
    await waitFor(() => expect(within(detail).getByRole('button', { name: '恢复配送结果（1）' })).toBeEnabled())
    await userEvent.click(within(detail).getByRole('button', { name: '恢复配送结果（1）' }))

    const stableInput = {
      dispenserPractitionerId: 'practitioner-1', dispenserAssignmentId: 'assignment-1',
      description: '住院滚动供药整批发药并建立配送交接',
    }
    await waitFor(() => expect(dispenseDeliver).toHaveBeenCalledTimes(2))
    expect(dispenseDeliver).toHaveBeenNthCalledWith(1, 'batch-1', stableInput)
    expect(dispenseDeliver).toHaveBeenNthCalledWith(2, 'batch-1', stableInput)
    expect(await within(detail).findByText(/IPMS-WD-batch-1-1/)).toBeInTheDocument()
  })

  it('excludes controlled and high-alert products from routine batch dispensing', async () => {
    const readyLine = { ...supplyLine, status: 'PREPARING' as const, exceptionMessage: undefined,
      stockItemId: stockItem.id, dispenseTaskLineId: 'task-line-1', dispenseTaskId: 'task-1',
      dispenseTaskStatus: 'READY_TO_DISPENSE' as const }
    const value = { ...batch, status: 'IN_PROGRESS' as const, lines: [readyLine] }
    const api = { organization: { departments: vi.fn().mockResolvedValue([nursingUnit]) }, pharmacy: {
      wardSupplyBatches: vi.fn().mockResolvedValue([value]), wardSupplyBatch: vi.fn().mockResolvedValue(value),
      createWardSupplyBatch: vi.fn(), intakeWardSupplyBatch: vi.fn(), intakeWardSupplyLine: vi.fn(),
      reviewAndReserveWardSupplyBatch: vi.fn(), completePickingWardSupplyBatch: vi.fn(),
      dispenseDeliverWardSupplyBatch: vi.fn(),
    } } as unknown as RhnApi
    renderPanel(api, [{ ...stockItem, controlled: true, highAlert: true }])

    await userEvent.click(screen.getByRole('button', { name: '进入滚动供药' }))
    const detail = await screen.findByRole('region', { name: '供药批次 SUP-20260831-01' })
    expect(within(detail).getByRole('button', { name: '整批发药并建配送单（1）' })).toBeDisabled()
    expect(within(detail).getByText(/受控或高警示药品/)).toBeInTheDocument()
    expect(api.pharmacy.dispenseDeliverWardSupplyBatch).not.toHaveBeenCalled()
  })

  it('deduplicates repeated task links in progress counts and blocks unsafe batch execution', async () => {
    const pickingLine = { ...supplyLine, status: 'PREPARING' as const, exceptionMessage: undefined,
      stockItemId: stockItem.id, dispenseTaskLineId: 'task-line-1', dispenseTaskId: 'task-1',
      dispenseTaskStatus: 'PICKING' as const }
    const duplicateLine = { ...pickingLine, id: 'line-duplicate', requestId: 'request-duplicate',
      dispenseTaskLineId: 'task-line-duplicate', residentName: '李奶奶' }
    const value = { ...batch, status: 'IN_PROGRESS' as const, lines: [pickingLine, duplicateLine] }
    const api = { organization: { departments: vi.fn().mockResolvedValue([nursingUnit]) }, pharmacy: {
      wardSupplyBatches: vi.fn().mockResolvedValue([value]), wardSupplyBatch: vi.fn().mockResolvedValue(value),
      createWardSupplyBatch: vi.fn(), intakeWardSupplyBatch: vi.fn(), intakeWardSupplyLine: vi.fn(),
      reviewAndReserveWardSupplyBatch: vi.fn(), completePickingWardSupplyBatch: vi.fn(),
      dispenseDeliverWardSupplyBatch: vi.fn(),
    } } as unknown as RhnApi
    renderPanel(api)

    await userEvent.click(screen.getByRole('button', { name: '进入滚动供药' }))
    const detail = await screen.findByRole('region', { name: '供药批次 SUP-20260831-01' })
    expect(within(detail).getByText(/待配药 1 · 待发药 0/)).toBeInTheDocument()
    expect(within(detail).getByRole('button', { name: '确认整批配药（1）' })).toBeDisabled()
    expect(within(detail).getByText(/存在 1 条重复任务关联/)).toBeInTheDocument()
    expect(api.pharmacy.completePickingWardSupplyBatch).not.toHaveBeenCalled()
  })
})
