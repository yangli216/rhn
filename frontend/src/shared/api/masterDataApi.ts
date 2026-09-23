import type { ApiClient } from './httpClient'

export interface MedicationIngredient {
  id: string; code: string; display: string; system: string; systemVersion: string; source: string
}
export interface MedicationComponent {
  ingredientId: string; numeratorValue?: number | null; numeratorUnit?: string | null
  denominatorValue?: number | null; denominatorUnit?: string | null
}
export interface MedicationComposition { revision: string | null; source: string | null; components: MedicationComponent[] }
export interface MedicationSemanticVersion {
  revision: string; semanticVersion: string; changeType: string; source: string; recordedAt: string
}

export type MasterDataStatus = 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED' | 'ACTIVE' | 'SUSPENDED' | 'RETIRED' | 'REPLACED'

export interface ItemType {
  id: string
  revision: number
  scopeType: 'PLATFORM' | 'TENANT'
  tenantId?: string
  parentId?: string
  code: string
  name: string
  description?: string
  subjectType: 'MEDICATION' | 'CATALOG_ITEM'
  sortOrder: number
  status: MasterDataStatus
}

export interface CodeSystemSummary {
  id: string
  revision: number
  code: string
  name: string
  version: string
  sdDiagnosisDomain?: 'WESTERN_MEDICINE' | 'TCM_DISEASE' | 'TCM_SYNDROME'
  sdDiagnosisDomainText?: string
  sdStatus: MasterDataStatus
  sdStatusText: string
  effectiveFrom: string
  effectiveTo?: string
  publisher?: string
}

export interface ConceptAlias {
  id: string
  sdAliasType: string
  sdAliasTypeText: string
  name: string
  searchCode?: string
}

export interface DiseaseConcept {
  id: string
  revision: number
  codeSystemId: string
  systemCode: string
  systemName: string
  systemVersion: string
  sdDiagnosisDomain: 'WESTERN_MEDICINE' | 'TCM_DISEASE' | 'TCM_SYNDROME'
  sdDiagnosisDomainText: string
  code: string
  display: string
  shortDisplay?: string
  sdConceptType: string
  sdConceptTypeText: string
  chapterCode?: string
  chapterName?: string
  definition?: string
  searchCode?: string
  sdStatus: MasterDataStatus
  sdStatusText: string
  effectiveFrom: string
  effectiveTo?: string
  replacementConceptId?: string
  aliases: ConceptAlias[]
  managementPrograms: DiseaseManagementTag[]
}

export interface DiseaseManagementTag {
  id: string
  code: string
  name: string
  sdManagementType: 'CHRONIC_CARE' | 'DISEASE_REPORT' | 'SPECIAL_REGISTRY'
  sdManagementTypeText: string
  sdTriggerAction: 'PROMPT_CONFIRMATION' | 'CREATE_FOLLOW_UP_TASK' | 'CREATE_REPORT_DRAFT'
  sdTriggerActionText: string
  reportCardType?: string
  reportDeadlineHours?: number
}

export interface DiseaseManagementProgram extends DiseaseManagementTag {
  revision: number
  scopeType: 'PRODUCT' | 'TENANT'
  scopeId: string
  description?: string
  sdStatus: MasterDataStatus
  sdStatusText: string
  effectiveFrom: string
  effectiveTo?: string
  ruleCount: number
  exceptionCount: number
  rules: DiseaseManagementRule[]
  members: Array<{
    conceptId: string
    inclusionMode: DiseaseInclusionMode
    code: string
    display: string
    systemName: string
    sdDiagnosisDomain: 'WESTERN_MEDICINE' | 'TCM_DISEASE' | 'TCM_SYNDROME'
    sdDiagnosisDomainText: string
  }>
}

export type DiseaseInclusionMode = 'INCLUDE' | 'EXCLUDE'

export interface DiseaseManagementRule {
  id?: string
  inclusionMode: DiseaseInclusionMode
  sdDiagnosisDomain?: DiseaseConcept['sdDiagnosisDomain']
  sdDiagnosisDomainText?: string
  codeSystemId?: string
  systemCode?: string
  systemName?: string
  sdConceptType?: string
  sdConceptTypeText?: string
  chapterCode?: string
  codeFrom?: string
  codeTo?: string
  note?: string
}

export interface DiseaseManagementExceptionInput {
  conceptId: string
  inclusionMode: DiseaseInclusionMode
  note?: string
}

export interface MasterDataPage<T> {
  content: T[]
  totalElements: number
  totalPages: number
  page: number
  size: number
}

export type DiseaseSearchPage = MasterDataPage<DiseaseConcept>

export interface DiseaseManagementProgramInput {
  productScope: boolean
  code: string
  name: string
  sdManagementType: DiseaseManagementTag['sdManagementType']
  sdTriggerAction: DiseaseManagementTag['sdTriggerAction']
  description?: string
  reportCardType?: string
  reportDeadlineHours?: number
  effectiveFrom: string
  effectiveTo?: string
}

export interface OrganizationAdoption {
  id: string
  revision: number
  organizationId: string
  catalogItemId: string
  defaultDepartmentId?: string
  localCode?: string
  localName?: string
  orderable: boolean
  executable: boolean
  chargeable: boolean
  purchasable: boolean
  stocked: boolean
  dispensable: boolean
  returnable: boolean
  sdStatus: MasterDataStatus
  sdStatusText: string
  validFrom: string
  validTo?: string
  replacesAdoptionId?: string
}

export interface CatalogPrice {
  id: string
  revision: number
  organizationId?: string
  packageId?: string
  sdPriceType: string
  sdPriceTypeText: string
  price: number
  currencyCode: string
  priceDocumentCode?: string
  priceReason?: string
  validFrom: string
  validTo?: string
  sdStatus: MasterDataStatus
  sdStatusText: string
  replacesPriceId?: string
}

export interface CatalogLifecycle {
  catalogItemId: string
  organizationId?: string
  businessDate: string
  currentAdoption?: OrganizationAdoption
  adoptionHistory: OrganizationAdoption[]
  currentPrices: CatalogPrice[]
  priceHistory: CatalogPrice[]
}

export interface CatalogChangeBatchRow {
  id: string
  rowNumber: number
  catalogItemId: string
  packageId?: string
  status: 'SUCCEEDED' | 'FAILED'
  targetResourceType?: string
  targetId?: string
  errorCode?: string
  errorMessage?: string
}

export interface CatalogChangeBatch {
  id: string
  revision: number
  batchType: 'ADOPTION' | 'PRICE'
  operationType: 'ADOPT' | 'RETIRE' | 'PRICE_UPSERT'
  organizationId?: string
  requestCode: string
  businessDate: string
  status: 'PROCESSING' | 'COMPLETED' | 'PARTIAL' | 'FAILED'
  totalRows: number
  succeededRows: number
  failedRows: number
  createdAt: string
  createdBy: string
  updatedAt: string
  rows: CatalogChangeBatchRow[]
}

export interface CatalogAdoptionCandidate {
  id: string
  code: string
  name: string
  itemType: 'SERVICE' | 'MED_PRODUCT'
  centerStatus: MasterDataStatus
  adoption?: OrganizationAdoption
  adoptionSourceType: 'LOCAL' | 'SHARED' | 'NONE'
  packages: Array<{ id: string; unitCode: string; unitName: string; packageSpec?: string }>
}

export interface ServiceCatalogItem {
  id: string
  revision: number
  itemTypeId: string
  itemMasterId?: string
  code: string
  name: string
  unitCode?: string
  orderable: boolean
  chargeable: boolean
  sdStatus: MasterDataStatus
  sdStatusText: string
  validFrom: string
  validTo?: string
  sdServiceType: string
  sdServiceTypeText: string
  serviceSubtype?: string
  sdUsageType: string
  sdUsageTypeText: string
  medicalTechnology: boolean
  combinationItem: boolean
  singleOrder: boolean
  specimenType?: string
  examinationType?: string
  accountingCategory?: string
  sdDuplicateRule?: string
  sdDuplicateRuleText?: string
  multiSitePrice?: number
  freeSiteCount?: number
  maxBodySiteCount?: number
  mutualRecognitionCode?: string
  pregnancyAlert: boolean
  attention?: string
  examinationNotes?: string
  laboratory?: LaboratoryServiceDetail
  examination?: ExaminationServiceDetail
  organizationAdoption?: OrganizationAdoption
  prices: CatalogPrice[]
}

export interface LaboratoryServiceDetail {
  sdLaboratoryMethod?: string
  sdLaboratoryMethodText?: string
  reportDuration?: number
  reportDurationUnit?: string
  fastingRequired: boolean
  pointOfCare: boolean
  collectionDescription?: string
  specimens: LaboratorySpecimen[]
}

export interface LaboratorySpecimen {
  id: string
  specimenItemId: string
  containerItemId?: string
  minimumQuantity?: number
  minimumQuantityUnit?: string
  defaultSpecimen: boolean
  requiredSpecimen: boolean
  sortOrder: number
  collectionDescription?: string
  status: string
}

export interface ExaminationServiceDetail {
  sdExaminationType?: string
  sdExaminationTypeText?: string
  bodySiteRequired: boolean
  multiBodySite: boolean
  maxBodySiteCount?: number
  preparationDescription?: string
  variants: ServiceVariant[]
}

export interface ServiceVariant {
  id: string
  bodySiteConceptId?: string
  code: string
  name: string
  sdMethodType?: string
  sdMethodTypeText?: string
  bodySiteRequired: boolean
  mutualRecognitionCode?: string
  sortOrder: number
  status: string
}

export interface ItemPackage {
  id: string
  basePackageId?: string
  unitCode: string
  unitName: string
  packageSpec?: string
  quantityFactor: number
  sdUsageType: string
  sdUsageTypeText: string
  barcode?: string
  defaultPurchase: boolean
  defaultSale: boolean
  defaultDispense: boolean
  sdStatus: MasterDataStatus
  sdStatusText: string
  validFrom: string
  validTo?: string
}

