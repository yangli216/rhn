import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { InpatientEpisode, InpatientOrder, InpatientOrderTask } from '../../shared/api/inpatientApi'
import type { ReturnableWardMedicationLine, WardDelivery, WardMedicationReturnRequest } from '../../shared/api/pharmacyApi'
import type { AllergyIntolerance } from '../../shared/api/residentsApi'
import type { RhnApi } from '../../shared/rhnApi'
import { InpatientOrderWorkspace, OrderComposer } from './InpatientOrderWorkspace'

const episode: InpatientEpisode = {
  id: 'episode-1', revision: 1, episodeNo: 'ZY20260830001', status: 'ADMITTED', residentId: 'resident-1',
  residentName: '张三', healthRecordNo: 'HR001', gender: 'MALE', birthDate: '1980-01-01',
  organizationId: 'org-1', departmentId: 'dept-1', departmentName: '综合病区', encounterId: 'encounter-1',
  encounterNo: 'E001', bedId: 'bed-1', bedNo: '01床', admittedAt: '2026-08-30T08:00:00+08:00',
}

const draftOrder: InpatientOrder = {
  id: 'order-draft', revision: 0, orderNo: 'IO001', orderCategory: 'NURSING', durationType: 'LONG_TERM',
  status: 'DRAFT', episodeId: episode.id, episodeNo: episode.episodeNo, encounterId: episode.encounterId,
  residentId: episode.residentId, residentName: episode.residentName, organizationId: episode.organizationId,
  departmentId: episode.departmentId, itemCode: 'NURSING', itemName: '一级护理', authoredBy: 'user-1',
  authoredAt: '2026-08-30T08:30:00+08:00', tasks: [],
}

const activeOrder: InpatientOrder = {
  ...draftOrder, id: 'order-active', revision: 2, orderNo: 'IO002', orderCategory: 'MEDICATION', status: 'ACTIVE',
  itemCode: 'MED001', itemName: '阿莫西林胶囊', dosageAmount: 0.5, dosageUnit: 'g', routeCode: 'PO', frequencyCode: 'TID',
  signedBy: 'doctor-1', signedAt: '2026-08-30T08:35:00+08:00', verifiedBy: 'nurse-1', verifiedAt: '2026-08-30T08:40:00+08:00',
}

const medicationDraft: InpatientOrder = {
  ...draftOrder, id: 'order-medication-draft', orderNo: 'IO004', orderCategory: 'MEDICATION',
  itemCode: 'MED001', itemName: '阿莫西林胶囊', dosageAmount: 0.5, dosageUnit: 'g', routeCode: 'PO',
  frequencyCode: 'TID',
}

const signedOrder: InpatientOrder = {
  ...draftOrder, id: 'order-signed', revision: 1, orderNo: 'IO003', durationType: 'TEMPORARY', status: 'SIGNED',
  itemName: '监测血糖', signedBy: 'doctor-1', signedAt: '2026-08-30T08:45:00+08:00',
}

const plannedTask: InpatientOrderTask = {
  id: 'task-1', revision: 0, orderId: activeOrder.id, orderNo: activeOrder.orderNo,
  orderCategory: activeOrder.orderCategory, durationType: activeOrder.durationType, episodeId: episode.id,
  encounterId: episode.encounterId, residentId: episode.residentId, residentName: episode.residentName,
  organizationId: episode.organizationId, departmentId: episode.departmentId, itemCode: activeOrder.itemCode,
  itemName: activeOrder.itemName, dosageAmount: activeOrder.dosageAmount, dosageUnit: activeOrder.dosageUnit,
  routeCode: activeOrder.routeCode, frequencyCode: activeOrder.frequencyCode, occurrenceNo: 1,
  scheduledAt: '2026-08-30T10:00:00+08:00', status: 'PLANNED', pharmacyFulfillmentRequired: true,
  pharmacyFulfilled: true, dispenseId: '998877', netDispensedQuantity: 1, pharmacyFulfillmentStatus: 'COMPLETED',
  medicationConsumptions: [],
}

function renderWorkspace(api: RhnApi, value: InpatientEpisode = episode, fixedWorkbench?: 'DOCTOR' | 'NURSE') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}><InpatientOrderWorkspace api={api} episode={value}
    fixedWorkbench={fixedWorkbench} /></QueryClientProvider>)
}

