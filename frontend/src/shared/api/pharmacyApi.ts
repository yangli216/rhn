import type { MedicationRequest } from './encountersApi'
import type { ApiClient } from './httpClient'

export type StockSiteType = 'WAREHOUSE' | 'PHARMACY' | 'DEPARTMENT_STORE' | 'VIRTUAL'
export type PharmacyServiceScope = 'OUTPATIENT' | 'INPATIENT' | 'EMERGENCY' | 'COMMUNITY' | 'MIXED'
export type DispenseCareSetting = 'OUTPATIENT' | 'EMERGENCY' | 'INPATIENT' | 'HOME_CARE'
export type DispenseTaskStatus = 'PENDING_REVIEW' | 'INTERVENTION' | 'READY_TO_PICK' | 'PICKING'
  | 'READY_TO_DISPENSE' | 'PARTIALLY_DISPENSED' | 'COMPLETED' | 'PARTIALLY_RETURNED'
  | 'RETURN_REQUIRED' | 'RETURNED' | 'REJECTED' | 'CANCELLED' | 'STOPPED'
export type PharmacyReviewResult = 'PASS' | 'REJECT' | 'INTERVENE' | 'OVERRIDE'
export type PrescriptionReviewMode = 'DISABLED' | 'PRE_DISPENSE' | 'POST_DISPENSE'

export interface PrescriptionReviewModeView {
  mode: PrescriptionReviewMode
  enabled: boolean
  timing: 'NONE' | 'PRE' | 'POST'
  parameterKey: string
}

export interface StockSite {
  id: string
  revision: number
  organizationId: string
  departmentId?: string
  code: string
  name: string
  siteType: StockSiteType
  serviceScope: PharmacyServiceScope
  active: boolean
  validFrom: string
  validTo?: string
}

export interface DispenseRoute {
  id: string
  revision: number
  organizationId: string
  code: string
  name: string
  careSetting: DispenseCareSetting
  sourceDepartmentId?: string
  medicationType?: string
  targetStockSiteId: string
  active: boolean
  validFrom: string
  validTo?: string
  description?: string
  updatedAt: string
}

export interface DispenseRouteInput {
  organizationId: string
  code: string
  name: string
  careSetting: DispenseCareSetting
  sourceDepartmentId?: string
  medicationType?: string
  targetStockSiteId: string
  active: boolean
  validFrom: string
  validTo?: string
  description?: string
}

export interface StockItem {
  id: string
  revision: number
  stockSiteId: string
  catalogItemId: string
  packageId: string
  medicationId: string
  productCode: string
  productName: string
  packageUnitCode: string
  packageUnitName: string
  packageSpec?: string
  packageFactor: number
  baseUnitCode: string
  issuePolicy: string
  negativeAllowed: boolean
  lotRequired: boolean
  traceRequired: boolean
  splitAllowed: boolean
  coldChain: boolean
  controlled: boolean
  controlLevel?: string
  highAlert: boolean
  status: string
  manufacturerName?: string
}

export interface StockBin {
  id: string
  revision: number
  stockSiteId: string
  parentBinId?: string
  code: string
  name: string
  binType: string
  stockDefault: string
  receiveAllowed: boolean
  pickAllowed: boolean
  countAllowed: boolean
  sortOrder: number
  active: boolean
}

export interface StockLot {
  id: string
  revision: number
  catalogItemId: string
  packageId: string
  lotNo: string
  productionDate?: string
  expiryDate?: string
  approvalCodeSnapshot?: string
  manufacturerNameSnapshot?: string
  qualityStatus: string
  qualityAt: string
  qualityUserId: string
  status: string
}

export interface InventoryBalance {
  id: string
  revision: number
  stockSiteId: string
  stockBinId: string
  stockBinCode: string
  stockItemId: string
  stockLotId: string
  lotNo: string
  expiryDate?: string
  stockStatus: string
  baseUnitCode: string
  quantityOnHand: number
  quantityReserved: number
  quantityFrozen: number
  quantityAvailable: number
  averageUnitCost?: number
  projectedAt: string
}

export interface InventoryTransactionLine {
  id: string
  sortOrder: number
  stockSiteId: string
  stockBinId: string
  stockItemId: string
  stockLotId: string
  packageId: string
  stockStatus: string
  operationQuantity: number
  operationUnitCode: string
  baseQuantityFactor: number
  quantityDelta: number
  unitCost?: number
  amountDelta?: number
}

export interface InventoryTransaction {
  id: string
  inventoryPeriodId: string
  transactionNo: string
  requestCode: string
  transactionType: string
  sourceType: string
  sourceCode: string
  occurredAt: string
  postedAt: string
  postedBy: string
  description?: string
  lines: InventoryTransactionLine[]
}

export interface Supplier {
  id: string; revision: number; organizationId: string; code: string; name: string
  unifiedCreditCode?: string; licenseNo?: string; licenseValidTo?: string
  contactName?: string; contactPhone?: string; status: 'ACTIVE' | 'SUSPENDED' | 'RETIRED'
  validFrom: string; validTo?: string
}
export interface SupplierInput {
  organizationId?: string; code: string; name: string; unifiedCreditCode?: string
  licenseNo?: string; licenseValidTo?: string; contactName?: string; contactPhone?: string
  validFrom?: string; validTo?: string
}
export interface SupplierSupplyItem {
  id: string; revision: number; supplierId: string; catalogItemId: string
  packageId: string; agreementPrice: number; taxRate?: number
  purchaseEnabled?: boolean; validFrom?: string; validTo?: string
}
export interface PurchaseOrderLine { id: string; stockItemId: string; packageId: string; orderedQuantity: number; receivedQuantity: number; remainingQuantity: number; unitPrice: number; taxRate?: number; lineStatus: string; description?: string }
export interface PurchaseOrder { id: string; revision: number; stockSiteId: string; supplierId: string; orderNo: string; requestCode: string; status: string; orderDate: string; expectedDate?: string; description?: string; lines: PurchaseOrderLine[] }
export interface GoodsReceiptLine {
  id: string; purchaseOrderLineId: string; stockItemId: string; packageId: string
  destinationBinId: string; lotNo: string; productionDate?: string; expiryDate?: string
  deliveredQuantity: number; acceptedQuantity?: number; rejectedQuantity?: number; unitCost?: number
  qualityStatus: string; rejectionReason?: string; stockLotId?: string; inventoryTransactionId?: string
}
export interface GoodsReceipt {
  id: string; revision: number; stockSiteId: string; purchaseOrderId: string; supplierId: string
  receiptNo: string; requestCode: string; deliveryNoteNo?: string; status: string; receivedAt: string
  inspectedAt?: string; postedAt?: string; description?: string; lines: GoodsReceiptLine[]
}
export interface RequisitionAllocation { id: string; stockBinId: string; stockLotId: string; stockStatus: string; allocatedQuantity: number; issuedQuantity: number; status: string }
export interface RequisitionLine { id: string; stockItemId: string; requestedQuantity: number; approvedQuantity?: number; issuedQuantity: number; baseUnitCode: string; lineStatus: string; description?: string; allocations: RequisitionAllocation[] }
export interface Requisition { id: string; revision: number; sourceSiteId: string; requestingDepartmentId: string; destinationSiteId?: string; requisitionNo: string; status: string; requestedAt: string; requestedBy?: string; approvedAt?: string; pickedAt?: string; issuedAt?: string; reason?: string; description?: string; inventoryTransactionId?: string; lines: RequisitionLine[] }
export interface TransferAllocation { id: string; sourceBinId: string; destinationBinId?: string; stockLotId: string; stockStatus: string; dispatchedQuantity: number; receivedQuantity: number; damagedQuantity: number; status: string }
export interface TransferLine {
  id: string; sourceStockItemId: string; destinationStockItemId: string
  requestedQuantity: number; requestedOperationQuantity: number; operationUnitCode: string
  baseQuantityFactor: number; approvedQuantity?: number; dispatchedQuantity: number
  receivedQuantity: number; damagedQuantity: number; baseUnitCode: string
  lineStatus: string; discrepancyReason?: string; allocations: TransferAllocation[]
}
export interface StockTransfer { id: string; revision: number; sourceSiteId: string; destinationSiteId: string; transferNo: string; status: string; requestedAt: string; reason?: string; outboundTransactionId?: string; inboundTransactionId?: string; lines: TransferLine[] }
export interface CountLine { id: string; stockBinId: string; stockItemId: string; stockLotId: string; stockStatus: string; bookQuantity: number; countedQuantity?: number; varianceQuantity?: number; countResult?: string; varianceReason?: string }
export interface StockCount { id: string; revision: number; stockSiteId: string; stockBinId?: string; countNo: string; countType: string; status: string; snapshotAt: string; inventoryTransactionId?: string; lines: CountLine[] }
export type TraceCodeStatus = 'PENDING_RECEIPT' | 'AVAILABLE' | 'OPENED' | 'PARTIALLY_ISSUED'
  | 'RESERVED' | 'IN_TRANSIT' | 'ISSUED'
  | 'RETURNED' | 'QUARANTINED' | 'DAMAGED' | 'RECALLED' | 'VOID'