export interface MedicationProduct {
  id: string
  revision: number
  itemTypeId: string
  itemMasterId?: string
  medicationId: string
  manufacturerId: string
  manufacturerName: string
  code: string
  name: string
  unitCode?: string
  tradeName?: string
  approvalCode?: string
  traceCode?: string
  approvalFrom?: string
  approvalTo?: string
  registrationCode?: string
  registrationFrom?: string
  registrationTo?: string
  purchaseCode?: string
  sdMarketStatus?: string
  sdMarketStatusText?: string
  sdProductionPlace?: string
  sdProductionPlaceText?: string
  otc: boolean
  centralPurchase: boolean
  importAllowed: boolean
  traceSplitRequired: boolean
  orderable: boolean
  chargeable: boolean
  stocked: boolean
  shelfLifeValue?: number
  sdShelfLifeUnit?: string
  sdShelfLifeUnitText?: string
  sdStatus: MasterDataStatus
  sdStatusText: string
  validFrom: string
  validTo?: string
  indication?: string
  instruction?: string
  packages: ItemPackage[]
  organizationAdoption?: OrganizationAdoption
  prices: CatalogPrice[]
}

export interface MedicationStandardReference {
  status: 'LINKED' | 'UNMAPPED' | 'AMBIGUOUS' | 'STALE' | 'MISMATCH'
  catalogId?: string; catalogVersion?: string; contentHash?: string
  entryId?: string; specificationId?: string; semanticVersion?: number
  name?: string; doseForm?: string; preparationSpec?: string; presentationUnit?: string
  sourceVerificationStatus?: string; sourceVerificationId?: string; issues: string[]
}
export interface ClinicalMedicationStandards {
  version: string
  doseUnits: { id: string; code: string; display: string; dimension: string; canonicalUnit: string; conversionFactor: number; semanticVersion: number }[]
  routes: MedicationRoute[]
  frequencies: { id: string; code: string; name: string; standard: {
    system: string; version: string; conceptId: string | null; status: string
    interpretation: {kind: string; dailyRateComputable: boolean; doses: number | null; perDays: number | null; unknownReason: string | null}
  }; scheduleCapability?: FrequencyScheduleCapability }[]
}

export interface MedicationStandardReadiness {
  inspectedAt: string
  scope: 'TENANT_ACTIVE_MEDICATIONS'
  summary: { totalActive: number; referenceStatuses: Record<MedicationStandardReference['status'], number>; sourceUnverified: number; conversionUnavailable: number; matchingStatuses?: Record<string, number>; clinicalConversionUnavailable?: number; concentrationAvailable?: number }
  content: { medicationId: string; code: string; name: string; preparationSpec?: string; standardReference: MedicationStandardReference;
    presentationConversionStatus: 'COMPUTABLE' | 'UNAVAILABLE' | 'NOT_ASSESSED'; conversionReasons: string[];
    clinicalConversion?: { status: 'COMPUTABLE' | 'UNAVAILABLE' | 'NOT_ASSESSED'; inputUnit?: string; outputUnit?: string; basis?: string; unavailableReasons: string[] };
    matching?: {status: string; candidateCount: number; consistentCount: number} | null }[]
  totalElements: number; totalPages: number; page: number; size: number
}

export interface MedicationStandardBindingPreview {
  medication: {id: string; revision: number; code: string; name: string; medicationType: string; doseForm?: string;
    preparationSpec?: string; presentationUnit?: string; strengthValue?: number; strengthUnit?: string; status: string}
  identity: StandardCatalogIdentity
  reference: MedicationStandardReference
  candidates: {specification: StandardMedicationSpecification & {name: string; entryId: string; medicationType: string; doseForm: string}; issues: string[]; boundMedicationId?: string; canBind: boolean}[]
  bindings: {catalogId: string; catalogVersion: string; entryId: string; specificationId: string; contentHash: string}[]
  audits: {id: string; recordedAt: string; snapshot: {actor: string; reason: string; after: MedicationStandardReference}}[]
}

export interface MedicationKnowledge {
  standardReference?: MedicationStandardReference
  id: string
  revision: number
  itemTypeId: string
  itemMasterId?: string
  code: string
  name: string
  aliasName?: string
  sdMedicationType: string
  sdMedicationTypeText: string
  sdDoseForm?: string
  sdDoseFormText?: string
  preparationSpec?: string
  preparationUnit?: string
  strengthValue?: number
  strengthUnit?: string
  sdStorageType?: string
  sdStorageTypeText?: string
  prescriptionDrug: boolean
  essentialDrug: boolean
  antimicrobial: boolean
  sdAntimicrobialLevel?: string
  sdAntimicrobialLevelText?: string
  antimicrobialOutpatientAllowed: boolean
  antimicrobialConsultationRequired: boolean
  antimicrobialEmergencyAllowed: boolean
  antimicrobialMaxDays?: number
  skinTestRequired: boolean
  skinTestMethod?: 'INTRADERMAL' | 'PRICK' | 'OTHER'
  skinTestSolutionMode?: 'ORIGINAL_SOLUTION' | 'DILUTED_SOLUTION'
  skinTestObservationMinutes?: number
  skinTestResultValidityHours?: number
  skinTestInstructions?: string
  defaultDose?: number
  defaultDoseUnit?: string
  defaultRoute?: string
  defaultFrequencyId?: string
  defaultFrequency?: string
  chronicDiseaseDrug: boolean
  singleOrder: boolean
  sdStatus: MasterDataStatus
  sdStatusText: string
  classifications: MedicationClassification[]
  allergenConceptIds: string[]
  products: MedicationProduct[]
}

export interface MedicationClassification {
  conceptId: string
  systemCode: 'NEML' | 'ATC' | string
  systemName: string
  systemVersion: string
  classificationType: 'CATALOG' | 'THERAPEUTIC'
  code: string
  display: string
  path?: string
  mappingRole: 'MEMBERSHIP' | 'THERAPEUTIC_USE'
  primary: boolean
}

export interface MedicationRoute {
  id: string
  code: string
  name: string
  systemCode: string
  systemVersion: string
  executionType: 'NONE' | 'ADMINISTRATION' | 'INFUSION'
}

export interface Manufacturer {
  id: string
  revision: number
  code: string
  name: string
  shortName?: string
  sdManufacturerType: string
  sdManufacturerTypeText: string
  sdProductionPlace?: string
  sdProductionPlaceText?: string
  countryCode?: string
  address?: string
  sdStatus: MasterDataStatus
  sdStatusText: string
}

export interface DiseaseInput {
  codeSystemId: string
  code: string
  display: string
  shortDisplay?: string
  sdConceptType: string
  chapterCode?: string
  chapterName?: string
  definition?: string
  searchCode?: string
  effectiveFrom: string
  effectiveTo?: string
  sdStatus: MasterDataStatus
  aliases: string[]
}

export interface ServiceInput {
  code: string
  name: string
  unitCode?: string
  orderable: boolean
  chargeable: boolean
  sdStatus: MasterDataStatus
  validFrom: string
  validTo?: string
  sdServiceType: string
  serviceSubtype?: string
  sdUsageType: string
  medicalTechnology: boolean
  combinationItem: boolean
  singleOrder: boolean
  specimenType?: string
  examinationType?: string
  accountingCategory?: string
  sdDuplicateRule?: string
  multiSitePrice?: number
  freeSiteCount?: number
  maxBodySiteCount?: number
  mutualRecognitionCode?: string
  pregnancyAlert: boolean
  attention?: string
  examinationNotes?: string
}

export interface MedicationInput {
  standardSpecificationId?: string
  code: string
  name: string
  aliasName?: string
  sdMedicationType: string
  sdDoseForm?: string
  preparationSpec?: string
  preparationUnit?: string
  strengthValue?: number
  strengthUnit?: string
  sdStorageType?: string
  prescriptionDrug: boolean
  essentialDrug: boolean
  antimicrobial: boolean
  sdAntimicrobialLevel?: string
  antimicrobialOutpatientAllowed?: boolean
  antimicrobialConsultationRequired?: boolean
  antimicrobialEmergencyAllowed?: boolean
  antimicrobialMaxDays?: number
  skinTestRequired: boolean
  skinTestMethod?: 'INTRADERMAL' | 'PRICK' | 'OTHER'
  skinTestSolutionMode?: 'ORIGINAL_SOLUTION' | 'DILUTED_SOLUTION'
  skinTestObservationMinutes?: number
  skinTestResultValidityHours?: number
  skinTestInstructions?: string
  defaultDose?: number
  defaultDoseUnit?: string
  defaultRoute?: string
  defaultFrequency?: string
  chronicDiseaseDrug: boolean
  singleOrder: boolean
  sdStatus: MasterDataStatus
}

export interface ProductInput {
  medicationId: string
  manufacturerId: string
  code: string
  tradeName?: string
  approvalCode?: string
  traceCode?: string
  approvalFrom?: string
  approvalTo?: string
  registrationCode?: string
  registrationFrom?: string
  registrationTo?: string
  purchaseCode?: string
  sdMarketStatus?: string
  sdProductionPlace?: string
  otc: boolean
  centralPurchase: boolean
  importAllowed: boolean
  traceSplitRequired: boolean
  orderable: boolean
  chargeable: boolean
  stocked: boolean
  shelfLifeValue?: number
  sdShelfLifeUnit?: string
  sdStatus: MasterDataStatus
  validFrom: string
  validTo?: string
  indication?: string
  instruction?: string
}

export interface MedicationProductSetupInput {
  product: ProductInput
  packaging: PackageInput
  organization: AdoptionInput
  purchasePrice: number
  salePrice: number
  priceDocumentCode?: string
}

export interface ManufacturerInput {
  code: string
  name: string
  shortName?: string
  sdManufacturerType: string
  sdProductionPlace?: string
  countryCode?: string
  address?: string
  sdStatus: MasterDataStatus
}

export interface PackageInput {
  basePackageId?: string
  unitCode: string
  unitName: string
  packageSpec?: string
  quantityFactor: number
  sdUsageType: string
  barcode?: string
  defaultPurchase: boolean
  defaultSale: boolean
  defaultDispense: boolean
  sdStatus: MasterDataStatus
  validFrom: string
  validTo?: string
}

