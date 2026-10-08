import type { DiseaseManagementProgram } from '../../shared/rhnApi'

export const scopeProgram: DiseaseManagementProgram = {
  id: 'program', revision: 2, scopeType: 'TENANT', scopeId: 'tenant', code: 'REGISTRY', name: '管理项目',
  sdManagementType: 'SPECIAL_REGISTRY', sdManagementTypeText: '专项登记',
  sdTriggerAction: 'PROMPT_CONFIRMATION', sdTriggerActionText: '提示确认', sdStatus: 'ACTIVE', sdStatusText: '有效',
  effectiveFrom: '2026-01-01', ruleCount: 1, exceptionCount: 1,
  rules: [{ id: 'rule', inclusionMode: 'INCLUDE', sdDiagnosisDomain: 'WESTERN_MEDICINE', codeSystemId: null,
    sdConceptType: null, chapterCode: null, codeFrom: null, codeTo: null, note: '规则原备注' }],
  members: [{ conceptId: 'concept', inclusionMode: 'INCLUDE', code: 'I10', display: '高血压', systemName: '疾病目录',
    sdDiagnosisDomain: 'WESTERN_MEDICINE', sdDiagnosisDomainText: '西医诊断', note: '原有例外备注' }],
}

export function savedScope() {
  return { ...scopeProgram, revision: 3, rules: scopeProgram.rules.map(rule => ({ ...rule, id: 'saved-rule' })),
    members: scopeProgram.members.map(member => ({ ...member })) }
}
