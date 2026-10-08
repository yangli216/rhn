import type { DiagnosisInput } from '../../../shared/api/encountersApi'
import type { DiseaseConcept } from '../../../shared/api/masterDataApi'

type ManagementEvidence = Pick<DiagnosisInput, 'managementResolutionStatus' | 'managementPrograms'>

export function hasConfirmedDiagnosisManagement(value: ManagementEvidence): boolean {
  return value.managementResolutionStatus === 'CONFIRMED'
    && Array.isArray(value.managementPrograms)
    && value.managementPrograms.every(program => program != null
      && [program.id, program.code, program.name].every(text => typeof text === 'string' && text.trim().length > 0)
      && ['CHRONIC_CARE', 'DISEASE_REPORT', 'SPECIAL_REGISTRY'].includes(program.managementType)
      && ['PROMPT_CONFIRMATION', 'CREATE_FOLLOW_UP_TASK', 'CREATE_REPORT_DRAFT'].includes(program.triggerAction)
      && (program.reportDeadlineHours == null || (Number.isInteger(program.reportDeadlineHours) && program.reportDeadlineHours > 0)))
}

export function diagnosisManagementFromCatalog(programs: DiseaseConcept['managementPrograms'] | null | undefined): ManagementEvidence {
  if (!Array.isArray(programs)) return { managementResolutionStatus: 'UNCONFIRMED', managementPrograms: null }
  const evidence: ManagementEvidence = {
    managementResolutionStatus: 'CONFIRMED',
    managementPrograms: programs.map(program => program == null ? program : ({
      id: program.id, code: program.code, name: program.name,
      managementType: program.sdManagementType, triggerAction: program.sdTriggerAction,
      reportCardType: program.reportCardType, reportDeadlineHours: program.reportDeadlineHours,
    })),
  }
  return hasConfirmedDiagnosisManagement(evidence) ? evidence
    : { managementResolutionStatus: 'UNCONFIRMED', managementPrograms: null }
}