export interface AdoptionInput {
  organizationId: string
  defaultDepartmentId?: string
  localCode?: string
  localName?: string
  orderable: boolean
  executable: boolean
  chargeable: boolean
  purchasable: boolean
  stocked: boolean
  dispensable: boolean
  returnable: boolean
  sdStatus: MasterDataStatus
  validFrom: string
  validTo?: string
}

export interface PriceInput {
  organizationId?: string
  packageId?: string
  sdPriceType: string
  price: number
  currencyCode: string
  priceDocumentCode?: string
  priceReason?: string
  validFrom: string
  validTo?: string
  sdStatus: MasterDataStatus
}

export interface LifecycleAdoptionInput extends Omit<AdoptionInput, 'sdStatus'> {
  status: Extract<MasterDataStatus, 'ACTIVE' | 'SUSPENDED' | 'RETIRED'>
}

export interface LifecyclePriceInput extends Omit<PriceInput, 'sdPriceType' | 'sdStatus'> {
  priceType: string
  status: Extract<MasterDataStatus, 'ACTIVE' | 'SUSPENDED' | 'RETIRED'>
}

export type OperationalStatus = 'ACTIVE' | 'INACTIVE'
export interface DictionaryItemOption { id: string; code: string; name: string; sortOrder: number }
export interface SpecimenConfiguration {
  id: string; revision: number; specimenItemId: string; specimenCode: string; specimenName: string
  containerItemId?: string; containerCode?: string; containerName?: string; minimumQuantity?: number
  minimumQuantityUnit?: string; defaultSpecimen: boolean; requiredSpecimen: boolean; sortOrder: number
  collectionDescription?: string; status: OperationalStatus; tubeGroupCode?: string
  tubeSharingMode: 'SEPARATE' | 'SHARE' | 'BY_TEST_COUNT'; baseTubeCount: number
  maxTestsPerTube?: number; tubeChargeMode: 'NONE' | 'PER_TUBE' | 'EXCESS_TUBE'
  tubeChargeItemId?: string; tubeChargeItemCode?: string; tubeChargeItemName?: string
  includedTubeCount: number; tubeChargeQuantity: number
}
export interface LaboratoryProfile {
  serviceId: string; revision: number; laboratoryMethod?: string; reportDuration?: number
  reportDurationUnit?: string; fastingRequired: boolean; pointOfCare: boolean
  collectionDescription?: string; specimens: SpecimenConfiguration[]
}
export interface ExaminationVariantConfiguration {
  id: string; revision: number; bodySiteConceptId?: string; code: string; name: string
  methodType?: string; bodySiteRequired: boolean; mutualRecognitionCode?: string
  sortOrder: number; status: OperationalStatus
}
export interface ExaminationProfile {
  serviceId: string; revision: number; examinationType?: string; bodySiteRequired: boolean
  multiBodySite: boolean; maxBodySiteCount?: number; preparationDescription?: string
  sitePricingMode: 'SINGLE' | 'PER_SITE' | 'BASE_PLUS_FIXED' | 'BASE_PLUS_ITEM'
  includedSiteCount: number; additionalSitePrice?: number; additionalSiteItemId?: string
  additionalSiteItemCode?: string; additionalSiteItemName?: string; additionalSiteQuantity: number
  maxChargeableSiteCount?: number; variants: ExaminationVariantConfiguration[]
  attachments: ExaminationAttachmentConfiguration[]
}
export type ExaminationProfileInput = Omit<ExaminationProfile,
  'serviceId' | 'revision' | 'variants' | 'attachments' | 'additionalSiteItemCode' | 'additionalSiteItemName'>
export interface ExaminationAttachmentConfiguration {
  id: string; revision: number; attachmentCatalogItemId: string; attachmentItemCode: string
  attachmentItemName: string; triggerType: 'ALWAYS' | 'OPTIONAL' | 'MULTI_SITE'
  quantityBasis: 'FIXED' | 'PER_SITE' | 'PER_EXTRA_SITE'; quantity: number
  requiredAttachment: boolean; separatelyChargeable: boolean; sortOrder: number
  description?: string; status: OperationalStatus
}
export interface ClinicalConfiguration {
  serviceId: string; serviceCode: string; serviceName: string; serviceType: string
  laboratory?: LaboratoryProfile; examination?: ExaminationProfile
  specimenOptions: DictionaryItemOption[]; containerOptions: DictionaryItemOption[]
}
export interface SpecimenConfigurationInput {
  specimenItemId: string; containerItemId?: string; minimumQuantity?: number
  minimumQuantityUnit?: string; defaultSpecimen: boolean; requiredSpecimen: boolean
  sortOrder: number; collectionDescription?: string; status: OperationalStatus; tubeGroupCode?: string
  tubeSharingMode: 'SEPARATE' | 'SHARE' | 'BY_TEST_COUNT'; baseTubeCount: number
  maxTestsPerTube?: number; tubeChargeMode: 'NONE' | 'PER_TUBE' | 'EXCESS_TUBE'
  tubeChargeItemId?: string; includedTubeCount: number; tubeChargeQuantity: number
}
export type ExaminationAttachmentInput = Omit<ExaminationAttachmentConfiguration,
  'id' | 'revision' | 'attachmentItemCode' | 'attachmentItemName'>
export interface DiagnosticChargeLine {
  catalogItemId: string; itemCode: string; itemName: string; quantity: number; unitCode?: string
  sourceType: string; separatelyChargeable: boolean; fixedAmount?: number; description?: string
}
export interface ExaminationChargePlan {
  serviceId: string; siteCount: number; sitePricingMode: ExaminationProfile['sitePricingMode']
  includedSiteCount: number; extraSiteCount: number; lines: DiagnosticChargeLine[]
}
export interface LaboratoryTubePlan {
  groups: Array<{ groupCode: string; specimenItemId: string; specimenCode: string; specimenName: string
    containerItemId?: string; containerCode?: string; containerName?: string
    sharingMode: SpecimenConfiguration['tubeSharingMode']; tubeCount: number; serviceIds: string[]
    chargeLines: DiagnosticChargeLine[] }>
  chargeLines: DiagnosticChargeLine[]
}
export interface ExaminationVariantInput {
  bodySiteConceptId?: string; code: string; name: string; methodType?: string
  bodySiteRequired: boolean; mutualRecognitionCode?: string; sortOrder: number; status: OperationalStatus
}
export interface SupplyItem {
  id: string; revision: number; itemTypeId: string; supplyType: 'CONSUMABLE' | 'DEVICE'
  code: string; name: string; unitCode: string; orderable: boolean; chargeable: boolean; stocked: boolean
  status: OperationalStatus; validFrom: string; validTo?: string; udiDi?: string; genericCode?: string
  genericName?: string; modelName?: string; specification?: string; materialType?: string
  deviceClass?: 'I' | 'II' | 'III'; highValue: boolean; implant: boolean; intervention: boolean
  sterile: boolean; singleUse: boolean; registrationCode?: string; registrationName?: string
  registrantName?: string; registrationFrom?: string; registrationTo?: string; manufacturerId?: string
  manufacturerName?: string; structureDescription?: string; scopeDescription?: string; instruction?: string
}
export type SupplyInput = Omit<SupplyItem, 'id' | 'revision' | 'itemTypeId' | 'manufacturerName'>
export interface ItemGroupMember {
  id: string; catalogItemId: string; itemCode: string; itemName: string; serviceType: string
  sortOrder: number; quantity: number; unitCode?: string; requiredMember: boolean; memberDescription?: string
}
export interface ItemGroup {
  id: string; revision: number; organizationId?: string; executionDepartmentId?: string
  code: string; name: string; groupType: 'LIS' | 'PACS' | 'ORDER_SET' | 'PACKAGE'
  usageType?: string; pointOfCare: boolean; status: OperationalStatus; validFrom: string
  validTo?: string; members: ItemGroupMember[]
}
export interface ItemGroupInput extends Omit<ItemGroup, 'id' | 'revision' | 'members'> {
  members: Array<Omit<ItemGroupMember, 'id' | 'itemCode' | 'itemName' | 'serviceType'>>
}
export interface UnitDefinition {
  id: string; revision: number; code: string; name: string; symbol?: string
  dimension: 'COUNT' | 'MASS' | 'VOLUME' | 'TIME' | 'LENGTH' | 'AREA' | 'ACTIVITY' | 'TEMPERATURE' | 'OTHER'
  decimalScale: number; status: OperationalStatus
}
export interface UnitConversion {
  id: string; revision: number; catalogItemId?: string; scopeCode: string
  fromUnitId: string; fromUnitCode: string; toUnitId: string; toUnitCode: string
  factor: number; offset: number; validFrom: string; validTo?: string; status: OperationalStatus
}
export interface UnitConversionInput {
  catalogItemId?: string; fromUnitCode: string; toUnitCode: string; factor: number
  offset?: number; validFrom: string; validTo?: string; status: OperationalStatus
}
export interface UnitConversionResult {
  input: number; fromUnitCode: string; result: number; toUnitCode: string
  catalogItemId?: string; effectiveDate: string; path: string[]
}

