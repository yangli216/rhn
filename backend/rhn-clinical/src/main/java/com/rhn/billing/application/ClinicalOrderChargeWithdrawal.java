package com.rhn.billing.application;

import com.rhn.billing.domain.ChargeItem;
import com.rhn.billing.infrastructure.ChargeItemComponentRepository;
import com.rhn.billing.infrastructure.ChargeItemRepository;
import com.rhn.billing.infrastructure.LedgerEntryRepository;
import com.rhn.billing.infrastructure.SettlementLineRepository;
import com.rhn.platform.eventing.api.DomainEventEnvelope;
import com.rhn.platform.eventing.api.IdempotentDomainEventConsumer;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

import static com.rhn.shared.api.BusinessErrors.conflict;

/**
 * 医生取消签署：从未进过结算单的原收费连同明细和账务流水作废删除，重新签署时按新内容重新记账，
 * 收费明细里不留正负对冲的记录；审计依据保留在医嘱撤回事件中。已进结算单的由医嘱侧拒绝取消签署。
 */
@Service
public class ClinicalOrderChargeWithdrawal {
    private static final String CONSUMER = "billing-clinical-order-withdrawal-v1";
    private static final List<String> EVENTS = List.of("SERVICE_REQUEST_WITHDRAWN", "MEDICATION_REQUEST_WITHDRAWN");
    private final ChargeItemRepository charges;
    private final ChargeItemComponentRepository components;
    private final LedgerEntryRepository ledger;
    private final SettlementLineRepository settlementLines;
    private final IdempotentDomainEventConsumer eventConsumer;

    public ClinicalOrderChargeWithdrawal(ChargeItemRepository charges, ChargeItemComponentRepository components,
                                         LedgerEntryRepository ledger, SettlementLineRepository settlementLines,
                                         IdempotentDomainEventConsumer eventConsumer) {
        this.charges = charges; this.components = components; this.ledger = ledger;
        this.settlementLines = settlementLines; this.eventConsumer = eventConsumer;
    }

    @EventListener
    @Transactional
    public void project(DomainEventEnvelope event) {
        if (!EVENTS.contains(event.eventType())) return;
        eventConsumer.consume(CONSUMER, event, () -> apply(event));
    }

    private void apply(DomainEventEnvelope event) {
        String sourceType = event.eventType().startsWith("SERVICE_REQUEST") ? "SERVICE_REQUEST" : "MEDICATION_REQUEST";
        // 免费或自备药没有原收费，无需处理。
        ChargeItem original = charges.findByTenantIdAndSourceTypeAndSourceId(event.tenantId(), sourceType, event.aggregateId())
                .orElse(null);
        if (original == null) return;
        if (charges.findByTenantIdAndSourceTypeAndSourceId(event.tenantId(), sourceType + "_REVERSAL", event.aggregateId()).isPresent()
                || !settlementLines.findByTenantIdAndChargeItemIdIn(event.tenantId(), List.of(original.id())).isEmpty()) {
            throw conflict("ORDER_SETTLEMENT_LOCKED", "收费已进入结算或已冲销，不能取消签署");
        }
        components.deleteAll(components.findByTenantIdAndChargeItemId(event.tenantId(), original.id()));
        ledger.findByTenantIdAndChargeItemId(event.tenantId(), original.id()).ifPresent(ledger::delete);
        charges.delete(original);
        charges.flush();
    }
}
