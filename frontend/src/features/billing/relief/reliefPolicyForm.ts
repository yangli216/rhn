import type { ReliefDraftInput, ReliefPolicy, ReliefQualificationInput, ReliefRuleInput, ReliefVersionView } from '../../../shared/api/reliefApi'

export type FeeScope = NonNullable<ReliefRuleInput['feeScope']>
export type ReliefMethod = NonNullable<ReliefRuleInput['method']>
export type QualificationSource = NonNullable<ReliefQualificationInput['source']>
export type FailurePolicy = NonNullable<ReliefQualificationInput['failurePolicy']>
export type QuotaPeriod = NonNullable<ReliefDraftInput['quotaPeriod']>

/** 规则行编辑态：数值以文本保存，比例按百分数录入，提交时换算为 0–1。 */
export interface RuleForm {
  key: string
  feeScope: FeeScope
  scopeValue: string
  catalogItemId: string
  scopeName: string
  excluded: boolean
  method: ReliefMethod | ''
  percent: string
  amount: string
  manualMaxAmount: string
  periodMaxCount: string
}

export interface QualificationForm {
  key: string
  source: QualificationSource
  qualificationType: string
  minAge: string
  maxAge: string
  genders: string[]
  coverageTypes: string
  providerCode: string
  failurePolicy: FailurePolicy | ''
}

export interface PolicyForm {
  code: string
  name: string
  description: string
  timing: 'PRE_INSURANCE' | 'POST_INSURANCE'
  sponsor: NonNullable<ReliefDraftInput['sponsor']>
  payerCode: string
  payerName: string
  organizationIds: string[]
  scenes: string[]
  effectiveFrom: string
  effectiveTo: string
  priority: string
  mutexGroup: string
  stackable: boolean
  qualificationMode: 'ANY' | 'ALL'
  insuredApplicable: boolean
  baseIncludesPersonalAccount: boolean
  onceMaxAmount: string
  /** 收费员单次核定超过该金额需审批权限；仅含人工核定规则时有效。 */
  manualApprovalAmount: string
  quotaPeriod: QuotaPeriod
  periodMaxAmount: string
  periodMaxCount: string
  shareAcrossScenes: boolean
  shareAcrossOrganizations: boolean
  versionNote: string
  rules: RuleForm[]
  qualifications: QualificationForm[]
}

let sequence = 0
const nextKey = () => `row-${++sequence}`

export function emptyRule(): RuleForm {
  return { key: nextKey(), feeScope: 'ALL', scopeValue: '', catalogItemId: '', scopeName: '', excluded: false,
    method: 'RATIO', percent: '', amount: '', manualMaxAmount: '', periodMaxCount: '' }
}

export function emptyQualification(): QualificationForm {
  return { key: nextKey(), source: 'ROSTER', qualificationType: '', minAge: '', maxAge: '', genders: [],
    coverageTypes: '', providerCode: '', failurePolicy: '' }
}

export function emptyPolicyForm(today: string): PolicyForm {
  return {
    code: '', name: '', description: '', timing: 'POST_INSURANCE', sponsor: 'HOSPITAL', payerCode: '', payerName: '',
    organizationIds: [], scenes: ['OUTPATIENT'], effectiveFrom: today, effectiveTo: '', priority: '100', mutexGroup: '',
    stackable: true, qualificationMode: 'ANY', insuredApplicable: true, baseIncludesPersonalAccount: false,
    onceMaxAmount: '', manualApprovalAmount: '', quotaPeriod: 'NONE', periodMaxAmount: '', periodMaxCount: '', shareAcrossScenes: true,
    shareAcrossOrganizations: true, versionNote: '', rules: [emptyRule()], qualifications: [emptyQualification()],
  }
}

const text = (value: number | string | undefined | null) => value === undefined || value === null ? '' : String(value)

/** 有草稿时编辑草稿，否则以当前生效版本为底稿；保存后服务端生成新草稿版本。 */
export function editableVersion(policy: ReliefPolicy): ReliefVersionView | undefined {
  return policy.draft ?? policy.current
}