export type OrderFrequencyRuleType = 'ONCE' | 'TIMES_PER_PERIOD' | 'FIXED_INTERVAL' | 'CALENDAR' | 'PRN' | 'CONTINUOUS'
export type OrderFrequencyAnchorType = 'ORDER_START' | 'STANDARD_TIME' | 'CALENDAR' | 'EVENT'
export interface OrderFrequencyConfiguration {
  id: string; revision: number; organizationId: string; departmentId?: string; frequencyId: string
  localCode?: string; localName?: string; executionTimes: string[]
  firstDayPolicy: 'REMAINING_SLOTS' | 'FULL_SCHEDULE' | 'FROM_ORDER_TIME'
  enabled: boolean; status: OperationalStatus; validFrom: string; validTo?: string
}
export interface FrequencyScheduleCapability { version: string; status: string; reason: string | null; explanation: string }
export interface OrderFrequency {
  id: string; revision: number; code: string; name: string; shortName?: string; description?: string
  ruleType: OrderFrequencyRuleType; frequencyCount?: number; periodValue?: number; periodUnit?: string
  anchorType: OrderFrequencyAnchorType; defaultExecutionTimes: string[]
  outpatientApplicable: boolean; inpatientApplicable: boolean; emergencyApplicable: boolean
  medicationApplicable: boolean; treatmentApplicable: boolean; nursingApplicable: boolean
  automaticTaskGeneration: boolean; sortOrder: number; status: OperationalStatus
  validFrom: string; validTo?: string; configurations: OrderFrequencyConfiguration[]
  standard?: ClinicalMedicationStandards['frequencies'][number]['standard']; scheduleCapability?: FrequencyScheduleCapability
}
export interface ActiveOrderFrequency {
  id: string; revision: number; code: string; name: string; shortName?: string; description?: string
  ruleType: OrderFrequencyRuleType; frequencyCount?: number; periodValue?: number; periodUnit?: string
  anchorType: OrderFrequencyAnchorType; executionTimes: string[]
  firstDayPolicy: OrderFrequencyConfiguration['firstDayPolicy']; automaticTaskGeneration: boolean
}
export interface OrderFrequencyInput extends Omit<OrderFrequency, 'id' | 'revision' | 'defaultExecutionTimes' | 'configurations' | 'standard' | 'scheduleCapability'> {
  defaultExecutionTimes?: string
}
export interface OrderFrequencyConfigurationInput extends Omit<OrderFrequencyConfiguration,
  'id' | 'revision' | 'frequencyId' | 'executionTimes'> {
  executionTimes?: string
}
export interface OrderFrequencySchedulePreview {
  frequencyCode: string; frequencyName: string; ruleType: OrderFrequencyRuleType
  explanation: string; plannedTimes: string[]; capability?: FrequencyScheduleCapability
  standard?: ClinicalMedicationStandards['frequencies'][number]['standard']; source?: string
}

export interface AdoptionBatchInput {
  requestCode: string
  operationType: 'ADOPT' | 'RETIRE'
  organizationId: string
  businessDate: string
  catalogItemIds: string[]
  template?: Omit<LifecycleAdoptionInput, 'organizationId' | 'validFrom'>
}

export interface PriceBatchInput {
  requestCode: string
  organizationId?: string
  businessDate: string
  entries: Array<Omit<LifecyclePriceInput, 'organizationId' | 'validFrom'> & { catalogItemId: string;
    replacesPriceId?: string; expectedReplacesRevision?: number }>
}

export type ItemAttributeSubjectType = 'MEDICATION' | 'CATALOG_ITEM' | 'SERVICE_VARIANT'
export type ItemAttributeJson = string | number | boolean | null | ItemAttributeJson[] | { [key: string]: ItemAttributeJson }

export interface ItemAttributeSchema {
  assignmentId: string
  definitionId: string
  definitionRevision: number
  code: string
  name: string
  description?: string
  dataType: string
  cardinality: 'SINGLE' | 'MULTIPLE'
  dictionaryId?: string
  unitCode?: string
  schema: Record<string, ItemAttributeJson>
  defaultValue?: ItemAttributeJson
  variability: 'BASE_ONLY' | 'SCOPE_OVERRIDE' | 'LOCAL_ONLY'
  overridePolicy: 'ANY' | 'RESTRICTIVE_ONLY' | 'NO_OVERRIDE'
  allowedScopes: string[]
  contextBasis: string
  storageMode: 'EXTENSION' | 'PROJECTED'
  projectionField?: string
  sensitivity: string
  required: boolean
  widgetType: string
  groupName?: string
  groupSortOrder: number
  attributeSortOrder: number
  searchable: boolean
  listDisplay: boolean
}

export interface ItemAttributeSchemaResponse {
  subjectId: string
  subjectType: ItemAttributeSubjectType
  targetId: string
  itemTypeId: string
  attributes: ItemAttributeSchema[]
}

export interface ItemAttributeValue {
  id: string
  revision: number
  definitionId: string
  attributeCode: string
  value: ItemAttributeJson
  validFrom: string
  validTo?: string
  status: string
}

export interface ItemAttributeOverride {
  id: string
  revision: number
  definitionId: string
  attributeCode: string
  scopeType: 'TENANT' | 'ORGANIZATION' | 'DEPARTMENT'
  scopeKey: string
  organizationId?: string
  departmentId?: string
  valueMode: 'OVERRIDE' | 'EXPLICIT_NULL'
  value?: ItemAttributeJson
  validFrom: string
  validTo?: string
  status: string
}

export interface ItemAttributeMaintenance {
  schema: ItemAttributeSchemaResponse
  baseValues: ItemAttributeValue[]
  overrides: ItemAttributeOverride[]
}

export type ItemAttributeDataType = 'BOOLEAN' | 'INTEGER' | 'DECIMAL' | 'TEXT' | 'ENUM' | 'DATE' |
  'DATETIME' | 'DURATION' | 'DICT_REF' | 'TERM_REF' | 'OBJECT'

export interface ItemAttributeTypeOption {
  id: string
  code: string
  name: string
  subjectType: 'MEDICATION' | 'CATALOG_ITEM'
  parentId?: string
  scopeType: 'PLATFORM' | 'TENANT'
  sortOrder: number
}

export interface ItemAttributeDefinitionConfiguration {
  id: string
  revision: number
  scopeType: 'PLATFORM' | 'TENANT'
  tenantId?: string
  code: string
  name: string
  description: string
  dataType: ItemAttributeDataType
  cardinality: 'SINGLE' | 'MULTIPLE'
  dictionaryId?: string
  unitCode?: string
  schema: Record<string, ItemAttributeJson>
  defaultValue?: ItemAttributeJson
  variability: 'BASE_ONLY' | 'SCOPE_OVERRIDE' | 'LOCAL_ONLY'
  overridePolicy: 'ANY' | 'RESTRICTIVE_ONLY' | 'NO_OVERRIDE'
  allowedScopes: Array<'TENANT' | 'ORGANIZATION' | 'DEPARTMENT'>
  contextBasis: 'NONE' | 'ORDERING' | 'EXECUTING' | 'DISPENSING' | 'STOCKING'
  storageMode: 'EXTENSION' | 'PROJECTED'
  projectionField?: string
  sensitivity: string
  status: 'ACTIVE' | 'INACTIVE'
  editable: boolean
}

export interface ItemTypeAttributeConfiguration {
  id: string
  revision: number
  itemTypeId: string
  definitionId: string
  required: boolean
  defaultValue?: ItemAttributeJson
  widgetType: string
  groupName?: string
  groupSortOrder: number
  attributeSortOrder: number
  visibleCondition?: Record<string, ItemAttributeJson>
  requiredCondition?: Record<string, ItemAttributeJson>
  searchable: boolean
  listDisplay: boolean
  status: 'ACTIVE' | 'INACTIVE'
  editable: boolean
}

export interface ItemAttributeConfiguration {
  tenantNamespace: string
  itemTypes: ItemAttributeTypeOption[]
  definitions: ItemAttributeDefinitionConfiguration[]
  assignments: ItemTypeAttributeConfiguration[]
}

export interface ItemAttributeDefinitionInput {
  code: string
  name: string
  description: string
  dataType: ItemAttributeDataType
  cardinality: 'SINGLE' | 'MULTIPLE'
  dictionaryId?: string
  unitCode?: string
  schema: Record<string, ItemAttributeJson>
  defaultValue?: ItemAttributeJson
  variability: 'BASE_ONLY' | 'SCOPE_OVERRIDE' | 'LOCAL_ONLY'
  overridePolicy: 'ANY' | 'NO_OVERRIDE'
  allowedScopes: Array<'TENANT' | 'ORGANIZATION' | 'DEPARTMENT'>
  contextBasis: 'NONE' | 'ORDERING' | 'EXECUTING' | 'DISPENSING' | 'STOCKING'
  sensitivity: string
  reason: string
  requestCode: string
}

export interface ItemTypeAttributeInput {
  itemTypeId: string
  definitionId: string
  required: boolean
  defaultValue?: ItemAttributeJson
  widgetType: string
  groupName?: string
  groupSortOrder: number
  attributeSortOrder: number
  visibleCondition?: Record<string, ItemAttributeJson>
  requiredCondition?: Record<string, ItemAttributeJson>
  searchable: boolean
  listDisplay: boolean
  reason: string
  requestCode: string
}

export interface SaveItemAttributeValueInput {
  subjectType: ItemAttributeSubjectType
  targetId: string
  definitionId: string
  valueId?: string
  expectedRevision?: number
  value: ItemAttributeJson
  validFrom: string
  validTo?: string
  reason: string
  requestCode: string
}

export interface SaveItemAttributeOverrideInput {
  subjectType: ItemAttributeSubjectType
  targetId: string
  definitionId: string
  overrideId?: string
  expectedRevision?: number
  scopeType: 'TENANT' | 'ORGANIZATION' | 'DEPARTMENT'
  organizationId?: string
  departmentId?: string
  valueMode: 'OVERRIDE' | 'EXPLICIT_NULL'
  value?: ItemAttributeJson
  validFrom: string
  validTo?: string
  reason: string
  requestCode: string
}

export type MasterDataImportType = 'SERVICE' | 'MEDICATION'
export type MasterDataImportStatus = 'PREFLIGHTING' | 'READY' | 'INVALID' | 'IMPORTING' | 'PARTIAL' | 'COMPLETED' | 'CANCELLED'
export type MasterDataImportRowStatus = 'READY' | 'INVALID' | 'IMPORTED' | 'FAILED'

export interface MasterDataImportError {
  field: string
  code: string
  message: string
}

export interface MasterDataImportRow {
  id: string
  revision: number
  rowNumber: number
  sourceKey?: string
  source: Record<string, string>
  normalized: Record<string, unknown>
  errors: MasterDataImportError[]
  status: MasterDataImportRowStatus
  targetId?: string
  updatedAt: string
}

