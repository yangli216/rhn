import type { DiagnosisInput } from '../../../shared/api/encountersApi'

export function diagnosisIdentityKey(value: DiagnosisInput): string {
  return value.conceptId ? JSON.stringify(['concept', value.conceptId])
    : JSON.stringify(['code', value.codeSystem ?? null, value.diagnosisDomain ?? null, value.code.trim().toUpperCase()])
}