export function formFromPolicy(policy: ReliefPolicy, today: string): PolicyForm {
  const version = editableVersion(policy)
  const base = emptyPolicyForm(today)
  if (!version) return { ...base, code: policy.code, name: policy.name, description: policy.description ?? '' }
  return {
    code: policy.code, name: policy.name, description: policy.description ?? '',
    timing: version.timing === 'PRE_INSURANCE' ? 'PRE_INSURANCE' : 'POST_INSURANCE',
    sponsor: (version.sponsor as PolicyForm['sponsor']) ?? 'HOSPITAL',
    payerCode: version.payerCode ?? '', payerName: version.payerName ?? '',
    organizationIds: version.scope?.organizationIds ?? [], scenes: version.scope?.scenes ?? [],
    effectiveFrom: version.effectiveFrom ?? today, effectiveTo: version.effectiveTo ?? '',
    priority: text(version.priority), mutexGroup: version.mutexGroup ?? '', stackable: version.stackable ?? true,
    qualificationMode: version.qualificationMode === 'ALL' ? 'ALL' : 'ANY',
    insuredApplicable: version.insuredApplicable ?? true, baseIncludesPersonalAccount: version.baseIncludesPersonalAccount ?? false,
    onceMaxAmount: text(version.onceMaxAmount), manualApprovalAmount: text(version.manualApprovalAmount), quotaPeriod: (version.quotaPeriod as QuotaPeriod) ?? 'NONE',
    periodMaxAmount: text(version.periodMaxAmount), periodMaxCount: text(version.periodMaxCount),
    shareAcrossScenes: version.shareAcrossScenes ?? true, shareAcrossOrganizations: version.shareAcrossOrganizations ?? true,
    versionNote: policy.draft ? version.versionNote ?? '' : '',
    rules: (version.rules ?? []).map((rule) => ({
      key: nextKey(), feeScope: (rule.feeScope as FeeScope) ?? 'ALL', scopeValue: rule.scopeValue ?? '',
      catalogItemId: rule.catalogItemId ?? '', scopeName: rule.scopeName ?? '', excluded: Boolean(rule.excluded),
      method: (rule.method as ReliefMethod) ?? '', percent: rule.ratio === undefined || rule.ratio === null ? '' : String(round(rule.ratio * 100)),
      amount: text(rule.amount), manualMaxAmount: text(rule.manualMaxAmount), periodMaxCount: text(rule.periodMaxCount),
    })),
    qualifications: (version.qualifications ?? []).map((value) => ({
      key: nextKey(), source: (value.source as QualificationSource) ?? 'ALL', qualificationType: value.qualificationType ?? '',
      minAge: text(value.conditions?.minAge), maxAge: text(value.conditions?.maxAge), genders: value.conditions?.genders ?? [],
      coverageTypes: (value.conditions?.coverageTypes ?? []).join('、'), providerCode: value.providerCode ?? '',
      failurePolicy: (value.failurePolicy as FailurePolicy) ?? '',
    })),
  }
}

function round(value: number) { return Math.round(value * 1e6) / 1e6 }

function decimal(value: string, label: string, errors: string[], options: { positive?: boolean } = {}) {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed) || parsed < 0 || (options.positive && parsed === 0)) {
    errors.push(`${label}必须是${options.positive ? '大于零' : '不小于零'}的数字`)
    return undefined
  }
  return parsed
}

function integer(value: string, label: string, errors: string[], min = 1) {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const parsed = Number(trimmed)
  if (!Number.isInteger(parsed) || parsed < min) {
    errors.push(`${label}必须是不小于 ${min} 的整数`)
    return undefined
  }
  return parsed
}