export interface MasterDataImportBatch {
  id: string
  revision: number
  importType: MasterDataImportType
  fileName: string
  fileHash: string
  requestCode: string
  status: MasterDataImportStatus
  totalRows: number
  readyRows: number
  invalidRows: number
  importedRows: number
  failedRows: number
  createdAt: string
  createdBy: string
  updatedAt: string
  updatedBy: string
  rows: MasterDataImportRow[]
}

export type StandardAuthorityType = 'NATIONAL' | 'INSURANCE' | 'REGULATORY' | 'LOCAL' | 'INTERNAL' | 'OTHER'
export type StandardMappingType = 'CLINICAL' | 'INSURANCE' | 'REGULATORY' | 'LOCAL'
export type StandardEquivalence = 'EXACT' | 'EQUIVALENT' | 'WIDER' | 'NARROWER' | 'RELATED'
export type StandardMappingStatus = 'ACTIVE' | 'SUSPENDED' | 'RETIRED' | 'SUPERSEDED'

export interface StandardCodeSystem {
  id: string
  code: string
  name: string
  version: string
  systemType: string
  authorityType: StandardAuthorityType
  publisher?: string
  status: string
  effectiveFrom: string
  effectiveTo?: string
  canonicalUri?: string
  sourceUri?: string
  contentHash?: string
}

export interface StandardTerm {
  id: string
  codeSystemId: string
  systemCode: string
  systemName: string
  systemVersion: string
  authorityType: StandardAuthorityType
  code: string
  display: string
  shortDisplay?: string
  conceptType?: string
  status: string
  effectiveFrom: string
  effectiveTo?: string
}

export interface ItemTermMapping {
  id: string
  revision: number
  subjectId: string
  subjectType: ItemAttributeSubjectType
  targetId: string
  conceptId: string
  codeSystemId: string
  systemCode: string
  systemName: string
  systemVersion: string
  authorityType: StandardAuthorityType
  termCode: string
  termDisplay: string
  mappingType: StandardMappingType
  equivalence: StandardEquivalence
  primaryMapping: boolean
  limitation?: string
  validFrom: string
  validTo?: string
  status: StandardMappingStatus
  replacesMappingId?: string
  createdAt: string
  createdBy: string
  updatedAt: string
  updatedBy: string
}

export interface ItemTermMappingMaintenance {
  subjectId: string
  subjectType: ItemAttributeSubjectType
  targetId: string
  businessDate: string
  effectiveMappings: ItemTermMapping[]
  history: ItemTermMapping[]
}

export interface SaveItemTermMappingInput {
  conceptId: string
  mappingType: StandardMappingType
  equivalence: StandardEquivalence
  primaryMapping: boolean
  limitation?: string
  validFrom: string
  validTo?: string
  replacesMappingId?: string
  expectedReplacesRevision?: number
}

function queryString(values: Record<string, string | undefined>) {
  const params = new URLSearchParams()
  Object.entries(values).forEach(([key, value]) => { if (value) params.set(key, value) })
  return params.size ? `?${params}` : ''
}