export interface InventoryTraceCode {
  id: string; revision: number; stockSiteId: string; stockBinId?: string; stockItemId: string
  stockLotId?: string; goodsReceiptLineId?: string; traceCode: string; productCode: string
  productName: string; lotNo: string; packageQuantity: number; baseQuantity: number; remainingBaseQuantity: number
  status: TraceCodeStatus; currentDocumentType?: string; currentDocumentId?: string
  currentDocumentNo?: string; receivedAt?: string; issuedAt?: string; updatedAt: string
}
export interface TraceCodeBatchScanResult {
  codes: InventoryTraceCode[]
  notFoundCodes: string[]
}
export interface InventoryTraceEvent {
  id: string; eventType: string; fromStatus?: string; toStatus: TraceCodeStatus
  fromSiteId?: string; toSiteId?: string; fromBinId?: string; toBinId?: string
  documentType: string; documentId: string; documentNo: string; reason?: string
  quantityDelta: number; balanceAfter: number
  occurredAt: string; occurredBy: string
}
export interface InventoryTraceDetail { code: InventoryTraceCode; events: InventoryTraceEvent[] }
export interface ReceiptTraceSummary {
  goodsReceiptId: string; requiredCount: number; registeredCount: number; complete: boolean
  lines: Array<{ goodsReceiptLineId: string; stockItemId: string; traceRequired: boolean
    acceptedQuantity?: number; registeredCount: number; complete: boolean }>
}

export interface InventoryOpenPackage {
  id: string; revision: number; stockSiteId: string; stockBinId: string; stockItemId: string
  stockLotId: string; packageId: string; traceCodeId?: string; requestCode: string
  sourceUnitCode: string; baseUnitCode: string; packageFactor: number; openedBaseQuantity: number
  remainingBaseQuantity: number; status: 'OPEN' | 'CONSUMED' | 'VOID'; openedAt: string
  openedBy: string; updatedAt: string; closedAt?: string
}

export interface InventorySplitEvent {
  id: string; openPackageId: string; eventType: 'OPEN' | 'CONSUME' | 'RETURN' | 'ADJUST' | 'VOID'
  sourceType: string; sourceId?: string; sourceNo: string; quantityDelta: number
  balanceAfter: number; occurredAt: string; occurredBy: string; description?: string
}

export interface InventoryReconciliationLine {
  id: string; stockBinId?: string; stockItemId?: string; stockLotId?: string; stockStatus?: string
  issueType: 'LEDGER_BALANCE' | 'RESERVATION_BALANCE' | 'OPEN_PACKAGE_BALANCE' | 'TRACE_BALANCE'
  expectedQuantity: number; actualQuantity: number; differenceQuantity: number
  severity: 'WARNING' | 'ERROR'; description: string
}

export interface InventoryReconciliationRun {
  id: string; stockSiteId: string; runNo: string; runType: 'MANUAL' | 'SCHEDULED'
  status: 'RUNNING' | 'PASSED' | 'ISSUES' | 'FAILED'; businessDate: string
  startedAt: string; completedAt?: string; runBy?: string; dimensionCount: number
  issueCount: number; lines: InventoryReconciliationLine[]
}

export interface InventoryPeriod {
  id: string; revision: number; stockSiteId: string; previousPeriodId?: string; closingRunId?: string
  periodCode: string; periodFrom: string; periodTo: string; status: 'OPEN' | 'CLOSING' | 'CLOSED'
  closedAt?: string; closedBy?: string; description?: string; createdAt: string; createdBy: string
}

export interface PeriodCloseTotal {
  valuationBasis: 'COST' | 'RETAIL'; currencyCode: string
  openingValue: number; movementAmount: number; valuationAdjustmentAmount: number
  roundingAdjustmentAmount: number; closingValue: number; balanceValue: number; valueDifference: number
}

export interface PeriodCloseRun {
  id: string; revision: number; stockSiteId: string; inventoryPeriodId: string; previousPeriodId?: string
  reconciliationRunId?: string; runNo: string; requestCode: string
  status: 'RUNNING' | 'VALIDATED' | 'POSTED' | 'FAILED'; dimensionCount: number; differenceCount: number
  startedAt: string; startedBy: string; validatedAt?: string; validatedBy?: string
  postedAt?: string; postedBy?: string; completedAt?: string; failureCode?: string; failureMessage?: string
  totals: PeriodCloseTotal[]
}

export interface PeriodCloseDifference {
  snapshotId: string; inventoryBalanceId: string; inventoryBalanceRevision: number
  stockBinId: string; stockItemId: string; stockLotId: string; lotNo: string; stockStatus: string; baseUnitCode: string
  openingQuantity: number; movementQuantity: number; closingQuantity: number
  balanceQuantity: number; quantityDifference: number; valuationBasis: string; currencyCode: string
  openingValue: number; movementAmount: number; valuationAdjustmentAmount: number
  roundingAdjustmentAmount: number; closingValue: number; balanceValue: number; valueDifference: number
}

