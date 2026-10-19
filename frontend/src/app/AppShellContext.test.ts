import { describe, expect, it } from 'vitest'
import type { WorkContextOption } from '../shared/rhnApi'
import { canAccessDiagnosticWorkspace, NAVIGATION_NODES, selectableWarehouseContexts, selectableWorkContexts, tabForPath, workContextTypeForPath } from './AppShell'

describe('AppShell work context routing', () => {
  it('places institution payment configuration under system settings with its dedicated permission', () => {
    const settings = NAVIGATION_NODES.find(node => node.label === '系统设置')
    expect(settings?.children?.find(node => node.id === 'payment-channels')).toMatchObject({
      label: '支付渠道', to: '/settings/payment-channels', requiredAuthority: 'PAYMENT_CONFIGURATION.MANAGE',
    })
    expect(tabForPath('/settings/payment-channels')).toMatchObject({ title: '支付渠道', icon: 'settings' })
  })
  it('groups laboratory, examination, skin tests, treatments and clinical printing under medtech-services', () => {
    const medtech = NAVIGATION_NODES.find((node) => node.id === 'medtech-services')
    expect(medtech).toBeDefined()
    expect(medtech?.label).toBe('医技管理')
    const children = medtech?.children?.map((child) => child.id) ?? []
    expect(children).toEqual(['laboratory', 'examination', 'skin-tests', 'treatments', 'clinical-printing'])
    expect(children).not.toContain('diagnostics')

    const outpatient = NAVIGATION_NODES.find((node) => node.id === 'outpatient-services')
    expect(outpatient).toBeDefined()
    const outpatientChildren = outpatient?.children?.map((child) => child.id) ?? []
    expect(outpatientChildren).not.toContain('laboratory')
    expect(outpatientChildren).not.toContain('examination')
    expect(outpatientChildren).not.toContain('skin-tests')
    expect(outpatientChildren).not.toContain('treatments')
    expect(outpatientChildren).not.toContain('clinical-printing')
  })

  it('requires category rights for medical technology menus and retained tab paths', () => {
    const lab = new Set(['DIAGNOSTICS.ACCESS', 'DIAGNOSTICS.LABORATORY.VIEW'])
    expect(canAccessDiagnosticWorkspace('/diagnostics/laboratory?encounterId=e1', lab)).toBe(true)
    expect(canAccessDiagnosticWorkspace('/diagnostics/examination', lab)).toBe(false)
    expect(canAccessDiagnosticWorkspace('/diagnostics/laboratory', new Set(['DIAGNOSTICS.ACCESS']))).toBe(false)
    expect(canAccessDiagnosticWorkspace('/diagnostics/examination', new Set(['DIAGNOSTICS.EXAMINATION.SIGN']))).toBe(true)
  })
  it('routes inpatient workspaces to the ward context independently from outpatient clinics', () => {
    expect(workContextTypeForPath('/inpatient')).toBe('GENERAL')
    expect(workContextTypeForPath('/inpatient/orders?episodeId=1')).toBe('GENERAL')
    expect(workContextTypeForPath('/outpatient/reception')).toBe('CLINICAL')
    expect(workContextTypeForPath('/billing/settlement')).toBe('CLINICAL')
    expect(workContextTypeForPath('/billing/query')).toBe('CLINICAL')
  })

  it('routes medical technology workspaces to the MEDTECH context independently from outpatient clinics', () => {
    expect(workContextTypeForPath('/diagnostics/laboratory')).toBe('MEDTECH')
    expect(workContextTypeForPath('/diagnostics/examination')).toBe('MEDTECH')
    expect(workContextTypeForPath('/diagnostics/laboratory?status=READY')).toBe('MEDTECH')
    expect(workContextTypeForPath('/skin-tests')).toBe('MEDTECH')
    expect(workContextTypeForPath('/treatments')).toBe('MEDTECH')
    expect(workContextTypeForPath('/printing/batches')).toBe('MEDTECH')
  })

  it('keeps the four pharmacy functions in the pharmacy context while warehouse remains independent', () => {
    expect(workContextTypeForPath('/pharmacy')).toBe('PHARMACY')
    expect(workContextTypeForPath('/pharmacy/returns')).toBe('PHARMACY')
    expect(workContextTypeForPath('/pharmacy/query')).toBe('PHARMACY')
    expect(workContextTypeForPath('/pharmacy/ward-delivery')).toBe('PHARMACY')
    expect(workContextTypeForPath('/pharmacy/warehouse')).toBe('INVENTORY')
  })

  it('keeps only department-scoped contexts selectable by a business workspace', () => {
    const contexts = [
      {
        organizationId: null,
        departmentId: null,
        organizationName: null,
        departmentName: null,
        workContextType: 'GENERAL',
        dataScopeType: 'TENANT',
        roleCodes: ['PRESENCE_ADMIN'],
      },
      {
        organizationId: 'org-1',
        departmentId: 'ward-1',
        organizationName: '青禾镇中心卫生院',
        departmentName: '综合病区',
        workContextType: 'GENERAL',
        dataScopeType: 'DEPARTMENT',
        roleCodes: ['PORTAL_OPERATOR'],
      },
    ] as unknown as WorkContextOption[]

    expect(selectableWorkContexts(contexts, 'GENERAL')).toEqual([contexts[1]])
  })

  it('allows selecting both INVENTORY and PHARMACY departments in warehouse management', () => {
    const contexts = [
      {
        organizationId: 'org-1',
        departmentId: 'wh-1',
        departmentName: '中心药库',
        workContextType: 'INVENTORY',
      },
      {
        organizationId: 'org-1',
        departmentId: 'ph-1',
        departmentName: '门诊药房',
        workContextType: 'PHARMACY',
      },
      {
        organizationId: 'org-1',
        departmentId: 'ph-2',
        departmentName: '住院药房',
        workContextType: 'PHARMACY',
      },
      {
        organizationId: 'org-1',
        departmentId: 'clinic-1',
        departmentName: '全科门诊',
        workContextType: 'CLINICAL',
      },
    ] as unknown as WorkContextOption[]

    const warehouseContexts = selectableWarehouseContexts(contexts)
    expect(warehouseContexts.map((c) => c.departmentName)).toEqual([
      '中心药库',
      '门诊药房',
      '住院药房',
    ])
  })

  it('filters selectable departments specifically for MEDTECH workspaces', () => {
    const contexts = [
      {
        organizationId: 'org-1',
        departmentId: 'lab-1',
        departmentName: '医学检验科',
        workContextType: 'MEDTECH',
      },
      {
        organizationId: 'org-1',
        departmentId: 'pac-1',
        departmentName: '医学影像科',
        workContextType: 'MEDTECH',
      },
      {
        organizationId: 'org-1',
        departmentId: 'clinic-1',
        departmentName: '全科门诊',
        workContextType: 'CLINICAL',
      },
    ] as unknown as WorkContextOption[]

    const medtechContexts = selectableWorkContexts(contexts, 'MEDTECH')
    expect(medtechContexts.map((c) => c.departmentName)).toEqual([
      '医学检验科',
      '医学影像科',
    ])
  })

  it('opens print template management in a workspace tab', () => {
    expect(tabForPath('/settings/print-templates')).toMatchObject({
      path: '/settings/print-templates',
      title: '打印模板',
      icon: 'print',
    })
  })

  it('opens resident center, medication rules and analytics in workspace tabs', () => {
    expect(tabForPath('/residents')).toMatchObject({
      path: '/residents',
      title: '居民中心',
      icon: 'residents',
    })
    expect(tabForPath('/quality/medication-rules')).toMatchObject({
      path: '/quality/medication-rules',
      title: '合理用药规则',
      icon: 'clinical',
    })
    expect(tabForPath('/analytics/registration')).toMatchObject({
      path: '/analytics/registration',
      title: '门诊挂号统计',
      icon: 'residents',
    })
    expect(tabForPath('/analytics/workload')).toMatchObject({
      path: '/analytics/workload',
      title: '门诊就诊工作量',
      icon: 'clinical',
    })
  })

  it('assigns distinctive healthcare icons to doctor stations, nurse stations, diagnostics, and master data', () => {
    expect(tabForPath('/outpatient/reception')).toMatchObject({
      title: '门诊医生站',
      icon: 'stethoscope',
    })
    expect(tabForPath('/inpatient/doctor-station')).toMatchObject({
      title: '住院医生站',
      icon: 'stethoscope',
    })
    expect(tabForPath('/inpatient/nurse-station')).toMatchObject({
      title: '病区护士站',
      icon: 'bed',
    })
    expect(tabForPath('/diagnostics/laboratory')).toMatchObject({
      title: '检验工作台',
      icon: 'flask',
    })
    expect(tabForPath('/diagnostics/examination')).toMatchObject({
      title: '检查工作台',
      icon: 'clinical',
    })
    expect(tabForPath('/skin-tests')).toMatchObject({
      title: '皮试管理',
      icon: 'syringe',
    })
    expect(tabForPath('/treatments')).toMatchObject({
      title: '治疗执行',
      icon: 'syringe',
    })
    expect(tabForPath('/settings/master-data')).toMatchObject({
      title: '基础数据中心',
      icon: 'database',
    })
    expect(tabForPath('/settings/medications')).toMatchObject({
      title: '药品知识与目录',
      icon: 'pill',
    })
    expect(tabForPath('/settings/services')).toMatchObject({
      title: '诊疗服务目录',
      icon: 'clinical',
    })
    expect(tabForPath('/settings/standard-mappings')).toMatchObject({
      title: '标准映射管理',
      icon: 'roadmap',
    })
    expect(tabForPath('/settings/diseases')).toMatchObject({
      title: '疾病与诊断标准',
      icon: 'database',
    })
    expect(tabForPath('/settings/operations')).toMatchObject({
      title: '耗材与运营主数据',
      icon: 'card',
    })
  })
})
