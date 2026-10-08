package com.rhn.outpatient.api;

import com.rhn.shared.api.BusinessException;
import org.springframework.http.HttpStatus;

import java.math.BigDecimal;
import java.math.RoundingMode;

/** The billing decision frozen by the order producer, including legitimate non-charge reasons. */
public enum ClinicalOrderBillingDisposition {
    CHARGEABLE, UNPRICED, ZERO_AMOUNT, SELF_PROVIDED, DRAFT;

    public static ClinicalOrderBillingDisposition fromSnapshot(boolean draft, boolean selfProvided,
                                                               BigDecimal unitPrice, BigDecimal totalAmount,
                                                               String currencyCode) {
        boolean unpriced = unitPrice == null && totalAmount == null && currencyCode == null;
        if (!unpriced && (unitPrice == null || totalAmount == null || currencyCode == null
                || currencyCode.isBlank() || unitPrice.signum() < 0 || totalAmount.signum() < 0)) {
            throw new BusinessException("CLINICAL_ORDER_BILLING_UNVERIFIED", "医嘱价格快照不完整或金额无效，不能确认计费结果", HttpStatus.CONFLICT);
        }
        if (draft) return DRAFT;
        if (selfProvided) return SELF_PROVIDED;
        if (unpriced) return UNPRICED;
        return totalAmount.setScale(6, RoundingMode.HALF_UP).signum() == 0 ? ZERO_AMOUNT : CHARGEABLE;
    }
}