export interface InventoryPriceAdjustmentDetail {
  id: string; inventoryBalanceId: string; inventoryBalanceRevision: number; stockBinId: string
  stockLotId: string; lotNo: string; stockStatus: string; quantitySnapshot: number
  unitPriceBefore: number; unitPriceAfter: number; valueBefore: number; valueAfter: number
  adjustmentAmount: number; roundingAmount: number; valuationEntryId?: string
}

export interface InventoryPriceAdjustmentLine {
  id: string; revision: number; lineNo: number; stockItemId: string; catalogItemId: string; packageId: string
  oldCatalogPriceId?: string; newCatalogPriceId?: string; oldSalePrice?: number; newSalePrice?: number
  oldUnitCost?: number; newUnitCost?: number; quantitySnapshot: number; valueBefore: number; valueAfter: number
  adjustmentAmount: number; roundingAmount: number; lineStatus: string; errorCode?: string; errorMessage?: string
  details: InventoryPriceAdjustmentDetail[]
}

export interface InventoryPriceAdjustment {
  id: string; revision: number; stockSiteId: string; inventoryPeriodId?: string; adjustmentNo: string
  requestCode: string; adjustmentType: 'SALE_PRICE' | 'COST_REVALUE'; priceType?: string; businessDate: string
  currencyCode: string; priceDocumentCode?: string; reason: string
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'POSTING' | 'POSTED' | 'CANCELLED'
  lineCount: number; totalValueBefore: number; totalValueAfter: number; totalAdjustmentAmount: number
  createdAt: string; createdBy: string; submittedAt?: string; submittedBy?: string
  approvedAt?: string; approvedBy?: string; postedAt?: string; postedBy?: string
  lines: InventoryPriceAdjustmentLine[]
}

export interface InventoryReservation {
  id: string
  revision: number
  stockSiteId: string
  stockBinId: string
  stockBinCode: string
  stockItemId: string
  stockLotId: string
  lotNo: string
  expiryDate?: string
  requestId: string
  reservationGroupCode: string
  reservationType: string
  status: string
  quantityReserved: number
  quantityConsumed: number
  baseUnitCode: string
  createdAt: string
  expiresAt?: string
  consumedAt?: string
  consumedBy?: string
  releasedAt?: string
  releasedBy?: string
  releaseReason?: string
}

export interface ReservationResult {
  taskId: string
  taskNo: string
  taskStatus: DispenseTaskStatus
  requiredBaseQuantity: number
  reservedBaseQuantity: number
  allocations: InventoryReservation[]
}

export interface PharmacyInboxItem {
  request: MedicationRequest
  taskId?: string
  taskNo?: string
  taskStatus?: DispenseTaskStatus
  stockItemId?: string
  selectedProductName?: string
  latestReviewResult?: PharmacyReviewResult
  residentName?: string
  healthRecordNo?: string
  residentPhone?: string
  dispensedAt?: string
  dispenserPractitionerId?: string
  plannedQuantity?: number
  dispensedQuantity?: number
  returnedQuantity?: number
  dispenseUnitCode?: string
  clinicalContext?: {
    encounterId: string
    encounterNo: string
    clinicianId?: string
    chiefComplaint?: string
    diagnoses: Array<{ code: string; display: string; type: 'PRIMARY' | 'SECONDARY' }>
  }
  prescriptionRequests?: MedicationRequest[]
}

export interface DispenseTaskLine {
  id: string
  requestId: string
  stockItemId: string
  packageId: string
  requestedQuantity: number
  plannedQuantity: number
  dispensedQuantity: number
  returnedQuantity: number
  dispenseUnitCode: string
  baseQuantityFactor: number
  split: boolean
  traceRequired: boolean
  status: string
  productCode: string
  productName: string
  packageSpec?: string
  itemAttributeSnapshot: Record<string, unknown>
  itemAttributeHash: string
}

export interface PharmacyReview {
  id: string
  reviewNo: string
  result: PharmacyReviewResult
  reasonCode?: string
  description?: string
  pharmacistPractitionerId: string
  reviewerUserId: string
  reviewerAssignmentId: string
  reviewedAt: string
}

export interface DispenseTask {
  id: string
  revision: number
  residentId: string
  encounterId: string
  stockSiteId: string
  taskNo: string
  taskType: string
  priority: string
  status: DispenseTaskStatus
  createdAt: string
  dueAt?: string
  pickedAt?: string
  assignedPractitionerId?: string
  pickedByUserId?: string
  pickedAssignmentId?: string
  pickDescription?: string
  description?: string
  lines: DispenseTaskLine[]
  reviews: PharmacyReview[]
}

export interface MedicationDispenseLine {
  id: string
  taskLineId: string
  originalDispenseLineId?: string
  sortOrder: number
  stockBinId: string
  stockBinCode: string
  stockItemId: string
  stockLotId: string
  lotNo: string
  expiryDate?: string
  inventoryTransactionLineId: string
  quantityDispensed: number
  dispenseUnitCode: string
  baseQuantityFactor: number
}

export interface MedicationDispense {
  id: string
  taskId: string
  residentId: string
  encounterId: string
  stockSiteId: string
  originalDispenseId?: string
  dispenseNo: string
  dispenseType: 'DISPENSE' | 'RETURN' | 'REDISPENSE'
  occurredAt: string
  dispenserPractitionerId: string
  dispenserUserId: string
  dispenserAssignmentId: string
  checkerPractitionerId?: string
  checkedAt?: string
  operationQuantity: number
  operationUnitCode: string
  description?: string
  lines: MedicationDispenseLine[]
}

export interface StockReturn {
  id: string
  originalDispenseId: string
  returnDispenseId: string
  returnNo: string
  status: string
  reasonCode: string
  confirmedAt: string
}

export interface DispenseTrace {
  taskId: string
  taskNo: string
  taskStatus: DispenseTaskStatus
  plannedQuantity: number
  dispensedQuantity: number
  returnedQuantity: number
  netDispensedQuantity: number
  unitCode: string
  events: MedicationDispense[]
  returns: StockReturn[]
}

export type WardDeliveryStatus = 'PENDING_DISPATCH' | 'IN_TRANSIT' | 'RECEIVED' | 'DISCREPANCY' | 'RESOLVED'
export interface WardDeliveryLine {
  id: string
  dispenseId: string
  residentId: string
  encounterId: string
  residentName: string
  medicationName: string
  expectedQuantity: number
  receivedQuantity: number
  unitCode: string
  status: 'PENDING' | 'MATCHED' | 'SHORTAGE' | 'REJECTED'
  discrepancyCode?: string
  discrepancyNote?: string
}
export interface WardDeliveryEvent {
  id: string
  eventType: string
  fromStatus?: string
  toStatus: string
  commandCode: string
  occurredAt: string
  occurredBy: string
  note?: string
}
export interface WardDelivery {
  id: string
  revision: number
  organizationId: string
  stockSiteId: string
  nursingUnitDepartmentId: string
  deliveryNo: string
  status: WardDeliveryStatus
  stockSiteName: string
  nursingUnitName: string
  createdAt: string
  createdBy: string
  dispatchedAt?: string
  dispatchedBy?: string
  dispatchNote?: string
  receivedAt?: string
  receivedBy?: string
  receiptNote?: string
  discrepancyNote?: string
  resolvedAt?: string
  resolvedBy?: string
  resolutionCode?: 'SUPPLEMENTED' | 'RETURNED_TO_PHARMACY' | 'ACCEPTED_VARIANCE'
  resolutionNote?: string
  lines: WardDeliveryLine[]
  events: WardDeliveryEvent[]
}