function mockApi(orders: InpatientOrder[], tasks: InpatientOrderTask[] = [], deliveries: WardDelivery[] = []) {
  return {
    masterData: { activeMedicationRoutes: vi.fn().mockResolvedValue([]) },
    inpatient: {
      doctorOrderWorklist: vi.fn().mockResolvedValue({ orders }),
      nurseOrderWorklist: vi.fn().mockResolvedValue({ tasks }),
      createOrderDraft: vi.fn(), signOrder: vi.fn().mockResolvedValue(draftOrder),
      verifyOrder: vi.fn().mockResolvedValue(activeOrder), planOrder: vi.fn().mockResolvedValue(activeOrder),
      stopOrder: vi.fn().mockResolvedValue({ ...activeOrder, status: 'STOPPED' }),
      executeOrderTask: vi.fn().mockResolvedValue({ ...plannedTask, status: 'EXECUTED' }),
      skipOrderTask: vi.fn().mockResolvedValue({ ...plannedTask, status: 'SKIPPED' }),
    },
    pharmacy: {
      wardDeliveries: vi.fn().mockResolvedValue(deliveries),
      receiveWardDelivery: vi.fn().mockImplementation((_id: string) => Promise.resolve(deliveries[0])),
      returnableWardMedications: vi.fn().mockResolvedValue([]),
      wardMedicationReturns: vi.fn().mockResolvedValue([]),
      createWardMedicationReturn: vi.fn(),
      handOverWardMedicationReturn: vi.fn(),
    },
    residents: { allergies: vi.fn().mockResolvedValue([]) },
  } as unknown as RhnApi
}

describe('OrderComposer', () => {
  it('switches among medication, service and nursing entry and creates a nursing draft', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('crypto', { randomUUID: () => 'request-1' })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={queryClient}>
      <OrderComposer api={{ masterData: { activeMedicationRoutes: vi.fn().mockResolvedValue([]) } } as unknown as RhnApi}
        episode={episode} onCreate={onCreate} />
    </QueryClientProvider>)

    expect(screen.getByRole('combobox', { name: '搜索住院药品' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('combobox', { name: '医嘱类别' }))
    await userEvent.click(screen.getByRole('option', { name: '诊疗' }))
    expect(screen.getByRole('combobox', { name: '搜索住院诊疗项目' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('combobox', { name: '医嘱类别' }))
    await userEvent.click(screen.getByRole('option', { name: '护理' }))
    await userEvent.click(screen.getByRole('combobox', { name: '医嘱时效' }))
    await userEvent.click(screen.getByRole('option', { name: '长期医嘱' }))
    await userEvent.type(screen.getByLabelText('护理医嘱内容'), '一级护理')
    await userEvent.type(screen.getByLabelText('住院医嘱执行说明'), '每两小时巡视')
    await userEvent.click(screen.getByRole('button', { name: '保存草稿' }))

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      episodeId: episode.id, orderCategory: 'NURSING', durationType: 'LONG_TERM', itemCode: 'NURSING',
      itemName: '一级护理', instructions: '每两小时巡视', commandCode: 'ORDER-CREATE-request-1',
    })))
  })
})

