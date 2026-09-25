import { describe, expect, it } from 'vitest'
import type { WorkContextOption } from '../shared/rhnApi'
import { selectableWarehouseContexts, selectableWorkContexts, tabForPath, workContextTypeForPath } from './AppShell'

describe('AppShell work context routing', () => {
  it('routes inpatient workspaces to the ward context independently from outpatient clinics', () => {
    expect(workContextTypeForPath('/inpatient')).toBe('GENERAL')
    expect(workContextTypeForPath('/inpatient/orders?episodeId=1')).toBe('GENERAL')
    expect(workContextTypeForPath('/outpatient/reception')).toBe('CLINICAL')
    expect(workContextTypeForPath('/billing/settlement')).toBe('CLINICAL')
    expect(workContextTypeForPath('/billing/query')).toBe('CLINICAL')
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
    expect(tabForPath('/diagnostics')).toMatchObject({
      title: '检查检验',
      icon: 'flask',
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
