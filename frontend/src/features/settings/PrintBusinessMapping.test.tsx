import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type {
  PrintBusinessOverview, PrintBusinessTask, PrintTaskResolution, RhnApi,
} from '../../shared/rhnApi'
import { PrintBusinessMapping } from './PrintBusinessMapping'

const taskSpecs = [
  ['OP.MEDICAL_RECORD.PRINT', '门诊病历打印', 'CLINICAL_DOCUMENT', 'ClinicalDocument', 'CLINICAL_DOCUMENT', 'RHN.PRINT.OUTPATIENT_NOTE.V1', false],
  ['OP.PRESCRIPTION.WESTERN.PRINT', '门诊西药处方打印', 'PRESCRIPTION', 'Prescription', 'PRESCRIPTION', 'RHN.PRINT.OUTPATIENT_PRESCRIPTION.V1', false],
  ['OP.APPLICATION.LAB.PRINT', '检验申请单打印', 'APPLICATION', 'ServiceRequest', 'SERVICE_REQUEST', 'RHN.PRINT.LABORATORY_APPLICATION.V1', false],
  ['OP.APPLICATION.EXAM.PRINT', '检查申请单打印', 'APPLICATION', 'ServiceRequest', 'SERVICE_REQUEST', 'RHN.PRINT.EXAMINATION_APPLICATION.V1', false],
  ['OP.APPLICATION.TREATMENT.PRINT', '治疗申请单打印', 'APPLICATION', 'ServiceRequest', 'SERVICE_REQUEST', 'RHN.PRINT.TREATMENT_APPLICATION.V1', false],
  ['TREATMENT.ORAL_MEDICATION_CARD.PRINT', '口服药卡打印', 'CARD', 'MedicationExecutionTask', 'TREATMENT_EXECUTION', 'RHN.PRINT.ORAL_MEDICATION_CARD.V1', true],
  ['TREATMENT.INFUSION_LABEL.PRINT', '输液瓶签打印', 'LABEL', 'MedicationExecutionTask', 'TREATMENT_EXECUTION', 'RHN.PRINT.INFUSION_LABEL.V1', true],
  ['TREATMENT.INFUSION_PATROL_CARD.PRINT', '输液巡视卡打印', 'CARD', 'MedicationExecutionTask', 'TREATMENT_EXECUTION', 'RHN.PRINT.INFUSION_PATROL_CARD.V1', true],
] as const

const tasks: PrintBusinessTask[] = taskSpecs.map((value, index) => ({
  id: `task-${index + 1}`, revision: 0, taskCode: value[0], taskName: value[1], category: value[2],
  sourceType: value[3], dataProviderCode: value[4], payloadSchema: value[5], schemaVersion: 1,
  allowedPurposes: index === 1 ? ['PATIENT_COPY', 'ARCHIVE_COPY'] : index >= 5 ? ['CLINICAL_USE']
    : ['CLINICAL_USE', 'PATIENT_COPY', 'ARCHIVE_COPY'],
  batchSupported: value[6], status: 'ACTIVE',
}))

const implementation = {
  id: 'impl-1', revision: 0, implementationCode: 'PLATFORM_OUTPATIENT_NOTE',
  implementationName: '平台门诊病历实现', rendererType: 'INTERNAL_TEMPLATE', adapterCode: 'RHN_INTERNAL_PDF',
  templateId: 'template-1', templateCode: 'OUTPATIENT_NOTE_A4', templateName: '门诊病历 A4',
  payloadSchema: tasks[0].payloadSchema, outputFormat: 'PDF', scope: 'PLATFORM', status: 'ACTIVE',
} as const

const platformBinding = {
  id: 'binding-platform', revision: 0, taskDefinitionId: tasks[0].id, purpose: '*',
  implementationId: implementation.id, scopeType: 'PLATFORM', ownerName: '平台默认',
  fallbackPolicy: 'FAIL_CLOSED', validFrom: '2026-09-13T08:00:00Z', validTo: null, status: 'ACTIVE',
} as const

const overview: PrintBusinessOverview = {
  tasks, implementations: [implementation], bindings: [platformBinding], tenantId: 'tenant-1',
  organizationId: 'org-1', departmentId: 'dept-1', organizationName: '仁和示范医院',
}

const resolution: PrintTaskResolution = {
  task: tasks[0], implementation, binding: platformBinding, templateCode: 'OUTPATIENT_NOTE_A4',
  templateName: '门诊病历 A4', templateVersion: 3,
  trace: [
    { scopeType: 'DEPARTMENT', result: '未配置科室覆盖', selected: false },
    { scopeType: 'ORGANIZATION', result: '未配置机构覆盖', selected: false },
    { scopeType: 'TENANT', result: '未配置租户覆盖', selected: false },
    { scopeType: 'PLATFORM', result: '命中平台默认绑定', selected: true, bindingId: platformBinding.id },
  ],
}

function renderMapping() {
  const bindPrintImplementation = vi.fn().mockResolvedValue({
    ...platformBinding, id: 'binding-org', revision: 0, scopeType: 'ORGANIZATION', ownerName: '仁和示范医院',
  })
  const api = { printing: {
    printBusinessOverview: vi.fn().mockResolvedValue(overview),
    previewPrintTaskResolution: vi.fn().mockResolvedValue(resolution),
    bindPrintImplementation,
  } } as unknown as RhnApi
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(<QueryClientProvider client={client}><PrintBusinessMapping api={api} /></QueryClientProvider>)
  return { bindPrintImplementation }
}

describe('PrintBusinessMapping', () => {
  it('loads the standard task catalog and shows the effective resolution trace', async () => {
    renderMapping()

    const catalog = await screen.findByLabelText('标准打印任务')
    expect(within(catalog).getAllByRole('button')).toHaveLength(8)
    expect(within(catalog).getByText('TREATMENT.INFUSION_LABEL.PRINT')).toBeInTheDocument()
    const effective = await screen.findByLabelText('生效配置')
    expect(await within(effective).findByText((_, node) => node?.textContent === '平台 · 门诊病历 A4 V3')).toBeInTheDocument()
    expect(within(effective).getByText('命中平台默认绑定')).toBeInTheDocument()
  })

  it('saves an organization implementation override', async () => {
    const user = userEvent.setup()
    const { bindPrintImplementation } = renderMapping()

    await screen.findByText('命中平台默认绑定')
    const save = screen.getByRole('button', { name: '保存并立即生效' })
    await waitFor(() => expect(save).toBeEnabled())
    await user.click(save)

    await waitFor(() => expect(bindPrintImplementation).toHaveBeenCalledWith({
      expectedRevision: 0, taskDefinitionId: tasks[0].id, scopeType: 'ORGANIZATION', purpose: '*',
      implementationId: implementation.id, fallbackPolicy: 'FAIL_CLOSED',
    }))
    expect(await screen.findByText('打印业务映射已生效')).toBeInTheDocument()
  })
})
