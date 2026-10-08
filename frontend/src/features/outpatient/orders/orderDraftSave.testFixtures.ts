import type { OrderDraftSaveInput, OrderDraftSaveReceipt } from '../../../shared/api/encountersApi'

/** Synthetic server receipt used only by tests; production always uses the HTTP response. */
export function orderDraftReceipt(encounterId: string, input: OrderDraftSaveInput): OrderDraftSaveReceipt {
  return { encounterId, commandCode: input.commandCode,
    prescriptions: input.medicationItems.map((item, index) => ({
      id: `rx-${index}`, revision: 0, encounterId, status: 'DRAFT', categoryCode: item.categoryCode,
      medicationRequests: [{ ...item, id: `med-${index}`, revision: 0, encounterId,
        prescriptionId: `rx-${index}`, status: 'DRAFT' }],
    })),
    services: input.serviceItems.map((item, index) => ({ ...item, id: `svc-${index}`, revision: 0, encounterId, status: 'ACTIVE' })),
  } as OrderDraftSaveReceipt
}