/** 组装提交内容；只做录入层校验，业务规则（周期、互斥、时机与方式组合）由服务端统一判定并返回原因。 */
export function toDraftInput(form: PolicyForm): { draft: ReliefDraftInput; errors: string[] } {
  const errors: string[] = []
  if (!form.name.trim()) errors.push('请填写政策名称')
  if (!form.scenes.length) errors.push('请至少选择一个适用结算场景')
  if (!form.effectiveFrom) errors.push('请选择生效日期')
  if (form.effectiveTo && form.effectiveFrom && form.effectiveTo < form.effectiveFrom) errors.push('失效日期不能早于生效日期')
  if (!form.rules.length) errors.push('请至少配置一条费用规则')
  if (!form.qualifications.length) errors.push('请至少配置一项资格条件')
  const rules: ReliefRuleInput[] = form.rules.map((rule, index) => {
    const label = `第 ${index + 1} 条规则`
    if (rule.feeScope === 'ACCOUNTING_CATEGORY' && !rule.scopeValue) errors.push(`${label}请选择费用大类`)
    if (rule.feeScope === 'SOURCE_TYPE' && !rule.scopeValue) errors.push(`${label}请选择收费来源`)
    if (rule.feeScope === 'CATALOG_ITEM' && !rule.catalogItemId) errors.push(`${label}请选择收费项目`)
    if (rule.feeScope === 'ALL' && rule.excluded) errors.push(`${label}全部费用不能作为排除项`)
    const scoped = {
      feeScope: rule.feeScope,
      scopeValue: rule.feeScope === 'ACCOUNTING_CATEGORY' || rule.feeScope === 'SOURCE_TYPE' ? rule.scopeValue : undefined,
      catalogItemId: rule.feeScope === 'CATALOG_ITEM' ? rule.catalogItemId : undefined,
      scopeName: rule.feeScope === 'CATALOG_ITEM' ? rule.scopeName : undefined,
      excluded: rule.excluded,
    }
    if (rule.excluded) return scoped
    if (!rule.method) errors.push(`${label}请选择减免方式`)
    const percent = rule.method === 'RATIO' ? decimal(rule.percent, `${label}减免比例`, errors, { positive: true }) : undefined
    if (rule.method === 'RATIO' && percent === undefined && !rule.percent.trim()) errors.push(`${label}请填写减免比例`)
    if (percent !== undefined && percent > 100) errors.push(`${label}减免比例不能超过 100%`)
    const needsAmount = rule.method === 'FIXED_AMOUNT' || rule.method === 'UNIT_AMOUNT' || rule.method === 'PRICE_CAP'
    const amount = needsAmount ? decimal(rule.amount, `${label}金额`, errors, { positive: rule.method !== 'PRICE_CAP' }) : undefined
    if (needsAmount && !rule.amount.trim()) errors.push(`${label}请填写金额`)
    return {
      ...scoped,
      method: rule.method || undefined,
      ratio: percent === undefined ? undefined : round(percent / 100),
      amount,
      manualMaxAmount: rule.method === 'MANUAL' ? decimal(rule.manualMaxAmount, `${label}核定上限`, errors, { positive: true }) : undefined,
      periodMaxCount: integer(rule.periodMaxCount, `${label}周期次数`, errors),
    }
  })
  const qualifications: ReliefQualificationInput[] = form.qualifications.map((value, index) => {
    const label = `第 ${index + 1} 项资格`
    if (value.source === 'ROSTER') {
      if (!value.qualificationType) errors.push(`${label}请选择资格类别`)
      return { source: value.source, qualificationType: value.qualificationType || undefined }
    }
    if (value.source === 'ATTRIBUTE') {
      const minAge = integer(value.minAge, `${label}最小年龄`, errors, 0)
      const maxAge = integer(value.maxAge, `${label}最大年龄`, errors, 0)
      if (minAge !== undefined && maxAge !== undefined && minAge > maxAge) errors.push(`${label}最小年龄不能大于最大年龄`)
      const coverageTypes = value.coverageTypes.split(/[,，、\s]+/).map((item) => item.trim()).filter(Boolean)
      if (minAge === undefined && maxAge === undefined && !value.genders.length && !coverageTypes.length) {
        errors.push(`${label}请至少设置年龄、性别或险种中的一项`)
      }
      return { source: value.source, conditions: { minAge, maxAge, genders: value.genders, coverageTypes } }
    }
    if (value.source === 'PROVIDER') {
      if (!value.qualificationType) errors.push(`${label}请选择资格类别`)
      if (!value.providerCode.trim()) errors.push(`${label}请填写接口编码`)
      if (!value.failurePolicy) errors.push(`${label}请选择接口失败处理`)
      return { source: value.source, qualificationType: value.qualificationType || undefined,
        providerCode: value.providerCode.trim() || undefined, failurePolicy: value.failurePolicy || undefined }
    }
    return { source: value.source }
  })
  const draft: ReliefDraftInput = {
    timing: form.timing, sponsor: form.sponsor,
    payerCode: form.payerCode.trim() || undefined, payerName: form.payerName.trim() || undefined,
    scope: { organizationIds: form.organizationIds, scenes: form.scenes },
    effectiveFrom: form.effectiveFrom, effectiveTo: form.effectiveTo || undefined,
    priority: integer(form.priority, '优先级', errors, 0) ?? 100,
    mutexGroup: form.mutexGroup.trim() || undefined, stackable: form.stackable,
    qualificationMode: form.qualificationMode, insuredApplicable: form.insuredApplicable,
    baseIncludesPersonalAccount: form.baseIncludesPersonalAccount,
    onceMaxAmount: decimal(form.onceMaxAmount, '单次限额', errors, { positive: true }),
    manualApprovalAmount: form.rules.some((rule) => rule.method === 'MANUAL')
      ? decimal(form.manualApprovalAmount, '核定审批阈值', errors, { positive: true }) : undefined,
    quotaPeriod: form.quotaPeriod,
    periodMaxAmount: form.quotaPeriod === 'NONE' ? undefined : decimal(form.periodMaxAmount, '周期限额', errors, { positive: true }),
    periodMaxCount: form.quotaPeriod === 'NONE' ? undefined : integer(form.periodMaxCount, '周期次数', errors),
    shareAcrossScenes: form.shareAcrossScenes, shareAcrossOrganizations: form.shareAcrossOrganizations,
    versionNote: form.versionNote.trim() || undefined,
    rules, qualifications,
  }
  return { draft, errors }
}

/** 规则摘要，用于阅读态与版本对比。 */
export function ruleSummary(rule: Pick<RuleForm, 'excluded' | 'method' | 'percent' | 'amount' | 'manualMaxAmount'>,
  methodName: (code: string) => string) {
  if (rule.excluded) return '不减免'
  switch (rule.method) {
    case 'RATIO': return rule.percent ? `减免 ${rule.percent}%` : methodName('RATIO')
    case 'FIXED_AMOUNT': return rule.amount ? `每次结算合计减 ${rule.amount} 元` : methodName('FIXED_AMOUNT')
    case 'UNIT_AMOUNT': return rule.amount ? `每单位减 ${rule.amount} 元` : methodName('UNIT_AMOUNT')
    case 'PRICE_CAP': return rule.amount ? `每单位个人最多付 ${rule.amount} 元` : methodName('PRICE_CAP')
    case 'MANUAL': return rule.manualMaxAmount ? `人工核定，上限 ${rule.manualMaxAmount} 元` : methodName('MANUAL')
    case 'FREE': return methodName('FREE')
    default: return ''
  }
}
