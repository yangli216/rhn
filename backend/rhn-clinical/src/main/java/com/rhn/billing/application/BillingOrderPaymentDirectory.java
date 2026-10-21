package com.rhn.billing.application;

import com.rhn.billing.domain.ChargeItem;
import com.rhn.billing.domain.SettlementLine;
import com.rhn.billing.infrastructure.ChargeItemRepository;
import com.rhn.billing.infrastructure.SettlementLineRepository;
import com.rhn.billing.infrastructure.SettlementRepository;
import com.rhn.outpatient.api.OrderFulfillmentGuard.OrderRef;
import com.rhn.outpatient.api.OrderPaymentDirectory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 以原收费记录是否进过结算单判断：未付款、可取消的结算单只需先取消；支付中、已结算都锁定；
 * 进过已冲正结算单的也锁定，因为结算明细仍引用这条收费，不能随取消签署作废。
 */
@Component
class BillingOrderPaymentDirectory implements OrderPaymentDirectory {
    private final ChargeItemRepository charges;
    private final SettlementLineRepository lines;
    private final SettlementRepository settlements;
    private final SettlementCancellationTransactions cancellations;

    BillingOrderPaymentDirectory(ChargeItemRepository charges, SettlementLineRepository lines,
                                 SettlementRepository settlements, SettlementCancellationTransactions cancellations) {
        this.charges = charges; this.lines = lines; this.settlements = settlements; this.cancellations = cancellations;
    }

    @Override
    @Transactional(readOnly = true)
    public SettlementLock settlementLock(OrderRef order, boolean forUpdate) {
        ChargeItem charge = charges.findByTenantIdAndSourceTypeAndSourceId(order.tenantId(), order.sourceType(), order.requestId())
                .orElse(null);
        if (charge == null) return SettlementLock.NONE;
        if (forUpdate) charges.lockByIdAndTenantId(charge.id(), order.tenantId());
        List<Long> settlementIds = lines.findByTenantIdAndChargeItemIdIn(order.tenantId(), List.of(charge.id())).stream()
                .map(SettlementLine::settlementId).distinct().toList();
        if (settlementIds.isEmpty()) return SettlementLock.NONE;
        boolean cancellable = settlementIds.stream().allMatch(id -> settlements.findByIdAndTenantId(id, order.tenantId())
                .map(value -> cancellations.blockedReason(order.tenantId(), value) == null).orElse(false));
        return cancellable ? SettlementLock.UNPAID : SettlementLock.LOCKED;
    }
}