export function createMasterDataApi(client: ApiClient) {
  return {
    itemTypes: (subjectType = '') => client.request<ItemType[]>(
      `/api/platform/master-data/item-types${queryString({ subjectType })}`,
    ),
    itemAttributeConfigurations: (subjectType = '', itemTypeId = '', status = '') =>
      client.request<ItemAttributeConfiguration>(
        `/api/platform/master-data/item-attribute-configurations${queryString({ subjectType, itemTypeId, status })}`,
      ),
    createItemAttributeDefinition: (input: ItemAttributeDefinitionInput) =>
      client.request<ItemAttributeDefinitionConfiguration>(
        '/api/platform/master-data/item-attribute-configurations/definitions',
        { method: 'POST', body: JSON.stringify(input) },
      ),
    updateItemAttributeDefinition: (id: string, revision: number, input: Omit<ItemAttributeDefinitionInput, 'code'>) =>
      client.request<ItemAttributeDefinitionConfiguration>(
        `/api/platform/master-data/item-attribute-configurations/definitions/${id}`,
        { method: 'PUT', body: JSON.stringify({ ...input, expectedRevision: revision }) },
      ),
    changeItemAttributeDefinitionStatus: (value: ItemAttributeDefinitionConfiguration, status: 'ACTIVE' | 'INACTIVE',
      reason: string) => client.request<ItemAttributeDefinitionConfiguration>(
      `/api/platform/master-data/item-attribute-configurations/definitions/${value.id}/status`,
      { method: 'POST', body: JSON.stringify({ expectedRevision: value.revision, status, reason,
        requestCode: crypto.randomUUID() }) },
    ),
    createItemTypeAttribute: (input: ItemTypeAttributeInput) => client.request<ItemTypeAttributeConfiguration>(
      '/api/platform/master-data/item-attribute-configurations/assignments',
      { method: 'POST', body: JSON.stringify(input) },
    ),
    updateItemTypeAttribute: (id: string, revision: number,
      input: Omit<ItemTypeAttributeInput, 'itemTypeId' | 'definitionId'>) =>
      client.request<ItemTypeAttributeConfiguration>(
        `/api/platform/master-data/item-attribute-configurations/assignments/${id}`,
        { method: 'PUT', body: JSON.stringify({ ...input, expectedRevision: revision }) },
      ),
    changeItemTypeAttributeStatus: (value: ItemTypeAttributeConfiguration, status: 'ACTIVE' | 'INACTIVE',
      reason: string) => client.request<ItemTypeAttributeConfiguration>(
      `/api/platform/master-data/item-attribute-configurations/assignments/${value.id}/status`,
      { method: 'POST', body: JSON.stringify({ expectedRevision: value.revision, status, reason,
        requestCode: crypto.randomUUID() }) },
    ),
    itemAttributeMaintenance: (subjectType: ItemAttributeSubjectType, targetId: string, businessDate = '') =>
      client.request<ItemAttributeMaintenance>(`/api/platform/master-data/item-attributes/maintenance${queryString({
        subjectType, targetId, businessDate,
      })}`),
    saveItemAttributeValue: (input: SaveItemAttributeValueInput) => client.request<ItemAttributeMaintenance>(
      '/api/platform/master-data/item-attributes/base-value', { method: 'PUT', body: JSON.stringify(input) },
    ),
    saveItemAttributeOverride: (input: SaveItemAttributeOverrideInput) => client.request<ItemAttributeMaintenance>(
      '/api/platform/master-data/item-attributes/override', { method: 'PUT', body: JSON.stringify(input) },
    ),
    disableItemAttributeValue: (input: {
      subjectType: ItemAttributeSubjectType; targetId: string; definitionId: string; recordId: string
      expectedRevision: number; reason: string; requestCode: string
    }) => client.request<ItemAttributeMaintenance>('/api/platform/master-data/item-attributes/base-value/disable', {
      method: 'POST', body: JSON.stringify(input),
    }),
    disableItemAttributeOverride: (input: {
      subjectType: ItemAttributeSubjectType; targetId: string; definitionId: string; recordId: string
      expectedRevision: number; reason: string; requestCode: string
    }) => client.request<ItemAttributeMaintenance>('/api/platform/master-data/item-attributes/override/disable', {
      method: 'POST', body: JSON.stringify(input),
    }),
    importBatches: () => client.request<MasterDataImportBatch[]>('/api/platform/master-data/imports'),
    importBatch: (batchId: string) => client.request<MasterDataImportBatch>(
      `/api/platform/master-data/imports/${batchId}`,
    ),
    preflightImport: (importType: MasterDataImportType, file: File) => {
      const body = new FormData()
      body.append('file', file)
      return client.request<MasterDataImportBatch>(`/api/platform/master-data/imports/preflight${queryString({
        importType, requestCode: crypto.randomUUID(),
      })}`, { method: 'POST', body })
    },
    correctImportRow: (batchId: string, row: MasterDataImportRow, values: Record<string, string>) =>
      client.request<MasterDataImportBatch>(`/api/platform/master-data/imports/${batchId}/rows/${row.id}`, {
        method: 'PUT', body: JSON.stringify({ expectedRevision: row.revision, values }),
      }),
    commitImport: (batchId: string) => client.request<MasterDataImportBatch>(
      `/api/platform/master-data/imports/${batchId}/commit`, { method: 'POST' },
    ),
    cancelImport: (batchId: string) => client.request<MasterDataImportBatch>(
      `/api/platform/master-data/imports/${batchId}/cancel`, { method: 'POST' },
    ),
    downloadImportTemplate: (importType: MasterDataImportType, format: 'XLSX' | 'CSV' = 'XLSX') =>
      client.download(`/api/platform/master-data/imports/template${queryString({ importType, format })}`),
    downloadImportErrors: (batchId: string) => client.download(
      `/api/platform/master-data/imports/${batchId}/errors.csv`,
    ),
    standardCodeSystems: (systemType = '', authorityType = '', businessDate = '', query = '') =>
      client.request<StandardCodeSystem[]>(`/api/platform/master-data/standard-mappings/code-systems${queryString({
        systemType, authorityType, businessDate, query,
      })}`),
    standardTerms: (codeSystemId: string, businessDate = '', query = '') => client.request<StandardTerm[]>(
      `/api/platform/master-data/standard-mappings/terms${queryString({ codeSystemId, businessDate, query })}`,
    ),
    itemTermMappings: (subjectType: ItemAttributeSubjectType, targetId: string, businessDate = '') =>
      client.request<ItemTermMappingMaintenance>(
        `/api/platform/master-data/standard-mappings/${subjectType}/${targetId}${queryString({ businessDate })}`,
      ),
    saveItemTermMapping: (subjectType: ItemAttributeSubjectType, targetId: string,
      input: SaveItemTermMappingInput) => client.request<ItemTermMappingMaintenance>(
      `/api/platform/master-data/standard-mappings/${subjectType}/${targetId}`,
      { method: 'POST', body: JSON.stringify(input) },
    ),
    changeItemTermMappingStatus: (mappingId: string, expectedRevision: number,
      status: Exclude<StandardMappingStatus, 'SUPERSEDED'>, validTo?: string) =>
      client.request<ItemTermMappingMaintenance>(
        `/api/platform/master-data/standard-mappings/mappings/${mappingId}/status`,
        { method: 'POST', body: JSON.stringify({ expectedRevision, status, validTo }) },
      ),
    diseaseCodeSystems: () => client.request<CodeSystemSummary[]>('/api/platform/terminology/disease-code-systems'),
    diseases: (query = '', conceptType = '', status = '') => client.request<DiseaseConcept[]>(
      `/api/platform/terminology/diseases${queryString({ query, conceptType, status })}`,
    ),
    searchDiseases: (query = '', conceptType = '', status = '', diagnosisDomain = '', page = 0, size = 20) =>
      client.request<DiseaseSearchPage>(`/api/platform/terminology/diseases/search${queryString({
        query, conceptType, status, diagnosisDomain, page: String(page), size: String(size),
      })}`),
    createDisease: (input: DiseaseInput) => client.request<DiseaseConcept>('/api/platform/terminology/diseases', {
      method: 'POST', body: JSON.stringify(input),
    }),
    updateDisease: (id: string, revision: number, input: Omit<DiseaseInput, 'codeSystemId' | 'code' | 'sdStatus'>) =>
      client.request<DiseaseConcept>(`/api/platform/terminology/diseases/${id}`, {
        method: 'PUT', body: JSON.stringify({ ...input, expectedRevision: revision }),
      }),
    diseaseStatus: (id: string, revision: number, sdStatus: MasterDataStatus) =>
      client.request<DiseaseConcept>(`/api/platform/terminology/diseases/${id}/status`, {
        method: 'POST', body: JSON.stringify({ expectedRevision: revision, sdStatus }),
      }),
    diseaseManagementPrograms: (status = '') => client.request<DiseaseManagementProgram[]>(
      `/api/platform/terminology/disease-management-programs${queryString({ status })}`,
    ),
    searchDiseaseManagementPrograms: (query = '', managementType = '', status = '', page = 0, size = 20) =>
      client.request<MasterDataPage<DiseaseManagementProgram>>(
        `/api/platform/terminology/disease-management-programs/search${queryString({
          query, managementType, status, page: String(page), size: String(size),
        })}`,
      ),
    createDiseaseManagementProgram: (input: DiseaseManagementProgramInput) =>
      client.request<DiseaseManagementProgram>('/api/platform/terminology/disease-management-programs', {
        method: 'POST', body: JSON.stringify(input),
      }),
    updateDiseaseManagementProgram: (id: string, revision: number, input: DiseaseManagementProgramInput) => {
      const { productScope: _productScope, code: _code, ...payload } = input
      return client.request<DiseaseManagementProgram>(`/api/platform/terminology/disease-management-programs/${id}`, {
        method: 'PUT', body: JSON.stringify({ ...payload, expectedRevision: revision }),
      })
    },
    replaceDiseaseManagementMembers: (id: string, revision: number, conceptIds: string[]) =>
      client.request<DiseaseManagementProgram>(`/api/platform/terminology/disease-management-programs/${id}/members`, {
        method: 'PUT', body: JSON.stringify({ expectedRevision: revision, conceptIds }),
      }),
    replaceDiseaseManagementScope: (id: string, revision: number, rules: DiseaseManagementRule[],
      exceptions: DiseaseManagementExceptionInput[]) => client.request<DiseaseManagementProgram>(
      `/api/platform/terminology/disease-management-programs/${id}/scope`, {
        method: 'PUT', body: JSON.stringify({ expectedRevision: revision, rules, exceptions }),
      }),
    diseaseManagementProgramStatus: (id: string, revision: number, sdStatus: MasterDataStatus) =>
      client.request<DiseaseManagementProgram>(`/api/platform/terminology/disease-management-programs/${id}/status`, {
        method: 'POST', body: JSON.stringify({ expectedRevision: revision, sdStatus }),
      }),
    services: (query = '', serviceType = '', status = '', organizationId = '') =>
      client.request<ServiceCatalogItem[]>(`/api/platform/master-data/services${queryString({
        query, serviceType, status, organizationId,
      })}`),
    searchServices: (query = '', serviceType = '', status = '', organizationId = '', page = 0, size = 20) =>
      client.request<MasterDataPage<ServiceCatalogItem>>(`/api/platform/master-data/services/search${queryString({
        query, serviceType, status, organizationId, page: String(page), size: String(size),
      })}`),
    createService: (input: ServiceInput, organizationId = '') => client.request<ServiceCatalogItem>(
      `/api/platform/master-data/services${queryString({ organizationId })}`, {
        method: 'POST', body: JSON.stringify(input),
      },
    ),
    updateService: (id: string, revision: number, input: ServiceInput, organizationId = '') =>
      client.request<ServiceCatalogItem>(
        `/api/platform/master-data/services/${id}${queryString({ organizationId })}`, {
          method: 'PUT', body: JSON.stringify({ ...input, expectedRevision: revision }),
        },
      ),
    serviceStatus: (id: string, revision: number, sdStatus: MasterDataStatus, organizationId = '') =>
      client.request<ServiceCatalogItem>(
        `/api/platform/master-data/services/${id}/status${queryString({ organizationId })}`, {
          method: 'POST', body: JSON.stringify({ expectedRevision: revision, sdStatus }),
        },
      ),
    medications: (query = '', medicationType = '', status = '', organizationId = '') =>
      client.request<MedicationKnowledge[]>(`/api/platform/master-data/medications${queryString({
        query, medicationType, status, organizationId,
      })}`),
    standardMedicationSummary: () => client.request<StandardMedicationSummary>('/api/platform/master-data/medication-standard-catalog/summary'),
    standardCatalogSourceReview: (historyPage = 0) => client.request<StandardCatalogSourceReview>(
      `/api/platform/master-data/medication-standard-catalog/source-review${queryString({historyPage: String(historyPage)})}`),
    changeStandardCatalogSourceReview: (input: StandardCatalogReviewChange) => client.request<StandardCatalogSourceReview>(
      '/api/platform/master-data/medication-standard-catalog/source-review', {method: 'POST', body: JSON.stringify(input)}),
    standardMedications: (query = '', medicationType = '', state = '', page = 0, size = 20) =>
      client.request<MasterDataPage<StandardMedicationEntry>>(`/api/platform/master-data/medication-standard-catalog${queryString({
        query, medicationType, state, page: String(page), size: String(size),
      })}`),
    standardMedicationCandidates: (id: string, organizationId: string) => client.request<MedicationKnowledge[]>(
      `/api/platform/master-data/medication-standard-catalog/specifications/${encodeURIComponent(id)}/medications${queryString({organizationId})}`),
    saveStandardMedication: (id: string, input: MedicationInput, organizationId: string, prior?: MedicationKnowledge) =>
      client.request<MedicationKnowledge>(`/api/platform/master-data/medication-standard-catalog/specifications/${encodeURIComponent(id)}/medications${queryString({organizationId})}`,
        {method: 'POST', body: JSON.stringify({medication: input, medicationId: prior?.id, expectedRevision: prior?.revision})}),
    standardMedicationDetail: (id: string) => client.request<StandardMedicationDetail>(
      `/api/platform/master-data/medication-standard-catalog/${encodeURIComponent(id)}`),
    standardCatalogSourceDocumentUrl: (page?: number) => {
      const base = '/api/platform/master-data/medication-standard-catalog/source-document'
      return page ? `${base}#page=${page}&view=FitH` : base
    },
    downloadStandardCatalogSourceDocument: () =>
      client.download('/api/platform/master-data/medication-standard-catalog/source-document'),
    searchMedicationProducts: (query = '', medicationType = '', status = '', organizationId = '', page = 0, size = 20,
      stockable = false, dispensable = false) => client.request<MasterDataPage<{ product: MedicationProduct; medication: MedicationKnowledge }>>(
        `/api/platform/master-data/medication-products/search${queryString({query, medicationType, status, organizationId,
          page: String(page), size: String(size), stockable: String(stockable), dispensable: String(dispensable)})}`),
    searchMedications: (query = '', medicationType = '', status = '', organizationId = '', page = 0, size = 20) =>
      client.request<MasterDataPage<MedicationKnowledge>>(`/api/platform/master-data/medications/search${queryString({
        query, medicationType, status, organizationId, page: String(page), size: String(size),
      })}`),
    clinicalMedicationStandards: () => client.request<ClinicalMedicationStandards>('/api/platform/master-data/clinical-semantics/standards'),
    medicationStandardReadiness: (query = '', filter = 'ALL', page = 0, size = 20) =>
      client.request<MedicationStandardReadiness>(`/api/platform/master-data/clinical-semantics/readiness${queryString({
        query, filter, page: String(page), size: String(size),
      })}`),
    medicationStandardBindingPreview: (id: string) => client.request<MedicationStandardBindingPreview>(
      `/api/platform/master-data/medications/${encodeURIComponent(id)}/standard-binding`),
    bindMedicationStandard: (id: string, input: {expectedRevision: number; identity: StandardCatalogIdentity; specificationId: string; reason: string; confirmedIdentity: boolean}) =>
      client.request<MedicationStandardBindingPreview>(`/api/platform/master-data/medications/${encodeURIComponent(id)}/standard-binding`, {method: 'POST', body: JSON.stringify(input)}),
    medicationIngredients: () => client.request<MedicationIngredient[]>('/api/platform/master-data/medication-ingredients'),
    createMedicationIngredient: (input: Omit<MedicationIngredient, 'id'>) => client.request<MedicationIngredient>(
      '/api/platform/master-data/medication-ingredients', {method: 'POST', body: JSON.stringify(input)}),
    medicationComposition: (id: string) => client.request<MedicationComposition>(`/api/platform/master-data/medications/${id}/composition`),
    saveMedicationComposition: (id: string, input: MedicationComposition) => client.request<MedicationComposition>(
      `/api/platform/master-data/medications/${id}/composition`, {method: 'PUT', body: JSON.stringify(input)}),
    medicationSemanticHistory: (id: string) => client.request<MedicationSemanticVersion[]>(`/api/platform/master-data/medications/${id}/semantic-history`),
    createMedication: (input: MedicationInput, organizationId = '') => client.request<MedicationKnowledge>(
      `/api/platform/master-data/medications${queryString({ organizationId })}`, {
        method: 'POST', body: JSON.stringify(input),
      },
    ),
    updateMedication: (id: string, revision: number, input: MedicationInput, organizationId = '') =>
      client.request<MedicationKnowledge>(
        `/api/platform/master-data/medications/${id}${queryString({ organizationId })}`, {
          method: 'PUT', body: JSON.stringify({ ...input, expectedRevision: revision }),
        },
      ),
    medicationStatus: (id: string, revision: number, sdStatus: MasterDataStatus, organizationId = '') =>
      client.request<MedicationKnowledge>(
        `/api/platform/master-data/medications/${id}/status${queryString({ organizationId })}`, {
          method: 'POST', body: JSON.stringify({ expectedRevision: revision, sdStatus }),
        },
      ),
    manufacturers: (query = '') => client.request<Manufacturer[]>(
      `/api/platform/master-data/manufacturers${queryString({ query })}`,
    ),
    createManufacturer: (input: ManufacturerInput) => client.request<Manufacturer>(
      '/api/platform/master-data/manufacturers', { method: 'POST', body: JSON.stringify(input) },
    ),
    updateManufacturer: (id: string, revision: number, input: ManufacturerInput) => client.request<Manufacturer>(
      `/api/platform/master-data/manufacturers/${id}`, {
        method: 'PUT', body: JSON.stringify({ ...input, expectedRevision: revision }),
      },
    ),
    manufacturerStatus: (id: string, revision: number, sdStatus: MasterDataStatus) => client.request<Manufacturer>(
      `/api/platform/master-data/manufacturers/${id}/status`, {
        method: 'POST', body: JSON.stringify({ expectedRevision: revision, sdStatus }),
      },
    ),
    createProduct: (input: ProductInput, organizationId = '') => client.request<MedicationProduct>(
      `/api/platform/master-data/medication-products${queryString({ organizationId })}`, {
        method: 'POST', body: JSON.stringify(input),
      },
    ),
    createProductSetup: (input: MedicationProductSetupInput) => client.request<MedicationProduct>(
      '/api/platform/master-data/medication-products/setup', {
        method: 'POST', body: JSON.stringify(input),
      },
    ),
    updateProduct: (id: string, revision: number, input: ProductInput, organizationId = '') =>
      client.request<MedicationProduct>(
        `/api/platform/master-data/medication-products/${id}${queryString({ organizationId })}`, {
          method: 'PUT', body: JSON.stringify({ ...input, expectedRevision: revision }),
        },
      ),
    createPackage: (catalogItemId: string, input: PackageInput) => client.request<ItemPackage>(
      `/api/platform/master-data/catalog-items/${catalogItemId}/packages`, {
        method: 'POST', body: JSON.stringify(input),
      },
    ),
    updatePackage: (id: string, input: PackageInput) => client.request<ItemPackage>(
      `/api/platform/master-data/packages/${id}`, {
        method: 'PUT', body: JSON.stringify(input),
      },
    ),
    adopt: (catalogItemId: string, input: AdoptionInput) => client.request<OrganizationAdoption>(
      `/api/platform/master-data/catalog-items/${catalogItemId}/organization-adoptions`, {
        method: 'POST', body: JSON.stringify(input),
      },
    ),
    createPrice: (catalogItemId: string, input: PriceInput) => client.request<CatalogPrice>(
      `/api/platform/master-data/catalog-items/${catalogItemId}/prices`, {
        method: 'POST', body: JSON.stringify(input),
      },
    ),
    catalogLifecycle: (catalogItemId: string, organizationId = '', businessDate = '') =>
      client.request<CatalogLifecycle>(
        `/api/platform/master-data/catalog-lifecycle/catalog-items/${catalogItemId}${queryString({
          organizationId, businessDate,
        })}`,
      ),
    adoptionCandidates: (organizationId: string, itemType: 'SERVICE' | 'MED_PRODUCT', query = '', page = 0, size = 20) =>
      client.request<MasterDataPage<CatalogAdoptionCandidate>>(
        `/api/platform/master-data/catalog-lifecycle/adoption-candidates${queryString({
          organizationId, itemType, query, page: String(page), size: String(size),
        })}`,
      ),
    createLifecycleAdoption: (catalogItemId: string, input: LifecycleAdoptionInput) =>
      client.request<CatalogLifecycle>(
        `/api/platform/master-data/catalog-lifecycle/catalog-items/${catalogItemId}/adoptions`,
        { method: 'POST', body: JSON.stringify(input) },
      ),
    replaceLifecycleAdoption: (adoptionId: string, expectedRevision: number, input: LifecycleAdoptionInput) =>
      client.request<CatalogLifecycle>(
        `/api/platform/master-data/catalog-lifecycle/adoptions/${adoptionId}/replace`,
        { method: 'POST', body: JSON.stringify({ ...input, expectedRevision }) },
      ),
    changeLifecycleAdoptionStatus: (adoptionId: string, expectedRevision: number,
      status: 'ACTIVE' | 'SUSPENDED' | 'RETIRED', validTo?: string) => client.request<CatalogLifecycle>(
      `/api/platform/master-data/catalog-lifecycle/adoptions/${adoptionId}/status`,
      { method: 'POST', body: JSON.stringify({ expectedRevision, status, validTo }) },
    ),
    createLifecyclePrice: (catalogItemId: string, input: LifecyclePriceInput) =>
      client.request<CatalogLifecycle>(
        `/api/platform/master-data/catalog-lifecycle/catalog-items/${catalogItemId}/prices`,
        { method: 'POST', body: JSON.stringify(input) },
      ),
    replaceLifecyclePrice: (priceId: string, expectedRevision: number, input: LifecyclePriceInput) =>
      client.request<CatalogLifecycle>(
        `/api/platform/master-data/catalog-lifecycle/prices/${priceId}/replace`,
        { method: 'POST', body: JSON.stringify({ ...input, expectedRevision }) },
      ),
    changeLifecyclePriceStatus: (priceId: string, expectedRevision: number,
      status: 'ACTIVE' | 'SUSPENDED' | 'RETIRED', validTo?: string) => client.request<CatalogLifecycle>(
      `/api/platform/master-data/catalog-lifecycle/prices/${priceId}/status`,
      { method: 'POST', body: JSON.stringify({ expectedRevision, status, validTo }) },
    ),
    adoptionBatch: (input: AdoptionBatchInput) => client.request<CatalogChangeBatch>(
      '/api/platform/master-data/catalog-lifecycle/adoption-batches',
      { method: 'POST', body: JSON.stringify(input) },
    ),
    priceBatch: (input: PriceBatchInput) => client.request<CatalogChangeBatch>(
      '/api/platform/master-data/catalog-lifecycle/price-batches',
      { method: 'POST', body: JSON.stringify(input) },
    ),
    catalogChangeBatch: (batchId: string) => client.request<CatalogChangeBatch>(
      `/api/platform/master-data/catalog-lifecycle/batches/${batchId}`,
    ),
    clinicalConfiguration: (serviceId: string) => client.request<ClinicalConfiguration>(
      `/api/platform/master-data/operations/services/${serviceId}/clinical-configuration`,
    ),
    updateLaboratoryProfile: (serviceId: string, revision: number,
      input: Omit<LaboratoryProfile, 'serviceId' | 'revision' | 'specimens'>) =>
      client.request<ClinicalConfiguration>(
        `/api/platform/master-data/operations/services/${serviceId}/laboratory-profile`,
        { method: 'PUT', body: JSON.stringify({ ...input, expectedRevision: revision }) },
      ),
    createSpecimenConfiguration: (serviceId: string, input: SpecimenConfigurationInput) =>
      client.request<ClinicalConfiguration>(`/api/platform/master-data/operations/services/${serviceId}/specimens`,
        { method: 'POST', body: JSON.stringify(input) }),
    updateSpecimenConfiguration: (serviceId: string, value: SpecimenConfiguration,
      input: SpecimenConfigurationInput) => client.request<ClinicalConfiguration>(
        `/api/platform/master-data/operations/services/${serviceId}/specimens/${value.id}`,
        { method: 'PUT', body: JSON.stringify({ ...input, expectedRevision: value.revision }) },
      ),
    updateExaminationProfile: (serviceId: string, revision: number,
      input: ExaminationProfileInput) =>
      client.request<ClinicalConfiguration>(
        `/api/platform/master-data/operations/services/${serviceId}/examination-profile`,
        { method: 'PUT', body: JSON.stringify({ ...input, expectedRevision: revision }) },
      ),
    createExaminationVariant: (serviceId: string, input: ExaminationVariantInput) =>
      client.request<ClinicalConfiguration>(
        `/api/platform/master-data/operations/services/${serviceId}/examination-variants`,
        { method: 'POST', body: JSON.stringify(input) },
      ),
    updateExaminationVariant: (serviceId: string, value: ExaminationVariantConfiguration,
      input: ExaminationVariantInput) => client.request<ClinicalConfiguration>(
        `/api/platform/master-data/operations/services/${serviceId}/examination-variants/${value.id}`,
        { method: 'PUT', body: JSON.stringify({ ...input, expectedRevision: value.revision }) },
      ),
    createExaminationAttachment: (serviceId: string, input: ExaminationAttachmentInput) =>
      client.request<ClinicalConfiguration>(
        `/api/platform/master-data/operations/services/${serviceId}/examination-attachments`,
        { method: 'POST', body: JSON.stringify(input) },
      ),
    updateExaminationAttachment: (serviceId: string, value: ExaminationAttachmentConfiguration,
      input: ExaminationAttachmentInput) => client.request<ClinicalConfiguration>(
        `/api/platform/master-data/operations/services/${serviceId}/examination-attachments/${value.id}`,
        { method: 'PUT', body: JSON.stringify({ ...input, expectedRevision: value.revision }) },
      ),
    examinationChargePlan: (serviceId: string, bodySiteCodes: string[], selectedAttachmentIds: string[] = []) =>
      client.request<ExaminationChargePlan>(
        `/api/platform/master-data/operations/services/${serviceId}/examination-charge-plan`,
        { method: 'POST', body: JSON.stringify({ bodySiteCodes, selectedAttachmentIds }) },
      ),
    laboratoryTubePlan: (items: Array<{ serviceId: string; specimenConfigurationId?: string; quantity: number }>) =>
      client.request<LaboratoryTubePlan>('/api/platform/master-data/operations/laboratory-tube-plan',
        { method: 'POST', body: JSON.stringify({ items }) }),
    supplies: (query = '', supplyType = '', status = '') => client.request<SupplyItem[]>(
      `/api/platform/master-data/operations/supplies${queryString({ query, supplyType, status })}`,
    ),
    createSupply: (input: SupplyInput) => client.request<SupplyItem>(
      '/api/platform/master-data/operations/supplies', { method: 'POST', body: JSON.stringify(input) },
    ),
    updateSupply: (value: SupplyItem, input: SupplyInput) => client.request<SupplyItem>(
      `/api/platform/master-data/operations/supplies/${value.id}`,
      { method: 'PUT', body: JSON.stringify({ ...input, expectedRevision: value.revision }) },
    ),
    itemGroups: (query = '', groupType = '', status = '') => client.request<ItemGroup[]>(
      `/api/platform/master-data/operations/item-groups${queryString({ query, groupType, status })}`,
    ),
    createItemGroup: (input: ItemGroupInput) => client.request<ItemGroup>(
      '/api/platform/master-data/operations/item-groups', { method: 'POST', body: JSON.stringify(input) },
    ),
    updateItemGroup: (value: ItemGroup, input: ItemGroupInput) => client.request<ItemGroup>(
      `/api/platform/master-data/operations/item-groups/${value.id}`,
      { method: 'PUT', body: JSON.stringify({ ...input, expectedRevision: value.revision }) },
    ),
    units: (dimension = '', status = '') => client.request<UnitDefinition[]>(
      `/api/platform/master-data/operations/units${queryString({ dimension, status })}`,
    ),
    createUnit: (input: Omit<UnitDefinition, 'id' | 'revision'>) => client.request<UnitDefinition>(
      '/api/platform/master-data/operations/units', { method: 'POST', body: JSON.stringify(input) },
    ),
    updateUnit: (value: UnitDefinition, input: Omit<UnitDefinition, 'id' | 'revision'>) =>
      client.request<UnitDefinition>(`/api/platform/master-data/operations/units/${value.id}`,
        { method: 'PUT', body: JSON.stringify({ ...input, expectedRevision: value.revision }) }),
    unitConversions: (catalogItemId = '') => client.request<UnitConversion[]>(
      `/api/platform/master-data/operations/unit-conversions${queryString({ catalogItemId })}`,
    ),
    createUnitConversion: (input: UnitConversionInput) => client.request<UnitConversion>(
      '/api/platform/master-data/operations/unit-conversions', { method: 'POST', body: JSON.stringify(input) },
    ),
    updateUnitConversion: (value: UnitConversion, input: UnitConversionInput) =>
      client.request<UnitConversion>(`/api/platform/master-data/operations/unit-conversions/${value.id}`,
        { method: 'PUT', body: JSON.stringify({ ...input, expectedRevision: value.revision }) }),
    convertUnit: (quantity: number, fromUnitCode: string, toUnitCode: string,
      catalogItemId?: string, effectiveDate = '') => client.request<UnitConversionResult>(
        '/api/platform/master-data/operations/unit-conversions/convert', {
          method: 'POST', body: JSON.stringify({ quantity, fromUnitCode, toUnitCode,
            catalogItemId: catalogItemId || undefined, effectiveDate: effectiveDate || undefined }),
        },
      ),
    orderFrequencies: (query = '', status = '') => client.request<OrderFrequency[]>(
      `/api/platform/master-data/order-frequencies${queryString({ query, status })}`,
    ),
    activeOrderFrequencies: (organizationId?: string, departmentId?: string,
      scene = 'OUTPATIENT', orderType = 'MEDICATION', businessDate = '') => client.request<ActiveOrderFrequency[]>(
      `/api/platform/master-data/order-frequencies/active${queryString({ organizationId, departmentId,
        scene, orderType, businessDate })}`,
    ),
    activeMedicationRoutes: (scene = 'OUTPATIENT', businessDate = '') => client.request<MedicationRoute[]>(
      `/api/platform/master-data/medication-routes/active${queryString({ scene, businessDate })}`,
    ),
    createOrderFrequency: (input: OrderFrequencyInput) => client.request<OrderFrequency>(
      '/api/platform/master-data/order-frequencies', { method: 'POST', body: JSON.stringify(input) },
    ),
    updateOrderFrequency: (value: OrderFrequency, input: OrderFrequencyInput) => client.request<OrderFrequency>(
      `/api/platform/master-data/order-frequencies/${value.id}`,
      { method: 'PUT', body: JSON.stringify({ ...input, expectedRevision: value.revision }) },
    ),
    createOrderFrequencyConfiguration: (frequencyId: string, input: OrderFrequencyConfigurationInput) =>
      client.request<OrderFrequency>(`/api/platform/master-data/order-frequencies/${frequencyId}/configurations`,
        { method: 'POST', body: JSON.stringify(input) }),
    updateOrderFrequencyConfiguration: (frequencyId: string, value: OrderFrequencyConfiguration,
      input: OrderFrequencyConfigurationInput) => client.request<OrderFrequency>(
        `/api/platform/master-data/order-frequencies/${frequencyId}/configurations/${value.id}`,
        { method: 'PUT', body: JSON.stringify({ ...input, expectedRevision: value.revision }) },
      ),
    previewOrderFrequencyDefinition: (definition: OrderFrequencyInput, start?: string, occurrences = 8) => client.request<OrderFrequencySchedulePreview>(
      '/api/platform/master-data/order-frequencies/preview-definition', { method: 'POST', body: JSON.stringify({ definition, start, occurrences }) }),
    previewOrderFrequencyConfiguration: (frequency: OrderFrequency, configuration: OrderFrequencyConfigurationInput, start?: string, occurrences = 8) => client.request<OrderFrequencySchedulePreview>(
      `/api/platform/master-data/order-frequencies/${frequency.id}/preview-configuration`, { method: 'POST', body: JSON.stringify({ expectedRevision: frequency.revision, configuration, start, occurrences }) }),
    previewOrderFrequency: (code: string, organizationId?: string, departmentId?: string,
      start?: string, occurrences = 8) => client.request<OrderFrequencySchedulePreview>(
      '/api/platform/master-data/order-frequencies/preview',
      { method: 'POST', body: JSON.stringify({ code, organizationId, departmentId, start, occurrences }) },
    ),
  }
}

