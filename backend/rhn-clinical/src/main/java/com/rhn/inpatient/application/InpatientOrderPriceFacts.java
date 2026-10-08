package com.rhn.inpatient.application;

import com.rhn.inpatient.domain.InpatientCareRequest;

import static com.rhn.shared.api.BusinessErrors.conflict;

/** Pricing comes from the order's saved facts, never from the current catalog or an implied free service. */
final class InpatientOrderPriceFacts {
    private InpatientOrderPriceFacts() {}

    static boolean isUnpricedNursing(InpatientCareRequest request) {
        return "NURSING".equals(request.orderCategory()) && request.catalogItemId() == null
                && request.priceId() == null && request.priceRevision() == null && request.priceType() == null
                && request.unitPrice() == null && request.totalAmount() == null && request.currencyCode() == null;
    }

    static void requirePrice(InpatientCareRequest request) {
        if (request.catalogItemId() == null || request.catalogItemId() <= 0
                || request.priceId() == null || request.priceId() <= 0
                || request.priceRevision() == null || request.priceRevision() < 0
                || !"SALE".equals(request.priceType())
                || request.unitPrice() == null || request.unitPrice().signum() < 0
                || request.totalAmount() == null || request.totalAmount().signum() < 0
                || request.currencyCode() == null || !request.currencyCode().matches("[A-Z]{3}")) {
            throw conflict("INPATIENT_ORDER_PRICE_MISSING", "医嘱 " + request.requestNo() + " 缺少完整有效的历史计价事实，请核对后重试");
        }
        if (!"MEDICATION".equals(request.orderCategory()) && request.unitPrice().compareTo(request.totalAmount()) != 0) {
            throw conflict("INPATIENT_ORDER_PRICE_INCONSISTENT", "医嘱 " + request.requestNo() + " 的单次执行单价与金额不一致，请核对历史计价事实");
        }
    }
}
