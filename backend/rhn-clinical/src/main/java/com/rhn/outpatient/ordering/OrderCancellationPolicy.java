package com.rhn.outpatient.ordering;

import com.rhn.outpatient.api.OrderFulfillmentGuard;
import com.rhn.outpatient.api.OrderFulfillmentGuard.OrderRef;
import com.rhn.outpatient.api.OrderPaymentDirectory;
import com.rhn.outpatient.api.OrderPaymentDirectory.SettlementLock;
import org.springframework.stereotype.Component;

import java.util.List;

import static com.rhn.shared.api.BusinessErrors.conflict;

/** Decides whether an issued order may still be cancelled, based on what the fulfillment modules have started. */
@Component
class OrderCancellationPolicy {
    static final String SETTLEMENT_LOCKED = "收费处已发起支付或已缴费，不能修改或取消签署；如需调整请撤销后重新开立";
    static final String SETTLEMENT_UNPAID = "该医嘱已生成未付款的结算单，需先取消结算单才能修改或取消签署";
    private final List<OrderFulfillmentGuard> guards;
    private final OrderPaymentDirectory payments;

    OrderCancellationPolicy(List<OrderFulfillmentGuard> guards, OrderPaymentDirectory payments) {
        this.guards = guards;
        this.payments = payments;
    }

    /** Read-only check for display; {@code null} means the order can be cancelled. */
    String blockedReason(OrderRef order) {
        return reason(order, false, false);
    }

    /** Locks fulfillment records and rejects the cancellation when fulfillment has already started. */
    void requireCancellable(OrderRef order, String errorCode) {
        String reason = reason(order, true, false);
        if (reason != null) throw conflict(errorCode, reason);
    }

    /**
     * 不能修改（简单模式）或取消签署（签署模式）的原因：已签署医嘱须未进已付款结算单、执行模块未接收；未签署医嘱可直接修改。
     * 只在未付款结算单中的不算阻断：医生修改时由前端先取消该结算单（{@code ORDER_SETTLEMENT_UNPAID}）。
     *
     * @param issued 已签署医嘱的引用；未签署传 {@code null}
     */
    String editBlockedReason(boolean cancelled, OrderRef issued) {
        if (cancelled) return "医嘱已撤销";
        if (issued == null) return null;
        String reason = reason(issued, false, true);
        if (reason != null) return reason;
        return payments.settlementLock(issued, false) == SettlementLock.LOCKED ? SETTLEMENT_LOCKED : null;
    }

    /** 取消签署前锁定执行与收费记录，已接收、已执行或已进结算单时拒绝；未付款结算单以单独的编码提示先取消结算单。 */
    void requireWithdrawable(OrderRef issued, String errorCode) {
        String reason = reason(issued, true, true);
        if (reason != null) throw conflict(errorCode, reason);
        switch (payments.settlementLock(issued, true)) {
            case LOCKED -> throw conflict("ORDER_SETTLEMENT_LOCKED", SETTLEMENT_LOCKED);
            case UNPAID -> throw conflict("ORDER_SETTLEMENT_UNPAID", SETTLEMENT_UNPAID);
            case NONE -> { }
        }
    }

    void releaseUnstarted(OrderRef order) {
        guards.forEach(guard -> guard.releaseUnstarted(order));
    }

    private String reason(OrderRef order, boolean forUpdate, boolean withdraw) {
        for (OrderFulfillmentGuard guard : guards) {
            String reason = withdraw ? guard.withdrawBlockedReason(order, forUpdate) : guard.cancelBlockedReason(order, forUpdate);
            if (reason != null) return reason;
        }
        return null;
    }
}