describe('InpatientOrderWorkspace', () => {
  it('locks the workbench to the owning station without exposing the other role tab', async () => {
    const doctor = renderWorkspace(mockApi([activeOrder], [plannedTask]), episode, 'DOCTOR')
    expect(await screen.findByText('患者医嘱')).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /护士执行/ })).not.toBeInTheDocument()
    doctor.unmount()

    renderWorkspace(mockApi([signedOrder], [plannedTask]), episode, 'NURSE')
    expect(await screen.findByText('待核对医嘱')).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /医生医嘱/ })).not.toBeInTheDocument()
  })

  it('requires allergy review and an override reason before signing a matched medication order', async () => {
    const allergy: AllergyIntolerance = {
      id: 'allergy-1', revision: 0, residentId: episode.residentId, assertionType: 'ALLERGY',
      categoryCode: 'DRUG', clinicalStatus: 'ACTIVE', verificationStatus: 'CONFIRMED',
      informationSource: 'MEDICAL_RECORD', substanceCode: 'MED001', substanceDisplay: '阿莫西林',
      reactionSeverity: 'SEVERE', reactionText: '全身皮疹', recordedAt: '2026-08-30T08:00:00+08:00',
    }
    const api = mockApi([medicationDraft])
    api.residents.allergies = vi.fn().mockResolvedValue([allergy])
    vi.stubGlobal('crypto', { randomUUID: () => 'allergy-sign' })
    renderWorkspace(api)

    await userEvent.click(await screen.findByRole('button', { name: '核对并签署' }))
    expect(screen.getByText('有效药物过敏：阿莫西林')).toBeInTheDocument()
    const submit = screen.getByRole('button', { name: '确认签署' })
    expect(submit).toBeDisabled()
    await userEvent.click(screen.getByRole('checkbox', { name: '我已核对患者药物过敏信息及本次用药' }))
    await userEvent.type(screen.getByLabelText('继续签署理由 阿莫西林胶囊'), '无替代药，严密监护下使用')
    await userEvent.click(submit)

    await waitFor(() => expect(api.inpatient.signOrder).toHaveBeenCalledWith(
      medicationDraft.id, medicationDraft.revision, 'ORDER-SIGN-allergy-sign', true,
      '无替代药，严密监护下使用',
    ))
  })

  it('creates and hands over an unused ward medication return from the nursing workbench', async () => {
    const returnable: ReturnableWardMedicationLine = {
      originalDispenseId: 'dispense-1', originalDispenseLineId: 'dispense-line-1', requestId: activeOrder.id,
      residentId: episode.residentId, encounterId: episode.encounterId, stockSiteId: 'site-1',
      nursingUnitDepartmentId: episode.departmentId, medicationName: activeOrder.itemName,
      issuedQuantity: 2, returnedQuantity: 0, consumedQuantity: 1, pendingReturnQuantity: 0,
      returnableQuantity: 1, unitCode: '粒', baseQuantityFactor: 1, baseUnitCode: '粒',
    }
    const requested: WardMedicationReturnRequest = {
      id: 'ward-return-1', revision: 0, requestNo: 'WMR001', status: 'REQUESTED',
      organizationId: episode.organizationId, stockSiteId: 'site-1', nursingUnitDepartmentId: episode.departmentId,
      residentId: episode.residentId, encounterId: episode.encounterId,
      requestedAt: '2026-08-31T09:00:00+08:00', requestedBy: 'nurse-1', requestNote: '停嘱后未使用',
      lines: [{ id: 'ward-return-line-1', requestId: activeOrder.id, originalDispenseId: 'dispense-1',
        originalDispenseLineId: 'dispense-line-1', dispenseTaskLineId: 'task-line-1',
        medicationName: activeOrder.itemName, requestedQuantity: 1, unitCode: '粒',
        requestedBaseQuantity: 1, baseUnitCode: '粒' }], events: [],
    }
    const handedOver: WardMedicationReturnRequest = {
      ...requested, revision: 1, status: 'IN_TRANSIT', handedOverAt: '2026-08-31T09:05:00+08:00',
      handedOverBy: 'nurse-1', handoverNote: '护士与配送员当面核对交出',
    }
    const api = mockApi([activeOrder])
    api.pharmacy.returnableWardMedications = vi.fn().mockResolvedValue([returnable])
    api.pharmacy.createWardMedicationReturn = vi.fn().mockResolvedValue(requested)
    api.pharmacy.handOverWardMedicationReturn = vi.fn().mockResolvedValue(handedOver)
    vi.stubGlobal('crypto', { randomUUID: () => 'ward-return-command' })
    renderWorkspace(api)

    await userEvent.click(await screen.findByRole('tab', { name: /护士执行/ }))
    const panel = await screen.findByRole('region', { name: '病区余药退回' })
    expect(within(panel).getByText('当前可退').parentElement).toHaveTextContent('1 粒')
    await userEvent.click(within(panel).getByRole('button', { name: '创建退药申请' }))
    await waitFor(() => expect(api.pharmacy.createWardMedicationReturn).toHaveBeenCalledWith({
      encounterId: episode.encounterId,
      commandCode: 'WARD-RETURN-CREATE-dispense-line-1-ward-return-command',
      note: '停嘱后未使用，申请退回药房',
      lines: [{ originalDispenseLineId: 'dispense-line-1', quantity: 1 }],
    }))

    const requestCard = await screen.findByRole('article', { name: '退药申请 WMR001' })
    await userEvent.type(within(requestCard).getByLabelText('交出备注 WMR001'), '护士与配送员当面核对交出')
    await userEvent.click(within(requestCard).getByRole('button', { name: '确认交出' }))
    await waitFor(() => expect(api.pharmacy.handOverWardMedicationReturn).toHaveBeenCalledWith('ward-return-1', {
      expectedRevision: 0,
      commandCode: 'WARD-RETURN-HANDOVER-ward-return-1-ward-return-command',
      note: '护士与配送员当面核对交出',
    }))
    expect(await within(requestCard).findByText(/等待药房逐项验收/)).toBeInTheDocument()
  })

  it('previews automatic pharmacy cancellation before stopping an unfulfilled medication order', async () => {
    const api = mockApi([activeOrder])
    vi.stubGlobal('crypto', { randomUUID: () => 'stop-auto-cancel' })
    renderWorkspace(api)

    await userEvent.click(await screen.findByRole('button', { name: '停嘱' }))
    const closure = screen.getByRole('region', { name: '药品去向 阿莫西林胶囊' })
    expect(within(closure).getByText('未接方，停嘱后自动取消')).toBeInTheDocument()
    expect(within(closure).getByText('自动取消')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '确认停嘱' }))
    await waitFor(() => expect(api.inpatient.stopOrder).toHaveBeenCalledWith(
      activeOrder.id, activeOrder.revision, '病情变化，停止执行', 'ORDER-STOP-stop-auto-cancel',
    ))
  })

  it('shows the immutable medication closure and returnable ward quantity after stopping', async () => {
    const stoppedOrder: InpatientOrder = {
      ...activeOrder, status: 'STOPPED', revision: 3, stoppedBy: 'doctor-1',
      stoppedAt: '2026-08-31T09:00:00+08:00', stopReason: '病情变化，停止执行',
      medicationClosure: {
        status: 'RETURN_REQUIRED', dispenseTaskId: 'dispense-task-1', pharmacyTaskStatus: 'RETURN_REQUIRED',
        dispensedQuantity: 10, consumedQuantity: 4, returnedQuantity: 1, returnableQuantity: 5, unitCode: '粒',
        deliveryId: 'delivery-1', deliveryStatus: 'RECEIVED', action: 'WARD_RETURN',
      },
    }
    renderWorkspace(mockApi([stoppedOrder]))

    const closure = await screen.findByRole('region', { name: '药品去向 阿莫西林胶囊' })
    expect(within(closure).getByText('病区余药 5 粒，待退')).toBeInTheDocument()
    expect(within(closure).getByText('病区待退')).toBeInTheDocument()
    expect(within(closure).getByText('已发 10 · 已用 4 · 已退 1 · 可退 5 粒')).toBeInTheDocument()
  })

  it('lets the doctor sign a draft and plan one exact execution time for an active order', async () => {
    const api = mockApi([draftOrder, activeOrder])
    vi.stubGlobal('crypto', { randomUUID: () => 'request-2' })
    renderWorkspace(api)

    await userEvent.click(await screen.findByRole('button', { name: '签署' }))
    await waitFor(() => expect(api.inpatient.signOrder).toHaveBeenCalledWith(
      draftOrder.id, draftOrder.revision, 'ORDER-SIGN-request-2', undefined, undefined,
    ))
    await userEvent.click(screen.getByRole('button', { name: '安排时点' }))
    await userEvent.click(screen.getByRole('button', { name: '生成任务' }))

    await waitFor(() => expect(api.inpatient.planOrder).toHaveBeenCalledWith(
      activeOrder.id, activeOrder.revision, [expect.any(String)], 'ORDER-PLAN-request-2',
    ))
  })

  it('lets the nurse verify signed orders and execute or skip planned tasks', async () => {
    const secondTask = { ...plannedTask, id: 'task-2', itemName: '雾化吸入', orderNo: 'IO004' }
    const api = mockApi([signedOrder, activeOrder], [plannedTask, secondTask])
    vi.stubGlobal('crypto', { randomUUID: () => 'request-3' })
    renderWorkspace(api)

    await userEvent.click(await screen.findByRole('tab', { name: /护士执行/ }))
    await userEvent.click(screen.getByRole('button', { name: '核对通过' }))
    await waitFor(() => expect(api.inpatient.verifyOrder).toHaveBeenCalledWith(
      signedOrder.id, signedOrder.revision, 'ORDER-VERIFY-request-3',
    ))
    const medicationRow = screen.getByText('阿莫西林胶囊').closest('article')!
    await userEvent.type(within(medicationRow).getByLabelText('执行备注 阿莫西林胶囊'), '患者已服药')
    await userEvent.click(within(medicationRow).getByRole('button', { name: '执行' }))
    await waitFor(() => expect(api.inpatient.executeOrderTask).toHaveBeenCalledWith(
      plannedTask.id, plannedTask.revision, 'COMPLETED', '患者已服药', 'ORDER-TASK-EXECUTE-request-3',
    ))
    const aerosolRow = screen.getByText('雾化吸入').closest('article')!
    await userEvent.click(within(aerosolRow).getByLabelText('跳过原因 雾化吸入'))
    await userEvent.click(screen.getByRole('option', { name: '病情变化' }))
    await userEvent.click(within(aerosolRow).getByRole('button', { name: '跳过' }))
    await waitFor(() => expect(api.inpatient.skipOrderTask).toHaveBeenCalledWith(
      secondTask.id, secondTask.revision, 'CLINICAL_CHANGE', undefined, 'ORDER-TASK-SKIP-request-3',
    ))
  })

  it('shows request-level pharmacy fulfillment and blocks administration until dispensing is complete', async () => {
    const awaitingDispense = {
      ...plannedTask, pharmacyFulfilled: false, dispenseId: undefined, netDispensedQuantity: 0,
      pharmacyFulfillmentStatus: 'NOT_INTAKE',
    }
    const api = mockApi([activeOrder], [awaitingDispense])
    renderWorkspace(api)

    await userEvent.click(await screen.findByRole('tab', { name: /护士执行/ }))
    const taskRow = screen.getByRole('article', { name: '阿莫西林胶囊 第 1 次执行任务' })
    expect(within(taskRow).getByText('待药房接收')).toBeInTheDocument()
    expect(within(taskRow).getByText(/发药完成后方可执行/)).toBeInTheDocument()
    expect(within(taskRow).getByRole('button', { name: '待发药' })).toBeDisabled()
    expect(within(taskRow).getByRole('button', { name: '跳过' })).toBeEnabled()
  })

  it('lets the ward receive a dispatched batch before medication administration', async () => {
    const delivery: WardDelivery = {
      id: 'delivery-1', revision: 1, organizationId: episode.organizationId, stockSiteId: 'site-1',
      nursingUnitDepartmentId: episode.departmentId, deliveryNo: 'PS20260831001', status: 'IN_TRANSIT',
      stockSiteName: '住院药房', nursingUnitName: episode.departmentName, createdAt: '2026-08-31T08:00:00+08:00',
      createdBy: 'pharmacist-1', dispatchedAt: '2026-08-31T08:05:00+08:00', dispatchedBy: 'pharmacist-1',
      lines: [{ id: 'delivery-line-1', dispenseId: plannedTask.dispenseId!, residentId: episode.residentId,
        encounterId: episode.encounterId, residentName: episode.residentName, medicationName: plannedTask.itemName,
        expectedQuantity: 1, receivedQuantity: 0, unitCode: '粒', status: 'PENDING' }], events: [],
    }
    const api = mockApi([activeOrder], [plannedTask], [delivery])
    renderWorkspace(api)

    await userEvent.click(await screen.findByRole('tab', { name: /护士执行/ }))
    expect(screen.getByRole('region', { name: '病区药品交接' })).toHaveTextContent('1 批待签收')
    expect(screen.getByRole('button', { name: '待签收' })).toBeDisabled()
    expect(screen.queryByRole('checkbox', { name: /选择执行 阿莫西林胶囊/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '数量无误，确认签收' }))

    await waitFor(() => expect(api.pharmacy.receiveWardDelivery).toHaveBeenCalledWith(delivery.id, {
      expectedRevision: delivery.revision,
      commandCode: 'WARD-RECEIVE-delivery-1-MATCHED',
      note: '病区逐项核对无误',
      lines: [{ lineId: 'delivery-line-1', receivedQuantity: 1 }],
    }))
  })

  it('groups tasks by execution time and safely executes the selected available tasks', async () => {
    const secondTask = { ...plannedTask, id: 'task-2', itemName: '维生素 C', orderNo: 'IO004', occurrenceNo: 2 }
    const awaitingDispense = { ...plannedTask, id: 'task-3', itemName: '头孢呋辛', orderNo: 'IO005', occurrenceNo: 3,
      pharmacyFulfilled: false, dispenseId: undefined, netDispensedQuantity: 0, pharmacyFulfillmentStatus: 'PENDING' }
    const api = mockApi([activeOrder], [plannedTask, secondTask, awaitingDispense])
    vi.stubGlobal('crypto', { randomUUID: () => 'batch-request' })
    renderWorkspace(api)

    await userEvent.click(await screen.findByRole('tab', { name: /护士执行/ }))
    expect(screen.getByRole('region', { name: /10:00执行任务/ })).toHaveTextContent('3 项待执行 · 共 3 项')
    const selectAvailable = screen.getByRole('checkbox', { name: '选择当前可执行任务' })
    expect(selectAvailable.closest('label')).toHaveTextContent('选择当前可执行 2 项')
    await userEvent.click(selectAvailable)
    await userEvent.type(screen.getByLabelText('批量执行备注'), '同一时点床旁核对完成')
    await userEvent.click(screen.getByRole('button', { name: '执行所选' }))

    await waitFor(() => expect(api.inpatient.executeOrderTask).toHaveBeenCalledTimes(2))
    expect(api.inpatient.executeOrderTask).toHaveBeenCalledWith(plannedTask.id, plannedTask.revision, 'COMPLETED',
      '同一时点床旁核对完成', 'ORDER-TASK-BATCH-task-1-batch-request')
    expect(api.inpatient.executeOrderTask).toHaveBeenCalledWith(secondTask.id, secondTask.revision, 'COMPLETED',
      '同一时点床旁核对完成', 'ORDER-TASK-BATCH-task-2-batch-request')
    expect(api.inpatient.executeOrderTask).not.toHaveBeenCalledWith(awaitingDispense.id, expect.anything(), expect.anything(),
      expect.anything(), expect.anything())
    expect(await screen.findByText('已完成 2 项执行。')).toBeInTheDocument()
  })

  it('presents dispensing trace and completed task facts without treating them as editable', async () => {
    const completed = {
      ...plannedTask, status: 'EXECUTED' as const, outcomeCode: 'GIVEN', executionNote: '患者已服药',
      completedAt: '2026-08-30T10:05:00+08:00', completedBy: 'nurse-7',
      medicationConsumptions: [{ id: 'consume-1', dispenseTaskLineId: 'task-line-1', dispenseId: '998877',
        dispenseLineId: 'dispense-line-1', consumedQuantity: 1, dispenseUnitCode: '粒', consumedBaseQuantity: 1,
        baseUnitCode: '粒', commandCode: 'EXEC-1', consumedAt: '2026-08-30T10:05:00+08:00' }],
    }
    const api = mockApi([activeOrder], [completed])
    renderWorkspace(api)

    await userEvent.click(await screen.findByRole('tab', { name: /护士执行/ }))
    await userEvent.click(screen.getByRole('button', { name: '全部' }))
    const taskRow = screen.getByRole('article', { name: '阿莫西林胶囊 第 1 次执行任务' })
    expect(within(taskRow).getByText('已发药')).toBeInTheDocument()
    expect(within(taskRow).getByText('净发药量 1')).toBeInTheDocument()
    expect(within(taskRow).getByText('发药记录 998877')).toBeInTheDocument()
    expect(within(taskRow).getByText('患者已服药')).toBeInTheDocument()
    expect(within(taskRow).getByText(/执行人 nurse-7/)).toBeInTheDocument()
    expect(within(taskRow).getByText('已核销 1 粒 · 1 条发药明细')).toBeInTheDocument()
    expect(within(taskRow).queryByRole('button', { name: '执行' })).not.toBeInTheDocument()
  })

  it('keeps orders and planned tasks read-only after discharge', async () => {
    const api = mockApi([draftOrder, signedOrder, activeOrder], [plannedTask])
    renderWorkspace({ ...api } as RhnApi, { ...episode, status: 'DISCHARGED', dischargedAt: '2026-08-31T09:00:00+08:00' })

    expect(await screen.findByText('出院只读')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '开立医嘱' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '签署' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: /护士执行/ }))
    expect(screen.queryByRole('button', { name: '核对通过' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '执行' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '跳过' })).not.toBeInTheDocument()
  })
})
