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

function createApiModules(client: ApiClient) {
  return {
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
  return assembleRhnApi(new ApiClient(credentials))
}

export function defaultCredentials(): Credentials {
  return {
    username: 'doctor',
    password: 'rhn-dev-2026',
    tenantId: '362387869790209',
  }
}