export type WardSupplyShiftCode = 'DAY' | 'EVENING' | 'NIGHT'
export type WardSupplyBatchStatus = 'OPEN' | 'READY' | 'IN_PROGRESS' | 'COMPLETED' | 'EXCEPTION' | 'CANCELLED'
export type WardSupplyLineStatus = 'PENDING_INTAKE' | 'PREPARING' | 'COVERED' | 'GAP' | 'ISSUED' | 'RETURN_PENDING' | 'EXCEPTION' | 'CANCELLED'

export interface WardSupplyBatchSummary {
  totalLineCount: number
  coveredLineCount: number
  gapLineCount: number
  issuedLineCount: number
  pendingReturnLineCount: number
  exceptionLineCount: number
}

export interface WardSupplyLine {
  id: string
  batchId: string
  requestId: string
  residentId: string
  encounterId: string
  residentName: string
  bedNo?: string
  catalogItemId?: string
  medicationId?: string
  medicationName: string
  scheduledAt: string
  requestedQuantity: number
  coveredQuantity: number
  issuedQuantity: number
  pendingReturnQuantity: number
  unitCode: string
  status: WardSupplyLineStatus
  stockItemId?: string
  dispenseTaskLineId?: string
  dispenseTaskId?: string
  dispenseTaskStatus?: DispenseTaskStatus
  exceptionMessage?: string
}

export interface WardSupplyBatch {
  id: string
  revision: number
  batchNo: string
  stockSiteId: string
  nursingUnitDepartmentId: string
  nursingUnitName: string
  businessDate: string
  shiftCode: WardSupplyShiftCode
  status: WardSupplyBatchStatus
  summary: WardSupplyBatchSummary
  lines: WardSupplyLine[]
  createdAt: string
  updatedAt: string
}

export interface WardSupplyBatchQuery {
  stockSiteId: string
  nursingUnitDepartmentId: string
  businessDate: string
  shiftCode: WardSupplyShiftCode
}

export interface CreateWardSupplyBatchInput extends WardSupplyBatchQuery {
  commandCode: string
}

export interface IntakeWardSupplyLineInput {
  stockItemId: string
  description?: string
}

export interface IntakeWardSupplyBatchInput {
  lines: Array<{
    lineId: string
    stockItemId: string
  }>
  description?: string
}

export interface ReviewReserveWardSupplyBatchInput {
  pharmacistPractitionerId: string
  reviewerAssignmentId: string
  expiryMinutes?: number
  description?: string
}

export interface CompletePickingWardSupplyBatchInput {
  pickerPractitionerId: string
  pickerAssignmentId: string
  description?: string
}

export interface DispenseDeliverWardSupplyBatchInput {
  dispenserPractitionerId: string
  dispenserAssignmentId: string
  checkerPractitionerId?: string
  checkerAssignmentId?: string
  description?: string
}

export interface WardSupplyFulfillment {
  batch: WardSupplyBatch
  deliveries: WardDelivery[]
}

export type WardMedicationReturnStatus = 'REQUESTED' | 'IN_TRANSIT' | 'RECEIVED'
export type WardMedicationReturnDisposition = 'RESTOCK' | 'QUARANTINE' | 'DESTROY'

export interface ReturnableWardMedicationLine {
  originalDispenseId: string
  originalDispenseLineId: string
  requestId: string
  residentId: string
  encounterId: string
  stockSiteId: string
  nursingUnitDepartmentId: string
  medicationName: string
  issuedQuantity: number
  returnedQuantity: number
  consumedQuantity: number
  pendingReturnQuantity: number
  returnableQuantity: number
  unitCode: string
  baseQuantityFactor: number
  baseUnitCode: string
}

export interface WardMedicationReturnLine {
  id: string
  requestId: string
  originalDispenseId: string
  originalDispenseLineId: string
  dispenseTaskLineId: string
  medicationName: string
  requestedQuantity: number
  unitCode: string
  requestedBaseQuantity: number
  baseUnitCode: string
  disposition?: WardMedicationReturnDisposition
  stockReturnId?: string
  returnDispenseId?: string
}

export interface WardMedicationReturnEvent {
  id: string
  eventType: 'CREATED' | 'HANDED_OVER' | 'RECEIVED'
  fromStatus?: WardMedicationReturnStatus
  toStatus: WardMedicationReturnStatus
  commandCode: string
  occurredAt: string
  occurredBy: string
  note?: string
}

export interface WardMedicationReturnRequest {
  id: string
  revision: number
  requestNo: string
  status: WardMedicationReturnStatus
  organizationId: string
  stockSiteId: string
  nursingUnitDepartmentId: string
  residentId: string
  encounterId: string
  requestedAt: string
  requestedBy: string
  requestNote?: string
  handedOverAt?: string
  handedOverBy?: string
  handoverNote?: string
  receivedAt?: string
  receivedBy?: string
  processorPractitionerId?: string
  processorAssignmentId?: string
  receiptNote?: string
  lines: WardMedicationReturnLine[]
  events: WardMedicationReturnEvent[]
}

