import type { Department, Organization } from '../model'

/** Clinical feature inputs belong to shared contracts; shared code must not import the app shell. */
export interface ClinicalContext {
  organization: Organization
  department: Department
}
