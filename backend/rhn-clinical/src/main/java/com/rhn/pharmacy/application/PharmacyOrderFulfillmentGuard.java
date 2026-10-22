package com.rhn.pharmacy.application;

import com.rhn.outpatient.api.MedicationRequestDirectory;
import com.rhn.outpatient.api.OrderFulfillmentGuard;
import com.rhn.pharmacy.api.RefundPharmacyDirectory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Blocks cancelling a medication order once the pharmacy has dispensed it; unstarted dispensing is released. */
@Component
class PharmacyOrderFulfillmentGuard implements OrderFulfillmentGuard {
    private final RefundPharmacyDirectoryService pharmacy;
    // 医嘱服务本身依赖各履约守卫，延迟取目录避免构造期循环依赖。
    private final ObjectProvider<MedicationRequestDirectory> requests;

    PharmacyOrderFulfillmentGuard(RefundPharmacyDirectoryService pharmacy,
                                  ObjectProvider<MedicationRequestDirectory> requests) {
        this.pharmacy = pharmacy;
        this.requests = requests;
    }

    /** 与药房接单（lockForPharmacyIntake）锁同一条药品请求行，使撤销/取消签署与接单互斥后再检查。 */
    private void lockAgainstIntake(OrderRef order, boolean forUpdate) {
        if (forUpdate) requests.getObject().lockForPharmacyIntake(order.requestId());
    }

    @Override
    @Transactional(readOnly = true)
    public String cancelBlockedReason(OrderRef order, boolean forUpdate) {
        if (!MEDICATION_REQUEST.equals(order.sourceType())) return null;
        lockAgainstIntake(order, forUpdate);
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
        lockAgainstIntake(order, forUpdate);
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