export function createPharmacyApi(client: ApiClient) {
  return {
    sites: (organizationId: string) => client.request<StockSite[]>(
      `/api/pharmacy/stock-sites?organizationId=${encodeURIComponent(organizationId)}`,
    ),
    dispenseRoutes: (organizationId: string) => client.request<DispenseRoute[]>(
      `/api/pharmacy/dispense-routes?organizationId=${encodeURIComponent(organizationId)}`,
    ),
    createDispenseRoute: (input: DispenseRouteInput) => client.request<DispenseRoute>(
      '/api/pharmacy/dispense-routes', { method: 'POST', body: JSON.stringify(input) },
    ),
    updateDispenseRoute: (id: string, expectedRevision: number, input: DispenseRouteInput) =>
      client.request<DispenseRoute>(`/api/pharmacy/dispense-routes/${encodeURIComponent(id)}`, {
        method: 'PUT', body: JSON.stringify({ expectedRevision, ...input }),
      }),
    stockItems: (siteId: string) => client.request<StockItem[]>(
      `/api/pharmacy/stock-sites/${siteId}/stock-items`,
    ),
    stockBins: (siteId: string) => client.request<StockBin[]>(
      `/api/pharmacy/stock-sites/${siteId}/stock-bins`,
    ),
    createStockItem: (siteId: string, input: {
      catalogItemId: string
      packageId: string
      issuePolicy: 'FEFO' | 'FIFO' | 'MANUAL'
      negativeAllowed: boolean
      lotRequired: boolean
      traceRequired: boolean
      splitAllowed: boolean
      coldChain: boolean
      controlled: boolean
      controlLevel?: string
      highAlert: boolean
    }) => client.request<StockItem>(`/api/pharmacy/stock-sites/${siteId}/stock-items`, {
      method: 'POST', body: JSON.stringify(input),
    }),
    createStockItems: (siteId: string, items: Array<{
      catalogItemId: string
      packageId: string
      issuePolicy: 'FEFO' | 'FIFO' | 'MANUAL'
      negativeAllowed: boolean
      lotRequired: boolean
      traceRequired: boolean
      splitAllowed: boolean
      coldChain: boolean
      controlled: boolean
      controlLevel?: string
      highAlert: boolean
    }>) => client.request<StockItem[]>(`/api/pharmacy/stock-sites/${siteId}/stock-items/batch`, {
      method: 'POST', body: JSON.stringify({ items }),
    }),
    createStockBin: (siteId: string, input: {
      parentBinId?: string
      code: string
      name: string
      binType: 'ZONE' | 'RACK' | 'BIN' | 'COUNTER' | 'TRANSIT'
      stockDefault: 'AVAILABLE' | 'PENDING' | 'QUARANTINE' | 'DAMAGED' | 'EXPIRED'
      receiveAllowed: boolean
      pickAllowed: boolean
      countAllowed: boolean
      sortOrder: number
    }) => client.request<StockBin>(`/api/pharmacy/stock-sites/${siteId}/stock-bins`, {
      method: 'POST', body: JSON.stringify(input),
    }),
    lots: (stockItemId: string) => client.request<StockLot[]>(
      `/api/pharmacy/stock-items/${stockItemId}/lots`,
    ),
    createLot: (stockItemId: string, input: {
      lotNo: string
      productionDate?: string
      expiryDate?: string
      approvalCodeSnapshot?: string
      manufacturerNameSnapshot?: string
      qualityStatus: 'PENDING' | 'QUALIFIED' | 'QUARANTINE' | 'REJECTED' | 'RECALLED'
    }) => client.request<StockLot>(`/api/pharmacy/stock-items/${stockItemId}/lots`, {
      method: 'POST', body: JSON.stringify(input),
    }),
    balances: (stockSiteId: string, stockItemId = '') => client.request<InventoryBalance[]>(
      `/api/pharmacy/inventory/balances?stockSiteId=${encodeURIComponent(stockSiteId)}`
        + (stockItemId ? `&stockItemId=${encodeURIComponent(stockItemId)}` : ''),
    ),
    transactions: (stockSiteId: string, options: {
      periodCode?: string; stockItemId?: string; allPeriods?: boolean
    } = {}) => {
      const params = new URLSearchParams({ stockSiteId })
      if (options.periodCode) params.set('periodCode', options.periodCode)
      if (options.stockItemId) params.set('stockItemId', options.stockItemId)
      if (options.allPeriods) params.set('allPeriods', 'true')
      return client.request<InventoryTransaction[]>(`/api/pharmacy/inventory/transactions?${params}`)
    },
    receive: (input: {
      requestCode: string
      sourceCode: string
      stockItemId: string
      stockBinId: string
      stockLotId: string
      operationQuantity: number
      unitCost?: number
      occurredAt: string
      description?: string
    }) => client.request<InventoryTransaction>('/api/pharmacy/inventory/receipts', {
      method: 'POST', body: JSON.stringify(input),
    }),
    suppliers: (organizationId?: string, query = '', status = '') => {
      const params = new URLSearchParams()
      if (organizationId) params.set('organizationId', organizationId)
      if (query) params.set('query', query)
      if (status) params.set('status', status)
      const suffix = params.size ? `?${params.toString()}` : ''
      return client.request<Supplier[]>(`/api/pharmacy/suppliers${suffix}`)
    },
    createSupplier: (input: SupplierInput) => client.request<Supplier>('/api/pharmacy/suppliers', { method: 'POST', body: JSON.stringify(input) }),
    updateSupplier: (id: string, revision: number, input: SupplierInput & { status: Supplier['status']; validFrom: string }) =>
      client.request<Supplier>(`/api/pharmacy/suppliers/${id}`, {
        method: 'PUT', body: JSON.stringify({ ...input, expectedRevision: revision }),
      }),
    supplierStatus: (id: string, revision: number, status: Supplier['status']) =>
      client.request<Supplier>(`/api/pharmacy/suppliers/${id}/status`, {
        method: 'POST', body: JSON.stringify({ expectedRevision: revision, status }),
      }),
    addSupplierItem: (supplierId: string, input: { catalogItemId: string; packageId: string; agreementPrice: number; taxRate?: number }) => client.request(`/api/pharmacy/suppliers/${supplierId}/supply-items`, { method: 'POST', body: JSON.stringify(input) }),
    supplyItems: (supplierId: string) => client.request<SupplierSupplyItem[]>(`/api/pharmacy/suppliers/${supplierId}/supply-items`),
    purchaseOrders: (siteId: string) => client.request<PurchaseOrder[]>(`/api/pharmacy/purchase-orders?stockSiteId=${encodeURIComponent(siteId)}`),
    createPurchaseOrder: (input: { stockSiteId: string; supplierId: string; requestCode: string; expectedDate?: string; description?: string; lines: Array<{ stockItemId: string; packageId: string; orderedQuantity: number; unitPrice: number; taxRate?: number }> }) => client.request<PurchaseOrder>('/api/pharmacy/purchase-orders', { method: 'POST', body: JSON.stringify(input) }),
    submitPurchaseOrder: (id: string) => client.request<PurchaseOrder>(`/api/pharmacy/purchase-orders/${id}/submit`, { method: 'POST' }),
    approvePurchaseOrder: (id: string, reason?: string) => client.request<PurchaseOrder>(`/api/pharmacy/purchase-orders/${id}/approve`, { method: 'POST', body: JSON.stringify({ reason }) }),
    goodsReceipts: (siteId: string) => client.request<GoodsReceipt[]>(`/api/pharmacy/goods-receipts?stockSiteId=${encodeURIComponent(siteId)}`),
    createGoodsReceipt: (input: { purchaseOrderId: string; receiptNo?: string; requestCode: string; deliveryNoteNo?: string; receivedAt?: string; description?: string; lines: Array<{ purchaseOrderLineId: string; destinationBinId: string; lotNo: string; productionDate?: string; expiryDate?: string; deliveredQuantity: number; unitCost?: number }> }) => client.request<GoodsReceipt>('/api/pharmacy/goods-receipts', { method: 'POST', body: JSON.stringify(input) }),
    inspectGoodsReceipt: (id: string, lines: Array<{ goodsReceiptLineId: string; acceptedQuantity: number; rejectedQuantity: number; rejectionReason?: string }>) => client.request<GoodsReceipt>(`/api/pharmacy/goods-receipts/${id}/inspect`, { method: 'POST', body: JSON.stringify({ lines }) }),
    postGoodsReceipt: (id: string) => client.request<GoodsReceipt>(`/api/pharmacy/goods-receipts/${id}/post`, { method: 'POST' }),
    directGoodsReceipt: (input: {
      stockSiteId: string
      supplierId: string
      orderNo?: string
      receiptNo?: string
      requestCode: string
      deliveryNoteNo?: string
      receivedAt?: string
      description?: string
      lines: Array<{
        stockItemId: string
        packageId: string
        destinationBinId: string
        lotNo: string
        productionDate?: string
        expiryDate?: string
        quantity: number
        unitPrice: number
        taxRate?: number
        description?: string
      }>
    }) => client.request<GoodsReceipt>('/api/pharmacy/direct-goods-receipts', { method: 'POST', body: JSON.stringify(input) }),
    registerReceiptTraceCodes: (id: string, lines: Array<{ goodsReceiptLineId: string; traceCodes: string[] }>) =>
      client.request<ReceiptTraceSummary>(`/api/pharmacy/goods-receipts/${id}/trace-codes`, {
        method: 'POST', body: JSON.stringify({ lines }),
      }),
    receiptTraceSummary: (id: string) => client.request<ReceiptTraceSummary>(
      `/api/pharmacy/goods-receipts/${id}/trace-codes/summary`,
    ),
    traceCodes: (stockSiteId: string, status = '', query = '') => client.request<InventoryTraceCode[]>(
      `/api/pharmacy/inventory/trace-codes?stockSiteId=${encodeURIComponent(stockSiteId)}`
        + (status ? `&status=${encodeURIComponent(status)}` : '')
        + (query ? `&query=${encodeURIComponent(query)}` : ''),
    ),
    traceCode: (id: string) => client.request<InventoryTraceDetail>(`/api/pharmacy/inventory/trace-codes/${id}`),
    scanTraceCode: (stockSiteId: string, traceCode: string) => client.request<InventoryTraceCode>(
      `/api/pharmacy/dispense/trace-code?stockSiteId=${encodeURIComponent(stockSiteId)}`
        + `&traceCode=${encodeURIComponent(traceCode)}`,
    ),
    scanTraceCodes: (stockSiteId: string, traceCodes: string[]) => client.request<TraceCodeBatchScanResult>(
      '/api/pharmacy/dispense/trace-codes/scan', {
        method: 'POST', body: JSON.stringify({ stockSiteId, traceCodes }),
      },
    ),
    openPackages: (stockSiteId: string) => client.request<InventoryOpenPackage[]>(
      `/api/pharmacy/inventory/open-packages?stockSiteId=${encodeURIComponent(stockSiteId)}`,
    ),
    openPackageEvents: (id: string) => client.request<InventorySplitEvent[]>(
      `/api/pharmacy/inventory/open-packages/${id}/events`,
    ),
    openPackage: (input: {
      requestCode: string; stockSiteId: string; stockBinId: string; stockItemId: string
      stockLotId: string; occurredAt?: string; description?: string
    }) => client.request<InventoryOpenPackage>('/api/pharmacy/inventory/open-packages', {
      method: 'POST', body: JSON.stringify(input),
    }),
    latestInventoryReconciliation: (stockSiteId: string) => client.request<InventoryReconciliationRun | null>(
      `/api/pharmacy/inventory/reconciliations/latest?stockSiteId=${encodeURIComponent(stockSiteId)}`,
    ),
    reconcileInventory: (stockSiteId: string) => client.request<InventoryReconciliationRun>(
      `/api/pharmacy/inventory/reconciliations?stockSiteId=${encodeURIComponent(stockSiteId)}`, { method: 'POST' },
    ),
    inventoryPeriods: (stockSiteId: string) => client.request<InventoryPeriod[]>(
      `/api/pharmacy/inventory-periods?stockSiteId=${encodeURIComponent(stockSiteId)}`,
    ),
    createInventoryPeriod: (stockSiteId: string, yearMonth: string) => client.request<InventoryPeriod>(
      '/api/pharmacy/inventory-periods', {
        method: 'POST', body: JSON.stringify({ stockSiteId, yearMonth }),
      },
    ),
    periodCloseRuns: (periodId: string) => client.request<PeriodCloseRun[]>(
      `/api/pharmacy/inventory-periods/${periodId}/close-runs`,
    ),
    preparePeriodClose: (periodId: string, requestCode: string, currencyCode = 'CNY') =>
      client.request<PeriodCloseRun>(`/api/pharmacy/inventory-periods/${periodId}/close-runs`, {
        method: 'POST', body: JSON.stringify({ requestCode, currencyCode }),
      }),
    periodCloseDifferences: (closeRunId: string) => client.request<PeriodCloseDifference[]>(
      `/api/pharmacy/inventory-periods/close-runs/${closeRunId}/differences`,
    ),
    postPeriodClose: (closeRunId: string) => client.request<PeriodCloseRun>(
      `/api/pharmacy/inventory-periods/close-runs/${closeRunId}/post`, { method: 'POST' },
    ),
    priceAdjustments: (stockSiteId: string) => client.request<InventoryPriceAdjustment[]>(
      `/api/pharmacy/inventory-price-adjustments?stockSiteId=${encodeURIComponent(stockSiteId)}`,
    ),
    priceAdjustment: (id: string) => client.request<InventoryPriceAdjustment>(
      `/api/pharmacy/inventory-price-adjustments/${id}`,
    ),
    createPriceAdjustment: (input: {
      stockSiteId: string; requestCode: string; adjustmentType: 'SALE_PRICE' | 'COST_REVALUE'
      priceType?: string; businessDate: string; currencyCode?: string; priceDocumentCode?: string
      reason: string; lines: Array<{ stockItemId: string; newSalePrice?: number; newUnitCost?: number }>
    }) => client.request<InventoryPriceAdjustment>('/api/pharmacy/inventory-price-adjustments', {
      method: 'POST', body: JSON.stringify(input),
    }),
    submitPriceAdjustment: (id: string) => client.request<InventoryPriceAdjustment>(
      `/api/pharmacy/inventory-price-adjustments/${id}/submit`, { method: 'POST' },
    ),
    approvePriceAdjustment: (id: string) => client.request<InventoryPriceAdjustment>(
      `/api/pharmacy/inventory-price-adjustments/${id}/approve`, { method: 'POST' },
    ),
    postPriceAdjustment: (id: string) => client.request<InventoryPriceAdjustment>(
      `/api/pharmacy/inventory-price-adjustments/${id}/post`, { method: 'POST' },
    ),
    cancelPriceAdjustment: (id: string) => client.request<InventoryPriceAdjustment>(
      `/api/pharmacy/inventory-price-adjustments/${id}/cancel`, { method: 'POST' },
    ),
    requisitions: (siteId: string) => client.request<Requisition[]>(`/api/pharmacy/stock-requisitions?sourceSiteId=${encodeURIComponent(siteId)}`),
    createRequisition: (input: { sourceSiteId: string; requestingDepartmentId?: string; requestCode: string; requestedAt?: string; reason?: string; description?: string; lines: Array<{ stockItemId: string; requestedQuantity: number; description?: string }> }) => client.request<Requisition>('/api/pharmacy/stock-requisitions', { method: 'POST', body: JSON.stringify(input) }),
    submitRequisition: (id: string) => client.request<Requisition>(`/api/pharmacy/stock-requisitions/${id}/submit`, { method: 'POST' }),
    approveRequisition: (id: string, lines: Array<{ requisitionLineId: string; approvedQuantity: number }>, reason?: string) => client.request<Requisition>(`/api/pharmacy/stock-requisitions/${id}/approve`, { method: 'POST', body: JSON.stringify({ lines, reason }) }),
    pickRequisition: (id: string) => client.request<Requisition>(`/api/pharmacy/stock-requisitions/${id}/pick`, { method: 'POST' }),
    issueRequisition: (id: string) => client.request<Requisition>(`/api/pharmacy/stock-requisitions/${id}/issue`, { method: 'POST' }),
    transfers: (siteId: string, role: 'SOURCE' | 'DESTINATION' = 'SOURCE') => client.request<StockTransfer[]>(`/api/pharmacy/stock-transfers?stockSiteId=${encodeURIComponent(siteId)}&role=${role}`),
    createTransfer: (input: { sourceSiteId: string; destinationSiteId: string; requestCode: string; reason?: string; lines: Array<{ sourceStockItemId: string; destinationStockItemId: string; requestedQuantity: number; operationUnitCode?: string; baseQuantityFactor?: number }> }) => client.request<StockTransfer>('/api/pharmacy/stock-transfers', { method: 'POST', body: JSON.stringify(input) }),
    submitTransfer: (id: string) => client.request<StockTransfer>(`/api/pharmacy/stock-transfers/${id}/submit`, { method: 'POST' }),
    approveTransfer: (id: string, lines: Array<{ transferLineId: string; approvedQuantity: number }>) => client.request<StockTransfer>(`/api/pharmacy/stock-transfers/${id}/approve`, { method: 'POST', body: JSON.stringify({ lines }) }),
    pickTransfer: (id: string) => client.request<StockTransfer>(`/api/pharmacy/stock-transfers/${id}/pick`, { method: 'POST' }),
    dispatchTransfer: (id: string) => client.request<StockTransfer>(`/api/pharmacy/stock-transfers/${id}/dispatch`, { method: 'POST' }),
    receiveTransfer: (id: string, input: { reason?: string; allocations: Array<{ transferAllocationId: string; destinationBinId: string; receivedQuantity: number; damagedQuantity: number; discrepancyReason?: string }> }) => client.request<StockTransfer>(`/api/pharmacy/stock-transfers/${id}/receive`, { method: 'POST', body: JSON.stringify(input) }),
    stockCounts: (siteId: string) => client.request<StockCount[]>(`/api/pharmacy/stock-counts?stockSiteId=${encodeURIComponent(siteId)}`),
    createStockCount: (input: { stockSiteId: string; stockBinId?: string; requestCode: string; countType: 'FULL' | 'BIN' | 'ITEM' | 'CYCLE'; stockItemIds?: string[]; reason?: string }) => client.request<StockCount>('/api/pharmacy/stock-counts', { method: 'POST', body: JSON.stringify(input) }),
    startStockCount: (id: string) => client.request<StockCount>(`/api/pharmacy/stock-counts/${id}/start`, { method: 'POST' }),
    recordStockCount: (id: string, lines: Array<{ countLineId: string; countedQuantity: number; varianceReason?: string }>) => client.request<StockCount>(`/api/pharmacy/stock-counts/${id}/records`, { method: 'POST', body: JSON.stringify({ lines }) }),
    submitStockCount: (id: string) => client.request<StockCount>(`/api/pharmacy/stock-counts/${id}/submit`, { method: 'POST' }),
    approveStockCount: (id: string, reason?: string) => client.request<StockCount>(`/api/pharmacy/stock-counts/${id}/approve`, { method: 'POST', body: JSON.stringify({ reason }) }),
    postStockCount: (id: string) => client.request<StockCount>(`/api/pharmacy/stock-counts/${id}/post`, { method: 'POST' }),
    inbox: (organizationId: string) => client.request<PharmacyInboxItem[]>(
      `/api/pharmacy/inbox?organizationId=${encodeURIComponent(organizationId)}`,
    ),
    prescriptionReviewMode: (organizationId: string) => client.request<PrescriptionReviewModeView>(
      `/api/pharmacy/prescription-review-mode?organizationId=${encodeURIComponent(organizationId)}`,
    ),
    intake: (requestId: string, stockItemId: string, description?: string) => client.request<DispenseTask>(
      `/api/pharmacy/requests/${requestId}/intake`, {
        method: 'POST', body: JSON.stringify({ stockItemId, description }),
      },
    ),
    tasks: (stockSiteId: string, status = '') => client.request<DispenseTask[]>(
      `/api/pharmacy/dispense-tasks?stockSiteId=${encodeURIComponent(stockSiteId)}${status
        ? `&status=${encodeURIComponent(status)}` : ''}`,
    ),
    task: (taskId: string) => client.request<DispenseTask>(`/api/pharmacy/dispense-tasks/${taskId}`),
    review: (taskId: string, input: {
      result: PharmacyReviewResult
      reasonCode?: string
      description?: string
      pharmacistPractitionerId: string
      reviewerAssignmentId: string
    }) => client.request<DispenseTask>(`/api/pharmacy/dispense-tasks/${taskId}/reviews`, {
      method: 'POST', body: JSON.stringify(input),
    }),
    reservations: (taskId: string) => client.request<ReservationResult>(
      `/api/pharmacy/dispense-tasks/${taskId}/reservations`,
    ),
    reserve: (taskId: string, expiryMinutes = 30) => client.request<ReservationResult>(
      `/api/pharmacy/dispense-tasks/${taskId}/reservations`, {
        method: 'POST', body: JSON.stringify({ expiryMinutes }),
      },
    ),
    releaseReservation: (taskId: string, reason: string) => client.request<ReservationResult>(
      `/api/pharmacy/dispense-tasks/${taskId}/reservations/release`, {
        method: 'POST', body: JSON.stringify({ reason }),
      },
    ),
    completePicking: (taskId: string, input: {
      pickerPractitionerId: string
      pickerAssignmentId: string
      description?: string
    }) => client.request<{ taskId: string; taskStatus: DispenseTaskStatus }>(
      `/api/pharmacy/dispense-tasks/${taskId}/picking/complete`, {
        method: 'POST', body: JSON.stringify(input),
      },
    ),
    dispense: (taskId: string, input: {
      requestCode: string
      operationQuantity: number
      dispenserPractitionerId: string
      dispenserAssignmentId: string
      description?: string
      traceCodeIds?: string[]
    }) => client.request<MedicationDispense>(`/api/pharmacy/dispense-tasks/${taskId}/dispenses`, {
      method: 'POST', body: JSON.stringify(input),
    }),
    trace: (taskId: string) => client.request<DispenseTrace>(
      `/api/pharmacy/dispense-tasks/${taskId}/trace`,
    ),
    wardSupplyBatches: (options: WardSupplyBatchQuery) => {
      const params = new URLSearchParams({
        stockSiteId: options.stockSiteId,
        nursingUnitDepartmentId: options.nursingUnitDepartmentId,
        businessDate: options.businessDate,
        shiftCode: options.shiftCode,
      })
      return client.request<WardSupplyBatch[]>(`/api/pharmacy/ward-supply-batches?${params}`)
    },
    createWardSupplyBatch: (input: CreateWardSupplyBatchInput) => client.request<WardSupplyBatch>(
      '/api/pharmacy/ward-supply-batches', { method: 'POST', body: JSON.stringify(input) },
    ),
    wardSupplyBatch: (id: string) => client.request<WardSupplyBatch>(
      `/api/pharmacy/ward-supply-batches/${encodeURIComponent(id)}`,
    ),
    intakeWardSupplyBatch: (batchId: string, input: IntakeWardSupplyBatchInput) => client.request<WardSupplyBatch>(
      `/api/pharmacy/ward-supply-batches/${encodeURIComponent(batchId)}/intake`, {
        method: 'POST', body: JSON.stringify(input),
      },
    ),
    reviewAndReserveWardSupplyBatch: (batchId: string, input: ReviewReserveWardSupplyBatchInput) =>
      client.request<WardSupplyBatch>(
        `/api/pharmacy/ward-supply-batches/${encodeURIComponent(batchId)}/review-reserve`, {
          method: 'POST', body: JSON.stringify(input),
        },
      ),
    completePickingWardSupplyBatch: (batchId: string, input: CompletePickingWardSupplyBatchInput) =>
      client.request<WardSupplyBatch>(
        `/api/pharmacy/ward-supply-batches/${encodeURIComponent(batchId)}/picking/complete`, {
          method: 'POST', body: JSON.stringify(input),
        },
      ),
    dispenseDeliverWardSupplyBatch: (batchId: string, input: DispenseDeliverWardSupplyBatchInput) =>
      client.request<WardSupplyFulfillment>(
        `/api/pharmacy/ward-supply-batches/${encodeURIComponent(batchId)}/dispense-deliveries`, {
          method: 'POST', body: JSON.stringify(input),
        },
      ),
    intakeWardSupplyLine: (lineId: string, input: IntakeWardSupplyLineInput) => client.request<WardSupplyLine>(
      `/api/pharmacy/ward-supply-lines/${encodeURIComponent(lineId)}/intake`, {
        method: 'POST', body: JSON.stringify(input),
      },
    ),
    wardDeliveries: (options: { status?: WardDeliveryStatus | 'OPEN' | 'ALL'
      nursingUnitDepartmentId?: string; encounterId?: string } = {}) => {
      const params = new URLSearchParams({ status: options.status ?? 'OPEN' })
      if (options.nursingUnitDepartmentId) params.set('nursingUnitDepartmentId', options.nursingUnitDepartmentId)
      if (options.encounterId) params.set('encounterId', options.encounterId)
      return client.request<WardDelivery[]>(`/api/pharmacy/ward-deliveries?${params}`)
    },
    wardDelivery: (id: string) => client.request<WardDelivery>(`/api/pharmacy/ward-deliveries/${id}`),
    createWardDelivery: (input: { deliveryNo: string; dispenseIds: string[]; note?: string }) =>
      client.request<WardDelivery>('/api/pharmacy/ward-deliveries', {
        method: 'POST', body: JSON.stringify(input),
      }),
    dispatchWardDelivery: (id: string, input: { expectedRevision: number; commandCode: string; note?: string }) =>
      client.request<WardDelivery>(`/api/pharmacy/ward-deliveries/${id}/dispatch`, {
        method: 'POST', body: JSON.stringify(input),
      }),
    receiveWardDelivery: (id: string, input: { expectedRevision: number; commandCode: string; note?: string
      lines: Array<{ lineId: string; receivedQuantity: number
        discrepancyCode?: 'SHORTAGE' | 'DAMAGED' | 'WRONG_ITEM' | 'OTHER'; discrepancyNote?: string }> }) =>
      client.request<WardDelivery>(`/api/pharmacy/ward-deliveries/${id}/receive`, {
        method: 'POST', body: JSON.stringify(input),
      }),
    resolveWardDelivery: (id: string, input: { expectedRevision: number; commandCode: string
      resolutionCode: 'SUPPLEMENTED' | 'RETURNED_TO_PHARMACY' | 'ACCEPTED_VARIANCE'; note: string }) =>
      client.request<WardDelivery>(`/api/pharmacy/ward-deliveries/${id}/resolve`, {
        method: 'POST', body: JSON.stringify(input),
      }),
    returnableWardMedications: (encounterId: string) => client.request<ReturnableWardMedicationLine[]>(
      `/api/pharmacy/ward-medication-returns/returnable?encounterId=${encodeURIComponent(encounterId)}`,
    ),
    wardMedicationReturns: (options: { status?: WardMedicationReturnStatus | 'ALL'; encounterId?: string } = {}) => {
      const params = new URLSearchParams({ status: options.status ?? 'ALL' })
      if (options.encounterId) params.set('encounterId', options.encounterId)
      return client.request<WardMedicationReturnRequest[]>(`/api/pharmacy/ward-medication-returns?${params}`)
    },
    wardMedicationReturn: (id: string) => client.request<WardMedicationReturnRequest>(
      `/api/pharmacy/ward-medication-returns/${id}`,
    ),
    createWardMedicationReturn: (input: { encounterId: string; commandCode: string; note?: string
      lines: Array<{ originalDispenseLineId: string; quantity: number }> }) =>
      client.request<WardMedicationReturnRequest>('/api/pharmacy/ward-medication-returns', {
        method: 'POST', body: JSON.stringify(input),
      }),
    handOverWardMedicationReturn: (id: string, input: { expectedRevision: number; commandCode: string; note?: string }) =>
      client.request<WardMedicationReturnRequest>(`/api/pharmacy/ward-medication-returns/${id}/handover`, {
        method: 'POST', body: JSON.stringify(input),
      }),
    receiveWardMedicationReturn: (id: string, input: { expectedRevision: number; commandCode: string
      processorPractitionerId: string; processorAssignmentId: string; note?: string
      lines: Array<{ returnRequestLineId: string; disposition: WardMedicationReturnDisposition
        exceptionDescription?: string }> }) =>
      client.request<WardMedicationReturnRequest>(`/api/pharmacy/ward-medication-returns/${id}/receive`, {
        method: 'POST', body: JSON.stringify(input),
      }),
    returnMedication: (dispenseId: string, input: {
      returnNo: string
      reasonCode: string
      processorPractitionerId: string
      processorAssignmentId: string
      description?: string
      lines: Array<{ originalDispenseLineId: string; quantity: number; disposition: string }>
    }) => client.request<StockReturn>(`/api/pharmacy/dispenses/${dispenseId}/returns`, {
      method: 'POST', body: JSON.stringify(input),
    }),
  }
}
