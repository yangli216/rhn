import { z } from 'zod'

const text = z.string().min(1)
const optionalText = z.string().nullish()
const fail = (subject: string): never => { throw new Error(`${subject}返回不完整，请重新加载核实`) }

const primaryAssignment = z.object({
  assignmentId: text, organizationId: text, organizationName: optionalText, departmentId: text, departmentName: optionalText,
  positionId: text, positionName: optionalText, sdPositionType: optionalText, sdPositionTypeText: optionalText,
})
const row = z.object({
  practitionerId: text, revision: z.number().int().nonnegative(), code: text, fullName: text,
  sdPractGender: optionalText, sdPractGenderText: optionalText, sdPersonnelStatus: z.enum(['ACTIVE', 'INACTIVE']), sdPersonnelStatusText: optionalText,
  primaryAssignment: primaryAssignment.nullish(), currentAssignmentCount: z.number().int().nonnegative(),
  qualificationRegistered: z.boolean(), sdProfessionalTitle: optionalText, sdProfessionalTitleText: optionalText,
  sdPracticeCategory: optionalText, sdPracticeCategoryText: optionalText, prescribing: z.boolean(), narcoticPrescribing: z.boolean(),
  sdAntimicrobialLevel: optionalText, sdAntimicrobialLevelText: optionalText,
})
const page = z.object({ content: z.array(row), page: z.number().int().nonnegative(), size: z.number().int().positive(),
  totalElements: z.number().int().nonnegative(), totalPages: z.number().int().nonnegative() })
const qualification = z.object({
  practitionerId: text, registered: z.boolean(), revision: z.union([z.string(), z.number()]).nullish(),
  sdProfessionalTitle: optionalText, sdProfessionalTitleText: optionalText, sdPracticeCategory: optionalText, sdPracticeCategoryText: optionalText,
  practiceCertificateCode: optionalText, qualificationCertificateCode: optionalText, insurancePractitionerCode: optionalText,
  prescribing: z.boolean(), narcoticPrescribing: z.boolean(), sdAntimicrobialLevel: optionalText, sdAntimicrobialLevelText: optionalText,
})

export type PersonnelRow = z.infer<typeof row>
export type PersonnelPage = z.infer<typeof page>
export type PractitionerQualification = z.infer<typeof qualification>

export function requirePersonnelPage(source: unknown): PersonnelPage {
  const result = page.safeParse(source)
  return result.success ? result.data : fail('人员列表')
}

export function requireQualification(source: unknown, practitionerId: string): PractitionerQualification {
  const result = qualification.safeParse(source)
  if (!result.success || result.data.practitionerId !== practitionerId) return fail('执业资质')
  return result.data
}

/** 处方权摘要：未登记与“无处方权”区分展示。 */
export function prescribingSummary(value: Pick<PersonnelRow, 'qualificationRegistered' | 'prescribing' | 'narcoticPrescribing' | 'sdAntimicrobialLevelText'>
  | (Pick<PractitionerQualification, 'prescribing' | 'narcoticPrescribing' | 'sdAntimicrobialLevelText'> & { registered: boolean })) {
  const registered = 'qualificationRegistered' in value ? value.qualificationRegistered : value.registered
  if (!registered) return '未登记'
  if (!value.prescribing) return '无处方权'
  return ['普通', value.narcoticPrescribing && '麻精', value.sdAntimicrobialLevelText && `抗菌药：${value.sdAntimicrobialLevelText}`].filter(Boolean).join(' · ')
}
