import { describe, expect, it } from 'vitest'
import { simulateAttributeResolution } from './attributeInheritanceSimulator'

describe('attributeInheritanceSimulator', () => {
  const mockScopeDefinition = {
    id: 'def-1',
    code: 'EXAM.NOTE',
    name: '检查须知',
    variability: 'SCOPE_OVERRIDE' as const,
    allowedScopes: ['TENANT', 'ORGANIZATION', 'DEPARTMENT'] as any,
    defaultValue: '标准须知',
  } as any

  it('resolves department value when department override is configured', () => {
    const result = simulateAttributeResolution(mockScopeDefinition, {
      departmentValue: '急诊特供须知',
      organizationValue: '分院须知',
      tenantBaseValue: '全院须知',
      typeDefaultValue: '检查类型须知',
    })

    expect(result.sourceLevel).toBe('DEPARTMENT')
    expect(result.effectiveValue).toBe('急诊特供须知')
    expect(result.steps.find((s) => s.level === 'DEPARTMENT')?.isEffective).toBe(true)
    expect(result.steps.find((s) => s.level === 'ORGANIZATION')?.isEffective).toBe(false)
  })

  it('falls back to organization level when department is not configured', () => {
    const result = simulateAttributeResolution(mockScopeDefinition, {
      departmentValue: '',
      organizationValue: '分院须知',
      tenantBaseValue: '全院须知',
    })

    expect(result.sourceLevel).toBe('ORGANIZATION')
    expect(result.effectiveValue).toBe('分院须知')
  })

  it('falls back to tenant base value when both department and organization are omitted', () => {
    const result = simulateAttributeResolution(mockScopeDefinition, {
      tenantBaseValue: '全院统配须知',
    })

    expect(result.sourceLevel).toBe('TENANT')
    expect(result.effectiveValue).toBe('全院统配须知')
  })

  it('falls back to system definition default when no overrides exist', () => {
    const result = simulateAttributeResolution(mockScopeDefinition, {})

    expect(result.sourceLevel).toBe('SYSTEM_DEFAULT')
    expect(result.effectiveValue).toBe('标准须知')
  })

  it('supports explicit null override at department level', () => {
    const result = simulateAttributeResolution(mockScopeDefinition, {
      departmentExplicitNull: true,
      organizationValue: '分院须知',
      tenantBaseValue: '全院须知',
    })

    expect(result.sourceLevel).toBe('DEPARTMENT')
    expect(result.effectiveValue).toBeNull()
  })

  it('respects BASE_ONLY variability by ignoring department and organization overrides', () => {
    const baseOnlyDef = {
      ...mockScopeDefinition,
      variability: 'BASE_ONLY' as const,
      allowedScopes: [],
    }

    const result = simulateAttributeResolution(baseOnlyDef, {
      departmentValue: '非法科室值',
      organizationValue: '非法机构值',
      tenantBaseValue: '租户基线值',
    })

    expect(result.sourceLevel).toBe('TENANT')
    expect(result.effectiveValue).toBe('租户基线值')
    expect(result.steps.find((s) => s.level === 'DEPARTMENT')?.allowed).toBe(false)
    expect(result.steps.find((s) => s.level === 'ORGANIZATION')?.allowed).toBe(false)
  })
})
