package com.rhn.pharmacy.application;

import com.rhn.outpatient.api.OrderFulfillmentGuard;
import com.rhn.pharmacy.api.RefundPharmacyDirectory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Blocks cancelling a medication order once the pharmacy has dispensed it; unstarted dispensing is released. */
@Component
class PharmacyOrderFulfillmentGuard implements OrderFulfillmentGuard {
    private final RefundPharmacyDirectoryService pharmacy;

    PharmacyOrderFulfillmentGuard(RefundPharmacyDirectoryService pharmacy) {
        this.pharmacy = pharmacy;
    }

    @Override
    @Transactional(readOnly = true)
    public String cancelBlockedReason(OrderRef order, boolean forUpdate) {
        if (!MEDICATION_REQUEST.equals(order.sourceType())) return null;
        RefundPharmacyDirectory.RefundFulfillmentStatus status = pharmacy.statusForRequest(order.tenantId(), order.requestId());
        if (status.dispensed() || "PARTIALLY_RETURNED".equals(status.sourceStatus())) {
            return "药品已发药，不能直接撤销；请先由药房办理退药";
        }
        return null;
    }

    @Override
    @Transactional(readOnly = true)
    public String withdrawBlockedReason(OrderRef order, boolean forUpdate) {
        if (!MEDICATION_REQUEST.equals(order.sourceType())) return null;
        return pharmacy.hasDispenseTask(order.tenantId(), order.requestId())
                ? "药房已接收处方，不能取消签署；如需调整请撤销后重新开立" : null;
    }

    @Override
    @Transactional
    public void releaseUnstarted(OrderRef order) {
        if (MEDICATION_REQUEST.equals(order.sourceType())) {
            pharmacy.cancelUnfulfilledForOrderCancellation(order.tenantId(), order.requestId());
        }
    }
}
