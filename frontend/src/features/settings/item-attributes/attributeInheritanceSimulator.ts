import type {
  ItemAttributeDefinitionConfiguration,
  ItemAttributeJson,
} from '../../../shared/rhnApi'

export type ResolutionSourceLevel =
  | 'DEPARTMENT'
  | 'ORGANIZATION'
  | 'TENANT'
  | 'ITEM_TYPE'
  | 'SYSTEM_DEFAULT'
  | 'NONE'

export interface ScopeValueInput {
  departmentValue?: string
  departmentExplicitNull?: boolean
  organizationValue?: string
  organizationExplicitNull?: boolean
  tenantBaseValue?: string
  tenantExplicitNull?: boolean
  typeDefaultValue?: string
}

export interface InheritanceStep {
  level: ResolutionSourceLevel
  levelName: string
  allowed: boolean
  configuredValue?: string
  isExplicitNull: boolean
  isEffective: boolean
  statusText: string
}

export interface SimulationResult {
  effectiveValue: string | null | undefined
  sourceLevel: ResolutionSourceLevel
  sourceLevelName: string
  steps: InheritanceStep[]
  explanation: string
}

export function simulateAttributeResolution(
  definition: ItemAttributeDefinitionConfiguration,
  input: ScopeValueInput
): SimulationResult {
  const steps: InheritanceStep[] = []
  let effectiveLevel: ResolutionSourceLevel = 'NONE'
  let effectiveValue: string | null | undefined = undefined

  const {
    variability,
    allowedScopes,
    defaultValue: definitionDefault,
  } = definition

  const defDefaultStr =
    definitionDefault === undefined || definitionDefault === null
      ? undefined
      : typeof definitionDefault === 'object'
        ? JSON.stringify(definitionDefault)
        : String(definitionDefault)

  // 1. 科室层级
  const deptAllowed = variability !== 'BASE_ONLY' && allowedScopes.includes('DEPARTMENT')
  const deptHasValue = input.departmentValue !== undefined && input.departmentValue.trim() !== ''
  const deptIsNull = Boolean(input.departmentExplicitNull)
  const deptEffective = deptAllowed && (deptHasValue || deptIsNull)

  let deptStatus = '未配置覆盖'
  if (!deptAllowed) deptStatus = '属性定义禁止科室覆盖'
  else if (deptIsNull) deptStatus = '显式覆盖为空值 (null)'
  else if (deptHasValue) deptStatus = '已维护科室个性化值'

  steps.push({
    level: 'DEPARTMENT',
    levelName: '科室级覆盖',
    allowed: deptAllowed,
    configuredValue: deptIsNull ? 'null (显式置空)' : input.departmentValue,
    isExplicitNull: deptIsNull,
    isEffective: deptEffective,
    statusText: deptStatus,
  })

  if (deptEffective) {
    effectiveLevel = 'DEPARTMENT'
    effectiveValue = deptIsNull ? null : input.departmentValue
  }

  // 2. 机构层级
  const orgAllowed = variability !== 'BASE_ONLY' && allowedScopes.includes('ORGANIZATION')
  const orgHasValue = input.organizationValue !== undefined && input.organizationValue.trim() !== ''
  const orgIsNull = Boolean(input.organizationExplicitNull)
  const orgEffective = effectiveLevel === 'NONE' && orgAllowed && (orgHasValue || orgIsNull)

  let orgStatus = '未配置覆盖'
  if (!orgAllowed) orgStatus = '属性定义禁止机构覆盖'
  else if (effectiveLevel !== 'NONE') orgStatus = `已被上一级 [${steps[0].levelName}] 优先覆盖`
  else if (orgIsNull) orgStatus = '显式覆盖为空值 (null)'
  else if (orgHasValue) orgStatus = '已维护机构级个性化值'

  steps.push({
    level: 'ORGANIZATION',
    levelName: '机构级覆盖',
    allowed: orgAllowed,
    configuredValue: orgIsNull ? 'null (显式置空)' : input.organizationValue,
    isExplicitNull: orgIsNull,
    isEffective: orgEffective,
    statusText: orgStatus,
  })

  if (orgEffective) {
    effectiveLevel = 'ORGANIZATION'
    effectiveValue = orgIsNull ? null : input.organizationValue
  }

  // 3. 租户公共值
  const tenantAllowed = variability !== 'LOCAL_ONLY'
  const tenantHasValue = input.tenantBaseValue !== undefined && input.tenantBaseValue.trim() !== ''
  const tenantIsNull = Boolean(input.tenantExplicitNull)
  const tenantEffective = effectiveLevel === 'NONE' && tenantAllowed && (tenantHasValue || tenantIsNull)

  let tenantStatus = '未维护租户公共基线'
  if (!tenantAllowed) tenantStatus = '必须本地配置，无租户公共基线'
  else if (effectiveLevel !== 'NONE') tenantStatus = `已被下级 [${steps.find((s) => s.isEffective)?.levelName ?? effectiveLevel}] 覆盖`
  else if (tenantIsNull) tenantStatus = '租户基线显式置空'
  else if (tenantHasValue) tenantStatus = '已设定租户统一公共基线值'

  steps.push({
    level: 'TENANT',
    levelName: '租户公共值',
    allowed: tenantAllowed,
    configuredValue: tenantIsNull ? 'null (显式置空)' : input.tenantBaseValue,
    isExplicitNull: tenantIsNull,
    isEffective: tenantEffective,
    statusText: tenantStatus,
  })

  if (tenantEffective) {
    effectiveLevel = 'TENANT'
    effectiveValue = tenantIsNull ? null : input.tenantBaseValue
  }

  // 4. 类型默认值
  const typeHasValue = input.typeDefaultValue !== undefined && input.typeDefaultValue.trim() !== ''
  const typeEffective = effectiveLevel === 'NONE' && typeHasValue

  let typeStatus = '未设定类型默认值'
  if (effectiveLevel !== 'NONE') typeStatus = `已被 [${steps.find((s) => s.isEffective)?.levelName ?? effectiveLevel}] 覆盖`
  else if (typeHasValue) typeStatus = '已设定项目类型默认值'

  steps.push({
    level: 'ITEM_TYPE',
    levelName: '项目类型默认值',
    allowed: true,
    configuredValue: input.typeDefaultValue,
    isExplicitNull: false,
    isEffective: typeEffective,
    statusText: typeStatus,
  })

  if (typeEffective) {
    effectiveLevel = 'ITEM_TYPE'
    effectiveValue = input.typeDefaultValue
  }

  // 5. 系统定义默认值
  const defHasValue = defDefaultStr !== undefined && defDefaultStr.trim() !== ''
  const defEffective = effectiveLevel === 'NONE' && defHasValue

  let defStatus = '未设置定义默认值'
  if (effectiveLevel !== 'NONE') defStatus = `已被 [${steps.find((s) => s.isEffective)?.levelName ?? effectiveLevel}] 覆盖`
  else if (defHasValue) defStatus = '最终回退到属性定义系统默认值'

  steps.push({
    level: 'SYSTEM_DEFAULT',
    levelName: '属性定义默认值',
    allowed: true,
    configuredValue: defDefaultStr,
    isExplicitNull: false,
    isEffective: defEffective,
    statusText: defStatus,
  })

  if (defEffective) {
    effectiveLevel = 'SYSTEM_DEFAULT'
    effectiveValue = defDefaultStr
  }

  const levelNameMap: Record<ResolutionSourceLevel, string> = {
    DEPARTMENT: '科室级覆盖',
    ORGANIZATION: '机构级覆盖',
    TENANT: '租户公共值',
    ITEM_TYPE: '项目类型默认值',
    SYSTEM_DEFAULT: '属性定义默认值',
    NONE: '未生效（无值）',
  }

  let explanation = ''
  if (effectiveLevel === 'NONE') {
    explanation = '由于所有层级均未维护有效值且未设定默认值，当前运行时将解析为空。'
  } else {
    explanation = `依据多级继承规则，最终在【${levelNameMap[effectiveLevel]}】层级命中生效，值为：“${effectiveValue}”。`
  }

  return {
    effectiveValue,
    sourceLevel: effectiveLevel,
    sourceLevelName: levelNameMap[effectiveLevel],
    steps,
    explanation,
  }
}
