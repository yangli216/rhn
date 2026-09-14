package com.rhn.coordination.api;

import com.rhn.billing.api.PaymentResultDirectory.PaymentOrderView;
import com.rhn.billing.api.RefundPreCheckViews.DirectRefundCommand;
import com.rhn.billing.api.RefundPreCheckViews.RefundPreCheckSummaryView;

/** Cross-domain refund process owned by coordination. */
public interface RefundCoordinationDirectory {
    RefundPreCheckSummaryView preCheck(Long encounterId);

    PaymentOrderView directRefund(Long paymentId, DirectRefundCommand command);
}
