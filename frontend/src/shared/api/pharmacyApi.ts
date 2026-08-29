import type { MedicationRequest } from './encountersApi'
import type { ApiClient } from './httpClient'

export type StockSiteType = 'WAREHOUSE' | 'PHARMACY' | 'DEPARTMENT_STORE' | 'VIRTUAL'
export type PharmacyServiceScope = 'OUTPATIENT' | 'INPATIENT' | 'EMERGENCY' | 'COMMUNITY' | 'MIXED'
export type DispenseTaskStatus = 'PENDING_REVIEW' | 'INTERVENTION' | 'READY_TO_PICK' | 'PICKING'
  | 'READY_TO_DISPENSE' | 'PARTIALLY_DISPENSED' | 'COMPLETED' | 'PARTIALLY_RETURNED'
  | 'RETURNED' | 'REJECTED' | 'CANCELLED'
export type PharmacyReviewResult = 'PASS' | 'REJECT' | 'INTERVENE' | 'OVERRIDE'

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

export interface Supplier { id: string; revision: number; organizationId: string; code: string; name: string; status: string; licenseValidTo?: string }
export interface PurchaseOrderLine { id: string; stockItemId: string; packageId: string; orderedQuantity: number; receivedQuantity: number; remainingQuantity: number; unitPrice: number; lineStatus: string }
export interface PurchaseOrder { id: string; revision: number; stockSiteId: string; supplierId: string; orderNo: string; requestCode: string; status: string; orderDate: string; expectedDate?: string; description?: string; lines: PurchaseOrderLine[] }
export interface GoodsReceiptLine { id: string; purchaseOrderLineId: string; stockItemId: string; destinationBinId: string; lotNo: string; deliveredQuantity: number; acceptedQuantity?: number; rejectedQuantity?: number; qualityStatus: string; rejectionReason?: string }
export interface GoodsReceipt { id: string; revision: number; purchaseOrderId: string; receiptNo: string; status: string; receivedAt: string; lines: GoodsReceiptLine[] }
export interface RequisitionAllocation { id: string; stockBinId: string; stockLotId: string; allocatedQuantity: number; status: string }
export interface RequisitionLine { id: string; stockItemId: string; requestedQuantity: number; approvedQuantity?: number; issuedQuantity: number; baseUnitCode: string; lineStatus: string; allocations: RequisitionAllocation[] }
export interface Requisition { id: string; revision: number; sourceSiteId: string; requestingDepartmentId: string; requisitionNo: string; status: string; requestedAt: string; reason?: string; inventoryTransactionId?: string; lines: RequisitionLine[] }
export interface TransferAllocation { id: string; sourceBinId: string; destinationBinId?: string; stockLotId: string; dispatchedQuantity: number; receivedQuantity: number; damagedQuantity: number; status: string }
export interface TransferLine { id: string; sourceStockItemId: string; destinationStockItemId: string; requestedQuantity: number; approvedQuantity?: number; dispatchedQuantity: number; receivedQuantity: number; damagedQuantity: number; baseUnitCode: string; lineStatus: string; allocations: TransferAllocation[] }
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