export interface StandardMedicationSource {
  title: string; claimedEdition: string; sha256: string; verificationStatus: string; note: string; verificationId?: string
  officialUrl?: string; officialAttachmentUrl?: string; publicationNumber?: string; effectiveFrom?: string; publicationVerificationStatus?: string
}
export interface StandardCatalogIdentity { catalogId: string; catalogVersion: string; contentHash: string; sourceHash: string }
export interface StandardCatalogEvidence { title: string; publisher: string; edition: string; location: string; verificationNotes: string }
export type StandardCatalogReviewAction = 'SUBMIT' | 'VERIFY' | 'REJECT' | 'REVOKE'
export interface StandardCatalogReviewEvent {
  id: string; revision: number; identity: StandardCatalogIdentity; status: string; evidence: StandardCatalogEvidence
  submittedBy: string; submitter: string; actorId: string; actor: string; reason: string; recordedAt: string
}
export interface StandardCatalogSourceReview {
  identity: StandardCatalogIdentity; revision: number; status: string; latest: StandardCatalogReviewEvent | null
  history: StandardCatalogReviewEvent[]; totalEvents: number; historyPage: number; historyPageSize: number; allowedActions: StandardCatalogReviewAction[]
}
export interface StandardCatalogReviewChange {
  identity: StandardCatalogIdentity; expectedRevision: number; action: StandardCatalogReviewAction
  evidence?: StandardCatalogEvidence; reason: string
}
export interface StandardMedicationSummary {
  catalogId: string; contentHash: string
  catalogVersion: string; source: StandardMedicationSource; scopeNote: string
  statistics: { entries: number; specifications: number; scopeEntries: number; issues: number;
    structuredStrengths: number; entriesWithSpecifications: number; crossCategoryRows: number }
}
export interface StandardMedicationPdfLocation {
  location: string
  page: number
  printPage: number
}
export interface StandardMedicationEntry {
  id: string; legacyCode: string; name: string; innName: string; pinyinCode: string;
  medicationType: string; entryType: string; sourceSpecification: string; sourceNote: string;
  specialistGuidance: boolean; sourceLocations: string[]; pdfLocations?: StandardMedicationPdfLocation[];
  specificationCount: number; issueCount: number;
  categories: { major: string; sub: string; function: string }[]
}
export interface StandardMedicationSpecification {
  id: string; doseForm: string; doseFormName: string; substanceQualifier: string; specification: string;
  sourceBlock: string; orderable: boolean; presentationUnit?: string | null; identityIssues?: string[];
  strength: { kind: string; numerator: {value: string; unit: string} | null;
    denominator: {value: string; unit: string} | null; components: {ordinal: number; value: string; unit: string}[];
    computable: boolean }
}
export interface StandardMedicationDetail extends StandardMedicationEntry {
  source: StandardMedicationSource; specifications: StandardMedicationSpecification[];
  issues: {reason: string; sourceText: string}[]
}
