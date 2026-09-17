import { createMedicationWorkbenchApi } from './medicationWorkbenchApi'
import { createAnalyticsApi } from './analyticsApi'
import { createEncountersApi } from './encountersApi'
import { createDictionaryApi } from './dictionaryApi'
import { createConfigurationApi } from './configurationApi'
import { createClinicalDocumentsApi } from './clinicalDocumentsApi'
import { ApiClient, type Credentials } from './httpClient'
import { createOrganizationApi } from './organizationApi'
import { createResidentsApi } from './residentsApi'
import { createSessionApi } from './sessionApi'
import { createTimelineApi } from './timelineApi'
import { createMasterDataApi } from './masterDataApi'
import { createPortalApi } from './portalApi'
import { createPrintingApi } from './printingApi'
import { createDiagnosticsApi } from './diagnosticsApi'
import { createPharmacyApi } from './pharmacyApi'
import { createBillingApi } from './billingApi'
import { createHealthPlanningApi } from './healthPlanningApi'
import { createSchedulingApi } from './schedulingApi'
import { createGridAddressApi } from './gridAddressApi'
import { createIdentityAccessApi } from './identityAccessApi'
import { createRealtimeApi } from './realtimeApi'
import { createAppointmentsApi } from './appointmentsApi'
import { createTreatmentApi } from './treatmentApi'
import { createAnnouncementsApi } from './announcementsApi'
import { createOutpatientFlowApi } from './outpatientFlowApi'
import { createPresenceApi } from './presenceApi'
import { createOutpatientPlanTemplatesApi } from './outpatientPlanTemplatesApi'
import { createOutpatientNoteTemplatesApi } from './outpatientNoteTemplatesApi'
import { createOutpatientNoteFormsApi } from './outpatientNoteFormsApi'
import { createOutpatientReferralsApi } from './outpatientReferralsApi'
import { createClinicalAiApi } from './clinicalAiApi'
import { createInpatientApi } from './inpatientApi'
import { createQueueingApi } from './queueingApi'
import { createClinicalSafetyApi } from './clinicalSafetyApi'
import { createOutpatientTriageApi } from './outpatientTriageApi'

export * from './encountersApi'
export * from './dictionaryApi'
export * from './configurationApi'
export * from './clinicalDocumentsApi'
export * from './httpClient'
export * from './organizationApi'
export * from './residentsApi'
export * from './masterDataApi'
export * from './portalApi'
export * from './printingApi'
export * from './diagnosticsApi'
export * from './pharmacyApi'
export * from './billingApi'
export * from './healthPlanningApi'
export * from './schedulingApi'
export * from './gridAddressApi'
export * from './identityAccessApi'
export * from './realtimeApi'
export * from './appointmentsApi'
export * from './treatmentApi'
export * from './announcementsApi'
export * from './outpatientFlowApi'
export * from './presenceApi'
export * from './outpatientPlanTemplatesApi'
export * from './outpatientNoteTemplatesApi'
export * from './outpatientNoteFormsApi'
export * from './outpatientReferralsApi'
export * from './clinicalAiApi'
export * from './inpatientApi'
export * from './queueingApi'
export * from './clinicalSafetyApi'
export * from './outpatientTriageApi'

function createApiModules(client: ApiClient) {
  return {
    medicationWorkbench: createMedicationWorkbenchApi(client),
    analytics: createAnalyticsApi(client),
    session: createSessionApi(client),
    organization: createOrganizationApi(client),
    residents: createResidentsApi(client),
    encounters: createEncountersApi(client),
    dictionaries: createDictionaryApi(client),
    configuration: createConfigurationApi(client),
    clinicalDocuments: createClinicalDocumentsApi(client),
    masterData: createMasterDataApi(client),
    timeline: createTimelineApi(client),
    portal: createPortalApi(client),
    printing: createPrintingApi(client),
    diagnostics: createDiagnosticsApi(client),
    pharmacy: createPharmacyApi(client),
    billing: createBillingApi(client),
    healthPlanning: createHealthPlanningApi(client),
    scheduling: createSchedulingApi(client),
    gridAddresses: createGridAddressApi(client),
    identityAccess: createIdentityAccessApi(client),
    realtime: createRealtimeApi(client),
    appointments: createAppointmentsApi(client),
    treatments: createTreatmentApi(client),
    announcements: createAnnouncementsApi(client),
    outpatientFlow: createOutpatientFlowApi(client),
    presence: createPresenceApi(client),
    outpatientPlanTemplates: createOutpatientPlanTemplatesApi(client),
    outpatientNoteTemplates: createOutpatientNoteTemplatesApi(client),
    outpatientNoteForms: createOutpatientNoteFormsApi(client),
    outpatientReferrals: createOutpatientReferralsApi(client),
    clinicalAi: createClinicalAiApi(client),
    inpatient: createInpatientApi(client),
    queueing: createQueueingApi(client),
    clinicalSafety: createClinicalSafetyApi(client),
    outpatientTriage: createOutpatientTriageApi(client),
  }
}

type RhnApiModules = ReturnType<typeof createApiModules>

export type RhnApi = RhnApiModules & {
  setWorkContext: (context: import('./httpClient').WorkContextSelection | null) => void
  withWorkContext: (context: import('./httpClient').WorkContextSelection | null) => RhnApi
}

function assembleRhnApi(client: ApiClient): RhnApi {
  return {
    ...createApiModules(client),
    setWorkContext: (context) => client.setWorkContext(context),
    withWorkContext: (context) => assembleRhnApi(client.withWorkContext(context)),
  }
}

export function createRhnApi(credentials: Credentials): RhnApi {
  return assembleRhnApi(new ApiClient(credentials, credentials.tenantId))
}

export function createRhnSessionApi(tenantId: string): RhnApi {
  return assembleRhnApi(new ApiClient(null, tenantId))
}

export function defaultCredentials(): Credentials {
  return {
    username: 'doctor',
    password: 'rhn-dev-2026',
    tenantId: '362387869790209',
  }
}