export function createPharmacyApi(client: ApiClient) {
  return {
    sites: (organizationId: string) => client.request<StockSite[]>(
      `/api/pharmacy/stock-sites?organizationId=${encodeURIComponent(organizationId)}`,
    ),
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
    balances: (stockSiteId: string, stockItemId: string) => client.request<InventoryBalance[]>(
      `/api/pharmacy/inventory/balances?stockSiteId=${encodeURIComponent(stockSiteId)}`
        + `&stockItemId=${encodeURIComponent(stockItemId)}`,
    ),
    transactions: (stockSiteId: string, periodCode = '') => client.request<InventoryTransaction[]>(
      `/api/pharmacy/inventory/transactions?stockSiteId=${encodeURIComponent(stockSiteId)}`
        + (periodCode ? `&periodCode=${encodeURIComponent(periodCode)}` : ''),
    ),
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
    suppliers: (organizationId?: string) => client.request<Supplier[]>(`/api/pharmacy/suppliers${organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : ''}`),
    createSupplier: (input: { organizationId?: string; code: string; name: string; licenseNo?: string; licenseValidTo?: string; contactName?: string; contactPhone?: string }) => client.request<Supplier>('/api/pharmacy/suppliers', { method: 'POST', body: JSON.stringify(input) }),
    addSupplierItem: (supplierId: string, input: { catalogItemId: string; packageId: string; agreementPrice: number; taxRate?: number }) => client.request(`/api/pharmacy/suppliers/${supplierId}/supply-items`, { method: 'POST', body: JSON.stringify(input) }),
    purchaseOrders: (siteId: string) => client.request<PurchaseOrder[]>(`/api/pharmacy/purchase-orders?stockSiteId=${encodeURIComponent(siteId)}`),
    createPurchaseOrder: (input: { stockSiteId: string; supplierId: string; requestCode: string; expectedDate?: string; description?: string; lines: Array<{ stockItemId: string; packageId: string; orderedQuantity: number; unitPrice: number; taxRate?: number }> }) => client.request<PurchaseOrder>('/api/pharmacy/purchase-orders', { method: 'POST', body: JSON.stringify(input) }),
    submitPurchaseOrder: (id: string) => client.request<PurchaseOrder>(`/api/pharmacy/purchase-orders/${id}/submit`, { method: 'POST' }),
    approvePurchaseOrder: (id: string, reason?: string) => client.request<PurchaseOrder>(`/api/pharmacy/purchase-orders/${id}/approve`, { method: 'POST', body: JSON.stringify({ reason }) }),
    goodsReceipts: (siteId: string) => client.request<GoodsReceipt[]>(`/api/pharmacy/goods-receipts?stockSiteId=${encodeURIComponent(siteId)}`),
    createGoodsReceipt: (input: { purchaseOrderId: string; requestCode: string; deliveryNoteNo?: string; lines: Array<{ purchaseOrderLineId: string; destinationBinId: string; lotNo: string; productionDate?: string; expiryDate?: string; deliveredQuantity: number; unitCost?: number }> }) => client.request<GoodsReceipt>('/api/pharmacy/goods-receipts', { method: 'POST', body: JSON.stringify(input) }),
    inspectGoodsReceipt: (id: string, lines: Array<{ goodsReceiptLineId: string; acceptedQuantity: number; rejectedQuantity: number; rejectionReason?: string }>) => client.request<GoodsReceipt>(`/api/pharmacy/goods-receipts/${id}/inspect`, { method: 'POST', body: JSON.stringify({ lines }) }),
    postGoodsReceipt: (id: string) => client.request<GoodsReceipt>(`/api/pharmacy/goods-receipts/${id}/post`, { method: 'POST' }),
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
    requisitions: (siteId: string) => client.request<Requisition[]>(`/api/pharmacy/stock-requisitions?sourceSiteId=${encodeURIComponent(siteId)}`),
    createRequisition: (input: { sourceSiteId: string; requestCode: string; reason?: string; lines: Array<{ stockItemId: string; requestedQuantity: number }> }) => client.request<Requisition>('/api/pharmacy/stock-requisitions', { method: 'POST', body: JSON.stringify(input) }),
    submitRequisition: (id: string) => client.request<Requisition>(`/api/pharmacy/stock-requisitions/${id}/submit`, { method: 'POST' }),
    approveRequisition: (id: string, lines: Array<{ requisitionLineId: string; approvedQuantity: number }>) => client.request<Requisition>(`/api/pharmacy/stock-requisitions/${id}/approve`, { method: 'POST', body: JSON.stringify({ lines }) }),
    pickRequisition: (id: string) => client.request<Requisition>(`/api/pharmacy/stock-requisitions/${id}/pick`, { method: 'POST' }),
    issueRequisition: (id: string) => client.request<Requisition>(`/api/pharmacy/stock-requisitions/${id}/issue`, { method: 'POST' }),
    transfers: (siteId: string, role: 'SOURCE' | 'DESTINATION' = 'SOURCE') => client.request<StockTransfer[]>(`/api/pharmacy/stock-transfers?stockSiteId=${encodeURIComponent(siteId)}&role=${role}`),
    createTransfer: (input: { sourceSiteId: string; destinationSiteId: string; requestCode: string; reason?: string; lines: Array<{ sourceStockItemId: string; destinationStockItemId: string; requestedQuantity: number }> }) => client.request<StockTransfer>('/api/pharmacy/stock-transfers', { method: 'POST', body: JSON.stringify(input) }),
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
    }) => client.request<MedicationDispense>(`/api/pharmacy/dispense-tasks/${taskId}/dispenses`, {
      method: 'POST', body: JSON.stringify(input),
    }),
    trace: (taskId: string) => client.request<DispenseTrace>(
      `/api/pharmacy/dispense-tasks/${taskId}/trace`,
    ),
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
