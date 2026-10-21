package com.rhn.outpatient.ordering;

import com.rhn.outpatient.api.OrderFulfillmentGuard;
import com.rhn.outpatient.api.OrderFulfillmentGuard.OrderRef;
import com.rhn.outpatient.api.OrderPaymentDirectory.SettlementLock;
import com.rhn.shared.api.BusinessException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class OrderCancellationPolicyTest {
    private static final OrderRef ORDER = OrderRef.medication(1L, 2L);

    /** 药房已接单：撤销仍允许（未发药），取消签署不允许。 */
    private static final OrderFulfillmentGuard RECEIVED = new OrderFulfillmentGuard() {
        @Override public String cancelBlockedReason(OrderRef order, boolean forUpdate) { return null; }
        @Override public String withdrawBlockedReason(OrderRef order, boolean forUpdate) { return "药房已接收"; }
    };

    @Test
    @DisplayName("修改/取消签署：未签署可改；已签署须未进已付款结算单、执行模块未接收；未付款结算单先取消；已撤销不可改")
    void editBlockedReason() {
        var open = new OrderCancellationPolicy(List.of(), (order, forUpdate) -> SettlementLock.NONE);
        var settled = new OrderCancellationPolicy(List.of(), (order, forUpdate) -> SettlementLock.LOCKED);
        var unpaid = new OrderCancellationPolicy(List.of(), (order, forUpdate) -> SettlementLock.UNPAID);
        var received = new OrderCancellationPolicy(List.of(RECEIVED), (order, forUpdate) -> SettlementLock.NONE);

        assertThat(open.editBlockedReason(false, null)).isNull();
        assertThat(open.editBlockedReason(false, ORDER)).isNull();
        assertThat(open.editBlockedReason(true, null)).isEqualTo("医嘱已撤销");
        assertThat(settled.editBlockedReason(false, ORDER)).isEqualTo(OrderCancellationPolicy.SETTLEMENT_LOCKED);
        assertThat(settled.editBlockedReason(false, null)).isNull();
        assertThat(unpaid.editBlockedReason(false, ORDER)).isNull();
        assertThat(received.editBlockedReason(false, ORDER)).isEqualTo("药房已接收");
        assertThat(received.blockedReason(ORDER)).isNull();

        assertThatThrownBy(() -> settled.requireWithdrawable(ORDER, "BLOCKED"))
                .isInstanceOf(BusinessException.class).hasMessage(OrderCancellationPolicy.SETTLEMENT_LOCKED);
        assertThatThrownBy(() -> unpaid.requireWithdrawable(ORDER, "BLOCKED"))
                .isInstanceOf(BusinessException.class).hasMessage(OrderCancellationPolicy.SETTLEMENT_UNPAID)
                .extracting(error -> ((BusinessException) error).code()).isEqualTo("ORDER_SETTLEMENT_UNPAID");
        assertThatThrownBy(() -> received.requireWithdrawable(ORDER, "BLOCKED"))
                .isInstanceOf(BusinessException.class).hasMessage("药房已接收");
    }
}
