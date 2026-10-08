import { z } from 'zod'
import type { RhnApi } from '../../../shared/rhnApi'
import type { DiagnosisInput } from '../../../shared/api/encountersApi'
import { clinicalBusinessDate } from '../../../shared/ui/clinicalResourceFacts'
import { diagnosisManagementFromCatalog } from '../record/diagnosisManagementEvidence'
import { diagnosisIdentityKey } from '../record/diagnosisIdentity'

const text = z.string().trim().min(1)
const domain = z.enum(['WESTERN_MEDICINE', 'TCM_DISEASE', 'TCM_SYNDROME'])
const input = z.object({ code: text, display: text, type: z.enum(['PRIMARY', 'SECONDARY']),
  conceptId: text.nullish(), codeSystem: text.nullish(), diagnosisDomain: domain.nullish() })
const concept = z.object({ id: text, systemCode: text, code: text, display: text,
  sdDiagnosisDomain: domain, sdStatus: z.enum(['ACTIVE', 'INACTIVE']),
  effectiveFrom: z.iso.date(), effectiveTo: z.iso.date().nullish() })
const fail = (message: string): never => { throw new Error(`诊断身份未确认：${message}，本次未带入，请重新核对。`) }

export async function canonicalizeAiDiagnoses(api: RhnApi, values: DiagnosisInput[], source: 'model' | 'plan'): Promise<DiagnosisInput[]> {
  if (!Array.isArray(values)) return fail('诊断列表缺失')
  const at = clinicalBusinessDate()
  const resolved = await Promise.all(values.map(async value => {
    const parsed = input.safeParse(value)
    if (!parsed.success) return fail('诊断内容或身份字段不完整')
    const item = parsed.data
    // The model's candidate contract is explicitly ICD-10; saved plans have no such restriction.
    const system = source === 'model' ? 'WHO.BD.CS.ICD10' : item.codeSystem
    const diagnosisDomain = source === 'model' ? 'WESTERN_MEDICINE' : item.diagnosisDomain
    if (source === 'model' && (item.codeSystem && item.codeSystem !== system
      || item.diagnosisDomain && item.diagnosisDomain !== diagnosisDomain)) return fail('模型候选与声明的 ICD-10 范围冲突')
    if (source === 'plan' && !item.conceptId && !(system && diagnosisDomain)) return fail(`${item.code} 缺少概念标识或编码体系／诊断域`)
    const raw = await api.masterData.diseases(item.code, '', 'ACTIVE')
    const catalog = z.array(concept).safeParse(raw)
    if (!catalog.success) return fail('术语目录返回了不完整的身份或有效期')
    const matches = catalog.data.filter(candidate => candidate.sdStatus === 'ACTIVE'
      && candidate.effectiveFrom <= at && (!candidate.effectiveTo || candidate.effectiveTo >= at)
      && candidate.code.toUpperCase() === item.code.toUpperCase()
      && (!item.conceptId || candidate.id === item.conceptId)
      && (!system || candidate.systemCode === system)
      && (!diagnosisDomain || candidate.sdDiagnosisDomain === diagnosisDomain))
    if (matches.length !== 1) return fail(`${item.code} 未找到唯一有效且身份一致的目录诊断`)
    const match = matches[0], original = raw[catalog.data.indexOf(match)]
    return { ...value, conceptId: match.id, codeSystem: match.systemCode, diagnosisDomain: match.sdDiagnosisDomain,
      code: match.code, display: match.display, ...diagnosisManagementFromCatalog(original.managementPrograms) }
  }))
  if (new Set(resolved.map(diagnosisIdentityKey)).size !== resolved.length) return fail('同一目录诊断重复出现')
  return resolved
}
